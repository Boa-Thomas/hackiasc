# /security-sweep run report — 2026-06-01

**Branch (fixes):** `fix/security-sweep-20260601` (commit `d9b3395`) — NOT pushed, NOT merged.
**Base:** `master` @ `c4dcd33`
**Command:** `/security-sweep` (first real run)

## Summary

- **Hunt:** 6 rounds, **60 candidates**, loop-until-dry (stopped at max rounds, never hit 2 dry).
- **Verify:** adversarial panel (3 lenses) → **44 confirmed**, 16 rejected. **0 unverified** (panel healthy).
- **Status:** 40 new, 4 known (the search_path siblings already catalogued).
- **Auto-fixed (8):** all in `src/admin/` (frontend, gate-validatable). Applied on the fix branch.
- **Report-only (36):** SQL/RLS/SECURITY DEFINER, edge functions, payment, wall/sugar identity, mentor auth, config/supply-chain — fixes proposed below for manual review/application.

### Gate-coverage honesty statement
`npx vitest run` (134/134) + `npm run build` (OK) validate **JS/JSX only**. SQL, RLS, SECURITY DEFINER and edge-function fixes are **report-only** and require manual review and application against production (per the manual-apply policy). The regression-validator (architect-reviewer) signed off the 8 auto-fixes as behavior-preserving with no authorization weakened and no contract broken.

---

## Auto-fixed (8) — on `fix/security-sweep-20260601`

| # | Finding | File | Sev |
|---|---------|------|-----|
| 1 | CSV formula injection (exportCSV) | `src/admin/AdminRegistrations.jsx` | medium |
| 2 | Stored XSS via `linkedin_url` raw href | `src/admin/AdminRegistrations.jsx:755` | high |
| 3 | CSV formula injection (voucher export) | `src/admin/AdminBulkOrders.jsx` | medium |
| 4 | CSV formula injection (deliverables export) | `src/admin/AdminDeliverables.jsx` | medium |
| 5 | CSV formula injection (demographic export) | `src/admin/AdminDashboard.jsx` | medium |
| 6 | Unsanitized `.or()` search interpolation | `src/admin/TransferTicketModal.jsx` | low |
| 7 | Tab content rendered without role gate (defense-in-depth) | `src/admin/AdminPanel.jsx` | medium |
| 8 | Login throttle client-side only, resets on reload (defense-in-depth) | `src/admin/useAdminAuth.js` | low |

**Fixes:** CSV cells now prefix a single quote when starting with `= + - @ \t \r`; `linkedin_url` renders as `<a>` only when `/^https?:\/\//i` (else plain text); search strips PostgREST operators `[,()*%]`; AdminPanel gates content by the role-filtered `allowedTabs`; admin login throttle persisted to localStorage. **Gate:** vitest 134/134, build OK. **Regression-validator:** PASS.

> Note: #2 (linkedin XSS) and #1/3/4/5 (CSV) are real, complete frontend fixes. #7/#8 are **defense-in-depth** — the true boundary for #7 is Supabase RLS on the `checkin`/`staff` roles (see report-only items below).

---

## Report-only (36) — manual review/application required

### A. SECURITY DEFINER without `SET search_path` (B7 class — the project only partially fixed it)
The auth-gate functions and the entire anon-reachable RPC surface run as owner with a caller-mutable `search_path`. **Fix for all:** `ALTER FUNCTION … SET search_path = pg_catalog, public;` (or add `SET search_path = public, pg_temp` to each definition). Apply in a migration, test in a window.

