# Aba "Facilitador" — cockpit ao vivo do evento

**Data:** 2026-05-30
**Status:** Aprovado (brainstorming)

## Contexto

O app cresceu de landing page para um sistema com painel admin de abas
(`src/admin/AdminPanel.jsx`), painel do participante, guia do mentor, painel do
jurado e telão. O evento HackIA SC acontece **ao vivo** (29–31 Mai 2026) e a
facilitadora hoje **não tem nenhuma ferramenta** para conduzir o evento.

Além disso, o cronograma existe **triplicado e desincronizado**:

- `src/components/Timeline.jsx` → `DAYS` (landing pública, hardcoded, agrupado por dia)
- `src/participant/ParticipantPanel.jsx` → `SCHEDULE` (versão detalhada, com `note` por dia)
- `src/mentor/mentorGuideContent.jsx` → `Cronograma()` apenas **linka** para
  `/#cronograma` (já delega — fonte da verdade é o site)

## Objetivo

Criar uma aba **Facilitador** no painel admin (somente role `admin`) que serve
como cockpit para conduzir o evento ao vivo, e transformar o cronograma em
**fonte única** no Supabase que alimenta a landing e o painel do participante.

## Decisões travadas (brainstorming)

- **Acesso:** aba no `AdminPanel`, `adminOnly`. Sem novo login.
- **Persistência:** Supabase (compartilhado/ao vivo entre dispositivos).
- **Fonte única:** editar o cronograma aqui atualiza a landing (`Timeline.jsx`) e o
  painel do participante (`ParticipantPanel.jsx`). Guia do mentor não muda (já delega).
- **Itens da aba:** Cronograma editável + check ao vivo · Painel "Agora/Próximo" ·
  Avisos ao vivo para participantes · Atalhos de controle do evento.
  (NÃO inclui roteiro/run-of-show por bloco.)
- **Visibilidade dos checks:** os checks de "feito/agora" são **internos** da
  facilitadora. Participantes/landing veem o cronograma editado (horários/ordem),
  mas **não** os checks.
- **Reordenar:** botões ↑/↓ (sort_order), sem drag-and-drop / sem dependência nova.
- **"Ao vivo":** polling / refetch-on-action (~20–30s), sem Supabase Realtime.

## Arquitetura

### 1. Modelo de dados — migration `migrations/add_schedule.sql`

Seguir o padrão das migrations existentes (`migrations/*.sql`, aplicadas via
Supabase MCP), RLS via `is_admin()` / `is_admin_or_viewer()`, e RPC
`SECURITY DEFINER` + `GRANT ... TO anon` para leitura pública (igual
`get_confirmed_count`). Lembrar do `SET search_path = public` por hardening
(ver `migrations/add_evaluation_security_hardening.sql`).

**`schedule_days`**

- `day_key text PRIMARY KEY` — `'fri' | 'sat' | 'sun'`
- `label text NOT NULL` — ex.: `"Sexta · 29/Mai"`
- `window text` — ex.: `"18:30 – 22:00"`
- `note text`
- `accent text` — `'cyan' | 'electric' | 'violet'`
- `sort_order int NOT NULL`

**`schedule_items`**

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `day_key text NOT NULL REFERENCES schedule_days(day_key) ON DELETE CASCADE`
- `sort_order int NOT NULL`
- `time text` — `"HH:MM"` (texto livre; alguns blocos têm horário aproximado)
- `title text NOT NULL`
- `description text`
- `done boolean NOT NULL DEFAULT false` — **interno da facilitadora**
- `done_at timestamptz`

**RLS**

- `authenticated` (admin) lê/escreve tudo (policies via `is_admin()` para escrita,
  `is_admin_or_viewer()` para leitura — espelhar convenção do repo).
- Anon **não** tem acesso direto às tabelas.

**Leitura pública — RPC `get_public_schedule()`**

- `SECURITY DEFINER`, `GRANT EXECUTE ... TO anon`.
- Retorna dias + itens **sem** `done`/`done_at` (ex.: JSON agregado:
  `[{ day_key, label, window, note, accent, items: [{ time, title, description }] }]`,
  ordenado por `schedule_days.sort_order` e `schedule_items.sort_order`).
- Caminho único de leitura para landing e participante.

**Seed**

- A migration insere o cronograma atual a partir de `Timeline.jsx` (`DAYS`) e do
  `SCHEDULE` detalhado do `ParticipantPanel`. Onde divergirem, usar a versão
  **detalhada do participante** como base (tem mais blocos, ex.: Working Times,
  Bancas de Pré-Pitch). Nada nasce vazio no primeiro deploy.

