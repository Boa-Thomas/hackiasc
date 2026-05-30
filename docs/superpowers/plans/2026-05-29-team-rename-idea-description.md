# Edição de nome de equipe + descrição da ideia — Plano de Implementação

> **Para workers agênticos:** implementar tarefa a tarefa. Steps usam checkbox (`- [ ]`).

**Goal:** Permitir que qualquer membro confirmado troque o nome da equipe e adicione uma descrição curta da ideia, visível em todos os portais + uma vitrine pública `#vitrine`.

**Architecture:** Coluna `teams.idea_description` + RPC `participant_update_team` (reusa o trigger `cascade_team_rename` para espelhar o nome nos membros). RPC anon `public_list_teams` alimenta a vitrine. Três RPCs de leitura passam a devolver `idea_description`.

**Tech Stack:** Supabase (Postgres, plpgsql, SECURITY DEFINER) + React 19/Vite. Sem framework de teste → verificação por `npm run build` + `npm run lint` + checagem manual.

**Estilo do repo:** aspas simples, sem ponto-e-vírgula, indent 2 espaços. Há um hook de formatação — após editar JS, conferir `git diff` e rodar lint.

---

### Task 1: Migration — coluna + RPCs

**Files:**

- Create: `migrations/team_idea_description.sql`

- [ ] **Step 1:** Criar `migrations/team_idea_description.sql` com:

```sql
-- Edição participante de nome de equipe + descrição da ideia + vitrine pública.

-- 1. Coluna nova
ALTER TABLE teams ADD COLUMN IF NOT EXISTS idea_description TEXT;

-- 2. RPC: qualquer membro confirmado edita nome + descrição da própria equipe
CREATE OR REPLACE FUNCTION participant_update_team(p_token UUID, p_team_name TEXT, p_idea_description TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_reg_id UUID;
  v_team_id UUID;
  v_clean_name TEXT;
  v_clean_idea TEXT;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);

  SELECT team_id INTO v_team_id FROM registrations WHERE id = v_reg_id;
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'not_in_team';
  END IF;

  v_clean_name := TRIM(COALESCE(p_team_name, ''));
  IF v_clean_name = '' OR length(v_clean_name) > 120 THEN
    RAISE EXCEPTION 'team_name_required';
  END IF;

  v_clean_idea := NULLIF(TRIM(COALESCE(p_idea_description, '')), '');
  IF v_clean_idea IS NOT NULL AND length(v_clean_idea) > 500 THEN
    RAISE EXCEPTION 'idea_too_long';
  END IF;

  UPDATE teams
  SET name = v_clean_name,
      idea_description = v_clean_idea,
      updated_at = now(),
      updated_by = v_reg_id
  WHERE id = v_team_id;

  RETURN true;
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'team_name_taken';
END;
$$;

GRANT EXECUTE ON FUNCTION participant_update_team(UUID, TEXT, TEXT) TO anon;

-- 3. RPC anon: vitrine pública (sem dados pessoais)
CREATE OR REPLACE FUNCTION public_list_teams()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result JSON;
BEGIN
  SELECT COALESCE(json_agg(json_build_object(
    'name', t.name,
    'idea_description', t.idea_description,
    'member_count', (
      SELECT COUNT(*)::INTEGER FROM registrations r
      WHERE r.team_id = t.id AND r.payment_status = 'confirmed'
    ),
    'economic_axes', COALESCE((
      SELECT json_agg(DISTINCT ax)
      FROM registrations r2, unnest(r2.economic_axes) AS ax
      WHERE r2.team_id = t.id AND r2.payment_status = 'confirmed'
    ), '[]'::json)
  ) ORDER BY t.name), '[]'::json)
  INTO v_result
  FROM teams t
  WHERE EXISTS (
    SELECT 1 FROM registrations r
    WHERE r.team_id = t.id AND r.payment_status = 'confirmed'
  );
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public_list_teams() TO anon;
```

- [ ] **Step 2:** No MESMO arquivo, anexar o `CREATE OR REPLACE` das 3 funções de leitura com `idea_description` adicionado (corpos completos — copiar de `participant_get_me` em `add_team_and_mentors.sql:411-518`, `participant_list_teams` em `supabase-setup.sql:753-780`, `mentor_serialize_me` em `mentor_teams_nn.sql:36-95`).

Mudanças exatas:

- `participant_get_me`: no `json_build_object` do `v_team`, adicionar `'idea_description', t.idea_description,` logo após `'name', t.name,`.
- `participant_list_teams`: no subselect interno adicionar coluna `(SELECT idea_description FROM teams WHERE name = r.team_name) AS idea_description`.
- `mentor_serialize_me`: no `json_build_object` do `t_obj`, adicionar `'idea_description', t.idea_description,` após `'id', t.id, 'name', t.name,`.

