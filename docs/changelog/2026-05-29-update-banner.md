# feat: banner de "nova versão disponível" (evita hard reload)

**Data:** 2026-05-29

## Problema
SPA no GitHub Pages: o navegador cacheia o `index.html`, então abas já abertas
seguiam apontando pros assets antigos até um hard reload manual.

## Solução
- `scripts/build-id.mjs`: id de build = `GITHUB_SHA` (CI) ou git HEAD local.
- `vite.config.js`: `define: { __BUILD_ID__ }` embute o id no bundle.
- `scripts/write-version.mjs` (pós-build no `npm run build`): grava
  `dist/version.json` com o mesmo id.
- `src/hooks/useVersionCheck.js`: a cada 3 min busca `version.json`
  (`cache: no-store`) e compara com o `__BUILD_ID__` do bundle.
- `src/components/UpdateBanner.jsx`: banner não-intrusivo + botão "Recarregar",
  montado global no `main.jsx`.

## Comportamento
Após um deploy, abas abertas mostram o banner em até ~3 min. Falha de rede /
dev = silencioso; sem auto-reload (não interrompe quem está no meio de algo).
