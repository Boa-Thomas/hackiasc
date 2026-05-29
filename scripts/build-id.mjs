import { execSync } from 'node:child_process'

// ID de build: SHA do commit (CI) ou git HEAD local; 'dev' se git indisponivel.
// Fonte unica usada no define do Vite (__BUILD_ID__) E no version.json, pra
// nao gerar "falsa" nova versao.
export function getBuildId() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'dev'
  }
}
