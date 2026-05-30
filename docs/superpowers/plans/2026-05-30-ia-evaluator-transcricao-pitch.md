# IA Evaluator — Transcrição do pitch + 3 eixos (edital 5.3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cumprir a cláusula 5.3 do edital — os pitchs finais são transcritos (Whisper self-hosted) e analisados por IA nos 3 eixos nomeados (consistência técnica, tom de voz, viabilidade mercadológica), mantendo a análise human-in-the-loop e a nota oficial dos jurados intacta.

**Architecture:** Captura de áudio ao vivo (upload no bucket `files`), processamento após a final: uma edge function `transcribe-pitch` chama o Whisper e grava a transcrição em `teams`; o `iaEvaluator.js` injeta transcrição + métricas de fala no pacote da Fase 3 e passa a parsear/gravar os 3 eixos em `team_evaluations.axes`. Os eixos são feedback (não entram na soma ponderada da cláusula 6).

**Tech Stack:** React 19, Vite 8, Supabase JS, Supabase Edge Functions (Deno), Vitest (node env), Tailwind v4. Whisper self-hosted (FastAPI): `POST /transcribe` (multipart `audio`), `GET /health`.

> **Estado atual:** já estamos no branch `feat/ia-evaluator-transcricao-pitch` com a spec commitada (`docs/superpowers/specs/2026-05-30-ia-evaluator-transcricao-pitch-design.md`). Todos os commits abaixo vão neste branch.

> **⚠️ Convenção de estilo (importante):** os arquivos `.js`/`.jsx` deste repo usam **aspas simples e sem ponto-e-vírgula**. Há um hook de formatação (PostToolUse) que reescreve arquivos editados via Edit/Write para aspas-duplas+semicolons — isso **não quebra** `npm run lint`/`build` (o ESLint não impõe quotes/semicolons), mas gera diffs fora do padrão. Aplique as edições de `.js`/`.jsx` pelo **Bash tool** (heredoc / `node` / `sed`) para preservar o estilo, e use `npm run lint` + `npm run build` como fonte de verdade. Blocos de código neste plano podem aparecer com aspas-duplas por causa do formatter deste doc — escreva no estilo do repo.

---

## File Structure

- `migrations/add_pitch_transcription.sql` — **criar**: colunas `teams.pitch_*` + `team_evaluations.axes` + policy de INSERT do admin no storage (aplicar à mão).
- `src/lib/iaEvaluator.js` — **modificar**: `PITCH_AXES`, `pitchSpeechMetrics`, fase3 com `hasAxes`, transcrição+métricas+eixos no build, validação de `axes` no parse. `aggregateTeamEvaluation` inalterada.
- `src/lib/iaEvaluator.test.js` — **modificar**: testes novos (eixos, métricas, parse de axes).
- `supabase/functions/transcribe-pitch/index.ts` — **criar**: edge function admin-only que transcreve via Whisper e grava em `teams`.
- `src/admin/AdminDeliverables.jsx` — **modificar**: `select`s atualizados, `axes` no payload de save, componente `PitchAudioPanel`, render dos eixos.
- `src/components/Mentorship.jsx` — **modificar**: texto do card "IA Evaluator" (verdadeiro, sem prometer revisão de jurados, que foi faseada).
- `docs/changelog/2026-05-30-ia-evaluator-transcricao-pitch.md` — **criar**: registro.

---

## Task 1: Migration — `teams.pitch_*` + `team_evaluations.axes` + storage INSERT

**Files:**

- Create: `migrations/add_pitch_transcription.sql`

- [ ] **Step 1: Criar a migration**

Escrever `migrations/add_pitch_transcription.sql`:

```sql
-- ============================================================
-- MIGRACAO: Transcricao do pitch + 3 eixos do IA Evaluator (edital 5.3)
-- ============================================================
-- Aplique no SQL Editor do projeto Supabase qshrzfahotmjshtjuvno (NAO auto-aplica).
-- Idempotente. Depende de: teams, team_evaluations
-- (add_deliverable_status_and_evaluations.sql), is_admin() (supabase-setup.sql),
-- bucket `files` (add_resources.sql / add_slides_upload.sql).
--
-- Edital 5.3: "Os pitchs serao transcritos e analisados por um modelo de IA
-- treinado para avaliar consistencia tecnica, tom de voz e viabilidade
-- mercadologica." A transcricao (Whisper self-hosted) e gravada em teams pela
-- edge function transcribe-pitch; a analise human-in-the-loop grava os 3 eixos
-- em team_evaluations.axes.

-- 1. teams: transcricao do pitch + meta (gravados pela edge fn via service role).
ALTER TABLE teams ADD COLUMN IF NOT EXISTS pitch_transcript     TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS pitch_segments       JSONB;   -- [{start,end,text}]
ALTER TABLE teams ADD COLUMN IF NOT EXISTS pitch_transcribed_at TIMESTAMPTZ;

-- 2. team_evaluations: 3 eixos do 5.3 (so na linha ai fase3; NULL nas demais/jurados).
ALTER TABLE team_evaluations ADD COLUMN IF NOT EXISTS axes JSONB;
--   [{key,label,score,justification}] para consistencia_tecnica, tom_de_voz,
--   viabilidade_mercadologica. Display/feedback — NAO entra na soma ponderada.

-- 3. storage: upload do audio do pitch pelo admin. Hoje o admin so tem SELECT/DELETE
--    em deliverables/ (add_slides_upload.sql); o participante nunca escreve audio.
--    Espelha o molde de add_resources.sql.
DROP POLICY IF EXISTS "deliverables_storage_admin_insert" ON storage.objects;
CREATE POLICY "deliverables_storage_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'files' AND name LIKE 'deliverables/%' AND is_admin());
```

