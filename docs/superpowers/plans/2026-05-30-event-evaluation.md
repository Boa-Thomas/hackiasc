# Avaliação do Evento — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coletar feedback pós-evento de participantes e mentores (sliders 0–10, step 0,5, por dimensão + comentário livre), uma resposta por pessoa, e mostrar os resultados agregados no painel admin.

**Architecture:** Tabela `event_evaluations` + flag `app_settings.evaluation_open`. Todo acesso via RPCs `SECURITY DEFINER` que validam o token (participante/mentor) — mesmo padrão de `participant_get_team_scores`/`set_team_scores_visible`. No front: um módulo de config de dimensões (lógica pura, testada com vitest), uma função pura de agregação (testada), um componente compartilhado `EventEvaluationForm` reutilizado por participante e mentor, e uma aba de resultados no admin.

**Tech Stack:** React 19, Vite, Tailwind v4, Supabase (Postgres + RPC), vitest.

---

## ⚠️ Convenções deste repositório (leia antes de codar)

1. **Estilo JS: aspas simples, SEM ponto-e-vírgula, indentação de 2 espaços.** Existe um hook de auto-formatação que conflita com esse estilo ao usar Edit/Write em arquivos `.js`/`.jsx`. **Edite os arquivos JS/JSX via Bash (heredoc)**, não via Edit/Write, para preservar o estilo. Os arquivos `.md`/`.sql` podem usar Write/Edit normalmente.
2. **git** está com config global quebrada: prefixe comandos com `-c safe.directory='*'` e, em commits, adicione `-c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com'`.
3. **Testes**: o repo só testa **lógica pura** em módulos `.js` com vitest (`npm run test`). Componentes React e SQL **não** têm testes unitários aqui — são verificados por `npm run build` + `npm run lint` + smoke manual. Siga essa convenção: TDD nas Tasks 1 e 2; build/lint nas demais.
4. **Migrations** ficam em `migrations/*.sql`, são idempotentes e aplicadas manualmente no Supabase (não há runner automático). Naming: `add_<feature>.sql`.

---

## Estrutura de arquivos

**Criar:**

- `src/lib/evaluationDimensions.js` — fonte única das dimensões + `dimensionsFor(type)` + `validateScores(scores, type)` + constantes da escala.
- `src/lib/evaluationDimensions.test.js` — testes vitest da config/validação.
- `src/admin/evaluationResults.js` — `aggregateResults(rows)` (função pura para o dashboard).
- `src/admin/evaluationResults.test.js` — testes vitest da agregação.
- `src/lib/EventEvaluationForm.jsx` — componente compartilhado (formulário + estados), usado por participante e mentor.
- `src/admin/AdminEvaluation.jsx` — aba de resultados no admin (médias, comparativo, comentários, switch).
- `migrations/add_event_evaluation.sql` — tabela, flag, RPCs.

**Modificar:**

- `src/participant/ParticipantPanel.jsx` — nova aba "Avaliação" (gated por pagamento).
- `src/mentor/MentorPanel.jsx` — card de avaliação no fim do `<main>` (independe de pareamento).
- `src/admin/AdminPanel.jsx` — nova aba "Avaliação".

---

## Task 1: Módulo de dimensões + validação (TDD)

**Files:**

- Create: `src/lib/evaluationDimensions.js`
- Test: `src/lib/evaluationDimensions.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/lib/evaluationDimensions.test.js` (via Bash heredoc):

```js
import { describe, it, expect } from "vitest";
import {
  EVALUATION_DIMENSIONS,
  dimensionsFor,
  validateScores,
  EVAL_MIN,
  EVAL_MAX,
} from "./evaluationDimensions";

describe("dimensionsFor", () => {
  it("participante recebe todas as dimensões (inclui mentorship)", () => {
    const keys = dimensionsFor("participant").map((d) => d.key);
    expect(keys).toContain("mentorship");
    expect(keys.length).toBe(EVALUATION_DIMENSIONS.length);
  });

  it("mentor não recebe mentorship", () => {
    const keys = dimensionsFor("mentor").map((d) => d.key);
    expect(keys).not.toContain("mentorship");
    expect(keys.length).toBe(EVALUATION_DIMENSIONS.length - 1);
  });
});

describe("validateScores", () => {
  it("mantém só as chaves permitidas e omite ausentes", () => {
    const { value, error } = validateScores(
      { venue: 8, bogus: 5 },
      "participant",
    );
    expect(error).toBe(null);
    expect(value).toEqual({ venue: 8 });
  });

  it("rejeita mentorship vindo de um mentor", () => {
    const { value } = validateScores({ mentorship: 9, food: 7 }, "mentor");
    expect(value).toEqual({ food: 7 });
  });

  it("aceita meio ponto (step 0,5)", () => {
    expect(validateScores({ food: 7.5 }, "participant")).toEqual({
      value: { food: 7.5 },
      error: null,
    });
  });

  it("omite notas vazias / nulas (não viram 0)", () => {
    expect(validateScores({ food: "", venue: null }, "participant")).toEqual({
      value: {},
      error: null,
    });
  });

  it("rejeita fora da faixa", () => {
    expect(validateScores({ food: 11 }, "participant")).toEqual({
      value: null,
      error: "score_out_of_range",
    });
    expect(validateScores({ food: -1 }, "participant")).toEqual({
      value: null,
      error: "score_out_of_range",
    });
  });

  it("rejeita step inválido (ex: 7,3)", () => {
    expect(validateScores({ food: 7.3 }, "participant")).toEqual({
      value: null,
      error: "invalid_step",
    });
  });

  it("rejeita valor não-numérico", () => {
    expect(validateScores({ food: "abc" }, "participant")).toEqual({
      value: null,
      error: "invalid_score",
    });
  });

  it("expõe a faixa da escala", () => {
    expect(EVAL_MIN).toBe(0);
    expect(EVAL_MAX).toBe(10);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm run test -- evaluationDimensions`
