# fix: security-sweep report-only findings (waves)

**Data:** 2026-06-01
**Relatório:** docs/changelog/2026-06-01-security-sweep.md
**PRs:** #238 (HIGH + revenue), #239 (viewer-token + team-slides), #240 (this — LOW + Muro/Sugar + send-push)

## Aplicado em PRODUÇÃO
### HIGH (PR #238)
- `is_admin()`/`is_admin_or_viewer()` → `SET search_path` (gate de toda RLS).
- `sync-mp-payments` edge exige `app_metadata.role === 'admin'` (v8).

### MEDIUM (#238/#239/#240)
- `get_mp_fee_summary()` → gate `is_admin_or_viewer()` + `search_path`; **anon revogado** (era anon-callable).
- **mentor access_token leak:** `mentors` table SELECT revogado de authenticated/anon; só `id/email/name/created_at` re-concedido; `access_token` via RPC admin `admin_list_mentors()`. AdminMentors usa o RPC.
- **team-slides:** `download-url` assina o path canônico `deliverables/<teamId>/slides.pdf` (faz presence-check do valor salvo mas nunca o assina) — fecha assinar objetos arbitrários do bucket. v6.
- **Muro/Sugar identidade (Opção A):** `wall_vote`/`wall_unvote`/`wall_submit_pain`/`wall_list` agora recebem `p_token` (token de sessão de participante) e derivam o `registration_id` no servidor (`wall_resolve_token` → `participant_session_owner_confirmed`); fecha ballot-stuffing/impersonação via `registration_id` público. **Opção A remove o login CPF+nascimento do Muro** — o Muro agora exige sessão de participante confirmada. `wall_require_confirmed` revogado de anon. Frontend: `WallParticipant` usa `participantAuth.token` + gate "entre no painel"; `WallScreen` (telão) chama `wall_list()` sem arg; `useWallSession` reduzido a constantes.

### LOW (#240)
- `generate_voucher_code()` → `extensions.gen_random_bytes` + rejection sampling (era `random()`).
- `deploy.yml`: GitHub Actions pinadas a SHAs verificados (eram tags mutáveis `@v4`/`@v3`).

## PREPARADO mas NÃO aplicado (ops-gated)
- **send-push auth:** função corrigida (gate `x-webhook-secret` + re-fetch da row) + `migrations/fix_send_push_auth.sql` (trigger). **Runbook (ordem):** 1) `openssl rand -hex 32`; 2) setar `PUSH_WEBHOOK_SECRET` como secret da edge (dashboard); 3) `SELECT vault.create_secret('<v>','push_webhook_secret')`; 4) aplicar a migration; 5) deployar a função. Deployar antes para os pushes (fail-closed).

## Adiado (→ passe futuro / Fase 3)
- `search_path` no restante da família B7 (~35 funções SECURITY DEFINER) — arriscado em massa; `mentor_login`/`admin_reset_mentor_code` precisam de `public, extensions`.
- `recover_pending_registration` drop de `full_name` — trade-off de UX (nome em branco no fluxo de recuperação).
- DATI code no bundle — needs-design (RPC server-side); evento fechado → moot por ora.
- Fase 3 do auth: contas admin/viewer/checkin por senha via UI + enforcement de `scope` + cutover dos links legados mentor/jurado.

## Verificação
- SQL smoke (MCP) por fix; build + `npx vitest run` 139/139 verdes.
- Pós-deploy manual: telão (#telao) e Muro (#muro logado como participante) carregam; criar grant/abrir link por role.
