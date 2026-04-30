/*
 * ProjectContext — projects (= business plans) backed by Supabase.
 *
 * Phase F3 (2026-04-30, Firebase 0%): Firestore `projects` collection is
 * gone. We persist via the BP triple shared with coaching-log:
 *   - business_plans          ← one row per Project
 *   - business_plan_coaches   ← Project.coaches[] entries
 *   - coach_evaluations       ← Project.coaches[].evaluation (when set)
 *
 * Schema additions in Phase F2 (already applied to the database) make this
 * mapping clean:
 *   - business_plan_coaches.payment_info jsonb   (coach-finder pay fields)
 *   - business_plan_coaches.task_summary text
 *   - business_plans.client text
 *   - business_plans.total_budget numeric
 *   - business_plans.status CHECK includes 'planning'|'active'|'completed'
 *   - business_plans.legacy_firestore_id text (UNIQUE; populated by migration)
 *
 * ID handling:
 *   The client's Project.id is `number` (legacy from Date.now()-based
 *   Firestore ids); the DB key is uuid. We keep two in-memory maps for the
 *   lifetime of the provider:
 *     - clientIdToUuid : number -> string
 *     - uuidToClientId : string -> number
 *   Rules:
 *     - For BPs that were imported from Firestore, `legacy_firestore_id`
 *       is the original numeric Date.now() id as text — we use it directly.
 *     - For BPs without a legacy id, we derive a stable client id from
 *       the uuid (hash). The number is opaque; we never write it back.
 *     - For new projects created in this app, we generate the BP via
 *       `crypto.randomUUID()`, INSERT, then mint a fresh numeric id
 *       (Date.now() + counter) and stash both in the maps.
 *   The numeric id never round-trips to the database.
 *
 * Audit lessons applied (do NOT regress):
 *   - No `supabaseAvailable` lazy-init flag (Bug A). Each mutation checks
 *     supabase / currentUser explicitly.
 *   - No new auth listeners (Bug B is AuthContext's job).
 *   - After every mutation we re-fetch (small dataset; no realtime).
 *   - No `any`; row shapes are narrowly typed.
 *   - Permission gating layered: UI hide → light function-entry check → RLS.
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
import type {
  Project,
  ProjectCoach,
  ProjectCoachEvaluation,
  ProjectStatus,
} from "@/types/project";
import { supabase } from "@/lib/supabaseBrowser";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ─────────────────────────────────────────────────────────────

interface CoachPayment {
  payRole?: string;
  payGrade?: string;
  payUnit?: string;
  payRatio?: number;
  unitPrice?: number;
  sessions?: number;
  totalAmount?: number;
}

interface ProjectContextType {
  projects: Project[];
  loading: boolean;
  addProject: (p: Omit<Project, "id" | "createdAt" | "coaches">) => Promise<void>;
  updateProject: (
    id: number,
    updates: Partial<Omit<Project, "id" | "coaches">>,
  ) => Promise<void>;
  deleteProject: (id: number) => Promise<void>;
  addCoachToProject: (
    projectId: number,
    coach: Omit<ProjectCoach, "evaluation">,
  ) => Promise<void>;
  removeCoachFromProject: (projectId: number, coachId: number) => Promise<void>;
  updateCoachTask: (
    projectId: number,
    coachId: number,
    taskSummary: string,
  ) => Promise<void>;
  updateCoachPayment: (
    projectId: number,
    coachId: number,
    payment: CoachPayment,
  ) => Promise<void>;
  saveEvaluation: (
    projectId: number,
    coachId: number,
    evaluation: ProjectCoachEvaluation,
  ) => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

// ─── DB row shapes (narrow, hand-typed — keeps `any` out) ─────────────

interface BPRow {
  id: string;
  title: string;
  client: string | null;
  description: string | null;
  status: string;
  target_start_date: string | null;
  target_end_date: string | null;
  total_budget: number | null;
  legacy_firestore_id: string | null;
  created_at: string;
}

interface BPCoachRow {
  id: string;
  business_plan_id: string;
  coach_directory_id: string;
  task_summary: string | null;
  payment_info: CoachPayment | null;
  status: string;
  added_at: string;
}

interface CoachDirSlim {
  id: string;
  external_id: string | null;
  name: string | null;
  category: string | null;
  tier: string | null;
}

// Row from the join SELECT (what nested-select returns).
interface BPCoachRowJoined extends BPCoachRow {
  coaches_directory: CoachDirSlim | null;
}

interface CoachEvalRow {
  id: string;
  coach_directory_id: string;
  business_plan_id: string | null;
  evaluator_id: string;
  rating_overall: number | null;
  comment: string | null;
  created_at: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function hashUuidToInt(uuid: string): number {
  let h = 0;
  for (let i = 0; i < uuid.length; i++) {
    h = (h * 31 + uuid.charCodeAt(i)) | 0;
  }
  // High range so it can't collide with Date.now()-based legacy ids.
  return 1_000_000_000 + Math.abs(h);
}

function parseTier(t: string | null): number {
  if (!t) return 3;
  const n = Number(t);
  if (n === 1 || n === 2 || n === 3) return n;
  const u = t.trim().toUpperCase();
  if (u === "S") return 1;
  if (u === "A") return 2;
  return 3;
}

function isProjectStatus(s: string): s is ProjectStatus {
  return s === "planning" || s === "active" || s === "completed";
}

function normalizeStatus(s: string): ProjectStatus {
  // BPs created in coaching-log might have draft/proposed/won/etc. We map
  // those onto coach-finder's three states so the UI doesn't choke:
  //   draft / proposed → planning
  //   won              → active
  //   lost / cancelled → completed (closed-out)
  if (isProjectStatus(s)) return s;
  if (s === "draft" || s === "proposed") return "planning";
  if (s === "won") return "active";
  return "completed";
}

/** Strip undefined values from an object so partial updates don't blank fields. */
function stripUndef<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o)) {
    if (o[k] !== undefined) out[k] = o[k];
  }
  return out as Partial<T>;
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { currentUser, isAdmin, role, isAuthReady } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Stable id <-> uuid maps. Refs (not state) because nothing rerenders on
  // them — they're only consulted inside mutation handlers.
  const clientIdToUuidRef = useRef<Map<number, string>>(new Map());
  const uuidToClientIdRef = useRef<Map<string, number>>(new Map());

  // Counter for new-id generation — guarantees uniqueness within a session
  // even if someone creates two BPs in the same millisecond.
  const newIdCounterRef = useRef<number>(0);

  // Resolve a coach_directory uuid from a client-side numeric coach id
  // (which is `external_id` cast to number). Cached per session.
  const coachIdCacheRef = useRef<Map<number, string>>(new Map());

  const resolveCoachUuid = useCallback(
    async (coachId: number): Promise<string | null> => {
      const cached = coachIdCacheRef.current.get(coachId);
      if (cached) return cached;
      if (!supabase) return null;
      const { data, error } = await supabase
        .from("coaches_directory")
        .select("id")
        .eq("external_id", String(coachId))
        .maybeSingle();
      if (error || !data) {
        // eslint-disable-next-line no-console
        console.warn(
          `[ProjectContext] resolveCoachUuid(${coachId}) failed:`,
          error,
        );
        return null;
      }
      const row = data as { id: string };
      coachIdCacheRef.current.set(coachId, row.id);
      return row.id;
    },
    [],
  );

  // Choose the client-facing numeric id for a BP row.
  // Priority: legacy_firestore_id (if numeric) > existing map entry > hashed uuid.
  // Persist the mapping so subsequent fetches return the same number.
  const clientIdForBP = useCallback((row: BPRow): number => {
    const existing = uuidToClientIdRef.current.get(row.id);
    if (existing != null) return existing;

    let id: number;
    if (row.legacy_firestore_id && /^\d+$/.test(row.legacy_firestore_id)) {
      id = Number(row.legacy_firestore_id);
    } else {
      id = hashUuidToInt(row.id);
    }

    clientIdToUuidRef.current.set(id, row.id);
    uuidToClientIdRef.current.set(row.id, id);
    return id;
  }, []);

  // Single fetch: BPs + their pinned coaches + evaluations, joined when
  // possible, falling back to two-step on relationship-inference miss.
  const fetchProjects = useCallback(async () => {
    if (!supabase) {
      setProjects([]);
      setLoading(false);
      return;
    }
    if (!currentUser) {
      // RLS on business_plans requires authenticated. Leave projects empty
      // until we have a session; the auth listener will trigger another
      // fetch via the useEffect below.
      setProjects([]);
      setLoading(false);
      return;
    }

    try {
      // ── BPs ──
      const { data: bpData, error: bpErr } = await supabase
        .from("business_plans")
        .select(
          "id, title, client, description, status, target_start_date, target_end_date, total_budget, legacy_firestore_id, created_at",
        )
        .order("created_at", { ascending: false });
      if (bpErr) throw bpErr;
      const bps = (bpData ?? []) as BPRow[];
      if (bps.length === 0) {
        setProjects([]);
        setLoading(false);
        return;
      }
      const bpIds = bps.map((b) => b.id);

      // ── BP coaches (with embedded coach_directory) ──
      let bpCoaches: BPCoachRowJoined[] = [];
      const { data: bpcData, error: bpcErr } = await supabase
        .from("business_plan_coaches")
        .select(
          "id, business_plan_id, coach_directory_id, task_summary, payment_info, status, added_at, coaches_directory:coach_directory_id(id, external_id, name, category, tier)",
        )
        .in("business_plan_id", bpIds)
        .order("added_at", { ascending: true });

      if (bpcErr) {
        // Fall back to two-step fetch if the join fails (relationship not
        // auto-detected, etc.). Mirrors the pattern in coaching-log.
        // eslint-disable-next-line no-console
        console.warn(
          "[ProjectContext] bp_coaches join failed; falling back to two-step",
          bpcErr,
        );
        const { data: rawBpc } = await supabase
          .from("business_plan_coaches")
          .select(
            "id, business_plan_id, coach_directory_id, task_summary, payment_info, status, added_at",
          )
          .in("business_plan_id", bpIds);
        const rawRows = (rawBpc ?? []) as BPCoachRow[];
        const cdIds = Array.from(
          new Set(rawRows.map((r) => r.coach_directory_id)),
        );
        let dirs: CoachDirSlim[] = [];
        if (cdIds.length > 0) {
          const { data: dirData } = await supabase
            .from("coaches_directory")
            .select("id, external_id, name, category, tier")
            .in("id", cdIds);
          dirs = (dirData ?? []) as CoachDirSlim[];
        }
        const dirById = new Map(dirs.map((d) => [d.id, d]));
        bpCoaches = rawRows.map((r) => ({
          ...r,
          coaches_directory: dirById.get(r.coach_directory_id) ?? null,
        }));
      } else {
        bpCoaches = (bpcData ?? []) as unknown as BPCoachRowJoined[];
      }

      // ── Evaluations ──
      // One eval per (coach, BP) is the model coach-finder uses; if multiple
      // exist, we keep the most recent (sorted DESC).
      const { data: evalData, error: evalErr } = await supabase
        .from("coach_evaluations")
        .select(
          "id, coach_directory_id, business_plan_id, evaluator_id, rating_overall, comment, created_at",
        )
        .in("business_plan_id", bpIds)
        .order("created_at", { ascending: false });
      // Eval read may fail under RLS (e.g. if coach_evaluations_select tightens
      // to admin/pm only — currently it does). Treat errors as "no evals"
      // rather than blowing up the whole project list.
      let evals: CoachEvalRow[] = [];
      if (evalErr) {
        // eslint-disable-next-line no-console
        console.warn("[ProjectContext] coach_evaluations read failed:", evalErr);
      } else {
        evals = (evalData ?? []) as CoachEvalRow[];
      }

      // ── Build Project[] ──
      // Group bp_coaches and evals by business_plan_id for O(n) assembly.
      const coachesByBp = new Map<string, BPCoachRowJoined[]>();
      for (const r of bpCoaches) {
        const arr = coachesByBp.get(r.business_plan_id);
        if (arr) arr.push(r);
        else coachesByBp.set(r.business_plan_id, [r]);
      }

      // Latest eval per (bp, coach_dir) pair.
      const latestEval = new Map<string, CoachEvalRow>();
      for (const e of evals) {
        if (!e.business_plan_id) continue;
        const key = `${e.business_plan_id}::${e.coach_directory_id}`;
        if (!latestEval.has(key)) latestEval.set(key, e); // sort DESC means first wins
      }

      const built: Project[] = bps.map((bp) => {
        const clientId = clientIdForBP(bp);
        const pinned = coachesByBp.get(bp.id) ?? [];
        const coachList: ProjectCoach[] = pinned.map((p) => {
          const dir = p.coaches_directory;
          const dirExternal =
            dir?.external_id != null && /^\d+$/.test(dir.external_id)
              ? Number(dir.external_id)
              : dir
                ? hashUuidToInt(dir.id)
                : 0;
          // Cache the directory uuid so future mutations skip the lookup.
          if (dir) coachIdCacheRef.current.set(dirExternal, dir.id);

          const pay = p.payment_info ?? {};
          const evRow = latestEval.get(`${bp.id}::${p.coach_directory_id}`);
          const evaluation: ProjectCoachEvaluation | undefined =
            evRow && evRow.rating_overall != null
              ? {
                  rating: Math.min(
                    5,
                    Math.max(1, evRow.rating_overall),
                  ) as 1 | 2 | 3 | 4 | 5,
                  comment: evRow.comment ?? "",
                  evaluatedAt: evRow.created_at,
                }
              : undefined;

          return {
            coachId: dirExternal,
            coachName: dir?.name ?? "",
            coachTier: parseTier(dir?.tier ?? null),
            coachCategory: dir?.category ?? "",
            taskSummary: p.task_summary ?? "",
            payRole: pay.payRole,
            payGrade: pay.payGrade,
            payUnit: pay.payUnit,
            payRatio: pay.payRatio,
            unitPrice: pay.unitPrice,
            sessions: pay.sessions,
            totalAmount: pay.totalAmount,
            evaluation,
          };
        });

        return {
          id: clientId,
          name: bp.title,
          client: bp.client ?? undefined,
          description: bp.description ?? undefined,
          startDate: bp.target_start_date ?? undefined,
          endDate: bp.target_end_date ?? undefined,
          status: normalizeStatus(bp.status),
          createdAt: bp.created_at,
          totalBudget: bp.total_budget ?? undefined,
          coaches: coachList,
        };
      });

      setProjects(built);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[ProjectContext] fetchProjects failed:", e);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser, clientIdForBP]);

  // Re-fetch when auth becomes ready / user changes.
  useEffect(() => {
    if (!isAuthReady) return;
    void fetchProjects();
  }, [isAuthReady, currentUser, fetchProjects]);

  // ─── Permission gate (light; RLS is the truth) ────────────────────────
  const canMutate = useCallback(() => {
    return isAdmin || role === "pm";
  }, [isAdmin, role]);

  // ─── Mutations ────────────────────────────────────────────────────────

  const addProject = useCallback(
    async (p: Omit<Project, "id" | "createdAt" | "coaches">) => {
      if (!supabase || !currentUser || !canMutate()) return;
      const newUuid = crypto.randomUUID();
      const payload = stripUndef({
        id: newUuid,
        title: p.name,
        client: p.client,
        description: p.description,
        status: p.status,
        target_start_date: p.startDate,
        target_end_date: p.endDate,
        total_budget: p.totalBudget,
        created_by: currentUser.id,
      });

      const { error } = await supabase.from("business_plans").insert(payload);
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[ProjectContext] addProject failed:", error);
        return;
      }

      // Mint and stash the client id eagerly so a follow-up call (in the
      // same session, before the refetch lands) can resolve it.
      newIdCounterRef.current += 1;
      const newClientId = Date.now() + newIdCounterRef.current;
      clientIdToUuidRef.current.set(newClientId, newUuid);
      uuidToClientIdRef.current.set(newUuid, newClientId);

      await fetchProjects();
    },
    [currentUser, canMutate, fetchProjects],
  );

  const updateProject = useCallback(
    async (
      id: number,
      updates: Partial<Omit<Project, "id" | "coaches">>,
    ) => {
      if (!supabase || !canMutate()) return;
      const uuid = clientIdToUuidRef.current.get(id);
      if (!uuid) {
        // eslint-disable-next-line no-console
        console.warn(`[ProjectContext] updateProject: unknown id ${id}`);
        return;
      }
      const payload = stripUndef({
        title: updates.name,
        client: updates.client,
        description: updates.description,
        status: updates.status,
        target_start_date: updates.startDate,
        target_end_date: updates.endDate,
        total_budget: updates.totalBudget,
      });
      if (Object.keys(payload).length === 0) return;

      const { error } = await supabase
        .from("business_plans")
        .update(payload)
        .eq("id", uuid);
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[ProjectContext] updateProject failed:", error);
        return;
      }
      await fetchProjects();
    },
    [canMutate, fetchProjects],
  );

  const deleteProject = useCallback(
    async (id: number) => {
      if (!supabase || !canMutate()) return;
      const uuid = clientIdToUuidRef.current.get(id);
      if (!uuid) return;
      const { error } = await supabase
        .from("business_plans")
        .delete()
        .eq("id", uuid);
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[ProjectContext] deleteProject failed:", error);
        return;
      }
      // Drop the maps so a future BP can reuse the slot if needed.
      clientIdToUuidRef.current.delete(id);
      uuidToClientIdRef.current.delete(uuid);
      await fetchProjects();
    },
    [canMutate, fetchProjects],
  );

  const addCoachToProject = useCallback(
    async (projectId: number, coach: Omit<ProjectCoach, "evaluation">) => {
      if (!supabase || !currentUser || !canMutate()) return;
      const bpUuid = clientIdToUuidRef.current.get(projectId);
      if (!bpUuid) return;
      const coachUuid = await resolveCoachUuid(coach.coachId);
      if (!coachUuid) {
        // eslint-disable-next-line no-console
        console.warn(
          `[ProjectContext] addCoachToProject: no coach uuid for ${coach.coachId}`,
        );
        return;
      }

      const payment: CoachPayment = stripUndef({
        payRole: coach.payRole,
        payGrade: coach.payGrade,
        payUnit: coach.payUnit,
        payRatio: coach.payRatio,
        unitPrice: coach.unitPrice,
        sessions: coach.sessions,
        totalAmount: coach.totalAmount,
      }) as CoachPayment;

      const payload = {
        business_plan_id: bpUuid,
        coach_directory_id: coachUuid,
        task_summary: coach.taskSummary || null,
        // Pinning a coach in coach-finder = "accepted" in the BP taxonomy.
        status: "accepted",
        added_by: currentUser.id,
        payment_info: Object.keys(payment).length > 0 ? payment : null,
      };

      const { error } = await supabase
        .from("business_plan_coaches")
        .insert(payload);
      if (error) {
        if (/duplicate|unique/i.test(error.message)) {
          // Already pinned. Treat as a no-op (matches Firestore's "no double
          // entry" check that lived in the old context).
          return;
        }
        // eslint-disable-next-line no-console
        console.error("[ProjectContext] addCoachToProject failed:", error);
        return;
      }
      await fetchProjects();
    },
    [currentUser, canMutate, resolveCoachUuid, fetchProjects],
  );

  const removeCoachFromProject = useCallback(
    async (projectId: number, coachId: number) => {
      if (!supabase || !canMutate()) return;
      const bpUuid = clientIdToUuidRef.current.get(projectId);
      if (!bpUuid) return;
      const coachUuid = await resolveCoachUuid(coachId);
      if (!coachUuid) return;
      const { error } = await supabase
        .from("business_plan_coaches")
        .delete()
        .eq("business_plan_id", bpUuid)
        .eq("coach_directory_id", coachUuid);
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[ProjectContext] removeCoachFromProject failed:", error);
        return;
      }
      await fetchProjects();
    },
    [canMutate, resolveCoachUuid, fetchProjects],
  );

  const updateCoachTask = useCallback(
    async (projectId: number, coachId: number, taskSummary: string) => {
      if (!supabase || !canMutate()) return;
      const bpUuid = clientIdToUuidRef.current.get(projectId);
      if (!bpUuid) return;
      const coachUuid = await resolveCoachUuid(coachId);
      if (!coachUuid) return;
      const { error } = await supabase
        .from("business_plan_coaches")
        .update({ task_summary: taskSummary })
        .eq("business_plan_id", bpUuid)
        .eq("coach_directory_id", coachUuid);
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[ProjectContext] updateCoachTask failed:", error);
        return;
      }
      await fetchProjects();
    },
    [canMutate, resolveCoachUuid, fetchProjects],
  );

  const updateCoachPayment = useCallback(
    async (projectId: number, coachId: number, payment: CoachPayment) => {
      if (!supabase || !canMutate()) return;
      const bpUuid = clientIdToUuidRef.current.get(projectId);
      if (!bpUuid) return;
      const coachUuid = await resolveCoachUuid(coachId);
      if (!coachUuid) return;

      // Read current payment_info so this is a true patch (mirrors the old
      // Firestore behavior: the previous code merged keys onto the row).
      const { data: current, error: readErr } = await supabase
        .from("business_plan_coaches")
        .select("payment_info")
        .eq("business_plan_id", bpUuid)
        .eq("coach_directory_id", coachUuid)
        .maybeSingle();
      if (readErr) {
        // eslint-disable-next-line no-console
        console.warn(
          "[ProjectContext] updateCoachPayment: read failed:",
          readErr,
        );
      }
      const merged: CoachPayment = {
        ...((current?.payment_info as CoachPayment | null) ?? {}),
        ...stripUndef(payment as Record<string, unknown>),
      };

      const { error } = await supabase
        .from("business_plan_coaches")
        .update({ payment_info: merged })
        .eq("business_plan_id", bpUuid)
        .eq("coach_directory_id", coachUuid);
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[ProjectContext] updateCoachPayment failed:", error);
        return;
      }
      await fetchProjects();
    },
    [canMutate, resolveCoachUuid, fetchProjects],
  );

  const saveEvaluation = useCallback(
    async (
      projectId: number,
      coachId: number,
      evaluation: ProjectCoachEvaluation,
    ) => {
      if (!supabase || !currentUser || !canMutate()) return;
      const bpUuid = clientIdToUuidRef.current.get(projectId);
      if (!bpUuid) return;
      const coachUuid = await resolveCoachUuid(coachId);
      if (!coachUuid) return;

      // UPSERT semantics — one eval per (coach, bp). Look first; insert or
      // update accordingly. (We don't use ON CONFLICT here because the table
      // doesn't have a unique constraint on (bp, coach) — coaching-log allows
      // multiple evals over time.)
      const { data: existing, error: lookupErr } = await supabase
        .from("coach_evaluations")
        .select("id")
        .eq("business_plan_id", bpUuid)
        .eq("coach_directory_id", coachUuid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lookupErr) {
        // eslint-disable-next-line no-console
        console.warn(
          "[ProjectContext] saveEvaluation: lookup failed:",
          lookupErr,
        );
      }

      const row = {
        coach_directory_id: coachUuid,
        business_plan_id: bpUuid,
        evaluator_id: currentUser.id,
        rating_overall: evaluation.rating,
        comment: evaluation.comment,
      };

      if (existing && (existing as { id: string }).id) {
        const { error } = await supabase
          .from("coach_evaluations")
          .update(row)
          .eq("id", (existing as { id: string }).id);
        if (error) {
          // eslint-disable-next-line no-console
          console.error("[ProjectContext] saveEvaluation update failed:", error);
          return;
        }
      } else {
        const { error } = await supabase.from("coach_evaluations").insert(row);
        if (error) {
          // eslint-disable-next-line no-console
          console.error("[ProjectContext] saveEvaluation insert failed:", error);
          return;
        }
      }
      await fetchProjects();
    },
    [currentUser, canMutate, resolveCoachUuid, fetchProjects],
  );

  return (
    <ProjectContext.Provider
      value={{
        projects,
        loading,
        addProject,
        updateProject,
        deleteProject,
        addCoachToProject,
        removeCoachFromProject,
        updateCoachTask,
        updateCoachPayment,
        saveEvaluation,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjects() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProjects must be used within ProjectProvider");
  return ctx;
}