Expected: FAIL com "Failed to resolve import './evaluationDimensions'".

- [ ] **Step 3: Implementar o módulo**

Crie `src/lib/evaluationDimensions.js` (via Bash heredoc):

```js
// Dimensões da avaliação do evento. Fonte única usada pelo formulário
// (participante/mentor) e pelo dashboard do admin.
export const EVAL_MIN = 0;
export const EVAL_MAX = 10;
export const EVAL_STEP = 0.5;

// 'participantOnly' marca dimensões que só o participante avalia (mentor não
// se auto-avalia em mentoria).
export const EVALUATION_DIMENSIONS = [
  { key: "venue", label: "Local / estrutura física" },
  { key: "methodology", label: "Metodologia / dinâmica" },
  { key: "food", label: "Comida / coffee" },
  { key: "platform", label: "Plataforma (app/site)" },
  { key: "organization", label: "Organização e comunicação" },
  { key: "mentorship", label: "Mentoria", participantOnly: true },
  { key: "criteria", label: "Critérios e premiação" },
  { key: "networking", label: "Networking / clima" },
  { key: "talks", label: "Palestras / conteúdos" },
  { key: "nps", label: "Recomendaria o evento a um colega?" },
];

// Dimensões válidas para um tipo de respondente.
export function dimensionsFor(type) {
  return EVALUATION_DIMENSIONS.filter(
    (d) => type === "participant" || !d.participantOnly,
  );
}

// Valida/limpa o objeto de notas vindo do formulário. Mantém só as dimensões
// permitidas para o tipo; cada nota precisa ser número em [0,10] múltiplo de 0,5.
// Notas ausentes/vazias são omitidas — não viram 0.
export function validateScores(scores, type) {
  const allowed = new Set(dimensionsFor(type).map((d) => d.key));
  const out = {};
  for (const [key, raw] of Object.entries(scores || {})) {
    if (!allowed.has(key)) continue;
    if (raw == null || raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) return { value: null, error: "invalid_score" };
    if (n < EVAL_MIN || n > EVAL_MAX)
      return { value: null, error: "score_out_of_range" };
    if (Math.round(n * 2) !== n * 2)
      return { value: null, error: "invalid_step" };
    out[key] = n;
  }
  return { value: out, error: null };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm run test -- evaluationDimensions`
Expected: PASS (todos os casos verdes).

- [ ] **Step 5: Commit**

```bash
git -c safe.directory='*' add src/lib/evaluationDimensions.js src/lib/evaluationDimensions.test.js
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' \
  commit -m "feat(avaliacao): módulo de dimensões + validação de notas"
```

---

## Task 2: Agregação dos resultados (TDD)

**Files:**

- Create: `src/admin/evaluationResults.js`
- Test: `src/admin/evaluationResults.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/admin/evaluationResults.test.js` (via Bash heredoc):

```js
import { describe, it, expect } from "vitest";
import { aggregateResults } from "./evaluationResults";

describe("aggregateResults", () => {
  it("conta respostas por tipo", () => {
    const r = aggregateResults([
      { respondent_type: "participant", scores: { venue: 8 } },
      { respondent_type: "participant", scores: { venue: 6 } },
      { respondent_type: "mentor", scores: { venue: 10 } },
    ]);
    expect(r.participant.count).toBe(2);
    expect(r.mentor.count).toBe(1);
  });

  it("média por dimensão com 1 casa decimal, ignorando ausentes", () => {
    const r = aggregateResults([
      { respondent_type: "participant", scores: { venue: 8, food: 7 } },
      { respondent_type: "participant", scores: { venue: 5 } }, // sem food
    ]);
    expect(r.participant.dims.venue).toEqual({ avg: 6.5, count: 2 });
    expect(r.participant.dims.food).toEqual({ avg: 7, count: 1 });
  });

  it("dimensão sem nenhuma nota não aparece", () => {
    const r = aggregateResults([
      { respondent_type: "mentor", scores: { venue: 9 } },
    ]);
    expect(r.mentor.dims.food).toBeUndefined();
  });

  it("ignora linhas de tipo desconhecido e lista vazia", () => {
    expect(
      aggregateResults([{ respondent_type: "alien", scores: { venue: 9 } }])
        .participant.count,
    ).toBe(0);
    expect(aggregateResults([]).participant.count).toBe(0);
    expect(aggregateResults(null).mentor.count).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm run test -- evaluationResults`