- [ ] **Step 2: Commit**

```bash
git add migrations/add_pitch_transcription.sql
git commit -m "feat(db): pitch transcript columns + team_evaluations.axes + admin audio upload policy"
```

> **MANUAL:** aplicar esta migration à mão no SQL Editor do Supabase (projeto `qshrzfahotmjshtjuvno`) antes do recurso funcionar. Sinalizar ao usuário (ver Task 6).

---

## Task 2: `iaEvaluator.js` — eixos 5.3 + métricas de fala + fase3 (TDD)

**Files:**

- Modify: `src/lib/iaEvaluator.test.js`
- Modify: `src/lib/iaEvaluator.js`

- [ ] **Step 1: Escrever os testes (falhando)**

Em `src/lib/iaEvaluator.test.js`, **substituir o bloco de import (linhas 1-8)** por:

```js
import { describe, it, expect } from "vitest";
import {
  DELIVERABLE_UNITS,
  UNIT_BY_ID,
  PITCH_AXES,
  pitchSpeechMetrics,
  buildDeliverablePrompt,
  parseDeliverableEvaluation,
  aggregateTeamEvaluation,
} from "./iaEvaluator";
```

E **acrescentar ao fim do arquivo** estes blocos:

```js
describe("PITCH_AXES (eixos da cláusula 5.3)", () => {
  it("tem os 3 eixos nomeados no edital, nesta ordem", () => {
    expect(PITCH_AXES.map((a) => a.key)).toEqual([
      "consistencia_tecnica",
      "tom_de_voz",
      "viabilidade_mercadologica",
    ]);
  });
  it("só a fase3 cobre os eixos", () => {
    expect(UNIT_BY_ID.fase3.hasAxes).toBe(true);
    expect(UNIT_BY_ID.fase1.hasAxes).toBeFalsy();
    expect(UNIT_BY_ID.fase2.hasAxes).toBeFalsy();
  });
});

describe("pitchSpeechMetrics", () => {
  it("calcula ritmo, pausa e fillers a partir de segments", () => {
    const segments = [
      { start: 0, end: 2, text: "Nosso produto resolve né" }, // 4 palavras, filler "né"
      { start: 3, end: 5, text: "um problema real tipo enorme" }, // 5 palavras, filler "tipo"
    ];
    const m = pitchSpeechMetrics(segments);
    expect(m.words).toBe(9);
    expect(m.durationSec).toBe(5);
    expect(m.fillerCount).toBe(2);
    expect(m.wordsPerMin).toBe(108); // 9 / 5 * 60
    expect(m.avgPauseSec).toBe(1); // gap 3 - 2
  });
  it("retorna null sem segments", () => {
    expect(pitchSpeechMetrics(null)).toBeNull();
    expect(pitchSpeechMetrics([])).toBeNull();
  });
  it("não quebra com 1 segmento (sem pausa)", () => {
    const m = pitchSpeechMetrics([
      { start: 0, end: 4, text: "oi tudo bem pessoal" },
    ]);
    expect(m.words).toBe(4);
    expect(m.avgPauseSec).toBe(0);
  });
});

describe("buildDeliverablePrompt (fase3 com transcrição e eixos)", () => {
  const TEAM3 = {
    ...TEAM,
    pitch_transcript:
      "Boa noite, somos a Nimbus e usamos IA para o setor têxtil.",
    pitch_segments: [{ start: 0, end: 4, text: "Boa noite somos a Nimbus" }],
  };
  it("injeta transcrição, métricas e os 3 eixos no schema", () => {
    const p = buildDeliverablePrompt({
      unit: UNIT_BY_ID.fase3,
      team: TEAM3,
      members: MEMBERS,
    });
    expect(p).toContain("Boa noite, somos a Nimbus");
    expect(p).toContain("palavras/min");
    expect(p).toContain("consistencia_tecnica");
    expect(p).toContain("tom_de_voz");
    expect(p).toContain("viabilidade_mercadologica");
    expect(p).toContain('"axes"');
  });
  it("sinaliza ausência de transcrição", () => {
    const p = buildDeliverablePrompt({
      unit: UNIT_BY_ID.fase3,
      team: TEAM,
      members: MEMBERS,
    });
    expect(p).toContain("sem transcrição do pitch");
  });
});

describe("parseDeliverableEvaluation (fase3 com eixos)", () => {
  const validFase3 = (over = {}) =>
    JSON.stringify({
      scores: [
        { criterion_key: "tecnica_ia", score: 70, justification: "a" },
        { criterion_key: "escala_negocio", score: 60, justification: "b" },
        { criterion_key: "pitch_equipe", score: 80, justification: "c" },
      ],
      axes: {
        consistencia_tecnica: { score: 75, justification: "ct" },
        tom_de_voz: { score: 65, justification: "tv" },
        viabilidade_mercadologica: { score: 55, justification: "vm" },
      },
      eliminated: false,
      summary: "s",
      model: "m",
      ...over,
    });

  it("aceita scores + axes e normaliza os eixos", () => {
    const r = parseDeliverableEvaluation(validFase3(), UNIT_BY_ID.fase3);
    expect(r.scores).toHaveLength(3);
    expect(r.axes.map((a) => a.key)).toEqual([
      "consistencia_tecnica",
      "tom_de_voz",
      "viabilidade_mercadologica",
    ]);
    expect(r.axes[0]).toMatchObject({
      key: "consistencia_tecnica",
      label: "Consistência técnica",
      score: 75,
    });
  });

  it("rejeita eixo faltando", () => {
    const json = validFase3({
      axes: { consistencia_tecnica: { score: 75 }, tom_de_voz: { score: 65 } },
    });
    expect(() => parseDeliverableEvaluation(json, UNIT_BY_ID.fase3)).toThrow(
      /eixo/i,
    );
  });

  it("rejeita score de eixo fora de 0–100", () => {
    const json = validFase3({
      axes: {
        consistencia_tecnica: { score: 120 },
        tom_de_voz: { score: 65 },
        viabilidade_mercadologica: { score: 55 },
      },
    });
    expect(() => parseDeliverableEvaluation(json, UNIT_BY_ID.fase3)).toThrow(
      /0 a 100/,
    );
  });

  it("fase1/fase2 ignoram axes (não exigem nem retornam)", () => {
    const json = JSON.stringify({
      scores: [{ criterion_key: "validacao_problema", score: 80 }],
      axes: { foo: { score: 1 } },
    });
    const r = parseDeliverableEvaluation(json, UNIT_BY_ID.fase1);
    expect(r.axes).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- src/lib/iaEvaluator.test.js`
