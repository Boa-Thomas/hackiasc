# Admin — Toggle global "Apenas confirmadas"

Data: 2026-05-29

## Objetivo

O painel admin deve ter um filtro único, no cabeçalho, que restringe as telas
a inscrições **confirmadas** (`payment_status = 'confirmed'`). Vale para todas as
telas que lidam com `registrations`.

## Decisões (aprovadas)

- **Abordagem:** um único toggle global no cabeçalho do `AdminPanel`. Não há
  filtro por tela.
- **Estado padrão:** LIGADO (só confirmadas) ao abrir o painel.
- **Persistência:** `localStorage` em `admin.confirmedOnly`.
- **Implementação:** filtro client-side sobre os dados já buscados
  (`r.payment_status === 'confirmed'`). Sem alterar as queries do Supabase, sem
  refetch, mantendo realtime e contagens existentes.

## Escopo por tela

| Tela                                                                    | Comportamento com toggle LIGADO                                                                                                                                                                                                              |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inscrições**                                                          | Lista base restrita a confirmadas. O dropdown de status (Pendente/Confirmado/Cancelado) é **escondido** enquanto ligado (reaparece quando desligado). Linha de stats segue mostrando "de N total".                                           |
| **Times**                                                               | `registrations` filtrado a confirmadas **antes** de agrupar em times. Resultado: só membros confirmados aparecem; barras de progresso refletem confirmados; **times sem nenhum membro confirmado somem**; individuais não confirmados somem. |
| **Dashboard**                                                           | **Inalterado.** Já possui seletor próprio de audiência (Confirmados/Ativos/Todos, padrão Confirmados). O toggle global não o sobrescreve.                                                                                                    |
| **Entregas**                                                            | **Inalterado.** Já conta apenas membros confirmados.                                                                                                                                                                                         |
| **Check-in**, **Muro de Dores**                                         | **Inalterado.** Já consultam `payment_status = 'confirmed'`.                                                                                                                                                                                 |
| **Financeiro, Ranking, Empresarial, Mentores, Jurados, Recursos, Logs** | **Fora de escopo** — domínios de dados distintos (transações MP, avaliações de jurados, pedidos corporativos), sem conceito de status de participante.                                                                                       |

- O toggle é **escondido** para os papéis `checkin` e `staff` (suas abas já são
  confirmed-only).

## Arquivos afetados

1. `src/admin/AdminPanel.jsx` — estado `confirmedOnly` (localStorage, default
   `true`), UI do toggle no cabeçalho (oculto p/ checkin/staff), passa a prop
   para `AdminRegistrations` e `AdminTeams`.
2. `src/admin/AdminRegistrations.jsx` — recebe `confirmedOnly`; pré-filtra a
   lista no memo `filtered`; esconde o `<select>` de status quando ligado.
3. `src/admin/AdminTeams.jsx` — recebe `confirmedOnly`; deriva `view` filtrada e
   alimenta o memo `teamsMap`/`individuals` a partir dela.

## Nota de implementação

Edições em JS/JSX devem ser aplicadas via **Bash** (script Node de replace
exato, preservando CRLF), pois o hook global de auto-format reformata
arquivos inteiros contra o estilo do repositório (aspas simples, sem ponto e
vírgula). Verificar com `git diff --stat` que só as linhas pretendidas mudaram.
