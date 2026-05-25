# feat: upload do PDF dos slides (entrega final) no bucket

**Data:** 2026-05-25
**Branch:** feat/slides-upload

## O que mudou
O campo "Slides do pitch" da entrega final deixou de ser URL e passou a ser
**upload de PDF** para o bucket privado `files` (`deliverables/<team_id>/slides.pdf`,
um por equipe, sobrescreve ao reenviar). Máx **50MB/arquivo** (file_size_limit do bucket).

## Decisões técnicas
- Participante (token custom, não Supabase Auth) faz upload via **signed upload URL**
  gerada pela edge function `team-slides` (service role; `verify_jwt=false`).
  O `team_id` é derivado server-side do token — participante só envia para o próprio time.
- Download: admin (authenticated) gera signed URL direto (storage RLS admin para
  `deliverables/`); participante baixa via `team-slides` action `download-url` (signed 60s).
- Compatibilidade: equipes com `slides_url` (link antigo) continuam exibindo o link;
  ao enviar o PDF, passa a usar `slides_path`/`slides_name`.
- Migration aplicada + edge function deployada.

## Follow-up
Download dos slides pelo **mentor** ficou de fora (a edge function valida token de
participante; mentor vê só o nome do arquivo). Habilitar exige ampliar a função para
validar token de mentor + pareamento.
