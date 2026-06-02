# feat(auth): Phase 3 SP1 — password login accounts

**Data:** 2026-06-02
**Branch:** feat/auth-phase3-sp1
**Spec:** docs/superpowers/specs/2026-06-02-auth-phase3-sp1-accounts-design.md
**Plano:** docs/superpowers/plans/2026-06-02-auth-phase3-sp1-accounts.md
**Arquivos:** migrations/phase3_password_accounts.sql, supabase/functions/access-account/index.ts, src/admin/AdminAccess.jsx, src/admin/accountScope.js (+test), src/lib/grantRouting.js (+tests/grantRouting.test.js)

## O que foi feito
Provisionamento de contas de login por senha (admin/viewer/checkin/staff) pela UI admin. Novo edge `access-account` (admin-gated) cria um `auth.users` com senha CSPRNG + `app_metadata={role,grant_id}` e uma linha canônica em `access_grants` (`auth_kind='password'`, `token_hash=null`), devolvendo a senha **uma vez**. Ações: `create` e `reset_password`; revogação reusa o `access-admin`. UI ganhou a seção "Criar conta (login por senha)", coluna "tipo", "resetar senha" e roteamento de revoke por `auth_kind` (`usesEdgeRevoke`). Scope híbrido é coletado/validado-de-shape e armazenado, **mas não enforçado** (isso é o SP3).

## Por que
Fase 3 do re-work de auth. As contas admin/viewer/checkin existiam só feitas à mão por SQL; faltava UI/API para provisioná-las. SP1 também é a fundação (`access_grants` como registro canônico de principal, `grant_id` no `app_metadata`, scope lido ao vivo no SP3) sobre a qual SP2 (unificação mentor/jurado + cutover) e SP3 (enforcement de scope) se apoiam.

## Decisões técnicas
- Senha auto-gerada show-once, **sem troca no 1º acesso** (decisão do usuário).
- Ordem de criação: insere grant → `createUser` → grava `supabase_user_id`, com rollback em qualquer falha (transacional-em-efeito sobre Postgres + Auth).
- `token_hash` nullable; CHECK de shape garante que conta-senha tem email e não tem token. `grant_resolve` usa `token_hash = hash` → `NULL` nunca casa ⇒ contas-senha são irresolvíveis por token (sem bypass).
- Migração atômica/idempotente (`BEGIN/COMMIT` + `DROP CONSTRAINT IF EXISTS`).

## Impacto
- Aditivo. Nenhum row existente viola os novos CHECKs (os 17 grants são `rpc_token`). Reversível até a 1ª conta-senha.
- **Prod já aplicado (backend):** migração + edge `access-account` v1 (`verify_jwt:true`). Gate verificado: sem auth → 401; anon não-admin → 403.
- Frontend sobe ao mergear no master (auto-deploy). A UI atual não usa as features novas até lá.

## Verificação
- Revisão: code-reviewer + security-auditor + architect-reviewer → 0 Critical/High.
- `npx vitest run` 145/145; `npm run build` ok.
- Pós-deploy (manual, admin): criar conta `viewer` → login show-once → revogar → confirmar bloqueio.

## Próximos passos
- **SP2:** unificar mentor/jurado em `jwt_exchange`, corrigir o bug do `mentor_get_me_by_token` (uuid-only), cutover dos links legados `#mentor?t=`/`#jurado?t=`. Precondição: tracer do `verifyOtp` (magic-link, ainda não exercido em prod).
- **SP3:** enforcement de scope (RLS + RPCs) via `current_grant()` (`SECURITY DEFINER`+`STABLE`, revogação instantânea), preservando `{}` == irrestrito; limpar o scope "assado" no `access-exchange`.
