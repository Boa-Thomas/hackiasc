# Matching ciente de check-in — design

- **Date:** 2026-05-30
- **Status:** approved
- **Area:** `src/admin/AdminTeams.jsx` → `MatchingSuggestions`

## Problema

O painel "Sugestões de matching" monta a lista de "buscando time" só por
`inscription_modality === 'individual_form_team'` (+ `payment_status` e o toggle
global "só confirmados"). **Não considera check-in** — a query nem traz
`checked_in_at`. No dia do evento isso sugere para os times gente que pagou mas
não está presente, gerando match desperdiçado. Pago ≠ presente.

## Solução (opção B — todos visíveis, com presença explícita)

1. **Dado:** adicionar `checked_in_at` ao `select` de `registrations`. Admin/staff
   já leem essa coluna na tela de check-in → sem migração, sem mudança de RLS.
2. **Badge por pessoa** (nas duas seções, "Matches por perfil" e "Sem match ideal"):
   `presente` (cyan) quando `checked_in_at`; `não chegou` (apagado) quando `null`.
3. **Toggle "Só presentes"** no header do painel, **default ligado**. Ligado →
   filtra os "buscando time" para só quem tem check-in; as sugestões e o
   "sem match ideal" encolhem junto. O header mostra
   `{presentes} presentes · {total} buscando time` para nunca perder o total.
4. **Guard do early-return** passa a usar `allSeeking` (lista completa, sem filtro)
   para o painel não sumir quando o filtro de presença esvazia a lista.

## Escopo / não-objetivos

- 1 arquivo, estado local no painel (`useState`). Compõe com o toggle global
  "só confirmados" como filtro independente.
- Não altera o fluxo de check-in (RPC `set_checkin`) nem a tela `AdminCheckin`.

## Verificação

- `npm run build` e `npm run lint` limpos.
- Manual: alternar o toggle e conferir contagem do header + badges nas duas seções.