- [ ] **Step 3:** Aplicar no projeto remoto via MCP `mcp__plugin_supabase_supabase__apply_migration` (name: `team_idea_description`, query: conteúdo do arquivo).

- [ ] **Step 4:** Verificar: `SELECT public_list_teams();` retorna JSON array; `get_advisors` sem novos problemas de segurança.

- [ ] **Step 5:** Commit: `git add migrations/team_idea_description.sql && git commit -m "feat(db): coluna idea_description + RPCs participant_update_team/public_list_teams"`

---

### Task 2: Portal do participante — editar + exibir

**Files:**

- Modify: `src/participant/TeamSection.jsx`

- [ ] **Step 1:** Em `ERROR_LABELS` adicionar `idea_too_long: 'A descrição da ideia deve ter até 500 caracteres.',`.

- [ ] **Step 2:** Em `TeamSection`, ler `team` do `auth` (vem de `participant_get_me`) e passar `team` + `callRpc` + `refreshMe` + `flash` ao `CurrentTeamView`.

- [ ] **Step 3:** Em `CurrentTeamView`, adicionar estado `editOpen`, `editName`, `editIdea`; botão "Editar equipe" (qualquer membro) que abre painel inline com input nome (maxLength 120) + textarea descrição (maxLength 500, contador). Salvar chama `callRpc('participant_update_team', { p_team_name, p_idea_description })`; em sucesso `flash('Equipe atualizada.')` + `refreshMe()` + fechar.

- [ ] **Step 4:** Exibir `team.idea_description` no card (abaixo da contagem de integrantes) quando houver.

- [ ] **Step 5:** Em `NoTeamView`, no card de cada equipe da lista, exibir `t.idea_description` como subtítulo discreto quando houver.

- [ ] **Step 6:** `npm run lint` limpo; commit.

---

### Task 3: Portal do mentor — exibir descrição

**Files:**

- Modify: `src/mentor/MentorPanel.jsx` (após linha 103, dentro do card "Sua equipe")

- [ ] **Step 1:** Após o bloco `team.updated_by_name`, adicionar (leitura):

```jsx
{
  team.idea_description && (
    <div className="mt-3 rounded-xl border border-violet/20 bg-violet/5 px-4 py-3">
      <p className="text-[10px] font-mono uppercase tracking-wider text-violet/70 mb-1">
        Ideia
      </p>
      <p className="text-sm text-white/80 whitespace-pre-wrap">
        {team.idea_description}
      </p>
    </div>
  );
}
```

- [ ] **Step 2:** `npm run lint`; commit.

---

### Task 4: Admin — exibir descrição

**Files:**

- Modify: `src/admin/AdminTeams.jsx`

- [ ] **Step 1:** Em `fetchData`, adicionar ao `Promise.all` uma busca `supabase.from('teams').select('name, idea_description')`; guardar em estado `teamsMeta`.

- [ ] **Step 2:** Criar `const ideaByName = useMemo(() => Object.fromEntries((teamsMeta||[]).map(t => [t.name, t.idea_description])), [teamsMeta])`.

- [ ] **Step 3:** Passar `ideaDescription={ideaByName[name]}` ao `<TeamCard>` (linha ~1463) e, dentro do `TeamCard` (área expandida, após linha 788), renderizar bloco de leitura quando houver.

- [ ] **Step 4:** `npm run lint`; commit.

---

### Task 5: Vitrine pública `#vitrine`

**Files:**

- Create: `src/teams/TeamsShowcase.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1:** Criar `src/teams/TeamsShowcase.jsx` no estilo do `WallScreen` (`min-h-screen bg-dark bg-grid`, orbs, cabeçalho, grid de cards `card-glass`), busca `supabase.rpc('public_list_teams')`, polling 5s. Cada card: nome + descrição (ou placeholder "Ideia em construção…") + nº membros + chips de eixos.

- [ ] **Step 2:** Em `src/App.jsx`, importar `TeamsShowcase` e adicionar `if (page === '#vitrine') return <TeamsShowcase />` junto às rotas públicas (perto de `#telao`).

- [ ] **Step 3:** `npm run build` + `npm run lint` limpos; commit.

---

### Task 6: Verificação final

- [ ] `npm run build` e `npm run lint` limpos.
- [ ] Checagem manual: membro não-líder renomeia → cascata; descrição aparece em portal/browse/mentor/admin/`#vitrine`; nome duplicado → `team_name_taken`; descrição >500 bloqueada.
- [ ] Atualizar `CHANGELOG` se o padrão do repo exigir.