Expected: FAIL com "Failed to resolve import './evaluationResults'".

- [ ] **Step 3: Implementar a função**

Crie `src/admin/evaluationResults.js` (via Bash heredoc):

```js
import { EVALUATION_DIMENSIONS } from "../lib/evaluationDimensions";

// Agrega linhas de event_evaluations em médias por dimensão e tipo.
// rows: [{ respondent_type, scores: { key: number } }]
// Retorna { participant: { count, dims: { key: { avg, count } } }, mentor: {...} }
export function aggregateResults(rows) {
  const init = () => ({ count: 0, dims: {} });
  const acc = { participant: init(), mentor: init() };
  for (const row of rows || []) {
    const bucket = acc[row?.respondent_type];
    if (!bucket) continue;
    bucket.count += 1;
    for (const d of EVALUATION_DIMENSIONS) {
      const v = row.scores?.[d.key];
      if (v == null || !Number.isFinite(Number(v))) continue;
      const slot =
        bucket.dims[d.key] || (bucket.dims[d.key] = { sum: 0, count: 0 });
      slot.sum += Number(v);
      slot.count += 1;
    }
  }
  for (const type of ["participant", "mentor"]) {
    for (const key of Object.keys(acc[type].dims)) {
      const slot = acc[type].dims[key];
      slot.avg = slot.count
        ? Math.round((slot.sum / slot.count) * 10) / 10
        : null;
      delete slot.sum;
    }
  }
  return acc;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm run test -- evaluationResults`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory='*' add src/admin/evaluationResults.js src/admin/evaluationResults.test.js
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' \
  commit -m "feat(avaliacao): agregação de médias dos resultados"
```

---

## Task 3: Migration SQL (tabela + flag + RPCs)

**Files:**

- Create: `migrations/add_event_evaluation.sql`

- [ ] **Step 1: Escrever a migration**

Crie `migrations/add_event_evaluation.sql` (via Write — arquivo `.sql`):

```sql
-- Avaliação do evento (pós-evento) por participantes e mentores.
-- Cada pessoa responde UMA vez (travado pelo UNIQUE). Notas 0–10 (step 0,5)
-- por dimensão em JSONB + um comentário livre. Switch global em app_settings
-- ('evaluation_open') controla se o formulário aceita respostas — mesmo padrão
-- de team_scores_visible. Todo acesso é via RPC SECURITY DEFINER: a tabela é
-- deny-all para anon/authenticated (RLS sem policies), como o resto do app.

-- 0. Tabela
CREATE TABLE IF NOT EXISTS event_evaluations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  respondent_type TEXT NOT NULL CHECK (respondent_type IN ('participant','mentor')),
  respondent_id   UUID NOT NULL,
  scores          JSONB NOT NULL DEFAULT '{}'::jsonb,
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (respondent_type, respondent_id)
);

ALTER TABLE event_evaluations ENABLE ROW LEVEL SECURITY;
-- Sem policies => deny-all para anon/authenticated. Acesso só pelas RPCs abaixo.

-- 1. Garante app_settings e semeia o switch DESLIGADO (idempotente).
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO app_settings (key, value)
VALUES ('evaluation_open', 'false')
ON CONFLICT (key) DO NOTHING;

-- 2. Resolve o respondente a partir do token. Helper interno (chamado só pelas
--    RPCs SECURITY DEFINER abaixo, que rodam como o dono) — não é concedido a anon.
--    Participante: participant_session_owner + pagamento confirmado (espelha o
--    gate da aba no painel). Mentor: token de sessão (mentor_sessions) OU
--    access_token (link). Retorna NULL se inválido.
CREATE OR REPLACE FUNCTION event_eval_resolve(p_token UUID, p_type TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_type = 'participant' THEN
    v_id := participant_session_owner(p_token);
    IF v_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM registrations WHERE id = v_id AND payment_status = 'confirmed'
    ) THEN
      RETURN NULL;
    END IF;
    RETURN v_id;
  ELSIF p_type = 'mentor' THEN
    SELECT mentor_id INTO v_id FROM mentor_sessions
      WHERE token = p_token AND expires_at > now();
    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM mentors WHERE access_token = p_token;
    END IF;
    RETURN v_id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION event_eval_resolve(UUID, TEXT) FROM PUBLIC;

