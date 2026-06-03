# feat(auth): Phase 3 SP3/Phase 3 — read_only on direct-write RLS (Choke point B)

**Data:** 2026-06-03
**Branch:** feat/auth-phase3-sp3-phase3
**Spec:** docs/superpowers/specs/2026-06-03-auth-phase3-sp3-scope-enforcement-design.md (§ Choke point B)
**Plano:** docs/superpowers/plans/2026-06-03-auth-phase3-sp3-phase3-rls-with-check.md
**Arquivos:** migrations/phase3_sp3_phase3_rls_with_check.sql

## O que foi feito
Enforcement de `read_only` no segundo choke point: as ~13 tabelas escritas DIRETO via PostgREST (`.from().insert/update/delete`, fora das RPCs do Phase 2) + 4 storage policies. Adiciono `AND NOT public.scope_read_only()` ao USING **e** WITH CHECK de toda policy de escrita admin/facilitator (20 ALTERs). + 5 SELECT policies "mirror" para preservar leituras.

## Por que
RPC SECURITY DEFINER ignora RLS (Phase 2 cobre o corpo); escrita direta ignora o corpo da RPC → RLS é o único gate. Os dois choke points são complementares.

## Decisões técnicas
- **DELETE via USING:** DELETE não tem WITH CHECK; o gate precisa estar no USING (senão um admin read_only deletava direto). Por isso o termo entra em USING **e** WITH CHECK das policies `ALL`.
- **Leituras amplas preservadas (mirror rule):** estreitar o `qual` de uma policy `ALL` também tiraria o SELECT dela. Antes de estreitar, criei SELECT policies espelhando o USING ATUAL das policies cujo único SELECT vinha da policy estreitada: jurors, resources, schedule_items (admin **e** facilitator), schedule_days (admin). As demais já tinham SELECT amplo separado. Nenhuma leitura foi perdida nem alargada (mirrors usam `is_admin()`/`is_facilitator()` idênticos — viewer não ganha leitura nova).
- **team_evaluations padronizado:** saiu do hardcoded `auth.jwt()->>'role'='admin'` para `is_admin() AND NOT scope_read_only()` (equivalente p/ admin normal).
- **read_only ONLY (sem tab):** `scope_tab_allowed` em escrita direta é opcional (spec) e foi DIFERIDO p/ Phase 4 (vocabulário de aba ainda é texto livre; custo per-row em RLS). Assimetria documentada: writes via RPC têm tab-gate (P2), writes diretas ainda não.
- **registrations INSERT** (`Allow public/authenticated registration insert`) intocadas — auto-inscrição participante, fora do escopo Choke B.

## Impacto
- **Aplicado em prod** (qshrzfahotmjshtjuvno): migration `phase3_sp3_phase3_rls_with_check`.
- **No-op comportamental hoje:** 0 grants têm scope não-vazio. `scope_read_only()`=false p/ {}/null/sem-grant → admin legado nunca trancado.
- Reviews (security-auditor + code-reviewer, cross-check contra os CREATE POLICY source-of-truth): 0 Critical/High.

## Verificação (tudo verde)
- **Drift gate pré-apply:** conjunto de policies de escrita ao vivo bate EXATO com os 20 ALTERs; todas PERMISSIVE/`{authenticated}`; nenhuma policy staff/checkin oculta; nenhuma RESTRICTIVE.
- **Snapshot pós-apply:** 5 mirrors; 0 write policies sem gate; registrations UPDATE gated; team_evaluations padronizado; 0 SELECT acidentalmente gated.
- **Smoke RLS-aware** (self-cleaning, `SET LOCAL ROLE authenticated` — sem isso `postgres` bypassaria RLS e daria falso-verde): **9/9 PASS** — no-grant admin UPDATE OK; read_only admin UPDATE/DELETE→0, INSERT→"row-level security violation"; read_only admin lê teams=12; **read_only facilitator lê schedule_items=30**; admin/facilitator normais escrevem.

## Próximos passos
- **Phase 4:** AdminPanel narra abas via `my_scope()` + read_only esconde ações de escrita; corrigir input free-text do AdminAccess (allowed_tabs vira live) — e então, se quiser, adicionar tab-gate nas escritas diretas (fechar a assimetria).
- Follow-up E: edges access-account/sync-mp-payments/transcribe-pitch checam role mas não scope.
