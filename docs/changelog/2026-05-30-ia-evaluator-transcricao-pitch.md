# feat: IA Evaluator — transcrição do pitch + 3 eixos (edital 5.3)

**Data:** 2026-05-30
**Branch:** feat/ia-evaluator-transcricao-pitch
**Arquivos:** migrations/add_pitch_transcription.sql, supabase/functions/transcribe-pitch/index.ts, src/lib/iaEvaluator.js, src/lib/iaEvaluator.test.js, src/admin/AdminDeliverables.jsx, src/components/Mentorship.jsx

## O que foi feito

Cumprimento da cláusula 5.3 do edital (D1+D2): os pitchs finais passam a ser
transcritos por IA (Whisper self-hosted) e analisados nos 3 eixos nomeados —
consistência técnica, tom de voz e viabilidade mercadológica. No painel admin
(Entregas → equipe → Fase 3) o operador envia o áudio do pitch, transcreve com 1
clique (edge function `transcribe-pitch`) e roda o pacote no Claude; a transcrição

- métricas de fala (ritmo, pausas, muletas) alimentam a avaliação. Os 3 eixos são
  gravados em `team_evaluations.axes` e exibidos junto da avaliação.

## Por que

O edital (5.3) e o site prometiam "pitchs transcritos e analisados por IA"; a
implementação anterior usava só observações manuais e não cobria "tom de voz".

## Decisões técnicas

- Arquitetura "capturar e processar": áudio capturado ao vivo na final; transcrição
  e análise rodam **depois**, dentro da janela de feedback de 10 dias úteis
  (cláusula 5.2.1). A análise segue human-in-the-loop (Claude); só a transcrição é
  automática.
- Whisper self-hosted (Tailscale Funnel, público); a edge function chama-o
  server-to-server (sem CORS), admin-only (getUser + `app_metadata.role`, espelhando
  `refund-payment`). Segredo `WHISPER_URL`. Áudio no bucket privado `files` sob
  `deliverables/<team_id>/pitch.<ext>` (nova policy de INSERT do admin).
- Os 3 eixos são feedback (cláusula 5.4: júri humano é oficial, IA é análise) — NÃO
  entram na soma ponderada da cláusula 6. A "menção IA" dos 4 critérios e a nota dos
  jurados ficam intactas (`aggregateTeamEvaluation` inalterada).
- "Tom de voz" via proxy honesto: transcrição + métricas de fala derivadas dos
  segments do Whisper (a transcrição não tem prosódia). Upgrade futuro: análise
  multimodal de áudio.

## Impacto / passos manuais

- Aplicar `migrations/add_pitch_transcription.sql` à mão no Supabase (projeto
  `qshrzfahotmjshtjuvno`).
- Definir o segredo `WHISPER_URL` e fazer deploy de `transcribe-pitch` (manter
  `verify_jwt=true`, sem `--no-verify-jwt`).
- Testes Vitest novos em `iaEvaluator.test.js` (25/25); lint dos arquivos tocados e
  build OK.

## Fora de escopo (faseado)

- D3: revisão de IA do feedback dos jurados (consentimento já coletado).
- Arquitetura totalmente automática (edge function chamando o LLM).
