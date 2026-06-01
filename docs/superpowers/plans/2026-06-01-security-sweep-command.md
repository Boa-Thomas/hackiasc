# `/security-sweep` Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable `/security-sweep` slash command that fans out looping security finders across the whole project, adversarially verifies findings, then generates gated auto-fixes on an isolated branch — with all git mutation and the regression gate kept in the main thread.

**Architecture:** Two saved Workflow scripts (`security-sweep-hunt`, `security-sweep-fix`) plus a command that orchestrates them with a hard-stop human checkpoint between find and fix. Sub-agents only find bugs and write diffs; the command applies them, runs the gate, and dispatches a regression-validator. A fix-eligibility fence keeps SQL/RLS/edge/payment findings report-only.

**Tech Stack:** Claude Code Workflow tool (JS orchestration scripts), Agent tool, Vitest, Node ESM. Target codebase: React 19 + Vite + Supabase.

**Spec:** `docs/superpowers/specs/2026-06-01-security-sweep-command-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/validate-workflow.mjs` | Tested harness: structural + syntax validation of a workflow script (used to verify Tasks 2-3). Exports `validateWorkflowSource(src)` + CLI. |
| `tests/validate-workflow.test.js` | Vitest unit tests for the validator. Placed under `tests/` (already in `vite.config.js` `test.include`) and named `.js` so the existing glob `tests/**/*.test.{js,jsx}` collects it; it imports the `.mjs` validator. |
| `.claude/workflows/security-sweep-hunt.js` | Workflow A: loop-until-dry finders → adversarial verify → confirmed findings (deduped, severity, known/new, fence). |
| `.claude/workflows/security-sweep-fix.js` | Workflow B: partition auto-fixable findings by subsystem → one fixer per partition returns unified diffs (does not apply). |
| `.claude/commands/security-sweep.md` | Orchestration command: recon → Workflow A → checkpoint → Workflow B → apply on branch → gate + repair → regression-validator → report. |
| `CLAUDE.md` | Add `/security-sweep` to the deployment/verification section. |
| `docs/changelog/2026-06-01-security-sweep-command.md` | Changelog record per commit-docs rule. |

Why a validator harness: the workflow scripts use runtime-only globals (`agent`, `parallel`, …) and top-level `await`/`return`, so they can't be `node`-executed or classically unit-tested. The validator parses them as an `AsyncFunction` body (parse-only, no execution), giving a real, tested syntax check.

---

## Task 1: Workflow validator harness (TDD)

**Files:**
- Test: `tests/validate-workflow.test.js`
- Create: `scripts/validate-workflow.mjs`

> **Why this test path:** `vite.config.js` sets `test.include = ['tests/**/*.test.{js,jsx}', 'src/**/*.test.{js,jsx}']`. A test under `scripts/` or with a `.mjs` extension would NOT be collected ("no test files found"). Placing it at `tests/validate-workflow.test.js` matches the existing glob with zero config change.

- [ ] **Step 1: Write the failing test**

Create `tests/validate-workflow.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { validateWorkflowSource } from '../scripts/validate-workflow.mjs'

const GOOD = `export const meta = { name: 'x', description: 'y' }
phase('A')
const r = await agent('hi')
return { r }
`

describe('validateWorkflowSource', () => {
  it('passes a well-formed workflow (top-level await + return + export meta)', () => {
    expect(validateWorkflowSource(GOOD)).toEqual([])
  })

  it('flags a missing meta export', () => {
    expect(validateWorkflowSource(`phase('A')`)).toContain('missing `export const meta`')
  })

  it('flags meta without name/description', () => {
    const errs = validateWorkflowSource(`export const meta = { phases: [] }`)
    expect(errs).toContain('meta missing name')
    expect(errs).toContain('meta missing description')
  })

  it('flags a syntax error in the body', () => {
    const src = `export const meta = { name: 'x', description: 'y' }\nconst =\n`
    expect(validateWorkflowSource(src).some((e) => e.startsWith('syntax error'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/validate-workflow.test.js`
