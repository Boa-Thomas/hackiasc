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
