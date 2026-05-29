# Associação mentor↔equipe N:N — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que um mentor acompanhe várias equipes (e uma equipe vários mentores) — associação N:N via tabela de junção.

**Architecture:** Nova tabela `mentor_teams(mentor_id, team_id)` substitui a coluna única `mentors.team_id` (backfill + drop). O serializer `mentor_serialize_me` passa a devolver `teams: [...]`; `mentor_save_note` recebe `p_team_id` e valida a associação; `admin_create_mentor` não recebe mais equipe. No frontend, o portal do mentor ganha um seletor de equipe (uma por vez) e o admin ganha multi-select de equipes por mentor. Reusa toda a auth/RLS atuais.

**Tech Stack:** Supabase (Postgres RPC SECURITY DEFINER), React 19 + Vite, Tailwind v4.

---

## Tooling note (IMPORTANTE)

Hook global de auto-format roda Prettier (aspas duplas + `;`) a cada `Edit`/`Write` em JS/JSX — este repo usa **aspas simples, sem `;`**. Para `.jsx`/`.js`, aplique mudanças via **Node script no Bash** (`fs.writeFileSync` / replace exato), e confira com `git diff --stat` que só as linhas/arquivos pretendidos mudaram. Markdown e SQL **não** são afetados (use Write normalmente).

Os arquivos do frontend usam **LF**. Ao escrever com `fs.writeFileSync`, não converta para CRLF.

## Schema: NÃO editar `supabase-setup.sql`

O estado real do banco = `supabase-setup.sql` + migrations aplicadas em ordem. As funções `mentor_serialize_me` / `mentor_get_me_by_token` / `deliverable_meta` só existem em migrations (`add_mentor_access_token.sql`, `add_deliverable_meta.sql`), não em `supabase-setup.sql`. Editar `setup.sql` para dropar `team_id` quebraria essas migrations intermediárias (que ainda leem `team_id`). Portanto a entrega é **uma nova migration** que dropa `team_id` no fim da cadeia. Não tocar em `setup.sql`.

## File Structure

- **Create** `migrations/mentor_teams_nn.sql` — tabela `mentor_teams` + RLS, backfill, re-CREATE de `mentor_serialize_me` (teams array), DROP+CREATE de `mentor_save_note` (novo `p_team_id`) e `admin_create_mentor` (sem equipe), e por fim `DROP COLUMN mentors.team_id`.
- **Modify** `src/mentor/useMentorAuth.js` — expõe `teams` (array) no lugar de `team`.
- **Modify** `src/mentor/MentorPanel.jsx` — seletor de equipe; entregáveis/notas escopados à equipe ativa.
- **Modify** `src/mentor/MentorNotes.jsx` — passa `p_team_id` ao salvar.
- **Modify** `src/admin/AdminMentors.jsx` — multi-select de equipes por mentor (junção).
- **Create** `docs/changelog/2026-05-29-mentor-team-nn.md` — changelog.

**Ordem:** Task 1 (migration) deve ser **aplicada no banco junto com o deploy do frontend** — é mudança com quebra (dropa coluna e troca assinatura de RPC). Tasks 2-5 (frontend) podem ser escritas antes; aplicar SQL + deploy no fim (Task 7).

---

## Task 1: Migration `mentor_teams_nn.sql`

**Files:**

- Create: `migrations/mentor_teams_nn.sql`

- [ ] **Step 1: Criar o arquivo com o SQL completo abaixo**

