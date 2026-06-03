# fix(auth): SP2/B3 prep — exhaustive RPC sweep + event_eval session re-key

**Data:** 2026-06-03
**Branch:** feat/auth-phase3-b3-prep
**Arquivos:** migrations/phase3_b3prep_event_eval_session.sql

## O que foi feito
Precondições do **B3** (hard cutoff): antes de remover o caminho de token legado, garantir que **toda** RPC token de mentor/jurado resolve por sessão (senão quebraria sem fallback no cutoff).

**Sweep exaustivo** (grep de todas as `.rpc(` em `src/`, cruzando com o conjunto re-chaveado). Inventário completo de RPCs token de mentor/jurado:
- **Mentor:** mentor_get_me, mentor_save_note, mentor_delete_note, mentor_prepitch_list, mentor_prepitch_submit (B1); notifications_list_mentor, notifications_mark_read_mentor, push_subscribe_mentor (B2); sugar_my_received_mentor, sugar_send_mentor, sugar_roster (B1) — **todas re-chaveadas** ✅
- **Jurado:** juror_get_context, juror_submit_score, juror_accept_consent (B1) — todas ✅ (jurado não tem push/notif/sugar/event_eval)
- **Única lacuna:** `event_eval_resolve` (branch mentor), via EventEvaluationForm → `get_my_event_evaluation`/`submit_event_evaluation`. **Re-chaveado agora** (session-first; participant intocado; jurado não usa).

## Por que
Fecha o inventário do advisor ("não herdar descoberta reativa"). Com o sweep completo, o cutoff do B3 pode remover os caminhos de token legados com segurança.

## Impacto
- `event_eval_resolve` aplicado em prod + smoke (mentor sessão → authorized:true; sem sessão → false). Aditivo/coexistente.
- **B3 cutoff segue GATED no re-onboarding dos 17** (drenar os links legados antes de dropar colunas/branches). Não fazer o cutoff antes disso.

## Próximos passos
- **B3 cutoff** (irreversível, após re-onboarding drenar): drop dos branches de token nas RPCs + resolvers legados (juror_token_owner/mentor_session_owner/mentor_prepitch_resolve/mentor_get_me_by_token) + mentor_login/mentor_sessions; GRANTs → authenticated; drop colunas mentors.access_token/jurors.access_token (com backup).
- **SP3:** enforcement de scope.
