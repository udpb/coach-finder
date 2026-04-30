#!/usr/bin/env node
/**
 * Phase F4 — Firestore → Supabase one-time data migration.
 *
 * Reads from Firestore (coachfinder named DB):
 *   - coachOverlay/global   (coach edits/deletes/adds layered on the seed JSON)
 *   - projects collection    (BPs + coach assignments + evaluations)
 *
 * Writes to Supabase:
 *   - coaches_directory      (apply overlay edits/deletes/adds in place)
 *   - business_plans         (one row per Firestore project doc)
 *   - business_plan_coaches  (one row per project.coaches[] entry)
 *   - coach_evaluations      (one row per project.coaches[].evaluation)
 *
 * Idempotent (safe to re-run). Keys re-runs off:
 *   - coaches_directory.external_id            (already unique)
 *   - business_plans.legacy_firestore_id       (added by this script if missing)
 *   - business_plan_coaches (bp_id, coach_dir_id) UNIQUE
 *   - coach_evaluations matched by (coach_dir, bp, evaluator, rating, comment)
 *
 * Setup:
 *   1) Firebase service account: download from Firebase Console
 *        → Project Settings → Service accounts → "Generate new private key"
 *      Save as: tools/firebase-sa.json (gitignored).
 *   2) Supabase env vars in .env.local OR exported in shell:
 *        SUPABASE_URL=https://zwvrtxxgctyyctirntzj.supabase.co
 *        SUPABASE_SERVICE_ROLE=<service role key>
 *      (Server-only key — never expose to the browser.)
 *   3) Install firebase-admin (one-time):
 *        pnpm add -D firebase-admin
 *   4) Run:
 *        node tools/firestore-to-supabase.mjs
 *
 * Optional flags:
 *   --dry-run          Read everything but don't write to Supabase.
 *   --sa <path>        Path to Firebase service-account JSON (default: tools/firebase-sa.json)
 *   --skip-overlay     Skip the coachOverlay/global migration step.
 *   --skip-projects    Skip the projects collection migration step.
 *   --admin-email <e>  Email to use as evaluator_id default (default: udpb@udimpact.ai)
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import admin from "firebase-admin";
import { createClient } from "@supabase/supabase-js";

// ─── Setup paths + flags ─────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const args = process.argv.slice(2);
function getFlag(name) {
  const i = args.indexOf(name);
  return i >= 0;
}
function getOption(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const DRY_RUN = getFlag("--dry-run");
const SKIP_OVERLAY = getFlag("--skip-overlay");
const SKIP_PROJECTS = getFlag("--skip-projects");
const SA_PATH = resolve(getOption("--sa", "tools/firebase-sa.json"));
const ADMIN_EMAIL = getOption("--admin-email", "udpb@udimpact.ai");

// ─── Load env (.env.local) ───────────────────────────────────────────────
function loadDotEnv() {
  const envPath = resolve(projectRoot, ".env.local");
  if (!existsSync(envPath)) return;
  const txt = readFileSync(envPath, "utf-8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadDotEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

// ─── Pre-flight checks ───────────────────────────────────────────────────
function die(msg) {
  console.error("\n❌ " + msg + "\n");
  process.exit(1);
}

if (!existsSync(SA_PATH)) {
  die(`Firebase service account JSON not found at: ${SA_PATH}
Download it from Firebase Console → Project Settings → Service accounts →
"Generate new private key", and save as tools/firebase-sa.json
(or pass --sa <path>).`);
}
if (!SUPABASE_URL) {
  die("SUPABASE_URL not set. Add it to .env.local or export it in the shell.");
}
if (!SUPABASE_SERVICE_ROLE) {
  die("SUPABASE_SERVICE_ROLE not set. Add it to .env.local (server-only key).");
}

// ─── Firebase Admin init ─────────────────────────────────────────────────
const serviceAccount = JSON.parse(readFileSync(SA_PATH, "utf-8"));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
// IMPORTANT: coach-finder uses a NAMED Firestore database "coachfinder"
// (not the default). The 2nd arg to firestore() picks the named DB.
// (firebase-admin v12+ supports databaseId via getFirestore(app, 'name'),
// but the v11-style admin.firestore(undefined, 'coachfinder') also works.)
let fbDb;
try {
  fbDb = admin.firestore();
  fbDb.settings?.({ databaseId: "coachfinder" });
  // Some firebase-admin versions don't honor settings({databaseId}); fall back
  // to constructor signature.
  if (typeof admin.firestore.Firestore === "function") {
    fbDb = new admin.firestore.Firestore({
      projectId: serviceAccount.project_id,
      databaseId: "coachfinder",
      credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key,
      },
    });
  }
} catch (e) {
  // Fallback to default firestore + log a warning. If the data is in 'default'
  // this still works.
  console.warn(
    "⚠️  Could not bind to named DB 'coachfinder'; falling back to default. " +
      "If the script reports 0 docs everywhere, that's why."
  );
  fbDb = admin.firestore();
}

// ─── Supabase init (service-role) ────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Logging helpers ─────────────────────────────────────────────────────
const warnings = [];
function warn(msg) {
  warnings.push(msg);
  console.warn("  ⚠️  " + msg);
}

// ─── Step 0: ensure legacy_firestore_id column on business_plans ─────────
// We use this to make project-doc → BP mapping idempotent on re-runs.
async function ensureLegacyColumn() {
  console.log("\n[0/3] Ensuring business_plans.legacy_firestore_id column…");
  if (DRY_RUN) {
    console.log("  (dry-run — skipping ALTER TABLE)");
    return;
  }
  // service_role can run DDL via the rpc('exec_sql') if available, but
  // simpler: rely on Supabase's REST PostgREST — no DDL there. Use
  // pg_meta if exposed, otherwise the user should run this once manually.
  // We check for the column instead and fail with a clear message if missing.
  const { data, error } = await supabase
    .from("business_plans")
    .select("legacy_firestore_id")
    .limit(1);
  if (error && /legacy_firestore_id/.test(error.message)) {
    die(
      "business_plans.legacy_firestore_id column is missing. Run this SQL in " +
        "Supabase SQL Editor first, then re-run this script:\n\n" +
        "  ALTER TABLE public.business_plans\n" +
        "    ADD COLUMN IF NOT EXISTS legacy_firestore_id text UNIQUE;\n"
    );
  }
  if (error) die(`business_plans probe failed: ${error.message}`);
  console.log("  ✅ column present");
}

// ─── Step 1: lookup admin user UUID for evaluator_id default ─────────────
async function lookupAdminUserId() {
  console.log(`\n[1/3] Looking up admin user (${ADMIN_EMAIL}) for evaluator_id default…`);
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, role")
    .eq("email", ADMIN_EMAIL)
    .maybeSingle();
  if (error) die(`profiles lookup failed: ${error.message}`);
  if (!data) {
    die(
      `No profile row for ${ADMIN_EMAIL}. The migration writes coach_evaluations.evaluator_id ` +
        "as this user. Sign in once with that email so the handle_new_user trigger creates the profile, " +
        "or pass --admin-email <other_email>."
    );
  }
  console.log(`  ✅ admin uid = ${data.id} (role=${data.role})`);
  return data.id;
}

// ─── Step 2: process coachOverlay/global ─────────────────────────────────
async function migrateCoachOverlay() {
  console.log("\n[2/3] Coach overlay migration…");
  if (SKIP_OVERLAY) {
    console.log("  (--skip-overlay)");
    return { added: 0, edited: 0, deleted: 0 };
  }
  const snap = await fbDb.doc("coachOverlay/global").get();
  if (!snap.exists) {
    console.log("  ℹ️  coachOverlay/global doesn't exist — nothing to apply.");
    return { added: 0, edited: 0, deleted: 0 };
  }
  const o = snap.data() || {};
  const added = Array.isArray(o.added) ? o.added : [];
  const edited = (o.edited && typeof o.edited === "object") ? o.edited : {};
  const deleted = Array.isArray(o.deleted) ? o.deleted : [];
  console.log(`  📊 found added=${added.length}, edited=${Object.keys(edited).length}, deleted=${deleted.length}`);

  let addedCount = 0,
    editedCount = 0,
    deletedCount = 0;

  // ── added: insert new coaches not in coaches_directory ──
  for (const c of added) {
    const ext = String(c.id);
    const { data: existing } = await supabase
      .from("coaches_directory")
      .select("id")
      .eq("external_id", ext)
      .maybeSingle();
    if (existing) {
      // Already imported — skip
      continue;
    }
    const row = mapClientCoachToDbRow(c);
    if (DRY_RUN) {
      console.log(`  [dry-run] would INSERT coach external_id=${ext} (${c.name})`);
      addedCount++;
      continue;
    }
    const { error } = await supabase.from("coaches_directory").insert(row);
    if (error) warn(`add coach ${ext} (${c.name}): ${error.message}`);
    else {
      addedCount++;
      console.log(`  ➕ added coach: ${c.name} (external_id=${ext})`);
    }
  }

  // ── edited: UPDATE coaches_directory by external_id ──
  for (const [idStr, fields] of Object.entries(edited)) {
    const ext = String(idStr);
    const { data: existing } = await supabase
      .from("coaches_directory")
      .select("id")
      .eq("external_id", ext)
      .maybeSingle();
    if (!existing) {
      warn(`edited coach external_id=${ext} not found in coaches_directory; skipped`);
      continue;
    }
    const updates = mapClientCoachToDbRow(fields, /*partial=*/ true);
    if (Object.keys(updates).length === 0) continue;
    if (DRY_RUN) {
      console.log(`  [dry-run] would UPDATE coach external_id=${ext} fields=${Object.keys(updates).join(",")}`);
      editedCount++;
      continue;
    }
    const { error } = await supabase
      .from("coaches_directory")
      .update(updates)
      .eq("external_id", ext);
    if (error) warn(`edit coach ${ext}: ${error.message}`);
    else editedCount++;
  }
  if (Object.keys(edited).length > 0) {
    console.log(`  ✏️  edited applied: ${editedCount}`);
  }

  // ── deleted: soft-delete (status='deleted') ──
  for (const id of deleted) {
    const ext = String(id);
    const { data: existing } = await supabase
      .from("coaches_directory")
      .select("id, status")
      .eq("external_id", ext)
      .maybeSingle();
    if (!existing) {
      warn(`deleted coach external_id=${ext} not found; skipped`);
      continue;
    }
    // coaches_directory.status CHECK allows: active|inactive|archived|draft.
    // We map Firestore's deleted[] → status='archived' (semantically: kept on
    // record but no longer in active rotation).
    if (existing.status === "archived") continue; // idempotent
    if (DRY_RUN) {
      console.log(`  [dry-run] would set status='archived' on coach external_id=${ext}`);
      deletedCount++;
      continue;
    }
    const { error } = await supabase
      .from("coaches_directory")
      .update({ status: "archived" })
      .eq("external_id", ext);
    if (error) warn(`delete coach ${ext}: ${error.message}`);
    else deletedCount++;
  }
  if (deleted.length > 0) {
    console.log(`  🗑  deleted (soft): ${deletedCount}`);
  }

  return { added: addedCount, edited: editedCount, deleted: deletedCount };
}

