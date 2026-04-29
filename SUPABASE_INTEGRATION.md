# Supabase Integration — Phase C1

This document describes the **Phase C1** migration of `underdogs-coach-finder`
from a static `coaches_db.json` file to **Supabase** as the source of truth
for coach pool data. The architecture context lives in
`C:/Users/USER/underdogs-coaching-log/docs/ARCHITECTURE.md` (this app's
relationship to `ud-ops`, `coaching-log`, and the shared DB).

> Status (2026-04-23): **Phase C1 done — coach pool reads from Supabase.**
> Subsequent phases (C2 RAG via RPC, C4 Auth migration, C3 evaluations UI)
> are still pending.

---

## What changed

### Before
- The browser bundle imported `client/src/data/coaches_db.json` directly
  (~800 coaches, ~700 KB) as the base coach pool.
- `python-service/` also held a copy of `coaches_db.json` for FAISS RAG.
- Edits/additions were stored in Firestore as an *overlay* on top of the
  static base.

### After (this PR)
- `client/src/contexts/CoachDataContext.tsx` now fetches `GET /api/coaches`
  on mount and uses the result as the base coach pool.
- A new endpoint `/api/coaches`:
  - **Production:** Vercel serverless function (`api/coaches.ts`)
  - **Dev (vite):** middleware plugin in `vite.config.ts`
  - **Dev (express, `npm start`):** route in `server/index.ts`
  All three paths invoke the same handler in `api/coaches.ts`.
- The handler queries `public.coaches_directory` in Supabase using the
  **service-role key** (server-only), filters `status = 'active'`, and
  maps the row shape back to the existing `Coach` type
  (`client/src/types/coach.ts`).
- The Firestore overlay (added/edited/deleted) is **unchanged** — it still
  layers on top of the new Supabase-sourced base.
- `coaches_db.json` is **kept** in `client/src/data/` and still imported
  as a fallback. If `/api/coaches` fails (no env vars, network error,
  etc.) the app falls back to the bundled JSON automatically.

---

## Why a server proxy (option b), not a direct browser-to-Supabase call

`coaches_directory` has the RLS policy

```sql
CREATE POLICY "cd_read_authenticated" ON public.coaches_directory
  FOR SELECT TO authenticated USING (true);
```

— only the `authenticated` Postgres role can read. coach-finder still
uses **Firebase Auth** (Phase C4 will migrate to Supabase Auth), so the
browser has **no Supabase JWT** and would hit the policy as the `anon`
role, getting zero rows.

We considered three options:

| Option | Approach | Verdict |
|---|---|---|
| (a) Add anon-read RLS on `coaches_directory` | Simplest client change | **Rejected** — exposes coach contact info (email, phone) and biographical details to anyone on the internet. The coach pool isn't intended to be a public dataset. |
| **(b) Server proxy with service-role key** ✅ | `/api/coaches` runs server-side with `SUPABASE_SERVICE_ROLE`, returns JSON | **Chosen.** Keeps RLS strict, hides secrets, requires only one server env var, no client auth changes. |
| (c) Defer to C4 | Keep JSON until Auth migration | Rejected — the goal of C1 is precisely to get off the JSON. |

When Phase C4 lands (Supabase Auth) we can replace the proxy with a
direct browser fetch using the user's JWT — the existing RLS will
already let `authenticated` users read.

---

## Required environment variables

### Server-only (no `VITE_` prefix — must NEVER reach the browser)

| Var | Where | Value |
|---|---|---|
| `SUPABASE_URL` | Vercel + `.env.local` | `https://zwvrtxxgctyyctirntzj.supabase.co` |
| `SUPABASE_SERVICE_ROLE` | Vercel + `.env.local` | service_role key from Supabase Dashboard → Project Settings → API → "Reveal" |

### Existing (unchanged by C1)

`VITE_FIREBASE_*`, `VITE_API_BASE_URL` — still required.
See `.env.example` for the full list.

### How to set up

**Local dev:**
```
1. Copy .env.example → .env.local (if you don't have one yet)
2. Fill in SUPABASE_SERVICE_ROLE (and confirm SUPABASE_URL is correct)
3. Restart `npm run dev`
4. Hit http://localhost:3000/api/coaches in the browser → expect JSON {coaches: [...]}
```

