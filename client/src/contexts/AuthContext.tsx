import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseBrowser";

// ─── Phase C4: Supabase Auth (replaces Firebase Auth + ALLOWED_ACCOUNTS) ────
//
// Why this rewrite (see Phase C4 spec):
//   - Removed hardcoded ALLOWED_ACCOUNTS map (passwords-in-source security
//     disaster) and ADMIN_EMAILS set (drifted from coaching-log's
//     profiles.role). Both apps now share auth.users + public.profiles.
//   - Email/password and Google OAuth go through Supabase. Domain hint
//     (hd: 'udimpact.ai') preserved on Google so randos can't sign up.
//
// Audit lessons applied (do NOT regress):
//   - Bug A (lazy-init flag deadlock): NO `supabaseAvailable`-style gate.
//     Role lookup checks only that we have a userId.
//   - Bug B (listener attached too late): the onAuthStateChange listener
//     is attached BEFORE getSession() in the mount effect, so Supabase v2's
//     synchronous INITIAL_SESSION event is captured.
//   - Stale-token race: role lookup retries up to 3 times, calling
//     refreshSession() after the first failure and short-backing-off after
//     the second. Final fallback is 'coach'; TOKEN_REFRESHED later re-runs
//     the lookup automatically.

export type UserRole = "admin" | "pm" | "coach";

interface AuthContextType {
  isAuthenticated: boolean;
  user: string | null; // email string (not full user object)
  isAdmin: boolean; // true iff role === 'admin' (admin-only, NOT admin-or-pm)
  login: (email: string, password: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  logout: () => void;

  // Phase C4 fields
  /** Full Supabase user object (or null when signed out). */
  currentUser: User | null;
  /** Role from public.profiles.role; null until first lookup resolves. */
  role: UserRole | null;
  /** True once we've finished the initial getSession()/listener handshake AND Supabase is configured. */
  isAuthReady: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);

  // Guard so React 18 strict-mode double-mount + re-renders don't double-subscribe.
  const listenerAttachedRef = useRef<boolean>(false);

  // ─── Role lookup with retry + refreshSession (audit: stale-token race) ───
  // Resolves public.profiles.role for the given userId. Up to 3 attempts:
  //   attempt 0: bare query
  //   attempt 1: after refreshSession() (forces fresh JWT for RLS)
  //   attempt 2: after ~600ms backoff
  // On total failure, falls back to 'coach' — TOKEN_REFRESHED will fire
  // a few minutes later and the listener re-runs this function to recover.
  const resolveUserRole = useCallback(async (userId: string): Promise<void> => {
    if (!supabase) {
      setRole("coach");
      return;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .single();
        if (!error && data && typeof data.role === "string") {
          const r = data.role as UserRole;
          setRole(r === "admin" || r === "pm" || r === "coach" ? r : "coach");
          return;
        }
        if (error) {
          // eslint-disable-next-line no-console
          console.warn(
            `[AuthContext] profiles.role lookup attempt ${attempt + 1} returned error:`,
            error
          );
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(
          `[AuthContext] profiles.role lookup attempt ${attempt + 1} threw:`,
          e
        );
      }
      if (attempt === 0) {
        try {
          await supabase.auth.refreshSession();
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("[AuthContext] refreshSession() failed:", e);
        }
      } else if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }
    // eslint-disable-next-line no-console
    console.warn(
      "[AuthContext] profiles.role lookup exhausted retries; defaulting to 'coach' (will recover on TOKEN_REFRESHED)."
    );
    setRole("coach");
  }, []);

  // ─── Mount effect: attach listener FIRST, then read session ──────────────
  useEffect(() => {
    if (!supabase) {
      // No Supabase configured (e.g. preview build with missing env). Render
      // the app in signed-out mode rather than hanging on a permanent loader.
      setIsAuthReady(true);
      return;
    }
    if (listenerAttachedRef.current) {
      // Strict-mode double mount safety: only ever attach once per provider.
      return;
    }
    listenerAttachedRef.current = true;
    let cancelled = false;

    // STEP 1 (Bug B fix): attach listener BEFORE getSession so Supabase v2's
    // synchronous INITIAL_SESSION event isn't missed.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;

      if (event === "SIGNED_OUT") {
        setCurrentUser(null);
        setRole(null);
        return;
      }

      if (
        (event === "INITIAL_SESSION" ||
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED") &&
        session
      ) {
        setCurrentUser(session.user);
        // Re-resolve role on these events. The resolver itself is idempotent.
        void resolveUserRole(session.user.id);
      }
    });

    // STEP 2: read current session. INITIAL_SESSION will also fire from
    // the listener; whichever wins, the setState calls converge.
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // eslint-disable-next-line no-console
          console.warn("[AuthContext] getSession() error:", error);
        }
        if (data?.session) {
          setCurrentUser(data.session.user);
          void resolveUserRole(data.session.user.id);
        }
        setIsAuthReady(true);
      })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error("[AuthContext] getSession() threw:", e);
        if (!cancelled) setIsAuthReady(true);
      });

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
      listenerAttachedRef.current = false;
    };
  }, [resolveUserRole]);

  // ─── login (email + password) ────────────────────────────────────────────
  const login = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      if (!supabase) return false;
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error || !data?.user) {
        // eslint-disable-next-line no-console
        console.warn("[AuthContext] signInWithPassword failed:", error);
        return false;
      }
      // The onAuthStateChange listener will fire SIGNED_IN and update state.
      return true;
    },
    []
  );

  // ─── loginWithGoogle (OAuth, hd hint preserved) ──────────────────────────
  const loginWithGoogle = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (!supabase) {
      return { success: false, error: "Google 로그인이 아직 설정되지 않았습니다." };
    }
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          // KEEP the @udimpact.ai domain hint (Google Workspace SSO restriction).
          queryParams: { hd: "udimpact.ai" },
          redirectTo: window.location.origin,
        },
      });
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[AuthContext] signInWithOAuth(google) error:", error);
        return { success: false, error: `Google 로그인 오류: ${error.message}` };
      }
      // signInWithOAuth performs a full-page redirect. On return, the
      // detectSessionInUrl flag in supabaseBrowser pulls the token out of the
      // hash, fires INITIAL_SESSION, and the listener handles the rest.
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "알 수 없는 오류";
      // eslint-disable-next-line no-console
      console.error("[AuthContext] signInWithOAuth(google) threw:", err);
      return { success: false, error: `Google 로그인 오류: ${message}` };
    }
  }, []);

  // ─── logout ──────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[AuthContext] signOut() failed:", e);
      }
    }
    // The listener will fire SIGNED_OUT and clear currentUser/role, but
    // also clear locally in case the listener is unattached (e.g. no Supabase).
    setCurrentUser(null);
    setRole(null);
  }, []);

  const isAuthenticated = !!currentUser;
  const userEmail = currentUser?.email?.toLowerCase() ?? null;
  // Preserve original semantics: isAdmin was admin-only (NOT admin-or-pm).
  const isAdmin = role === "admin";

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user: userEmail,
        isAdmin,
        login,
        loginWithGoogle,
        logout,
        currentUser,
        role,
        // isAuthReady is true once Supabase is configured AND we've finished
        // the initial getSession()/listener handshake. Consumers should gate
        // OAuth UI on this so we don't flash a Google button before the
        // backend is actually usable.
        isAuthReady: isSupabaseConfigured && isAuthReady,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
