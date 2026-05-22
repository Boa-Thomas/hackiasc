# Painel da Equipe + Sistema de Mentor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Materializar o painel da equipe (4 entregáveis da metodologia por fase) e o sistema de mentor (login por email+código, painel do mentor, ponderações públicas/privadas, cadastro pelo admin).

**Architecture:** Fundação `teams` com `id` estável (`team_name` segue canônico para pertença; `team_id` é espelho por trigger). Entregáveis e ponderações ancorados em `teams.id`. Participante e mentor usam token custom via RPC `SECURITY DEFINER` (RLS deny-all); admin usa Supabase Auth. Spec: [2026-05-22-painel-equipe-mentor-design.md](../specs/2026-05-22-painel-equipe-mentor-design.md).

**Tech Stack:** React 19 + Vite + Tailwind v4; Supabase Postgres (RPC + RLS + pgcrypto). Sem suíte de testes — verificação por `npm run lint`, `npm run build`, aplicação do SQL no Supabase e teste manual no navegador.

**Verificação do SQL:** as mudanças de banco vão para `supabase-setup.sql` (canônico) e `migrations/add_team_and_mentors.sql` (idempotente, aplicável em produção). O usuário aplica a migração no Supabase SQL Editor; o agente não tem acesso ao banco.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase-setup.sql` (mod) | Estado canônico: `teams`, `team_id`, triggers, RPCs, RLS |
| `migrations/add_team_and_mentors.sql` (novo) | Migração idempotente para banco existente |
| `src/lib/relativeTime.js` (novo) | Helper "há X min/h/dia" |
| `src/admin/AdminTeams.jsx` (mod) | Rename via `teams.name`; `team_id` no select |
| `src/participant/useParticipantAuth.js` (mod) | Expor `auth.team` |
| `src/participant/ParticipantPanel.jsx` (mod) | Aba "Entregáveis"; render `DeliverablesSection` |
| `src/participant/ComingSoon.jsx` (del) | Substituído |
| `src/participant/DeliverablesSection.jsx` (novo) | Container: sub-abas por fase + comentários públicos do mentor |
| `src/participant/HypothesesCanvas.jsx` (novo) | Canvas de Hipóteses (5 campos) |
| `src/participant/SlcIaCanvas.jsx` (novo) | Canvas SLC-IA (7 campos, 1 select) |
| `src/participant/LearningDiary.jsx` (novo) | Diário BML (lista de ciclos) |
| `src/participant/FinalDeliverables.jsx` (novo) | Entregas finais (3 URLs + texto) |
| `src/mentor/useMentorAuth.js` (novo) | Auth do mentor (token custom) |
| `src/mentor/MentorLogin.jsx` (novo) | Login email + código 4 díg. |
| `src/mentor/MentorPanel.jsx` (novo) | Painel do mentor (equipe + entregáveis RO + notas) |
| `src/mentor/MentorNotes.jsx` (novo) | Editor de ponderações por fase |
| `src/App.jsx` (mod) | Rota `#mentor` |
| `src/admin/AdminMentors.jsx` (novo) | Aba admin: cadastrar/listar mentores |
| `src/admin/AdminPanel.jsx` (mod) | Aba "Mentores" (adminOnly) |

Componentes de entregável seguem o padrão de [EditProfile.jsx](../../../src/participant/EditProfile.jsx) (estado local, `dirty`, salvar via RPC, `refreshMe`, feedback). O painel do mentor reusa esses componentes em modo `readOnly`.

---

## Fase 1 — Fundação `teams`

**Files:** Modify `supabase-setup.sql`; Create `migrations/add_team_and_mentors.sql`; Modify `src/admin/AdminTeams.jsx`.

- [ ] **1.1 Schema `teams` + `team_id`** — adicionar ao fim de `supabase-setup.sql` e iniciar a migração:

```sql
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hypotheses_canvas  JSONB NOT NULL DEFAULT '{}'::jsonb,
  slc_ia_canvas      JSONB NOT NULL DEFAULT '{}'::jsonb,
  learning_diary     JSONB NOT NULL DEFAULT '{}'::jsonb,
  final_deliverables JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES registrations(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_teams_name ON teams(name);
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_registrations_team_id ON registrations(team_id);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin can read teams" ON teams;
CREATE POLICY "Admin can read teams" ON teams FOR SELECT TO authenticated USING (is_admin_or_viewer());
DROP POLICY IF EXISTS "Admin can update teams" ON teams;
CREATE POLICY "Admin can update teams" ON teams FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "Admin can insert teams" ON teams;
CREATE POLICY "Admin can insert teams" ON teams FOR INSERT TO authenticated WITH CHECK (is_admin());
```