Expected: FAIL — cannot resolve `../scripts/validate-workflow.mjs` (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `scripts/validate-workflow.mjs`:

```js
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

/**
 * Validate a Workflow script's source without executing it.
 * Returns an array of error strings (empty array = valid).
 */
export function validateWorkflowSource(src) {
  const errors = []
  if (!/export\s+const\s+meta\s*=/.test(src)) errors.push('missing `export const meta`')
  if (!/\bname\s*:/.test(src)) errors.push('meta missing name')
  if (!/\bdescription\s*:/.test(src)) errors.push('meta missing description')

  // Parse the body as an AsyncFunction (parse-only, never invoked) so top-level
  // await/return and the runtime globals are legal. Strip the ESM export keyword.
  const body = src.replace(/export\s+const\s+meta\s*=/, 'const meta =')
  try {
    // eslint-disable-next-line no-new
    new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', 'workflow', body)
  } catch (e) {
    errors.push('syntax error: ' + e.message)
  }
  return errors
}

// CLI: node scripts/validate-workflow.mjs <file.js> [<file.js> ...]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = process.argv.slice(2)
  if (files.length === 0) {
    console.error('usage: node scripts/validate-workflow.mjs <file.js> [...]')
    process.exit(2)
  }
  let failed = false
  for (const f of files) {
    const errs = validateWorkflowSource(readFileSync(f, 'utf8'))
    if (errs.length) {
      failed = true
      console.error('FAIL ' + f + '\n - ' + errs.join('\n - '))
    } else {
      console.log('OK ' + f)
    }
  }
  process.exit(failed ? 1 : 0)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/validate-workflow.test.js`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-workflow.mjs tests/validate-workflow.test.js
git commit -m "feat(scripts): tested workflow-source validator"
```

---

## Task 2: Workflow A — `security-sweep-hunt.js`

**Files:**
- Create: `.claude/workflows/security-sweep-hunt.js`

- [ ] **Step 1: Write the workflow script**

Create `.claude/workflows/security-sweep-hunt.js` with the full content below:

```js
export const meta = {
  name: 'security-sweep-hunt',
  description: 'Loop-until-dry security finder fan-out + adversarial verification; returns confirmed, deduped, severity-scored findings classified by the fix-eligibility fence',
  phases: [
    { title: 'Hunt', detail: 'parallel finders per subsystem, repeated until 2 dry rounds' },
    { title: 'Verify', detail: 'adversarial skeptic panel (3 lenses) per candidate' },
  ],
}

// ---- config (overridable via args) ----
const cfg = {
  dryRounds: (args && args.dryRounds) || 2,
  maxRounds: (args && args.maxRounds) || 6,
  panelSize: (args && args.panelSize) || 3,
}
const knownBugs = (args && args.audit_known) || []
const head = (args && args.head) || 'HEAD'

// Subsystems define finder lenses. `fence` is the default eligibility for findings here.
const SUBSYSTEMS = [
  { key: 'sql', label: 'Supabase SQL & migrations', globs: 'supabase-setup.sql, migrations/**/*.sql' },
  { key: 'edge', label: 'Edge functions', globs: 'supabase/functions/**/*.ts' },
  { key: 'admin', label: 'Admin frontend', globs: 'src/admin/**' },
  { key: 'roles', label: 'Role frontends', globs: 'src/juror/**, src/mentor/**, src/participant/**, src/wall/**, src/sugar/**, src/facilitator/**, src/teams/**' },
  { key: 'lib', label: 'Shared lib, hooks, components', globs: 'src/lib/**, src/hooks/**, src/components/**' },
  { key: 'ops', label: 'Secrets, CI, build, service worker, deps', globs: '.github/**, package.json, vite.config.js, public/sw.js, scripts/**' },
]

const CLASSES = [
  'broken authorization / RLS bypass / role-exclusion gaps',
  'SQL or command injection / unsafe dynamic queries',
  'PII or secret leakage (CPF, phone, tokens, service-role keys)',
  'idempotency / race conditions / non-atomic multi-write',
  'auth-session handling (token storage, missing onAuthStateChange, logout on transient error)',
  'SECURITY DEFINER without SET search_path / privilege escalation',
  'vulnerable or misconfigured dependencies (CVE)',
]

const LENSES = [
  'correctness — is the described code path actually reachable and genuinely wrong?',
  'exploitability — could a real attacker trigger this given the RLS/auth model?',
  'false-positive — argue the strongest case that this is NOT a bug',
]

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'file', 'line', 'class', 'severity', 'status', 'evidence', 'exploit_sketch'],
        properties: {
          title: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'integer' },
          class: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          status: { type: 'string', enum: ['known', 'new'] },
          evidence: { type: 'string' },
          exploit_sketch: { type: 'string' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['real', 'reason'],
  properties: {
    real: { type: 'boolean' },
    reason: { type: 'string' },
    severity_adjust: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'unchanged'] },
  },
}

