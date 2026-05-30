# Admin edita descrição do time + placeholder convidativo

**Data:** 2026-05-30
**Status:** Aprovado

## Problema

1. No painel admin a descrição da solução de cada time (`teams.idea_description`)
   aparece somente em modo leitura. O admin não consegue editá-la.
2. Times que nunca abriram "Editar equipe" não percebem que existe um espaço para
   descrever a solução — o campo simplesmente não aparece quando está vazio.

## Objetivo

- Permitir que o admin edite a descrição de qualquer time.
- Mostrar, onde a descrição está vazia, um convite esmaecido
  _"Coloque aqui a descrição da sua solução"_ para que os participantes entendam
  que aquele espaço é deles para preencher.

## Não-objetivos

- Sem migração de banco: a coluna `teams.idea_description` já existe e o papel
  `authenticated` (admin) já tem `UPDATE` em `teams` — é assim que o rename de
  time funciona hoje.
- Sem RPC novo.
- O placeholder **não** aparece na vitrine pública (`TeamsShowcase`). Ele é apenas
  uma dica de UI; nunca é gravado no banco.

## Decisões de design

- **Placeholder é dica visual, não dado.** Nunca persiste em `idea_description`.
  Some assim que houver descrição real. Evita poluir a vitrine pública e mantém a
  sanitização existente (vazio → `NULL`).
- **No admin, edição de descrição é um botão/modal separado** de "Editar nome"
  (não foram unificados), conforme preferência do usuário.

## Mudanças

### `src/admin/AdminTeams.jsx`

- **`EditIdeaModal` (novo componente):** `<textarea>` com `maxLength={500}` e
  contador `n/500`; botões Cancelar/Salvar. Pré-preenchido com a descrição atual.
  Placeholder do textarea: _"Coloque aqui a descrição da sua solução"_.
- **Botão "Editar descrição"** na fileira de ações do `TeamCard`, dentro do bloco
  `!readOnly`, ao lado de "Editar nome".
- **Estado `editIdeaTarget`** (`{ teamName, idea }`) e handler `updateTeamIdea`:
  - Resolve `team_id` via `teamsMap[teamName]?.[0]?.team_id` (mesmo caminho do
    rename). Se faltar, mostra o mesmo erro do rename.
  - Sanitiza igual à RPC `participant_update_team`: `trim`, string vazia → `null`,
    rejeita > 500.
  - `supabase.from('teams').update({ idea_description: clean }).eq('id', teamId)`.
  - `audit({ action: 'team.update_idea', actorType: 'admin', targetTable: 'teams',
targetId: teamId, oldData: { idea_description: <antigo> },
newData: { idea_description: clean } })`.
  - Fecha o modal e dá `fetchData()`.
  - Exposto em `actions.openEditIdea`.
- **Caixa "Ideia" do card:** quando `idea` está vazia, em vez de não renderizar
  nada, mostra um texto esmaecido _"Sem descrição — clique em 'Editar descrição'"_
  para sinalizar ao admin quais times faltam.

### `src/participant/TeamSection.jsx` (`CurrentTeamView`)

- Quando `team?.idea_description` está vazio, trocar o "nada" atual por um bloco
  esmaecido (ícone 📝) com _"Coloque aqui a descrição da sua solução — clique em
  'Editar equipe' para preencher"_. Visível a qualquer membro confirmado (que já é
  quem pode editar). Some quando houver descrição.
- Atualizar o placeholder do `<textarea>` de edição de
  _"Em uma ou duas frases, qual é a ideia da equipe?"_ para
  _"Coloque aqui a descrição da sua solução"_.

## Fluxo de dados (admin)

`Editar descrição` → `EditIdeaModal` → `updateTeamIdea(teamName, idea)` →
`teams.update({ idea_description })` por `team_id` → `audit` → `fetchData()`.

## Arquivos tocados

- `src/admin/AdminTeams.jsx`
- `src/participant/TeamSection.jsx`

## Testes / verificação

- Sem suíte automatizada para esses componentes hoje. Verificação:
  `npm run build` e `npm run lint` passam; revisão manual do diff. Smoke manual
  opcional no admin (editar/limpar descrição) e no painel do participante (ver
  placeholder com descrição vazia e seu desaparecimento após preencher).
