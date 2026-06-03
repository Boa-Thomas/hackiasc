# feat(auth): Phase 3 SP3/Phase 2 — read_only + allowed_tabs guards on write RPCs

**Data:** 2026-06-03
**Branch:** feat/auth-phase3-sp3-phase2
**Spec:** docs/superpowers/specs/2026-06-03-auth-phase3-sp3-scope-enforcement-design.md (§ Choke point A)
**Plano:** docs/superpowers/plans/2026-06-03-auth-phase3-sp3-phase2-write-rpc-guards.md
**Arquivos:** migrations/phase3_sp3_phase2_write_rpc_guards.sql

## O que foi feito
Enforcement de scope no **corpo** das 25 RPCs de escrita in-scope (choke point A — SECURITY DEFINER ignora RLS, então o gate vive no corpo). Cada função = corpo VERBATIM da prod + duas linhas inseridas **após** o bloco de papel existente:
```sql
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('<aba>'[, '<aba2>']);
```
Helpers (SP3 Phase 1, já em prod) leem o scope AO VIVO via `current_grant_ref()` e defaultam para "permitir" em `{}`/null/sem-grant.

## Por que
Trancar escritas de grants `read_only` e gatear escrita por aba (`allowed_tabs`) para os papéis JWT (admin/viewer/checkin/staff/facilitator), sem mexer em leituras (Option 2, writes-only) nem nas RPCs relacionais (mentor/jurado).

## Decisão técnica — DESVIO CONSCIENTE da spec (não "consertar" de volta)
A spec escreveu `IF NOT can_write()`. `can_write() = is_admin() AND NOT scope_read_only()`. **Seis** RPCs autorizam papéis NÃO-admin (`set_checkin`→`is_checkin_staff`; `wall_hide/unhide/admin_add_pain`→`is_wall_staff`; `wall_set_phase`/`set_team_scores_visible`→`is_admin() OR is_facilitator()`). `can_write()` trancaria esses papéis de forma dura (regressão não relacionada a scope). Solução: usar `scope_read_only()` **depois** do check de papel — idêntico a `NOT can_write()` para RPCs admin-only (is_admin já provado) e correto para as multi-papel. Confirmado pelo advisor + code-review + security-auditor.

## Mapa RPC→aba (IDs canônicos do AdminPanel)
access ×4, bulk ×4, mentors ×2, teams ×1, checkin ×1, evaluation ×1, deliverables ×1, deliverables+facilitator ×1 (`set_team_scores_visible`), jurors ×2, sugarcubes ×2, notifications ×2, wall+facilitator ×4 (`wall_*` multi-tag pois facilitator também chama). `admin_list_grants` é READ → sem guard. Excluídas (relacionais): juror_submit_score, mentor_save_note/delete_note/prepitch_submit, participant_save_team_deliverable, sugar_send_mentor.

## Impacto
- **Aplicado em prod** (qshrzfahotmjshtjuvno): migration `phase3_sp3_phase2_write_rpc_guards`.
- **No-op comportamental hoje:** zero grants têm scope não-vazio em prod → todo guard passa. `allowed_tabs` fica DORMENTE até a Phase 4 (o input do AdminAccess ainda é texto livre com placeholder errado).
- Sem breaking change. Reviews: 0 Critical/High.

## Verificação (tudo verde)
- **Sem overload silencioso:** 25 overloads / 25 nomes distintos / 0 duplicados (catch dos reviews — `CREATE OR REPLACE` com assinatura divergente criaria função nova sem guard).
- **Diff de transcrição vs baseline:** 0 mismatches (corpos byte-idênticos modulo guard+whitespace).
- **Guard presente:** 25/25.
- **Smoke comportamental** (self-cleaning, simulação de sessão via `set_config('request.jwt.claims')` em transação ROLLBACK): 6/6 PASS — (1) admin SEM grant escreve OK [invariante #1], (2) admin {} escreve OK, (3) admin read_only → read_only, (4) admin tab=[dashboard] em RPC de access → tab_not_allowed, (5) **checkin não-admin escreve OK** [prova que não usei can_write()], (6) checkin read_only → read_only.

## Próximos passos
- **Phase 3:** RLS WITH CHECK `is_admin() AND NOT scope_read_only()` (+ tab) nas ~13 tabelas de escrita direta + 6 storage; padronizar `team_evaluations` (hardcoded `jwt->>'role'='admin'`).
- **Phase 4:** AdminPanel narra abas via `my_scope()` + read_only esconde ações; corrigir input free-text do AdminAccess (tornar allowed_tabs live).
- Follow-up (E): edges access-account/sync-mp-payments/transcribe-pitch checam role mas não scope.
