---
description: Lança a suíte de verificação (segurança, código, arquitetura, banco e QA de integração) sobre o diff da branch atual vs origin/master ANTES de fazer deploy (push pra master).
---

# Pre-deploy verification

Você está prestes a fazer (ou foi pedido para fazer) um deploy. Deploy neste projeto = push pra `main`/`master`, que dispara o GitHub Actions (`.github/workflows/deploy.yml`) e publica no GitHub Pages (hackiasc.com). **Antes de empurrar, rode a suíte de verificação abaixo.**

## Passos

1. Descubra o escopo da mudança: `git -c safe.directory='*' diff --stat origin/master...HEAD` e a branch atual. Se não houver diff vs `origin/master`, avise e pare.
2. Lance os agentes abaixo **em paralelo** (read-only; uma única mensagem com várias chamadas de Agent). Ajuste os prompts ao que a mudança realmente toca — nem todo agente se aplica a toda mudança:
   - **security-auditor** — authn/authz, RLS, SECURITY DEFINER/search_path, injeção, segredos, edge functions, novas rotas públicas. Use sobretudo se a mudança toca auth, banco, pagamentos, upload ou rotas.
   - **code-reviewer** — bugs, hooks/deps do React, regressões, estilo, casos de borda no diff.
   - **architect-reviewer** — impacto em API/schema/contratos/dependências/topologia; blast radius (especialmente se mexe em objetos vivos durante evento).
   - **general-purpose (verificação de banco)** — se a mudança alterou o Supabase: via MCP (`mcp__plugin_supabase_supabase__execute_sql` / `list_edge_functions`, projeto `qshrzfahotmjshtjuvno`), confirmar objetos criados, grants/RLS, triggers, switches, edge function ACTIVE, e um smoke test seguro e auto-limpo do pipeline.
   - **general-purpose (QA de integração)** — rodar `npx vitest run` e `npm run build`; conferir artefatos do `dist/`; checar alinhamento de contratos frontend↔backend (nomes de RPC/params, chaves de eventos, exclusões de papel como jurado).
3. Quando todos retornarem, **sintetize os achados** numa lista priorizada (Critical/High/Important/Minor).
4. **Gate:** se houver qualquer achado **Critical/High** não resolvido, NÃO faça o push. Corrija (ou confirme com o usuário) e re-rode os agentes afetados antes de prosseguir.
5. Só depois de verde (ou de o usuário aceitar conscientemente os riscos restantes) prossiga com o push/deploy.

> Pendências de configuração conhecidas (ex.: secrets ainda não setados) não são bloqueios de código — registre como passo de ops, mas não trate como falha de verificação.
