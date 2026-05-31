# Notificações Push + Central de Avisos — Design

**Data:** 2026-05-30
**Status:** Aprovado para escrever plano de implementação
**Contexto:** HackIA SC — SPA React 19 + Vite, estático no GitHub Pages (hackiasc.com), backend Supabase (Postgres + RLS). Sem service worker, PWA ou sistema de notificações hoje.

## Objetivo

No próximo login de **todos os usuários do app exceto jurados** (participante, mentor, admin/staff), pedir para habilitar notificações para "não perder nenhum aviso". Entregar via **Web Push real** (chega com o app fechado), com um **catálogo de eventos automáticos** que disparam push + um **broadcast manual** pelo admin, e uma **central de avisos in-app** (sininho com histórico lido/não-lido).

## Decisões tomadas (brainstorming)

| Tema           | Decisão                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| Mecanismo      | **Web Push real** (service worker + VAPID + Edge Function)                                                       |
| Disparo        | **Eventos automáticos + broadcast manual**                                                                       |
| Catálogo       | **11 eventos** (10 originais + início de atividade do cronograma)                                                |
| iPhone         | **PWA instalável** (manifest + ícones) + instrução "Adicionar à Tela de Início"; sem isso o iOS não entrega push |
| Central in-app | **Sim** — sininho + histórico (lido/não-lido por usuário); push é só o canal de entrega                          |
| Re-prompt      | **Reperguntar a cada login até ativar**, respeitando "Agora não" por **15 min** (localStorage)                   |
| Aba admin      | **Compor broadcast + Catálogo com liga/desliga + Histórico de envios** (sem métricas de adesão)                  |
| Jurados        | **Fora de tudo** — sem prompt e sem alvo de eventos                                                              |

## Arquitetura

Tudo vira uma linha em `notifications`. Evento automático ou broadcast manual seguem o mesmo caminho:

```
Evento automático (RPC modificada / trigger) ─┐
                                              ├─► INSERT em `notifications`
Broadcast manual (RPC admin) ─────────────────┘        │
                                                        ├─► expande `notification_recipients` (1 linha por usuário)
                                                        │
                                                        └─► Database Webhook (insert em notifications)
                                                                  │
                                                                  ▼
                                                        Edge Function `send-push`
                                                          - busca push_subscriptions de cada recipient
                                                          - envia Web Push (VAPID) p/ cada device
                                                          - 410/404 ⇒ apaga subscription expirada
```

- **Fonte da verdade:** `notifications` (a mensagem) + `notification_recipients` (cópia por usuário com `read_at`). Alimenta o sininho in-app e a entrega do push.
- **Entrega única:** uma Edge Function `send-push` disparada por Database Webhook no insert de `notifications`. Sem polling pra enviar; o in-app é que faz polling pra ler.

## Modelo de dados

### `push_subscriptions`

Uma linha por device/navegador inscrito.

| Coluna       | Tipo        | Nota                                                                            |
| ------------ | ----------- | ------------------------------------------------------------------------------- |
| `id`         | uuid PK     |                                                                                 |
| `user_key`   | text        | `"<papel>:<id>"` ex `participant:<reg_id>`, `mentor:<mentor_id>`, `admin:<uid>` |
| `endpoint`   | text unique | endpoint do push service                                                        |
| `p256dh`     | text        | chave pública do device                                                         |
| `auth`       | text        | secret do device                                                                |
| `user_agent` | text        | diagnóstico                                                                     |
| `created_at` | timestamptz |                                                                                 |

Índice em `user_key`. `endpoint` único (upsert por endpoint).

### `notifications`

Uma linha por mensagem (evento ou broadcast).

| Coluna       | Tipo        | Nota                                                           |
| ------------ | ----------- | -------------------------------------------------------------- |
| `id`         | uuid PK     |                                                                |
| `event_key`  | text        | `'sugar_released'`, `'broadcast'`, `'schedule_start'`, …       |
| `title`      | text        |                                                                |
| `body`       | text        |                                                                |
| `url`        | text null   | rota de destino (ex `#muro`, `#participante`)                  |
| `audience`   | jsonb       | descritor: `{kind, team_id?, mentor_id?, reg_id?}` (auditoria) |
| `created_by` | text null   | `user_key` do admin no broadcast                               |
| `created_at` | timestamptz |                                                                |

### `notification_recipients`

Fan-out: uma linha por destinatário.

| Coluna            | Tipo             | Nota            |
| ----------------- | ---------------- | --------------- |
| `id`              | uuid PK          |                 |
| `notification_id` | uuid FK          |                 |
| `user_key`        | text             | destinatário    |
| `read_at`         | timestamptz null | null = não lido |

Índices em `(user_key, read_at)` e `notification_id`. Escala: evento com ~200 participantes = ~200 linhas/notificação — trivial.

### `app_settings` (chaves novas)

- `notify_event_<key>` = `'on'` / `'off'` (default `'on'`) — switch por evento da aba admin. Uma chave por evento do catálogo.

## Catálogo de eventos (11)