Expected: FAIL — `PITCH_AXES`/`pitchSpeechMetrics` não exportados; fase3 sem `hasAxes`/`axes`.

- [ ] **Step 3: Implementar em `src/lib/iaEvaluator.js`**

**3a.** Logo após a linha `const CRIT_BY_KEY = Object.fromEntries(EDITAL_RUBRIC.criteria.map(c => [c.key, c]))`, inserir:

```js
// Eixos nomeados na cláusula 5.3 do edital, avaliados a partir da transcrição do
// pitch. São análise/feedback — NÃO entram na soma ponderada (cl. 6 segue sendo o
// total da menção IA). Consistência técnica e viabilidade mercadológica dialogam
// com tecnica_ia/escala_negocio; tom de voz é a dimensão de entrega que só o pitch revela.
export const PITCH_AXES = [
  {
    key: "consistencia_tecnica",
    label: "Consistência técnica",
    describe:
      "O discurso é tecnicamente coerente e condizente com a solução construída? A IA descrita bate com o que foi entregue? Sem contradições nem exageros não sustentados.",
  },
  {
    key: "tom_de_voz",
    label: "Tom de voz",
    describe:
      "Clareza, confiança e ritmo da fala; segurança nas respostas; ausência de leitura robótica ou excesso de muletas. Avaliado pela transcrição + métricas de fala; sem áudio, sinalize a limitação na justificativa.",
  },
  {
    key: "viabilidade_mercadologica",
    label: "Viabilidade mercadológica",
    describe:
      "O pitch convence que há mercado, modelo de receita e caminho de tração? Tese de negócio crível e vendável.",
  },
];
const AXIS_BY_KEY = Object.fromEntries(PITCH_AXES.map((a) => [a.key, a])); // eslint-disable-line no-unused-vars
```

**3b.** Na unidade `fase3` de `DELIVERABLE_UNITS`, acrescentar `hasAxes: true`:

```js
  {
    id: 'fase3', label: 'Fase 3 · Entregas + Pitch', phase: 'Apresentação',
    source: 'final_deliverables', fields: FINAL_FIELDS, includesDiary: false,
    showsPitchNotes: true, hasAxes: true, criteria: ['tecnica_ia', 'escala_negocio', 'pitch_equipe'],
  },
```

**3c.** Após a função `renderUnitRubric`, inserir as métricas de fala e os renderizadores de eixos:

