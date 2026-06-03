# Auth Phase 3 — SP2 / Phase B1 (backend foundation) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** Add the session-identity helpers and re-key the mentor/juror/sugar RPCs to a **session-first guarded fallback** (dual-mode: real jwt session OR legacy `p_token`), so the session path exists and is tested while every legacy link keeps working. Pure backend, additive, coexistent — **no user-visible change** (the session branch is dormant until the B2 frontend ships).

**Architecture:** `current_grant_ref()` (STABLE SECURITY DEFINER, derives identity from `supabase_user_id = auth.uid()`, gates revoked/expires) + thin `current_mentor_id()`/`current_juror_id()`. Each re-keyed RPC resolves identity **session-first, then legacy token** (guarded — the legacy resolvers RAISE on miss, so this is NOT a `COALESCE`).

**Tech Stack:** Supabase Postgres (plpgsql, SECURITY DEFINER). No frontend, no vitest — gates are MCP smokes.

**Spec:** `docs/superpowers/specs/2026-06-02-auth-phase3-sp2-mentor-juror-sessions-design.md`

### Sequencing correction vs spec
The spec listed `grant_auth_kind()` flip + the 17-grant `UPDATE` under B1. **They move to B2** (atomic with frontend session support): flipping a mentor/juror grant to `jwt_exchange` before the frontend can consume a session would make a `#acesso` link mint a session the B1 frontend can't use. B1 is helpers + RPC re-key only.

### No signature changes
Re-key is **body-only** (swap the identity preamble). `p_token` stays a required-but-nullable param; the B2 frontend will pass `p_token: null` to take the session path. (Adding `DEFAULT NULL` would break multi-param RPCs — Postgres requires all params after a default to also have defaults.) Identical signatures → `CREATE OR REPLACE` preserves GRANTs (we re-emit them anyway).

---

## File Structure
- `migrations/phase3_sp2_b1_helpers.sql` — **create.** `current_grant_ref()` + `current_mentor_id()` + `current_juror_id()`.
- `migrations/phase3_sp2_b1_rekey_rpcs.sql` — **create.** The 11 re-keyed RPCs (bodies copied verbatim from `migrations/phase2_mentor_juror_text.sql`, identity preamble swapped) + GRANTs.

Prod application is a gated main-thread step (Integration), never by subagents.

---

## Task 1: identity helpers

**Files:** Create `migrations/phase3_sp2_b1_helpers.sql`

- [ ] **Step 1: Write the migration**

```sql
-- SP2/B1: session-identity helpers. current_grant_ref() resolves the CALLER's
-- grant from their Supabase session (supabase_user_id = auth.uid()), gating
-- revoked/expired in the same read (instant revocation on the RPC data path).
-- STABLE so the planner never re-runs it per-row; SECURITY DEFINER so it reads
-- access_grants regardless of the caller's RLS. Returns no row when there is no
-- session / no grant / revoked / expired. auth.uid() reads the REQUEST jwt even
-- inside SECURITY DEFINER. Role helpers return NULL (not RAISE) when absent so
-- the dual-mode guard in the re-keyed RPCs works.
CREATE OR REPLACE FUNCTION public.current_grant_ref()
RETURNS TABLE(grant_id uuid, role text, ref_id uuid, scope jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT g.id, g.role, g.ref_id, g.scope
  FROM access_grants g
  WHERE g.supabase_user_id = auth.uid()
    AND g.revoked_at IS NULL
    AND (g.expires_at IS NULL OR g.expires_at > now())
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_mentor_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT ref_id FROM current_grant_ref() WHERE role = 'mentor' $$;

CREATE OR REPLACE FUNCTION public.current_juror_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT ref_id FROM current_grant_ref() WHERE role = 'juror' $$;

REVOKE ALL ON FUNCTION public.current_grant_ref() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_mentor_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_juror_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_grant_ref() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_mentor_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_juror_id() TO authenticated;
```

- [ ] **Step 2: Self-review** — confirm `auth.uid()` is schema-qualified (it is: `auth.uid()`); `STABLE` + `SECURITY DEFINER` present; helpers return NULL on absence.

- [ ] **Step 3: Commit**
```bash
git add migrations/phase3_sp2_b1_helpers.sql
git commit -m "feat(auth): session-identity helpers current_grant_ref/current_mentor_id/current_juror_id (SP2 B1)"
```