`notify_event(p_event_key, p_title, p_body, p_url, p_audience)` (SECURITY DEFINER):

1. Lê `app_settings.notify_event_<key>`; se `'off'`, retorna sem fazer nada.
2. INSERT em `notifications`.
3. Expande `notification_recipients` conforme `p_audience`.

| #   | Evento                            | `event_key`             | Gancho                                                      | Público                  |
| --- | --------------------------------- | ----------------------- | ----------------------------------------------------------- | ------------------------ |
| 1   | Mural liberado                    | `sugar_released`        | dentro de `set_sugar_released` (só OFF→ON)                  | todos participantes      |
| 2   | Notas IA visíveis                 | `team_scores_visible`   | dentro de `set_team_scores_visible` (OFF→ON)                | membros de times         |
| 3   | Fase do muro                      | `wall_phase`            | dentro de `wall_set_phase`                                  | todos participantes      |
| 4   | Pagamento confirmado              | `payment_confirmed`     | **trigger** em `registrations` (payment_status → confirmed) | o participante           |
| 5   | Avaliação aberta                  | `evaluation_open`       | dentro de `set_evaluation_open` (OFF→ON)                    | participantes + mentores |
| 6   | Aviso publicado                   | `announcement`          | dentro de `set_announcement`                                | todos participantes      |
| 7   | Almoço do time                    | `team_lunch`            | dentro de `set_team_lunch`                                  | membros do time          |
| 8   | Entrega submetida                 | `deliverable_submitted` | **trigger** em `team_deliverables` (draft→submitted)        | mentores do time         |
| 9   | Deadline de slides                | `slides_deadline`       | dentro de `set_slides_deadline`                             | times                    |
| 10  | Mentor designado                  | `mentor_assigned`       | **trigger** em `mentor_teams` (insert)                      | o mentor                 |
| 11  | Início de atividade do cronograma | `schedule_start`        | dentro da ação de iniciar item no `AdminFacilitator`        | todos participantes      |

Expansão de público (`audience.kind`):

- `all_participants` → inscrições confirmadas (`registrations`)
- `all_mentors` → todos mentores
- `participants_and_mentors` → união dos dois
- `team_members` (`team_id`) → membros do time
- `teams_members` (`team_ids[]`) → membros de vários times selecionados
- `team_mentors` (`team_id`) → mentores designados ao time
- `participant` (`reg_id`) → um participante
- `mentor` (`mentor_id`) → um mentor
- `broadcast` → resolvido pela RPC de broadcast (ver abaixo)

## Identidade e segurança (3 silos de auth)

| Silo         | Auth atual                                      | RPC de inscrição                                                | Leitura do sininho                                                                          |
| ------------ | ----------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Participante | token localStorage + `participant_get_me`       | `push_subscribe_participant(token, endpoint, p256dh, auth, ua)` | `notifications_list_participant(token)` / `notifications_mark_read_participant(token, ids)` |
| Mentor       | token sessionStorage + `mentor_get_me_by_token` | `push_subscribe_mentor(token, …)`                               | `notifications_list_mentor(token)` / `…_mark_read_mentor`                                   |
| Admin/staff  | Supabase Auth (JWT)                             | insert via RLS autenticado (deriva `admin:<uid>`)               | `notifications_list_admin()` (usa `auth.uid()`)                                             |

**Regras:**

- O cliente **nunca** passa `user_key` cru. Cada RPC SECURITY DEFINER valida o token e **deriva** o `user_key`. Token inválido ⇒ erro.
- `push_subscriptions` e `notification_recipients` **não** são lidos diretamente por `anon` (RLS nega); acesso só via RPC SECURITY DEFINER que valida o token.
- Broadcast e switches do catálogo: **só role `admin`** (checagem na RPC).
- VAPID private key: só como secret da Edge Function. Public key vai no bundle (é pública por design).

## Broadcast manual

`broadcast_notification(p_title, p_body, p_audience_kind, p_team_ids)` (SECURITY DEFINER, exige admin):

- `p_audience_kind ∈ {all_participants, all_mentors, participants_and_mentors, teams_members}`.
- `p_team_ids` (uuid[]) usado quando `kind = teams_members` — permite **selecionar vários times de uma vez**; ignorado nos demais.
- Insere `notifications` com `event_key='broadcast'` e expande recipients (deduplicando user_keys quem aparece em mais de um time). Webhook entrega o push.

**Seletor de público na aba admin:** rádio de categoria (Todos participantes / Só mentores / Participantes + mentores / Times) e, ao escolher "Times", uma lista de checkboxes com todos os times para marcar um ou vários.

## Edge Function `send-push`

`supabase/functions/send-push/index.ts` (Deno):

- Acionada por **Database Webhook** no insert de `notifications` (payload traz `notification_id`).
- Busca `notification_recipients` da notificação → para cada `user_key`, busca `push_subscriptions` → envia Web Push (lib `web-push` p/ Deno) usando VAPID secrets.
- Payload do push: `{ title, body, url, tag: notification_id }`.
- Erro 404/410 ⇒ deleta a subscription. Demais erros ⇒ loga e segue.
- Secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto), `SUPABASE_SERVICE_ROLE_KEY`.

