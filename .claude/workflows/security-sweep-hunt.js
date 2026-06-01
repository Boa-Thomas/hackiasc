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
      return { f, keep, unverified: keep && !confirmedReal, votes: good }
    })
  )
)

const confirmed = []
for (const v of verified.filter(Boolean)) {
  if (v.keep) confirmed.push({ ...v.f, fence: fenceFor(v.f.file), unverified: v.unverified })
}

log(`Confirmed ${confirmed.length}/${fresh.length} candidates across ${round} rounds`)
return { head, rounds: round, total_candidates: fresh.length, findings: confirmed }
