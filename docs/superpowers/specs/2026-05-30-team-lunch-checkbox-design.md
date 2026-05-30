# Controle de almoço por equipe — design

**Data:** 2026-05-30
**Status:** Aprovado

## Objetivo

Permitir marcar, no painel admin, quais equipes já foram almoçar. Um único
checkbox por equipe (sem distinção de dia, sem rastreio por pessoa).

## Decisões (do brainstorming)

- **Posição:** no cabeçalho do card de cada time, na aba **Times** (sempre
  visível, sem precisar expandir).
- **Escopo:** controle único — um flag por equipe. Pode ser desmarcado
  manualmente para reuso.
- **Permissão:** `admin` e `visualização` (viewer). A role `staff` não enxerga
  a aba Times, então o operador do almoço usa um login viewer.

## Arquitetura

### Dados

Uma coluna nova em `teams`:

- `lunch_at timestamptz` — `NULL` = não almoçou; timestamp = almoçou (e
  _quando_, informação extra grátis vs. um boolean). O checkbox fica marcado
  quando `lunch_at IS NOT NULL`.

### Escrita (migration `add_team_lunch.sql`)

Viewers não têm `UPDATE` direto em `teams` (é assim que o painel os mantém
somente-leitura). Em vez de abrir a policy de UPDATE, uma RPC estreita:

- `set_team_lunch(p_team_id uuid, p_done boolean) RETURNS timestamptz`
- `SECURITY DEFINER`, `SET search_path = public`
- Gate: `IF NOT is_admin_or_viewer() THEN RAISE 'unauthorized'`
- `lunch_at = now()` quando `p_done`, `NULL` caso contrário; `RAISE
'team_not_found'` se o id não existir.
- `GRANT EXECUTE ... TO authenticated`; `REVOKE` de PUBLIC/anon.

Mesmo padrão de `wall_set_phase` (RPC gated por role).

### Leitura

`AdminTeams.fetchData()` já carrega `teams (name, idea_description)`; passa a
incluir `lunch_at`. O estado é mapeado por nome do time (como `idea`) e
repassado ao `TeamCard` via prop `lunchAt`.

### UI

- Novo componente `LunchToggle` renderizado como **irmão** do botão de
  expandir no cabeçalho (não aninhado — evita button-dentro-de-button e
  propagação de clique). Estilo `cyan` quando marcado, com `e.stopPropagation()`
  para não expandir o card ao clicar.
- O clique chama `actions.toggleLunch(teamName, done)`, que resolve o
  `team_id` pelo primeiro membro e chama a RPC. Atualização **otimista** do
  estado local (reverte em erro) — almoço é clique de alta frequência, sem
  refetch por clique.
- **Não** é gated por `readOnly`, então viewers usam normalmente.
- Registra `audit('team.set_lunch')` (best-effort; falha em viewer é inócua
  porque `audit()` nunca lança).

### Stat

Tile compacto "Almoçaram N/total" no grid de estatísticas existente (de 5
para 6 tiles).

## Fora de escopo (YAGNI)

Almoço por dia, jantar/café, rastreio por pessoa, botão "resetar todos".