```js
// Métricas de fala derivadas dos segments do Whisper — proxy honesto para "tom de
// voz" (a transcrição perde prosódia). Função pura; retorna null sem segments.
const PT_FILLERS = new Set([
  "né",
  "tipo",
  "então",
  "assim",
  "hum",
  "aí",
  "sabe",
]);
export function pitchSpeechMetrics(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return null;
  const tokens = segments.flatMap(
    (s) =>
      String(s.text || "")
        .toLowerCase()
        .match(/[\p{L}\p{N}]+/gu) || [],
  );
  const words = tokens.length;
  const first = segments[0];
  const last = segments[segments.length - 1];
  const durationSec = Math.max(
    0,
    Math.round((Number(last.end) || 0) - (Number(first.start) || 0)),
  );
  const wordsPerMin =
    durationSec > 0 ? Math.round((words / durationSec) * 60) : 0;
  let pauseSum = 0;
  let pauseN = 0;
  for (let i = 1; i < segments.length; i++) {
    const gap =
      (Number(segments[i].start) || 0) - (Number(segments[i - 1].end) || 0);
    if (gap >= 0) {
      pauseSum += gap;
      pauseN++;
    }
  }
  const avgPauseSec = pauseN ? Math.round((pauseSum / pauseN) * 10) / 10 : 0;
  const fillerCount = tokens.filter((t) => PT_FILLERS.has(t)).length;
  const fillerRate = words ? Math.round((fillerCount / words) * 1000) / 10 : 0;
  return {
    words,
    durationSec,
    wordsPerMin,
    avgPauseSec,
    fillerCount,
    fillerRate,
  };
}

function renderSpeechMetrics(m) {
  if (!m) return "_(sem métricas de fala — transcrição sem segmentos)_";
  return [
    `- Ritmo: ${m.wordsPerMin} palavras/min (${m.words} palavras em ${m.durationSec}s)`,
    `- Pausa média entre trechos: ${m.avgPauseSec}s`,
    `- Muletas linguísticas: ${m.fillerCount} (${m.fillerRate}% das palavras)`,
  ].join("\n");
}

function renderAxesRubric() {
  return PITCH_AXES.map(
    (a) => `- \`${a.key}\` — **${a.label}**: ${a.describe}`,
  ).join("\n");
}
```

**3d.** Em `buildDeliverablePrompt`, **substituir o bloco `if (unit.showsPitchNotes) { ... }`** (que monta as observações do pitch) por este, que injeta transcrição + métricas antes do complemento do operador:

```js
if (unit.hasAxes) {
  const transcript = (team.pitch_transcript || "").trim();
  const metrics = pitchSpeechMetrics(team.pitch_segments);
  deliverableBlock += `\n### Transcrição do pitch (Whisper)\n${transcript || '_(sem transcrição do pitch — avalie "tom de voz" com cautela e sinalize a ausência na justificativa)_'}\n`;
  deliverableBlock += `\n### Métricas de fala (derivadas da transcrição)\n${renderSpeechMetrics(metrics)}\n`;
}
if (unit.showsPitchNotes) {
  deliverableBlock += `\n### Observações do operador sobre o pitch / demo ao vivo (complemento)\n${pitchNotes && pitchNotes.trim() ? pitchNotes.trim() : "_(sem observações do operador)_"}\n`;
}
```

**3e.** Em `buildDeliverablePrompt`, no template final, logo após o bloco `## Critérios deste entregável (rubrica do edital)\n${renderUnitRubric(unit)}`, inserir a rubrica dos eixos (condicional):

```js
${unit.hasAxes ? `
## Eixos da cláusula 5.3 (analisados a partir do pitch)
${renderAxesRubric()}
` : ''}
```

**3f.** Ainda em `buildDeliverablePrompt`, dentro da seção `## Como pontuar`, acrescentar uma linha condicional para os eixos (logo após a linha do eliminatório, ainda dentro da lista):

```js
${unit.hasAxes ? `
- Pontue também os **3 eixos da cláusula 5.3** (0–100 cada) a partir da transcrição e das métricas de fala. Para "tom de voz", se não houver transcrição, sinalize a limitação.` : ''}
```

**3g.** Substituir a função `unitOutputExample` por (acrescenta o bloco `axes` quando `hasAxes`):

```js
function unitOutputExample(unit) {
  const scores = unit.criteria
    .map(
      (k) =>
        `    { "criterion_key": "${k}", "score": 0, "justification": "..." }`,
    )
    .join(",\n");
  const elim = unit.criteria.includes("tecnica_ia")
    ? '\n  "eliminated": false,'
    : "";
  const axes = unit.hasAxes
    ? `\n  "axes": {\n${PITCH_AXES.map((a) => `    "${a.key}": { "score": 0, "justification": "..." }`).join(",\n")}\n  },`
    : "";
  return `{
  "scores": [
${scores}
  ],${elim}${axes}
  "summary": "Parecer do entregável em 2-4 frases, citando evidências.",
  "model": "claude-opus-4-x"
}`;
}
```

**3h.** Em `parseDeliverableEvaluation`, **antes do `return`**, inserir a validação dos eixos e adicionar `axes` ao objeto retornado:

```js
let axes;
if (unit.hasAxes) {
  const rawAxes = raw.axes;
  if (!rawAxes || typeof rawAxes !== "object" || Array.isArray(rawAxes)) {
    throw new Error(
      'O JSON deste entregável precisa de um objeto "axes" com os 3 eixos da cláusula 5.3.',
    );
  }
  axes = PITCH_AXES.map((a) => {
    const v = rawAxes[a.key];
    if (!v || typeof v !== "object")
      throw new Error(`Falta o eixo "${a.label}" em "axes".`);
    const score = Number(v.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new Error(
        `Nota inválida no eixo "${a.label}": deve ser número de 0 a 100.`,
      );
    }
    return {
      key: a.key,
      label: a.label,
      score,
      justification:
        typeof v.justification === "string" ? v.justification.trim() : "",
    };
  });
}
```

