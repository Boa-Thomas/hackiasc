# HackIA — Multi-Edition Instance Architecture (Design)

**Date:** 2026-06-03
**Status:** Design — approved direction; blueprint for future editions (no edition currently scheduled to build)
**Author decisions:** captured via brainstorming 2026-06-03

---

## Context

HackIA SC Blumenau 2026 (the event this codebase was built for) has concluded. Future editions will be run by **independent local teams** (different mentors, different facilitator, different organizers) who should **own their own data**. The current app is a single-event React SPA on GitHub Pages (`hackiasc.com`) backed by one Supabase project (`qshrzfahotmjshtjuvno`), with all event-specific values in `src/lib/config.js` (`EVENT_CONFIG`).

The question this design answers: how to serve multiple editions cleanly.

## Decision

**One edition = one isolated instance, from a single shared codebase.** Each edition gets:
1. its **own Supabase project** (its own DB, auth, storage, edge functions, secrets);
2. its **own deploy** (Cloudflare Pages — recommended) with its **own env vars**;
3. its **own subdomain** under an umbrella domain (e.g. `blumenau.hackia.com`).

The app stays single-event — almost no logic refactor. Isolation comes from **separate instances**, not from an in-DB tenant discriminator.

### Why NOT in-DB multi-tenancy (`event_id` everywhere)
Rejected. With independent local teams owning real data (CPF, payments) it would mean every org's data in one DB, separated only by an RLS `event_id` filter. One missed filter in any of the ~25 SECURITY DEFINER RPCs or ~20 RLS policies (just hardened in SP1–SP3) = cross-edition data leak. You also couldn't hand off or delete one team's data cleanly. High blast radius, high refactor risk, wrong ownership model.

### What this dissolves
The original "register new mentors / disable old ones in one place" problem disappears: the next edition is a fresh, empty instance with its own mentors; the old mentors live only in the frozen Blumenau instance. Nothing to migrate or disable.

## Hosting & domain

- **Move off GitHub Pages → Cloudflare Pages.** One repo, multiple Pages "projects" (one per edition), each with its own env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, + event config) and a subdomain. Cloudflare pairs DNS + Pages in one place for the `*.hackia.com` subdomains. (Netlify/Vercel are equivalent if preferred.)
- **Umbrella domain:** `hackia.com`. **PREREQUISITE — confirm ownership/availability** before standing up edition #2; if unavailable, pick the umbrella domain first.
- Blumenau 2026 stays at `hackiasc.com` as the frozen first-edition archive (it is NOT migrated).

## Per-edition configuration

**Start: per-deploy config (env-driven), behind the existing `EVENT_CONFIG` shape.** The deployer sets each edition's values (dates, city, Pix key, links, contact, Supabase URL/anon) at deploy time. Minimal refactor: the code reads the same `EVENT_CONFIG` object; only its *source* changes from hardcoded → env/build-time.

**Evolution path (deferred, YAGNI):** if a local team needs self-service, move the non-secret event values into an `event_config` table in that edition's own Supabase, fetched at runtime + editable in the admin. Because everything already reads `EVENT_CONFIG`, only the source swaps — the rest of the app is untouched. Not built now.

## Decomposition (each is its own spec → plan → implementation)

1. **Schema bootstrap (foundation, highest value, do first).** Consolidate the full current schema — `supabase-setup.sql` + the ~40 `migrations/*.sql` + all SP1/SP2/SP3 auth work — into a single idempotent `bootstrap.sql` (plus the edge-function set), so a fresh Supabase project is provisioned in **one run**, not by replaying history. Highest rigor required: every table, RPC, RLS policy, GRANT, trigger, enum, extension quirk (e.g. pgcrypto in `extensions` schema), and the edge functions must be captured. Verification = stand up a throwaway Supabase project, run it, and diff its catalog against prod.
2. **De-hardcode config.** Move Blumenau-specific values out of `config.js` into the parametric (env) source; keep the `EVENT_CONFIG` shape stable. Audit the whole app for other hardcoded event strings (page titles, dates, city, `public/CNAME`, OG/meta).
3. **Hosting migration.** GitHub Pages → Cloudflare Pages: repo build config, one deploy per edition, env vars per deploy, DNS subdomains under `hackia.com`. Document the GitHub Actions → Cloudflare change.
4. **Provisioning runbook.** A checklist (later maybe a script) to launch edition N: create Supabase project → run `bootstrap.sql` → deploy the ~14 edge functions → set **all per-instance secrets** (Supabase service role; Mercado Pago `MP_ACCESS_TOKEN` + webhook secrets — each team uses their OWN MP account; push VAPID keys; `WHISPER_URL`; etc.) → set deploy env (Supabase URL/anon + event config) → add subdomain DNS → smoke test. Enumerate the full secret set.
5. **Freeze Blumenau + optional D cleanup.** `hackiasc.com` is the frozen archive. The legacy mentor/juror token cleanup (SP2/B3, "Tarefa D") is now **zero-risk** (the event is over; 0/17 ever re-onboarded; nobody depends on those accounts) — it becomes optional housekeeping on the frozen instance, no longer a gated cutover.

## Ordering
#1 (bootstrap) first — it's the foundation; without one-shot schema, every new instance is painful. Then #2, then #3+#4 together, then #5 whenever. Build only when an edition is actually scheduled.

## Non-goals / out of scope
- In-DB multi-tenancy (`event_id`) — rejected (above).
- Cross-edition analytics / a central dashboard over all editions — not needed (independent owners). If ever wanted, it's a separate read-only aggregation layer, not a reason to merge data.
- Runtime DB-config / organizer self-service editing — deferred (evolution path).
- Migrating Blumenau 2026 into the new model — it stays frozen as-is.

## Open items / prerequisites
- **Confirm `hackia.com` ownership/availability** (or choose the umbrella domain).
- Confirm host = **Cloudflare Pages** (recommended) vs Netlify/Vercel.
- Each edition needs its **own** third-party accounts/secrets (Mercado Pago, push keys, Whisper box) — confirm local teams provide these, or that they're optional per edition.

## Next step
When ready to build the first piece, brainstorm/spec **sub-project #1 (schema bootstrap)** in detail, then `writing-plans`. This doc is the umbrella blueprint; each sub-project gets its own spec.