```sql
-- ============================================================
-- MIGRACAO: Associacao mentor<->equipe N:N
-- ============================================================
-- Aplique no Supabase SQL Editor (ou via MCP apply_migration) num banco JA
-- POPULADO, JUNTO com o deploy do frontend novo. Mudanca COM QUEBRA: dropa
-- mentors.team_id e troca a assinatura de mentor_save_note/admin_create_mentor.

-- 1) Tabela de juncao ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS mentor_teams (
  mentor_id UUID NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
  team_id   UUID NOT NULL REFERENCES teams(id)   ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mentor_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_mentor_teams_team   ON mentor_teams(team_id);
CREATE INDEX IF NOT EXISTS idx_mentor_teams_mentor ON mentor_teams(mentor_id);

ALTER TABLE mentor_teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin can read mentor teams" ON mentor_teams;
CREATE POLICY "Admin can read mentor teams" ON mentor_teams
  FOR SELECT TO authenticated USING (is_admin_or_viewer());
DROP POLICY IF EXISTS "Admin can manage mentor teams" ON mentor_teams;
CREATE POLICY "Admin can manage mentor teams" ON mentor_teams
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- 2) Backfill a partir da coluna antiga (idempotente) -------------------------
INSERT INTO mentor_teams (mentor_id, team_id)
  SELECT id, team_id FROM mentors WHERE team_id IS NOT NULL
  ON CONFLICT DO NOTHING;

-- 3) Serializer: agora devolve `teams: [...]` (cada equipe = mesmo objeto de
--    antes, incluindo deliverable_meta) + `notes` de TODAS as equipes do mentor
--    (cada nota carrega team_id p/ o frontend filtrar). Bloco `mentor` nao expoe
--    mais team_id. Os RPCs mentor_get_me / mentor_get_me_by_token nao mudam:
--    eles ja delegam a este serializer.
CREATE OR REPLACE FUNCTION mentor_serialize_me(p_mentor_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_mentor RECORD;
  v_teams JSON;
BEGIN
  SELECT id, name, email INTO v_mentor FROM mentors WHERE id = p_mentor_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(json_agg(t_obj ORDER BY t_name), '[]'::json) INTO v_teams
  FROM (
    SELECT t.name AS t_name, json_build_object(
      'id', t.id, 'name', t.name,
      'hypotheses_canvas', t.hypotheses_canvas,
      'slc_ia_canvas', t.slc_ia_canvas,
      'learning_diary', t.learning_diary,
      'final_deliverables', t.final_deliverables,
      'updated_at', t.updated_at,
      'updated_by_name', (SELECT full_name FROM registrations WHERE id = t.updated_by),
      'deliverable_meta', COALESCE((
        SELECT json_object_agg(dm.field, json_build_object(
          'updated_by_name', dm.updated_by_name, 'updated_at', dm.updated_at
        ))
        FROM team_deliverable_meta dm WHERE dm.team_id = t.id
      ), '{}'::json),
      'members', COALESCE((
        SELECT json_agg(json_build_object(
          'full_name', r.full_name, 'email', r.email,
          'is_team_leader', r.is_team_leader, 'occupation_type', r.occupation_type,
          'is_remote', r.is_remote
        ) ORDER BY r.is_team_leader DESC, r.created_at)
        FROM registrations r
        WHERE r.team_id = t.id AND r.payment_status <> 'cancelled'
      ), '[]'::json)
    ) AS t_obj
    FROM mentor_teams mt JOIN teams t ON t.id = mt.team_id
    WHERE mt.mentor_id = p_mentor_id
  ) sub;

  RETURN json_build_object(
    'mentor', json_build_object(
      'id', v_mentor.id, 'name', v_mentor.name, 'email', v_mentor.email
    ),
    'teams', v_teams,
    'notes', COALESCE((
      SELECT json_agg(json_build_object(
        'id', n.id, 'team_id', n.team_id, 'phase', n.phase, 'body', n.body,
        'is_public', n.is_public, 'updated_at', n.updated_at
      ) ORDER BY n.created_at)
      FROM mentor_notes n
      WHERE n.mentor_id = p_mentor_id
        AND EXISTS (
          SELECT 1 FROM mentor_teams mt
          WHERE mt.mentor_id = p_mentor_id AND mt.team_id = n.team_id
        )
    ), '[]'::json)
  );
END; $$;

-- 4) mentor_save_note: nova assinatura com p_team_id (valida a associacao).
--    A antiga (5 args) precisa ser DROPADA — CREATE OR REPLACE nao troca
--    assinatura, criaria um overload e o frontend antigo chamaria a errada.
DROP FUNCTION IF EXISTS mentor_save_note(UUID, TEXT, TEXT, BOOLEAN, UUID);
CREATE OR REPLACE FUNCTION mentor_save_note(
  p_token UUID, p_phase TEXT, p_body TEXT, p_is_public BOOLEAN,
  p_note_id UUID DEFAULT NULL, p_team_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_mentor_id UUID;
  v_note_id UUID;
BEGIN
  v_mentor_id := mentor_session_owner(p_token);
  IF p_phase NOT IN ('ignicao','construcao','apresentacao') THEN RAISE EXCEPTION 'invalid_phase'; END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN RAISE EXCEPTION 'empty_body'; END IF;
  IF length(p_body) > 5000 THEN RAISE EXCEPTION 'body_too_long'; END IF;
  IF p_team_id IS NULL THEN RAISE EXCEPTION 'team_required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM mentor_teams WHERE mentor_id = v_mentor_id AND team_id = p_team_id
  ) THEN RAISE EXCEPTION 'not_paired'; END IF;

  IF p_note_id IS NULL THEN
    INSERT INTO mentor_notes (team_id, mentor_id, phase, body, is_public)
    VALUES (p_team_id, v_mentor_id, p_phase, p_body, COALESCE(p_is_public, false))
    RETURNING id INTO v_note_id;
  ELSE
    UPDATE mentor_notes
    SET phase = p_phase, body = p_body, is_public = COALESCE(p_is_public, false), updated_at = now()
    WHERE id = p_note_id AND mentor_id = v_mentor_id
    RETURNING id INTO v_note_id;
    IF v_note_id IS NULL THEN RAISE EXCEPTION 'note_not_found'; END IF;
  END IF;
  RETURN v_note_id;
END; $$;
GRANT EXECUTE ON FUNCTION mentor_save_note(UUID, TEXT, TEXT, BOOLEAN, UUID, UUID) TO anon;

-- 5) admin_create_mentor: sem p_team_id (equipes sao atribuidas depois, como
--    linhas em mentor_teams pelo proprio admin). Dropa a assinatura antiga.
DROP FUNCTION IF EXISTS admin_create_mentor(TEXT, TEXT, UUID);
CREATE OR REPLACE FUNCTION admin_create_mentor(p_email TEXT, p_name TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_code TEXT; v_id UUID; v_rand BYTEA;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN RAISE EXCEPTION 'email_required'; END IF;
  v_rand := gen_random_bytes(4);
  v_code := lpad(((get_byte(v_rand,0)::bigint*16777216 + get_byte(v_rand,1)*65536 + get_byte(v_rand,2)*256 + get_byte(v_rand,3)) % 10000)::text, 4, '0');
  INSERT INTO mentors (email, name, access_code_hash)
  VALUES (LOWER(TRIM(p_email)), NULLIF(TRIM(COALESCE(p_name,'')),''), crypt(v_code, gen_salt('bf')))
  RETURNING id INTO v_id;
  RETURN json_build_object('id', v_id, 'code', v_code);
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'email_already_exists';
END; $$;
GRANT EXECUTE ON FUNCTION admin_create_mentor(TEXT, TEXT) TO authenticated;

-- 6) Dropa a coluna antiga (POR ULTIMO — serializer/save_note ja nao a usam) --
ALTER TABLE mentors DROP COLUMN IF EXISTS team_id;
```