| Finding | File:line | Sev | Status |
|---|---|---|---|
| `is_admin_or_viewer()` — linchpin of EVERY RLS policy | `supabase-setup.sql:80` | **high** | new |
| `is_admin()` (sibling, gates every admin RPC) | `supabase-setup.sql:90` | low | known |
| `participant_login()` (anon CPF auth, mints tokens) | `migrations/reduce_participant_lockout.sql:10` | medium | new |
| `mentor_login()` + mentor/participant session helpers | `supabase-setup.sql:1307` | low | new |
| Participant `*` SECURITY DEFINER family (anon) | `supabase-setup.sql:507` | low | known |
| Payment/registration core (`enforce_ticket_price` trigger, `claim_early_bird_slot`, `recover_pending_registration`, `anonymize_user_data`, `transfer_ticket`, voucher/bulk admin_*) | `migrations/validate_ticket_price.sql:14` (+many) | low | new |
| `redeem_voucher()` (anon, writes `confirmed` rows) | `migrations/create_bulk_orders.sql:368` | low | known |
| `get_mp_fee_summary()` | `migrations/filter_mp_internal_ops.sql:24` | low | known |

### B. Edge functions — missing auth / idempotency / CORS
| Finding | File:line | Sev | Fix |
|---|---|---|---|
| `sync-mp-payments` accepts ANY authenticated JWT (no admin check) → leaks total revenue to viewer/checkin/staff | `supabase/functions/sync-mp-payments/index.ts:55` | **high** | require `user.app_metadata?.role === 'admin'` like refund-payment/transcribe-pitch |
| `send-push` no in-code auth; pushes attacker-supplied title/body/url (push phishing) | `supabase/functions/send-push/index.ts:50` | medium | re-fetch title/body/url from `notifications` row by id; require a shared-secret header |
| `team-slides` download-url signs attacker-controlled storage path (private-bucket RLS bypass) | `supabase/functions/team-slides/index.ts:126` | medium | require `slidesPath.startsWith('deliverables/${teamId}/')` or sign the canonical path |
| `create-preference` re-invocation corrupts a confirmed registration (rewrites tier/price, clobbers `mp_payment` refund link) | `supabase/functions/create-preference/index.ts:189` | medium | reject when `payment_status !== 'pending'`; guard `claim_early_bird_slot`; never overwrite `mp_payment` notes |
| `create-preference` no caller auth; overwrites `payment_notes` | `supabase/functions/create-preference/index.ts:52` | low | require authenticated/owning caller before mutating |
| `refund-payment` check-then-act idempotency + no MP idempotency key (double-refund race) | `supabase/functions/refund-payment/index.ts:161` | low | conditional `UPDATE … WHERE payment_status='confirmed'`; add `X-Idempotency-Key` |
| `mp-webhook` non-constant-time signature compare | `supabase/functions/mp-webhook/index.ts:58` | low | constant-time equality |
| `evaluate-team` CORS `*` + zero auth (stub today, hole when wired) | `supabase/functions/evaluate-team/index.ts:23` | low | use ALLOWED_ORIGINS + admin JWT check before logic ships |