- [ ] **1.2 Backfill idempotente:**

```sql
INSERT INTO teams (name)
SELECT DISTINCT team_name FROM registrations
WHERE team_name IS NOT NULL AND payment_status <> 'cancelled'
ON CONFLICT (name) DO NOTHING;

UPDATE registrations r SET team_id = t.id
FROM teams t WHERE r.team_name = t.name AND r.team_id IS DISTINCT FROM t.id;
```

- [ ] **1.3 Triggers de sincronização** (`sync` BEFORE; `cascade` **AFTER** — crítico, evita row órfã):

```sql
CREATE OR REPLACE FUNCTION sync_registration_team_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_team_id UUID;
BEGIN
  IF NEW.team_name IS NULL THEN NEW.team_id := NULL; RETURN NEW; END IF;
  SELECT id INTO v_team_id FROM teams WHERE name = NEW.team_name;
  IF v_team_id IS NULL THEN
    INSERT INTO teams (name) VALUES (NEW.team_name)
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_team_id;
  END IF;
  NEW.team_id := v_team_id; RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_sync_team_id_ins ON registrations;
CREATE TRIGGER trg_sync_team_id_ins BEFORE INSERT ON registrations
  FOR EACH ROW EXECUTE FUNCTION sync_registration_team_id();
DROP TRIGGER IF EXISTS trg_sync_team_id_upd ON registrations;
CREATE TRIGGER trg_sync_team_id_upd BEFORE UPDATE OF team_name ON registrations
  FOR EACH ROW EXECUTE FUNCTION sync_registration_team_id();

CREATE OR REPLACE FUNCTION cascade_team_rename()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE registrations SET team_name = NEW.name
      WHERE team_id = NEW.id AND team_name IS DISTINCT FROM NEW.name;
    UPDATE team_join_requests SET team_name = NEW.name, updated_at = now()
      WHERE team_name = OLD.name AND status = 'pending';
  END IF;
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS trg_cascade_team_rename ON teams;
CREATE TRIGGER trg_cascade_team_rename AFTER UPDATE OF name ON teams
  FOR EACH ROW EXECUTE FUNCTION cascade_team_rename();
```

- [ ] **1.4 Refactor `AdminTeams.jsx`:** incluir `team_id` no `.select(...)` (linha ~1040); `renameTeam` (linha ~1209) passa a `supabase.from('teams').update({ name: newName }).eq('id', teamId)` (obter `teamId` de `teamsMap[oldName][0].team_id`), removendo o UPDATE direto de `registrations.team_name` (o cascade cuida). Manter o UPDATE de `team_join_requests`? Não — o cascade já faz; remover para evitar duplicação.

- [ ] **1.5 Verificar e commitar:**

```bash
npm run lint && npm run build
git add supabase-setup.sql migrations/add_team_and_mentors.sql src/admin/AdminTeams.jsx
git commit -m "feat(teams): add teams table with stable id, team_id mirror trigger, rename cascade"
```
Verificação manual no Supabase (usuário): aplicar migração; conferir 1 `teams`-row por `team_name`, `team_id` populado; renomear time no admin → `teams.id` inalterado, membros renomeados, sem erro.

---

## Fase 2 — Entregáveis da equipe (painel)

**Files:** Modify `supabase-setup.sql`/migração, `src/participant/useParticipantAuth.js`, `src/participant/ParticipantPanel.jsx`; Create `src/lib/relativeTime.js`, `DeliverablesSection.jsx`, `HypothesesCanvas.jsx`, `SlcIaCanvas.jsx`, `LearningDiary.jsx`, `FinalDeliverables.jsx`; Delete `ComingSoon.jsx`.

- [ ] **2.1 RPC `participant_save_team_deliverable`** (whitelist de campo, valida confirmado + em equipe, limite de payload):