## Frontend

- `public/sw.js` — service worker; trata `push` (`showNotification`) e `notificationclick` (foca/abre `data.url`).
- `public/manifest.webmanifest` + ícones `192`/`512` (derivados do logo) — instalabilidade (push no iPhone).
- Registro do SW: em `main.jsx` (com base path do GitHub Pages / domínio custom).
- `src/lib/push.js` — `registerSW()`, `subscribe(vapidPublicKey)`, chamada à RPC do silo, `unsubscribe()`, helpers de detecção (`isIOS`, `isStandalone`, `Notification.permission`).
- `src/hooks/useNotifications.js` — lista do sininho via RPC do silo (polling ~30s + ao focar a aba), contador não-lido, `markRead`.
- `src/components/NotificationBell.jsx` — sininho + badge + dropdown; entra no header dos painéis de participante, mentor e admin.
- `src/components/EnablePushPrompt.jsx` — modal suave pós-login (participante/mentor/admin; **nunca** juror):
  - Mostra se `Notification.permission === 'default'` e não está em snooze.
  - Botão **Ativar** ⇒ `requestPermission()` + `subscribe()` + RPC do silo.
  - **"Agora não"** ⇒ snooze de **15 min** (localStorage), reaparece no próximo login.
  - **iPhone fora do modo instalado** (`isIOS && !isStandalone`) ⇒ troca o botão por instruções "Adicione à Tela de Início pra receber avisos".
  - Se `permission==='granted'` mas sem subscription salva ⇒ re-subscribe em silêncio.

## Aba admin "🔔 Notificações"

`src/admin/AdminNotifications.jsx` (nova aba em `AdminPanel.jsx`, provável `adminOnly`):

1. **Compor broadcast** — textarea (título + corpo) + seletor de público (todos participantes / só mentores / participantes + mentores / Times → checkboxes de um ou vários times) + enviar (chama `broadcast_notification`).
2. **Catálogo + liga/desliga** — os 11 eventos com "quem recebe" e um switch por evento (`set_notify_event(key, on)` grava `app_settings.notify_event_<key>`).
3. **Histórico de envios** — lista de `notifications` recentes (event_key, título, público, nº de recipients, quando) via RPC admin.

## Migration

`migrations/add_push_notifications.sql`:

- Tabelas: `push_subscriptions`, `notifications`, `notification_recipients` + índices + RLS.
- Helpers: `notify_event(...)`, expansão de audiência, `set_notify_event(key, on)`, `get_notify_events()`.
- RPCs por silo: `push_subscribe_participant/mentor`, `notifications_list_*`, `notifications_mark_read_*`, `notifications_list_admin`, `broadcast_notification`, `admin_notifications_history`.
- Triggers: `registrations` (pagamento), `team_deliverables` (entrega), `mentor_teams` (designação).
- Edições nas RPCs existentes (chamada a `notify_event`): `set_sugar_released`, `set_team_scores_visible`, `wall_set_phase`, `set_evaluation_open`, `set_announcement`, `set_team_lunch`, `set_slides_deadline`, e a ação de iniciar item do cronograma.
- Seed das chaves `notify_event_<key>` = `'on'`.
- Database Webhook em `notifications` (insert) → `send-push` (configurado via SQL/`pg_net` ou painel).

> Atenção a `search_path` em funções SECURITY DEFINER que toquem extensões (ver memória pgcrypto). Aqui não usamos pgcrypto, mas mantemos `search_path` explícito.

## Infra a prover

- **VAPID keypair** — gero o par; public no build (`VITE_VAPID_PUBLIC_KEY`), private + subject como secrets da Edge Function.
- **Edge Function** `send-push` — deploy via MCP Supabase (projeto ainda não tem `supabase/functions`).
- **Database Webhook** — insert em `notifications` → edge function.
- **Ícones PWA** — derivar `192`/`512` do logo existente.

## Não-objetivos (YAGNI)

- Métricas de adesão de push.
- Broadcast para pessoas individuais (por nome) — o seletor vai até categorias + múltiplos times; indivíduos ficam fora por ora.
- Preferências granulares por usuário (opt-out por tipo de evento) — só o switch global do admin.
- E-mail/SMS — só Web Push + in-app.
- Notificações pra jurados.
- Realtime via Supabase Realtime — o sininho usa polling (consistente com o resto do app).

## Riscos / pontos de atenção

- **iOS**: push só com PWA instalado e iOS ≥ 16.4. Mitigado com instrução de instalação; ainda assim parte do público pode não instalar.
- **GitHub Pages + base path**: SW precisa ser servido do escopo certo (domínio custom hackiasc.com ⇒ escopo `/`). Validar registro do SW em produção.
- **Database Webhook → Edge Function**: latência e retries; logar falhas. Idempotência por `tag = notification_id`.
- **Permissão negada**: se o usuário bloqueou no navegador, `requestPermission` não reabre o diálogo — o prompt deve detectar `denied` e mostrar instrução manual em vez do botão.
