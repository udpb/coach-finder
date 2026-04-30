/*
 * CoachDataContext — coach pool from Supabase coaches_directory.
 *
 * Phase F1 (2026-04-30, Firebase 0%): the Firestore `coachOverlay/global`
 * doc is gone. coaches_directory is the single source of truth.
 *   - Reads still come through `GET /api/coaches` (server-side service_role
 *     so the unauthenticated landing page can render). On network failure
 *     we fall back to the bundled JSON snapshot.
 *   - Mutations (addCoach / updateCoach / deleteCoach) go straight to
 *     coaches_directory via the browser Supabase client. RLS enforces
 *     admin-only writes; UI consumers gate on `useAuth().isAdmin` first.
 *   - After every mutation we re-fetch /api/coaches so the local cache
 *     reflects the canonical row (avoids stale optimistic UI — same
 *     audit lesson that bit coaching-log).
 *   - `resetCustomData` and `customDataStats` are deprecated stubs kept
 *     for API back-compat with callers that haven't been updated yet.
 *
 * Audit lessons applied:
 *   - No `supabaseAvailable`-style lazy-init flag (Bug A). The browser
 *     supabase client is either present or null (env missing) and we
 *     check that explicitly inside each mutation.
 *   - No new auth listeners (Bug B is AuthContext's job).
 *   - All array fields normalized to text[] (empty → null acceptable).
 *   - Typed Supabase `from()` returns; no `any`.
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type { Coach } from "@/types/coach";
import coachesFallback from "@/data/coaches_db.json";
import { supabase } from "@/lib/supabaseBrowser";

interface CoachDataContextType {
  allCoaches: Coach[];
  addCoach: (coach: Omit<Coach, "id">) => void;
  updateCoach: (id: number, updates: Partial<Coach>) => void;
  deleteCoach: (id: number) => void;
  /** Deprecated: overlay is gone. Kept as a no-op for API back-compat. */
  resetCustomData: () => void;
  /** Deprecated: always {0,0,0} now. Kept for back-compat. */
  customDataStats: { added: number; edited: number; deleted: number };
  loading: boolean;
  source: "supabase" | "fallback-json" | "loading";
}

const CoachDataContext = createContext<CoachDataContextType>({
  allCoaches: [],
  addCoach: () => {},
  updateCoach: () => {},
  deleteCoach: () => {},
  resetCustomData: () => {},
  customDataStats: { added: 0, edited: 0, deleted: 0 },
  loading: true,
  source: "loading",
});

const fallbackCoaches = coachesFallback as Coach[];

/**
 * Build a coaches_directory write payload from a partial Coach.
 *
 * - Omits keys that are `undefined` so partial updates don't blank fields.
 * - Maps client-side names to DB column names (`photo`→`photo_filename`,
 *   `is_active`→`status`, numeric `tier`→ stringified text).
 * - Arrays pass through 1:1; empty arrays are kept (DB column has
 *   `NOT NULL DEFAULT '{}'` so this is fine).
 */
function buildDirectoryPayload(
  patch: Partial<Coach>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  // 1:1 string / number / boolean fields
  const passthroughKeys: Array<keyof Coach> = [
    "name",
    "email",
    "phone",
    "intro",
    "organization",
    "position",
    "gender",
    "location",
    "country",
    "language",
    "business_type",
    "category",
    "career_history",
    "current_work",
    "underdogs_history",
    "education",
    "tools_skills",
    "overseas_detail",
    "career_years_raw",
    "photo_url",
    "career_years",
    "overseas",
  ];
  for (const k of passthroughKeys) {
    if (patch[k] !== undefined) out[k as string] = patch[k];
  }

  // Array fields
  const arrayKeys: Array<keyof Coach> = [
    "expertise",
    "industries",
    "regions",
    "roles",
  ];
  for (const k of arrayKeys) {
    if (patch[k] !== undefined) out[k as string] = patch[k];
  }

  // Renamed fields
  if (patch.photo !== undefined) out.photo_filename = patch.photo;

  // Numeric tier (1|2|3) on the client → stringified on the DB.
  if (patch.tier !== undefined) out.tier = String(patch.tier);

  // is_active is a derived column on the client; map to status active/inactive.
  if (patch.is_active !== undefined) {
    out.status = patch.is_active ? "active" : "inactive";
  }

  return out;
}

