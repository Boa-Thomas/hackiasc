# Push Notifications + Central de Avisos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pedir permissão de notificação no login de participante/mentor/admin (nunca juror), entregar Web Push real para 11 eventos automáticos + broadcast manual segmentado, com central de avisos in-app (sininho) e aba de admin.

**Architecture:** Toda notificação é uma linha em `notifications` + fan-out em `notification_recipients`. Um Database Webhook no insert chama a Edge Function `send-push`, que envia Web Push (VAPID) para cada device em `push_subscriptions`. O sininho in-app lê `notification_recipients` via RPC por silo de auth (token participante/mentor, JWT admin). Eventos automáticos chamam `notify_event(...)` dentro das RPCs/triggers existentes.

**Tech Stack:** React 19 + Vite (estático, GitHub Pages), Supabase Postgres + RLS, Supabase Edge Function (Deno + `web-push`), Web Push API + Service Worker, Vitest (env `node`) para helpers puros.

**Spec:** `docs/superpowers/specs/2026-05-30-push-notifications-design.md`

---

## Convenções do repositório (ler antes de começar)

- **Estilo JS:** aspas simples, sem ponto-e-vírgula. Há um hook de formatação que briga com Edit/Write em arquivos JS — **edite arquivos `.js`/`.jsx` via Bash (heredoc) quando o hook causar conflito**, ou reaplique após o formatter. Markdown/SQL não sofrem com isso.
- **Git:** o `~/.gitconfig` global está quebrado. Use sempre `git -c safe.directory='*'` e, em commits, `-c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com'`.
- **SQL idiomático:** funções com `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`, gate de admin via `is_admin()`, `REVOKE ... FROM anon` + `GRANT ... TO authenticated`. Upsert de flag em `app_settings (key, value, updated_at)` com `ON CONFLICT (key) DO UPDATE`.
- **Migrations:** arquivos `.sql` em `migrations/`, aplicados no projeto remoto via MCP `apply_migration` (não há fluxo de CLI local). Mantenha o arquivo no repo como fonte histórica.
- **Branch:** trabalhar na branch atual `feat/sugar-cubes` (ou criar `feat/push-notifications` a partir dela). Commits frequentes, um por task.

---

## File Structure

**Criar:**

- `migrations/add_push_notifications.sql` — tabelas, helpers, RPCs, triggers, seed de flags, RLS.
- `migrations/wire_notify_events.sql` — edições nas RPCs existentes + gancho do cronograma (migration separada para isolar as modificações de RPCs de terceiros).
- `supabase/functions/send-push/index.ts` — Edge Function de entrega.
- `public/sw.js` — service worker (push + click).
- `public/manifest.webmanifest` — PWA.
- `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-192-maskable.png`, `public/icons/icon-512-maskable.png` — ícones PWA.
- `src/lib/push.js` — helpers de registro/inscrição + detecção (puros e testáveis).
- `src/lib/push.test.js` — vitest dos helpers puros.
- `src/hooks/useNotifications.js` — lista do sininho + unread + markRead.
- `src/components/NotificationBell.jsx` — sininho + dropdown.
- `src/components/EnablePushPrompt.jsx` — modal de permissão pós-login.
- `src/admin/AdminNotifications.jsx` — aba admin (broadcast + catálogo + histórico).

**Modificar:**

- `migrations/add_sugar_cubes.sql`, `add_team_scores_visibility.sql`, `add_wall_results_phase.sql`, `add_schedule.sql`, `add_team_lunch.sql`, `add_slides_deadline.sql`, e a RPC de `evaluation_open` — apenas como **cópia atualizada do source** (a mudança real é aplicada via `wire_notify_events.sql`; atualizar os arquivos-fonte para refletir o estado final).
- `src/main.jsx` — registrar service worker.
- `index.html` — link do manifest + meta tags PWA/iOS.
- `src/App.jsx` — montar `<EnablePushPrompt>` nas rotas de participante/mentor/admin.
- `src/participant/ParticipantPanel.jsx`, `src/mentor/MentorPanel.jsx`, `src/admin/AdminPanel.jsx` — montar `<NotificationBell>` no header.
- `src/admin/AdminPanel.jsx` — adicionar a aba `notifications`.
- `.github/workflows/deploy.yml` — injetar `VITE_VAPID_PUBLIC_KEY` no build.
- `vite.config.js` — mudar `test.environment` para `jsdom` **somente se** algum teste precisar de DOM (os helpers puros não precisam; manter `node`).

---

## Phase 0 — Chaves VAPID e env

### Task 0: Gerar par VAPID e configurar env

**Files:**

- Modify: `.github/workflows/deploy.yml:27-36`
- Create (local, não commitar segredo): `.env.local`

- [ ] **Step 1: Gerar o par de chaves VAPID**

Run:

```bash
npx --yes web-push generate-vapid-keys --json
```

Expected: JSON com `{ "publicKey": "...", "privateKey": "..." }`. Guardar os dois valores (a private key NÃO vai pro git nem pro bundle).

- [ ] **Step 2: Adicionar a public key ao `.env.local`**

Acrescentar a `.env.local` (arquivo já ignorado pelo git):

```
VITE_VAPID_PUBLIC_KEY=<publicKey do passo 1>
```

- [ ] **Step 3: Registrar os secrets no GitHub e na Edge Function**

- GitHub repo → Settings → Secrets and variables → Actions → New secret: `VITE_VAPID_PUBLIC_KEY` = publicKey.
- Secrets da Edge Function serão setados na Task 8 (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).

> **Nota ao executor:** Steps 1–3 exigem ação humana (rodar npx, colar segredos no painel do GitHub/Supabase). Pause e peça ao usuário para fornecer/colar os valores se você não tiver acesso. Não invente chaves.

- [ ] **Step 4: Injetar a public key no build (deploy.yml)**

Editar `.github/workflows/deploy.yml`, dentro de `env:` do step `Build` (após a linha 31), adicionar:

```yaml
VITE_VAPID_PUBLIC_KEY: ${{ secrets.VITE_VAPID_PUBLIC_KEY }}
```

- [ ] **Step 5: Commit**

```bash
git -c safe.directory='*' add .github/workflows/deploy.yml
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "chore(push): injeta VITE_VAPID_PUBLIC_KEY no build"
```

---

## Phase 1 — Backend (migration)

### Task 1: Tabelas + índices + RLS

**Files:**

- Create: `migrations/add_push_notifications.sql`

- [ ] **Step 1: Escrever o bloco de tabelas no início do arquivo**

```sql
-- ============================================================
-- Push Notifications + Central de Avisos
-- Tabelas base: push_subscriptions, notifications, notification_recipients
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_key    text NOT NULL,                 -- '<papel>:<id>' ex 'participant:<uuid>'
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_sub_user_key ON push_subscriptions (user_key);

CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key   text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  url         text,
  audience    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC);

CREATE TABLE IF NOT EXISTS notification_recipients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_key        text NOT NULL,
  read_at         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_notif_recip_user ON notification_recipients (user_key, read_at);
CREATE INDEX IF NOT EXISTS idx_notif_recip_notif ON notification_recipients (notification_id);

-- RLS: ninguém lê diretamente; acesso só via RPC SECURITY DEFINER.
ALTER TABLE push_subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_recipients  ENABLE ROW LEVEL SECURITY;
-- Sem POLICY de SELECT para anon/authenticated => negado por padrão.
-- O service_role (Edge Function) ignora RLS.
```

- [ ] **Step 2: Aplicar a migration parcial e verificar as tabelas**

Aplicar via MCP `apply_migration` (name: `add_push_notifications`, query = conteúdo atual do arquivo). Depois verificar:

