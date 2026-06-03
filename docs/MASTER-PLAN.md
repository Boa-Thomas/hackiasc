# HackIA SC — Plano Master (estado + roadmap)

> **Fonte da verdade** do estado do projeto e do trabalho restante. Atualize este doc quando uma frente mudar de status.
> Memórias detalhadas (Claude Code): `auth-phase3-progress`, `multi-edition-architecture`, `supabase-prod-env-quirks`, `push-secret-rotation`.
> Última revisão: 2026-06-03.

## TL;DR
- **Evento HackIA Blumenau 2026: ENCERRADO + congelado** no apex `hackiasc.com` (rodou 29–31 mai).
- **Auth Fase 3 (unified-auth): ✅ COMPLETA em produção** (SP1+SP2+SP3 + scope-gate nos edges). Frente fechada.
- **Multi-edição: blueprint** — 5 sub-projetos; construir só quando uma edição for de fato agendada. #1 (schema bootstrap) está a meio.
- **Pendências reais agora = housekeeping:** backup pré-reset + faxina de branches + WIP parqueado.

## 1. Frentes e status
| Frente | Status | Referências |
|---|---|---|
| App do evento (Blumenau 2026) | ✅ entregue, congelado | ~40 specs/plans de 22–31 mai em `docs/superpowers/` |
| **Auth Fase 3** (unified-auth) | ✅ **COMPLETA em prod** (PRs #241–#255) | memory `auth-phase3-progress`; specs `2026-06-0{1,2,3}-...auth-phase3-*` |
| **Multi-edição** (próximas edições) | 🔄 blueprint, 1/5 em andamento | memory `multi-edition-architecture`; specs `2026-06-03-multi-edition-*` / `-schema-bootstrap-*` |
| Housekeeping (fechar ciclo Blumenau) | ⏳ a fazer | §3 deste doc |

## 2. Auth Fase 3 — FECHADA (referência rápida)
- **SP1** contas-senha admin/viewer/checkin/staff via UI (`access-account` edge + `AdminAccess`). ✅
- **SP2** mentor/jurado → sessões `jwt_exchange` reais; ~16 RPCs re-chaveadas (session-first); frontend session-based. ✅ (E2E real no browser)
- **SP3** enforcement de scope: `read_only` enforçado em **RPC body + RLS WITH CHECK + 3 edges**; `allowed_tabs` nas **escritas**. ✅
- **B3 cutover legado:** rebaixado a **opcional/zero-risco** (evento encerrado, 0/17 re-onboarded, futuro = per-instância). Não é mais necessário.
- **Leftovers opcionais (baixa prioridade):** (a) UX gap — alguns componentes admin não honram o `readOnly` prop (botão aparece, clique falha no backend; cosmético, não é furo); (b) `allowed_tabs` em escrita-direta (RLS) ficou deferido — só `read_only` está nas tabelas; (c) Tarefa D: drop dos tokens legados (`mentors/jurors.access_token`, `mentor_sessions`).
- Detalhe completo + contratos: memory `auth-phase3-progress`. Handoff: `docs/superpowers/HANDOFF-phase3-remaining.md`.

## 3. Housekeeping — fechar o ciclo Blumenau (FAZER AGORA)
### 3.1 Backup pré-reset — CRÍTICO (antes de qualquer reset)
3 partes (a #3 é a insubstituível). Rodar no shell do dono (prefixo `!`); comandos + manifesto em §6.
- (1) `db dump` schema+data+roles; (2) **14 arquivos / 39 MB** do bucket `files` (Storage NÃO sai no dump); (3) schema também versionado em `migrations/`.
### 3.2 Faxina de branches/worktrees
- Triagem em §5. Manter só `feat/schema-bootstrap`; deletar as abandonadas; limpar `.claude/worktrees/`.
### 3.3 WIP parqueado (não perder)
- `feat/schema-bootstrap`: 7/10 partes do `bootstrap.sql` + tooling de chunk commitados (PR aberto/branch). Retomar a geração das **155 funções** (`30_functions.sql` etc.) numa **sessão fresca** — ver a seção "EXECUTION STATUS — RESUME HERE" em `docs/superpowers/plans/2026-06-03-schema-bootstrap.md`.

## 4. Multi-edição (blueprint — construir quando uma edição for agendada)
**Decisão (2026-06-03):** cada edição = **instância isolada** (Supabase próprio + deploy próprio no **Cloudflare Pages** + subdomínio `cidade.hackiasc.com`). **NÃO** multi-tenant por `event_id` (vazamento de CPF/pagamento entre orgs seria risco real). Domínio guarda-chuva `hackiasc.com` é do projeto; Blumenau congelada no apex.
**5 sub-projetos ordenados** (cada um com spec→plano):
1. **Schema bootstrap** 🔄 — gerar 1 `bootstrap.sql` idempotente do catálogo VIVO (37 tabelas, 155 funções, 67 policies, 10 triggers, 6 extensões, bucket `files`). 7/10 prontas; falta `30_functions`/`40_constraints`/`60_policies`/`70_grants` → `cat` → verificar. (branch `feat/schema-bootstrap`)
2. **De-hardcode `src/lib/config.js`** (config por deploy/env, mantendo a shape `EVENT_CONFIG`).
3. **Migração GitHub Pages → Cloudflare Pages** (deploy-por-edição, env-por-deploy, subdomínios).
4. **Runbook de provisioning** (segredos por instância: Mercado Pago, VAPID push, WHISPER_URL, service role).
5. **Congelar Blumenau** (+ opcional Tarefa D cleanup).
Detalhe: memory `multi-edition-architecture` + spec `2026-06-03-multi-edition-instance-architecture-design.md`.

## 5. Triagem de branches (2026-06-03)
`master` @ PR #258. **MANTER:** `feat/schema-bootstrap` (frente ativa multi-edição #1).
**DELETAR (abandonadas — era de construção do evento, não-mergeadas, evento encerrado):**
`chore/prod-db-sync`, `claude/admiring-pike-d33b46`, `claude/fix-mercado-pago-discount-XICra`, `claude/fix-refund-admin-bugs-VgYy3`, `claude/generalize-ticket-pricing-A5skw`, `claude/investigate-payment-detection-u5DZL`, `claude/pre-pitch-slider-bug-Zh9K6`, `claude/team-registration-discount-7Y0xG`, `feat/mentor-ai-eval-display`, `feat/mp-fees-integration`, `fix/191-mentor-team-exclusivity`, `fix/log-event-actor-type`, `test/192-teams-trigger-smoke`, `worktree-agent-a37da225f59d1a945`, `worktree-agent-acfb2c141fa46b359`, `worktree-team-phase-aliases` (+ as muitas locais já mergeadas).
**REVISAR antes de descartar:** `fix/ux-a11y-improvements` tem um doc "post-event backlog" (itens deferidos de segurança/feature/infra) — extrair o que valer como issue.
**Worktrees:** limpar `.claude/worktrees/*` (locais, seguros).

## 6. Backup runbook (comandos + manifesto)
Rodar no shell do dono (`!`), projeto já linkado (`qshrzfahotmjshtjuvno`):
```
! npx supabase db dump --linked -f backup-schema.sql
! npx supabase db dump --linked -f backup-data.sql --data-only --use-copy
! npx supabase db dump --linked -f backup-roles.sql --role-only
! npx supabase storage cp --recursive "ss:///files" ./backup-storage --linked
```
*(senha do DB: Dashboard → Settings → Database. Sem CLI: `pg_dump "<Connection string URI>"`. Sem `storage cp`: Dashboard → Storage → bucket `files` → baixar `deliverables/` + `resources/`.)*
**Manifesto Storage (14 arquivos = 39 MB):** `deliverables/<teamId>/slides.pdf` × 11 (maiores 8.6/8.3/5.8 MB) + `resources/*.pdf` × 3 (5.2/1.0/0.76 MB). **Verificar:** 3 `.sql` > 0 bytes + 14 PDFs / ~39 MB.

## 7. Convenções (como qualquer sessão deve operar)
- **Prod gated:** migrações/edge via Supabase MCP, **só pelo thread principal** (subagentes só escrevem arquivos). Projeto `qshrzfahotmjshtjuvno`.
- **Repo CRLF** → editar arquivos direto (diffs LLM falham `git apply`). Branch+PR+merge por unidade lógica; commits/PRs em inglês; changelog por commit em `docs/changelog/`.
- **Smokes self-cleaning** (grant jwt de teste → exchange → verifyOtp → chamar → teardown; ou `set_config('request.jwt.claims')` + `SET LOCAL ROLE authenticated` em txn ROLLBACK para RLS).
- Antes de deploy/merge: revisão (code+security) do diff; gate em 0 Critical/High.
