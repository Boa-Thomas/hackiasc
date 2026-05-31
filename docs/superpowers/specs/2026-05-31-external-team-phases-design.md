# Integração da fase das equipes (read-only) — Design

**Data:** 2026-05-31
**Status:** Aprovado (design) — pronto para plano de implementação

## Contexto

Existe um app externo de hackathon ("painel do sapinho"/frog dashboard), de outra
organização, que faz o tracking da **fase** em que cada equipe está durante o evento.

- **Projeto Supabase externo:** `kpcaokuqblutdkfdqwfg` (`https://kpcaokuqblutdkfdqwfg.supabase.co`)
- **Tabela:** `public.teams` — colunas `id` (int), `name` (texto livre), `stage` (a fase), `color`, `avatar_base64`
- **Anon key:** já é **pública** (embutida no `index.html` deployado deles) — uso **somente leitura**.
- **Fases (ordenadas):** `EQUIPE(0) → PROBLEMA(1) → SLC-IA(2) → PIVOTAR(3) → VENDA(4) → PITCH(5) → HERO(6)`
- **Aliases de stage usados por eles:** `ideia→equipe`, `mvp/prototipo/solucao→slc`, `codigo→pivotar`, `vendas→venda`

> Observação: o app de **cards colecionáveis** (`pawvakilapowebphckpq`) é um projeto Supabase
> **diferente** e **não** é fonte de fase. Não faz parte desta integração.

## Objetivo

Mostrar a **fase atual de cada equipe** dentro do HackIA SC, **apenas nos painéis admin**
(aba **Facilitador** e aba **Times**), mantendo o valor **atualizado ao vivo**.

## Decisões (confirmadas com o usuário)

| Decisão            | Escolha                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onde mostrar       | Aba **Facilitador** (cockpit) + aba **Times** (admin). Sem participante/telão.                                                                        |
| Arquitetura        | **Ler direto (read-only)** no front admin, via 2º cliente Supabase. Sem migração, sem escrita em nenhum banco.                                        |
| Ao vivo            | **Polling a cada ~20s**.                                                                                                                              |
| Casamento de nomes | **Normalização + mapa de apelidos manual** para os 2 casos que não casam sozinhos (fuzzy foi descartado por risco de falso positivo com só 13 times). |

## De-para das equipes (levantado em 2026-05-31)

HackIA tem 13 equipes; o painel externo tem 12. Casamento por nome normalizado
(minúsculas + remover espaços/pontuação/acentos/emoji):

| HackIA SC              | Externo (frog)         | Match                                                  |
| ---------------------- | ---------------------- | ------------------------------------------------------ |
| ALLias                 | Allias                 | auto                                                   |
| Beauty HUB             | Beauty HUB             | auto                                                   |
| On.AI                  | On.Ai                  | auto                                                   |
| SindicoAI              | SindicoAI              | auto                                                   |
| Odonto Guard 🦷✨      | OdontoGuard            | auto                                                   |
| Flaneur                | Flaneur                | auto                                                   |
| FashFind               | FashFind               | auto                                                   |
| MedScribe              | MedScribe              | auto                                                   |
| Combinado não sai Caro | Combinado não sai caro | auto                                                   |
| bAItas                 | byAItas                | **alias manual** (`byaitas`→`baitas`)                  |
| EasyIA IT Company      | EasyAI IT Company      | **alias manual** (`easyaiitcompany`→`easyiaitcompany`) |
| MindRift               | _(inexistente lá)_     | sem fase → "—"                                         |
| ZapFin AI              | _(inexistente lá)_     | sem fase → "—"                                         |
| _(inexistente aqui)_   | Revisa.Ai              | órfã externa (aviso discreto)                          |

## Arquitetura / Componentes

### 1. `src/lib/config.js` — bloco novo `EXTERNAL_PHASE_TRACKER`

Centraliza os valores editáveis (padrão do projeto: config fica aqui):

- `url`, `anonKey` do projeto externo (anon key pública, read-only).
- `PHASES`: lista ordenada — `[{ key:'equipe', label:'Equipe', order:0, color:'#22c55e' }, … hero(6)]`
  (reaproveita rótulos/ordem/cores do painel externo: EQUIPE/PROBLEMA/SLC-IA/PIVOTAR/VENDA/PITCH/HERO).
- `STAGE_ALIASES`: `{ ideia:'equipe', mvp:'slc', prototipo:'slc', solucao:'slc', codigo:'pivotar', vendas:'venda' }`.
- `TEAM_NAME_ALIASES`: `{ 'byaitas':'baitas', 'easyaiitcompany':'easyiaitcompany' }` (forma normalizada).

### 2. `src/lib/teamPhases.js` — lógica pura (testável)

- `createExternalClient()` — cria o 2º client `createClient(url, anonKey)` de forma lazy; null-safe.
- `normalizeTeamName(name)` — minúsculas; remove acentos, emoji, espaços e pontuação.
- `stageToPhase(stageString)` — aplica `STAGE_ALIASES` → devolve `{ key, label, order, color }` ou `null`.
- `fetchTeamPhases(client)` — `select id,name,stage` em `teams` externa → `[{ name, norm, phase }]`.
- `matchPhase(hackiaTeamName, externalList)` — normaliza + consulta `TEAM_NAME_ALIASES` → fase casada ou `null`.

### 3. `src/hooks/useTeamPhases.js` — hook (segue padrão de `useTicketPrice.js`)

- `fetchTeamPhases()` no mount + `setInterval(20000)`; cleanup no unmount.
- Retorna `{ getPhase(name), loading, error, lastUpdated, unmatchedExternal }`.
- Em erro de rede: mantém último valor, sinaliza `error` (painel não quebra).

### 4. `src/admin/PhaseBadge.jsx` — componente visual reutilizável

- Recebe `phase` → pílula colorida com `label` + posição (`order+1`/7), ex.: "③ SLC-IA".
- `phase === null` → "—" discreto (cinza).

### 5. Telas

- **`AdminTeams.jsx`**: `<PhaseBadge>` em cada linha de equipe (ao lado de almoço/pagamento).
- **`AdminFacilitator.jsx`**: seção compacta **"Fases das equipes"** — lista com badge por time +
  "atualizado há Xs"; times sem par (MindRift, ZapFin AI) mostram "—"; aviso discreto se houver
  órfã externa (ex.: Revisa.Ai).

## Tratamento de erros / bordas

- 2º client null (sem rede/env) → painéis funcionam; badges mostram "—".
- Time sem match → "—" neutro, nunca erro.
- Fetch externo falha → último estado + indicador discreto "offline".

## Testes (vitest, já no projeto)

Funções puras testadas com os nomes reais bagunçados:

- `normalizeTeamName` (acentos/emoji/espaços/pontuação).
- `stageToPhase` (incluindo aliases mvp/prototipo/solucao/codigo/vendas/ideia).
- `matchPhase` (cobrindo byAItas↔bAItas, EasyAI↔EasyIA, órfã Revisa.Ai, sem-par MindRift/ZapFin, e os 9 automáticos).

## Fora de escopo (YAGNI)

- Realtime (postgres_changes) — só polling.
- Sincronizar a fase para o banco do HackIA / RPC pública.
- Exibir no painel do participante ou no telão.
- Escrever/alterar fase no projeto externo (estritamente read-only).