Run (MCP `execute_sql`):

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('push_subscriptions','notifications','notification_recipients')
ORDER BY table_name;
```

Expected: 3 linhas.

- [ ] **Step 3: Commit**

```bash
git -c safe.directory='*' add migrations/add_push_notifications.sql
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(push): tabelas de notificações + RLS"
```

---

### Task 2: Helpers de expansão de público + notify_event + flags

**Files:**

- Modify: `migrations/add_push_notifications.sql` (append)

- [ ] **Step 1: Função de expansão de recipients**

Anexar ao arquivo. `expand_recipients` recebe o `notification_id` e o descritor de audiência e insere as linhas, deduplicando `user_key`.

```sql
-- ------------------------------------------------------------
-- Expansão de audiência -> notification_recipients (dedup por user_key)
-- audience: { kind, team_id?, team_ids?, mentor_id?, reg_id? }
-- kinds: all_participants | all_mentors | participants_and_mentors
--        team_members | teams_members | team_mentors
--        participant | mentor
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION expand_recipients(p_notification_id uuid, p_audience jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_kind text := p_audience->>'kind';
  v_count integer;
BEGIN
  WITH keys AS (
    -- participantes confirmados
    SELECT 'participant:' || r.id::text AS user_key
      FROM registrations r
     WHERE r.payment_status = 'confirmed'
       AND v_kind IN ('all_participants','participants_and_mentors')
    UNION
    -- mentores
    SELECT 'mentor:' || m.id::text
      FROM mentors m
     WHERE v_kind IN ('all_mentors','participants_and_mentors')
    UNION
    -- membros de 1 time
    SELECT 'participant:' || r.id::text
      FROM registrations r
     WHERE v_kind = 'team_members'
       AND r.team_id = (p_audience->>'team_id')::uuid
    UNION
    -- membros de vários times
    SELECT 'participant:' || r.id::text
      FROM registrations r
     WHERE v_kind = 'teams_members'
       AND r.team_id = ANY (SELECT (jsonb_array_elements_text(p_audience->'team_ids'))::uuid)
    UNION
    -- mentores designados a um time
    SELECT 'mentor:' || mt.mentor_id::text
      FROM mentor_teams mt
     WHERE v_kind = 'team_mentors'
       AND mt.team_id = (p_audience->>'team_id')::uuid
    UNION
    -- 1 participante
    SELECT 'participant:' || (p_audience->>'reg_id')
     WHERE v_kind = 'participant'
    UNION
    -- 1 mentor
    SELECT 'mentor:' || (p_audience->>'mentor_id')
     WHERE v_kind = 'mentor'
  )
  INSERT INTO notification_recipients (notification_id, user_key)
  SELECT p_notification_id, user_key FROM keys WHERE user_key IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;
REVOKE EXECUTE ON FUNCTION expand_recipients(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION expand_recipients(uuid, jsonb) FROM anon;
```

> **Verificar nomes de coluna antes de aplicar:** confirme que `registrations` tem `team_id` e `payment_status`, que existe tabela `mentors(id)` e `mentor_teams(mentor_id, team_id)`. Rode os SELECTs do Step 3 primeiro; ajuste os nomes se divergirem.

- [ ] **Step 2: notify_event + seed de flags + get/set**

```sql
-- ------------------------------------------------------------
-- notify_event: checa o switch do evento e cria a notificação.
-- Retorna o id da notificação (ou NULL se o evento está OFF).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_event(
  p_event_key text, p_title text, p_body text, p_url text, p_audience jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_enabled boolean;
  v_id uuid;
BEGIN
  SELECT COALESCE((SELECT value <> 'off' FROM app_settings WHERE key = 'notify_event_' || p_event_key), true)
    INTO v_enabled;
  IF NOT v_enabled THEN RETURN NULL; END IF;

  INSERT INTO notifications (event_key, title, body, url, audience)
  VALUES (p_event_key, p_title, p_body, p_url, p_audience)
  RETURNING id INTO v_id;

  PERFORM expand_recipients(v_id, p_audience);
  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION notify_event(text,text,text,text,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION notify_event(text,text,text,text,jsonb) FROM anon;

-- Catálogo de switches (default ON). value = 'on' | 'off'.
INSERT INTO app_settings (key, value, updated_at) VALUES
  ('notify_event_sugar_released','on',now()),
  ('notify_event_team_scores_visible','on',now()),
  ('notify_event_wall_phase','on',now()),
  ('notify_event_payment_confirmed','on',now()),
  ('notify_event_evaluation_open','on',now()),
  ('notify_event_announcement','on',now()),
  ('notify_event_team_lunch','on',now()),
  ('notify_event_deliverable_submitted','on',now()),
  ('notify_event_slides_deadline','on',now()),
  ('notify_event_mentor_assigned','on',now()),
  ('notify_event_schedule_start','on',now())
ON CONFLICT (key) DO NOTHING;

-- get/set para a aba admin
CREATE OR REPLACE FUNCTION get_notify_events()
RETURNS TABLE(event_key text, enabled boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT substring(key from 14), value <> 'off'
    FROM app_settings WHERE key LIKE 'notify_event_%' ORDER BY key;
$$;
REVOKE EXECUTE ON FUNCTION get_notify_events() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_notify_events() FROM anon;
GRANT  EXECUTE ON FUNCTION get_notify_events() TO authenticated;

CREATE OR REPLACE FUNCTION set_notify_event(p_event_key text, p_on boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO app_settings (key, value, updated_at)
  VALUES ('notify_event_' || p_event_key, CASE WHEN p_on THEN 'on' ELSE 'off' END, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN p_on;
END; $$;
REVOKE EXECUTE ON FUNCTION set_notify_event(text,boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_notify_event(text,boolean) FROM anon;
GRANT  EXECUTE ON FUNCTION set_notify_event(text,boolean) TO authenticated;
```

- [ ] **Step 3: Verificar schema das tabelas-fonte (ANTES de aplicar)**

Run (MCP `execute_sql`):

```sql
SELECT column_name FROM information_schema.columns WHERE table_name='registrations' AND column_name IN ('team_id','payment_status');
SELECT to_regclass('public.mentors'), to_regclass('public.mentor_teams');
SELECT column_name FROM information_schema.columns WHERE table_name='mentor_teams';
```

Expected: `team_id` e `payment_status` presentes; `mentors` e `mentor_teams` não-nulos; `mentor_teams` tem `mentor_id` e `team_id`. **Se algum nome divergir, corrigir `expand_recipients` antes de prosseguir.**

- [ ] **Step 4: Aplicar a migration atualizada e testar notify_event**

Aplicar via MCP `apply_migration` (re-aplica o arquivo inteiro — todas as funções usam `CREATE OR REPLACE`/`IF NOT EXISTS`, então é idempotente). Depois:

Run (MCP `execute_sql`):

```sql
SELECT notify_event('announcement','Teste','corpo','#participante',
  jsonb_build_object('kind','all_participants')) AS nid;
SELECT count(*) FROM notification_recipients
 WHERE notification_id = (SELECT id FROM notifications ORDER BY created_at DESC LIMIT 1);
-- limpeza do teste
DELETE FROM notifications WHERE title='Teste';
```

Expected: `nid` não-nulo; `count` = número de participantes confirmados (>0 se houver dados).

- [ ] **Step 5: Commit**

```bash
git -c safe.directory='*' add migrations/add_push_notifications.sql
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(push): notify_event, expansão de público e switches do catálogo"
```

---

### Task 3: RPCs de inscrição (push_subscribe) por silo

**Files:**

- Modify: `migrations/add_push_notifications.sql` (append)

> Premissa de validação de token: as funções existentes `participant_get_me(p_token)` e `mentor_get_me_by_token(p_access_token)` / `mentor_get_me(p_token)` retornam JSON com o id quando o token é válido. Aqui validamos consultando as tabelas de sessão/token diretamente para obter o id. **Antes de escrever, confirme o nome da coluna/tabela de token** (Step 1).

- [ ] **Step 1: Descobrir como resolver token → id (participante e mentor)**

Run (MCP `execute_sql`):

```sql
-- Como participant_get_me valida o token? Inspecionar a definição.
SELECT pg_get_functiondef('participant_get_me(text)'::regprocedure);
SELECT pg_get_functiondef('mentor_get_me_by_token(text)'::regprocedure);
```

Expected: ver a tabela/coluna usada (ex.: `participant_sessions.token` → `registration_id`, e mentor por `mentors.access_token`). **Usar exatamente essa lógica de resolução nas funções abaixo.** Os snippets a seguir assumem:

- participante: `SELECT registration_id FROM participant_sessions WHERE token = p_token AND (expires_at IS NULL OR expires_at > now())`
- mentor (link): `SELECT id FROM mentors WHERE access_token = p_access_token`

Ajuste os nomes conforme o resultado real.

- [ ] **Step 2: push_subscribe_participant**

```sql
CREATE OR REPLACE FUNCTION push_subscribe_participant(
  p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reg uuid;
BEGIN
  SELECT registration_id INTO v_reg
    FROM participant_sessions
   WHERE token = p_token AND (expires_at IS NULL OR expires_at > now());
  IF v_reg IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;

  INSERT INTO push_subscriptions (user_key, endpoint, p256dh, auth, user_agent)
  VALUES ('participant:' || v_reg::text, p_endpoint, p_p256dh, p_auth, p_ua)
  ON CONFLICT (endpoint) DO UPDATE
    SET user_key = EXCLUDED.user_key, p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent;
  RETURN true;
END; $$;
REVOKE EXECUTE ON FUNCTION push_subscribe_participant(text,text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION push_subscribe_participant(text,text,text,text,text) TO anon, authenticated;
```

- [ ] **Step 3: push_subscribe_mentor** (modo link, por `access_token`)

```sql
CREATE OR REPLACE FUNCTION push_subscribe_mentor(
  p_access_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mentor uuid;
BEGIN
  SELECT id INTO v_mentor FROM mentors WHERE access_token = p_access_token;
  IF v_mentor IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;

  INSERT INTO push_subscriptions (user_key, endpoint, p256dh, auth, user_agent)
  VALUES ('mentor:' || v_mentor::text, p_endpoint, p_p256dh, p_auth, p_ua)
  ON CONFLICT (endpoint) DO UPDATE
    SET user_key = EXCLUDED.user_key, p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent;
  RETURN true;
END; $$;
REVOKE EXECUTE ON FUNCTION push_subscribe_mentor(text,text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION push_subscribe_mentor(text,text,text,text,text) TO anon, authenticated;
```

> O mentor por sessão (email+código) usa o mesmo `access_token`? Se o front do mentor só tem o `token` de sessão e não o `access_token`, exponha também `push_subscribe_mentor_session(p_token, ...)` resolvendo via `mentor_sessions`. Decidir no Step 1 conforme as definições reais; criar a 2ª função se necessário (mesmo corpo, resolução diferente).

- [ ] **Step 4: push_subscribe_admin** (usa JWT)

```sql
CREATE OR REPLACE FUNCTION push_subscribe_admin(
  p_endpoint text, p_p256dh text, p_auth text, p_ua text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  INSERT INTO push_subscriptions (user_key, endpoint, p256dh, auth, user_agent)
  VALUES ('admin:' || v_uid::text, p_endpoint, p_p256dh, p_auth, p_ua)
  ON CONFLICT (endpoint) DO UPDATE
    SET user_key = EXCLUDED.user_key, p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent;
  RETURN true;
END; $$;
REVOKE EXECUTE ON FUNCTION push_subscribe_admin(text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION push_subscribe_admin(text,text,text,text) TO authenticated;

-- Remoção (logout/desativar) por endpoint — qualquer silo.
CREATE OR REPLACE FUNCTION push_unsubscribe(p_endpoint text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM push_subscriptions WHERE endpoint = p_endpoint;
  RETURN true;
END; $$;
REVOKE EXECUTE ON FUNCTION push_unsubscribe(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION push_unsubscribe(text) TO anon, authenticated;
```

- [ ] **Step 5: Aplicar e verificar**

Aplicar via MCP `apply_migration` (arquivo inteiro). Verificar:

```sql
SELECT proname FROM pg_proc WHERE proname LIKE 'push_subscribe%' OR proname='push_unsubscribe';
```

Expected: `push_subscribe_participant`, `push_subscribe_mentor`, `push_subscribe_admin`, `push_unsubscribe` (e a variante de sessão se criada).

- [ ] **Step 6: Commit**

```bash
git -c safe.directory='*' add migrations/add_push_notifications.sql
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(push): RPCs de inscrição por silo (participante/mentor/admin)"
```

---

### Task 4: RPCs de leitura do sininho (list + mark_read)

**Files:**

- Modify: `migrations/add_push_notifications.sql` (append)

- [ ] **Step 1: list/mark_read do participante**

```sql
CREATE OR REPLACE FUNCTION notifications_list_participant(p_token text, p_limit int DEFAULT 30)
RETURNS TABLE(id uuid, title text, body text, url text, event_key text, created_at timestamptz, read boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reg uuid;
BEGIN
  SELECT registration_id INTO v_reg FROM participant_sessions
   WHERE token = p_token AND (expires_at IS NULL OR expires_at > now());
  IF v_reg IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  RETURN QUERY
    SELECT n.id, n.title, n.body, n.url, n.event_key, n.created_at, (r.read_at IS NOT NULL)
      FROM notification_recipients r JOIN notifications n ON n.id = r.notification_id
     WHERE r.user_key = 'participant:' || v_reg::text
     ORDER BY n.created_at DESC LIMIT p_limit;
END; $$;
REVOKE EXECUTE ON FUNCTION notifications_list_participant(text,int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION notifications_list_participant(text,int) TO anon, authenticated;

CREATE OR REPLACE FUNCTION notifications_mark_read_participant(p_token text, p_ids uuid[])
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reg uuid;
BEGIN
  SELECT registration_id INTO v_reg FROM participant_sessions
   WHERE token = p_token AND (expires_at IS NULL OR expires_at > now());
  IF v_reg IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  UPDATE notification_recipients SET read_at = now()
   WHERE user_key = 'participant:' || v_reg::text
     AND notification_id = ANY(p_ids) AND read_at IS NULL;
  RETURN true;
END; $$;
REVOKE EXECUTE ON FUNCTION notifications_mark_read_participant(text,uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION notifications_mark_read_participant(text,uuid[]) TO anon, authenticated;
```

- [ ] **Step 2: list/mark_read do mentor** (mesma forma, resolvendo `mentor:` por `access_token`)

```sql
CREATE OR REPLACE FUNCTION notifications_list_mentor(p_access_token text, p_limit int DEFAULT 30)
RETURNS TABLE(id uuid, title text, body text, url text, event_key text, created_at timestamptz, read boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mentor uuid;
BEGIN
  SELECT id INTO v_mentor FROM mentors WHERE access_token = p_access_token;
  IF v_mentor IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  RETURN QUERY
    SELECT n.id, n.title, n.body, n.url, n.event_key, n.created_at, (r.read_at IS NOT NULL)
      FROM notification_recipients r JOIN notifications n ON n.id = r.notification_id
     WHERE r.user_key = 'mentor:' || v_mentor::text
     ORDER BY n.created_at DESC LIMIT p_limit;
END; $$;
REVOKE EXECUTE ON FUNCTION notifications_list_mentor(text,int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION notifications_list_mentor(text,int) TO anon, authenticated;

CREATE OR REPLACE FUNCTION notifications_mark_read_mentor(p_access_token text, p_ids uuid[])
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mentor uuid;
BEGIN
  SELECT id INTO v_mentor FROM mentors WHERE access_token = p_access_token;
  IF v_mentor IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  UPDATE notification_recipients SET read_at = now()
   WHERE user_key = 'mentor:' || v_mentor::text
     AND notification_id = ANY(p_ids) AND read_at IS NULL;
  RETURN true;
END; $$;
REVOKE EXECUTE ON FUNCTION notifications_mark_read_mentor(text,uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION notifications_mark_read_mentor(text,uuid[]) TO anon, authenticated;
```

- [ ] **Step 3: list/mark_read do admin** (JWT)

```sql
CREATE OR REPLACE FUNCTION notifications_list_admin(p_limit int DEFAULT 30)
RETURNS TABLE(id uuid, title text, body text, url text, event_key text, created_at timestamptz, read boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN QUERY
    SELECT n.id, n.title, n.body, n.url, n.event_key, n.created_at, (r.read_at IS NOT NULL)
      FROM notification_recipients r JOIN notifications n ON n.id = r.notification_id
     WHERE r.user_key = 'admin:' || v_uid::text
     ORDER BY n.created_at DESC LIMIT p_limit;
END; $$;
REVOKE EXECUTE ON FUNCTION notifications_list_admin(int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION notifications_list_admin(int) TO authenticated;

CREATE OR REPLACE FUNCTION notifications_mark_read_admin(p_ids uuid[])
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE notification_recipients SET read_at = now()
   WHERE user_key = 'admin:' || v_uid::text AND notification_id = ANY(p_ids) AND read_at IS NULL;
  RETURN true;
END; $$;
REVOKE EXECUTE ON FUNCTION notifications_mark_read_admin(uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION notifications_mark_read_admin(uuid[]) TO authenticated;
```

- [ ] **Step 4: Aplicar e verificar**

Aplicar via MCP. Verificar:

```sql
SELECT proname FROM pg_proc WHERE proname LIKE 'notifications_list%' OR proname LIKE 'notifications_mark_read%';
```

Expected: 6 funções.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory='*' add migrations/add_push_notifications.sql
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(push): RPCs de leitura do sininho (list/mark_read por silo)"
```

---

### Task 5: broadcast_notification + histórico admin

**Files:**

- Modify: `migrations/add_push_notifications.sql` (append)

- [ ] **Step 1: broadcast_notification**

```sql
CREATE OR REPLACE FUNCTION broadcast_notification(
  p_title text, p_body text, p_audience_kind text, p_team_ids uuid[] DEFAULT NULL, p_url text DEFAULT '#participante'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_aud jsonb; v_id uuid;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_audience_kind NOT IN ('all_participants','all_mentors','participants_and_mentors','teams_members') THEN
    RAISE EXCEPTION 'invalid_audience';
  END IF;
  IF p_audience_kind = 'teams_members' THEN
    v_aud := jsonb_build_object('kind','teams_members','team_ids', to_jsonb(p_team_ids));
  ELSE
    v_aud := jsonb_build_object('kind', p_audience_kind);
  END IF;

  INSERT INTO notifications (event_key, title, body, url, audience, created_by)
  VALUES ('broadcast', p_title, p_body, p_url, v_aud, 'admin:' || coalesce(auth.uid()::text,'?'))
  RETURNING id INTO v_id;
  PERFORM expand_recipients(v_id, v_aud);
  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION broadcast_notification(text,text,text,uuid[],text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION broadcast_notification(text,text,text,uuid[],text) TO authenticated;
```

- [ ] **Step 2: admin_notifications_history**

```sql
CREATE OR REPLACE FUNCTION admin_notifications_history(p_limit int DEFAULT 50)
RETURNS TABLE(id uuid, event_key text, title text, body text, audience jsonb, recipients bigint, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
    SELECT n.id, n.event_key, n.title, n.body, n.audience,
           (SELECT count(*) FROM notification_recipients r WHERE r.notification_id = n.id),
           n.created_at
      FROM notifications n ORDER BY n.created_at DESC LIMIT p_limit;
END; $$;
REVOKE EXECUTE ON FUNCTION admin_notifications_history(int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION admin_notifications_history(int) TO authenticated;

-- Lista de times para o seletor de broadcast (id + nome).
CREATE OR REPLACE FUNCTION admin_teams_for_broadcast()
RETURNS TABLE(id uuid, name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT t.id, t.name FROM teams t ORDER BY t.name;
END; $$;
REVOKE EXECUTE ON FUNCTION admin_teams_for_broadcast() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION admin_teams_for_broadcast() TO authenticated;
```

> Confirme que `teams` tem coluna `name` (Step 4). Se for `team_name`/outro, ajuste.

- [ ] **Step 3: Aplicar e testar broadcast**

Aplicar via MCP. Testar (como o MCP roda fora de um JWT admin, o `is_admin()` pode falhar — então testar a expansão diretamente já foi feito na Task 2; aqui só verificar que a função existe):

```sql
SELECT proname FROM pg_proc WHERE proname IN ('broadcast_notification','admin_notifications_history','admin_teams_for_broadcast');
```

Expected: 3 linhas.

- [ ] **Step 4: Verificar coluna de `teams`**

```sql
SELECT column_name FROM information_schema.columns WHERE table_name='teams' AND column_name IN ('name','team_name');
```

Expected: `name` presente (ajustar se for outro).

- [ ] **Step 5: Commit**

```bash
git -c safe.directory='*' add migrations/add_push_notifications.sql
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(push): broadcast manual segmentado + histórico admin"
```

---

### Task 6: Triggers (pagamento, entrega, mentor designado)

**Files:**

- Modify: `migrations/add_push_notifications.sql` (append)

- [ ] **Step 1: Confirmar colunas-gatilho**

Run (MCP `execute_sql`):

```sql
SELECT column_name FROM information_schema.columns WHERE table_name='registrations' AND column_name IN ('payment_status','full_name','team_id');
SELECT column_name FROM information_schema.columns WHERE table_name='team_deliverables' AND column_name IN ('status','team_id');
SELECT column_name FROM information_schema.columns WHERE table_name='mentor_teams' AND column_name IN ('mentor_id','team_id');
```

Expected: colunas presentes. Ajustar nomes nos triggers abaixo se divergir (ex.: nome do participante).

- [ ] **Step 2: Trigger de pagamento confirmado**

```sql
CREATE OR REPLACE FUNCTION trg_notify_payment_confirmed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.payment_status = 'confirmed' AND COALESCE(OLD.payment_status,'') <> 'confirmed' THEN
    PERFORM notify_event('payment_confirmed',
      'Inscrição confirmada ✅',
      'Bem-vindo(a) ao HackIA SC! Seu acesso está liberado.',
      '#participante',
      jsonb_build_object('kind','participant','reg_id', NEW.id::text));
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS notify_payment_confirmed ON registrations;
CREATE TRIGGER notify_payment_confirmed AFTER UPDATE OF payment_status ON registrations
  FOR EACH ROW EXECUTE FUNCTION trg_notify_payment_confirmed();
```

- [ ] **Step 3: Trigger de entrega submetida** (notifica mentores do time)

```sql
CREATE OR REPLACE FUNCTION trg_notify_deliverable_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'submitted' AND COALESCE(OLD.status,'') <> 'submitted' THEN
    PERFORM notify_event('deliverable_submitted',
      'Nova entrega para revisar 📦',
      'Um time enviou uma entrega.',
      '#mentor',
      jsonb_build_object('kind','team_mentors','team_id', NEW.team_id::text));
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS notify_deliverable_submitted ON team_deliverables;
CREATE TRIGGER notify_deliverable_submitted AFTER UPDATE OF status ON team_deliverables
  FOR EACH ROW EXECUTE FUNCTION trg_notify_deliverable_submitted();
```

> Se entregas forem criadas já como `submitted` (INSERT, não UPDATE draft→submitted), adicione um trigger `AFTER INSERT` análogo checando `NEW.status='submitted'`.

- [ ] **Step 4: Trigger de mentor designado**

```sql
CREATE OR REPLACE FUNCTION trg_notify_mentor_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_team text;
BEGIN
  SELECT name INTO v_team FROM teams WHERE id = NEW.team_id;
  PERFORM notify_event('mentor_assigned',
    'Você foi designado a um time 🎓',
    'Time: ' || COALESCE(v_team,'(sem nome)'),
    '#mentor',
    jsonb_build_object('kind','mentor','mentor_id', NEW.mentor_id::text));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS notify_mentor_assigned ON mentor_teams;
CREATE TRIGGER notify_mentor_assigned AFTER INSERT ON mentor_teams
  FOR EACH ROW EXECUTE FUNCTION trg_notify_mentor_assigned();
```

- [ ] **Step 5: Aplicar e verificar triggers**

Aplicar via MCP. Verificar:

```sql
SELECT tgname FROM pg_trigger WHERE tgname LIKE 'notify_%';
```

Expected: `notify_payment_confirmed`, `notify_deliverable_submitted`, `notify_mentor_assigned`.

- [ ] **Step 6: Commit**

```bash
git -c safe.directory='*' add migrations/add_push_notifications.sql
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(push): triggers de pagamento, entrega e designação de mentor"
```

---

### Task 7: Ligar notify_event nas RPCs existentes + cronograma

**Files:**

- Create: `migrations/wire_notify_events.sql`
- Modify (refletir o source final): `migrations/add_sugar_cubes.sql`, `add_team_scores_visibility.sql`, `add_wall_results_phase.sql`, `add_schedule.sql`, `add_team_lunch.sql`, `add_slides_deadline.sql`, e a migration do `evaluation_open`.

> Estratégia: `wire_notify_events.sql` recria cada função existente com `CREATE OR REPLACE`, idêntica à original **mais** a chamada a `notify_event`. Antes de escrever cada uma, obtenha o corpo atual com `pg_get_functiondef(...)` e cole-o, inserindo a linha de notify no ponto certo. Abaixo, o ponto de inserção e a chamada exata para cada uma.

- [ ] **Step 1: Obter os corpos atuais**

Run (MCP `execute_sql`):

```sql
SELECT pg_get_functiondef('set_sugar_released(boolean)'::regprocedure);
SELECT pg_get_functiondef('set_team_scores_visible(boolean)'::regprocedure);
SELECT pg_get_functiondef('wall_set_phase(text)'::regprocedure);
SELECT pg_get_functiondef('set_announcement(text)'::regprocedure);
SELECT pg_get_functiondef('set_team_lunch(uuid,boolean)'::regprocedure);
SELECT pg_get_functiondef('set_slides_deadline(timestamptz)'::regprocedure);
-- evaluation_open: descobrir a assinatura
SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname LIKE '%evaluation_open%';
```

Copiar cada corpo para `wire_notify_events.sql`.

- [ ] **Step 2: Inserir as chamadas notify_event (uma por função)**

Em cada função recriada, **antes do `RETURN`**, inserir:

`set_sugar_released` — só quando liga (OFF→ON). Como a função não tem o valor antigo, checar antes do upsert:

```sql
  IF p_bool AND COALESCE((SELECT value FROM app_settings WHERE key='sugar_released'),'false') <> 'true' THEN
    PERFORM notify_event('sugar_released','Mural de elogios liberado 🍬',
      'Veja o que escreveram sobre você!', '#participante',
      jsonb_build_object('kind','all_participants'));
  END IF;
```

(colocar esse bloco **antes** do `INSERT ... ON CONFLICT`, que sobrescreve o valor.)

`set_team_scores_visible` — análogo, antes do upsert:

```sql
  IF p_visible AND COALESCE((SELECT value FROM app_settings WHERE key='team_scores_visible'),'false') <> 'true' THEN
    PERFORM notify_event('team_scores_visible','Notas da IA disponíveis 📊',
      'As notas do seu time já podem ser vistas.', '#participante',
      jsonb_build_object('kind','all_participants'));
  END IF;
```

`wall_set_phase` — após gravar a fase, mensagem condicional por fase:

```sql
  IF p_phase = 'wall_open' THEN
    PERFORM notify_event('wall_phase','Muro de Dores aberto 🧱','Envie sua dor agora!', '#muro',
      jsonb_build_object('kind','all_participants'));
  ELSIF p_phase = 'voting_open' THEN
    PERFORM notify_event('wall_phase','Votação aberta 🗳️','Vote nas dores que mais importam.', '#muro',
      jsonb_build_object('kind','all_participants'));
  ELSIF p_phase = 'results' THEN
    PERFORM notify_event('wall_phase','Resultados no telão 🏆','Veja as dores mais votadas.', '#muro',
      jsonb_build_object('kind','all_participants'));
  END IF;
```

(confirmar os valores exatos de fase em `add_wall_results_phase.sql`.)

`set_announcement` — após gravar, usar o próprio texto:

```sql
  IF p_body IS NOT NULL AND length(trim(p_body)) > 0 THEN
    PERFORM notify_event('announcement','Aviso 📣', p_body, '#participante',
      jsonb_build_object('kind','all_participants'));
  END IF;
```

`set_team_lunch` — só quando marca como liberado (`p_done = true`):

```sql
  IF p_done THEN
    PERFORM notify_event('team_lunch','Almoço liberado 🍽️','O almoço do seu time foi liberado!', '#participante',
      jsonb_build_object('kind','team_members','team_id', p_team_id::text));
  END IF;
```

`set_slides_deadline` — após gravar:

```sql
  IF p_deadline IS NOT NULL THEN
    PERFORM notify_event('slides_deadline','Prazo dos slides ⏰',
      'Novo prazo definido: ' || to_char(p_deadline AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI'),
      '#participante', jsonb_build_object('kind','all_participants'));
  END IF;
```

`set_evaluation_open` (ou nome real) — quando liga:

```sql
  IF <liga> THEN
    PERFORM notify_event('evaluation_open','Avaliação do evento aberta 📝',
      'Leva 2 minutos e ajuda demais. Responda!', '#participante',
      jsonb_build_object('kind','participants_and_mentors'));
  END IF;
```

- [ ] **Step 3: Gancho do cronograma (schedule_start)**

Descobrir como o item do cronograma é "iniciado":

```sql
SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname LIKE '%schedule%';
SELECT column_name FROM information_schema.columns WHERE table_name='schedule_items';
```

Casos:

- **Se há uma RPC** que marca o item atual (ex.: `set_current_schedule_item(p_id)` / `mark_schedule_started(p_id)`): recriá-la em `wire_notify_events.sql` adicionando:

```sql
  PERFORM notify_event('schedule_start','Começou agora ▶️',
    (SELECT title FROM schedule_items WHERE id = p_id), '#participante',
    jsonb_build_object('kind','all_participants'));
```

- **Se o início é um UPDATE direto** de uma coluna (ex.: `started_at`/`is_current`): criar um trigger `AFTER UPDATE` em `schedule_items`:

```sql
CREATE OR REPLACE FUNCTION trg_notify_schedule_start()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.started_at IS NOT NULL AND OLD.started_at IS NULL THEN
    PERFORM notify_event('schedule_start','Começou agora ▶️', NEW.title, '#participante',
      jsonb_build_object('kind','all_participants'));
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS notify_schedule_start ON schedule_items;
CREATE TRIGGER notify_schedule_start AFTER UPDATE ON schedule_items
  FOR EACH ROW EXECUTE FUNCTION trg_notify_schedule_start();
```

Usar o caminho que corresponder ao código real do `AdminFacilitator`. Ajustar nomes de coluna (`title`, `started_at`).

- [ ] **Step 4: Aplicar e verificar**

Aplicar `wire_notify_events.sql` via MCP `apply_migration`. Verificar que as funções ainda existem e que um teste manual de uma flag gera notificação:

```sql
-- exemplo: simular liga do mural com um admin (rodar via painel admin no app é o teste real;
-- aqui apenas confirmar que a definição contém notify_event)
SELECT pg_get_functiondef('set_sugar_released(boolean)'::regprocedure) LIKE '%notify_event%';
```

Expected: `true` para cada função tocada.

- [ ] **Step 5: Atualizar os arquivos-fonte das migrations**

Copiar cada função final (de `pg_get_functiondef`) de volta para o respectivo arquivo em `migrations/` (ex.: a nova `set_sugar_released` em `add_sugar_cubes.sql`), para o repo refletir o estado do banco. Não re-aplicar.

- [ ] **Step 6: Commit**

```bash
git -c safe.directory='*' add migrations/
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(push): dispara notify_event nas RPCs de eventos + cronograma"
```

---

## Phase 2 — Edge Function + Webhook

### Task 8: Edge Function `send-push`

**Files:**

- Create: `supabase/functions/send-push/index.ts`

- [ ] **Step 1: Escrever a função**

```ts
// supabase/functions/send-push/index.ts
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT =
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@hackiasc.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    // Database Webhook envia { type:'INSERT', record:{...}, ... }
    const notif = payload.record ?? payload;
    if (!notif?.id) return new Response("no notification id", { status: 400 });

    const { data: recips } = await admin
      .from("notification_recipients")
      .select("user_key")
      .eq("notification_id", notif.id);
    const userKeys = [...new Set((recips ?? []).map((r) => r.user_key))];
    if (userKeys.length === 0)
      return new Response("no recipients", { status: 200 });

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_key", userKeys);

    const body = JSON.stringify({
      title: notif.title,
      body: notif.body,
      url: notif.url ?? "#participante",
      tag: notif.id,
    });

    let sent = 0;
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }
    return new Response(
      JSON.stringify({
        recipients: userKeys.length,
        subscriptions: subs?.length ?? 0,
        sent,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    return new Response(`error: ${e}`, { status: 500 });
  }
});
```

- [ ] **Step 2: Setar secrets da função**

No painel Supabase (Edge Functions → Secrets) ou via CLI, definir: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto). `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem por padrão no ambiente de funções.

> **Ação humana:** colar os secrets. Pause e peça ao usuário se não tiver acesso ao painel.

- [ ] **Step 3: Deploy via MCP**

Usar MCP `deploy_edge_function` (name: `send-push`, arquivo: `supabase/functions/send-push/index.ts`). Confirmar com MCP `list_edge_functions` que `send-push` aparece como deployed.

- [ ] **Step 4: Teste manual da função**

Criar uma notificação de teste e invocar a função com o payload do webhook (ainda sem subscriptions reais, deve retornar `subscriptions: 0`):

```sql
SELECT notify_event('announcement','Ping','teste edge','#participante', jsonb_build_object('kind','all_participants'));
```

Pegar o id e invocar a função (via `curl` para a URL da função, header `Authorization: Bearer <anon ou service>`):

```bash
curl -s -X POST "<FUNCTION_URL>/send-push" \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"record":{"id":"<NID>","title":"Ping","body":"teste","url":"#participante"}}'
```

Expected: JSON `{ recipients: >0, subscriptions: 0, sent: 0 }`. Limpar: `DELETE FROM notifications WHERE title='Ping';`

- [ ] **Step 5: Commit**

```bash
git -c safe.directory='*' add supabase/functions/send-push/index.ts
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(push): edge function send-push (Web Push VAPID)"
```

---

### Task 9: Database Webhook em `notifications`

**Files:** (configuração no Supabase; opcionalmente registrar SQL em `migrations/add_push_notifications.sql`)

- [ ] **Step 1: Criar o webhook**

No painel Supabase → Database → Webhooks → Create:

- Table: `notifications`, Events: `INSERT`.
- Type: Supabase Edge Function → `send-push`.
- Method POST; incluir header de auth (service role) conforme o painel.

(Alternativa por SQL com `pg_net` + `supabase_functions.http_request`: registrar o trigger no fim de `add_push_notifications.sql`. Preferir o painel pela simplicidade e por gerenciar o secret de auth.)

- [ ] **Step 2: Verificação end-to-end (sem device ainda)**

Inserir notificação e checar os logs da função (MCP `get_logs` ou painel):

```sql
SELECT notify_event('announcement','Webhook OK','teste','#participante', jsonb_build_object('kind','all_participants'));
```

Expected: nos logs da `send-push`, uma execução automática logo após o insert. Limpar a notificação de teste.

> O push real só será visível após a Phase 4 (device inscrito). Aqui validamos só o disparo automático.

- [ ] **Step 3: Commit (se registrou SQL)**

```bash
git -c safe.directory='*' add migrations/add_push_notifications.sql
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "chore(push): webhook de notifications -> send-push"
```

---

## Phase 3 — Service Worker + PWA

### Task 10: Service worker

**Files:**

- Create: `public/sw.js`

- [ ] **Step 1: Escrever o service worker**

```js
/* public/sw.js — push + clique. Servido de hackiasc.com (escopo '/'). */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "HackIA SC";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag,
    data: { url: data.url || "#participante" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target =
    (event.notification.data && event.notification.data.url) || "#participante";
  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const url =
        self.location.origin +
        "/" +
        (target.startsWith("#") ? target : "#" + target);
      for (const c of all) {
        if ("focus" in c) {
          c.postMessage({ type: "navigate", url: target });
          return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })(),
  );
});
```

- [ ] **Step 2: Verificar build copia public/**

Run:

```bash
npm run build
```

Expected: build OK; `dist/sw.js`, `dist/icons/` presentes (após Task 11). Por ora, confirmar `dist/sw.js`.

- [ ] **Step 3: Commit**

```bash
git -c safe.directory='*' add public/sw.js
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(push): service worker (push + notificationclick)"
```

---

### Task 11: Manifest + ícones PWA

**Files:**

- Create: `public/manifest.webmanifest`, `public/icons/icon-192.png`, `icon-512.png`, `icon-192-maskable.png`, `icon-512-maskable.png`
- Modify: `index.html`

- [ ] **Step 1: Gerar ícones**

A partir do logo/favicon existente (ver `public/`), gerar PNGs 192×192 e 512×512 (normal e maskable). Se houver `sharp`/ImageMagick:

```bash
# exemplo com ImageMagick a partir de um logo quadrado público existente
magick public/<logo>.png -resize 192x192 public/icons/icon-192.png
magick public/<logo>.png -resize 512x512 public/icons/icon-512.png
cp public/icons/icon-192.png public/icons/icon-192-maskable.png
cp public/icons/icon-512.png public/icons/icon-512-maskable.png
```

> **Ação humana possível:** se não houver logo quadrado adequado, peça o asset ao usuário. Não deixar ícones quebrados.

- [ ] **Step 2: manifest.webmanifest**

```json
{
  "name": "HackIA SC",
  "short_name": "HackIA",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#050510",
  "theme_color": "#050510",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    {
      "src": "/icons/icon-192-maskable.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/icon-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

- [ ] **Step 3: Linkar no index.html**

No `<head>` de `index.html`, adicionar:

```html
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#050510" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="HackIA" />
```

- [ ] **Step 4: Verificar build**

```bash
npm run build
```

Expected: `dist/manifest.webmanifest` e `dist/icons/*` presentes; `dist/index.html` com o link do manifest.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory='*' add public/manifest.webmanifest public/icons index.html
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(push): PWA instalável (manifest + ícones + meta iOS)"
```

---

### Task 12: Registrar o service worker

**Files:**

- Modify: `src/main.jsx`

- [ ] **Step 1: Registrar o SW após o mount**

Editar `src/main.jsx` para registrar o SW e ouvir navegação vinda do clique na notificação:

```jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import UpdateBanner from "./components/UpdateBanner.jsx";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* sem SW: degrada */
    });
  });
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type === "navigate" && e.data.url) {
      window.location.hash = e.data.url;
    }
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
    <UpdateBanner />
  </StrictMode>,
);
```

- [ ] **Step 2: Verificar (dev + lint)**

```bash
npm run lint
npm run build
```

Expected: sem erros. (Em dev, `navigator.serviceWorker` registra `/sw.js`; o SW só roda em https/localhost.)

- [ ] **Step 3: Commit**

```bash
git -c safe.directory='*' add src/main.jsx
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(push): registra service worker no boot"
```

---

## Phase 4 — Inscrição + Prompt (frontend)

### Task 13: `src/lib/push.js` + helpers testáveis

**Files:**

- Create: `src/lib/push.js`, `src/lib/push.test.js`

- [ ] **Step 1: Escrever o teste dos helpers puros (vitest, env node)**

```js
// src/lib/push.test.js
import { describe, it, expect } from "vitest";
import {
  isIOS,
  isStandalone,
  urlBase64ToUint8Array,
  shouldShowPrompt,
} from "./push";

describe("isIOS", () => {
  it("detecta iPhone", () => {
    expect(
      isIOS("Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)"),
    ).toBe(true);
  });
  it("falso no Android", () => {
    expect(isIOS("Mozilla/5.0 (Linux; Android 13)")).toBe(false);
  });
});

describe("urlBase64ToUint8Array", () => {
  it("decodifica base64url para Uint8Array", () => {
    const out = urlBase64ToUint8Array("BBBB");
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("shouldShowPrompt", () => {
  it("mostra quando permission=default e sem snooze", () => {
    expect(shouldShowPrompt("default", 0, 1000)).toBe(true);
  });
  it("não mostra se granted", () => {
    expect(shouldShowPrompt("granted", 0, 1000)).toBe(false);
  });
  it("não mostra se denied", () => {
    expect(shouldShowPrompt("denied", 0, 1000)).toBe(false);
  });
  it("respeita snooze de 15min (não expirado)", () => {
    const now = 1_000_000;
    const snoozedUntil = now + 60_000;
    expect(shouldShowPrompt("default", snoozedUntil, now)).toBe(false);
  });
  it("mostra após o snooze expirar", () => {
    const now = 1_000_000;
    const snoozedUntil = now - 1;
    expect(shouldShowPrompt("default", snoozedUntil, now)).toBe(true);
  });
});

describe("isStandalone", () => {
  it("true quando navigator.standalone", () => {
    expect(isStandalone({ standalone: true }, () => false)).toBe(true);
  });
  it("true quando matchMedia standalone", () => {
    expect(isStandalone({}, (q) => q.includes("standalone"))).toBe(true);
  });
  it("false caso contrário", () => {
    expect(isStandalone({}, () => false)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
npx vitest run src/lib/push.test.js
```

Expected: FAIL (módulo `./push` não existe / exports indefinidos).

- [ ] **Step 3: Implementar `src/lib/push.js`**

```js
// src/lib/push.js
import { supabase } from "./supabase";

export const SNOOZE_KEY = "hackiasc_push_snooze_until";
export const SNOOZE_MS = 15 * 60 * 1000; // 15 min

// --- helpers puros (testáveis) ---
export function isIOS(ua = navigator.userAgent) {
  return /iphone|ipad|ipod/i.test(ua);
}

export function isStandalone(
  nav = navigator,
  matches = (q) => window.matchMedia(q).matches,
) {
  if (nav && nav.standalone) return true;
  try {
    return matches("(display-mode: standalone)");
  } catch {
    return false;
  }
}

export function shouldShowPrompt(permission, snoozedUntil, now = Date.now()) {
  if (permission !== "default") return false;
  return now >= (snoozedUntil || 0);
}

export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// --- efeitos (browser) ---
export function getSnoozeUntil() {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY)) || 0;
  } catch {
    return 0;
  }
}
export function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
  } catch {
    /* ignore */
  }
}

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;

// Inscreve o device e persiste via RPC do silo. auth = { kind, token }
export async function enablePush(auth) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("unsupported");
  }
  if (!VAPID_PUBLIC) throw new Error("no_vapid_key");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, permission };

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }
  const json = sub.toJSON();
  const args = {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_ua: navigator.userAgent,
  };

  if (!supabase) return { ok: false, permission };
  if (auth.kind === "participant") {
    await supabase.rpc("push_subscribe_participant", {
      p_token: auth.token,
      ...args,
    });
  } else if (auth.kind === "mentor") {
    await supabase.rpc("push_subscribe_mentor", {
      p_access_token: auth.token,
      ...args,
    });
  } else if (auth.kind === "admin") {
    await supabase.rpc("push_subscribe_admin", args);
  }
  return { ok: true, permission };
}
```

> **Atenção mentor:** `enablePush` para mentor usa `p_access_token`. No modo sessão (email+código) o front tem `token` de sessão, não `access_token`. Se necessário (Task 3 Step 3), adicionar um ramo que chame `push_subscribe_mentor_session`. Decidir conforme a Task 3.

- [ ] **Step 4: Rodar o teste e ver passar**

```bash
npx vitest run src/lib/push.test.js
```

Expected: PASS (todos os casos). Os helpers de efeito não são cobertos por unit test (browser-only) — verificados manualmente na Task 14.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory='*' add src/lib/push.js src/lib/push.test.js
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(push): lib de inscrição + helpers (testados)"
```

---

### Task 14: `EnablePushPrompt` + montagem nos painéis

**Files:**

- Create: `src/components/EnablePushPrompt.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Componente do prompt**

```jsx
// src/components/EnablePushPrompt.jsx
import { useEffect, useState } from "react";
import {
  isIOS,
  isStandalone,
  shouldShowPrompt,
  getSnoozeUntil,
  snooze,
  enablePush,
} from "../lib/push";

// auth: { kind: 'participant'|'mentor'|'admin', token?: string }
export default function EnablePushPrompt({ auth }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const iosNeedsInstall = isIOS() && !isStandalone();

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const perm = Notification.permission;
    if (perm === "denied") return;
    // já concedido sem subscription ativa -> re-subscribe silencioso
    if (perm === "granted") {
      enablePush(auth).catch(() => {});
      return;
    }
    if (shouldShowPrompt(perm, getSnoozeUntil())) setVisible(true);
  }, [auth]);

  if (!visible) return null;

  async function handleEnable() {
    setBusy(true);
    try {
      const res = await enablePush(auth);
      if (res.permission === "denied") setDenied(true);
      if (res.ok) setVisible(false);
    } catch {
      /* unsupported/no key */ setVisible(false);
    } finally {
      setBusy(false);
    }
  }
  function handleLater() {
    snooze();
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] p-4 sm:p-6 flex justify-center pointer-events-none">
      <div className="pointer-events-auto card-glass max-w-md w-full p-5 rounded-2xl border border-cyan/20 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🔔</span>
          <div className="flex-1">
            <h3 className="font-display text-white font-semibold">
              Ative os avisos
            </h3>
            <p className="text-white/60 text-sm mt-1">
              Receba avisos do evento (mural liberado, notas, cronograma,
              votação) mesmo com o app fechado.
            </p>

            {denied && (
              <p className="text-hot/80 text-xs mt-2">
                As notificações estão bloqueadas no navegador. Habilite nas
                configurações do site para receber avisos.
              </p>
            )}

            {iosNeedsInstall ? (
              <div className="text-white/70 text-xs mt-3 space-y-1">
                <p className="font-medium text-white/90">
                  No iPhone, primeiro instale o app:
                </p>
                <p>
                  1. Toque em <strong>Compartilhar</strong> (ícone ⬆️) no
                  Safari.
                </p>
                <p>
                  2. Escolha <strong>Adicionar à Tela de Início</strong>.
                </p>
                <p>
                  3. Abra o app pela tela inicial e ative os avisos por aqui.
                </p>
                <button
                  onClick={handleLater}
                  className="mt-2 text-white/50 hover:text-white/80 text-xs"
                >
                  Agora não
                </button>
              </div>
            ) : (
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleEnable}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-cyan/20 text-cyan border border-cyan/30 text-sm font-medium hover:bg-cyan/30 disabled:opacity-50"
                >
                  {busy ? "Ativando…" : "Ativar"}
                </button>
                <button
                  onClick={handleLater}
                  className="px-4 py-2 rounded-lg text-white/50 hover:text-white/80 text-sm"
                >
                  Agora não
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Montar nas rotas certas (App.jsx)**

Em `src/App.jsx`, importar e renderizar dentro de cada bloco autenticado — **nunca** no bloco de `#jurado`:

- Admin (após `return <AdminPanel ... />`, linha ~90): envolver em fragment:

```jsx
return (
  <>
    <AdminPanel onLogout={logout} role={role} />
    <EnablePushPrompt auth={{ kind: "admin" }} />
  </>
);
```

- Participante (linha ~113):

```jsx
return (
  <>
    <ParticipantPanel auth={participantAuth} />
    <EnablePushPrompt
      auth={{ kind: "participant", token: participantAuth.token }}
    />
  </>
);
```

- Mentor (linha ~136):

```jsx
return (
  <>
    <MentorPanel auth={mentorAuth} />
    <EnablePushPrompt auth={{ kind: "mentor", token: mentorAuth.token }} />
  </>
);
```

Import no topo: `import EnablePushPrompt from './components/EnablePushPrompt'`

> Não montar em `#jurado`, telão, vitrine ou landing.

- [ ] **Step 3: Lint + build**

```bash
npm run lint && npm run build
```

Expected: sem erros.

- [ ] **Step 4: Verificação manual (browser real, https/localhost)**

`npm run preview` → abrir `http://localhost:4173/#participante`, logar como participante de teste. Esperado: card "Ative os avisos" aparece; clicar **Ativar** → diálogo nativo do navegador; conceder → card some; conferir no banco:

```sql
SELECT user_key, left(endpoint, 40) FROM push_subscriptions ORDER BY created_at DESC LIMIT 3;
```

Expected: 1 linha `participant:<id>`. Em seguida disparar um broadcast pela aba admin (Task 17) ou `notify_event` e confirmar que o push chega (notificação do SO).

- [ ] **Step 5: Commit**

```bash
git -c safe.directory='*' add src/components/EnablePushPrompt.jsx src/App.jsx
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(push): prompt pós-login (exceto jurados) com fluxo iOS"
```

---

## Phase 5 — Sininho in-app

### Task 15: `useNotifications` hook

**Files:**

- Create: `src/hooks/useNotifications.js`

- [ ] **Step 1: Escrever o hook**

```js
// src/hooks/useNotifications.js
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

const POLL_MS = 30000;

// auth: { kind: 'participant'|'mentor'|'admin', token?: string }
export function useNotifications(auth) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const timer = useRef(null);

  const fetchList = useCallback(async () => {
    if (!supabase || !auth) return;
    let res;
    if (auth.kind === "participant") {
      res = await supabase.rpc("notifications_list_participant", {
        p_token: auth.token,
      });
    } else if (auth.kind === "mentor") {
      res = await supabase.rpc("notifications_list_mentor", {
        p_access_token: auth.token,
      });
    } else if (auth.kind === "admin") {
      res = await supabase.rpc("notifications_list_admin", {});
    }
    if (res && !res.error && Array.isArray(res.data)) setItems(res.data);
    setLoading(false);
  }, [auth]);

  useEffect(() => {
    fetchList();
    timer.current = setInterval(fetchList, POLL_MS);
    const onFocus = () => fetchList();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer.current);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchList]);

  const unread = items.filter((n) => !n.read).length;

  const markRead = useCallback(
    async (ids) => {
      if (!supabase || !auth || !ids.length) return;
      setItems((prev) =>
        prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)),
      );
      if (auth.kind === "participant")
        await supabase.rpc("notifications_mark_read_participant", {
          p_token: auth.token,
          p_ids: ids,
        });
      else if (auth.kind === "mentor")
        await supabase.rpc("notifications_mark_read_mentor", {
          p_access_token: auth.token,
          p_ids: ids,
        });
      else if (auth.kind === "admin")
        await supabase.rpc("notifications_mark_read_admin", { p_ids: ids });
    },
    [auth],
  );

  return { items, unread, loading, markRead, refresh: fetchList };
}
```

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git -c safe.directory='*' add src/hooks/useNotifications.js
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(push): hook useNotifications (lista + unread + markRead)"
```

---

### Task 16: `NotificationBell` + montagem nos headers

**Files:**

- Create: `src/components/NotificationBell.jsx`
- Modify: `src/admin/AdminPanel.jsx`, `src/participant/ParticipantPanel.jsx`, `src/mentor/MentorPanel.jsx`

- [ ] **Step 1: Componente do sininho**

```jsx
// src/components/NotificationBell.jsx
import { useState, useRef, useEffect } from "react";
import { useNotifications } from "../hooks/useNotifications";

export default function NotificationBell({ auth }) {
  const { items, unread, markRead } = useNotifications(auth);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0)
      markRead(items.filter((n) => !n.read).map((n) => n.id));
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative text-white/60 hover:text-white p-1.5"
        aria-label="Avisos"
      >
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-hot text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[60vh] overflow-y-auto card-glass border border-white/10 rounded-xl shadow-xl z-[60]">
          <div className="px-4 py-2 border-b border-white/10 text-white/80 text-sm font-medium">
            Avisos
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-white/40 text-sm text-center">
              Nenhum aviso ainda.
            </p>
          ) : (
            items.map((n) => (
              <a
                key={n.id}
                href={n.url || "#"}
                onClick={() => setOpen(false)}
                className={`block px-4 py-3 border-b border-white/5 hover:bg-white/5 ${n.read ? "opacity-60" : ""}`}
              >
                <div className="text-white text-sm font-medium">{n.title}</div>
                <div className="text-white/60 text-xs mt-0.5">{n.body}</div>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Montar no AdminPanel header**

Em `src/admin/AdminPanel.jsx`, importar `NotificationBell` e inserir no bloco de ações do header (perto do botão "Sair", linha ~91), antes do botão Sair:

```jsx
<NotificationBell auth={{ kind: "admin" }} />
```

Import: `import NotificationBell from '../components/NotificationBell'`

- [ ] **Step 3: Montar no ParticipantPanel e MentorPanel**

Inserir `<NotificationBell auth={{ kind: 'participant', token: auth.token }} />` no header do `ParticipantPanel.jsx` (ler o arquivo e achar o header/top bar; colocar perto do botão de logout). Análogo no `MentorPanel.jsx` com `kind: 'mentor'`.
Import correspondente em cada arquivo.

> **Ler `ParticipantPanel.jsx` e `MentorPanel.jsx` primeiro** para achar a barra de topo e o `token` exposto pelo `auth`.

- [ ] **Step 4: Lint + build**

```bash
npm run lint && npm run build
```

Expected: sem erros.

- [ ] **Step 5: Verificação manual**

`npm run preview`, logar como participante, abrir o sininho: lista carrega; badge some ao abrir (markRead). Disparar `notify_event(...)` via SQL e confirmar que aparece em ≤30s (ou ao focar a aba).

- [ ] **Step 6: Commit**

```bash
git -c safe.directory='*' add src/components/NotificationBell.jsx src/admin/AdminPanel.jsx src/participant/ParticipantPanel.jsx src/mentor/MentorPanel.jsx
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(push): sininho in-app nos painéis (participante/mentor/admin)"
```

---

## Phase 6 — Aba admin

### Task 17: `AdminNotifications` (broadcast + catálogo + histórico)

**Files:**

- Create: `src/admin/AdminNotifications.jsx`
- Modify: `src/admin/AdminPanel.jsx`

- [ ] **Step 1: Componente da aba**

```jsx
// src/admin/AdminNotifications.jsx
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

const EVENT_LABELS = {
  sugar_released: "Mural liberado → participantes",
  team_scores_visible: "Notas da IA visíveis → times",
  wall_phase: "Fase do muro → participantes",
  payment_confirmed: "Pagamento confirmado → o participante",
  evaluation_open: "Avaliação aberta → participantes + mentores",
  announcement: "Aviso publicado → participantes",
  team_lunch: "Almoço do time → membros do time",
  deliverable_submitted: "Entrega submetida → mentores do time",
  slides_deadline: "Deadline de slides → times",
  mentor_assigned: "Mentor designado → o mentor",
  schedule_start: "Início de atividade do cronograma → participantes",
};

export default function AdminNotifications() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("all_participants");
  const [teams, setTeams] = useState([]);
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [events, setEvents] = useState([]);
  const [history, setHistory] = useState([]);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState(null);

  const loadAll = useCallback(async () => {
    if (!supabase) return;
    const [t, e, h] = await Promise.all([
      supabase.rpc("admin_teams_for_broadcast"),
      supabase.rpc("get_notify_events"),
      supabase.rpc("admin_notifications_history", { p_limit: 50 }),
    ]);
    if (!t.error) setTeams(t.data || []);
    if (!e.error) setEvents(e.data || []);
    if (!h.error) setHistory(h.data || []);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function send() {
    if (!title.trim() || !body.trim()) {
      setMsg("Preencha título e mensagem.");
      return;
    }
    if (kind === "teams_members" && selectedTeams.length === 0) {
      setMsg("Selecione ao menos um time.");
      return;
    }
    setSending(true);
    setMsg(null);
    const { error } = await supabase.rpc("broadcast_notification", {
      p_title: title.trim(),
      p_body: body.trim(),
      p_audience_kind: kind,
      p_team_ids: kind === "teams_members" ? selectedTeams : null,
      p_url: "#participante",
    });
    setSending(false);
    if (error) {
      setMsg("Erro ao enviar: " + error.message);
      return;
    }
    setMsg("Enviado!");
    setTitle("");
    setBody("");
    setSelectedTeams([]);
    loadAll();
  }

  async function toggleEvent(eventKey, enabled) {
    setEvents((prev) =>
      prev.map((ev) => (ev.event_key === eventKey ? { ...ev, enabled } : ev)),
    );
    await supabase.rpc("set_notify_event", {
      p_event_key: eventKey,
      p_on: enabled,
    });
  }

  function toggleTeam(id) {
    setSelectedTeams((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div className="space-y-8">
      {/* Compor broadcast */}
      <section className="card-glass p-5 rounded-xl border border-white/10">
        <h2 className="text-white font-display font-semibold mb-3">
          📣 Enviar aviso
        </h2>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título"
          className="w-full mb-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Mensagem"
          rows={3}
          className="w-full mb-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
        />
        <div className="flex flex-wrap gap-2 mb-3 text-sm">
          {[
            ["all_participants", "Todos participantes"],
            ["all_mentors", "Só mentores"],
            ["participants_and_mentors", "Participantes + mentores"],
            ["teams_members", "Times…"],
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`px-3 py-1.5 rounded-lg border ${kind === k ? "bg-cyan/20 text-cyan border-cyan/30" : "text-white/60 border-white/10 hover:bg-white/5"}`}
            >
              {l}
            </button>
          ))}
        </div>
        {kind === "teams_members" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mb-3 max-h-40 overflow-y-auto">
            {teams.map((t) => (
              <label
                key={t.id}
                className="flex items-center gap-2 text-white/70 text-xs bg-white/5 rounded px-2 py-1"
              >
                <input
                  type="checkbox"
                  checked={selectedTeams.includes(t.id)}
                  onChange={() => toggleTeam(t.id)}
                />
                {t.name}
              </label>
            ))}
          </div>
        )}
        <button
          onClick={send}
          disabled={sending}
          className="px-4 py-2 rounded-lg bg-cyan/20 text-cyan border border-cyan/30 text-sm font-medium hover:bg-cyan/30 disabled:opacity-50"
        >
          {sending ? "Enviando…" : "Enviar aviso"}
        </button>
        {msg && <span className="ml-3 text-white/60 text-sm">{msg}</span>}
      </section>

      {/* Catálogo de eventos */}
      <section className="card-glass p-5 rounded-xl border border-white/10">
        <h2 className="text-white font-display font-semibold mb-3">
          ⚙️ Eventos automáticos
        </h2>
        <div className="space-y-1.5">
          {events.map((ev) => (
            <label
              key={ev.event_key}
              className="flex items-center justify-between gap-3 py-1.5 border-b border-white/5"
            >
              <span className="text-white/70 text-sm">
                {EVENT_LABELS[ev.event_key] || ev.event_key}
              </span>
              <input
                type="checkbox"
                checked={ev.enabled}
                onChange={(e) => toggleEvent(ev.event_key, e.target.checked)}
              />
            </label>
          ))}
        </div>
      </section>

      {/* Histórico */}
      <section className="card-glass p-5 rounded-xl border border-white/10">
        <h2 className="text-white font-display font-semibold mb-3">
          🕓 Histórico de envios
        </h2>
        <div className="space-y-1.5">
          {history.length === 0 ? (
            <p className="text-white/40 text-sm">Nada enviado ainda.</p>
          ) : (
            history.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between gap-3 py-1.5 border-b border-white/5 text-sm"
              >
                <div className="min-w-0">
                  <span className="text-white truncate">{h.title}</span>
                  <span className="text-white/40 ml-2 text-xs">
                    {h.event_key}
                  </span>
                </div>
                <span className="text-white/50 text-xs flex-shrink-0">
                  {h.recipients} dest.
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Registrar a aba no AdminPanel**

Em `src/admin/AdminPanel.jsx`:

- Import: `import AdminNotifications from './AdminNotifications'`
- Adicionar ao `ALL_TABS` (perto de `facilitator`, adminOnly): `{ id: 'notifications', label: 'Notificações', icon: '🔔', adminOnly: true },`
- Adicionar o render no `<main>`: `{!readOnly && activeTab === 'notifications' && <AdminNotifications />}`

- [ ] **Step 3: Lint + build**

```bash
npm run lint && npm run build
```

Expected: sem erros.

- [ ] **Step 4: Verificação manual end-to-end (o teste de aceitação do feature)**

1. Logar no admin → aba 🔔 Notificações.
2. Em outro device/navegador, logar como participante e **Ativar** o push (Task 14).
3. No admin, escrever um aviso para "Todos participantes" → Enviar.
4. Esperado: push chega no device do participante (notificação do SO) **e** aparece no sininho; o item entra no Histórico com `recipients > 0`.
5. Desligar o evento "Mural liberado" no catálogo; ligar o mural no app (aba Entregas/sugar); confirmar que **nenhum** push de mural é enviado. Religar o evento.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory='*' add src/admin/AdminNotifications.jsx src/admin/AdminPanel.jsx
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(push): aba admin (broadcast segmentado + catálogo + histórico)"
```

---

## Verificação final (antes de abrir PR)

- [ ] `npm run lint` limpo.
- [ ] `npm run build` ok; `dist/sw.js`, `dist/manifest.webmanifest`, `dist/icons/*` presentes.
- [ ] `npx vitest run` verde.
- [ ] Push real recebido em Android/Chrome desktop (com app fechado/aba em background).
- [ ] iPhone: instruções de instalação aparecem; após "Adicionar à Tela de Início" + abrir como app, **Ativar** funciona e o push chega.
- [ ] Jurado (`#jurado?t=...`): **nenhum** prompt e **nenhum** sininho.
- [ ] Switches do catálogo silenciam/religam eventos corretamente.
- [ ] Endpoint expirado é removido (deletar manualmente uma subscription e reenviar não quebra o fluxo).
- [ ] `get_advisors` (security) sem novos alertas críticos nas novas funções/tabelas.

## Notas de execução

- **Ações humanas obrigatórias:** gerar VAPID (Task 0), colar secrets no GitHub e na Edge Function (Tasks 0/8), criar o Database Webhook (Task 9), possivelmente fornecer um logo quadrado para ícones (Task 11). O executor deve **pausar e pedir** esses itens, não inventar valores.
- **Verificar nomes reais de colunas/RPCs** nos Steps marcados (`expand_recipients`, triggers, resolução de token) antes de aplicar cada migration — os snippets assumem nomes plausíveis (`participant_sessions.token`, `mentors.access_token`, `teams.name`, `registrations.team_id/payment_status`) que devem ser confirmados via `pg_get_functiondef`/`information_schema`.
- **Mentor por sessão:** se o front do mentor logado por email+código não tiver `access_token`, criar a variante `push_subscribe_mentor_session` / `notifications_*_mentor_session` resolvendo via `mentor_sessions` (decisão tomada na Task 3).
