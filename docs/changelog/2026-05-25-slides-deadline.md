# feat: data de corte configurável para envio dos slides

**Data:** 2026-05-25
**Branch:** feat/slides-deadline

## O que mudou
O envio do PDF dos slides (entrega final) passa a respeitar um **prazo configurável
pelo admin**. Após a data de corte, o upload é bloqueado; o **download continua
liberado** (admin, mentor e participante seguem baixando o que já foi enviado).

## Decisões técnicas
- **Singleton `slides_config`** (espelha `wall_state`): uma linha com `submit_deadline
  TIMESTAMPTZ` (NULL = sem prazo). RLS deny-all; acesso só via RPCs SECURITY DEFINER.
- **Fonte única de verdade no banco** — nenhuma comparação de data em JS:
  - `slides_upload_allowed()` → BOOLEAN (`now() <= deadline`), `service_role`. A edge
    function `team-slides` (action `upload-url`) chama essa RPC; `false` → 403 `deadline_passed`.
  - `get_slides_deadline()` → TIMESTAMPTZ (`anon`/`authenticated`): admin e participante exibem.
  - `set_slides_deadline(ts)` → grava/limpa (`is_admin()`; NULL remove o prazo).
- **Admin** (aba Entregas): card com `datetime-local`, "Salvar prazo" / "Remover prazo",
  e exibição do prazo atual em `toLocaleString('pt-BR')`. Input no fuso do admin →
  convertido para ISO UTC antes da RPC.
- **Participante** (`SlidesUpload`): mostra o prazo **mesmo antes de qualquer upload**;
  botões desabilitados após o corte. Gate de UI é só conveniência — o bloqueio real é server-side.

## Impacto
- Migration `add_slides_deadline.sql` aplicada em produção.
- Edge function `team-slides` atualizada (gate de prazo) — **requer re-deploy**.
- Sem prazo definido (default), o comportamento atual é preservado (envio livre).