---

## Task 2: re-key the 11 RPCs (dual-mode, session-first)

**Files:** Create `migrations/phase3_sp2_b1_rekey_rpcs.sql`

**Method:** For each RPC below, copy its **entire** `CREATE OR REPLACE` body **verbatim** from `migrations/phase2_mentor_juror_text.sql`, then replace ONLY its identity-resolution line with the guarded preamble per its variant. Keep the signature, `LANGUAGE`, `SECURITY DEFINER`, `SET search_path` exactly. Re-emit the GRANTs block at the end (copy from `phase2_mentor_juror_text.sql` lines 357-365).

### Re-key variants

**Variant A — resolver RAISES on miss** (`juror_token_owner`, `mentor_session_owner`). Replace `v_id := <resolver>(p_token);` with:
```sql
  v_id := current_<role>_id();
  IF v_id IS NULL AND p_token IS NOT NULL THEN v_id := <resolver>(p_token); END IF;
  IF v_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
```
(`current_<role>_id()` is `current_juror_id()` or `current_mentor_id()`; `<resolver>` is the function it currently calls; `v_id` is the existing variable name, e.g. `v_juror_id`/`v_mentor_id`/`v_mentor`.)

**Variant B — resolver returns NULL on miss** (`mentor_prepitch_resolve`). Replace `v_mentor_id := mentor_prepitch_resolve(p_token);` with:
```sql
  v_mentor_id := current_mentor_id();
  IF v_mentor_id IS NULL AND p_token IS NOT NULL THEN v_mentor_id := mentor_prepitch_resolve(p_token); END IF;
```
**Keep the existing next line unchanged** (`IF v_mentor_id IS NULL THEN RETURN NULL; END IF;` for `mentor_prepitch_list`; `IF v_mentor_id IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;` for `mentor_prepitch_submit`).

**Variant C — `sugar_roster` (special, dual identity).** Its body authorizes via participant OR mentor. After the existing participant-token block and before the existing `IF NOT v_ok AND p_mentor_token IS NOT NULL` block, insert a session check:
```sql
  IF NOT v_ok AND current_mentor_id() IS NOT NULL THEN v_ok := true; END IF;
```
Leave the participant path (`participant_session_owner_confirmed`, uuid) and the `p_mentor_token` fallback unchanged. (Participants stay token-based in B1.)

### Per-RPC table

| RPC | identity var | resolver (today) | variant |
|---|---|---|---|
| `juror_accept_consent` | `v_juror_id` | `juror_token_owner` | A (juror) |
| `juror_get_context` | `v_juror_id` | `juror_token_owner` | A (juror) |
| `juror_submit_score` | `v_juror_id` | `juror_token_owner` | A (juror) |
| `mentor_get_me` | `v_mentor_id` | `mentor_session_owner` | A (mentor) |
| `mentor_save_note` | `v_mentor_id` | `mentor_session_owner` | A (mentor) |
| `mentor_delete_note` | `v_mentor_id` | `mentor_session_owner` | A (mentor) |
| `mentor_prepitch_list` | `v_mentor_id` | `mentor_prepitch_resolve` | B |
| `mentor_prepitch_submit` | `v_mentor_id` | `mentor_prepitch_resolve` | B |
| `sugar_my_received_mentor` | `v_mentor` | `mentor_session_owner` | A (mentor) |
| `sugar_send_mentor` | `v_mentor` | `mentor_session_owner` | A (mentor) |
| `sugar_roster` | `v_ok` | `mentor_session_owner` | C |

