/*
 * Supabase admin client (Vercel serverless / Node runtime).
 * Uses SUPABASE_SERVICE_ROLE — server-only. NEVER import from client/.
 *
 * Phase C1: replaces python-service/coaches_db.json as the source of truth
 * for the coach pool used by coach-finder.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRole =
    process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "SUPABASE_URL is not set. Add it to Vercel env vars (or .env.local for dev).",
    );
  }
  if (!serviceRole) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE is not set. Add it to Vercel env vars (or .env.local for dev). " +
        "This MUST stay server-side — never expose to the browser.",
    );
  }

  cached = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

/**
 * Raw row shape from public.coaches_directory (subset that coach-finder uses).
 * Mirrors columns defined in supabase/migrations/20260423_phase4d_coaches_directory.sql.
 */
export interface CoachDirectoryRow {
  id: string; // uuid
  external_id: string | null; // numeric-as-string (anchor for legacy id)
  name: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  location: string | null;
  country: string | null;
  regions: string[] | null;
  organization: string | null;
  position: string | null;
  industries: string[] | null;
  expertise: string[] | null;
  roles: string[] | null;
  language: string | null;
  overseas: boolean | null;
  overseas_detail: string | null;
  intro: string | null;
  career_history: string | null;
  education: string | null;
  underdogs_history: string | null;
  current_work: string | null;
  tools_skills: string | null;
  career_years: number | null;
  career_years_raw: string | null;
  photo_url: string | null;
  photo_filename: string | null;
  tier: string | null; // stored as text in DB; coerced to number on the client
  category: string | null;
  business_type: string | null;
  status: string;
}

/**
 * Map a Supabase row → the client-side Coach shape (client/src/types/coach.ts).
 *
 * Notes:
 * - `id` (number) on the client comes from `external_id`. The Supabase uuid is
 *   intentionally NOT exposed; the client never needed a uuid before.
 *   When a row has no external_id (admin-created in coaching-log), we fall
 *   back to a hash of the uuid so the React keys stay stable.
 * - `tier` on the client is `1 | 2 | 3`. DB stores text. We coerce.
 * - Array columns may come back as null — normalize to [].
 */
export function rowToCoach(r: CoachDirectoryRow) {
  const numericId =
    r.external_id != null && /^\d+$/.test(r.external_id)
      ? Number(r.external_id)
      : hashUuidToInt(r.id);

  const tierNum = parseTier(r.tier);

  return {
    id: numericId,
    name: r.name ?? "",
    organization: r.organization ?? "",
    position: r.position ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    intro: r.intro ?? "",
    expertise: r.expertise ?? [],
    industries: r.industries ?? [],
    regions: r.regions ?? [],
    roles: r.roles ?? [],
    career_years: r.career_years ?? 0,
    career_years_raw: r.career_years_raw ?? "",
    career_history: r.career_history ?? "",
    current_work: r.current_work ?? "",
    underdogs_history: r.underdogs_history ?? "",
    education: r.education ?? "",
    overseas: !!r.overseas,
    overseas_detail: r.overseas_detail ?? "",
    tools_skills: r.tools_skills ?? "",
    photo_url: r.photo_url ?? "",
    photo: r.photo_filename ?? undefined,
    location: r.location ?? undefined,
    gender: r.gender ?? undefined,
    business_type: r.business_type ?? undefined,
    tier: tierNum,
    category: r.category ?? "",
    country: r.country ?? "",
    language: r.language ?? "",
    is_active: r.status === "active",
  };
}

function parseTier(t: string | null): 1 | 2 | 3 {
  if (!t) return 3;
  const n = Number(t);
  if (n === 1 || n === 2 || n === 3) return n;
  // Letter tiers (S/A/B/C) — map roughly: S→1, A→2, B/C/...→3
  const upper = t.trim().toUpperCase();
  if (upper === "S") return 1;
  if (upper === "A") return 2;
  return 3;
}

function hashUuidToInt(uuid: string): number {
  // Stable but cheap. Used only as a React key fallback.
  let h = 0;
  for (let i = 0; i < uuid.length; i++) {
    h = (h * 31 + uuid.charCodeAt(i)) | 0;
  }
  // Push into a high range so it never collides with a real external_id (1..~1000).
  return 1_000_000_000 + Math.abs(h);
}

/**
 * Columns we actually need on the client. Keeps payload size down vs `select(*)`.
 * Every field here must exist in the SELECT list of the /api/coaches handler.
 */
export const COACH_SELECT_COLUMNS = [
  "id",
  "external_id",
  "name",
  "email",
  "phone",
  "gender",
  "location",
  "country",
  "regions",
  "organization",
  "position",
  "industries",
  "expertise",
  "roles",
  "language",
  "overseas",
  "overseas_detail",
  "intro",
  "career_history",
  "education",
  "underdogs_history",
  "current_work",
  "tools_skills",
  "career_years",
  "career_years_raw",
  "photo_url",
  "photo_filename",
  "tier",
  "category",
  "business_type",
  "status",
].join(",");
