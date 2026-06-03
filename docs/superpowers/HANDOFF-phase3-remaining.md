# Handoff — Auth Phase 3: pendências restantes (SP3 Phases 2–4 + B3 cutoff)

> Prompt autossuficiente para um agente continuar a Fase 3 do re-work de auth do HackIA SC.
> Cole o conteúdo abaixo (a partir de "## PROMPT") como tarefa.

## PROMPT

Você vai continuar a **Fase 3 do re-work de autenticação** do HackIA SC (React 19 + Vite + Supabase, deploy GitHub Pages em push no `master`). Projeto Supabase de PRODUÇÃO: `qshrzfahotmjshtjuvno` (tem dados reais — CPF/pagamentos). **Leia primeiro** a memória `auth-phase3-progress` e os specs/changelogs abaixo; eles têm todo o contexto e as decisões já tomadas.

### Estado atual (tudo já em PROD, verificado — NÃO refazer)
- **SP1** — contas-senha admin/viewer/checkin/staff via UI (edge `access-account`, `AdminAccess`).
- **SP2/B1** — `current_grant_ref()`/`current_mentor_id()`/`current_juror_id()` + 11 RPCs mentor/jurado re-chaveadas dual-mode (session-first).
- **SP2/B2** — mentor/jurado em sessões `jwt_exchange` reais; `grant_auth_kind` flipado; 17 grants migrados; frontend session-first; push/notif re-chaveados; **`access-exchange` está `verify_jwt=false`** (entry-point pré-sessão); E2E real verificado.
- **B3 precondições** — sweep exaustivo de RPCs token + `event_eval_resolve` (branch mentor) re-chaveado.
- **SP3 Phase 1** — helpers de enforcement **já em prod** (`migrations/phase3_sp3_scope_helpers.sql`): `scope_read_only()`, `can_write()`, `scope_tab_allowed(text)`, `assert_tab(VARIADIC text[])`, `my_scope()` — leem scope AO VIVO via `current_grant_ref()`.

### Referências (LER antes de codar)
- Spec SP3: `docs/superpowers/specs/2026-06-03-auth-phase3-sp3-scope-enforcement-design.md` (a fonte da verdade desta tarefa).
- Spec SP2: `docs/superpowers/specs/2026-06-02-auth-phase3-sp2-mentor-juror-sessions-design.md` (§Cutover/B3).
- Changelogs: `docs/changelog/2026-06-0*-auth-phase3-*.md`.
- Memória: `auth-phase3-progress` (decisões, caveats, lista de RPCs/tabelas).

### Invariantes NÃO-NEGOCIÁVEIS
1. **`{}` / null scope / SEM grant row == IRRESTRITO.** Todo guard usa `COALESCE(...,false)` / empty-set → admin legado feito à mão (sem `access_grants` row) NUNCA pode ser trancado. **Risco #1.** Sempre passe pelos helpers da Phase 1; nunca inline checagem de null.
2. **Scope lido AO VIVO** via `current_grant_ref()` (contas-senha NÃO assam scope no JWT). Não confiar em `app_metadata.scope`.
3. **mentor/jurado estão FORA do SP3** (identidade relationship-based). NÃO adicionar read_only/assert_tab em: `juror_submit_score`, `mentor_save_note`, `mentor_delete_note`, `mentor_prepitch_submit`, `participant_save_team_deliverable`, `sugar_send_mentor`.
4. **Decisão Option 2 (writes-only):** `allowed_tabs` gateia só ESCRITAS; **leituras continuam amplas por papel** (`is_admin_or_viewer`). Não reescrever policies de SELECT.
5. **Dois choke points complementares:** RPC `SECURITY DEFINER` ignora RLS (guard no corpo) **E** escrita direta via PostgREST ignora o corpo (guard no RLS WITH CHECK). Precisa dos dois.

### Convenções/processo
- **Repo CRLF** → edite arquivos direto (diffs LLM falham `git apply`).
- **Prod gated:** migrações/edge aplicadas via Supabase MCP (`apply_migration`/`execute_sql`/`deploy_edge_function`) — pelo THREAD PRINCIPAL, NUNCA por subagentes. Subagentes só escrevem arquivos.
- **Execução subagent-driven** (um subagente por tarefa, revisão depois) é o padrão do projeto; re-key mecânico = copiar o corpo VERBATIM da função em prod (`pg_get_functiondef`) e só prepender o guard.
- **Branch + PR + merge** por unidade lógica; commits/PRs/docs em INGLÊS; cada commit gera doc em `docs/changelog/` (regra do projeto).
- **Smoke de sessão com scope** (técnica comprovada, self-cleaning): inserir um `access_grants` jwt de teste com role+scope desejados (`token_hash = encode(extensions.digest('<plaintext≥32ch>','sha256'),'hex')`, `auth_kind='jwt_exchange'`, `ref_id` = um id real se preciso) → `curl POST {URL}/functions/v1/access-exchange` (apikey anon; `access-exchange` é verify_jwt=false) `{"token":"<plaintext>"}` → pega `hashed_token` → `curl POST {URL}/auth/v1/verify {"type":"magiclink","token_hash":...}` → pega `access_token` → chama a RPC/REST com `Authorization: Bearer <access_token>` → **teardown** (DELETE do auth.users `grant+<id>@hackiasc.internal` + DELETE do grant). Anon key/URL: `get_publishable_keys` (use a key JWT legada `eyJ...` como apikey).
- **Antes de cada deploy/merge:** revisão (code-review + security) do diff; gate em 0 Critical/High. `npx vitest run` + `npm run build` verdes p/ mudanças de frontend.