-- 3. Envio da avaliação (participante/mentor). Exige switch aberto e token
--    válido; recusa segundo envio (UNIQUE). Valida que cada nota é número 0–10.
CREATE OR REPLACE FUNCTION submit_event_evaluation(
  p_token UUID, p_type TEXT, p_scores JSONB, p_comment TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_open BOOLEAN;
  v_inserted INT;
BEGIN
  v_id := event_eval_resolve(p_token, p_type);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  v_open := COALESCE(
    (SELECT value = 'true' FROM app_settings WHERE key = 'evaluation_open'),
    false
  );
  IF NOT v_open THEN
    RAISE EXCEPTION 'evaluation_closed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_each(COALESCE(p_scores, '{}'::jsonb)) e
    WHERE jsonb_typeof(e.value) <> 'number'
       OR (e.value)::numeric < 0
       OR (e.value)::numeric > 10
  ) THEN
    RAISE EXCEPTION 'invalid_scores';
  END IF;

  INSERT INTO event_evaluations (respondent_type, respondent_id, scores, comment)
  VALUES (
    p_type, v_id,
    COALESCE(p_scores, '{}'::jsonb),
    NULLIF(btrim(COALESCE(p_comment, '')), '')
  )
  ON CONFLICT (respondent_type, respondent_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RAISE EXCEPTION 'already_submitted';
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION submit_event_evaluation(UUID, TEXT, JSONB, TEXT) TO anon;

-- 4. Estado do formulário para o respondente: autorizado? aberto? já enviou?
--    Devolve também o que foi enviado, para a tela read-only de "obrigado".
CREATE OR REPLACE FUNCTION get_my_event_evaluation(p_token UUID, p_type TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_open BOOLEAN;
  v_row event_evaluations%ROWTYPE;
BEGIN
  v_id := event_eval_resolve(p_token, p_type);
  IF v_id IS NULL THEN
    RETURN json_build_object('authorized', false);
  END IF;

  v_open := COALESCE(
    (SELECT value = 'true' FROM app_settings WHERE key = 'evaluation_open'),
    false
  );

  SELECT * INTO v_row FROM event_evaluations
    WHERE respondent_type = p_type AND respondent_id = v_id;

  RETURN json_build_object(
    'authorized', true,
    'open', v_open,
    'submitted', v_row.id IS NOT NULL,
    'scores', COALESCE(v_row.scores, '{}'::jsonb),
    'comment', v_row.comment,
    'created_at', v_row.created_at
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_my_event_evaluation(UUID, TEXT) TO anon;

-- 5. Resultados para o admin/viewer: linhas cruas (agregadas no front pela
--    função testada aggregateResults) + comentários + estado do switch.
CREATE OR REPLACE FUNCTION get_event_evaluation_results()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows JSON;
  v_comments JSON;
  v_open BOOLEAN;
BEGIN
  IF NOT is_admin_or_viewer() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(json_agg(json_build_object(
    'respondent_type', respondent_type,
    'scores', scores
  )), '[]'::json) INTO v_rows FROM event_evaluations;

  SELECT COALESCE(json_agg(json_build_object(
    'respondent_type', respondent_type,
    'comment', comment,
    'created_at', created_at
  ) ORDER BY created_at DESC), '[]'::json) INTO v_comments
  FROM event_evaluations WHERE comment IS NOT NULL;

  v_open := COALESCE(
    (SELECT value = 'true' FROM app_settings WHERE key = 'evaluation_open'),
    false
  );

  RETURN json_build_object('open', v_open, 'rows', v_rows, 'comments', v_comments);
END;
$$;
REVOKE EXECUTE ON FUNCTION get_event_evaluation_results() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_event_evaluation_results() FROM anon;
GRANT EXECUTE ON FUNCTION get_event_evaluation_results() TO authenticated;

-- 6. Liga/desliga o switch (SOMENTE admin). Espelha set_team_scores_visible.
CREATE OR REPLACE FUNCTION set_evaluation_open(p_open BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO app_settings (key, value, updated_at)
  VALUES ('evaluation_open', CASE WHEN p_open THEN 'true' ELSE 'false' END, now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();
  RETURN p_open;
END;
$$;
REVOKE EXECUTE ON FUNCTION set_evaluation_open(BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_evaluation_open(BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION set_evaluation_open(BOOLEAN) TO authenticated;

-- ============================================================
-- Após aplicar: o switch começa DESLIGADO. Ligue pelo painel admin
-- (aba Avaliação) ou manualmente:  SELECT set_evaluation_open(true);
-- ============================================================
```

- [ ] **Step 2: Verificar dependências assumidas**

Confirme que estes objetos já existem no banco (criados por migrations anteriores) — a migration os referencia:

- função `participant_session_owner(UUID)` → usada em `add_team_scores_visibility.sql`
- funções `is_admin()` e `is_admin_or_viewer()` → usadas em várias migrations
- tabelas `registrations(id, payment_status)`, `mentor_sessions(token, mentor_id, expires_at)`, `mentors(id, access_token)`

Run: `git -c safe.directory='*' grep -n "FUNCTION participant_session_owner\|FUNCTION is_admin_or_viewer\|FUNCTION is_admin" migrations/`
Expected: pelo menos uma definição de cada. (Se faltar, pare e avise — não invente helper novo.)

- [ ] **Step 3: Aplicar a migration no Supabase**

Esta migration é aplicada manualmente (não há runner). Opções:

- Cole o conteúdo no SQL Editor do Supabase e rode; **ou**
- Se o MCP do Supabase estiver disponível nesta sessão, aplique via `apply_migration` com name `add_event_evaluation`.

Expected: execução sem erro; `SELECT set_evaluation_open` e `get_event_evaluation_results` aparecem em `\df`.

- [ ] **Step 4: Smoke test no SQL Editor**

Run (no SQL Editor):

```sql
SELECT get_my_event_evaluation('00000000-0000-0000-0000-000000000000'::uuid, 'participant');
```

Expected: `{"authorized": false}` (token inválido → não autorizado, sem erro).

- [ ] **Step 5: Commit**

```bash
git -c safe.directory='*' add migrations/add_event_evaluation.sql
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' \
  commit -m "feat(avaliacao): migration (tabela, switch e RPCs)"
```

---

## Task 4: Componente compartilhado `EventEvaluationForm`

**Files:**

- Create: `src/lib/EventEvaluationForm.jsx`

- [ ] **Step 1: Implementar o componente**

Crie `src/lib/EventEvaluationForm.jsx` (via Bash heredoc — aspas simples, sem `;`):

```jsx
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import {
  dimensionsFor,
  validateScores,
  EVAL_MIN,
  EVAL_MAX,
  EVAL_STEP,
} from "./evaluationDimensions";

// Cor do slider por faixa de nota (0–10), espelhando o padrão do JurorTeamCard.
function accentFor(v) {
  if (v == null) return "#3a86ff";
  if (v >= 8) return "#06d6a0";
  if (v >= 5) return "#ffbe0b";
  return "#ff006e";
}

function Shell({ children }) {
  return (
    <section className="card-glass rounded-2xl p-6 border border-cyan/20">
      <p className="text-xs font-mono text-cyan uppercase tracking-wider mb-1">
        Avaliação do evento
      </p>
      {children}
    </section>
  );
}

export default function EventEvaluationForm({ respondentType, token }) {
  const dims = dimensionsFor(respondentType);
  const [state, setState] = useState("loading"); // loading | unauthorized | closed | form | done
  const [scores, setScores] = useState({});
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    if (!supabase || !token) {
      setState("closed");
      return;
    }
    let active = true;
    supabase
      .rpc("get_my_event_evaluation", {
        p_token: token,
        p_type: respondentType,
      })
      .then(({ data, error: e }) => {
        if (!active) return;
        if (e || !data || !data.authorized) {
          setState("unauthorized");
          return;
        }
        if (data.submitted) {
          setSaved(data);
          setState("done");
          return;
        }
        setState(data.open ? "form" : "closed");
      });
    return () => {
      active = false;
    };
  }, [token, respondentType]);

  function setScore(key, value) {
    setScores((prev) => ({
      ...prev,
      [key]: value === "" ? undefined : Number(value),
    }));
  }

  async function handleSubmit() {
    setError(null);
    const { value, error: vErr } = validateScores(scores, respondentType);
    if (vErr) {
      setError("Há uma nota inválida. Use valores de 0 a 10.");
      return;
    }
    if (Object.keys(value).length === 0 && !comment.trim()) {
      setError("Dê pelo menos uma nota ou escreva um comentário.");
      return;
    }
    setSubmitting(true);
    const { error: e } = await supabase.rpc("submit_event_evaluation", {
      p_token: token,
      p_type: respondentType,
      p_scores: value,
      p_comment: comment.trim() || null,
    });
    setSubmitting(false);
    if (e) {
      if (e.message?.includes("already_submitted")) {
        setSaved({ scores: value, comment: comment.trim() || null });
        setState("done");
      } else if (e.message?.includes("evaluation_closed")) {
        setState("closed");
      } else setError("Não foi possível enviar. Tente novamente.");
      return;
    }
    setSaved({ scores: value, comment: comment.trim() || null });
    setState("done");
  }

  if (state === "loading") {
    return (
      <Shell>
        <p className="text-sm text-text-muted mt-2">Carregando…</p>
      </Shell>
    );
  }

  if (state === "unauthorized") {
    return (
      <Shell>
        <p className="text-sm text-text-muted mt-2">
          Não foi possível identificar seu acesso para avaliar.
        </p>
      </Shell>
    );
  }

  if (state === "closed") {
    return (
      <Shell>
        <h2 className="text-lg font-bold mt-1">Avaliação indisponível</h2>
        <p className="text-sm text-text-muted mt-2 leading-relaxed">
          A avaliação do evento ainda não foi liberada ou já foi encerrada.
          Fique de olho nos avisos da organização.
        </p>
      </Shell>
    );
  }

  if (state === "done") {
    return (
      <Shell>
        <h2 className="text-lg font-bold mt-1">
          Obrigado pela sua avaliação! 🎉
        </h2>
        <p className="text-sm text-text-muted mt-2 mb-4">
          Sua resposta foi registrada. Veja o que você enviou:
        </p>
        <ul className="space-y-2">
          {dims.map((d) => {
            const v = saved?.scores?.[d.key];
            return (
              <li
                key={d.key}
                className="flex items-center justify-between gap-3 text-sm border border-dark-border rounded-lg px-3 py-2 bg-dark/40"
              >
                <span className="text-white/80">{d.label}</span>
                <span className="font-mono" style={{ color: accentFor(v) }}>
                  {v != null ? v : "—"}
                </span>
              </li>
            );
          })}
        </ul>
        {saved?.comment && (
          <div className="mt-4 rounded-xl border border-dark-border bg-dark/40 px-4 py-3">
            <p className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1">
              Seu comentário
            </p>
            <p className="text-sm text-white/80 whitespace-pre-wrap">
              {saved.comment}
            </p>
          </div>
        )}
      </Shell>
    );
  }

  // state === 'form'
  return (
    <Shell>
      <h2 className="text-lg font-bold mt-1">Conta pra gente como foi</h2>
      <p className="text-sm text-text-muted mt-1 mb-5 leading-relaxed">
        Dê uma nota de 0 a 10 para cada item (arraste o slider). Você envia uma
        vez — depois não dá pra editar.
      </p>

      <div className="space-y-5">
        {dims.map((d) => {
          const v = scores[d.key];
          const accent = accentFor(v);
          return (
            <div
              key={d.key}
              className="border border-dark-border rounded-xl p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">
                  {d.label}
                </span>
                <span
                  className="font-mono text-xl tabular-nums"
                  style={{ color: accent }}
                >
                  {v != null ? v.toFixed(1) : "—"}
                </span>
              </div>
              <input
                type="range"
                min={EVAL_MIN}
                max={EVAL_MAX}
                step={EVAL_STEP}
                value={v != null ? v : EVAL_MIN}
                onChange={(e) => setScore(d.key, e.target.value)}
                style={{ accentColor: accent, opacity: v != null ? 1 : 0.45 }}
                className="w-full mt-3 h-1.5 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-text-muted mt-1">
                <span>0</span>
                <span>5</span>
                <span>10</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5">
        <label className="text-xs font-mono text-text-muted uppercase tracking-wider">
          Comentário (opcional)
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={5000}
          placeholder="O que funcionou bem? O que dá pra melhorar?"
          className="w-full mt-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50"
        />
      </div>

      {error && <p className="text-sm text-hot mt-3">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-4 w-full sm:w-auto px-6 py-2.5 rounded-xl bg-cyan/15 border border-cyan/40 text-cyan font-semibold hover:bg-cyan/25 transition-colors disabled:opacity-50"
      >
        {submitting ? "Enviando…" : "Enviar avaliação"}
      </button>
    </Shell>
  );
}
```

- [ ] **Step 2: Verificar build e lint**

Run: `npm run lint && npm run build`
Expected: sem erros. (O componente ainda não está referenciado; build valida sintaxe/imports.)

- [ ] **Step 3: Commit**

```bash
git -c safe.directory='*' add src/lib/EventEvaluationForm.jsx
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' \
  commit -m "feat(avaliacao): formulário compartilhado participante/mentor"
```

---

## Task 5: Aba "Avaliação" no painel do participante

**Files:**

- Modify: `src/participant/ParticipantPanel.jsx`

- [ ] **Step 1: Adicionar o import**

No topo de `src/participant/ParticipantPanel.jsx` (após a linha `import CriteriaHighlight from './CriteriaHighlight'`), adicione:

```jsx
import EventEvaluationForm from "../lib/EventEvaluationForm";
```

- [ ] **Step 2: Adicionar a aba em `ALL_TABS`**

Em `ALL_TABS` (linhas 12–18), acrescente a entrada de avaliação após `resources`:

```jsx
const ALL_TABS = [
  { id: "team", label: "Equipe", icon: "team" },
  { id: "event", label: "Evento", icon: "event" },
  { id: "deliverables", label: "Entregáveis", icon: "deliverables" },
  { id: "resources", label: "Recursos", icon: "resources" },
  { id: "evaluation", label: "Avaliação", icon: "evaluation" },
  { id: "profile", label: "Meus Dados", icon: "profile" },
];
```

- [ ] **Step 3: Adicionar o ícone em `TabIcon`**

Em `TabIcon` (após o bloco `if (name === 'resources')`, antes do `// default`), adicione o caso da estrela:

```jsx
if (name === "evaluation")
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 0 0 .95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 0 0-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 0 0-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 0 0-.363-1.118L2.05 10.8c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 0 0 .951-.69l1.519-4.674z"
      />
    </svg>
  );
```

- [ ] **Step 4: Renderizar o conteúdo da aba**

Na seção `{/* Content */}` (linhas 142–147), adicione após a linha de `resources`:

```jsx
{
  tab === "evaluation" && isPaid && (
    <EventEvaluationForm respondentType="participant" token={auth.token} />
  );
}
```

- [ ] **Step 5: Verificar build e lint**

Run: `npm run lint && npm run build`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git -c safe.directory='*' add src/participant/ParticipantPanel.jsx
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' \
  commit -m "feat(avaliacao): aba no painel do participante"
```

---

## Task 6: Avaliação no painel do mentor

**Files:**

- Modify: `src/mentor/MentorPanel.jsx`

- [ ] **Step 1: Adicionar o import**

No topo de `src/mentor/MentorPanel.jsx` (após `import AiEvaluationView from '../lib/AiEvaluationView'`), adicione:

```jsx
import EventEvaluationForm from "../lib/EventEvaluationForm";
```

- [ ] **Step 2: Renderizar o formulário no fim do `<main>`**

O formulário independe de pareamento (mentor avalia o evento mesmo sem equipe), então fica **fora** do ternário `teams.length === 0`. Localize o fechamento do ternário seguido de `</main>` (≈ linhas 195–196):

```jsx
          </>
        )}
      </main>
```

Substitua por:

```jsx
          </>
        )}

        <EventEvaluationForm respondentType="mentor" token={auth.token} />
      </main>
```

- [ ] **Step 3: Verificar build e lint**

Run: `npm run lint && npm run build`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git -c safe.directory='*' add src/mentor/MentorPanel.jsx
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' \
  commit -m "feat(avaliacao): formulário no painel do mentor"
```

---

## Task 7: Aba de resultados no painel admin

**Files:**

- Create: `src/admin/AdminEvaluation.jsx`
- Modify: `src/admin/AdminPanel.jsx`

- [ ] **Step 1: Implementar `AdminEvaluation`**

Crie `src/admin/AdminEvaluation.jsx` (via Bash heredoc):

```jsx
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { EVALUATION_DIMENSIONS } from "../lib/evaluationDimensions";
import { aggregateResults } from "./evaluationResults";

function barColor(v) {
  if (v == null) return "#3a86ff";
  if (v >= 8) return "#06d6a0";
  if (v >= 5) return "#ffbe0b";
  return "#ff006e";
}

function Bar({ label, value, count }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-white/60">{label}</span>
        <span className="font-mono" style={{ color: barColor(value) }}>
          {value != null ? value.toFixed(1) : "—"}
          {count != null && <span className="text-white/30"> · {count}</span>}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        {value != null && (
          <div
            className="h-full rounded-full"
            style={{
              width: `${(value / 10) * 100}%`,
              backgroundColor: barColor(value),
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function AdminEvaluation({ readOnly }) {
  const [open, setOpen] = useState(false);
  const [agg, setAgg] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = useCallback(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase.rpc("get_event_evaluation_results").then(({ data, error }) => {
      if (error || !data) {
        setErr("Não foi possível carregar os resultados.");
        setLoading(false);
        return;
      }
      setOpen(!!data.open);
      setAgg(aggregateResults(data.rows || []));
      setComments(data.comments || []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    const { error } = await supabase.rpc("set_evaluation_open", {
      p_open: next,
    });
    if (error) {
      setOpen(!next);
      setErr("Não foi possível alterar o status.");
    }
  }

  if (loading) return <p className="text-white/50 text-sm">Carregando…</p>;

  const pCount = agg?.participant.count ?? 0;
  const mCount = agg?.mentor.count ?? 0;

  return (
    <div className="space-y-6">
      {/* Cabeçalho + switch */}
      <div className="card-glass rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono text-cyan uppercase tracking-wider">
            Avaliação do evento
          </p>
          <h2 className="text-xl font-bold mt-1 text-white">
            {pCount + mCount} respostas
          </h2>
          <p className="text-sm text-white/50 mt-1">
            {pCount} participantes · {mCount} mentores
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            className="text-xs font-mono px-3 py-1.5 rounded-lg border border-white/10 text-white/60 hover:text-white"
          >
            Atualizar
          </button>
          {!readOnly && (
            <button
              onClick={toggle}
              className={`flex items-center gap-2 text-sm font-mono px-3 py-1.5 rounded-full border transition-colors ${
                open
                  ? "bg-cyan/15 text-cyan border-cyan/30"
                  : "bg-white/5 text-white/50 border-white/10 hover:text-white/70"
              }`}
            >
              <span
                className={`inline-block w-2 h-2 rounded-full ${open ? "bg-cyan" : "bg-white/30"}`}
              />
              {open ? "Avaliação aberta" : "Avaliação fechada"}
            </button>
          )}
        </div>
      </div>

      {err && <p className="text-sm text-hot">{err}</p>}

      {/* Médias por dimensão: participante × mentor */}
      <div className="card-glass rounded-2xl p-5">
        <p className="text-xs font-mono text-electric uppercase tracking-wider mb-4">
          Médias por dimensão
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-4">
            <p className="text-sm font-semibold text-white/70">Participantes</p>
            {EVALUATION_DIMENSIONS.map((d) => {
              const slot = agg?.participant.dims[d.key];
              return (
                <Bar
                  key={d.key}
                  label={d.label}
                  value={slot?.avg ?? null}
                  count={slot?.count ?? 0}
                />
              );
            })}
          </div>
          <div className="space-y-4">
            <p className="text-sm font-semibold text-white/70">Mentores</p>
            {EVALUATION_DIMENSIONS.filter((d) => !d.participantOnly).map(
              (d) => {
                const slot = agg?.mentor.dims[d.key];
                return (
                  <Bar
                    key={d.key}
                    label={d.label}
                    value={slot?.avg ?? null}
                    count={slot?.count ?? 0}
                  />
                );
              },
            )}
          </div>
        </div>
      </div>

      {/* Comentários livres */}
      <div className="card-glass rounded-2xl p-5">
        <p className="text-xs font-mono text-gold uppercase tracking-wider mb-4">
          Comentários ({comments.length})
        </p>
        {comments.length === 0 ? (
          <p className="text-sm text-white/50">Nenhum comentário ainda.</p>
        ) : (
          <ul className="space-y-3">
            {comments.map((c, i) => (
              <li
                key={i}
                className="border border-dark-border rounded-xl p-4 bg-dark/40"
              >
                <span
                  className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    c.respondent_type === "mentor"
                      ? "bg-violet/10 text-violet"
                      : "bg-cyan/10 text-cyan"
                  }`}
                >
                  {c.respondent_type === "mentor" ? "Mentor" : "Participante"}
                </span>
                <p className="text-sm text-white/80 whitespace-pre-wrap mt-2">
                  {c.comment}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Registrar a aba em `AdminPanel`**

Em `src/admin/AdminPanel.jsx`:

(a) Após `import AdminFacilitator from './AdminFacilitator'`, adicione:

```jsx
import AdminEvaluation from "./AdminEvaluation";
```

(b) Em `ALL_TABS`, após a entrada de `ranking`, adicione (sem `adminOnly` — o viewer também vê os resultados; só o toggle é gated por admin no componente):

```jsx
  { id: 'evaluation', label: 'Avaliação', icon: '⭐' },
```

(c) Na seção de conteúdo, junto das abas visíveis ao viewer (após a linha `{activeTab === 'ranking' && <AdminRanking />}`), adicione:

```jsx
{
  activeTab === "evaluation" && <AdminEvaluation readOnly={readOnly} />;
}
```

- [ ] **Step 3: Verificar build e lint**

Run: `npm run lint && npm run build`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git -c safe.directory='*' add src/admin/AdminEvaluation.jsx src/admin/AdminPanel.jsx
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' \
  commit -m "feat(avaliacao): dashboard de resultados no admin"
```

---

## Task 8: Verificação final ponta a ponta

**Files:** nenhum (verificação).

- [ ] **Step 1: Rodar a suíte completa de testes**

Run: `npm run test`
Expected: todos os testes passam, incluindo `evaluationDimensions` e `evaluationResults`.

- [ ] **Step 2: Lint + build de produção**

Run: `npm run lint && npm run build`
Expected: sem erros nem warnings novos.

- [ ] **Step 3: Smoke manual (dev server)**

Run: `npm run dev` e verifique:

1. Com a migration aplicada e o switch **desligado**: na aba "Avaliação" (participante logado e pago / mentor logado) aparece "Avaliação indisponível".
2. Ligue o switch no admin (aba Avaliação → "Avaliação fechada" → clicar vira "Avaliação aberta").
3. Recarregue o painel do participante: o formulário aparece. Dê notas, envie → tela de "Obrigado" com o resumo.
4. Recarregue: continua na tela de "Obrigado" (travado, 1 resposta).
5. No admin, aba Avaliação: a contagem subiu, as barras de média refletem a resposta e o comentário aparece.

Expected: todos os passos conferem. (Se Supabase não estiver configurado em dev, os estados degradam para "indisponível" — esperado.)

- [ ] **Step 4: Confirmar histórico de commits**

Run: `git -c safe.directory='*' log --oneline -8`
Expected: os commits das Tasks 1–7 presentes, na ordem.

---

## Resumo de cobertura do spec

| Requisito do spec                                          | Task                         |
| ---------------------------------------------------------- | ---------------------------- |
| 10 dimensões participante / 9 mentor (sem mentoria)        | 1, 4                         |
| Escala 0–10 step 0,5, começa sem nota                      | 1, 4                         |
| Comentário único geral opcional                            | 4                            |
| 1 resposta por pessoa, travada                             | 3 (UNIQUE), 4 (tela done)    |
| Acesso logado e identificado (token)                       | 3 (event_eval_resolve), 5, 6 |
| Gate de pagamento confirmado (participante)                | 3 (resolve), 5               |
| Switch admin abre/fecha                                    | 3 (set_evaluation_open), 7   |
| Dashboard admin: médias part×mentor, contagem, comentários | 2, 7                         |
| Viewer vê resultados, só admin liga o switch               | 3 (grants), 7 (readOnly)     |
| Tudo via RPC SECURITY DEFINER, tabela deny-all             | 3                            |