```sql
CREATE OR REPLACE FUNCTION participant_save_team_deliverable(p_token UUID, p_field TEXT, p_data JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_reg_id UUID; v_team_id UUID;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);
  IF p_field NOT IN ('hypotheses_canvas','slc_ia_canvas','learning_diary','final_deliverables') THEN
    RAISE EXCEPTION 'invalid_field'; END IF;
  IF p_data IS NULL OR length(p_data::text) > 65536 THEN RAISE EXCEPTION 'invalid_payload'; END IF;
  SELECT team_id INTO v_team_id FROM registrations WHERE id = v_reg_id;
  IF v_team_id IS NULL THEN RAISE EXCEPTION 'not_in_team'; END IF;
  UPDATE teams SET
    hypotheses_canvas  = CASE WHEN p_field='hypotheses_canvas'  THEN p_data ELSE hypotheses_canvas  END,
    slc_ia_canvas      = CASE WHEN p_field='slc_ia_canvas'      THEN p_data ELSE slc_ia_canvas      END,
    learning_diary     = CASE WHEN p_field='learning_diary'     THEN p_data ELSE learning_diary     END,
    final_deliverables = CASE WHEN p_field='final_deliverables' THEN p_data ELSE final_deliverables END,
    updated_at = now(), updated_by = v_reg_id
  WHERE id = v_team_id;
  RETURN true;
END; $$;
GRANT EXECUTE ON FUNCTION participant_save_team_deliverable(UUID, TEXT, JSONB) TO anon;
```

- [ ] **2.2 Estender `participant_get_me`** (CREATE OR REPLACE): adicionar `team_id` ao `SELECT INTO v_reg`; declarar `v_team JSON`; após `v_my_requests`, montar `v_team` quando `v_reg.team_id IS NOT NULL`:

```sql
SELECT json_build_object('id',t.id,'name',t.name,
  'hypotheses_canvas',t.hypotheses_canvas,'slc_ia_canvas',t.slc_ia_canvas,
  'learning_diary',t.learning_diary,'final_deliverables',t.final_deliverables,
  'updated_at',t.updated_at,
  'updated_by_name',(SELECT full_name FROM registrations WHERE id=t.updated_by))
INTO v_team FROM teams t WHERE t.id = v_reg.team_id;
```
Adicionar `'team', v_team` ao `json_build_object` final; `'team', NULL` no early-return de não-confirmado.

- [ ] **2.3 Hook + helper:** em `useParticipantAuth.js` adicionar `team: me?.team ?? null` ao retorno. Criar `src/lib/relativeTime.js`:

```js
export function relativeTime(iso) {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (s < 60) return 'menos de 1 min'
  const m = Math.floor(s/60); if (m < 60) return `${m} min`
  const h = Math.floor(m/60); if (h < 24) return `${h} h`
  return `${Math.floor(h/24)} dia(s)`
}
```

- [ ] **2.4 Componentes de entregável** (padrão EditProfile: `INPUT`/`LBL`, estado, `dirty`, guarda de conflito por `updated_at`, salvar via `supabase.rpc('participant_save_team_deliverable',{p_token,p_field,p_data})` → `refreshMe`). Campos:
  - `HypothesesCanvas.jsx` (`p_field='hypotheses_canvas'`): textareas `cliente_alvo`, `hipotese_valor`, `hipotese_crescimento`, `hipotese_tecnica_ia`, `priorizacao`.
  - `SlcIaCanvas.jsx` (`slc_ia_canvas`): `hipotese_a_testar`, `tipo_prototipo` (select: Concierge IA / Mágico de Oz IA / IA-real mínima / Pré-venda+Landing / Combinação), `escopo`, `camada_ia`, `experimento`, `plano_execucao`, `entregaveis`.
  - `LearningDiary.jsx` (`learning_diary` = `{cycles:[...]}`): lista de ciclos, cada um com `hipotese`, `experimento`, `dados`, `conclusao`, `decisao` (select pivotar/perseverar/parar); botões adicionar/remover ciclo.
  - `FinalDeliverables.jsx` (`final_deliverables`): inputs URL `repo_url`, `deploy_url`, `slides_url` (validar `^https?://`) + textarea `proximos_passos`.
  - Cada componente aceita prop `readOnly` (desabilita inputs/botões; usado pelo mentor na Fase 4).

- [ ] **2.5 `DeliverablesSection.jsx`** — container: se `!auth.team` → empty state "entre numa equipe" com botão `goToTeam`; senão header (nome + "última edição por X há Y" via `relativeTime`) + sub-abas por fase: **Fase 1 · Hipóteses** | **Fase 2 · SLC-IA** | **Fase 2 · Diário** | **Fase 3 · Entregas**. Renderiza o componente da sub-aba ativa.

- [ ] **2.6 Integrar no painel:** `ParticipantPanel.jsx` — em `ALL_TABS` renomear label `'Em Breve'`→`'Entregáveis'` (manter `id:'event'`); trocar import e render por `<DeliverablesSection auth={auth} goToTeam={() => setTab('team')} />`. Deletar `ComingSoon.jsx`.