**Production (Vercel):**
```
Vercel Dashboard → Project (underdogs-coach-finder) → Settings →
Environment Variables → Add:
  SUPABASE_URL          = https://zwvrtxxgctyyctirntzj.supabase.co
  SUPABASE_SERVICE_ROLE = <paste from Supabase>
Re-deploy (or push a commit).
```

The Firebase keys remain client-side (`VITE_*`) and stay where they are
in Vercel's env settings.

---

## File map

### New
- `api/coaches.ts` — serverless function returning the active coach pool
- `api/_lib/supabaseAdmin.ts` — shared Supabase admin client + row-to-Coach mapper
- `.env.example` — template for required env vars (kept in repo)
- `SUPABASE_INTEGRATION.md` — this document

### Modified
- `client/src/contexts/CoachDataContext.tsx` — fetch `/api/coaches`; JSON now fallback only
- `server/index.ts` — register `/api/coaches` before the Python proxy
- `vite.config.ts` — dev middleware plugin so `/api/coaches` is served during `npm run dev`
- `vercel.json` — exclude `/api/*` from the SPA rewrite so the function is reachable
- `package.json` — added `@supabase/supabase-js` dependency
- `.env.local` — added placeholders for new vars (real key still TODO)

### Untouched (deferred to later phases)
- `client/src/lib/firebase.ts` — Firebase Auth + Firestore overlay (C4 will migrate)
- `python-service/**` — FAISS RAG (C2 will swap to `search_coaches_by_embedding` RPC)
- `client/src/data/coaches_db.json` — kept as offline fallback; eventually deletable when Phase C2 lands and we trust the live data path 100%
- `python-service/coaches_db.json` — same; will be removed when Python service is decommissioned

---

## Column mapping verification

The Supabase row → client `Coach` mapper lives in `api/_lib/supabaseAdmin.ts::rowToCoach`.

| Client `Coach` field (`client/src/types/coach.ts`) | Supabase column | Notes |
|---|---|---|
| `id: number` | `external_id` (string) → `Number()` | Falls back to a hash of the uuid if `external_id` is missing or non-numeric (admin-created rows) |
| `name` | `name` | |
| `organization`, `position` | same | |
| `email`, `phone` | same | |
| `intro`, `career_history`, `education`, `underdogs_history`, `current_work`, `tools_skills` | same | |
| `expertise[]`, `industries[]`, `regions[]`, `roles[]` | same | nullable in DB → normalised to `[]` |
| `career_years`, `career_years_raw` | same | |
| `overseas`, `overseas_detail` | same | |
| `photo_url` | `photo_url` | |
| `photo` (legacy filename) | `photo_filename` | |
| `location`, `gender`, `country`, `language`, `business_type`, `category` | same | |
| `tier: 1 \| 2 \| 3` | `tier` (text) → coerced | "1"/"2"/"3" parse; "S"→1, "A"→2, others→3 |
| `is_active` | `status === 'active'` | coach-finder UI filters out inactive anyway (we already do this server-side via `.eq('status', 'active')`) |

**Not mapped (intentionally):** `tags`, `availability_status`, `linked_user_id`,
`max_concurrent_projects`, `notes`, `created_at`, `last_synced_at`,
`embedding*`. None of these are referenced by the existing coach-finder UI.

---

## Lockfile note

`package.json` was updated with `@supabase/supabase-js@^2.104.1`. Because
this repo's package manager is **pnpm** (per `vercel.json`'s
`installCommand: pnpm install`), you should regenerate `pnpm-lock.yaml`
once before deploying:

```
pnpm install
```

If you see a `ERR_PNPM_OUTDATED_LOCKFILE` error on Vercel, that's the
fix. (During this PR's prep we couldn't run `pnpm install` locally
because the existing virtual store points elsewhere — see the agent
report for details. The package.json itself is correct.)

---

## Roadmap (what comes next)

| Phase | Description |
|---|---|
| **C2** | Replace `python-service` FAISS calls with `search_coaches_by_embedding` RPC. Frontend `Home.tsx` will then call the RPC directly (still proxied if needed) |
| **C3** | PM evaluations UI writing to `coach_evaluations` (Phase B schema must land first) |
| **C4** | Migrate Firebase Auth → Supabase Auth. Once done, the browser can call Supabase directly with the user's JWT and we can deprecate `/api/coaches` (or keep it for caching) |
| **Decommission** | Once C2 + C4 are stable: delete `coaches_db.json` from both `client/src/data/` and `python-service/`. Until then, they are seeds / fallbacks |
