# feat: unified access-grants auth (Phase 2 — personas + full revoke)

**Data:** 2026-06-01
**Branch:** feat/unified-auth-phase2
**Spec:** docs/superpowers/specs/2026-06-01-unified-auth-phase2-design.md
**Plano:** docs/superpowers/plans/2026-06-01-unified-auth-phase2.md

## O que foi feito (Fase 2)
Fecha as personas adiadas na Fase 1 e completa o ciclo de revogação.

### Aplicado em PRODUÇÃO (`qshrzfahotmjshtjuvno`)
- **Facilitadora:** 6 políticas RLS aditivas (`is_facilitator()` em schedule_days/items, announcements, registrations, teams); gate `is_admin() OR is_facilitator()` nas 5 RPCs operacionais; novo `wall_get_phase()` (leitura de fase sem PII — `wall_admin_list` **não** foi exposto, pois vaza email/telefone de votantes).
- **Mentor/jurado:** 16 funções de auth migradas `uuid → text` + fallback `grant_resolve_internal` (incl. 3 de Sugar Cubes). Tokens legados (uuid) continuam resolvendo (cast guardado); tokens de grant (hex) resolvem. `mentor_delete_note`/`mentor_logout` ganharam `SET search_path` (correção B7 de brinde).
- **grant_resolve split:** `grant_resolve_internal()` (sem rate-limit) para o hot path por-requisição; `grant_resolve()` (rate-limit 5/min) só para a edge `access-exchange`. Corrige um lockout onde >5 chamadas/min de um mentor/jurado autenticado por grant seriam rejeitadas.
- **Backfill:** 1 grant rpc_token por mentor (12) e jurado ativo (5).
- **Revoke completo:** edge `access-admin` (ACTIVE, gated por `is_admin` no servidor) deleta o usuário-suporte Supabase ao revogar um grant jwt_exchange → mata a sessão na hora; rpc_token usa `admin_revoke_grant` (só `revoked_at`).

### Frontend (na branch — vai a prod no merge)
- `FacilitatorPanel` (`#facilitador`) com cronograma/anúncios/fase do Muro/visibilidade/pulse; guard de sessão facilitator/admin.
- UI Acessos oferece facilitator/staff/mentor/juror/checkin/viewer; revoke roteia para edge (jwt) ou RPC (rpc_token).
- **Removido o link-senha do staff** (`#admin-acesso` + `StaffAccess.jsx`).

## Verificação
- SQL smoke (MCP): **dual-path** por resolver (legado uuid + grant hex), **10 resoluções de grant seguidas sem lockout** (jurado e mentor), lixo levanta erro, e `grant_resolve` edge ainda faz rate-limit. Backfill 12/12 e 5/5.
- Edge `access-admin`: deny-path (não-admin → 403). Success-path (admin bane usuário) = verificação manual pós-merge (precisa de JWT admin).
- `npx vitest run` + `npm run build` verdes.
- Pós-merge: abrir um link `#acesso` por role (facilitadora/mentor/jurado) e testar revoke matando a sessão.

## Decisões técnicas
- uuid→text (não a ponte) por escolha do usuário, ciente do escopo real (16 funções). Aditivo/coexistente; migration idempotente (DROP IF EXISTS + CREATE OR REPLACE).
- `sugar_roster` ficou misto: `p_participant_token uuid` (participante fora de escopo) + `p_mentor_token text`.
- pgcrypto qualificado (`extensions.*`); rate-limit via tabela `rate_limits`.

## Fora da Fase 2 (→ Fase 3)
Contas admin/viewer/checkin por senha via UI; enforcement de `scope`; cutover/remoção das rotas legadas `#mentor?t=` / `#jurado?t=` (após distribuir os novos links); folding da criação de mentor/jurado no Acessos.

## Próximos passos
- Mergear para publicar o frontend (FacilitatorPanel + UI Acessos completa).
- Emitir novos links por pessoa (mentor/jurado) via "novo link" no Acessos quando for fazer o cutover dos links legados.
