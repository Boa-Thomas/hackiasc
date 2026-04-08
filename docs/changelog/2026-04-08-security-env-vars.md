# fix(security): move sensitive config values to env vars

**Data:** 2026-04-08
**Commit:** 6764a01
**Branch:** fix/security-audit
**Arquivos alterados:** `src/lib/config.js`, `.env.example`, `.github/workflows/deploy.yml`

## O que foi feito

Movidos três valores sensíveis que estavam hardcoded em `config.js` para variáveis de ambiente `VITE_*`:
- `earlyAccessCode` → `VITE_EARLY_ACCESS_CODE`
- `pixKey` → `VITE_PIX_KEY`
- `sponsorship.whatsapp` / `sponsorship.whatsappUrl` → `VITE_SPONSOR_WHATSAPP` / `VITE_SPONSOR_WHATSAPP_URL`

## Por que

Esses valores estavam expostos no histórico do git e no bundle de produção. A chave Pix e o código de acesso antecipado em especial não devem ficar em VCS — precisam poder ser rotacionados sem commit.

## Decisões técnicas

- Fallback `|| ''` em todos os `import.meta.env.*` para não quebrar build em ambientes sem as vars configuradas (graceful degradation, padrão já usado no projeto com Supabase).
- `.env.example` atualizado com placeholders para onboarding de novos devs.
- `.env.local` atualizado localmente mas não commitado (já estava no `.gitignore`).
- Deploy CI: quatro novas entradas no `env:` block do step de build no `deploy.yml` — precisam ser adicionadas como GitHub Secrets no repositório.

## Impacto

- `config.js` continua sendo a fonte única de verdade para todos os componentes — nenhum componente precisa mudar.
- Em produção, se os GitHub Secrets não forem configurados, `pixKey` e `whatsapp` ficam strings vazias.

## Próximos passos

- Adicionar os quatro novos secrets no GitHub: `VITE_EARLY_ACCESS_CODE`, `VITE_PIX_KEY`, `VITE_SPONSOR_WHATSAPP`, `VITE_SPONSOR_WHATSAPP_URL`.
