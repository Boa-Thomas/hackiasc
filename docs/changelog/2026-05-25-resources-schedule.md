# feat: recursos para participantes + cronograma detalhado

**Data:** 2026-05-25
**Branch:** feat/resources-schedule

## Recursos (materiais restritos a confirmados)
- Tabela `resources` (metadados) + bucket privado `files` sob prefixo `resources/`.
- Admin (aba "Recursos"): upload (storage + insert), listagem, exclusão. Storage RLS
  restringe ao admin no prefixo resources/.
- Participante (aba "Recursos", só confirmados): lista via RPC
  `participant_list_resources(token)` (não expõe URL); download via edge function
  `resource-download` que valida o token (confirmado) e gera **signed URL de 60s**
  sobre o objeto privado. Bucket permanece privado.
- Migration aplicada + edge function deployada (verify_jwt=false).

## Cronograma detalhado (painel do participante)
- A aba "Evento" passou a mostrar o **cronograma hora a hora dos 3 dias** (edital
  cláusula 9.1), em blocos por dia (`<details>`), substituindo o resumo anterior.

## Impacto
Build + ESLint OK. Recursos restritos de ponta a ponta (RLS admin + RPC confirmada +
signed URL temporário). Tudo aditivo.
