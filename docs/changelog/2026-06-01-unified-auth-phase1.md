# feat: unified access-grants auth (Phase 1)

**Data:** 2026-06-01
**Branch:** feat/unified-auth-access-grants
**Spec:** docs/superpowers/specs/2026-06-01-unified-auth-access-grants-design.md
**Plano:** docs/superpowers/plans/2026-06-01-unified-auth-access-grants-phase1.md

## O que foi feito (Fase 1)
Espinha de acesso unificado, gerenciado pelo admin:
- **DB (aplicado em PROD `qshrzfahotmjshtjuvno`):** `is_facilitator()`; tabela `access_grants` + RLS admin-only; `grant_resolve(text)` (hash lookup, expiração/revogação, rate-limit self-contained); RPCs admin `admin_create_grant`/`admin_list_grants`/`admin_revoke_grant`/`admin_regenerate_grant_token`/`admin_set_grant_expiry` + `grant_auth_kind`.
- **Edge (deployada em PROD, ACTIVE v1):** `access-exchange` — valida o grant e, para personas jwt-exchange, garante um usuário-suporte por grant (`grant+<id>@hackiasc.internal`, `app_metadata={role,grant_id,scope}`) e emite magic link (`generateLink`) cujo `hashed_token` o cliente troca por sessão (`verifyOtp`). Smoke-test end-to-end OK (HTTP 200, `{hashed_token, role}`), artefatos limpos.
- **Frontend (na branch — NÃO em prod até merge):** `src/lib/grantRouting.js` (TDD), `useGrantAccess` + rota `#acesso` + `AccessExchange`, UI admin **"Acessos"** (`AdminAccess.jsx` + aba admin-only).

## Estado de produção
- Backend (SQL + edge): **JÁ em prod** (aditivo; nenhum objeto existente alterado).
- Frontend: **só na branch**. A UI "Acessos" e a rota `#acesso` só ficam vivas quando esta branch for mergeada (o deploy do master publica o frontend). Até lá, ninguém consegue criar/usar grants pela UI.

## Decisões técnicas / correções vs plano
- **`rate_limits` em vez de `check_rate_limit`:** a função `check_rate_limit` não existe em prod; existe a tabela `rate_limits(key PK, attempts, first_attempt_at, last_attempt_at)`. `grant_resolve` faz o rate-limit (5/min por hash) self-contained via essa tabela.
- **pgcrypto no schema `extensions`:** `digest`/`gen_random_bytes` foram qualificados como `extensions.*` (mantendo `search_path = pg_catalog, public` seguro). `gen_random_uuid` é built-in.
- **Hook `Authorization`:** `useGrantAccess` envia a anon key como `Bearer` (além de `apikey`) para passar no `verify_jwt` do gateway; a auth real é o grant token validado na função.
- **Segurança (sem reintroduzir achados do sweep):** toda função SECURITY DEFINER nova tem `SET search_path`; tokens via `gen_random_bytes`; só o `sha256` é armazenado (token cru só no link); RPCs admin gated por `is_admin()`; resolve rate-limited.

## Escopo adiado para Fase 2
- **Mentor/jurado:** bloqueados nesta fase — todas as RPCs deles são `uuid`-tipadas (`juror_get_context`, `juror_submit_score`, `mentor_get_me`, `mentor_save_note`, owners, etc.), então um token hex de grant não passa no cast. Integrá-los exige trocar ~7 assinaturas de auth vivas ou uma ponte grant→token legado. Eles seguem com seus links atuais (`#mentor?t=`, `#jurado?t=`) funcionando normalmente.
- **Contas privilegiadas (admin/viewer/checkin):** criação via UI (edge `access-admin`) é Fase 2.
- **Cutover:** remoção dos links legados (`#admin-acesso?t=<senha>`, `#mentor?t=`, `#jurado?t=`) e ban do usuário-suporte no revoke — Fase 2, após distribuição dos novos links.

## Como emitir acesso (após o merge)
Admin → aba **Acessos** → criar (nome ex "FULANO" + role + expiração opcional) → copiar o link `#acesso?t=…`. Roles jwt-exchange disponíveis: facilitator, staff, viewer, checkin, admin. Revogar/regerar pela mesma tela.

## Verificação
- `npx vitest run` (suite completa) e `npm run build` — verdes.
- SQL smoke-tests (grant_resolve expiry/revoke, is_admin gate) — OK via MCP.
- Edge `access-exchange` — smoke-test E2E OK (token → sessão staff), artefatos removidos.
- Pendente (pós-merge): E2E no browser abrindo um link `#acesso` por role.

## Próximos passos
- Mergear a branch para publicar o frontend (a UI "Acessos" fica utilizável).
- Fase 2: mentor/jurado, contas privilegiadas via UI, cutover dos links legados.