E no objeto retornado, acrescentar `axes,` (fica `undefined` em fase1/fase2):

```js
return {
  scores,
  axes,
  total_score,
  eliminated: coversElim ? raw.eliminated === true : false,
  summary: typeof raw.summary === "string" ? raw.summary.trim() : "",
  model:
    typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : null,
};
```

- [ ] **Step 4: Rodar os testes (passando)**

Run: `npm test -- src/lib/iaEvaluator.test.js`
Expected: PASS (testes antigos + novos verdes).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
git add src/lib/iaEvaluator.js src/lib/iaEvaluator.test.js
git commit -m "feat(ia-evaluator): pitch transcript metrics + clausula 5.3 axes on fase3"
```

---

## Task 3: Edge function `transcribe-pitch`

**Files:**

- Create: `supabase/functions/transcribe-pitch/index.ts`

- [ ] **Step 1: Escrever a edge function**

Criar `supabase/functions/transcribe-pitch/index.ts`:

```ts
import { createClient } from "npm:@supabase/supabase-js@2";

// Edge function: transcreve o audio do pitch de uma equipe com o Whisper self-hosted
// (FastAPI) e grava a transcricao em teams. Admin-only (mesma checagem do refund-payment).
//
//   admin (JWT) -> valida role 'admin' -> acha deliverables/<team_id>/pitch.* no bucket
//   privado `files` -> GET {WHISPER_URL}/health -> POST /transcribe (multipart) ->
//   grava teams.pitch_transcript/_segments/_transcribed_at (service role).
//
// Edital cl. 5.3. Processado APOS o evento — a caixa Whisper precisa estar online.
// Segredo necessario: WHISPER_URL (ex.: https://thomas-2024-2.koi-tetra.ts.net).

const ALLOWED_ORIGINS = [
  "https://hackiasc.com",
  "https://www.hackiasc.com",
  "http://localhost:5173",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer "))
    return json({ error: "unauthorized" }, 401);

  const whisperBase = (Deno.env.get("WHISPER_URL") || "").replace(/\/$/, "");
  if (!whisperBase) return json({ error: "whisper_not_configured" }, 500);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Autoriza admin (app_metadata.role nao e auto-editavel pelo usuario).
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: "unauthorized" }, 401);
    if (user.app_metadata?.role !== "admin")
      return json({ error: "forbidden" }, 403);

    // 2. Input.
    const { team_id } = await req.json().catch(() => ({}));
    if (!team_id) return json({ error: "team_id_required" }, 400);

    // 3. Acha o objeto de audio deliverables/<team_id>/pitch.*
    const prefix = `deliverables/${team_id}`;
    const { data: list, error: listErr } = await supabase.storage
      .from("files")
      .list(prefix);
    if (listErr) {
      console.error("list error:", listErr);
      return json({ error: "storage_error" }, 500);
    }
    const audio = (list || []).find((o) => /^pitch\./i.test(o.name));
    if (!audio) return json({ error: "no_audio" }, 404);
    const audioPath = `${prefix}/${audio.name}`;

    // 4. Health-check do Whisper (a caixa pode estar offline).
    try {
      const h = await fetch(`${whisperBase}/health`, { method: "GET" });
      if (!h.ok) throw new Error(`health ${h.status}`);
    } catch (e) {
      console.error("whisper health failed:", e);
      return json({ error: "whisper_offline" }, 503);
    }

    // 5. Baixa o audio e envia ao Whisper.
    const { data: blob, error: dlErr } = await supabase.storage
      .from("files")
      .download(audioPath);
    if (dlErr || !blob) {
      console.error("download error:", dlErr);
      return json({ error: "download_failed" }, 500);
    }

    const form = new FormData();
    form.append("audio", blob, audio.name);
    form.append("language", "pt");
    form.append("vad", "true");

    const resp = await fetch(`${whisperBase}/transcribe`, {
      method: "POST",
      body: form,
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.error("whisper transcribe failed:", resp.status, detail);
      return json({ error: "transcribe_failed", status: resp.status }, 502);
    }
    const result = (await resp.json().catch(() => null)) as {
      text?: string;
      transcription?: string;
      segments?: Array<{ start?: number; end?: number; text?: string }>;
    } | null;

    // 6. Parse defensivo (schema do servidor e destipado).
    const segments = Array.isArray(result?.segments) ? result!.segments : null;
    const transcript =
      (result?.text ??
        result?.transcription ??
        (segments
          ? segments
              .map((s) => s?.text || "")
              .join(" ")
              .trim()
          : "")) ||
      "";
    if (!transcript) return json({ error: "empty_transcript" }, 502);

    // 7. Grava em teams (service role bypassa RLS).
    const { error: upErr } = await supabase
      .from("teams")
      .update({
        pitch_transcript: transcript,
        pitch_segments: segments,
        pitch_transcribed_at: new Date().toISOString(),
      })
      .eq("id", team_id);
    if (upErr) {
      console.error("teams update error:", upErr);
      return json({ error: "save_failed" }, 500);
    }

    return json({
      ok: true,
      chars: transcript.length,
      segments: segments?.length ?? 0,
    });
  } catch (err) {
    console.error("transcribe-pitch error:", err);
    return json({ error: "internal_error" }, 500);
  }
});
```

- [ ] **Step 2: Type-check com Deno**

Run: `deno check supabase/functions/transcribe-pitch/index.ts`
Expected: sem erros de tipo. (Se `deno` não estiver instalado, pular — o deploy valida; anotar para o usuário.)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/transcribe-pitch/index.ts
git commit -m "feat(functions): transcribe-pitch edge function (Whisper self-hosted, admin-only)"
```