function fenceFor(file) {
  const f = String(file).toLowerCase().replace(/\\/g, '/')
  if (f.endsWith('.sql') || f.includes('migrations/') || f.includes('supabase/functions/') || f.includes('supabase-setup')) {
    return 'report'
  }
  return 'auto'
}

function finderPrompt(s, seenList) {
  return [
    'You are a security auditor for HackIA SC, a React 19 + Vite + Supabase event-management app with real production data (CPF, payments).',
    `Audit ONLY these paths: ${s.globs}.`,
    'Hunt for every applicable vulnerability class:',
    CLASSES.map((c, i) => `  ${i + 1}. ${c}`).join('\n'),
    'For each real issue return: title, exact file, line, class (copy one of the labels above), severity, status, concrete evidence (quote the code), and a short exploit_sketch.',
    'Set status="known" if the issue semantically matches one in the KNOWN-BUGS list, otherwise status="new".',
    knownBugs.length ? `KNOWN-BUGS (already catalogued in prior audits):\n${knownBugs.map((k) => `- ${k}`).join('\n')}` : 'KNOWN-BUGS: none provided.',
    seenList.length ? `ALREADY-REPORTED this run — do NOT repeat any of these:\n${seenList.map((k) => `- ${k}`).join('\n')}` : '',
    'Be precise and conservative: only report issues you can substantiate by reading the actual code. If you find nothing new, return {"findings": []}.',
  ].filter(Boolean).join('\n\n')
}

function skepticPrompt(f, i) {
  const lens = LENSES[i % LENSES.length]
  return [
    `Adversarially verify this security finding by reading the actual code. Apply this lens: ${lens}`,
    `Title: ${f.title}`,
    `Location: ${f.file}:${f.line}`,
    `Class: ${f.class}`,
    `Claimed severity: ${f.severity}`,
    `Evidence: ${f.evidence}`,
    `Exploit sketch: ${f.exploit_sketch}`,
    'Default to real=false if you are not convinced after reading the code. Return real (bool), reason, and severity_adjust.',
  ].join('\n\n')
}