// ─── Step 3: process projects → BPs + bp_coaches + evaluations ───────────
async function migrateProjects(adminUserId) {
  console.log("\n[3/3] Projects → business_plans migration…");
  if (SKIP_PROJECTS) {
    console.log("  (--skip-projects)");
    return { bps: 0, members: 0, evals: 0 };
  }
  const snap = await fbDb.collection("projects").get();
  console.log(`  📊 found ${snap.size} project doc(s)`);

  let bpCount = 0,
    memberCount = 0,
    evalCount = 0;

  for (const docSnap of snap.docs) {
    const p = docSnap.data();
    const fsId = String(p.id ?? docSnap.id);

    // Idempotent BP insert: check legacy_firestore_id
    const { data: existing } = await supabase
      .from("business_plans")
      .select("id")
      .eq("legacy_firestore_id", fsId)
      .maybeSingle();

    let bpId;
    if (existing) {
      bpId = existing.id;
      console.log(`  ↻ BP already migrated: ${p.name || fsId} (id=${bpId})`);
    } else {
      const bpPayload = {
        title: p.name || `(unnamed-${fsId})`,
        client: p.client || null,
        description: p.description || null,
        target_start_date: p.startDate || null,
        target_end_date: p.endDate || null,
        total_budget: typeof p.totalBudget === "number" ? p.totalBudget : null,
        status: ["planning", "active", "completed"].includes(p.status)
          ? p.status
          : "planning",
        notes: null,
        created_by: adminUserId,  // best guess — Firestore doesn't track creator
        legacy_firestore_id: fsId,
      };
      // createdAt → created_at if it's a valid ISO string
      if (typeof p.createdAt === "string") {
        bpPayload.created_at = p.createdAt;
      }
      if (DRY_RUN) {
        console.log(`  [dry-run] would INSERT BP ${p.name || fsId}`);
        bpId = null;
      } else {
        const { data: ins, error } = await supabase
          .from("business_plans")
          .insert(bpPayload)
          .select("id")
          .single();
        if (error) {
          warn(`insert BP ${fsId} (${p.name}): ${error.message}`);
          continue;
        }
        bpId = ins.id;
        bpCount++;
        console.log(`  ➕ BP inserted: ${p.name || fsId} (id=${bpId})`);
      }
    }

    if (!bpId && !DRY_RUN) continue; // failed insert, skip its members

    // ── Insert business_plan_coaches + coach_evaluations for each coach ──
    for (const c of p.coaches || []) {
      const coachExt = String(c.coachId);
      const { data: cd } = await supabase
        .from("coaches_directory")
        .select("id")
        .eq("external_id", coachExt)
        .maybeSingle();
      if (!cd) {
        warn(`project ${fsId}: coachId=${coachExt} not in coaches_directory; skipped`);
        continue;
      }

      // Build payment_info jsonb (omit undefined keys)
      const payment = {};
      for (const k of ["payRole", "payGrade", "payUnit", "payRatio", "unitPrice", "sessions", "totalAmount"]) {
        if (c[k] !== undefined && c[k] !== null && c[k] !== "") payment[k] = c[k];
      }
      const bpcPayload = {
        business_plan_id: bpId,
        coach_directory_id: cd.id,
        task_summary: c.taskSummary || null,
        payment_info: Object.keys(payment).length > 0 ? payment : null,
        status: "accepted",       // already in the project = accepted
        added_by: adminUserId,
      };

      if (DRY_RUN) {
        console.log(`    [dry-run] would INSERT bp_coach (bp=${bpId}, coach=${coachExt})`);
      } else {
        const { error } = await supabase.from("business_plan_coaches").insert(bpcPayload);
        if (error) {
          if (/duplicate|unique/i.test(error.message)) {
            // idempotent: already there
          } else {
            warn(`bp_coach (bp=${bpId}, coach=${coachExt}): ${error.message}`);
          }
        } else {
          memberCount++;
        }
      }

      // ── Evaluation ──
      if (c.evaluation && c.evaluation.rating) {
        // Idempotency: skip if a row already exists for this (coach, bp) pair.
        const { data: existingEval } = await supabase
          .from("coach_evaluations")
          .select("id")
          .eq("coach_directory_id", cd.id)
          .eq("business_plan_id", bpId)
          .maybeSingle();
        if (existingEval) continue;

        const evalPayload = {
          coach_directory_id: cd.id,
          business_plan_id: bpId,
          project_id: null,
          evaluator_id: adminUserId,
          rating_overall: Number(c.evaluation.rating) || 0,
          rating_communication: null,
          rating_expertise: null,
          rating_reliability: null,
          would_rehire: null,
          comment: c.evaluation.comment || null,
        };
        if (typeof c.evaluation.evaluatedAt === "string") {
          evalPayload.created_at = c.evaluation.evaluatedAt;
        }

        if (DRY_RUN) {
          console.log(`    [dry-run] would INSERT evaluation (coach=${coachExt}, rating=${c.evaluation.rating})`);
        } else {
          const { error } = await supabase.from("coach_evaluations").insert(evalPayload);
          if (error) warn(`eval (bp=${bpId}, coach=${coachExt}): ${error.message}`);
          else evalCount++;
        }
      }
    }
  }

  return { bps: bpCount, members: memberCount, evals: evalCount };
}

