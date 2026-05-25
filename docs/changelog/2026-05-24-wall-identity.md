# feat: muro de dores com identidade forte (CPF + data de nascimento)

**Data:** 2026-05-24
**Branch:** feat/wall-identity
**Arquivos:** migrations/add_wall_identity.sql, src/wall/*

## O que mudou
A identidade do Muro de Dores deixou de ser `device_token` (localStorage, forjável)
e passou a exigir **CPF + data de nascimento** de um participante com **pagamento
confirmado**. Cada dor/voto é amarrado ao `registration_id`.

## Decisões técnicas
- `wall_identify(cpf, birth_date)` resolve o `registration_id` no servidor (CPF
  normalizado só-dígitos nos dois lados; só `payment_status='confirmed'`).
- Dores/votos agora referenciam `registration_id` (FK registrations); UNIQUE
  `(pain_id, registration_id)`. Tabelas recriadas (estavam vazias).
- `author_name` vem sempre do `full_name` do servidor — não-forjável no telão.
- Toda escrita revalida confirmado via `wall_require_confirmed` (REVOKE FROM PUBLIC,
  não vira oráculo). Rate-limit e fases preservados; admin com REVOKE PUBLIC + GRANT auth.
- Frontend: tela de identificação (CPF + nascimento) em `WallParticipant`; telão
  read-only inalterado.

## Impacto
Migration aplicada em prod (tabelas estavam vazias). `wall_identify` testado com
confirmado real (ok). Substitui e fortalece o rate-limit por device anterior.