- [ ] **Step 2: Validar o SQL localmente (sintaxe)**

Não há banco local; a verificação real é na aplicação (Task 7). Aqui, apenas reler o arquivo e conferir que:

- `mentor_serialize_me` devolve `'teams'` (não `'team'`) e cada nota tem `'team_id'`.
- `mentor_save_note` tem 6 parâmetros e o `GRANT ... TO anon` casa a nova assinatura.
- `DROP COLUMN ... team_id` é a última instrução.

- [ ] **Step 3: Commit**

```bash
git add migrations/mentor_teams_nn.sql
git commit -m "feat(db): migration mentor_teams N:N (junção + RPCs + drop team_id)"
```

---

## Task 2: `useMentorAuth.js` expõe `teams`

**Files:**

- Modify: `src/mentor/useMentorAuth.js:143`

- [ ] **Step 1: Aplicar o replace via Node (Bash)**

```bash
node -e "
const fs=require('fs');
const p='src/mentor/useMentorAuth.js';
let s=fs.readFileSync(p,'utf8');
const before=s;
s=s.replace('    team: me?.team ?? null,', '    teams: me?.teams ?? [],');
if(s===before) throw new Error('alvo nao encontrado');
fs.writeFileSync(p,s,'utf8');
console.log('ok');
"
```

- [ ] **Step 2: Conferir o diff**

Run: `git diff src/mentor/useMentorAuth.js`
Expected: uma única linha trocada (`team:` → `teams:`).

- [ ] **Step 3: Commit**

```bash
git add src/mentor/useMentorAuth.js
git commit -m "feat(mentor): auth expõe teams (array) p/ N:N"
```

---

## Task 3: `MentorPanel.jsx` com seletor de equipe

**Files:**

- Modify: `src/mentor/MentorPanel.jsx` (reescrita completa do arquivo)

- [ ] **Step 1: Reescrever o arquivo via Node (Bash heredoc)**

O conteúdo abaixo: importa o `useState` (já presente), troca `team` por `teams` + estado `activeTeamId`, deriva a equipe ativa, adiciona o seletor quando `teams.length > 1`, filtra notas por equipe e passa `teamId` ao `MentorNotes`. `MentorSlidesInfo` fica intacto.