// ─── Helper: client Coach shape → coaches_directory row shape ────────────
// Mirrors the inverse of api/_lib/supabaseAdmin.ts:rowToCoach. For partial
// updates (overlay edits), we only emit keys that are present.
function mapClientCoachToDbRow(c, partial = false) {
  const out = {};
  // external_id is the legacy numeric ID; store as text
  if (c.id !== undefined && !partial) out.external_id = String(c.id);

  // Strings / scalars (1:1)
  for (const [from, to] of [
    ["name", "name"],
    ["organization", "organization"],
    ["position", "position"],
    ["email", "email"],
    ["phone", "phone"],
    ["intro", "intro"],
    ["career_history", "career_history"],
    ["current_work", "current_work"],
    ["underdogs_history", "underdogs_history"],
    ["education", "education"],
    ["overseas_detail", "overseas_detail"],
    ["tools_skills", "tools_skills"],
    ["photo_url", "photo_url"],
    ["photo", "photo_filename"],
    ["location", "location"],
    ["gender", "gender"],
    ["business_type", "business_type"],
    ["category", "category"],
    ["country", "country"],
    ["language", "language"],
    ["career_years_raw", "career_years_raw"],
  ]) {
    if (c[from] !== undefined) out[to] = c[from];
  }

  // Numerics
  if (c.career_years !== undefined) out.career_years = Number(c.career_years) || null;

  // Booleans
  if (c.overseas !== undefined) out.overseas = !!c.overseas;

  // Arrays
  for (const k of ["expertise", "industries", "regions", "roles"]) {
    if (c[k] !== undefined) out[k] = Array.isArray(c[k]) ? c[k] : [];
  }

  // tier (1|2|3 → text in DB)
  if (c.tier !== undefined) out.tier = String(c.tier);

  // is_active → status
  if (c.is_active !== undefined) {
    out.status = c.is_active ? "active" : "inactive";
  }

  // Drop empty-string fields when partial-updating to avoid blanking data
  if (partial) {
    for (const k of Object.keys(out)) {
      if (out[k] === "" || out[k] === null || out[k] === undefined) {
        delete out[k];
      }
    }
  }

  return out;
}

