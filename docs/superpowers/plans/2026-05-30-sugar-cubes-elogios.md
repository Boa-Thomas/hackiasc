# Sugar Cubes — Mural de Elogios · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Participantes, mentores e organização enviam elogios ("sugar cubes") uns aos outros; cada elogio passa por curadoria manual do admin e fica invisível até um switch global de liberação revelar, no painel de cada destinatário, os elogios aprovados — sempre de forma anônima.

**Architecture:** Tabela única polimórfica `sugar_cubes` (sender/recipient = type+ref+name snapshot). RLS deny-all; todo acesso via RPCs `SECURITY DEFINER` que resolvem a identidade do remetente no servidor (reaproveitando `participant_session_owner_confirmed`, `mentor_session_owner`, `is_admin`). Switch global em `app_settings('sugar_released')`, espelhando `team_scores_visible`. Frontend por polling, sem realtime.

**Tech Stack:** React 19 + Vite, Tailwind v4 (tema custom), Supabase (Postgres + RPC), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-30-sugar-cubes-elogios-design.md`

---

## ⚠️ Notas de execução (ler antes de começar)

- **Estilo do código JS/JSX deste repo:** aspas simples, **sem ponto-e-vírgula**, ES modules. Há um hook de formatação que pode reescrever arquivos JS no save — se um `Edit`/`Write` em arquivo JS for revertido de estilo, escreva o arquivo via `Bash` (heredoc) em vez de `Edit`/`Write`. SQL e Markdown não são afetados.
- **Migrations NÃO são auto-aplicadas.** O passo de "teste" da Task 1 é rodar o SQL no Supabase SQL Editor e conferir com as queries de verificação fornecidas. As demais migrations do repo seguem o mesmo fluxo manual.
- **Git:** o config global está quebrado neste ambiente. Faça commits com:
  `git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "..."`
  e termine a mensagem com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

| Arquivo                                            | Responsabilidade                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `migrations/add_sugar_cubes.sql` (criar)           | Tabela `sugar_cubes`, flag `sugar_released`, RLS, todos os RPCs.                                     |
| `src/sugar/sugarCubes.js` (criar)                  | Lógica pura: validação de mensagem, regra de auto-elogio, opções de destinatário, tradução de erros. |
| `src/sugar/sugarCubes.test.js` (criar)             | Testes Vitest da lógica pura.                                                                        |
| `src/sugar/SendSugarCube.jsx` (criar)              | Formulário reutilizável de envio (modo participant/mentor/org).                                      |
| `src/sugar/ReceivedComplimentsSection.jsx` (criar) | Mural pessoal de elogios recebidos (oculto se vazio).                                                |
| `src/admin/AdminSugarCubes.jsx` (criar)            | Aba de curadoria + switch de liberação.                                                              |
| `src/admin/AdminPanel.jsx` (modificar)             | Registrar aba "Elogios".                                                                             |
| `src/participant/ParticipantPanel.jsx` (modificar) | Aba "Elogios" (recebidos + envio).                                                                   |
| `src/mentor/MentorPanel.jsx` (modificar)           | Bloco "Elogios" (recebidos + envio).                                                                 |

---

## Task 1: Migration — tabela, flag, RLS e RPCs

**Files:**

- Create: `migrations/add_sugar_cubes.sql`

- [ ] **Step 1: Escrever a migration completa**

Crie `migrations/add_sugar_cubes.sql` com exatamente este conteúdo:

```sql
-- ============================================================
-- MIGRACAO: Sugar Cubes — Mural de Elogios (curadoria + liberacao)
-- ============================================================
-- Aplique no Supabase SQL Editor (NAO e auto-aplicada).
-- Idempotente (IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT).
-- Depende de: registrations, mentors, app_settings, is_admin(),
-- is_admin_or_viewer(), participant_session_owner_confirmed(UUID),
-- mentor_session_owner(UUID) (definidos em migrations anteriores).
--
-- Participantes/mentores/organizacao enviam elogios uns aos outros. Cada
-- elogio nasce 'pending' e so aparece para o destinatario quando: (a) o admin
-- aprova item a item E (b) o switch global app_settings('sugar_released')='true'.
-- O mural e ANONIMO: os RPCs de "recebidos" nunca devolvem o remetente; o
-- sender_name fica guardado so para o admin moderar. Identidade do remetente e
-- resolvida no servidor (token/admin); o cliente nunca a forja.

-- ============================================================
-- 1. Tabela + flag
-- ============================================================
CREATE TABLE IF NOT EXISTS sugar_cubes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  message         TEXT NOT NULL,
  sender_type     TEXT NOT NULL CHECK (sender_type IN ('participant','mentor','organization')),
  sender_ref      UUID,
  sender_name     TEXT NOT NULL,
  recipient_type  TEXT NOT NULL CHECK (recipient_type IN ('participant','mentor','organization')),
  recipient_ref   UUID,
  recipient_name  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  moderated_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sugar_cubes_status    ON sugar_cubes(status);
CREATE INDEX IF NOT EXISTS idx_sugar_cubes_recipient ON sugar_cubes(recipient_type, recipient_ref);
CREATE INDEX IF NOT EXISTS idx_sugar_cubes_sender    ON sugar_cubes(sender_type, sender_ref);