> **MANUAL (Task 6):** definir o segredo `WHISPER_URL` e fazer deploy desta function.

---

## Task 4: `AdminDeliverables.jsx` — upload de áudio, transcrição e eixos

**Files:**

- Modify: `src/admin/AdminDeliverables.jsx`

- [ ] **Step 1: Adicionar colunas aos `select`s no `fetchData`**

Na query de `teams` (atual linha ~47), acrescentar as 3 colunas de pitch:

```js
      supabase.from('teams').select('id, name, status, hypotheses_canvas, slc_ia_canvas, learning_diary, final_deliverables, pitch_transcript, pitch_segments, pitch_transcribed_at, updated_at, updated_by').order('name', { ascending: true }),
```

Na query de `team_evaluations` (atual linha ~50), acrescentar `axes`:

```js
      supabase.from('team_evaluations').select('id, team_id, evaluator_type, deliverable, rubric_version, total_score, eliminated, summary, scores, axes, model, status, created_at, updated_at').order('created_at', { ascending: false }),
```

- [ ] **Step 2: Incluir `axes` no payload de save do `DeliverableEvaluator`**

Na função `save()` do componente `DeliverableEvaluator`, no objeto `payload`, acrescentar a linha `axes`:

```js
const payload = {
  team_id: team.id,
  evaluator_type: "ai",
  deliverable: unit.id,
  rubric_version: EDITAL_RUBRIC.version,
  scores: parsed.scores,
  axes: parsed.axes ?? null,
  total_score: parsed.total_score,
  eliminated: parsed.eliminated,
  summary: parsed.summary,
  model: parsed.model,
  status: "done",
  updated_at: new Date().toISOString(),
};
```

- [ ] **Step 3: Renderizar o `PitchAudioPanel` e os eixos no `DeliverableEvaluator`**

**3a.** Dentro do bloco `{!readOnly && (` do `DeliverableEvaluator` (a `<div className="space-y-2 pt-1">`), como **primeiro filho** (antes do `{unit.showsPitchNotes && (`), inserir o painel de áudio só na fase3:

```jsx
{
  unit.hasAxes && <PitchAudioPanel team={team} onTranscribed={onSaved} />;
}
```

**3b.** No bloco "Avaliação gravada", logo após o `<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">...</div>` que lista `existing.scores` (e antes do `{existing.summary && ...}`), inserir a exibição dos eixos:

