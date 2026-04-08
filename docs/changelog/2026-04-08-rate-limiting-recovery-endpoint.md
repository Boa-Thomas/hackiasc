# fix(security): add rate limiting for registration recovery endpoint

**Data:** 2026-04-08
**Commit:** b884b94
**Branch:** fix/security-audit
**Arquivos alterados:** migrations/security_audit_2_fixes.sql

## O que foi feito

Criada migração `security_audit_2_fixes.sql` que adiciona rate limiting ao endpoint `recover_pending_registration`. Inclui tabela `rate_limits` e função `check_rate_limit()`, além de substituir a função existente de recovery com a proteção ativada.

## Por que

O RPC `recover_pending_registration` aceita chamadas anônimas via email. Sem rate limiting, um atacante poderia enumerar emails cadastrados por força bruta — mesmo com o timing attack mitigation (`pg_sleep`) presente desde `security_fixes.sql`, requisições em volume ainda revelam quais emails estão no banco pelo comportamento de latência.

## Decisões técnicas

- Rate limit de 5 tentativas por janela de 5 minutos por email (chave: `recover:<email_lowercase>`)
- Janela deslizante baseada em `first_attempt_at`, não rolling window — simples e suficiente para este volume
- `check_rate_limit()` usa `SECURITY DEFINER` para que `anon` não acesse `rate_limits` diretamente
- RLS na tabela `rate_limits` com policy `USING (false)` bloqueia todo acesso direto
- Quando rate limit é atingido, retorna `NULL` com `pg_sleep(0.1–0.3s)` extra para uniformizar latência
- `full_name` foi adicionado ao retorno da função (ausente na versão anterior de `security_fixes.sql`) — necessário para exibir ao usuário na tela de recovery
- Cleanup de registros antigos fica como comentário SQL para rodar via pg_cron manualmente

## Impacto

- Substitui `recover_pending_registration` definida em `security_fixes.sql`
- Adiciona tabela `rate_limits` e função `check_rate_limit()` ao schema
- Nenhuma mudança no frontend — o contrato do RPC permanece igual (retorna JSON ou NULL)

## Próximos passos

- Configurar `pg_cron` no Supabase para executar o cleanup comentado a cada hora
- Avaliar se outras RPCs públicas (ex: `get_confirmed_count`) precisam de proteção similar