---

### TAREFA A — SP3 Phase 2: guards de escrita nas RPCs (~25)
Para CADA RPC de escrita in-scope listada na spec (§"Choke point A"), copie o corpo VERBATIM da versão em prod (`SELECT pg_get_functiondef(...)`) e **prepend** no início do `BEGIN`:
```sql
  IF NOT can_write() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM assert_tab('<aba-dona>');  -- multi-tab p/ wall_* : assert_tab('wall','facilitator')
```
- Mapa RPC→aba está na spec. `admin_list_grants` é READ → NÃO guardar.
- Comece pelos `admin_*` (maior valor), depois `set_*`/`wall_*`/`sugar_moderate`/`broadcast_notification`/`set_checkin`.
- **Teste de regressão (obrigatório, antes de seguir):** (1) admin SEM grant escreve OK (ex.: `set_checkin` numa sessão admin sem access_grants row — ou prove via helper que `can_write()`=true p/ no-grant admin); (2) grant admin com `scope={"read_only":true}` → write RAISE `read_only`; (3) grant admin com `scope={"allowed_tabs":["dashboard"]}` → write numa RPC de outra aba RAISE `tab_not_allowed`, e numa RPC `dashboard` OK. Use a técnica de smoke acima. Self-clean.

### TAREFA B — SP3 Phase 3: RLS WITH CHECK nas tabelas de escrita direta (~13 + 6 storage)
As tabelas escritas direto via PostgREST (lista na spec §"Choke point B"): `registrations, teams, team_evaluations, jurors, mentors, mentor_teams, resources, schedule_items, schedule_days, prepitch_rooms, prepitch_room_mentors, prepitch_room_teams, team_join_requests` + 6 policies `storage.objects` (deliverables_/resources_).
- Reescreva o `WITH CHECK` das policies de escrita de `is_admin()` → `is_admin() AND NOT scope_read_only()` (e, se quiser allowed_tabs na tabela, `AND scope_tab_allowed('<aba-dona>')`).
- **GOTCHA:** `team_evaluations` usa hardcoded `auth.jwt()->>'role'='admin'` em vez de `is_admin()` — padronize no `can_write()`/`is_admin() AND NOT scope_read_only()`.
- NÃO toque nas policies de SELECT (leituras seguem amplas — decisão Option 2).
- Confirme cada policy via `pg_policies` antes/depois. Regression: read_only admin NÃO consegue `UPDATE` direto numa dessas tabelas; admin normal consegue.

### TAREFA C — SP3 Phase 4: frontend (`src/admin/AdminPanel.jsx`)
- Buscar o scope do grant via RPC `my_scope()` (já existe) e: (1) interseção de `allowed_tabs` com os `TABS` já filtrados por papel (entradas desconhecidas = no-op, nunca adiciona aba que o papel não tem); (2) se `read_only` true, estender o `readOnly` (hoje só `role==='viewer'`) para esconder ações de escrita. É UX; o backend (A/B) é o gate real.
- `npx vitest run` + `npm run build` verdes; revisar; PR; merge (deploy).

### TAREFA D — SP2/B3 cutoff (IRREVERSÍVEL — só depois do re-onboarding)
**GATE:** só executar depois que o admin re-onboardar os 17 mentores/jurados (AdminAccess → "novo link" → `#acesso`) E os logs mostrarem que o caminho de token legado drenou (sem chamadas a `juror_token_owner`/`mentor_session_owner` por token; checar `access_grants.last_used_at`/`get_logs`). Ordem estrita (spec SP2 §6):
1. Confirmar B2 no ar + legado drenado.
2. **Backup** das colunas `mentors.access_token` + `jurors.access_token` (export antes de dropar — irreversível).
3. Remover os branches `p_token` das RPCs re-chaveadas + dropar resolvers legados (`juror_token_owner`, `mentor_session_owner`, `mentor_prepitch_resolve`, `mentor_get_me_by_token`); **dropar `mentor_login` (RPC) ANTES de `mentor_sessions` (tabela)**; dropar `mentor_logout`.
4. Estreitar GRANTs dessas RPCs de `anon, authenticated` → `authenticated`.
5. Dropar colunas `mentors.access_token` / `jurors.access_token` / tabela `mentor_sessions`.
Frontend: remover o fallback de token legado de `useMentorAuth`/`useJuror` (hoje coexistente).

### TAREFA E — follow-ups (registrar, baixa prioridade)
- Edge functions `access-account`/`sync-mp-payments`/`transcribe-pitch` checam `role=admin` mas NÃO consultam scope → um admin read_only ainda as invoca. Adicionar checagem de scope se relevante.

### Entregue ao final
Cada fase: spec→plano(writing-plans)→execução→rollout gated→changelog→atualizar a memória `auth-phase3-progress`. NÃO faça push/merge com Critical/High em aberto. Reporte o que ficou verde (vitest/build/smokes) explicitamente.