### C. Wall / Sugar identity — `registration_id` used as a credential it isn't
`registration_id` is public (rendered in the check-in QR, and the Sugar roster lists every confirmed participant's id). The wall RPCs accept it as identity with no session token.
| Finding | File:line | Sev | Fix |
|---|---|---|---|
| Sugar roster exposes every confirmed participant's `registration_id` | `src/sugar/SendSugarCube.jsx:26` (backend: `sugar_roster`) | **high** | don't return raw `registration_id`; use opaque refs or server-derived identity |
| Wall vote ballot-stuffing (IDOR via client `registration_id`) | `src/wall/WallParticipant.jsx:140` (backend: `wall_vote`/`wall_unvote`) | medium | require participant session token; derive id server-side |
| Wall submit-pain impersonation (client `registration_id`) | `src/wall/WallParticipant.jsx:116` (backend: `wall_submit_pain`) | medium | same — server-derive identity |
| Public `#telao` exposes every pain author's full name | `src/wall/WallScreen.jsx:138` (backend: `wall_list`) | low | gate `#telao` or omit `author_name` when `p_registration_id` is NULL |

### D. Mentor auth
| Finding | File:line | Sev | Fix |
|---|---|---|---|
| `mentor_login` 4-digit code + 1-min lockout (10k keyspace, brute-forceable) | `migrations/reduce_mentor_lockout.sql:8` / `supabase-setup.sql:1307` | medium | longer/random code or magic-link only; exponential backoff + per-IP throttle |
| Mentor link-mode token survives logout (no server-side invalidation) | `src/mentor/useMentorAuth.js:129` (backend) | low | invalidate the link session server-side on logout; add a revocation path |

### E. PII / authorization
| Finding | File:line | Sev | Fix |
|---|---|---|---|
| Viewer can harvest mentor `access_token` via direct table read (RLS SELECT is `is_admin_or_viewer`) | `src/admin/AdminMentors.jsx:26` (backend RLS) | medium | move token read behind a SECURITY DEFINER RPC that self-checks `is_admin()`, or restrict the SELECT policy |
| `get_mp_fee_summary()` leaks total revenue to checkin/staff (granted to `authenticated`, no role gate) | `migrations/create_mp_payments.sql:64` | medium | add `IF NOT is_admin_or_viewer() THEN RAISE`; or REVOKE from `authenticated` |
| `recover_pending_registration` returns `full_name`/`email` to anon by email (enumeration) | `migrations/security_audit_2_fixes.sql:110` | low | return only the payment-retry fields; drop `full_name`/`email` |
| Shared staff link grants read of full PII (CPF/email/phone/birth_date) for all confirmed | `src/admin/StaffAccess.jsx:26` (backend RLS) | low | rotate the shared password per event; narrow the staff SELECT columns; lookup via SECURITY DEFINER RPC |

### F. Crypto / config / supply-chain
| Finding | File:line | Sev | Fix |
|---|---|---|---|
| Voucher codes (free confirmed tickets) generated with non-CSPRNG `random()` | `migrations/create_bulk_orders.sql:97` | low | use `gen_random_bytes()` (as mentor codes already do); rate-limit lookup/redeem |
| DATI discount secret inlined into the public client bundle (`VITE_DATI_DISCOUNT_CODE`) | `.github/workflows/deploy.yml:34` | low | move to server-side `lookup_voucher` per-partner codes; stop shipping a shared code |
| GitHub Actions pinned to mutable tags (job holds all prod secrets + Pages write) | `.github/workflows/deploy.yml:21` | low | pin each `uses:` to a full commit SHA |
| Dev/build CVEs: `ws` (GHSA-58qx-3vcg-4xpx), `postcss` (GHSA-qx2v-qp2m-jg93) — dev-only, not in prod bundle | `package.json` | low | `npm audit fix` (no major bumps) |

---

## Residual risks / follow-ups

1. **Command bug — `args` not delivered to named workflows.** When `/security-sweep` invoked `Workflow({ name: 'security-sweep-fix', args: { findings } })`, the script received empty `args` (Workflow A likewise ran with default `head='HEAD'` and no `audit_known`). Worked around this run by re-invoking Workflow B with an **inline script** carrying the findings embedded. **The saved command's §5 (and §2 `audit_known`) must be fixed** to not rely on `args` over name-resolution — e.g. embed findings into an inline `script`, or verify the harness's args-forwarding. Until fixed, the named-workflow fix phase is inert.
2. **LLM diffs don't `git apply` on this CRLF repo.** All 7 fixer diffs failed `git apply --3way` (CRLF working tree vs LF context + fabricated index SHAs). Applied via the §6.3 direct-edit fallback agent instead. Expect this to be the common path; the command already prescribes the fallback.
3. **Report-only SQL/edge fixes** need manual application as migrations/edge deploys against prod `qshrzfahotmjshtjuvno` (manual-apply policy). The **B7 search_path class** (esp. `is_admin_or_viewer` HIGH) and **sync-mp-payments admin check** (HIGH) should be prioritized.
4. **`npm audit fix`** for the dev-only ws/postcss CVEs (also installed `@dnd-kit/*` locally this run — node_modules was stale vs package.json).
5. The fix branch is **ready for review** — not pushed, not merged.
