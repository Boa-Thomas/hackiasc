# Design: `/security-sweep` — looping multi-agent security audit + gated auto-fix

**Date:** 2026-06-01
**Status:** Approved (design phase)
**Author:** brainstorming session

## Problem

The repo already has `/pre-deploy-verify` — a read-only review suite over the branch
diff vs `origin/master`. The user wants something more aggressive and reusable: a
command that fans out many sub-agents across **every** area of the project to hunt
security bugs, keeps relaunching them **until coverage is sufficient**, then validates
findings, then fans out fixer agents to repair confirmed bugs, with a final agent
validating that **nothing breaks and no functionality is lost**.

Context that shapes the design:
- The event ran **29-31 May 2026**; today is **2026-06-01** (one day post-event).
  Production DB (`qshrzfahotmjshtjuvno`) still holds real data (CPF, payments).
- Prior audit history exists: `docs/changelog/2026-05-22-auditoria-multiagente-issues-alta.md`
  catalogs ~40 confirmed security bugs and, crucially, a list of items **excluded from
  auto-fix** because they touch SQL/SECURITY DEFINER, payment flow, or migration
  structure (#57, #33, #145, …). That exclusion list is the template for the fix fence.
- Project memory: Supabase migrations/edge functions are **manual-apply** to prod, never
  auto-applied.

## Decisions (locked)

1. **Deliverable:** reusable slash command + saved workflow scripts. *Not executed now* —
   only built.
2. **Fix mode:** apply fixes on an isolated branch + regression gate. Nothing reaches
   `master` without passing; user reviews/merges.
3. **Loop semantics:** loop-until-dry (rounds repeat until N consecutive rounds find
   nothing new), **not** a wall-clock timer.
4. **Checkpoint:** hard stop between verify and fix — user confirms what will be touched
   before any code changes.

## Architecture

Two sequential workflows with a human checkpoint between them. **All git mutation and the
regression gate run in the main thread** (deterministic, reliable) — sub-agents only
*find* bugs and *write diffs*; the command applies them.

```
/security-sweep (command, main thread)
  │
  ├─ Recon (inline): read audit changelog → tag known bugs; map areas; capture git HEAD
  │
  ├─ Workflow A  security-sweep-hunt.js
  │     Hunt (loop-until-dry): parallel finders, diverse lenses
  │     Verify (adversarial): skeptic panel per candidate → real/false
  │     → returns confirmed findings: deduped, severity, já-corrigido|novo, fence class
  │
  ├─ CHECKPOINT (hard stop): present findings + fence; user confirms scope
  │
  ├─ Workflow B  security-sweep-fix.js   (eligible/auto-fixable findings only)
  │     Fan-out fixers, one per subsystem partition (non-overlapping files)
  │     → returns patch set: [{ file, diff, rationale, bug_refs }]   (does NOT apply)
  │
  └─ Apply + Gate + Validate (main thread)
        create fix/security-sweep-<date>; apply diffs per partition
        run `npx vitest run` + `npm run build`; repair loop on failure
        dispatch regression-validator agent (no feature lost, contracts/RLS intact)
        write report to docs/changelog/; STOP before push — user reviews
```

### Component 1 — `.claude/commands/security-sweep.md`
The slash command the user types. Pure orchestration instructions for the main thread.
Explicitly instructs Claude to call the `Workflow` tool (this is the required opt-in for
multi-agent orchestration). Responsibilities: recon, run Workflow A, present + apply the
fence, run the hard-stop checkpoint, run Workflow B on eligible findings, apply diffs,
run the gate + repair loop, dispatch the regression-validator, write the report, stop.
Supports a `--dry-run` argument that runs only recon + Workflow A and writes the report,
skipping the checkpoint, Workflow B, and any branch/file mutation.

### Component 2 — `.claude/workflows/security-sweep-hunt.js` (Workflow A)
- `meta` with phases `Hunt`, `Verify`.
- **Hunt (loop-until-dry):** rounds of parallel finder agents. Lenses are the cross
  product of *subsystem* × *vulnerability class*:
  - Subsystems: SQL/migrations, edge functions, admin FE, juror/mentor/participant/wall
    FE, `src/lib`, secrets/CI/build, dependencies.
  - Classes: authz/RLS, injection, PII/secret leak, idempotency/race, auth-session,
    SECURITY DEFINER/`search_path`, dependency CVE.
  - Dedup against a `seen` set keyed by `file + line + class`. Stop after **2 consecutive
    rounds** with no new finding (configurable). Cross-reference the audit changelog to
    pre-tag `já-corrigido | novo`.
- **Verify (adversarial):** each fresh candidate gets a small skeptic panel with distinct
  lenses (correctness / exploitability / false-positive); keep if majority say real.
- **Returns** structured: `{ findings: [{ id, title, file, line, class, severity,
  status: known|new, fence: auto|report, evidence, exploit_sketch }] }`.

### Component 3 — `.claude/workflows/security-sweep-fix.js` (Workflow B)
- `meta` with phase `Fix`. Receives eligible findings via `args`.
- Partitions findings by subsystem into non-overlapping file sets (plain JS `groupBy`) so
  partitions never touch the same file → conflict-free application.
- One fixer agent per partition: reads the repo, writes a **structured diff** for every
  bug in its partition. **Does not apply, does not touch git.**
- **Returns** `{ patches: [{ partition, file, diff, rationale, bug_refs }] }`.

### The fix-eligibility fence
The gate (`vitest + build`) cannot exercise SQL/RLS/SECURITY DEFINER functions or edge
functions, so auto-fixing them would pass green yet still break prod on apply. Classify
every confirmed finding:

| Class | Scope | Action |
|---|---|---|
| **auto-fixable** | JS/JSX logic, frontend role/access checks, input validation, client-side PII leaks | fixer diff → applied on branch → gate validates |
| **report-only** | anything touching SQL/RLS/SECURITY DEFINER, edge functions, payment flow, migration structure | proposed diff in report; human applies manually vs prod |

The report states gate coverage honestly: "vitest+build validates JS; SQL/edge fixes are
report-only and require manual review against prod."

## Data flow / contracts

- Recon → Workflow A args: `{ audit_known: [...], areas: [...], head: "<sha>" }`.
- Workflow A → main thread: confirmed findings (schema above).
- Main thread → Workflow B args: `{ findings: <auto-fixable subset> }`.
- Workflow B → main thread: patch set.
- Main thread → report doc + fix branch.

## Error handling

- Finder/verifier agent failure → resolves to `null`, filtered out; round continues.
- Diff fails to apply or breaks the gate → targeted repair loop on that partition; if it
  still fails, downgrade the finding to report-only and continue (never leave the branch
  red).
- Zero confirmed findings → command exits cleanly: "nothing to fix."
- Never push/merge automatically — terminal state is a reviewable branch + report.

## Testing

- Workflow scripts are JS with no unit tests of their own (orchestration), but the
  command must be dry-runnable: a `--dry-run`/report-only mode that runs Hunt+Verify and
  writes the report **without** Workflow B or any branch creation. This is how we validate
  the command works without mutating the repo.
- The regression gate (`vitest run` + `build`) is the test for applied fixes.

## Out of scope (YAGNI)

- Worktree-isolated fixer agents that commit their own branches (consolidation is
  undocumented/fragile; rejected in favor of main-thread application of returned diffs).
- Auto-applying SQL migrations or edge functions to prod.
- Auto-pushing or auto-merging to `master`.
- Wall-clock 15s relaunch timer.

## Open questions

None blocking. Checkpoint defaults to a hard stop; a continuous mode can be added later
via a command flag if desired.
