---
description: Multi-agent looping security sweep — hunts bugs across the whole project (loop-until-dry), adversarially verifies them, then generates gated auto-fixes on an isolated branch with a regression validator. Pass --dry-run to only find + report.
---

# Security sweep

You are running a full-project security audit with gated auto-fix. This command **explicitly opts into multi-agent orchestration: you WILL call the `Workflow` tool.** Production has real data (CPF, payments) — never push, never merge, never auto-apply SQL/edge to prod.

Argument: if the invocation includes `--dry-run`, do recon + Workflow A + write the report only — skip the checkpoint, Workflow B, branch creation, and all patch/fix file mutation (the report file in §7 is still written).

## 1. Recon (main thread, inline)

1. Capture the current commit: `git rev-parse HEAD`.
2. Build the known-bugs list: read `docs/changelog/2026-05-22-auditoria-multiagente-issues-alta.md` and any other `docs/changelog/*auditoria*`/`*security*` files. Extract the bug bullet lines (the `#NN ...` descriptions, both "Confirmados" and "EXCLUÍDOS") into a string array — this becomes `audit_known` so finders tag matches as `known` instead of rediscovering them.
3. Sanity-check the audited areas still exist (e.g. `src/admin`, `src/juror`, `supabase/functions`, `migrations`). If the tree moved, adjust expectations but proceed.

## 2. Workflow A — hunt + verify

Call the `Workflow` tool:

```
Workflow({ name: 'security-sweep-hunt', args: { audit_known: <array>, head: '<sha>' } })
```

> **Resolution fallback:** if `Workflow({ name: 'security-sweep-hunt', ... })` errors with an unknown-workflow error (project-scoped name resolution from `.claude/workflows/` not available), retry the same call with `{ scriptPath: '.claude/workflows/security-sweep-hunt.js', args: {...} }`. Same for Workflow B in §5 (`scriptPath: '.claude/workflows/security-sweep-fix.js'`).

It loops finders until dry, then adversarially verifies. It returns:
`{ head, rounds, total_candidates, findings: [{ title, file, line, class, severity, status, evidence, exploit_sketch, fence, unverified }] }`.
(`unverified: true` means the verification panel was degraded/crashed and the finding was kept fail-open for human review — treat it like report-only, never auto-fix it.)

When it returns, present a summary grouped by **severity** and **fence** (auto vs report-only), marking each as `known` or `new`, and flag any `unverified` findings separately. Lead with new criticals/highs.

## 3. Dry-run exit

If `--dry-run` was passed: write the report (section 7) and STOP here. Do not create a branch.

## 4. Checkpoint (HARD STOP)

Use `AskUserQuestion` to confirm scope before touching code. Show the count of auto-fixable findings and ask which to fix (default: all auto-fixable; report-only findings are never auto-fixed). Wait for the answer.

## 5. Workflow B — generate fixes (eligible only)

Filter the confirmed findings to `fence === 'auto' && !unverified` ∩ the user's selection (unverified findings are never auto-fixed — they go to the report for human review). If empty, skip to section 7. Otherwise call:

```
Workflow({ name: 'security-sweep-fix', args: { findings: <auto-fixable subset> } })
```

It returns `{ patches: [{ file, diff, rationale, bug_refs }], partitions }`. The fixers do NOT apply anything.

## 6. Apply + gate + validate (main thread)

1. Create the branch: `git switch -c fix/security-sweep-$(date +%Y%m%d)` (if it exists, append `-2`, `-3`, …). **Run all `git` and `$(date …)` commands here and in §7 via the Bash tool** — they use POSIX `date +%F` / `+%Y%m%d` syntax. Do NOT run them via the PowerShell tool, where `date` is a `Get-Date` alias and those format flags break; the PowerShell equivalents are `(Get-Date -Format 'yyyyMMdd')` and `(Get-Date -Format 'yyyy-MM-dd')`.
2. **Reconcile coverage by finding, not by file:** cross-check each auto-fixable finding sent to Workflow B against the union of `patches[*].bug_refs` across all returned patches. Any finding whose title appears in NO patch's `bug_refs` (the fixer crashed, abstained, or fixed only some bugs in a shared file) must NOT vanish — add it to the report-only / needs-review list with a "no safe auto-fix produced" note. (Keying by file would mask a second unfixed bug in a file that got one patch.) A security finding never silently disappears.
3. For each patch: write the diff to a temp file and `git apply --3way <tmp>`. If it fails to apply, dispatch one `Agent` (general-purpose) to re-implement that single file's fix by editing the file directly (give it the bug + rationale), then continue.
4. Run the regression gate: `npx vitest run` then `npm run build`.
   - On failure: dispatch a `debugger` Agent with the gate output and `git diff master...HEAD` to localize and fix the breakage (the gate runs after all patches are applied, so the failure isn't pre-attributed to one partition — let the debugger localize from the diff), then re-run the gate. If it still fails after one repair pass, revert the offending patch(es) (`git checkout -- <files>`) and move those findings to the report-only list with a note.
5. Dispatch a **regression-validator** Agent (use `architect-reviewer`): given the diff `git diff master...HEAD`, confirm no functionality was lost, no RLS/role-exclusion weakened, and frontend↔backend contracts (RPC names/params, event keys, role exclusions like juror) are intact. Capture its verdict.

## 7. Report + stop

Write `docs/changelog/$(date +%F)-security-sweep.md` containing:
- Summary: rounds, candidates, confirmed (new vs known), auto-fixed vs report-only.
- Auto-fixed: each finding + file + the fix branch name + gate result + regression-validator verdict.
- Report-only: each finding + the proposed diff (so a human can apply it manually against prod).
- Unverified (panel degraded/crashed): list separately so a human reviews them — these were kept fail-open and were NOT auto-fixed.
- **Gate-coverage honesty statement:** "vitest + build validates JS/JSX only; SQL, RLS, SECURITY DEFINER and edge-function fixes are report-only and require manual review and application against production."
- Residual risks / follow-ups.

Then STOP. Print a final summary and tell the user the fix branch is ready for review — do NOT push or merge. If `npx vitest run`/`npm run build` was not green, say so explicitly.
