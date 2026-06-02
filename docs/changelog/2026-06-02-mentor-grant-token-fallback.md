# fix(auth): unified mentor link — grant token fallback

**Data:** 2026-06-02
**Branch:** fix/mentor-grant-token-fallback
**Contexto:** SP2 da Fase 3 (fix decoupled, shippado standalone)
**Arquivos:** migrations/fix_mentor_get_me_by_token_grant_fallback.sql

## O que foi feito
`mentor_get_me_by_token` (bootstrap do modo link `#mentor?t=`) era `::uuid`-cast-only sobre `mentors.access_token` e retornava NULL para tokens de grant unificados (64-hex) — então `#acesso?t=<grant>` nunca resolvia um mentor (o bug). Agora delega a resolução para `mentor_prepitch_resolve`, que já tem o fallback completo (uuid de sessão/access_token + `grant_resolve_internal`) e engole erros de grant retornando NULL.

## Por que
Precondição/landmine do SP2: o link unificado de mentor estava quebrado. Fix isolado, ~zero risco, sem mudança de frontend.

## Decisões técnicas
- Delegar a `mentor_prepitch_resolve` (DRY) em vez de duplicar o branch de fallback.
- `CREATE OR REPLACE` idempotente; assinatura inalterada (text) → sem DROP, sem mudança de GRANT.

## Impacto
- Aplicado em prod (qshrzfahotmjshtjuvno). Smoke: 64-hex desconhecido / string curta / NULL → todos NULL sem erro. Links legados `#mentor?t=<uuid>` inalterados.
- SQL-only (sem deploy de frontend).

## Próximos passos
- SP2 grande (Opção A — unificação RLS completa): spec própria a seguir.