- [ ] **2.7 Verificar e commitar:**

```bash
npm run lint && npm run build
git add -A && git commit -m "feat(participant): team deliverables panel (4 canvases by phase)"
```
Manual: aplicar SQL; login participante confirmado em equipe → preencher/salvar cada entregável → recarregar confirma persistência.

---

## Fase 3 — Mentor: autenticação (token custom)

**Files:** Modify `supabase-setup.sql`/migração; Create `src/mentor/useMentorAuth.js`.

- [ ] **3.1 Tabelas `mentors` e `mentor_sessions`** (DDL do spec) + RLS (admin SELECT/gerencia; sem policy anon). Garantir `CREATE EXTENSION IF NOT EXISTS pgcrypto;` (usado por `crypt`).

- [ ] **3.2 RPCs de sessão** (espelham `participant_*`): `mentor_session_owner(p_token)` (valida token não expirado → mentor_id), `mentor_login(p_email, p_code)` (busca por email; checa lockout `failed_login_until`; valida `crypt(p_code, access_code_hash)=access_code_hash`; em falha incrementa `failed_login_count`, bloqueia 1h após 10; em sucesso zera, cria sessão, retorna `{token, name, team_id}`), `mentor_logout(p_token)`. `GRANT EXECUTE ... TO anon` em login/logout.

- [ ] **3.3 `useMentorAuth.js`** — espelha `useParticipantAuth` (token em `sessionStorage` chave `hackiasc_mentor_token`; `login(email,code)`, `logout`, `refreshMe` via `mentor_get_me` — criada na Fase 4; por ora `me` pode ficar nulo até a Fase 4).

- [ ] **3.4 Commit:**
```bash
npm run lint && npm run build
git add -A && git commit -m "feat(mentor): auth tables and RPCs (email + 4-digit code, lockout)"
```

---

## Fase 4 — Painel do mentor

**Files:** Modify `supabase-setup.sql`/migração, `src/App.jsx`; Create `src/mentor/MentorLogin.jsx`, `src/mentor/MentorPanel.jsx`.

- [ ] **4.1 RPC `mentor_get_me(p_token)`** — valida `mentor_session_owner`; retorna `{ mentor:{id,name,email,team_id}, team:{...entregáveis...} | null }` (team via join em `teams` por `mentor.team_id`). Notas entram na Fase 5.

- [ ] **4.2 `MentorLogin.jsx`** — espelha `ParticipantLogin`: campos email + código (4 dígitos, `inputMode="numeric"`, maxLength 4); chama `auth.login`; mensagens de erro/lockout.

- [ ] **4.3 `MentorPanel.jsx`** — header (nome do mentor + equipe pareada + Sair); se sem equipe vinculada → aviso "aguarde o pareamento"; senão mostra membros (de `team`... nota: `mentor_get_me` deve incluir membros — adicionar `team.members` no RPC) e os 4 entregáveis em **modo leitura** (reusar os componentes da Fase 2 com `readOnly`, alimentados por `auth.me.team`). Ajuste: os componentes de entregável leem de `auth.team`; para o mentor, adaptar para aceitar `team` por prop (refactor leve: componente recebe `team` + `onSave` opcional; quando `readOnly`, sem save).

- [ ] **4.4 Rota `#mentor`:** em `App.jsx` adicionar roteamento `#mentor`/`#mentor-login` (espelha `#participante`): instanciar `useMentorAuth`, renderizar `MentorLogin` ou `MentorPanel`.

- [ ] **4.5 Commit:**
```bash
npm run lint && npm run build
git add -A && git commit -m "feat(mentor): login route and panel with read-only deliverables"
```
Manual: criar mentor via SQL temporário (ou aguardar Fase 6); logar; ver equipe + entregáveis.

---

## Fase 5 — Ponderações por fase

**Files:** Modify `supabase-setup.sql`/migração, `src/mentor/MentorPanel.jsx`, `src/participant/DeliverablesSection.jsx`; Create `src/mentor/MentorNotes.jsx`.

- [ ] **5.1 Tabela `mentor_notes`** (DDL do spec) + RLS (admin/viewer SELECT; sem anon). 

- [ ] **5.2 RPCs:** `mentor_save_note(p_token,p_phase,p_body,p_is_public,p_note_id)` (valida `mentor_session_owner`; resolve team_id do mentor; se `p_note_id` edita nota própria, senão insere; `phase` na whitelist), `mentor_delete_note(p_token,p_note_id)` (só autor). Estender `mentor_get_me` para incluir `notes` (todas da equipe do mentor, ordenadas por fase/created_at).

