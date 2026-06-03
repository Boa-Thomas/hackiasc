# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Landing page for **HackIA SC — AI Venture Hackathon Blumenau 2026** (29-31 May). Single-page React app with registration form that saves to Supabase. Deployed to GitHub Pages at hackiasc.com.

## Project Status & Master Plan

**The event (Blumenau 2026) is over and frozen.** Before starting any work, read **[`docs/MASTER-PLAN.md`](docs/MASTER-PLAN.md)** — the single source of truth for current project state, the remaining work streams, and how to resume. Auth Phase 3 (unified-auth) is **complete in prod**; the open product front is **multi-edition** (a blueprint — build only when an edition is scheduled). Detailed context lives in the Claude Code memories `auth-phase3-progress` and `multi-edition-architecture`. **Keep `docs/MASTER-PLAN.md` updated when a work stream changes status.**

## Commands

```bash
npm run dev      # Dev server (Vite)
npm run build    # Production build → dist/
npm run preview  # Preview production build
npm run lint     # ESLint
```

## Tech Stack

- **React 19** + **Vite 8** (no SSR, static SPA)
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin (not PostCSS)
- **Supabase** (PostgreSQL) — backend/auth via anon key + RLS
- **react-hook-form** — leader form; team members use `useState` + manual validation
- **GitHub Actions** — auto-deploy to GitHub Pages on push to `main`/`master`

## Architecture

```
src/
├── App.jsx                    # Single-page layout: Navbar → Hero → ... → Footer
├── main.jsx                   # React root
├── index.css                  # Tailwind + custom theme (colors, fonts, animations)
├── lib/
│   ├── supabase.js            # Supabase client (gracefully null if env vars missing)
│   └── config.js              # EVENT_CONFIG — all editable event values (dates, links, payment)
├── hooks/
│   └── useTicketPrice.js      # Calls Supabase RPC get_confirmed_count() for early bird pricing
└── components/
    ├── Navbar.jsx             # Fixed nav with mobile hamburger
    ├── Hero.jsx               # Hero section with CTAs
    ├── About.jsx              # Hacker/Hustler/Hipster profiles + economic axes
    ├── Timeline.jsx           # 3-day schedule
    ├── Prizes.jsx             # Prize tiers + evaluation criteria
    ├── Mentorship.jsx         # Mentor info
    ├── RegistrationForm.jsx   # Full registration (individual + team up to 6 members)
    ├── PaymentInfo.jsx        # Post-submission payment instructions (Pix/Card)
    ├── FAQ.jsx                # Accordion FAQ
    └── Footer.jsx             # Contact + social links
```

## Key Patterns

- **Centralized config**: All event-specific values (dates, payment keys, URLs, contact) live in `src/lib/config.js`. Edit there, not in components.
- **Dynamic pricing**: `useTicketPrice` hook queries Supabase for confirmed registrations count. First 10 = R$150 (early bird), rest = R$200. Prices stored in cents (15000/20000).
- **Team registration**: When modality is `team`, leader fills main form (react-hook-form), additional members managed via `useState` array with manual `validateMember()`. Each member becomes a separate row in `registrations` table.
- **Supabase RLS**: `anon` can INSERT only; `authenticated` can SELECT/UPDATE. The `get_confirmed_count()` RPC uses `SECURITY DEFINER` so anon can read the count safely.
- **Graceful degradation**: If Supabase env vars are missing, `supabase.js` exports `null` and features degrade (count defaults to 0).

## Design System

Custom theme defined in `index.css` via `@theme`:

- **Colors**: `dark` (#050510), `cyan` (#06d6a0), `electric` (#3a86ff), `violet` (#8338ec), `hot` (#ff006e), `gold` (#ffbe0b)
- **Fonts**: Sora (display), JetBrains Mono (monospace)
- **Utilities**: `.card-glass`, `.glow-cyan`, `.glow-electric`, `.text-gradient-cyan`, `.text-gradient-fire`, `.text-gradient-violet`, `.bg-grid`, `.orb`
- **Animations**: `.animate-float`, `.animate-pulse-glow`, `.animate-slide-up`

## Environment Variables

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Set in `.env.local` for dev; in GitHub Secrets for CI/CD.

## Database

Schema in `supabase-setup.sql`. Single `registrations` table. Key columns: `occupation_type` (enum), `inscription_modality` (individual_form_team / individual_own / team), `ticket_tier` (early_bird / regular), `payment_status` (pending / confirmed / cancelled), `is_team_leader`, `economic_axes` (TEXT[]).

## Deployment

Push to `main`/`master` triggers `.github/workflows/deploy.yml`: npm ci → build (with Supabase secrets) → deploy to GitHub Pages. Custom domain via `public/CNAME` (hackiasc.com).

### Pre-deploy verification (REQUIRED)

**Before any deploy (i.e., before pushing/merging to `main`/`master`), run the verification agent suite via the `/pre-deploy-verify` slash command** (`.claude/commands/pre-deploy-verify.md`). It launches read-only review agents in parallel over the branch diff vs `origin/master`:

- **security-auditor** — authn/authz, RLS, SECURITY DEFINER/`search_path`, injection, secrets, edge functions.
- **code-reviewer** — bugs, React hooks/deps, regressions, edge cases.
- **architect-reviewer** — API/schema/contract/dependency impact and blast radius.
- **general-purpose (DB verification)** — when Supabase changed: confirm objects/grants/RLS/triggers/switches and a safe, self-cleaning pipeline smoke test via the Supabase MCP (project `qshrzfahotmjshtjuvno`).
- **general-purpose (integration QA)** — run `npx vitest run` + `npm run build`, verify `dist/` artifacts and frontend↔backend contract alignment (RPC names/params, event keys, role exclusions).

**Gate:** do NOT push/deploy while any **Critical/High** finding is unresolved. Fix (or get explicit user sign-off on the residual risk) and re-run the affected agents first. Known config-only pendencies (e.g., unset secrets) are ops steps, not code blockers.

For a deeper, looping audit beyond the branch diff, use **`/security-sweep`** (`.claude/commands/security-sweep.md`): it fans out finders across the whole project until coverage is dry, adversarially verifies findings, then generates gated auto-fixes on an isolated `fix/security-sweep-*` branch (JS/JSX only — SQL/RLS/edge/payment findings are report-only). It is heavier than `/pre-deploy-verify`; reach for it for periodic hardening, not every push. Pass `--dry-run` to find + report without changing code.
