# Design — Associação mentor↔equipe como N:N

**Data:** 2026-05-29
**Status:** aprovado (aguardando revisão do spec)

## Problema

Hoje a relação mentor↔equipe é 1:N: a tabela `mentors` tem uma coluna
`team_id` única, então cada mentor é pareado a **uma** equipe. Uma equipe já
pode ter vários mentores (várias linhas em `mentors` apontando para o mesmo
`team_id`), mas um mentor **não** pode acompanhar mais de uma equipe.

A organização precisa que um mentor possa acompanhar **várias** equipes — ou
seja, a associação passa a ser N:N.

## Decisões

- **Modelo:** tabela de junção `mentor_teams(mentor_id, team_id)`; a coluna
  `mentors.team_id` é removida após backfill (abordagem canônica, com
  integridade referencial e RLS limpa).
- **Portal do mentor:** quando o mentor tem várias equipes, um **seletor de
  equipe** (dropdown/abas) no topo escolhe a equipe ativa; entregáveis e
  ponderações passam a ser escopados pela equipe selecionada. Uma equipe por
  vez.
- **Admin:** cada linha de mentor ganha um **multi-select de equipes**
  (chips/checklist); marcar/desmarcar insere/remove linhas em `mentor_teams`.
- **Notas ao desparear:** remover a associação mentor↔equipe **mantém** as notas
  daquele mentor para aquela equipe (não há cascade do `mentor_teams` para
  `mentor_notes`). Reassociar restaura o acesso. (Default; revisar se preferir
  apagar as notas no despareamento.)

## Modelo de dados

### Nova tabela `mentor_teams`

```sql
CREATE TABLE IF NOT EXISTS mentor_teams (
  mentor_id UUID NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
  team_id   UUID NOT NULL REFERENCES teams(id)   ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mentor_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_mentor_teams_team   ON mentor_teams(team_id);
CREATE INDEX IF NOT EXISTS idx_mentor_teams_mentor ON mentor_teams(mentor_id);

ALTER TABLE mentor_teams ENABLE ROW LEVEL SECURITY;

-- Admin/viewer leem; admin gerencia (mesmo molde das policies de `mentors`).
CREATE POLICY "Admin can read mentor teams" ON mentor_teams
  FOR SELECT TO authenticated USING (is_admin_or_viewer());
CREATE POLICY "Admin can manage mentor teams" ON mentor_teams
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
```

### Backfill + drop da coluna antiga

```sql
INSERT INTO mentor_teams (mentor_id, team_id)
  SELECT id, team_id FROM mentors WHERE team_id IS NOT NULL
  ON CONFLICT DO NOTHING;

ALTER TABLE mentors DROP COLUMN team_id;
```

### `mentor_notes` — inalterada

Já é chaveada por `(team_id, mentor_id)`. As notas existentes continuam
válidas. A view de equipes que expõe notas públicas
(`mentor_notes ... WHERE is_public = true`) não muda.

## RPCs (Postgres)

Todas mantêm `SECURITY DEFINER` e o padrão de sessão de mentor já existente.

- **`mentor_get_me(p_token)`** e **`mentor_get_me_by_token(p_access_token)`**
  - Antes: retornavam um único objeto `team` + `notes` daquela equipe.
  - Depois: retornam `teams: [ <objeto completo da equipe: members +
deliverables + meta>, ... ]` (ordenado por nome) e `notes: [...]` com as
    notas **deste mentor** em **todas** as suas equipes (cada nota já carrega
    `team_id`, então o cliente filtra por equipe ativa).
  - As equipes vêm de `mentor_teams` (join), não mais de `mentors.team_id`.
  - O bloco `mentor` do payload deixa de expor `team_id`.

- **`mentor_save_note(p_token, p_phase, p_body, p_is_public, p_note_id, p_team_id)`**
  - Novo parâmetro `p_team_id`.
  - Valida que o mentor está associado àquela equipe via
    `EXISTS (SELECT 1 FROM mentor_teams WHERE mentor_id = v_mentor_id AND team_id = p_team_id)`;
    caso contrário, `RAISE EXCEPTION 'not_paired'`.
  - No INSERT/UPDATE usa `p_team_id` no lugar do antigo `mentors.team_id`.
  - `mentor_delete_note` permanece como está (filtra por `note_id` + autor).

- **`admin_create_mentor(p_email, p_name)`**
  - Remove `p_team_id`. Cria só o mentor + código. As equipes são atribuídas
    em seguida como linhas em `mentor_teams` (cliente admin escreve direto sob
    RLS, mesmo padrão do atual `reassign`).

## Frontend

### `src/mentor/useMentorAuth.js`

- Expor `teams` (array) e `notes`; remover o singular `team`.
- `isAuthenticated` e fluxo de login/refresh inalterados.

### `src/mentor/MentorPanel.jsx`

- Adicionar **seletor de equipe** (dropdown ou abas) quando `teams.length > 1`;
  estado `activeTeamId` (default: primeira equipe). Com uma equipe só, mostra
  direto sem seletor.
- Entregáveis (Canvas/Diário/Finais) e o bloco "Minhas ponderações" passam a ler
  a equipe ativa; `MentorNotes` filtra `auth.notes` por `team_id` da equipe ativa
  e passa esse `team_id` ao salvar.
- Estado vazio "Aguardando pareamento" quando `teams` está vazio.

### `src/admin/AdminMentors.jsx`

- Buscar também as linhas de `mentor_teams` (ou um agregado `team_ids` por
  mentor).
- Cada linha de mentor: **multi-select / chips** de equipes; marcar →
  `insert` em `mentor_teams`, desmarcar → `delete`. Substitui o `<select>`
  de equipe única e a função `reassign`.
- Form de criação: seletor de equipe vira multi-select opcional; ao criar,
  insere o mentor e depois as linhas de `mentor_teams`.
- Manter o resumo "Equipes com co-mentoria", agora derivado da junção.

## Ordem de implementação / risco

1. Migration SQL: cria `mentor_teams`, backfill, dropa `mentors.team_id`.
2. Atualiza as RPCs (`mentor_get_me`, `mentor_get_me_by_token`,
   `mentor_save_note`, `admin_create_mentor`) para ler/escrever a junção.
3. Atualiza frontend (`useMentorAuth`, `MentorPanel`, `AdminMentors`).
4. Atualiza `supabase-setup.sql` (fonte canônica do schema) para refletir o
   estado final.

É uma mudança de schema com quebra (dropa coluna), então SQL + RPCs + frontend
precisam ir juntos. Não há testes automatizados nessa área; verificação por
`npm run lint` + `npm run build` e checklist manual:

- Admin atribui 2 equipes a um mentor; remove uma.
- Mentor faz login (código e link), alterna entre equipes, salva uma nota
  pública e uma privada em cada equipe.
- Nota privada só aparece para a organização; pública aparece para a equipe.
- Mentor sem equipe vê o estado "aguardando pareamento".

## Fora de escopo (YAGNI)

- Equipe "primária" / ordenação manual de equipes do mentor.
- Notificações ao parear/desparear.
- Migração de notas ao desparear (decisão: manter).
