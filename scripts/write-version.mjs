import { writeFileSync } from 'node:fs'
import { getBuildId } from './build-id.mjs'

// Roda DEPOIS do `vite build`: grava dist/version.json com o mesmo build id
// embutido no bundle, pra o app comparar e detectar deploy novo.
writeFileSync('dist/version.json', JSON.stringify({ buildId: getBuildId() }) + '\n')
console.log('version.json gerado:', getBuildId())
