# fix: participant RPC security hardening

**Data:** 2026-05-22
**Commit:** (see below)
**Branch:** fix/sql-participant-security
**Arquivos alterados:**
- `supabase-setup.sql`
- `migrations/add_team_and_mentors.sql`

## O que foi feito

Six security fixes applied to participant-facing PostgreSQL RPCs:

1. **#90 — CPF removed from `participant_get_me` payload**: CPF is the second auth factor in `participant_login`; returning it in the profile payload enabled account takeover. Removed from the SELECT column list in both `supabase-setup.sql` and `migrations/add_team_and_mentors.sql`. `row_to_json(v_reg)` now serializes the record without CPF.

2. **#88 — `participant_approve_request` FOR UPDATE**: Added `FOR UPDATE` to both the leader's `registrations` row and the `team_join_requests` row, serializing concurrent approval attempts on the same team.

3. **#89 — Re-check requester's current team before approving**: A locked read of `registrations WHERE id = v_request.requester_id FOR UPDATE` is performed before the final UPDATE. If the requester already joined another team (via a race), raises `requester_already_in_team`. New variable `v_requester_team TEXT` declared.

4. **#93 — `participant_transfer_leadership` FOR UPDATE**: Both registrations rows now locked before the team/leader check. Lock order is deterministic (ascending UUID) to eliminate deadlock risk.

5. **#39 — `participant_update_profile` requires confirmed session**: Swapped `participant_session_owner(p_token)` for `participant_session_owner_confirmed(p_token)`, which additionally asserts `payment_status = 'confirmed'`. Prevents cancelled participants from updating profile data.

6. **#62 — `participant_login` resets lockout counter on expiry**: When `failed_login_until` is in the past (lockout expired but count still elevated), the counter is now reset to 0 before CPF verification. Prevents immediate re-lockout on first wrong attempt after the lockout window.

7. **#60/#61 — `check_team_size` triggers exclude cancelled members**: Both `check_team_size` (INSERT) and `check_team_size_update` (UPDATE) now count only non-cancelled members (`AND payment_status <> 'cancelled'`), so cancelled slots are freed for new joiners.

## Por que

Security audit identified these issues as exploitable on a live event system with real participants. Fixes are conservative and minimal — no schema changes, no new tables.

## Decisões técnicas

- `participant_transfer_leadership`: deterministic lock order (lesser UUID first) eliminates deadlock without introducing a separate lock table.
- `participant_approve_request`: aggregate COUNT query is not modified with FOR UPDATE (invalid with aggregates); instead the leader row lock serializes the critical section.
- CPF drop from SELECT is clean: `v_reg.cpf` is not referenced anywhere else in `participant_get_me`; `row_to_json(v_reg)` reflects only the columns in the SELECT.
- Lockout reset (#62) uses a separate UPDATE so the change persists even if the subsequent CPF check fails.

## Impacto

- No schema changes. All fixes are in-place function replacements (`CREATE OR REPLACE`).
- `participant_update_profile` now requires confirmed payment; unconfirmed participants calling it will receive a `payment_not_confirmed` exception (same as other confirmed-only RPCs).
- `check_team_size` behaviour change: cancelled members no longer count toward the 6-person cap.

## Próximos passos

- Deploy by running affected functions in Supabase SQL Editor (or re-running `migrations/add_team_and_mentors.sql` for the get_me fix on the migration path).