```jsx
{
  Array.isArray(existing.axes) && existing.axes.length > 0 && (
    <div className="space-y-1 pt-1">
      <p className="text-[10px] font-mono text-gold uppercase tracking-wider">
        Eixos da cláusula 5.3
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {existing.axes.map((a) => (
          <div key={a.key} className="bg-white/5 rounded-lg p-2">
            <div className="flex justify-between text-xs">
              <span className="text-white/70">{a.label}</span>
              <span className="font-mono text-gold">{a.score}</span>
            </div>
            {a.justification && (
              <p className="text-[11px] text-text-muted mt-1 whitespace-pre-wrap">
                {a.justification}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Adicionar o componente `PitchAudioPanel` ao fim do arquivo**

Após o componente `PendingQueue` (fim do arquivo), acrescentar:

```jsx
// Upload do áudio do pitch + transcrição via Whisper (edge fn transcribe-pitch).
// Só aparece na Fase 3. Áudio em deliverables/<team_id>/pitch.<ext> (bucket `files`).
// O admin é authenticated → policy deliverables_storage_admin_insert permite o upload.
function PitchAudioPanel({ team, onTranscribed }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [msg, setMsg] = useState(null);
  const [showTranscript, setShowTranscript] = useState(false);

  const hasTranscript = !!team.pitch_transcribed_at;

  async function uploadAudio() {
    setMsg(null);
    if (!file) return;
    if (!supabase) {
      setMsg({ kind: "err", text: "Supabase não configurado." });
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setMsg({ kind: "err", text: "Áudio acima de 50MB." });
      return;
    }
    setUploading(true);
    const ext =
      (file.name.split(".").pop() || "webm")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "webm";
    const prefix = `deliverables/${team.id}`;
    const { data: list } = await supabase.storage.from("files").list(prefix);
    const old = (list || [])
      .filter((o) => /^pitch\./i.test(o.name))
      .map((o) => `${prefix}/${o.name}`);
    if (old.length) await supabase.storage.from("files").remove(old);
    const { error: upErr } = await supabase.storage
      .from("files")
      .upload(`${prefix}/pitch.${ext}`, file, {
        contentType: file.type || "audio/webm",
        upsert: true,
      });
    setUploading(false);
    if (upErr) {
      setMsg({ kind: "err", text: `Erro no upload: ${upErr.message}` });
      return;
    }
    setFile(null);
    setMsg({ kind: "ok", text: "Áudio enviado. Agora clique em Transcrever." });
  }

  async function transcribe() {
    setMsg(null);
    if (!supabase) {
      setMsg({ kind: "err", text: "Supabase não configurado." });
      return;
    }
    setTranscribing(true);
    const { data, error: err } = await supabase.functions.invoke(
      "transcribe-pitch",
      { body: { team_id: team.id } },
    );
    setTranscribing(false);
    if (err || data?.error) {
      const code = data?.error || err?.message || "erro";
      const human =
        code === "no_audio"
          ? "Nenhum áudio enviado para esta equipe."
          : code === "whisper_offline"
            ? "O servidor Whisper está offline. Ligue a caixa e tente de novo."
            : `Falha na transcrição: ${code}`;
      setMsg({ kind: "err", text: human });
      return;
    }
    setMsg({
      kind: "ok",
      text: `Transcrição pronta (${data.chars} caracteres).`,
    });
    onTranscribed?.();
  }

  return (
    <div className="border border-dark-border rounded-xl p-3 space-y-2 bg-white/5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-mono text-gold uppercase tracking-wider">
          Áudio do pitch → transcrição (5.3)
        </span>
        {hasTranscript && (
          <span className="text-[10px] font-mono text-cyan">
            transcrição ✓ · há {relativeTime(team.pitch_transcribed_at)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="text-xs text-white/70 file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-electric/20 file:text-electric"
        />
        <button
          onClick={uploadAudio}
          disabled={!file || uploading}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-electric/20 text-electric border border-electric/40 hover:bg-electric/30 disabled:opacity-40"
        >
          {uploading ? "Enviando..." : "Enviar áudio"}
        </button>
        <button
          onClick={transcribe}
          disabled={transcribing}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gold/20 text-gold border border-gold/40 hover:bg-gold/30 disabled:opacity-40"
        >
          {transcribing
            ? "Transcrevendo..."
            : hasTranscript
              ? "Re-transcrever"
              : "Transcrever"}
        </button>
      </div>
      {hasTranscript && (
        <div>
          <button
            onClick={() => setShowTranscript((v) => !v)}
            className="text-xs text-electric hover:underline"
          >
            {showTranscript ? "ocultar transcrição" : "ver transcrição"}
          </button>
          {showTranscript && (
            <p className="text-xs text-white/70 mt-1 whitespace-pre-wrap max-h-48 overflow-y-auto bg-dark/50 rounded p-2">
              {team.pitch_transcript}
            </p>
          )}
        </div>
      )}
      {msg && (
        <div
          className={`rounded-lg px-3 py-1.5 text-xs border ${msg.kind === "ok" ? "bg-cyan/10 border-cyan/30 text-cyan" : "bg-hot/10 border-hot/30 text-hot"}`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Lint + build**

Run: `npm run lint`
Expected: sem erros novos (atenção: `useState`, `relativeTime`, `supabase` já estão importados no topo do arquivo).

Run: `npm run build`
Expected: build OK (`dist/` gerado).

- [ ] **Step 6: Commit**

```bash
git add src/admin/AdminDeliverables.jsx
git commit -m "feat(admin): pitch audio upload + transcribe + 5.3 axes display in deliverables"
```

---

## Task 5: Texto público + changelog

**Files:**

- Modify: `src/components/Mentorship.jsx`
- Create: `docs/changelog/2026-05-30-ia-evaluator-transcricao-pitch.md`

- [ ] **Step 1: Ajustar o card "IA Evaluator" (texto verdadeiro)**

Em `src/components/Mentorship.jsx`, no item cujo `title: 'IA Evaluator'`, substituir o `desc` por (remove a promessa de revisão de jurados, que foi faseada; descreve o que de fato existe):

```jsx
    desc: 'Os pitchs finais são transcritos e analisados por IA (Whisper + LLM) nos eixos de consistência técnica, tom de voz e viabilidade mercadológica — feedback detalhado às equipes, ao lado da banca de jurados.',
```

- [ ] **Step 2: Escrever o changelog**

Criar `docs/changelog/2026-05-30-ia-evaluator-transcricao-pitch.md`:

```markdown
# feat: IA Evaluator — transcrição do pitch + 3 eixos (edital 5.3)

**Data:** 2026-05-30
**Branch:** feat/ia-evaluator-transcricao-pitch
**Arquivos:** migrations/add_pitch_transcription.sql, supabase/functions/transcribe-pitch/index.ts, src/lib/iaEvaluator.js, src/lib/iaEvaluator.test.js, src/admin/AdminDeliverables.jsx, src/components/Mentorship.jsx

## O que foi feito

Cumprimento da cláusula 5.3 do edital (D1+D2): os pitchs finais passam a ser
transcritos por IA (Whisper self-hosted) e analisados nos 3 eixos nomeados —
consistência técnica, tom de voz e viabilidade mercadológica. O operador envia o
áudio na Fase 3, transcreve com 1 clique (edge fn transcribe-pitch) e roda o pacote
no Claude; a transcrição + métricas de fala (ritmo, pausas, muletas) alimentam a
avaliação. Os 3 eixos são gravados em team_evaluations.axes.

## Por que

O edital (5.3) e o site prometiam "pitchs transcritos e analisados por IA"; a
implementação anterior usava só observações manuais e não cobria "tom de voz".

## Decisões técnicas

- Arquitetura "capturar e processar": áudio ao vivo, transcrição/análise após a
  final (janela de feedback de 10 dias úteis; cláusula 5.2.1). Análise segue
  human-in-the-loop (Claude); só a transcrição é automática.
- Whisper self-hosted via Tailscale Funnel; edge fn server-to-server (sem CORS),
  admin-only (getUser + app_metadata.role como o refund-payment). Segredo WHISPER_URL.
- Os 3 eixos são feedback (cláusula 5.4: júri humano é oficial, IA é análise) — NÃO
  entram na soma ponderada da cláusula 6; a menção IA dos 4 critérios e a nota dos
  jurados ficam intactas.
- "Tom de voz" via proxy honesto: transcrição + métricas de fala (a transcrição não
  tem prosódia). Upgrade futuro: análise multimodal de áudio.

## Impacto

- Migration add_pitch_transcription.sql aplicada à mão no Supabase.
- Segredo WHISPER_URL + deploy da edge fn transcribe-pitch.
- Testes Vitest novos em iaEvaluator.test.js; lint e build OK.

## Fora de escopo (faseado)

- D3: revisão de IA do feedback dos jurados (consentimento já coletado).
- Arquitetura B (edge fn chamando o LLM automaticamente).
```

- [ ] **Step 3: Lint + commit**

Run: `npm run lint`
Expected: sem erros novos.

```bash
git add src/components/Mentorship.jsx docs/changelog/2026-05-30-ia-evaluator-transcricao-pitch.md
git commit -m "docs+ui: IA Evaluator 5.3 changelog and accurate public copy"
```

---

## Task 6: Verificação final + passos manuais

- [ ] **Step 1: Suíte completa + lint + build**

Run: `npm test`
Expected: PASS (iaEvaluator.test.js + demais suites).

Run: `npm run lint`
Expected: sem erros.

Run: `npm run build`
Expected: build OK.

- [ ] **Step 2: Passos manuais (sinalizar ao usuário — fora do código)**

1. **Aplicar a migration** `migrations/add_pitch_transcription.sql` no SQL Editor do projeto Supabase `qshrzfahotmjshtjuvno`.
2. **Definir o segredo** `WHISPER_URL=https://thomas-2024-2.koi-tetra.ts.net` no Supabase (Edge Functions → Secrets), ou:
   `supabase secrets set WHISPER_URL=https://thomas-2024-2.koi-tetra.ts.net`
3. **Deploy** da edge function:
   `supabase functions deploy transcribe-pitch`
4. **Smoke test do Whisper** (caixa ligada):
   `curl -s https://thomas-2024-2.koi-tetra.ts.net/health` → deve responder 200.

- [ ] **Step 3: Verificação manual no app (após migration + deploy)**

1. Admin → Entregas → abrir uma equipe → Fase 3: aparece o bloco "Áudio do pitch → transcrição (5.3)".
2. Enviar um áudio curto → "Enviar áudio" → "Transcrever" → a transcrição aparece (ver transcrição).
3. "1. Copiar pacote" → conferir que o pacote inclui a transcrição + as métricas de fala + os 3 eixos no schema.
4. Rodar no Claude → colar o JSON (com `axes`) → "Gravar": os 3 eixos aparecem na avaliação gravada.
5. Conferir que a **nota IA agregada** (4 critérios) e as **notas dos jurados** seguem inalteradas.

---

## Self-Review (preenchido)

**Cobertura da spec:** D1 transcrição → Tasks 1/3/4. D2 três eixos → Task 2 (lib) + Task 4 (UI). Storage/segredo/deploy → Tasks 1/3/6. Housekeeping (site/changelog) → Task 5. `aggregateTeamEvaluation` inalterada → confirmado em Task 2 (sem mudança; testes antigos preservados). D3/arquitetura B → fora de escopo (documentado).

**Sem placeholders:** todo passo de código tem o código completo; sem "TODO"/"similar a".

**Consistência de tipos/nomes:** `pitchSpeechMetrics(segments)` → `{ words, durationSec, wordsPerMin, avgPauseSec, fillerCount, fillerRate }` usado em `renderSpeechMetrics`. `parseDeliverableEvaluation` retorna `axes: [{key,label,score,justification}]` consumido por `payload.axes` (Task 4 Step 2) e pelo render (Task 4 Step 3b). Edge fn grava `pitch_transcript/pitch_segments/pitch_transcribed_at`, lidos no `select` (Task 4 Step 1) e em `buildDeliverablePrompt` (Task 2). `team_evaluations.axes` (migration) ↔ `payload.axes` ↔ `existing.axes`. Erro do parse contém "eixo"/"0 a 100" conforme os testes.