// ---- Hunt: loop-until-dry ----
phase('Hunt')
const seen = new Set()
const fresh = []
let dry = 0
let round = 0
while (dry < cfg.dryRounds && round < cfg.maxRounds) {
  round++
  log(`Hunt round ${round} (dry streak ${dry}/${cfg.dryRounds}, total ${fresh.length})`)
  const seenList = [...seen]
  const batches = await parallel(
    SUBSYSTEMS.map((s) => () =>
      agent(finderPrompt(s, seenList), {
        label: `hunt:${s.key}:r${round}`,
        phase: 'Hunt',
        schema: FINDINGS_SCHEMA,
        agentType: 'security-auditor',
      })
    )
  )
  const newOnes = batches
    .filter(Boolean)
    .flatMap((b) => b.findings || [])
    .filter((f) => {
      const k = `${f.file}:${f.line}:${f.class}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  if (newOnes.length === 0) dry++
  else {
    dry = 0
    fresh.push(...newOnes)
  }
  log(`round ${round}: +${newOnes.length} new`)
}

// ---- Verify: adversarial panel ----
phase('Verify')
const verified = await parallel(
  fresh.map((f) => () =>
    parallel(
      Array.from({ length: cfg.panelSize }, (_, i) => () =>
        agent(skepticPrompt(f, i), { label: `verify:${f.file}:${i}`, phase: 'Verify', schema: VERDICT_SCHEMA })
      )
    ).then((votes) => {
      const good = votes.filter(Boolean)
      const realVotes = good.filter((v) => v.real).length
      // Fixed denominator (panelSize): an errored panelist must NOT raise the bar for the rest.
      const confirmedReal = realVotes > cfg.panelSize / 2
      // Fail-open for security: if the panel was degraded (some/all panelists errored) and we
      // cannot clearly clear the finding, keep it but mark it unverified for human review —
      // never silently drop a possible real bug because the verifiers crashed.
      const degraded = good.length < cfg.panelSize
      const keep = confirmedReal || (degraded && (realVotes > 0 || good.length === 0))
      // Apply the panel's severity reassessment: if a majority of the panel agree on the same
      // adjusted severity (anything but 'unchanged'), use it; otherwise keep the finder's value.
      const tally = {}
      for (const v of good) {
        const s = v.severity_adjust
        if (s && s !== 'unchanged') tally[s] = (tally[s] || 0) + 1
      }
      let severity = f.severity
      for (const [s, n] of Object.entries(tally)) {
        if (n > cfg.panelSize / 2) severity = s
      }
      return { f, keep, unverified: keep && !confirmedReal, severity, votes: good }
    })
  )
)

const confirmed = []
for (const v of verified.filter(Boolean)) {
  if (v.keep) confirmed.push({ ...v.f, severity: v.severity, fence: fenceFor(v.f.file), unverified: v.unverified })
}

log(`Confirmed ${confirmed.length}/${fresh.length} candidates across ${round} rounds`)
return { head, rounds: round, total_candidates: fresh.length, findings: confirmed }
```

- [ ] **Step 2: Validate the script**

Run: `node scripts/validate-workflow.mjs .claude/workflows/security-sweep-hunt.js`
Expected: `OK .claude/workflows/security-sweep-hunt.js`

- [ ] **Step 3: Commit**

```bash
git add .claude/workflows/security-sweep-hunt.js
git commit -m "feat(workflow): security-sweep-hunt (loop-until-dry find + adversarial verify)"
```

---

## Task 3: Workflow B — `security-sweep-fix.js`

**Files:**
- Create: `.claude/workflows/security-sweep-fix.js`

- [ ] **Step 1: Write the workflow script**

Create `.claude/workflows/security-sweep-fix.js` with the full content below:

```js
export const meta = {
  name: 'security-sweep-fix',
  description: 'Fan-out fixers (one per non-overlapping subsystem partition) that return unified diffs for auto-fixable security findings; never applies changes or touches git',
  phases: [{ title: 'Fix', detail: 'one fixer per subsystem partition' }],
}

const findings = (args && args.findings) || []

const PATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['patches'],
  properties: {
    patches: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'diff', 'rationale', 'bug_refs'],
        properties: {
          file: { type: 'string' },
          diff: { type: 'string' },
          rationale: { type: 'string' },
          bug_refs: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

// Partition by top-level subsystem dir so two fixers never touch the same file.
function partitionOf(file) {
  const f = String(file).replace(/\\/g, '/')
  const m = f.match(/^src\/([^/]+)\//)
  if (m) return `src/${m[1]}`
  return f.split('/')[0] || 'root'
}

function fixerPrompt(part, items) {
  return [
    `You are fixing CONFIRMED security bugs in a React 19 + Vite + Supabase app, ONLY within the partition: ${part}.`,
    'Produce a MINIMAL, behavior-preserving fix for each bug as a unified diff that applies cleanly with `git apply` from the repo root.',
    `Hard rules: do NOT change unrelated code; do NOT touch any file outside ${part}; preserve all existing functionality and public behavior.`,
    'Read each file before writing its diff so the context lines and line numbers are exact.',
    'Bugs to fix:',
    items
      .map(
        (f, i) =>
          `  [${i + 1}] ${f.title}\n      ${f.file}:${f.line} (${f.class}, ${f.severity})\n      evidence: ${f.evidence}`
      )
      .join('\n'),
    'Return one patch object per file you changed: { file, diff (unified, git-apply-able), rationale, bug_refs (the bug titles it addresses) }.',
    'If a bug cannot be fixed safely without touching code outside this partition, omit it (do not force an unsafe fix).',
  ].join('\n\n')
}

if (findings.length === 0) {
  log('No findings passed in — nothing to fix.')
  return { patches: [], partitions: [] }
}

const groups = {}
for (const f of findings) {
  const p = partitionOf(f.file)
  ;(groups[p] = groups[p] || []).push(f)
}
const partitions = Object.entries(groups)
log(`Fixing ${findings.length} findings across ${partitions.length} partitions`)

phase('Fix')
const results = await parallel(
  partitions.map(([part, items]) => () =>
    agent(fixerPrompt(part, items), { label: `fix:${part}`, phase: 'Fix', schema: PATCH_SCHEMA })
  )
)

const patches = results.filter(Boolean).flatMap((r) => r.patches || [])
return { patches, partitions: partitions.map(([p, items]) => ({ partition: p, count: items.length })) }
```

- [ ] **Step 2: Validate the script**

Run: `node scripts/validate-workflow.mjs .claude/workflows/security-sweep-fix.js`
Expected: `OK .claude/workflows/security-sweep-fix.js`

- [ ] **Step 3: Commit**

```bash
git add .claude/workflows/security-sweep-fix.js
git commit -m "feat(workflow): security-sweep-fix (partitioned diff-only fixers)"
```

---

## Task 4: The `/security-sweep` command

**Files:**
- Create: `.claude/commands/security-sweep.md`

- [ ] **Step 1: Write the command**

Create `.claude/commands/security-sweep.md` with the full content below:

````markdown
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
````

- [ ] **Step 2: Verify the command structure**

Run (the `--input-type=commonjs` flag is required because `package.json` has `"type": "module"`, which would otherwise make `require` undefined in `-e`):

`node --input-type=commonjs -e "const s=require('fs').readFileSync('.claude/commands/security-sweep.md','utf8'); for (const k of ['security-sweep-hunt','security-sweep-fix','--dry-run','AskUserQuestion','regression-validator','fix/security-sweep']) if(!s.includes(k)){console.error('MISSING: '+k);process.exit(1)}; if(!/^---[\s\S]*description:/.test(s)){console.error('MISSING frontmatter');process.exit(1)}; console.log('OK command structure')"`

Expected: `OK command structure`

- [ ] **Step 3: Commit**

```bash
git add .claude/commands/security-sweep.md
git commit -m "feat(command): /security-sweep orchestration (hunt -> checkpoint -> gated fix)"
```

---

## Task 5: Register the command and write the changelog

**Files:**
- Modify: `CLAUDE.md` (Deployment / verification section)
- Create: `docs/changelog/2026-06-01-security-sweep-command.md`

- [ ] **Step 1: Add the command to CLAUDE.md**

In `CLAUDE.md`, find the `### Pre-deploy verification (REQUIRED)` section and add this paragraph immediately after the `/pre-deploy-verify` description (after the line that begins "Before any deploy ... run the verification agent suite"):

```markdown
For a deeper, looping audit beyond the branch diff, use **`/security-sweep`** (`.claude/commands/security-sweep.md`): it fans out finders across the whole project until coverage is dry, adversarially verifies findings, then generates gated auto-fixes on an isolated `fix/security-sweep-*` branch (JS/JSX only — SQL/RLS/edge/payment findings are report-only). It is heavier than `/pre-deploy-verify`; reach for it for periodic hardening, not every push. Pass `--dry-run` to find + report without changing code.
```

- [ ] **Step 2: Verify the edit landed**

Run: `node --input-type=commonjs -e "process.exit(require('fs').readFileSync('CLAUDE.md','utf8').includes('/security-sweep')?0:1)"`
Expected: exit code 0 (no output).

- [ ] **Step 3: Write the changelog**

Create `docs/changelog/2026-06-01-security-sweep-command.md`:

```markdown
# feat: /security-sweep multi-agent security audit + gated auto-fix command

**Data:** 2026-06-01
**Branch:** (feature branch)
**Arquivos alterados:** scripts/validate-workflow.mjs, tests/validate-workflow.test.js, .claude/workflows/security-sweep-hunt.js, .claude/workflows/security-sweep-fix.js, .claude/commands/security-sweep.md, CLAUDE.md

## O que foi feito
Comando reutilizável `/security-sweep` que orquestra dois workflows: (A) caça
loop-until-dry de bugs de segurança em todo o projeto + verificação adversarial;
(B) geração de fixes (diffs) só para achados auto-fixable. A thread principal aplica
numa branch isolada, roda o gate (vitest+build) com loop de reparo, e dispara um
agente regression-validator. Inclui um harness validador de workflows testado.

## Por que
A suíte `/pre-deploy-verify` é read-only e limitada ao diff da branch. Faltava uma
auditoria ampla e periódica que também propusesse/aplicasse correções com segurança.

## Decisões técnicas
- Toda mutação de git + gate na thread principal (não em workflow) — consolidação de
  worktrees é frágil/indocumentada.
- Cerca de elegibilidade: SQL/RLS/SECURITY DEFINER/edge/pagamento são report-only
  (o gate não os exercita); só JS/JSX é auto-fixado.
- Checkpoint humano duro entre achar e corrigir (prod com dados reais).
- Loop-until-dry (2 rodadas secas) em vez de cronômetro de 15s.

## Impacto
- Novos artefatos de automação; nenhum código de runtime do app alterado.
- Nenhuma dependência adicionada.

## Próximos passos
- Rodar `/security-sweep --dry-run` uma vez para smoke-test do pipeline.
```

- [ ] **Step 4: Run the full validator + test suite as a final check**

Run: `node scripts/validate-workflow.mjs .claude/workflows/security-sweep-hunt.js .claude/workflows/security-sweep-fix.js && npx vitest run tests/validate-workflow.test.js`
Expected: two `OK` lines, then 4 passing tests.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/changelog/2026-06-01-security-sweep-command.md
git commit -m "docs: register /security-sweep command + changelog"
```

---

## Self-Review

**Spec coverage:**
- Two sequential workflows + checkpoint → Tasks 2, 3, 4. ✓
- All git mutation + gate in main thread → Task 4 §6. ✓
- Fix-eligibility fence (auto vs report-only) → `fenceFor` (Task 2), enforced in Task 4 §5. ✓
- Loop-until-dry with dedup → Task 2 Hunt loop. ✓
- Adversarial verify, diverse lenses → Task 2 Verify. ✓
- known/new tagging vs audit changelog → `audit_known` arg + `status` field (Tasks 2, 4 §1). ✓
- Partition by subsystem, diff-only fixers → Task 3. ✓
- Apply + gate + repair loop + regression-validator → Task 4 §6. ✓
- `--dry-run` mode → Task 4 §3. ✓
- Honest gate-coverage statement in report → Task 4 §7. ✓
- Never push/merge; reviewable branch → Task 4 §7. ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete; `<sha>`/`<array>`/`<auto-fixable subset>` are runtime values the command computes, described in prose. ✓

**Type consistency:** `FINDINGS_SCHEMA`→`findings[]`; Workflow A returns `findings` consumed by command §2/§5 and passed as `args.findings` to Workflow B (Task 3 reads `args.findings`). `fence` values `'auto'|'report'` consistent between `fenceFor` and command §5. `PATCH_SCHEMA` fields `{file,diff,rationale,bug_refs}` match command §6 apply step. `validateWorkflowSource` name identical in Tasks 1-3. ✓
