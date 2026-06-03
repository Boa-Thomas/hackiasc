# fix(auth): SP3 follow-up E — scope-gate the admin edge functions

**Data:** 2026-06-03
**Branch:** fix/auth-phase3-sp3-edge-scope
**Spec:** docs/superpowers/specs/2026-06-03-auth-phase3-sp3-scope-enforcement-design.md (§ Risks — edge functions)
**Arquivos:** supabase/functions/access-account/index.ts, supabase/functions/transcribe-pitch/index.ts, supabase/functions/sync-mp-payments/index.ts

## O que foi feito
Adiciona o gate de `read_only` aos 3 edges que checavam só `role=admin`. Após o check de papel, cada edge lê o scope AO VIVO como o chamador (`scope_read_only()` via um client autenticado com o JWT do chamador) e rejeita se read_only.

## Por que (eleva de follow-up → importante)
Esses edges escrevem com a **service role** (bypassa RLS + os guards de corpo da Phase 2), então o gate no edge é o **único**. `access-account` era um furo de **escalonamento de privilégio**: um admin read_only podia chamar o edge direto (curl, contornando o esconde-aba do frontend) e criar um admin NÃO-read_only → escalar. Sem isso, `read_only` não é uma fronteira real.

## Decisões técnicas
- **Fail-CLOSED:** `if (roErr || callerReadOnly !== false)` bloqueia. `scope_read_only()` retorna `false` LITERAL para `{}`/null/sem-grant (COALESCE), então admin legado NUNCA é trancado; só erro-de-RPC ou `true` negam. (Review de segurança apontou o fail-open inicial `=== true` como Medium — corrigido antes do merge.)
- **Cron intocado:** em `sync-mp-payments` o check fica no ramo de JWT de usuário, DEPOIS do early-return da service key (cron) → o cron segue sincronizando.
- **verify_jwt preservado:** access-account/transcribe-pitch=true, sync-mp-payments=false.

## Impacto
- **Deployado em prod** (qshrzfahotmjshtjuvno): access-account v3, transcribe-pitch v6, sync-mp-payments v11.
- **No-op para todos os admins atuais** (0 grants têm scope não-vazio → scope_read_only=false → não bloqueia).
- Review de segurança: 0 Critical/High (1 Medium fail-open → corrigido).

## Verificação (E2E real, self-cleaning)
Sessão jwt_exchange real role=admin via access-exchange → verifyOtp → access_token → curl no edge:
- **read_only admin → 403 `{"error":"read_only"}`** (escalonamento fechado).
- **`{}` admin → 400 `{"error":"invalid_role"}`** (passou o scope-check, sem criar conta → sem falso-bloqueio).
Re-rodado após o fix fail-closed: mesmos resultados. Grants + backing users de teste limpos.

## Próximos passos
- SP3 está completo (Phases 1-4 + follow-up E). Opcional: tab-gate nas escritas diretas (RLS) p/ fechar a assimetria RPC-vs-direto. SP2/B3 cutoff (irreversível) segue gated no re-onboarding dos 17 mentores/jurados pelo usuário.