**NOT re-keyed (leave as-is):** the resolvers themselves (`juror_token_owner`, `mentor_session_owner`, `mentor_prepitch_resolve` — they ARE the legacy fallback), `mentor_get_me_by_token` (legacy bootstrap, already grant-fixed in #242), `mentor_login`/`mentor_logout` (dropped in B3). `sugar_roster`'s participant side.

### Worked example — `juror_get_context` (Variant A)

The only change vs `phase2_mentor_juror_text.sql:36-76` is line 42. Before:
```sql
  v_juror_id := juror_token_owner(p_token);
```
After:
```sql
  v_juror_id := current_juror_id();
  IF v_juror_id IS NULL AND p_token IS NOT NULL THEN v_juror_id := juror_token_owner(p_token); END IF;
  IF v_juror_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
```
Everything else (the `json_build_object` with `idea_visible` masking + aggregations + `my_scores`) is copied verbatim.

### Worked example — `mentor_prepitch_list` (Variant B)

`phase2_mentor_juror_text.sql:220-221`. Before:
```sql
  v_mentor_id := mentor_prepitch_resolve(p_token);
  IF v_mentor_id IS NULL THEN RETURN NULL; END IF;
```
After:
```sql
  v_mentor_id := current_mentor_id();
  IF v_mentor_id IS NULL AND p_token IS NOT NULL THEN v_mentor_id := mentor_prepitch_resolve(p_token); END IF;
  IF v_mentor_id IS NULL THEN RETURN NULL; END IF;
```

### Worked example — `sugar_roster` (Variant C)

`phase2_mentor_juror_text.sql:338-348`. Insert one line after the participant block, before the `p_mentor_token` block:
```sql
  IF NOT v_ok AND current_mentor_id() IS NOT NULL THEN v_ok := true; END IF;
  IF NOT v_ok AND p_mentor_token IS NOT NULL THEN
    BEGIN PERFORM mentor_session_owner(p_mentor_token); v_ok := true;
    EXCEPTION WHEN raise_exception THEN NULL; END;
  END IF;
```

- [ ] **Step 1: Write the migration** — all 11 re-keyed `CREATE OR REPLACE`s (verbatim bodies + preamble swap) followed by the GRANTs block (verbatim from `phase2_mentor_juror_text.sql:356-365`, keeping `anon, authenticated` for coexistence).

- [ ] **Step 2: Self-review** — for each RPC: signature byte-identical to source; only the identity preamble changed; the rest of the body verbatim; GRANTs re-emitted. Confirm no RPC accidentally dropped its existing post-resolve NULL handling.

- [ ] **Step 3: Commit**
```bash
git add migrations/phase3_sp2_b1_rekey_rpcs.sql
git commit -m "feat(auth): re-key mentor/juror/sugar RPCs to session-first dual-mode (SP2 B1)"
```

---

## Integration (main-thread, gated — NOT a subagent task)

Prod is `qshrzfahotmjshtjuvno`. B1 is additive; legacy token path is unchanged by construction.

- [ ] **1. Apply** both migrations via MCP (`execute_sql` / `apply_migration`): helpers first, then the re-key. Verify the 3 helpers exist (`\df current_*`) and the 11 RPCs still have their original signatures + GRANTs.
- [ ] **2. Session-path smoke (the new branch).** Reuse the tracer technique: insert a test `jwt_exchange` grant with `role='mentor'`, `ref_id = <a real mentor id>` (pick one from `SELECT id FROM mentors LIMIT 1`), token hash of a known plaintext; `curl` `access-exchange` (Bearer anon) → `verifyOtp(type:magiclink)` → session; call `supabase.rpc('mentor_get_me', { p_token: null })` (REST `/rest/v1/rpc/mentor_get_me` with the session bearer, body `{"p_token":null}`) → assert it returns THAT mentor's serialized data (resolved via `current_mentor_id()`, no token). Repeat once for juror (`role='juror'`, `juror_get_context` tokenless). **Tear down** (delete backing user + test grants).
- [ ] **3. Negative smoke.** Call a re-keyed RPC with `p_token:null` and NO session (anon bearer) → assert `unauthorized` (Variant A) / NULL (Variant B `mentor_prepitch_list`).
- [ ] **4. Legacy-path regression.** Confirm the token branch still resolves: with a known legacy token if available, OR assert behavior is unchanged by construction (the resolver code is untouched) — at minimum, a bogus token + no session → `unauthorized`/NULL (not a crash), proving the guard order.
- [ ] **5. Open a PR** (backend SQL only; no frontend, so the Pages deploy is a no-op). Reviewers: confirm the re-key preserved each body and the guard order. Merge keeps the migration files as source-of-truth.

---

## Notes for the executor
- Subagents write files only; all prod application is the Integration section.
- CRLF repo: edit files directly.
- The session branch is **dormant** until B2 ships the frontend — B1 changes nothing for real users.
- Do NOT flip `grant_auth_kind` or UPDATE the 17 grants here (that is B2).
- A changelog under `docs/changelog/` when B1 ships.