```bash
cat > /tmp/MentorPanel.jsx <<'JSX'
import { useState } from 'react'
import { PHASES, HYPOTHESES_FIELDS, SLC_IA_FIELDS, FINAL_FIELDS, METHOD_PHASES } from '../participant/deliverableFields'
import DeliverableForm from '../participant/DeliverableForm'
import LearningDiary from '../participant/LearningDiary'
import MentorNotes from './MentorNotes'
import SectionMeta from '../participant/SectionMeta'
import { relativeTime } from '../lib/relativeTime'

export default function MentorPanel({ auth }) {
  const { mentor, teams } = auth
  const [sub, setSub] = useState('hypotheses')
  const [activeTeamId, setActiveTeamId] = useState(null)

  // Equipe ativa: a selecionada, senão a primeira. teams vem ordenado por nome.
  const team = teams.find(t => t.id === activeTeamId) ?? teams[0] ?? null
  const meta = team?.deliverable_meta
  // Notas só da equipe ativa (auth.notes traz todas as equipes do mentor).
  const teamNotes = (auth.notes || []).filter(n => n.team_id === team?.id)

  return (
    <div className="min-h-screen bg-dark text-white bg-grid">
      <div className="orb w-[500px] h-[500px] bg-violet/5 -top-40 -right-40 pointer-events-none" />

      <header className="sticky top-0 z-20 bg-dark/80 backdrop-blur border-b border-dark-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="#" onClick={(e) => { e.preventDefault(); window.location.hash = '' }} className="font-mono text-lg font-bold tracking-tight">
              <span className="text-cyan">{'>'}</span>
              <span className="text-white">hack</span>
              <span className="text-gradient-cyan">IA</span>
              <span className="text-text-muted">.sc</span>
            </a>
            <span className="hidden sm:inline-block text-text-muted text-xs font-mono uppercase tracking-wider">/ Painel do Mentor</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm text-white truncate max-w-[200px]">{mentor?.name || mentor?.email}</p>
              <p className="text-xs text-text-muted truncate max-w-[200px]">{mentor?.email}</p>
            </div>
            <button
              onClick={() => { window.location.hash = '#mentor-guia' }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-violet/30 bg-violet/10 text-violet hover:bg-violet/20 transition-colors whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
              <span className="hidden sm:inline">Guia do Mentor</span>
              <span className="sm:hidden">Guia</span>
            </button>
            <button onClick={auth.logout} className="px-3 py-1.5 text-sm rounded-lg border border-dark-border text-text-muted hover:text-white hover:border-text-muted transition-colors">
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {teams.length === 0 ? (
          <div className="card-glass rounded-2xl p-6">
            <p className="text-xs font-mono text-violet uppercase tracking-wider mb-2">Aguardando pareamento</p>
            <h1 className="text-xl font-bold">Você ainda não foi pareado a uma equipe</h1>
            <p className="text-sm text-text-muted mt-2">
              A organização fará o pareamento mentor↔equipe. Assim que sua equipe for definida, ela aparecerá aqui com os entregáveis e o espaço de ponderações.
            </p>
          </div>
        ) : (
          <>
            {teams.length > 1 && (
              <div className="card-glass rounded-2xl p-4">
                <p className="text-xs font-mono text-violet uppercase tracking-wider mb-2">Suas equipes ({teams.length})</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {teams.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setActiveTeamId(t.id)}
                      className={`px-4 py-2 rounded-xl border whitespace-nowrap transition-all ${
                        team?.id === t.id
                          ? 'border-violet/50 bg-violet/15 text-white'
                          : 'border-dark-border bg-dark text-text-muted hover:text-white hover:border-text-muted'
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="card-glass rounded-2xl p-6">
              <p className="text-xs font-mono text-violet uppercase tracking-wider">Sua equipe</p>
              <h1 className="text-2xl font-bold mt-1">{team.name}</h1>
              <div className="mt-4 flex flex-wrap gap-2">
                {(team.members || []).map((m, i) => (
                  <span key={i} className="px-3 py-1 rounded-full text-xs bg-dark border border-dark-border text-text-muted">
                    {m.full_name}{m.is_team_leader ? ' · líder' : ''}{m.is_remote ? ' · remoto' : ''}
                  </span>
                ))}
              </div>
              {team.updated_by_name && (
                <p className="text-xs text-text-muted mt-3">
                  Entregáveis · última edição por {team.updated_by_name} há {relativeTime(team.updated_at)}
                </p>
              )}
            </div>

            <div className="card-glass rounded-2xl p-4">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {PHASES.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSub(p.id)}
                    className={`flex flex-col items-start px-4 py-2 rounded-xl border transition-all whitespace-nowrap ${
                      sub === p.id
                        ? 'border-cyan/40 bg-cyan/10 text-cyan'
                        : 'border-dark-border bg-dark text-text-muted hover:text-white hover:border-text-muted'
                    }`}
                  >
                    <span className="text-[10px] font-mono uppercase opacity-70">{p.phase}</span>
                    <span className="text-sm font-semibold">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {sub === 'hypotheses' && <div className="space-y-2"><SectionMeta meta={meta} field="hypotheses_canvas" /><DeliverableForm readOnly eyebrow="Fase 1 · Ignição" title="Canvas de Hipóteses" fields={HYPOTHESES_FIELDS} value={team.hypotheses_canvas} /></div>}
            {sub === 'slc' && <div className="space-y-2"><SectionMeta meta={meta} field="slc_ia_canvas" /><DeliverableForm readOnly eyebrow="Fase 2 · Construção" title="Canvas SLC-IA" fields={SLC_IA_FIELDS} value={team.slc_ia_canvas} /></div>}
            {sub === 'diary' && <div className="space-y-2"><SectionMeta meta={meta} field="learning_diary" /><LearningDiary readOnly value={team.learning_diary} /></div>}
            {sub === 'final' && <div className="space-y-2"><SectionMeta meta={meta} field="final_deliverables" /><DeliverableForm readOnly eyebrow="Fase 3 · Apresentação" title="Entregas finais" fields={FINAL_FIELDS} value={team.final_deliverables} gridClass="grid grid-cols-1 sm:grid-cols-2 gap-4"
              renderField={(f, ctx) => f.type === 'file-pdf' ? <MentorSlidesInfo deliverables={ctx.value} /> : null} /></div>}

            <div className="card-glass rounded-2xl p-6 space-y-4">
              <div>
                <p className="text-xs font-mono text-violet uppercase tracking-wider">Minhas ponderações</p>
                <h3 className="text-lg font-bold text-white mt-1">Acompanhamento por fase</h3>
                <p className="text-sm text-text-muted mt-1">
                  Ponderações privadas ficam visíveis só para a organização. As públicas aparecem para a equipe.
                </p>
              </div>
              {METHOD_PHASES.map(mp => (
                <MentorNotes key={`${team.id}-${mp.id}`} phase={mp.id} phaseLabel={mp.label} notes={teamNotes} teamId={team.id} auth={auth} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

// Slides do pitch (PDF). O mentor não baixa o arquivo: a edge function
// team-slides valida token de participante (não de mentor), e o storage só
// libera download para admin/equipe. Mostramos o status do envio e, se houver,
// o link antigo (slides_url) de equipes anteriores à migração de upload.
function MentorSlidesInfo({ deliverables }) {
  const data = deliverables || {}
  if (data.slides_path) {
    return (
      <p className="text-sm text-white/80">
        PDF enviado: <span className="font-semibold">{data.slides_name || 'slides.pdf'}</span>
        <span className="text-text-muted"> · download disponível para a organização e a equipe.</span>
      </p>
    )
  }
  if (data.slides_url) {
    return (
      <a href={data.slides_url} target="_blank" rel="noopener noreferrer" className="text-sm text-electric hover:underline break-all">
        {data.slides_url}
      </a>
    )
  }
  return <p className="text-sm text-text-muted">Nenhum slide enviado.</p>
}
JSX
node -e "const fs=require('fs');fs.copyFileSync('/tmp/MentorPanel.jsx','src/mentor/MentorPanel.jsx');console.log('ok')"
```

> Nota: o `key={`${team.id}-${mp.id}`}` em `MentorNotes` força o componente a remontar quando a equipe ativa muda — assim o formulário interno (rascunho/edição) reseta ao trocar de equipe.

- [ ] **Step 2: Conferir o diff**

Run: `git diff src/mentor/MentorPanel.jsx`
Expected: `team` → `teams` + estado/seletor; sem mudança em `MentorSlidesInfo`.

- [ ] **Step 3: Lint**

Run: `npx eslint src/mentor/MentorPanel.jsx`
Expected: exit 0, sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/mentor/MentorPanel.jsx
git commit -m "feat(mentor): seletor de equipe (N:N) no portal do mentor"
```

---

## Task 4: `MentorNotes.jsx` passa `p_team_id`

**Files:**

- Modify: `src/mentor/MentorNotes.jsx:6` e `:27-29`

- [ ] **Step 1: Aplicar os dois replaces via Node (Bash)**

```bash
node -e "
const fs=require('fs');
const p='src/mentor/MentorNotes.jsx';
let s=fs.readFileSync(p,'utf8');
const before=s;
s=s.replace(
  'export default function MentorNotes({ phase, phaseLabel, notes, auth }) {',
  'export default function MentorNotes({ phase, phaseLabel, notes, teamId, auth }) {'
);
s=s.replace(
  '      p_token: auth.token, p_phase: phase, p_body: body.trim(), p_is_public: isPublic, p_note_id: editingId,',
  '      p_token: auth.token, p_phase: phase, p_body: body.trim(), p_is_public: isPublic, p_note_id: editingId, p_team_id: teamId,'
);
if(s===before) throw new Error('nenhum alvo trocado');
fs.writeFileSync(p,s,'utf8');
console.log('ok');
"
```

- [ ] **Step 2: Conferir o diff**

Run: `git diff src/mentor/MentorNotes.jsx`
Expected: duas linhas — prop `teamId` adicionada e `p_team_id: teamId` no `rpc`.

- [ ] **Step 3: Commit**

```bash
git add src/mentor/MentorNotes.jsx
git commit -m "feat(mentor): MentorNotes envia p_team_id ao salvar ponderação"
```

---

## Task 5: `AdminMentors.jsx` com multi-select de equipes

**Files:**

- Modify: `src/admin/AdminMentors.jsx` (reescrita completa)

- [ ] **Step 1: Reescrever o arquivo via Node (Bash heredoc)**

Mudanças: busca `mentor_teams`; estado de criação vira `createTeamIds` (array); a célula de equipe da linha mostra chips das equipes atribuídas (com × p/ remover) + um `<select>` "＋ equipe" com as não atribuídas; `toggleTeam` faz insert/delete em `mentor_teams`. Some `team_id`/`reassign`. Mantém código gerado, links, reset/remover e o resumo de co-mentoria (agora via junção).

```bash
cat > /tmp/AdminMentors.jsx <<'JSX'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Link de acesso direto do mentor (sem login). Espelha a rota lida em
// useMentorAuth (#mentor?t=<access_token>, modo link).
const mentorLink = (token) => `${window.location.origin}/#mentor?t=${token}`

export default function AdminMentors({ readOnly = false }) {
  const [mentors, setMentors] = useState([])
  const [teams, setTeams] = useState([])
  const [links, setLinks] = useState([]) // linhas de mentor_teams: { mentor_id, team_id }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [createTeamIds, setCreateTeamIds] = useState([])
  const [creating, setCreating] = useState(false)
  const [generatedCode, setGeneratedCode] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [copiedAll, setCopiedAll] = useState(false)

  async function fetchData() {
    if (!supabase) { setError('Supabase não configurado.'); setLoading(false); return }
    setError(null)
    const [{ data: ms, error: mErr }, { data: ts, error: tErr }, { data: ls, error: lErr }] = await Promise.all([
      supabase.from('mentors').select('id, email, name, access_token').order('created_at', { ascending: true }),
      supabase.from('teams').select('id, name').order('name', { ascending: true }),
      supabase.from('mentor_teams').select('mentor_id, team_id'),
    ])
    if (mErr) setError(mErr.message)
    else if (tErr) setError(tErr.message)
    else if (lErr) setError(lErr.message)
    else { setMentors(ms ?? []); setTeams(ts ?? []); setLinks(ls ?? []) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, []) // eslint-disable-line react-hooks/set-state-in-effect

  const teamName = (id) => teams.find(t => t.id === id)?.name || '—'
  const mentorLabel = (m) => m.name || m.email

  // team_id[] por mentor e mentor[] por equipe, derivados da junção.
  const teamIdsByMentor = new Map()
  const mentorsByTeam = new Map()
  links.forEach(({ mentor_id, team_id }) => {
    const tids = teamIdsByMentor.get(mentor_id)
    if (tids) tids.push(team_id); else teamIdsByMentor.set(mentor_id, [team_id])
    const m = mentors.find(x => x.id === mentor_id)
    if (m) {
      const list = mentorsByTeam.get(team_id)
      if (list) list.push(m); else mentorsByTeam.set(team_id, [m])
    }
  })

  const mentorTeams = (mentorId) =>
    (teamIdsByMentor.get(mentorId) || [])
      .map(tid => teams.find(t => t.id === tid))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))

  const unassignedTeams = (mentorId) => {
    const assigned = new Set(teamIdsByMentor.get(mentorId) || [])
    return teams.filter(t => !assigned.has(t.id))
  }

  // Resumo dos mentores de uma equipe (exclui opcionalmente um), p/ co-mentoria.
  const teamMentorsSummary = (teamIdValue, excludeId = null) => {
    const list = (mentorsByTeam.get(teamIdValue) || []).filter(m => m.id !== excludeId)
    if (!list.length) return ''
    const names = list.map(mentorLabel)
    const shown = names.slice(0, 3).join(', ')
    const extra = names.length > 3 ? ` e mais ${names.length - 3}` : ''
    const word = list.length === 1 ? 'mentor' : 'mentores'
    return `${list.length} ${word}: ${shown}${extra}`
  }

  async function createMentor(e) {
    e.preventDefault()
    if (!supabase || !email.trim()) return
    setCreating(true); setGeneratedCode(null); setError(null)
    const { data, error: err } = await supabase.rpc('admin_create_mentor', {
      p_email: email.trim(), p_name: name.trim(),
    })
    if (err) {
      setCreating(false)
      setError(err.message?.includes('email_already_exists') ? 'Já existe mentor com esse email.' : `Erro: ${err.message}`)
      return
    }
    // Atribui as equipes selecionadas como linhas em mentor_teams.
    if (createTeamIds.length) {
      const rows = createTeamIds.map(tid => ({ mentor_id: data.id, team_id: tid }))
      const { error: linkErr } = await supabase.from('mentor_teams').insert(rows)
      if (linkErr) setError(`Mentor criado, mas falhou ao vincular equipes: ${linkErr.message}`)
    }
    setCreating(false)
    setGeneratedCode({ email: email.trim(), code: data.code })
    setEmail(''); setName(''); setCreateTeamIds([])
    await fetchData()
  }

  async function toggleTeam(mentorId, teamId, isAssigned) {
    if (!supabase) return
    const q = isAssigned
      ? supabase.from('mentor_teams').delete().eq('mentor_id', mentorId).eq('team_id', teamId)
      : supabase.from('mentor_teams').insert({ mentor_id: mentorId, team_id: teamId })
    const { error: err } = await q
    if (err) { alert(`Erro: ${err.message}`); return }
    await fetchData()
  }

  async function resetCode(id, mEmail) {
    if (!supabase || !window.confirm(`Gerar novo código para ${mEmail}?`)) return
    const { data, error: err } = await supabase.rpc('admin_reset_mentor_code', { p_mentor_id: id })
    if (err) { alert(`Erro: ${err.message}`); return }
    setGeneratedCode({ email: mEmail, code: data.code })
  }

  async function removeMentor(id, mEmail) {
    if (!supabase || !window.confirm(`Remover o mentor ${mEmail}?`)) return
    const { error: err } = await supabase.from('mentors').delete().eq('id', id)
    if (err) { alert(`Erro: ${err.message}`); return }
    await fetchData()
  }

  async function copyLink(m) {
    const link = mentorLink(m.access_token)
    try {
      await navigator.clipboard.writeText(link)
      setCopiedId(m.id)
      setTimeout(() => setCopiedId(null), 2500)
    } catch {
      window.prompt('Copie o link do mentor:', link)
    }
  }

  async function copyAllLinks() {
    if (!mentors.length) return
    const text = mentors.map(m => `${m.name || m.email}: ${mentorLink(m.access_token)}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 2500)
    } catch {
      window.prompt('Copie os links dos mentores:', text)
    }
  }

  if (loading) return <p className="text-white/60 font-mono">Carregando...</p>

  return (
    <div className="space-y-6">
      {error && <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2.5 text-hot text-sm">{error}</div>}

      {generatedCode && (
        <div className="bg-cyan/10 border border-cyan/30 rounded-xl px-4 py-3">
          <p className="text-sm text-white">
            Código de <strong>{generatedCode.email}</strong>:
            <span className="font-mono text-2xl text-cyan tracking-[0.3em] ml-3">{generatedCode.code}</span>
          </p>
          <p className="text-xs text-white/50 mt-1">
            Anote e repasse ao mentor — não será exibido de novo. O mentor entra em <span className="font-mono">/#mentor</span> com email + código.
          </p>
        </div>
      )}

      {!readOnly && (
        <form onSubmit={createMentor} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs text-white/60 mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50" placeholder="mentor@email.com" />
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">Nome</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50" placeholder="Nome do mentor" />
            </div>
            <button type="submit" disabled={creating || !email.trim()} className="px-4 py-2 rounded-lg text-sm font-semibold bg-cyan/20 text-cyan border border-cyan/40 hover:bg-cyan/30 disabled:opacity-50 disabled:cursor-not-allowed">
              {creating ? 'Criando...' : 'Adicionar mentor'}
            </button>
          </div>
          <div>
            <label className="block text-xs text-white/60 mb-1">Equipes (opcional)</label>
            <div className="flex flex-wrap gap-2 items-center">
              {createTeamIds.map(tid => (
                <span key={tid} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-violet/15 text-violet border border-violet/30">
                  {teamName(tid)}
                  <button type="button" onClick={() => setCreateTeamIds(ids => ids.filter(x => x !== tid))} className="hover:text-white">×</button>
                </span>
              ))}
              <select
                value=""
                onChange={e => { const v = e.target.value; if (v) setCreateTeamIds(ids => ids.includes(v) ? ids : [...ids, v]) }}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-cyan/50"
              >
                <option value="">＋ equipe</option>
                {teams.filter(t => !createTeamIds.includes(t.id)).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
        </form>
      )}

      {teams.some(t => (mentorsByTeam.get(t.id) || []).length > 1) && (
        <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
          <p className="text-xs text-white/60 uppercase tracking-wide mb-2">Equipes com co-mentoria</p>
          <ul className="space-y-1">
            {teams
              .filter(t => (mentorsByTeam.get(t.id) || []).length > 1)
              .map(t => (
                <li key={t.id} className="text-sm text-white/80">
                  <span className="text-white">{t.name}</span>
                  <span className="text-white/50"> — {teamMentorsSummary(t.id)}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {!readOnly && mentors.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={copyAllLinks}
            className="text-xs px-3 py-1.5 rounded-lg bg-cyan/10 text-cyan border border-cyan/30 hover:bg-cyan/20"
          >
            {copiedAll ? '✓ links copiados' : 'copiar todos os links'}
          </button>
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-white/60 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Mentor</th>
              <th className="text-left px-4 py-2">Equipes</th>
              {!readOnly && <th className="text-right px-4 py-2">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {mentors.map(m => {
              const assigned = mentorTeams(m.id)
              const free = unassignedTeams(m.id)
              return (
                <tr key={m.id} className="border-t border-white/5 align-top">
                  <td className="px-4 py-2">
                    <div className="text-white">{m.name || '—'}</div>
                    <div className="text-white/50 text-xs">{m.email}</div>
                  </td>
                  <td className="px-4 py-2">
                    {readOnly ? (
                      assigned.length ? assigned.map(t => t.name).join(', ') : '—'
                    ) : (
                      <div className="flex flex-wrap gap-2 items-center">
                        {assigned.map(t => (
                          <span key={t.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-violet/15 text-violet border border-violet/30">
                            {t.name}
                            <button onClick={() => toggleTeam(m.id, t.id, true)} className="hover:text-white" title="Remover equipe">×</button>
                          </span>
                        ))}
                        {free.length > 0 && (
                          <select
                            value=""
                            onChange={e => { if (e.target.value) toggleTeam(m.id, e.target.value, false) }}
                            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-cyan/50"
                          >
                            <option value="">＋ equipe</option>
                            {free.map(t => {
                              const summary = teamMentorsSummary(t.id, m.id)
                              return (
                                <option key={t.id} value={t.id}>
                                  {t.name}{summary ? ` — já tem ${summary}` : ''}
                                </option>
                              )
                            })}
                          </select>
                        )}
                        {!assigned.length && free.length === 0 && <span className="text-white/40 text-xs">sem equipes</span>}
                      </div>
                    )}
                  </td>
                  {!readOnly && (
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button onClick={() => copyLink(m)} className="text-xs text-cyan hover:underline mr-3">{copiedId === m.id ? '✓ copiado' : 'copiar link'}</button>
                      <button onClick={() => resetCode(m.id, m.email)} className="text-xs text-electric hover:underline mr-3">novo código</button>
                      <button onClick={() => removeMentor(m.id, m.email)} className="text-xs text-hot hover:underline">remover</button>
                    </td>
                  )}
                </tr>
              )
            })}
            {!mentors.length && (
              <tr><td colSpan={readOnly ? 2 : 3} className="px-4 py-6 text-center text-white/40">Nenhum mentor cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
JSX
node -e "const fs=require('fs');fs.copyFileSync('/tmp/AdminMentors.jsx','src/admin/AdminMentors.jsx');console.log('ok')"
```

- [ ] **Step 2: Conferir o diff e lint**

Run: `git diff --stat src/admin/AdminMentors.jsx && npx eslint src/admin/AdminMentors.jsx`
Expected: lint exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/admin/AdminMentors.jsx
git commit -m "feat(admin): multi-select de equipes por mentor (N:N)"
```

---

## Task 6: Changelog

**Files:**

- Create: `docs/changelog/2026-05-29-mentor-team-nn.md`

- [ ] **Step 1: Criar o changelog (Write normal — markdown não sofre auto-format danoso)**

```markdown
# Associação mentor↔equipe agora é N:N — 2026-05-29

A relação mentor↔equipe passou de 1:N (mentor com uma única equipe) para N:N.

## O que mudou

- **DB:** nova tabela `mentor_teams(mentor_id, team_id)`; backfill a partir de
  `mentors.team_id`; a coluna `mentors.team_id` foi removida.
- **RPCs:** `mentor_serialize_me` devolve `teams: [...]` (cada nota carrega
  `team_id`); `mentor_save_note` recebe `p_team_id` e valida a associação;
  `admin_create_mentor` não recebe mais equipe (atribuição é feita depois).
- **Portal do mentor:** seletor de equipe (uma por vez) quando o mentor tem
  mais de uma; entregáveis e ponderações escopados à equipe ativa.
- **Admin:** cada mentor tem multi-select de equipes (chips + adicionar/remover).

## Migração

Aplicar `migrations/mentor_teams_nn.sql` no Supabase **junto** com o deploy do
frontend — é mudança com quebra (dropa coluna e troca assinatura de RPC).
```

- [ ] **Step 2: Commit**

```bash
git add docs/changelog/2026-05-29-mentor-team-nn.md
git commit -m "docs(changelog): mentor↔equipe N:N"
```

---

## Task 7: Aplicar migration, build, deploy e verificação manual

**Files:** nenhum novo.

- [ ] **Step 1: Lint + build de tudo**

Run: `npm run lint && npm run build`
Expected: lint sem erros novos; build `✓ built`.

- [ ] **Step 2: Aplicar a migration no Supabase**

Aplicar `migrations/mentor_teams_nn.sql` no banco de produção — via Supabase SQL Editor (colar o conteúdo) ou via MCP `apply_migration` (name: `mentor_teams_nn`). **Fazer imediatamente antes/junto do push** (passo 3), pois é mudança com quebra.

Conferir no SQL Editor:

- `SELECT * FROM mentor_teams LIMIT 5;` → contém os pares migrados.
- `SELECT column_name FROM information_schema.columns WHERE table_name='mentors' AND column_name='team_id';` → 0 linhas (coluna removida).

- [ ] **Step 3: Deploy (push para master)**

```bash
git push origin master
```

Acompanhar: `gh run list --branch master --limit 1` até `completed/success`.

- [ ] **Step 4: Checklist manual (em produção, após deploy)**

- [ ] Admin → Mentores: criar mentor com 2 equipes; remover 1 equipe (chip ×); adicionar outra pelo `＋ equipe`. Resumo "co-mentoria" reflete a junção.
- [ ] Mentor (email+código **e** link `?t=`): com 2 equipes, o seletor aparece; alternar troca entregáveis e notas; com 1 equipe, sem seletor; com 0, "aguardando pareamento".
- [ ] Salvar uma ponderação **pública** e uma **privada** em cada equipe; trocar de equipe e confirmar que cada uma mostra só as suas notas.
- [ ] Participante da equipe vê a nota pública; não vê a privada.

---

## Self-Review (preenchido)

- **Cobertura do spec:** tabela de junção + backfill + drop (Task 1), RPCs serialize/save_note/create (Task 1), `useMentorAuth.teams` (Task 2), seletor no portal (Task 3), `p_team_id` no save (Task 4), multi-select admin (Task 5), notas mantidas no despareamento (decisão do spec — nenhum cascade de `mentor_teams` → `mentor_notes`; nada a implementar). ✓
- **Placeholders:** nenhum TODO/TBD; todo código completo. ✓
- **Consistência de tipos/nomes:** payload `teams` (RPC) ↔ `me.teams` (auth) ↔ `teams`/`activeTeamId` (MentorPanel); nota com `team_id` ↔ filtro `n.team_id === team.id`; `p_team_id` (RPC 6 args) ↔ `p_team_id: teamId` (MentorNotes) ↔ prop `teamId`; `mentor_teams(mentor_id, team_id)` ↔ selects/inserts/deletes em AdminMentors. ✓

```

```