- [ ] **5.3 Estender `participant_get_me`** — adicionar ao objeto `team`: `'public_notes', (SELECT json_agg(... ORDER BY created_at) FROM mentor_notes WHERE team_id=v_reg.team_id AND is_public=true)` agrupável por fase no front.

- [ ] **5.4 `MentorNotes.jsx`** — por fase (3 seções): lista notas existentes (badge público/privado) + form (textarea + toggle público/privado + salvar via `mentor_save_note`); editar/excluir as próprias. Integrar no `MentorPanel`.

- [ ] **5.5 Comentários públicos na equipe** — em `DeliverablesSection.jsx`, dentro de cada sub-aba de fase, seção read-only "Comentários do mentor" listando `auth.team.public_notes` daquela fase (vazio → nada).

- [ ] **5.6 Commit:**
```bash
npm run lint && npm run build
git add -A && git commit -m "feat(mentor): phase ponderations (public/private) + team-side public view"
```

---

## Fase 6 — Admin: cadastro de mentores

**Files:** Modify `supabase-setup.sql`/migração, `src/admin/AdminPanel.jsx`; Create `src/admin/AdminMentors.jsx`.

- [ ] **6.1 RPCs admin:** `admin_create_mentor(p_email,p_name,p_team_id)` (`SECURITY DEFINER`; `IF NOT is_admin() THEN RAISE`; gera código `lpad((floor(random()*10000))::text,4,'0')`; `INSERT INTO mentors(email,name,team_id,access_code_hash) VALUES (...,crypt(code,gen_salt('bf')))`; trata `unique_violation` em email; **retorna o código em claro**), `admin_reset_mentor_code(p_mentor_id)` (regenera, retorna código). `GRANT ... TO authenticated`.

- [ ] **6.2 `AdminMentors.jsx`** — form (email + nome + select de equipe a partir de `teams`); ao criar, exibe o código de 4 dígitos retornado com botão copiar e aviso "anote — não será exibido de novo"; lista mentores (`select id,email,name,team_id` — **nunca** `access_code_hash`) com equipe vinculada; ações: reatribuir equipe (`update mentors.team_id`), regenerar código, remover (`delete`). Respeitar `readOnly` (viewer).

- [ ] **6.3 Aba no `AdminPanel.jsx`** — adicionar `{ id:'mentors', label:'Mentores', icon:'🎓', adminOnly:true }` a `ALL_TABS`; render `{!readOnly && activeTab==='mentors' && <AdminMentors />}`.

- [ ] **6.4 Migração final + provisionamento:** garantir que `migrations/add_team_and_mentors.sql` contém tudo (Fases 1-6) idempotente e na ordem segura (schema → RLS → backfill → triggers → RPCs). Commit:
```bash
npm run lint && npm run build
git add -A && git commit -m "feat(admin): mentor management tab with 4-digit code generation"
```
Manual E2E: admin cria mentor (recebe código) → mentor loga (email+código) → vê equipe + entregáveis → escreve nota pública e privada → equipe vê só a pública; lockout após 10 erros.

---

## Self-Review

**Cobertura do spec:** A (Fase 1) ✓ · B (Fase 2) ✓ · C (Fase 3) ✓ · D (Fase 4) ✓ · E (Fase 5) ✓ · F (Fase 6) ✓. Roteamento (#mentor) Fase 4 ✓. Segurança (lockout, hash não exposto, RLS) Fases 3/6 ✓.

**Consistência de nomes:** colunas `hypotheses_canvas`/`slc_ia_canvas`/`learning_diary`/`final_deliverables` idênticas em 2.1/2.2/2.4. RPCs `participant_save_team_deliverable`, `mentor_login`/`mentor_get_me`/`mentor_save_note`, `admin_create_mentor`/`admin_reset_mentor_code` consistentes entre fases. `phase` ∈ {ignicao,construcao,apresentacao} em 5.1/5.2/5.4.

**Ajuste capturado:** `mentor_get_me` (4.1) deve incluir `team.members`; a Fase 5 estende o mesmo RPC com `notes`. Componentes de entregável (2.4) recebem `team` + `readOnly` para reuso pelo mentor (4.3).

**Sem placeholders:** SQL crítico completo; UI segue padrão EditProfile referenciado (campos explícitos por componente).
