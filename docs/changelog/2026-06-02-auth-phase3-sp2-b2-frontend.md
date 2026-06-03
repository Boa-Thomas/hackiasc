# feat(auth): Phase 3 SP2/B2 — mentor/juror real sessions (frontend + flip)

**Data:** 2026-06-02
**Branch:** feat/auth-phase3-sp2-b2
**Spec:** docs/superpowers/specs/2026-06-02-auth-phase3-sp2-mentor-juror-sessions-design.md
**Plano:** docs/superpowers/plans/2026-06-02-auth-phase3-sp2-b2-frontend.md
**Arquivos:** migrations/phase3_sp2_b2_rekey_push_notif.sql, migrations/phase3_sp2_b2_flip_grants.sql, src/hooks/useGrantAccess.js, src/juror/useJuror.js, src/mentor/useMentorAuth.js, src/App.jsx, src/juror/JurorPanel.jsx, (deleted) src/mentor/MentorLogin.jsx

## O que foi feito
Mentor/jurado passam a autenticar por **sessão Supabase real** (jwt_exchange via `#acesso`), chamando as RPCs re-chaveadas (B1/B2) com `p_token: null`. O token legado segue como **fallback de coexistência** (removido no B3).
- **Backend:** `phase3_sp2_b2_rekey_push_notif.sql` (push_subscribe_mentor + notifications_list/mark_read_mentor → session-first dual-mode; aplicado + smoked). `phase3_sp2_b2_flip_grants.sql` (grant_auth_kind→`jwt_exchange` p/ todos + UPDATE dos 17; aplicar **após** o deploy do frontend).
- **Frontend:** `useGrantAccess` `verifyOtp` `email`→`magiclink` + msg de link single-use; `useJuror`/`useMentorAuth` session-first (detectam `getSession()` com `app_metadata.role` correto, RPC tokenless), fallback legado preservado; `useMentorAuth` retorna `token:null` em sessão (push/notif resolvem pela sessão); login email+código removido (`MentorLogin` deletado; gate do `#mentor` mostra "use seu #acesso"); `JurorPanel` gate por `isValid`.

## Por que
SP2 Opção B (sessões reais, sem token no localStorage). Coexistência honrada: legados seguem 100% até o B3.

## Decisões técnicas
- Deploy do frontend é seguro mesmo antes do flip (grants ainda rpc_token → branch rpc_token + fallback legado). Flip ativa as sessões.
- Sessão só vira mentor/jurado se `app_metadata.role` casar (sessão admin/viewer NÃO vira mentor — hook montado globalmente).
- Flip é **reversível** (`UPDATE ... rpc_token` + reverter grant_auth_kind).

## Impacto
- `phase3_sp2_b2_rekey_push_notif` aplicado + smoked em prod. Frontend e flip via merge/deploy (gated).
- **Degradação conhecida (coexistência):** session mentor não acessa a survey de evento (event_eval não re-chaveada) — funciona pelo link legado por ora.

## Verificação
- Re-key push/notif: smoke session+negativo. Frontend: build + vitest 145/145; review dos 3 hooks. **Pendente:** browser-verify de 1 link `#acesso` real (gate do re-onboard em massa).

## Próximos passos
- **B2 integração:** merge (deploy) → browser-verify 1 link real → aplicar flip → re-onboard dos 17 (via AdminAccess "novo link").
- **Precondições do B3** (antes de remover o legado): (1) re-key do `event_eval_resolve` (caminho mentor, uuid→text); (2) **sweep exaustivo** de todas as RPCs token de mentor/jurado vs o conjunto re-chaveado.
- **B3:** hard cutoff (drain → backup → drop resolvers/mentor_login/mentor_sessions/colunas; GRANTs → authenticated).