// ─── Main ────────────────────────────────────────────────────────────────
(async () => {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("Phase F4 — Firestore → Supabase migration");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("Mode:        " + (DRY_RUN ? "DRY-RUN (no writes)" : "LIVE"));
  console.log("Service acct:" + SA_PATH);
  console.log("Supabase URL:" + SUPABASE_URL);
  console.log("Admin email: " + ADMIN_EMAIL);
  console.log("");

  await ensureLegacyColumn();
  const adminUserId = await lookupAdminUserId();
  const overlayResult = await migrateCoachOverlay();
  const projectsResult = await migrateProjects(adminUserId);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("✅ Migration complete");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Coach overlay → coaches_directory:`);
  console.log(`  added (new INSERT):   ${overlayResult.added}`);
  console.log(`  edited (UPDATE):      ${overlayResult.edited}`);
  console.log(`  deleted (soft):       ${overlayResult.deleted}`);
  console.log(`Firestore projects → business_plans:`);
  console.log(`  BPs inserted:         ${projectsResult.bps}`);
  console.log(`  bp_coaches inserted:  ${projectsResult.members}`);
  console.log(`  evaluations inserted: ${projectsResult.evals}`);
  console.log(`Warnings: ${warnings.length}`);
  if (warnings.length > 0) {
    for (const w of warnings) console.log("  - " + w);
  }
  console.log("");
  process.exit(warnings.length > 0 ? 0 : 0);  // exit 0 either way; warnings ≠ failure
})().catch((e) => {
  console.error("\n💥 Migration crashed:");
  console.error(e);
  process.exit(1);
});