export function CoachDataProvider({ children }: { children: ReactNode }) {
  const [baseCoaches, setBaseCoaches] = useState<Coach[]>([]);
  const [source, setSource] = useState<CoachDataContextType["source"]>("loading");
  const [loading, setLoading] = useState(true);

  // Track latest base list synchronously so addCoach can compute next id
  // without depending on stale closure values.
  const baseCoachesRef = useRef<Coach[]>([]);
  useEffect(() => {
    baseCoachesRef.current = baseCoaches;
  }, [baseCoaches]);

  // Pull the coach pool from /api/coaches. Falls back to bundled JSON
  // on network/HTTP failure (offline safety net).
  const fetchCoaches = useCallback(async () => {
    try {
      const res = await fetch("/api/coaches", {
        headers: { Accept: "application/json" },
        // bust the s-maxage cache after a write; harmless on initial load
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { coaches: Coach[] };
      if (!Array.isArray(body.coaches) || body.coaches.length === 0) {
        throw new Error("empty coach list");
      }
      setBaseCoaches(body.coaches);
      setSource("supabase");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        "[CoachDataContext] /api/coaches fetch failed, falling back to bundled JSON:",
        err,
      );
      setBaseCoaches(fallbackCoaches);
      setSource("fallback-json");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCoaches();
  }, [fetchCoaches]);

  // ─── Mutations ─────────────────────────────────────────────────────────
  // RLS is the ground truth. We don't repeat the role check here; the UI
  // gates these calls on `useAuth().isAdmin` and the DB rejects writes from
  // anyone else.

  const addCoach = useCallback(
    (coachData: Omit<Coach, "id">) => {
      void (async () => {
        if (!supabase) {
          // eslint-disable-next-line no-console
          console.warn("[CoachDataContext] addCoach: supabase not configured");
          return;
        }
        const existing = baseCoachesRef.current;
        const maxId = existing.reduce((m, c) => (c.id > m ? c.id : m), 0);
        const newId = maxId + 1;

        const payload: Record<string, unknown> = {
          ...buildDirectoryPayload(coachData),
          external_id: String(newId),
          // Default to active when adding (the dropdown may set is_active too;
          // buildDirectoryPayload will overwrite this in that case).
          ...(coachData.is_active === undefined ? { status: "active" } : {}),
        };

        const { error } = await supabase
          .from("coaches_directory")
          .insert(payload);

        if (error) {
          // eslint-disable-next-line no-console
          console.error("[CoachDataContext] addCoach failed:", error);
          return;
        }
        await fetchCoaches();
      })();
    },
    [fetchCoaches],
  );

  const updateCoach = useCallback(
    (id: number, updates: Partial<Coach>) => {
      void (async () => {
        if (!supabase) {
          // eslint-disable-next-line no-console
          console.warn("[CoachDataContext] updateCoach: supabase not configured");
          return;
        }
        const payload = buildDirectoryPayload(updates);
        if (Object.keys(payload).length === 0) return;

        const { error } = await supabase
          .from("coaches_directory")
          .update(payload)
          .eq("external_id", String(id));

        if (error) {
          // eslint-disable-next-line no-console
          console.error("[CoachDataContext] updateCoach failed:", error);
          return;
        }
        await fetchCoaches();
      })();
    },
    [fetchCoaches],
  );

  const deleteCoach = useCallback(
    (id: number) => {
      void (async () => {
        if (!supabase) {
          // eslint-disable-next-line no-console
          console.warn("[CoachDataContext] deleteCoach: supabase not configured");
          return;
        }
        // Soft-delete: matches the old Firestore overlay-delete semantics
        // (rows hidden in the UI but recoverable).
        const { error } = await supabase
          .from("coaches_directory")
          .update({ status: "archived" })
          .eq("external_id", String(id));

        if (error) {
          // eslint-disable-next-line no-console
          console.error("[CoachDataContext] deleteCoach failed:", error);
          return;
        }
        await fetchCoaches();
      })();
    },
    [fetchCoaches],
  );

  // Deprecated stubs — overlay concept is gone, but consumers still import
  // these names, so we keep the exports compiling.
  const resetCustomData = useCallback(() => {
    /* no-op: Phase F1 removed the Firestore overlay */
  }, []);
  const customDataStats = { added: 0, edited: 0, deleted: 0 };

  return (
    <CoachDataContext.Provider
      value={{
        allCoaches: baseCoaches,
        addCoach,
        updateCoach,
        deleteCoach,
        resetCustomData,
        customDataStats,
        loading,
        source,
      }}
    >
      {children}
    </CoachDataContext.Provider>
  );
}

export function useCoachData() {
  return useContext(CoachDataContext);
}
