/*
 * GET /api/coaches
 *
 * Phase C1: returns the active coach pool from Supabase
 * (public.coaches_directory). This replaces the static
 * client/src/data/coaches_db.json and python-service/coaches_db.json
 * import as the coach-data source for coach-finder.
 *
 * Why server-side (option b)?
 *   coaches_directory has RLS `cd_read_authenticated` (only `authenticated`
 *   role can SELECT). coach-finder still uses Firebase Auth (Phase C4 will
 *   migrate to Supabase Auth), so the browser has no Supabase session and
 *   the anon role would get 0 rows. Until C4, we proxy the read using
 *   SUPABASE_SERVICE_ROLE on the server. This also keeps the contact info
 *   (email/phone) of every coach off the wire to anonymous clients.
 *
 * Runtime: Node (default for .ts files in /api on Vercel). Edge would also
 * work since @supabase/supabase-js v2 is fetch-based, but Node keeps env
 * parity with the dev Express middleware in server/index.ts.
 */
// NOTE: We intentionally don't import `@vercel/node` types — we don't want
// to add another dev-dep just for one handler. The structural shape below
// matches what Vercel passes in at runtime (and what Express provides in
// dev via server/index.ts).
import {
  COACH_SELECT_COLUMNS,
  getSupabaseAdmin,
  rowToCoach,
  type CoachDirectoryRow,
} from "./_lib/supabaseAdmin";

interface ReqLike {
  method?: string;
}
interface ResLike {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => ResLike;
  json: (body: unknown) => void;
}

export default async function handler(req: ReqLike, res: ResLike) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();

    // Mirror current JSON behaviour: only show active coaches.
    // (Inactive / archived rows live in the DB but aren't shown in the
    // coach-finder UI by default — same as before.)
    const { data, error } = await supabase
      .from("coaches_directory")
      .select(COACH_SELECT_COLUMNS)
      .eq("status", "active")
      .order("name", { ascending: true });

    if (error) {
      console.error("[/api/coaches] supabase error:", error);
      res.status(500).json({ error: error.message });
      return;
    }

    const coaches = (data ?? []).map((row) =>
      rowToCoach(row as unknown as CoachDirectoryRow),
    );

    // Cache on Vercel's edge: re-fetch at most every 60s, serve stale for 5min
    // while revalidating. The directory rarely changes from the user's POV.
    res.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    );
    res.status(200).json({ coaches });
  } catch (err: any) {
    console.error("[/api/coaches] unexpected error:", err);
    res.status(500).json({ error: err?.message ?? "Internal error" });
  }
}
