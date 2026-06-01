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