### 2. "Agora / Próximo" — derivado, sem estado extra

- **Agora** = primeiro `schedule_item` com `done = false` na ordem cronológica
  global (por `schedule_days.sort_order`, depois `schedule_items.sort_order`).
- **Próximo** = o item seguinte.
- Dar check em um item avança o ponteiro naturalmente. Sem coluna "current".
- Lógica de cálculo pura e testável (ex.: `src/admin/facilitatorSchedule.js`
  - `.test.js`, espelhando `teamIdea.js`/`aiScores.js`).

### 3. Avisos ao vivo → participantes

**`announcements`**

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `body text NOT NULL`
- `active boolean NOT NULL DEFAULT true`
- `created_at timestamptz NOT NULL DEFAULT now()`

- RLS: `authenticated` lê/escreve.
- RPC anon `get_active_announcement()` (`SECURITY DEFINER`, `GRANT ... TO anon`)
  retorna o aviso ativo mais recente (ou null).
- Facilitadora publica/limpa via RPCs admin dedicadas `set_announcement(p_body text)`
  e `clear_announcement()` (`SECURITY DEFINER`, `GRANT ... TO authenticated`,
  guard `is_admin()`) — consistente com `set_team_scores_visible`. `set_announcement`
  desativa os anteriores (`active = false`) e insere o novo, garantindo um só vigente.
- `ParticipantPanel`: banner no topo, polling leve (~30s) via `get_active_announcement()`.

### 4. Atalhos de controle (cockpit) — só UI, sem backend novo

Reaproveitar RPCs existentes:

- **Fase do Muro:** `wall_set_phase(p_phase)` (ver `AdminWall.jsx` para os ids de fase).
- **Notas da IA visíveis:** `get_team_scores_visible()` / `set_team_scores_visible(p_visible)`
  (ver `AdminDeliverables.jsx`).

Reúne num só lugar controles hoje espalhados em outras abas.

### 5. Frontend

**Novo: `src/admin/AdminFacilitator.jsx`** (aba `adminOnly`), composto por seções:

1. `NowNext` — destaque do bloco atual e do próximo.
2. `ScheduleEditor` — lista agrupada por dia; cada item: editar `time`/`title`/
   `description`, reordenar com ↑/↓ (atualiza `sort_order`), toggle `done`,
   adicionar/excluir item. Edição de metadados do dia (window/note) é secundária.
3. `AnnouncementBox` — textarea + publicar/limpar + aviso vigente.
4. `ControlShortcuts` — botões de fase do Muro + toggle notas da IA.

**Editado: `src/admin/AdminPanel.jsx`**

- Adicionar `{ id: 'facilitator', label: 'Facilitador', icon: '🎤', adminOnly: true }`
  em `ALL_TABS` e o branch de render `{!readOnly && activeTab === 'facilitator' && <AdminFacilitator />}`.

**Editado: `src/components/Timeline.jsx`**

- Buscar via `get_public_schedule()`; manter `DAYS` hardcoded como **fallback**
  (degrada se `supabase` for null ou retorno vazio).

**Editado: `src/participant/ParticipantPanel.jsx`**

- `DetailedSchedule`: buscar via `get_public_schedule()`; `SCHEDULE` hardcoded como
  fallback. Adicionar banner de aviso (`get_active_announcement()`, polling ~30s).

**Não muda:** `src/mentor/mentorGuideContent.jsx` (já linka para `/#cronograma`).

## Tratamento de erro / degradação

- Se `supabase` for null (env vars ausentes), landing e participante usam os arrays
  hardcoded; a aba Facilitador mostra "Supabase não configurado" (padrão dos outros
  tabs).
- Se `get_public_schedule()` retornar vazio, usar fallback hardcoded — nunca render vazio.
- Escritas (reorder/check/edit) com refetch otimista ou refetch-on-action; erros
  exibidos inline no padrão dos tabs existentes.

## Testes

- Lógica pura de "Agora/Próximo" e de reordenar (`facilitatorSchedule.js` + `.test.js`),
  no estilo de `src/admin/teamIdea.test.js` / `src/wall/wallLayout.test.js`.
- Sem testes de UI/E2E (não há infra no repo).

## Fora de escopo (YAGNI)

- Roteiro/run-of-show por bloco.
- Supabase Realtime (subscriptions).
- Drag-and-drop para reordenar.
- Login/role próprio de Facilitador.
- Edição do cronograma por viewer/staff.
- Checks visíveis para participantes.
