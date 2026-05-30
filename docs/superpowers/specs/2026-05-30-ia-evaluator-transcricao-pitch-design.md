# Design — IA Evaluator conforme cláusula 5.3 (transcrição do pitch + 3 eixos)

**Data:** 2026-05-30
**Branch (proposta):** `feat/ia-evaluator-transcricao-pitch`
**Status:** aprovado para implementação

## Contexto e problema

A cláusula **5.3 do edital** descreve o IA Evaluator assim:

> "Os pitchs serão **transcritos e analisados por um modelo de IA** treinado para avaliar
> **consistência técnica, tom de voz e viabilidade mercadológica**. O feedback dos jurados poderá
> ser gravado e revisado por IA, mediante consentimento prévio dos jurados em termo específico."

A implementação atual (`src/lib/iaEvaluator.js` + `AdminDeliverables.jsx`, do recurso "IA Evaluator
por entregável" de 2026-05-29) **diverge** do edital em três pontos:

- **D1 — Transcrição:** não há transcrição. A Fase 3 é avaliada a partir de **observações do pitch
  digitadas à mão** pelo operador (`pitchNotes`), não da transcrição do áudio.
- **D2 — Os 3 eixos nomeados:** o sistema avalia os **4 critérios ponderados da cláusula 6**
  (`tecnica_ia`, `validacao_problema`, `escala_negocio`, `pitch_equipe`). Dos 3 eixos da 5.3,
  "consistência técnica" e "viabilidade mercadológica" têm proxy nos critérios, mas **"tom de voz"
  não tem cobertura nenhuma**.
- **D3 — Revisão de IA do feedback dos jurados:** o consentimento é coletado (`JurorPanel.jsx` +
  `add_juror_consent.sql`), mas a revisão por IA não existe. **Faseado — fora deste escopo.**

O site público (`Mentorship.jsx`) já anuncia "Pitchs transcritos e analisados por IA", então hoje há
uma promessa pública não cumprida ao pé da letra.

**Decisão do usuário (escolhas confirmadas):** cumprir o edital ao pé da letra para D1+D2, usando a
arquitetura "Capturar e processar": capturar o áudio ao vivo amanhã (mínimo risco) e rodar
transcrição+análise **depois**, dentro da janela de feedback de 10 dias úteis (cláusula 5.2.1). A
análise permanece **human-in-the-loop** (operador roda no Claude), agora alimentada pela transcrição
real. Transcrição via **Whisper self-hosted do usuário**.

### Contexto de tempo (crítico)

Hoje é **sábado 30/05/2026**; os **pitchs finais são domingo 31/05 às 18h** (cláusula 9.1). A única
ação que precisa funcionar ao vivo é **capturar o áudio**. Tudo o mais roda offline depois.

### Restrições herdadas (não negociáveis)

- `team_evaluations` é **compartilhada** por IA e jurados humanos. As linhas humanas
  (`evaluator_type='human'`, `juror_id` setado) são a **nota oficial** do ranking e **não podem ser
  tocadas**. A coluna nova `axes` fica NULL nelas.
- A tabela evolui pelo padrão "coluna nova nullable" (ver `add_evaluation_deliverable.sql`).
- Migrations são **aplicadas à mão** no projeto Supabase `qshrzfahotmjshtjuvno` (não auto-aplicam).
- Edição de arquivos `.js`/`.jsx` neste repo respeita aspas simples / sem ponto-e-vírgula (há hook de
  formatação; ver memória `formatter-hook-conflict`).
- A nota oficial (jurados) e a "menção IA" agregada (4 critérios da cláusula 6) **continuam sendo o
  ranking**. Os 3 eixos da 5.3 são a **análise/feedback** da IA (cláusula 5.4: júri humano é oficial,
  IA é análise) — **não entram na soma ponderada**, evitando duplicar `pitch_equipe`/`escala_negocio`.

## Infraestrutura reaproveitada

- **Storage:** bucket privado `files`, prefixo `deliverables/<team_id>/` (já usado para `slides.pdf`).
  Policies admin SELECT/DELETE já existem (`add_slides_upload.sql`); falta só **INSERT do admin**.
- **Segredos de edge function:** padrão `Deno.env.get(...)` já em uso (`MP_ACCESS_TOKEN` etc.).
- **`is_admin()`** (SQL) já existe e é usado nas storage policies.
- **Whisper self-hosted:** `https://thomas-2024-2.koi-tetra.ts.net`, FastAPI, **público via Tailscale
  Funnel** (confirmado: respondeu a fetch externo) → a edge function (nuvem Supabase) o alcança
  server-to-server, sem CORS. API: `POST /transcribe` multipart (`audio` obrigatório; `language`,
  `model=large-v3`, `vad`, `diarize`, `task` opcionais), `GET /health`.

> ⚠️ O `/transcribe` está público e **sem autenticação**. Como processamos após o evento, basta a
> caixa estar ligada no momento do lote. Endurecer a auth do servidor é recomendação futura, fora
> deste escopo.

## Arquitetura — fluxo

```
AMANHÃ (ao vivo, baixo risco):
  grava pitch (qualquer gravador + backup celular) → upload do áudio no admin (card Fase 3)
  → storage files:deliverables/<team_id>/pitch.<ext>

DEPOIS (lote, sem pressa, janela de 10 dias úteis):
  [Transcrever] → edge fn transcribe-pitch → Whisper → grava teams.pitch_transcript/_segments
  → [Copiar pacote] (já inclui transcrição + métricas de fala) → Claude → [colar JSON]
  → grava os critérios da fase3 (scores) + 3 eixos (axes) em team_evaluations (fase3, evaluator_type='ai')
```

## Modelo de dados

`migrations/add_pitch_transcription.sql` (novo; idempotente; **aplicar à mão**):

```sql
-- 1. teams: transcrição + meta (gravados pela edge function via service role)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS pitch_transcript     TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS pitch_segments       JSONB;   -- [{start,end,text}]
ALTER TABLE teams ADD COLUMN IF NOT EXISTS pitch_transcribed_at TIMESTAMPTZ;
-- caminho do áudio NÃO precisa de coluna: objeto determinístico em storage (ver UI/edge fn).

-- 2. team_evaluations: bloco dos 3 eixos do 5.3 (só fase3 ai; NULL nas demais e nos jurados)
ALTER TABLE team_evaluations ADD COLUMN IF NOT EXISTS axes JSONB;
--   { "consistencia_tecnica":     {"score":0-100,"justification":"..."},
--     "tom_de_voz":                {"score":0-100,"justification":"..."},
--     "viabilidade_mercadologica": {"score":0-100,"justification":"..."} }

-- 3. storage: upload do áudio pelo admin (hoje admin só tem SELECT/DELETE em deliverables/)
DROP POLICY IF EXISTS "deliverables_storage_admin_insert" ON storage.objects;
CREATE POLICY "deliverables_storage_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'files' AND name LIKE 'deliverables/%' AND is_admin());
```

- A linha `ai` da Fase 3 ganha `axes`; as demais (fase1/fase2 ai, jurados) ficam com `axes=NULL`.
- O áudio vive em `deliverables/<team_id>/pitch.<ext>` (upsert; admin remove `pitch.*` anterior antes
  de subir). A edge function resolve o objeto via `storage.list('deliverables/<team_id>')` procurando
  `pitch.*` — nenhuma coluna de caminho necessária.

## Edge function `transcribe-pitch`

`supabase/functions/transcribe-pitch/index.ts` (novo). **`verify_jwt` padrão (true)** — o admin usa
Supabase Auth (diferente de `team-slides`, que serve participantes sem Auth).

Fluxo:

1. CORS espelhando `team-slides` (origens conhecidas). `OPTIONS` → ok; só `POST`.
2. Autoriza admin: cria client com o header `Authorization` do chamador e chama a RPC `is_admin()`
   (SECURITY DEFINER já existente). Se falso → 401.
3. Input `{ team_id }`. Resolve o objeto de áudio via `storage.from('files').list('deliverables/<team_id>')`
   procurando `pitch.*`. Sem áudio → 404 `no_audio`.
4. `GET {WHISPER_URL}/health` (timeout curto). Falha → 503 `whisper_offline` (mensagem amigável).
5. Baixa o áudio (service role) e faz `POST {WHISPER_URL}/transcribe` multipart: `audio` = blob,
   `language=pt`, `vad=true` (`diarize=false` por padrão — mais rápido; `task=transcribe`).
6. Parse defensivo da resposta (schema do servidor é destipado): `text` ?? `transcription` ?? junção
   dos `segments[].text`. Guarda `segments` se vierem.
7. Grava (service role) `teams.pitch_transcript`, `teams.pitch_segments`, `teams.pitch_transcribed_at = now()`.
8. Retorna `{ ok, chars, segments }`. Reexecutável (regrava). Logs com `console.error` como as demais.

Segredo: **`WHISPER_URL`** = `https://thomas-2024-2.koi-tetra.ts.net` (não hardcoded; trocável).
Opcional futuro: `WHISPER_AUTH` (header bearer) se o servidor ganhar auth.

## `src/lib/iaEvaluator.js` — mudanças

A unidade `fase3` ganha avaliação dos 3 eixos da 5.3 a partir da transcrição. fase1/fase2 inalteradas.

1. **Constante dos eixos** (fonte da verdade da 5.3):

   ```js
   export const PITCH_AXES = [
     { key: "consistencia_tecnica", label: "Consistência técnica" },
     { key: "tom_de_voz", label: "Tom de voz" },
     { key: "viabilidade_mercadologica", label: "Viabilidade mercadológica" },
   ];
   ```

   `DELIVERABLE_UNITS.fase3` ganha `hasAxes: true`.

2. **Métricas de fala** (proxy honesto para "tom de voz", já que transcrição não tem prosódia):
   `pitchSpeechMetrics(segments)` → `{ words, durationSec, wordsPerMin, avgPauseSec, fillerCount, fillerRate }`.
   Fillers PT-BR: `né, tipo, então, assim, hum, é..., aí, sabe`. Sem segments → retorna `null`
   (o pacote sinaliza ausência). Função pura, testável.

3. **`buildDeliverablePrompt` (fase3)**: além do conteúdo de `final_deliverables`, injeta:
   - a **transcrição** (`team.pitch_transcript`) num bloco próprio; se vazia, instrui o modelo a
     sinalizar a ausência e avaliar `tom_de_voz` com cautela;
   - as **métricas de fala** derivadas de `team.pitch_segments` (quando houver);
   - as `pitchNotes` do operador continuam como **complemento opcional** (observação de entrega/tom);
   - a rubrica dos 3 eixos + o schema JSON com o bloco `axes`.

4. **Schema de saída fase3** (3 critérios + 3 eixos):

   ```json
   {
     "scores": [
       { "criterion_key": "tecnica_ia", "score": 0, "justification": "..." },
       {
         "criterion_key": "escala_negocio",
         "score": 0,
         "justification": "..."
       },
       { "criterion_key": "pitch_equipe", "score": 0, "justification": "..." }
     ],
     "axes": {
       "consistencia_tecnica": { "score": 0, "justification": "..." },
       "tom_de_voz": { "score": 0, "justification": "..." },
       "viabilidade_mercadologica": { "score": 0, "justification": "..." }
     },
     "eliminated": false,
     "summary": "...",
     "model": "claude-opus-4-x"
   }
   ```

5. **`parseDeliverableEvaluation(text, unit)`**: se `unit.hasAxes`, exige `axes` com as 3 chaves,
   cada uma com `score` 0–100 (erro PT-BR se faltar/extra/fora de faixa); normaliza para
   `{ key, label, score, justification }`. Retorna `axes` no objeto. Unidades sem `hasAxes` ignoram
   `axes`. O cálculo de `total_score`/`scores`/`eliminated` continua igual (axes **não** entram).

6. **`aggregateTeamEvaluation`**: **inalterada** (os 4 critérios da cláusula 6 seguem sendo o total;
   axes são display/feedback). Opcional: expor `axes` da linha fase3 para a UI ler (sem mudar a soma).

## UI — `AdminDeliverables.jsx`

No `DeliverableEvaluator` (Fase 3, detalhe e fila lateral):

- **Sub-bloco "Áudio do pitch"** (só fase3): `<input type="file" accept="audio/*">` → botão
  **[Enviar áudio]** que remove `deliverables/<team_id>/pitch.*` (admin DELETE) e faz upload para
  `deliverables/<team_id>/pitch.<ext>` (admin INSERT). Mostra "áudio enviado ✓" + [Substituir].
- Botão **[Transcrever]** → chama `transcribe-pitch` → spinner → sucesso mostra a **transcrição**
  (colapsável, read-only) + carimbo `pitch_transcribed_at`. Estados de erro: `no_audio`,
  `whisper_offline`, genérico.
- **[Copiar pacote]** passa a incluir transcrição + métricas automaticamente (via `buildDeliverablePrompt`).
- Após colar+parsear: renderiza os **3 eixos** (Consistência técnica / Tom de voz / Viabilidade
  mercadológica) com score + justificativa, além dos 3 critérios da fase3.
- **Header da equipe:** selo "5.3 · 3 eixos ✓" quando a linha fase3 tem `axes`; "transcrição ✓" quando
  há `pitch_transcribed_at`.
- O `select` de `teams` no `fetchData` adiciona `pitch_transcript, pitch_segments, pitch_transcribed_at`;
  o de `team_evaluations` adiciona `axes`.

## Housekeeping

- `src/components/Mentorship.jsx`: ajustar o texto do card "IA Evaluator" para refletir a realidade
  (transcrição + análise por IA como **feedback pós-evento**), mantendo-o verdadeiro.
- Nota curta de divergência resolvida (D1/D2) — anexar ao changelog; a metodologia interna
  (`docs/metodologia/`) segue como doc histórica (igual ao tratamento do cronograma).
- `supabase/functions/evaluate-team` (stub 501): **mantido como está** (motor automático futuro,
  arquitetura B). Sem mudança.

## Edge cases

- Sem áudio → [Transcrever] desabilitado; pacote sinaliza "sem transcrição" e pede cautela no tom de voz.
- Whisper offline no momento do lote → `/health` falha → erro amigável; reprocessa depois (sem pressa).
- Transcrição presente, análise ainda não feita → header mostra "transcrição ✓, eixos pendentes".
- Re-transcrever / re-enviar áudio → sobrescreve (upsert / regrava transcrição).
- Áudio > 50MB → barrado pelo limite do bucket + checagem no cliente.
- Áudio longo → risco de timeout da edge fn: recomendar clipes ≤ ~6 min; `diarize=false`; se preciso,
  aumentar o timeout da function no dashboard.
- Segments ausentes na resposta do Whisper → métricas de fala omitidas com nota; tom de voz avaliado
  só pelo texto + `pitchNotes`.

## Testes (`src/lib/iaEvaluator.test.js`, Vitest node)

- `pitchSpeechMetrics`: words/min, pausa média e fillers a partir de segments de exemplo; `null` sem
  segments; não quebra com 1 segmento.
- `buildDeliverablePrompt(fase3)`: inclui a transcrição, as métricas e os 3 eixos no schema; ausência
  de transcrição é sinalizada; `pitchNotes` entra como complemento.
- `parseDeliverableEvaluation(fase3)`: aceita JSON com `scores`+`axes`; rejeita eixo faltando, eixo
  extra e score de eixo fora de 0–100; tolera cercas `json`; fase1/fase2 ignoram `axes`.
- `aggregateTeamEvaluation`: **inalterada** — confirma que axes não afetam `total_score`.
- `npm run lint` e `npm run build` sem regressão.

## Arquivos

1. `migrations/add_pitch_transcription.sql` — **novo** (teams cols + team_evaluations.axes + storage
   INSERT admin; aplicar à mão).
2. `supabase/functions/transcribe-pitch/index.ts` — **novo** (admin-auth → Whisper → grava transcrição).
3. `src/lib/iaEvaluator.js` — `PITCH_AXES`, `pitchSpeechMetrics`, fase3 com transcrição+eixos no
   build/parse; aggregate inalterada.
4. `src/lib/iaEvaluator.test.js` — testes novos.
5. `src/admin/AdminDeliverables.jsx` — upload de áudio + [Transcrever] + exibição de transcrição e
   dos 3 eixos; selects atualizados.
6. `src/components/Mentorship.jsx` — ajuste de texto.
7. `docs/changelog/2026-05-30-ia-evaluator-transcricao-pitch.md` — registro.

## Passos manuais (sinalizar ao usuário)

1. Aplicar `add_pitch_transcription.sql` no SQL Editor do projeto `qshrzfahotmjshtjuvno`.
2. Definir o segredo `WHISPER_URL=https://thomas-2024-2.koi-tetra.ts.net` no Supabase.
3. Deploy da edge function `transcribe-pitch`.
4. **Amanhã (31/05):** gravar e enviar o áudio de cada pitch (backup no celular).
5. **Depois:** com a caixa Whisper ligada, [Transcrever] cada equipe → rodar o pacote no Claude →
   colar o JSON. O detalhamento por critério/eixo vai às equipes na janela de 10 dias úteis.

## Fora de escopo

- **D3** — revisão de IA do feedback dos jurados (faseado; consentimento já coletado).
- Arquitetura **B** (edge function chamando o LLM automaticamente).
- Análise multimodal de áudio para tom de voz (upgrade futuro; hoje é proxy via transcrição+métricas).
- Endurecer a autenticação do servidor Whisper.
- Nota oficial / fluxo dos jurados / `juror_submit_score` (intactos).
