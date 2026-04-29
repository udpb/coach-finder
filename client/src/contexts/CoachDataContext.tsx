/*
 * CoachDataContext - 코치 데이터 + Firestore overlay (CRUD).
 *
 * Phase C1 (2026-04-23): 베이스 코치 데이터의 출처가 정적 JSON에서
 * Supabase `public.coaches_directory`로 이전되었다.
 *   - 런타임에 `GET /api/coaches`로 가져온다 (Vercel Function on prod,
 *     Vite middleware in dev — 둘 다 SUPABASE_SERVICE_ROLE 사용).
 *   - 네트워크 실패 시 번들된 JSON으로 자연스럽게 폴백 (오프라인 안전망).
 *   - Firestore overlay (added/edited/deleted) 로직은 그대로 유지.
 *     overlay는 numeric `id`를 키로 쓰며, Supabase row 의 `id`(numeric)는
 *     서버 측에서 `external_id`(원본 JSON id)로 채워진다.
 *
 * 다음 단계 (Phase C4): Firebase Auth → Supabase Auth 통합 후
 * overlay 자체를 Supabase로 옮기는 안 검토.
 */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { Coach } from "@/types/coach";
import coachesFallback from "@/data/coaches_db.json";
import { db } from "@/lib/firebase";
import { doc, setDoc, onSnapshot } from "firebase/firestore";

const LS_KEY = "underdogs_coach_custom_data";
const FIRESTORE_DOC = "coachOverlay/global";

interface CustomData {
  added: Coach[];
  edited: Record<number, Partial<Coach>>;
  deleted: number[];
}

const EMPTY: CustomData = { added: [], edited: {}, deleted: [] };

function loadFromLS(): CustomData {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return EMPTY;
}

interface CoachDataContextType {
  allCoaches: Coach[];
  addCoach: (coach: Omit<Coach, "id">) => void;
  updateCoach: (id: number, updates: Partial<Coach>) => void;
  deleteCoach: (id: number) => void;
  resetCustomData: () => void;
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

export function CoachDataProvider({ children }: { children: ReactNode }) {
  const [customData, setCustomData] = useState<CustomData>(EMPTY);
  const [baseCoaches, setBaseCoaches] = useState<Coach[]>([]);
  const [source, setSource] = useState<CoachDataContextType["source"]>("loading");
  const [loading, setLoading] = useState(true);

  // Phase C1: Supabase에서 코치 풀 로드.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/coaches", {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { coaches: Coach[] };
        if (cancelled) return;
        if (!Array.isArray(body.coaches) || body.coaches.length === 0) {
          throw new Error("empty coach list");
        }
        setBaseCoaches(body.coaches);
        setSource("supabase");
      } catch (err) {
        console.warn(
          "[CoachDataContext] /api/coaches fetch failed, falling back to bundled JSON:",
          err,
        );
        if (cancelled) return;
        setBaseCoaches(fallbackCoaches);
        setSource("fallback-json");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Firestore 실시간 동기화
  useEffect(() => {
    if (!db) {
      setCustomData(loadFromLS());
      return;
    }
    const [colId, docId] = FIRESTORE_DOC.split("/");
    const unsubscribe = onSnapshot(
      doc(db, colId, docId),
      (snap) => {
        if (snap.exists()) {
          setCustomData(snap.data() as CustomData);
        } else {
          setCustomData(EMPTY);
        }
      },
      () => {
        setCustomData(loadFromLS());
      }
    );
    return unsubscribe;
  }, []);

  // Firestore 또는 localStorage에 저장
  const persist = useCallback(async (data: CustomData) => {
    if (db) {
      const [colId, docId] = FIRESTORE_DOC.split("/");
      await setDoc(doc(db, colId, docId), data);
    } else {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    }
  }, []);

  const allCoaches: Coach[] = (() => {
    let result = baseCoaches
      .filter((c) => !customData.deleted.includes(c.id))
      .map((c) => {
        const edits = customData.edited[c.id];
        return edits ? { ...c, ...edits } : c;
      });
    return [...result, ...customData.added];
  })();

  const addCoach = useCallback((coachData: Omit<Coach, "id">) => {
    setCustomData((prev) => {
      const maxId = Math.max(
        ...baseCoaches.map((c) => c.id),
        ...prev.added.map((c) => c.id),
        0
      );
      const newCoach: Coach = { ...coachData, id: maxId + 1 } as Coach;
      const next = { ...prev, added: [...prev.added, newCoach] };
      persist(next);
      return next;
    });
  }, [persist, baseCoaches]);

  const updateCoach = useCallback((id: number, updates: Partial<Coach>) => {
    setCustomData((prev) => {
      const addedIdx = prev.added.findIndex((c) => c.id === id);
      let next: CustomData;
      if (addedIdx >= 0) {
        const newAdded = [...prev.added];
        newAdded[addedIdx] = { ...newAdded[addedIdx], ...updates };
        next = { ...prev, added: newAdded };
      } else {
        next = {
          ...prev,
          edited: { ...prev.edited, [id]: { ...(prev.edited[id] || {}), ...updates } },
        };
      }
      persist(next);
      return next;
    });
  }, [persist]);

  const deleteCoach = useCallback((id: number) => {
    setCustomData((prev) => {
      const addedIdx = prev.added.findIndex((c) => c.id === id);
      let next: CustomData;
      if (addedIdx >= 0) {
        next = { ...prev, added: prev.added.filter((c) => c.id !== id) };
      } else {
        next = { ...prev, deleted: [...prev.deleted, id] };
      }
      persist(next);
      return next;
    });
  }, [persist]);

  const resetCustomData = useCallback(() => {
    persist(EMPTY);
    setCustomData(EMPTY);
    localStorage.removeItem(LS_KEY);
  }, [persist]);

  const customDataStats = {
    added: customData.added.length,
    edited: Object.keys(customData.edited).length,
    deleted: customData.deleted.length,
  };

  return (
    <CoachDataContext.Provider
      value={{
        allCoaches,
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
