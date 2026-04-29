# tools — coach-finder ops scripts

## firestore-to-supabase.mjs (Phase F4)

One-shot migration that copies Firestore data (coach overlay edits, projects with their coach assignments + evaluations) into the shared Supabase tables (`coaches_directory`, `business_plans`, `business_plan_coaches`, `coach_evaluations`).

### Why

`coach-finder` historically stored:

- Coach edits/deletes/adds in `coachOverlay/global` (Firestore), layered on top of the bundled `coaches_db.json` seed.
- Projects + per-coach payment + evaluations in the `projects` collection (Firestore).

After Phase C1 (coach data already in Supabase) and Phase C4 (Auth on Supabase), Firestore is the only thing left. This script gets us to Firebase 0%.

### Setup (do once)

1. **Download Firebase service account JSON.**
   Firebase Console → ⚙ Project Settings → Service accounts → "Generate new private key" → download.
   Save the file as `tools/firebase-sa.json`. **DO NOT commit it.** The `.gitignore` excludes it.

2. **Add Supabase credentials to `.env.local`** (server-side, project root):
   ```
   SUPABASE_URL=https://zwvrtxxgctyyctirntzj.supabase.co
   SUPABASE_SERVICE_ROLE=<service_role key from Supabase → API>
   ```
   These are NEVER exposed to the browser; they only live on disk + run with the script.

3. **Install firebase-admin** (one-time, if not already a dep):
   ```
   pnpm add -D firebase-admin
   ```

4. **Confirm Supabase prerequisite SQL has been run.** This script needs:
   - `business_plan_coaches.payment_info` (jsonb), `task_summary` (text)
   - `business_plans.client` (text), `total_budget` (numeric)
   - extended `business_plans.status` CHECK (planning/active/completed allowed)
   - `business_plans.legacy_firestore_id text UNIQUE` (the script will tell you to add it if missing)

   If the script aborts complaining about a missing column, run the SQL it prints in Supabase → SQL Editor and re-run.

### Run

```
# Dry run first — reads everything but writes nothing.
node tools/firestore-to-supabase.mjs --dry-run

# If the dry-run summary looks right, run for real:
node tools/firestore-to-supabase.mjs
```

### What it does

| Source                              | Destination                          |
|-------------------------------------|--------------------------------------|
| `coachOverlay/global.added[]`       | INSERT into `coaches_directory`      |
| `coachOverlay/global.edited{}`      | UPDATE `coaches_directory` matching by external_id |
| `coachOverlay/global.deleted[]`     | UPDATE `coaches_directory.status='deleted'` |
| `projects/<doc>` (the project itself) | INSERT into `business_plans` (with `legacy_firestore_id` for re-run safety) |
| `projects/<doc>.coaches[]`          | INSERT into `business_plan_coaches` (with `payment_info` jsonb) |
| `projects/<doc>.coaches[].evaluation` | INSERT into `coach_evaluations` (one star rating + comment) |

The script is idempotent — safe to re-run. It uses:

- `coaches_directory.external_id` UNIQUE for coach matching
- `business_plans.legacy_firestore_id` UNIQUE for project matching
- `business_plan_coaches (bp, coach)` UNIQUE for member dedup
- `coach_evaluations` exists-check by `(coach, bp)` pair

Re-running after a partial run will skip everything already migrated.

### Flags

- `--dry-run` — read everything, print what would happen, write nothing.
- `--sa <path>` — alternative service-account JSON path (default `tools/firebase-sa.json`).
- `--skip-overlay` — skip the coach-overlay step.
- `--skip-projects` — skip the projects step.
- `--admin-email <email>` — which auth user to use as the default `evaluator_id`. Defaults to `udpb@udimpact.ai`. Must already be a row in `public.profiles`.

### After running

1. Verify in Supabase Table Editor:
   - `coaches_directory` has any new added rows (or adjusted status='deleted' for the 1 deleted entry).
   - `business_plans` has rows whose `legacy_firestore_id` matches the Firestore project IDs.
   - `business_plan_coaches` has matching members with `payment_info` populated.
   - `coach_evaluations` has rows for projects that had evaluations.

2. Spot-check a project in `coach-finder` (after F1+F3+F5 deploy) — the BP should appear with the same coaches and evaluation it had in Firestore.

3. Once verified, the Firestore data can stay (read-only fallback) or be deleted via Firebase Console. We recommend keeping it for ~2 weeks before deletion.