-- app_settings ja existe (migration do DATI). Semeia o flag desligado.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO app_settings (key, value) VALUES ('sugar_released', 'false')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 2. RLS deny-all (admin/viewer le direto p/ moderacao)
-- ============================================================
ALTER TABLE sugar_cubes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin can read sugar_cubes" ON sugar_cubes;
CREATE POLICY "Admin can read sugar_cubes" ON sugar_cubes
  FOR SELECT TO authenticated USING (is_admin_or_viewer());

-- ============================================================
-- 3. Helpers internos (REVOKE do PUBLIC: so chamados de outros DEFINER)
-- ============================================================
-- Resolve/valida o destinatario e devolve o nome de exibicao (snapshot).
CREATE OR REPLACE FUNCTION sugar_resolve_recipient(p_type TEXT, p_ref UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name TEXT;
BEGIN
  IF p_type = 'organization' THEN
    IF p_ref IS NOT NULL THEN RAISE EXCEPTION 'invalid_recipient'; END IF;
    RETURN 'Organização HackIA';
  ELSIF p_type = 'participant' THEN
    SELECT full_name INTO v_name FROM registrations
      WHERE id = p_ref AND payment_status = 'confirmed';
  ELSIF p_type = 'mentor' THEN
    SELECT name INTO v_name FROM mentors WHERE id = p_ref;
  ELSE
    RAISE EXCEPTION 'invalid_recipient';
  END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'recipient_not_found'; END IF;
  RETURN v_name;
END; $$;
REVOKE ALL ON FUNCTION sugar_resolve_recipient(TEXT, UUID) FROM PUBLIC;

-- Insercao compartilhada: valida destinatario, bloqueia auto-elogio, anti-spam,
-- normaliza mensagem, insere 'pending'. sender_* ja vem resolvido no servidor.
CREATE OR REPLACE FUNCTION sugar_insert(
  p_sender_type TEXT, p_sender_ref UUID, p_sender_name TEXT,
  p_recipient_type TEXT, p_recipient_ref UUID, p_message TEXT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c_throttle       CONSTANT INTERVAL := '5 seconds';
  c_max_per_sender CONSTANT INTEGER  := 30;
  v_recipient_name TEXT;
  v_msg            TEXT;
BEGIN
  -- 1. Resolve/valida destinatario
  v_recipient_name := sugar_resolve_recipient(p_recipient_type, p_recipient_ref);

  -- 2. Bloqueia auto-elogio (mesmo tipo E mesma ref; org tem ref NULL)
  IF p_sender_type = p_recipient_type
     AND p_sender_ref IS NOT DISTINCT FROM p_recipient_ref THEN
    RAISE EXCEPTION 'self_compliment';
  END IF;

  -- 3. Anti-spam: teto por remetente
  IF (SELECT COUNT(*) FROM sugar_cubes
        WHERE sender_type = p_sender_type
          AND sender_ref IS NOT DISTINCT FROM p_sender_ref) >= c_max_per_sender THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  -- 4. Anti-spam: throttle anti-duplo-clique
  IF EXISTS (SELECT 1 FROM sugar_cubes
        WHERE sender_type = p_sender_type
          AND sender_ref IS NOT DISTINCT FROM p_sender_ref
          AND created_at > now() - c_throttle) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  -- 5. Valida/normaliza mensagem
  v_msg := TRIM(COALESCE(p_message, ''));
  IF v_msg = '' THEN RAISE EXCEPTION 'message_required'; END IF;
  IF length(v_msg) > 280 THEN v_msg := left(v_msg, 280); END IF;

  -- 6. Insere pending
  INSERT INTO sugar_cubes (message, sender_type, sender_ref, sender_name,
                           recipient_type, recipient_ref, recipient_name)
  VALUES (v_msg, p_sender_type, p_sender_ref, p_sender_name,
          p_recipient_type, p_recipient_ref, v_recipient_name);

  RETURN json_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION sugar_insert(TEXT, UUID, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;

-- ============================================================
-- 4. Envio (anon p/ participante/mentor; admin p/ organizacao)
-- ============================================================
CREATE OR REPLACE FUNCTION sugar_send_participant(
  p_token UUID, p_recipient_type TEXT, p_recipient_ref UUID, p_message TEXT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reg UUID; v_name TEXT;
BEGIN
  v_reg := participant_session_owner_confirmed(p_token);
  SELECT full_name INTO v_name FROM registrations WHERE id = v_reg;
  RETURN sugar_insert('participant', v_reg, v_name,
                      p_recipient_type, p_recipient_ref, p_message);
END; $$;
GRANT EXECUTE ON FUNCTION sugar_send_participant(UUID, TEXT, UUID, TEXT) TO anon;

CREATE OR REPLACE FUNCTION sugar_send_mentor(
  p_token UUID, p_recipient_type TEXT, p_recipient_ref UUID, p_message TEXT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mentor UUID; v_name TEXT;
BEGIN
  v_mentor := mentor_session_owner(p_token);
  SELECT name INTO v_name FROM mentors WHERE id = v_mentor;
  RETURN sugar_insert('mentor', v_mentor, v_name,
                      p_recipient_type, p_recipient_ref, p_message);
END; $$;
GRANT EXECUTE ON FUNCTION sugar_send_mentor(UUID, TEXT, UUID, TEXT) TO anon;

CREATE OR REPLACE FUNCTION sugar_send_org(
  p_recipient_type TEXT, p_recipient_ref UUID, p_message TEXT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN sugar_insert('organization', NULL, 'Organização HackIA',
                      p_recipient_type, p_recipient_ref, p_message);
END; $$;
REVOKE ALL ON FUNCTION sugar_send_org(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sugar_send_org(TEXT, UUID, TEXT) TO authenticated;

-- ============================================================
-- 5. Roster (popular o seletor de destinatario)
-- ============================================================
-- Exige >=1 token valido (participante confirmado OU mentor). NAO e STABLE:
-- os resolvedores de sessao podem atualizar last_used_at.
CREATE OR REPLACE FUNCTION sugar_roster(
  p_participant_token UUID DEFAULT NULL, p_mentor_token UUID DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok BOOLEAN := false; v_participants JSON; v_mentors JSON;
BEGIN
  IF p_participant_token IS NOT NULL THEN
    BEGIN PERFORM participant_session_owner_confirmed(p_participant_token); v_ok := true;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  IF NOT v_ok AND p_mentor_token IS NOT NULL THEN
    BEGIN PERFORM mentor_session_owner(p_mentor_token); v_ok := true;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  IF NOT v_ok THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT json_agg(json_build_object('ref', id, 'name', full_name) ORDER BY full_name)
    INTO v_participants FROM registrations WHERE payment_status = 'confirmed';
  SELECT json_agg(json_build_object('ref', id, 'name', name) ORDER BY name)
    INTO v_mentors FROM mentors;

  RETURN json_build_object(
    'participants', COALESCE(v_participants, '[]'::JSON),
    'mentors',      COALESCE(v_mentors, '[]'::JSON),
    'organization', true
  );
END; $$;
GRANT EXECUTE ON FUNCTION sugar_roster(UUID, UUID) TO anon;

CREATE OR REPLACE FUNCTION sugar_roster_admin()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_participants JSON; v_mentors JSON;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT json_agg(json_build_object('ref', id, 'name', full_name) ORDER BY full_name)
    INTO v_participants FROM registrations WHERE payment_status = 'confirmed';
  SELECT json_agg(json_build_object('ref', id, 'name', name) ORDER BY name)
    INTO v_mentors FROM mentors;
  RETURN json_build_object(
    'participants', COALESCE(v_participants, '[]'::JSON),
    'mentors',      COALESCE(v_mentors, '[]'::JSON),
    'organization', true
  );
END; $$;
REVOKE ALL ON FUNCTION sugar_roster_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sugar_roster_admin() TO authenticated;

-- ============================================================
-- 6. Recebidos (mural pessoal) — gate: liberado AND approved. Sem remetente.
-- ============================================================
CREATE OR REPLACE FUNCTION sugar_my_received_participant(p_token UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reg UUID; v_released BOOLEAN; v_list JSON;
BEGIN
  v_reg := participant_session_owner_confirmed(p_token);
  SELECT COALESCE((SELECT value = 'true' FROM app_settings WHERE key = 'sugar_released'), false)
    INTO v_released;
  IF NOT v_released THEN RETURN '[]'::JSON; END IF;
  SELECT json_agg(json_build_object('message', message, 'created_at', created_at) ORDER BY created_at)
    INTO v_list FROM sugar_cubes
    WHERE recipient_type = 'participant' AND recipient_ref = v_reg AND status = 'approved';
  RETURN COALESCE(v_list, '[]'::JSON);
END; $$;
GRANT EXECUTE ON FUNCTION sugar_my_received_participant(UUID) TO anon;

CREATE OR REPLACE FUNCTION sugar_my_received_mentor(p_token UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mentor UUID; v_released BOOLEAN; v_list JSON;
BEGIN
  v_mentor := mentor_session_owner(p_token);
  SELECT COALESCE((SELECT value = 'true' FROM app_settings WHERE key = 'sugar_released'), false)
    INTO v_released;
  IF NOT v_released THEN RETURN '[]'::JSON; END IF;
  SELECT json_agg(json_build_object('message', message, 'created_at', created_at) ORDER BY created_at)
    INTO v_list FROM sugar_cubes
    WHERE recipient_type = 'mentor' AND recipient_ref = v_mentor AND status = 'approved';
  RETURN COALESCE(v_list, '[]'::JSON);
END; $$;
GRANT EXECUTE ON FUNCTION sugar_my_received_mentor(UUID) TO anon;

-- ============================================================
-- 7. Admin: lista (com remetente), moderacao, flag de liberacao
-- ============================================================
CREATE OR REPLACE FUNCTION sugar_admin_list(p_status TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_list JSON;
BEGIN
  IF NOT is_admin_or_viewer() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT json_agg(c ORDER BY c.created_at DESC) INTO v_list FROM (
    SELECT id, message, sender_type, sender_name,
           recipient_type, recipient_name, status, created_at, moderated_at
    FROM sugar_cubes
    WHERE p_status IS NULL OR status = p_status
  ) c;
  RETURN COALESCE(v_list, '[]'::JSON);
END; $$;
REVOKE ALL ON FUNCTION sugar_admin_list(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sugar_admin_list(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION sugar_moderate(p_id UUID, p_status TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_updated INTEGER;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_status NOT IN ('approved','rejected','pending') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  UPDATE sugar_cubes
     SET status = p_status,
         moderated_at = CASE WHEN p_status = 'pending' THEN NULL ELSE now() END
   WHERE id = p_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN RAISE EXCEPTION 'not_found'; END IF;
  RETURN json_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION sugar_moderate(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sugar_moderate(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION get_sugar_released()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT COALESCE((SELECT value = 'true' FROM app_settings WHERE key = 'sugar_released'), false);
$$;
REVOKE EXECUTE ON FUNCTION get_sugar_released() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_sugar_released() FROM anon;
GRANT EXECUTE ON FUNCTION get_sugar_released() TO authenticated;

CREATE OR REPLACE FUNCTION set_sugar_released(p_bool BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO app_settings (key, value, updated_at)
  VALUES ('sugar_released', CASE WHEN p_bool THEN 'true' ELSE 'false' END, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN p_bool;
END; $$;
REVOKE EXECUTE ON FUNCTION set_sugar_released(BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_sugar_released(BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION set_sugar_released(BOOLEAN) TO authenticated;
```

- [ ] **Step 2: Aplicar no Supabase SQL Editor**

Cole o conteúdo inteiro do arquivo no SQL Editor do projeto e execute.
Esperado: "Success. No rows returned." (sem erros). Rode de novo para confirmar idempotência — deve passar igual.

- [ ] **Step 3: Verificar objetos criados**

No SQL Editor:

```sql
SELECT proname FROM pg_proc
WHERE proname LIKE 'sugar\_%' OR proname IN ('get_sugar_released','set_sugar_released')
ORDER BY proname;
SELECT key, value FROM app_settings WHERE key = 'sugar_released';
```

Esperado: as funções `sugar_admin_list, sugar_insert, sugar_moderate, sugar_my_received_mentor, sugar_my_received_participant, sugar_resolve_recipient, sugar_roster, sugar_roster_admin, sugar_send_mentor, sugar_send_org, sugar_send_participant, get_sugar_released, set_sugar_released`; e `sugar_released = false`.

- [ ] **Step 4: Verificar o gate de liberação (smoke manual)**

```sql
-- Pega uma inscricao confirmada qualquer para teste.
SELECT id, full_name FROM registrations WHERE payment_status = 'confirmed' LIMIT 1;
-- Insere um elogio de teste direto (simula envio ja aprovado p/ esse destinatario):
INSERT INTO sugar_cubes (message, sender_type, sender_ref, sender_name,
  recipient_type, recipient_ref, recipient_name, status)
VALUES ('Elogio de teste', 'organization', NULL, 'Organização HackIA',
  'participant', '<ID_DA_INSCRICAO>', '<NOME>', 'approved');
-- Com flag desligado, o admin ve, mas o destinatario nao (gate). Liga e desliga:
SELECT set_sugar_released(true);
SELECT set_sugar_released(false);
-- Limpa o teste:
DELETE FROM sugar_cubes WHERE message = 'Elogio de teste';
```

Esperado: os `SELECT set_sugar_released(...)` retornam `true`/`false` sem erro; o INSERT/DELETE funcionam.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory='*' add migrations/add_sugar_cubes.sql
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' \
  commit -m "feat(sugar): migration do mural de elogios (curadoria + liberação)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Lógica pura `sugarCubes.js` (TDD)

**Files:**

- Create: `src/sugar/sugarCubes.js`
- Test: `src/sugar/sugarCubes.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/sugar/sugarCubes.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  MESSAGE_MAX,
  ORG_LABEL,
  validateMessage,
  isSelfCompliment,
  buildRecipientOptions,
  errorText,
} from "./sugarCubes";

describe("validateMessage", () => {
  it("rejeita mensagem vazia ou só espaços", () => {
    expect(validateMessage("")).toEqual({
      ok: false,
      error: "message_required",
    });
    expect(validateMessage("   ")).toEqual({
      ok: false,
      error: "message_required",
    });
    expect(validateMessage(null)).toEqual({
      ok: false,
      error: "message_required",
    });
  });

  it("faz trim e aceita mensagem válida", () => {
    expect(validateMessage("  oi  ")).toEqual({ ok: true, value: "oi" });
  });

  it("corta em MESSAGE_MAX caracteres", () => {
    const long = "a".repeat(MESSAGE_MAX + 50);
    const r = validateMessage(long);
    expect(r.ok).toBe(true);
    expect(r.value.length).toBe(MESSAGE_MAX);
  });
});

describe("isSelfCompliment", () => {
  it("detecta mesmo tipo e mesma ref", () => {
    expect(isSelfCompliment("participant", "a", "participant", "a")).toBe(true);
  });
  it("organização → organização é auto-elogio (refs nulas)", () => {
    expect(isSelfCompliment("organization", null, "organization", null)).toBe(
      true,
    );
  });
  it("tipos ou refs diferentes não são auto-elogio", () => {
    expect(isSelfCompliment("participant", "a", "participant", "b")).toBe(
      false,
    );
    expect(isSelfCompliment("participant", "a", "mentor", "a")).toBe(false);
  });
});

describe("buildRecipientOptions", () => {
  it("achata roster em opções com type/ref/name, organização incluída", () => {
    const opts = buildRecipientOptions({
      participants: [{ ref: "p1", name: "Ana" }],
      mentors: [{ ref: "m1", name: "Bia" }],
      organization: true,
    });
    expect(opts).toContainEqual({
      type: "organization",
      ref: null,
      name: ORG_LABEL,
    });
    expect(opts).toContainEqual({
      type: "participant",
      ref: "p1",
      name: "Ana",
    });
    expect(opts).toContainEqual({ type: "mentor", ref: "m1", name: "Bia" });
  });
  it("tolera roster vazio/parcial", () => {
    expect(buildRecipientOptions({}).length).toBe(1); // só organização
  });
});

describe("errorText", () => {
  it("traduz códigos conhecidos contidos na mensagem de erro", () => {
    expect(errorText("self_compliment")).toMatch(/si mesmo/i);
    expect(errorText("rate_limited")).toMatch(/aguarde/i);
    expect(errorText("message_required")).toMatch(/mensagem/i);
    expect(errorText("new row ... unauthorized")).toMatch(/sessão/i);
  });
  it("usa fallback para erro desconhecido", () => {
    expect(errorText("algo estranho")).toMatch(/não foi possível/i);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- src/sugar/sugarCubes.test.js`
Expected: FAIL — "Failed to resolve import './sugarCubes'".

- [ ] **Step 3: Implementar `sugarCubes.js`**

Crie `src/sugar/sugarCubes.js`:

```js
// Lógica pura do mural de elogios (sugar cubes). Espelha as validações do
// servidor (sugar_insert) para dar feedback imediato no cliente; o servidor
// continua sendo a fonte de verdade.

export const MESSAGE_MAX = 280;
export const ORG_LABEL = "Organização HackIA";

// Valida/normaliza a mensagem: trim, vazio → erro, corte em MESSAGE_MAX.
export function validateMessage(raw) {
  const value = (raw ?? "").trim();
  if (value === "") return { ok: false, error: "message_required" };
  return { ok: true, value: value.slice(0, MESSAGE_MAX) };
}

// Auto-elogio: mesmo tipo E mesma ref (organização tem ref null dos dois lados).
export function isSelfCompliment(
  senderType,
  senderRef,
  recipientType,
  recipientRef,
) {
  return (
    senderType === recipientType &&
    (senderRef ?? null) === (recipientRef ?? null)
  );
}

// Achata o roster ({participants, mentors, organization}) numa lista plana de
// opções selecionáveis. Organização primeiro.
export function buildRecipientOptions(roster) {
  const opts = [];
  if (roster?.organization)
    opts.push({ type: "organization", ref: null, name: ORG_LABEL });
  for (const p of roster?.participants ?? []) {
    opts.push({ type: "participant", ref: p.ref, name: p.name });
  }
  for (const m of roster?.mentors ?? []) {
    opts.push({ type: "mentor", ref: m.ref, name: m.name });
  }
  return opts;
}

const ERROR_MESSAGES = [
  ["message_required", "Escreva uma mensagem."],
  ["self_compliment", "Você não pode enviar um elogio para si mesmo."],
  ["rate_limited", "Aguarde um instante antes de enviar outro elogio."],
  ["recipient_not_found", "Destinatário inválido."],
  ["invalid_recipient", "Destinatário inválido."],
  ["unauthorized", "Sessão inválida. Entre novamente."],
  ["forbidden", "Sessão inválida. Entre novamente."],
];

// Traduz a mensagem de erro do Supabase (que contém o texto do RAISE) para
// pt-BR. Faz match por substring; fallback genérico.
export function errorText(raw) {
  const msg = String(raw ?? "");
  for (const [code, text] of ERROR_MESSAGES) {
    if (msg.includes(code)) return text;
  }
  return "Não foi possível enviar agora. Tente de novo.";
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- src/sugar/sugarCubes.test.js`
Expected: PASS (todos os testes verdes).

- [ ] **Step 5: Commit**

```bash
git -c safe.directory='*' add src/sugar/sugarCubes.js src/sugar/sugarCubes.test.js
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' \
  commit -m "feat(sugar): lógica pura de validação/erros + testes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Componente de envio `SendSugarCube`

**Files:**

- Create: `src/sugar/SendSugarCube.jsx`

- [ ] **Step 1: Implementar o componente**

Crie `src/sugar/SendSugarCube.jsx`:

```jsx
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import {
  buildRecipientOptions,
  validateMessage,
  errorText,
  MESSAGE_MAX,
} from "./sugarCubes";

// Formulário de envio de elogio. mode: 'participant' | 'mentor' | 'org'.
// token: necessário para participant/mentor (sessão do painel); ignorado p/ org.
export default function SendSugarCube({ mode, token }) {
  const [roster, setRoster] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [target, setTarget] = useState(""); // formato "type:ref"
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState(null); // { type: 'ok' | 'err', text }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!supabase) {
        setLoadErr("Sistema indisponível no momento.");
        return;
      }
      const rpc = mode === "org" ? "sugar_roster_admin" : "sugar_roster";
      const args =
        mode === "org"
          ? {}
          : {
              p_participant_token: mode === "participant" ? token : null,
              p_mentor_token: mode === "mentor" ? token : null,
            };
      const { data, error } = await supabase.rpc(rpc, args);
      if (!alive) return;
      if (error) {
        setLoadErr(errorText(error.message));
        return;
      }
      setRoster(data);
    }
    load();
    return () => {
      alive = false;
    };
  }, [mode, token]);

  const options = useMemo(
    () => (roster ? buildRecipientOptions(roster) : []),
    [roster],
  );

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!target) {
      setStatus({ type: "err", text: "Escolha quem vai receber." });
      return;
    }
    const v = validateMessage(message);
    if (!v.ok) {
      setStatus({ type: "err", text: errorText(v.error) });
      return;
    }

    const sep = target.indexOf(":");
    const type = target.slice(0, sep);
    const ref = target.slice(sep + 1) || null;

    setBusy(true);
    setStatus(null);
    const rpc =
      mode === "participant"
        ? "sugar_send_participant"
        : mode === "mentor"
          ? "sugar_send_mentor"
          : "sugar_send_org";
    const args =
      mode === "org"
        ? { p_recipient_type: type, p_recipient_ref: ref, p_message: v.value }
        : {
            p_token: token,
            p_recipient_type: type,
            p_recipient_ref: ref,
            p_message: v.value,
          };
    const { error } = await supabase.rpc(rpc, args);
    setBusy(false);
    if (error) {
      setStatus({ type: "err", text: errorText(error.message) });
      return;
    }
    setStatus({
      type: "ok",
      text: "Elogio enviado! Passa por curadoria e é revelado no fim do evento. 🧁",
    });
    setMessage("");
    setTarget("");
  }

  if (loadErr) return <p className="text-hot font-mono text-sm">{loadErr}</p>;
  if (!roster)
    return <p className="text-white/60 font-mono text-sm">Carregando...</p>;

  const groups = [
    {
      key: "Organização",
      items: options.filter((o) => o.type === "organization"),
    },
    {
      key: "Participantes",
      items: options.filter((o) => o.type === "participant"),
    },
    { key: "Mentores", items: options.filter((o) => o.type === "mentor") },
  ];

  return (
    <form onSubmit={submit} className="card-glass rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="font-display text-lg text-white mb-1">
          Enviar um elogio 🧁
        </h3>
        <p className="text-white/50 text-sm">
          Passa por curadoria da organização e é revelado, de forma anônima, no
          fim do evento.
        </p>
      </div>

      <label className="block">
        <span className="text-white/70 text-sm">Para quem?</span>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="mt-1 w-full bg-dark/60 border border-white/10 rounded-lg px-3 py-2 text-white"
        >
          <option value="">Escolha...</option>
          {groups.map(
            (g) =>
              g.items.length > 0 && (
                <optgroup key={g.key} label={g.key}>
                  {g.items.map((o) => (
                    <option
                      key={`${o.type}:${o.ref ?? ""}`}
                      value={`${o.type}:${o.ref ?? ""}`}
                    >
                      {o.name}
                    </option>
                  ))}
                </optgroup>
              ),
          )}
        </select>
      </label>

      <label className="block">
        <span className="text-white/70 text-sm">Elogio</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
          rows={3}
          maxLength={MESSAGE_MAX}
          placeholder="Escreva algo gentil e específico..."
          className="mt-1 w-full bg-dark/60 border border-white/10 rounded-lg px-3 py-2 text-white"
        />
        <span className="text-white/40 text-xs">
          {message.length}/{MESSAGE_MAX}
        </span>
      </label>

      {status && (
        <p
          className={`text-sm font-mono ${status.type === "ok" ? "text-cyan" : "text-hot"}`}
        >
          {status.text}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="px-4 py-2 rounded-lg bg-cyan text-dark font-semibold disabled:opacity-50"
      >
        {busy ? "Enviando..." : "Enviar elogio"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: sem erros nos arquivos novos.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build conclui sem erros.

- [ ] **Step 4: Commit**

```bash
git -c safe.directory='*' add src/sugar/SendSugarCube.jsx
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' \
  commit -m "feat(sugar): formulário reutilizável de envio de elogio

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Mural pessoal `ReceivedComplimentsSection`

**Files:**

- Create: `src/sugar/ReceivedComplimentsSection.jsx`

- [ ] **Step 1: Implementar o componente**

Crie `src/sugar/ReceivedComplimentsSection.jsx`:

```jsx
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

// Mural pessoal de elogios recebidos (anônimos). mode: 'participant' | 'mentor'.
// Fica OCULTO enquanto não há elogios liberados (preserva a surpresa) — o gate
// real está no servidor (só retorna algo com sugar_released = true E approved).
export default function ReceivedComplimentsSection({ mode, token }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!supabase || !token) return;
      const rpc =
        mode === "mentor"
          ? "sugar_my_received_mentor"
          : "sugar_my_received_participant";
      const { data, error } = await supabase.rpc(rpc, { p_token: token });
      if (!alive || error || !data) return;
      setItems(data);
    }
    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [mode, token]);

  if (items.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl text-gradient-cyan">
        🧁 Você recebeu {items.length} elogio{items.length > 1 ? "s" : ""}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((it, i) => (
          <div key={i} className="card-glass glow-cyan rounded-2xl p-4">
            <p className="text-white/90 whitespace-pre-wrap">{it.message}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git -c safe.directory='*' add src/sugar/ReceivedComplimentsSection.jsx
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' \
  commit -m "feat(sugar): mural pessoal de elogios recebidos

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Aba admin `AdminSugarCubes` + registro

**Files:**

- Create: `src/admin/AdminSugarCubes.jsx`
- Modify: `src/admin/AdminPanel.jsx`

- [ ] **Step 1: Implementar `AdminSugarCubes.jsx`**

Crie `src/admin/AdminSugarCubes.jsx`:

```jsx
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import SendSugarCube from "../sugar/SendSugarCube";

const TYPE_LABEL = {
  participant: "Participante",
  mentor: "Mentor",
  organization: "Organização",
};
const FILTERS = [
  { id: "pending", label: "Pendentes" },
  { id: "approved", label: "Aprovados" },
  { id: "rejected", label: "Rejeitados" },
];

// Curadoria do mural de elogios: aprova/rejeita item a item, envia em nome da
// organização e controla o switch global de liberação.
export default function AdminSugarCubes() {
  const [filter, setFilter] = useState("pending");
  const [items, setItems] = useState([]);
  const [released, setReleased] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) {
      setError("Supabase não configurado.");
      setLoading(false);
      return;
    }
    const [list, rel] = await Promise.all([
      supabase.rpc("sugar_admin_list", { p_status: null }),
      supabase.rpc("get_sugar_released"),
    ]);
    if (list.error) setError(list.error.message);
    else {
      setError(null);
      setItems(list.data || []);
    }
    if (!rel.error) setReleased(rel.data === true);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function moderate(id, newStatus) {
    if (busy) return;
    setBusy(true);
    const { error: err } = await supabase.rpc("sugar_moderate", {
      p_id: id,
      p_status: newStatus,
    });
    setBusy(false);
    if (err) {
      alert(`Erro: ${err.message}`);
      return;
    }
    await load();
  }

  async function toggleReleased() {
    const next = !released;
    const msg = next
      ? "LIBERAR os elogios? Todos os destinatários passarão a ver imediatamente os elogios aprovados endereçados a eles."
      : "Esconder novamente os elogios de todos os painéis?";
    if (!window.confirm(msg)) return;
    setBusy(true);
    const { error: err } = await supabase.rpc("set_sugar_released", {
      p_bool: next,
    });
    setBusy(false);
    if (err) {
      alert(`Erro: ${err.message}`);
      return;
    }
    setReleased(next);
  }

  if (loading) return <p className="text-white/60 font-mono">Carregando...</p>;

  const counts = {
    pending: items.filter((i) => i.status === "pending").length,
    approved: items.filter((i) => i.status === "approved").length,
    rejected: items.filter((i) => i.status === "rejected").length,
  };
  const shown = items.filter((i) => i.status === filter);
  const filterLabel = FILTERS.find((f) => f.id === filter).label.toLowerCase();

  return (
    <div className="space-y-5">
      {error && <p className="text-hot font-mono text-sm">{error}</p>}

      <div className="card-glass rounded-2xl p-4 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg text-white">
            Liberação dos elogios
          </h3>
          <p className="text-white/50 text-sm">
            {released
              ? "LIBERADO — destinatários estão vendo os elogios aprovados."
              : "Oculto — ninguém vê (nem sabe que recebeu)."}
          </p>
        </div>
        <button
          onClick={toggleReleased}
          disabled={busy}
          className={`px-4 py-2 rounded-lg font-semibold disabled:opacity-50 whitespace-nowrap ${released ? "bg-hot text-white" : "bg-cyan text-dark"}`}
        >
          {released ? "Esconder de novo" : "Liberar elogios"}
        </button>
      </div>

      <SendSugarCube mode="org" />

      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-sm ${filter === f.id ? "bg-electric text-white" : "bg-dark/60 text-white/60"}`}
          >
            {f.label} ({counts[f.id]})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-white/40 font-mono text-sm">
          Nenhum elogio {filterLabel}.
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((it) => (
            <li key={it.id} className="card-glass rounded-2xl p-4">
              <p className="text-white/50 text-xs font-mono mb-2">
                De: {it.sender_name} ({TYPE_LABEL[it.sender_type]}) → Para:{" "}
                {it.recipient_name} ({TYPE_LABEL[it.recipient_type]})
              </p>
              <p className="text-white/90 mb-3 whitespace-pre-wrap">
                {it.message}
              </p>
              {it.status === "pending" ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => moderate(it.id, "approved")}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg bg-cyan text-dark text-sm font-semibold disabled:opacity-50"
                  >
                    Aprovar
                  </button>
                  <button
                    onClick={() => moderate(it.id, "rejected")}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg border border-hot text-hot text-sm disabled:opacity-50"
                  >
                    Rejeitar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => moderate(it.id, "pending")}
                  disabled={busy}
                  className="text-white/40 text-xs underline disabled:opacity-50"
                >
                  Mover para pendentes
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Registrar a aba em `AdminPanel.jsx`**

Em `src/admin/AdminPanel.jsx`, adicione o import junto aos outros (perto da linha 12, `import AdminWall from './AdminWall'`):

```jsx
import AdminSugarCubes from "./AdminSugarCubes";
```

No array `TABS`, adicione a entrada logo após a linha do `wall` (`{ id: 'wall', label: 'Muro de Dores', icon: '🧱', adminOnly: true },`):

```jsx
  { id: 'sugarcubes', label: 'Elogios', icon: '🧁', adminOnly: true },
```

Na área de render das abas, após a linha `{!readOnly && activeTab === 'wall' && <AdminWall />}` (linha ~142), adicione:

```jsx
{
  !readOnly && activeTab === "sugarcubes" && <AdminSugarCubes />;
}
```

- [ ] **Step 3: Lint + build**

Run: `npm run lint && npm run build`
Expected: sem erros.

- [ ] **Step 4: Verificação manual**

Run: `npm run dev`, abra o painel admin, clique na aba **🧁 Elogios**.
Esperado: a aba carrega; mostra o cartão de liberação (Oculto), o formulário "Enviar um elogio 🧁" com o seletor populado (organização + participantes confirmados + mentores), os filtros Pendentes/Aprovados/Rejeitados, e "Nenhum elogio pendente." Envie um elogio de teste pela organização → aparece em Pendentes; Aprovar/Rejeitar funciona; o switch "Liberar elogios" alterna com confirmação.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory='*' add src/admin/AdminSugarCubes.jsx src/admin/AdminPanel.jsx
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' \
  commit -m "feat(sugar): aba admin de curadoria + switch de liberação

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Aba "Elogios" no painel do participante

**Files:**

- Modify: `src/participant/ParticipantPanel.jsx`

- [ ] **Step 1: Importar os componentes**

Em `src/participant/ParticipantPanel.jsx`, adicione junto aos imports de seções (após a linha 8, `import CriteriaHighlight from './CriteriaHighlight'`):

```jsx
import SendSugarCube from "../sugar/SendSugarCube";
import ReceivedComplimentsSection from "../sugar/ReceivedComplimentsSection";
```

- [ ] **Step 2: Registrar a aba**

No array `ALL_TABS` (linhas 12-18), adicione antes da entrada `profile`:

```jsx
  { id: 'sugar', label: 'Elogios', icon: 'sugar' },
```

(O `TabIcon` cai no ícone padrão para nomes desconhecidos — não precisa alterar o switch de ícones.)

- [ ] **Step 3: Renderizar o conteúdo da aba**

Na área de render (após a linha `{tab === 'resources' && isPaid && <ResourcesSection auth={auth} />}`, linha ~146), adicione:

```jsx
{
  tab === "sugar" && isPaid && (
    <div className="space-y-8">
      <ReceivedComplimentsSection mode="participant" token={auth.token} />
      <SendSugarCube mode="participant" token={auth.token} />
    </div>
  );
}
```

- [ ] **Step 4: Lint + build**

Run: `npm run lint && npm run build`
Expected: sem erros.

- [ ] **Step 5: Verificação manual**

Run: `npm run dev`, entre no painel do participante (CPF+nascimento de uma inscrição confirmada), abra a aba **Elogios**.
Esperado: o formulário de envio carrega com o seletor populado; o mural de recebidos fica oculto (flag desligado). Envie um elogio → mensagem de sucesso. Aprove-o no admin e ligue o switch → ao recarregar a aba, o mural "🧁 Você recebeu 1 elogio" aparece (anônimo).

- [ ] **Step 6: Commit**

```bash
git -c safe.directory='*' add src/participant/ParticipantPanel.jsx
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' \
  commit -m "feat(sugar): aba Elogios no painel do participante

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Bloco "Elogios" no painel do mentor

**Files:**

- Modify: `src/mentor/MentorPanel.jsx`

- [ ] **Step 1: Importar os componentes**

Em `src/mentor/MentorPanel.jsx`, adicione junto aos imports do topo (após a linha 6, `import SectionMeta from '../participant/SectionMeta'`):

```jsx
import SendSugarCube from "../sugar/SendSugarCube";
import ReceivedComplimentsSection from "../sugar/ReceivedComplimentsSection";
```

- [ ] **Step 2: Renderizar o bloco dentro de `<main>`**

O `<main>` do MentorPanel contém um único bloco ternário `{teams.length === 0 ? (...) : (...)}`. Logo **após** o fechamento desse ternário e **antes** de `</main>`, adicione o bloco de elogios (independente de equipe, sempre disponível):

```jsx
<div className="space-y-8 pt-2">
  <ReceivedComplimentsSection mode="mentor" token={auth.token} />
  <SendSugarCube mode="mentor" token={auth.token} />
</div>
```

Para localizar o ponto exato: é o `</main>` que fecha o `<main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">`. Insira o `<div>` acima como último filho de `<main>`.

- [ ] **Step 3: Lint + build**

Run: `npm run lint && npm run build`
Expected: sem erros.

- [ ] **Step 4: Verificação manual**

Run: `npm run dev`, abra o painel do mentor (via link `#mentor?t=<access_token>` de um mentor existente).
Esperado: no fim da página aparece "Enviar um elogio 🧁" com o seletor populado; o mural de recebidos fica oculto até haver elogios aprovados e liberados. Envie um elogio para um participante/organização → sucesso.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory='*' add src/mentor/MentorPanel.jsx
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' \
  commit -m "feat(sugar): bloco Elogios no painel do mentor

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verificação final (end-to-end)

- [ ] **Fluxo completo:** com a migration aplicada e o app rodando:
  1. Participante A envia elogio para Participante B → `pending` (B não vê nada).
  2. Mentor envia elogio para A; admin envia em nome da organização para um mentor.
  3. Admin aprova alguns, rejeita um.
  4. Com o switch **desligado**, B/mentor/A não veem nada nos painéis.
  5. Admin **liga** o switch → cada destinatário vê, no seu painel, só os elogios **aprovados** endereçados a ele, **sem** remetente.
  6. Admin **desliga** → some de todos os painéis.
- [ ] `npm test` (toda a suíte) verde.
- [ ] `npm run lint` e `npm run build` sem erros.

## Regras de negócio cobertas (rastreabilidade com a spec)

- Três grupos enviam (participante/mentor/org) → Tasks 1, 3, 5, 6, 7.
- Roster estruturado, organização como entidade única → Tasks 1 (`sugar_roster`), 2 (`buildRecipientOptions`), 3.
- Mural anônimo (remetente só p/ admin) → Task 1 (recebidos sem `sender_*`; `sugar_admin_list` com `sender_name`).
- Curadoria item a item → Task 1 (`sugar_moderate`), 5.
- Switch global; nada aparece antes → Task 1 (gate em recebidos + `set/get_sugar_released`), 5, 6, 7.
- Recebidos no painel de quem recebeu → Tasks 4, 6, 7.
- Anti-spam (throttle 5s + teto 30) + bloqueio de auto-elogio → Task 1 (`sugar_insert`).
- Mensagem até 280, mural oculto se vazio → Tasks 2, 4.
