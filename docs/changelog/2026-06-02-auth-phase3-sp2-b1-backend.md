# feat(auth): Phase 3 SP2/B1 — session-identity helpers + dual-mode RPC re-key

**Data:** 2026-06-02
**Branch:** feat/auth-phase3-sp2
**Spec:** docs/superpowers/specs/2026-06-02-auth-phase3-sp2-mentor-juror-sessions-design.md
**Plano:** docs/superpowers/plans/2026-06-02-auth-phase3-sp2-b1-backend.md
**Arquivos:** migrations/phase3_sp2_b1_helpers.sql, migrations/phase3_sp2_b1_rekey_rpcs.sql

## O que foi feito
Fundação backend do SP2 (Opção B): mentor/jurado vão migrar de `rpc_token` (token no localStorage) para sessões `jwt_exchange` reais. B1 adiciona:
- **`current_grant_ref()`** (`STABLE SECURITY DEFINER`): resolve o grant do chamador pela sessão (`supabase_user_id = auth.uid()`), travando `revoked_at`/`expires_at` na mesma leitura. + `current_mentor_id()`/`current_juror_id()` (retornam NULL na ausência).
- **Re-key de 11 RPCs** (3 juror + 5 mentor + 3 sugar) para **session-first guardado** (não COALESCE — os resolvers legados dão RAISE): `sessão → senão token (coexistência) → senão unauthorized`. Corpos copiados verbatim do `phase2_mentor_juror_text.sql`; só o preâmbulo de identidade mudou. Sem mudança de assinatura (o frontend B2 passará `p_token: null`).

## Por que
Aditivo/coexistente: o ramo de sessão fica **dormente** até o B2 (frontend). Nada muda pro usuário agora; os links legados seguem 100% via o ramo de token (código intocado).

## Decisões técnicas
- Flip do `grant_auth_kind` + UPDATE dos 17 grants **movidos pro B2** (atômico com o frontend) — fazê-los aqui deixaria um link `#acesso` emitir uma sessão que o frontend B1 não consome.
- `current_*_id()` retornam NULL (não RAISE) para o guard funcionar.
- GRANTs mantidos `anon, authenticated` (coexistência); estreitam pra `authenticated` no B3.

## Impacto
- **Aplicado em prod** (qshrzfahotmjshtjuvno): 2 migrations. Smoke (tracer): mentor + jurado resolvem via sessão tokenless (`current_*_id()`); sem sessão + tokenless → `unauthorized`. Grants/backing users de teste limpos.
- Backend SQL only (sem deploy de frontend).

## Verificação
- Re-key conferido: grep dos 11 preâmbulos + 10 fallbacks de token + diff Python do implementador (corpos verbatim) + smoke end-to-end em prod (mentor_get_me/juror_get_context retornaram dados completos e corretos via sessão).

## Próximos passos
- **B2:** frontend por sessão (`useJuror`/`useMentorAuth`/`useGrantAccess` com `verifyOtp type:'magiclink'`) + flip `grant_auth_kind` + UPDATE dos 17 + UI admin emite `#acesso` + re-onboarding. Drop do email+código do mentor.
- **B3:** hard cutoff (drenar legados → backup → drop colunas/resolvers).
