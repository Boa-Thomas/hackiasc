# Apelidos de equipe editáveis no admin — Design

**Data:** 2026-05-31
**Status:** Aprovado (design) — pronto para o plano de implementação
**Depende de:** feature "fase das equipes (Supabase externo)" (PR #230, em `master` commit `ac13ba1`)

## Contexto / problema

A integração de fase das equipes casa cada equipe externa (`kpcaokuqblutdkfdqwfg.teams`) com a equipe do HackIA por **nome normalizado + mapa de apelidos**. Hoje esse mapa (`TEAM_NAME_ALIASES`) é **hardcoded** em `src/lib/config.js`. Se a organização do painel externo **renomear** uma equipe durante o evento, o badge dela cai para "—" e a única forma de corrigir é editar o código e re-deployar.

**Objetivo:** permitir que o admin ajuste os apelidos **pelo painel**, sem mexer em código nem deployar.

## Decisões (confirmadas com o usuário)

| Decisão          | Escolha                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Modelo de UX     | **Tabela de apelidos editável** (pares "nome externo → nome daqui"), com autocomplete dos nomes reais nos dois campos (editável). |
| Local no admin   | Seção **"Fases das equipes"** do Facilitador (onde o rodapé de órfãs já aparece).                                                 |
| Armazenamento    | **Chave JSON em `app_settings`** (`team_phase_aliases`) + RPCs get/set. Sem tabela nova.                                          |
| Fonte de verdade | Banco. `config.js` `TEAM_NAME_ALIASES` vira **fallback offline** (usado só se a RPC falhar).                                      |

## Componentes

### 1. Migração `migrations/add_team_phase_aliases.sql` (aditiva — não altera objeto existente)

- **Seed**: `app_settings['team_phase_aliases']` com os 2 pares atuais, nomes de exibição crus:
  `[{"external":"byAItas","hackia":"bAItas"},{"external":"EasyAI IT Company","hackia":"EasyIA IT Company"}]`
- **`get_team_phase_aliases()`** → `jsonb`, `SECURITY DEFINER STABLE`, `SET search_path = public`, leitura aberta (espelha `get_team_scores_visible`):
  `SELECT COALESCE((SELECT value::jsonb FROM app_settings WHERE key='team_phase_aliases'), '[]'::jsonb)`
- **`set_team_phase_aliases(p_aliases jsonb)`** → `jsonb`, `SECURITY DEFINER`, `SET search_path = public`:
  - guarda `IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;`
  - valida: `p_aliases` é array; cada elemento tem `external` e `hackia` string não-vazias (após trim); tamanho ≤ 200.
  - upsert em `app_settings` (key `team_phase_aliases`, `value = p_aliases::text`, `updated_at = now()`).
  - retorna o JSON salvo.
- Grants: `EXECUTE` de `get` para `anon, authenticated`; de `set` para `authenticated` (admin verificado dentro).

### 2. `src/lib/teamPhases.js` — o mapa de apelidos vira parâmetro

- Novo `buildAliasMap(rawPairs)` → `{ [normalizeTeamName(external)]: normalizeTeamName(hackia) }` (ignora pares com lado vazio).
- `matchKey(name, aliasMap)` → usa o `aliasMap` recebido; default = `DEFAULT_ALIAS_MAP` (derivado do `config.TEAM_NAME_ALIASES`) como fallback.
- `mapExternalRows(rows, aliasMap)` e `findUnmatchedExternal(hackiaNames, externalList)` → encadeiam o `aliasMap`.
- `config.TEAM_NAME_ALIASES` permanece (fallback offline) — não é removido.

### 3. `src/hooks/useTeamPhases.js`

- Além do polling externo (20s), busca apelidos via `supabase.rpc('get_team_phase_aliases')` (client do HackIA) no mount e junto do poll de 20s (RPC barata).
- Constrói `aliasMap` a partir do banco; se a RPC falhar, usa o fallback do config.
- `getPhase` passa a usar o `aliasMap` corrente.
- Passa a expor: `{ getPhase, externalList, aliases, saveAliases, loading, error, lastUpdated }`.
  - `aliases`: array de pares crus `{external, hackia}` (estado atual do banco).
  - `saveAliases(pairs)`: `supabase.rpc('set_team_phase_aliases', { p_aliases: pairs })` e recarrega os apelidos.

### 4. `src/admin/TeamPhaseAliasesEditor.jsx` (novo)

- Tabela editável de pares: cada linha `[ externo ⌄ ] → [ daqui ⌄ ] [x]`.
  - Inputs com `<datalist>`: sugestões de `externalNames` (da `externalList`) e `hackiaNames` (os `names` do HackIA). Editável (texto livre permitido).
  - Linha "+ adicionar par".
  - Botão **Salvar** → `onSave(draft)`; estado de rascunho local; feedback salvando/erro/salvo.
- Props: `aliases`, `externalNames`, `hackiaNames`, `onSave`.
- Sem lógica de matching aqui — só edição/coleta dos pares.

### 5. `src/admin/AdminFacilitator.jsx` → seção `TeamPhases`

- Mantém a lista de fases + o rodapé de órfãs.
- Adiciona um toggle **"✎ Ajustar apelidos"** que revela o `<TeamPhaseAliasesEditor>`, ligado a `aliases`/`saveAliases` do hook, recebendo `externalNames` (de `externalList`) e `hackiaNames` (`names`).
- Após salvar, os badges re-resolvem; a aba Times converge no próximo poll de 20s.

## Tratamento de erros / bordas

- RPC `get_team_phase_aliases` falha → `aliasMap` cai no fallback do config (os 2 conhecidos); painel funciona.
- Par inválido (lado vazio) → barrado na UI e no RPC.
- Admin remove um par seedado → fica removido (banco é a fonte; config só reaparece se a RPC cair).
- Sem `supabase` (env ausente) → editor não salva (botão desabilitado), leitura usa fallback.

## Testes (vitest, node env)

- `buildAliasMap`: pares crus → mapa normalizado; ignora lados vazios; último par vence em colisão de chave.
- `matchKey(name, aliasMap)`: aplica o mapa passado; sem mapa usa o default do config.
- `findUnmatchedExternal` / `buildPhaseLookup` com override: `Revisa.Ai → Revisai` passa a casar; sem o par, volta a ser órfã.

## Pré-deploy

Esta mudança **altera o Supabase** (migração + 2 RPCs + grants) → ao rodar `/pre-deploy-verify`, o agente de **verificação de banco** se aplica (confirmar funções criadas, grants, `is_admin()` na escrita, `search_path`, e um smoke test seguro de get/set). É aditiva (não altera objetos vivos).

## Fora de escopo (YAGNI)

- Modelo dropdown-assign (preferida a tabela).
- Editar apelidos pelo participante/telão.
- Histórico/versionamento de apelidos.
- Remover `TEAM_NAME_ALIASES` do config (fica como fallback).
