import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import {
  auth,
  googleProvider,
  signInWithPopup,
  firebaseSignOut,
  isFirebaseConfigured,
} from "@/lib/firebase";

interface AuthContextType {
  isAuthenticated: boolean;
  user: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isFirebaseReady: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// 허용된 계정 목록 (이메일/비밀번호 로그인용)
const ALLOWED_ACCOUNTS: Record<string, string> = {
  "zero@udimpact.ai": "underdogs2024!",
  "admin@underdogs.co.kr": "underdogs2024!",
};

const AUTH_STORAGE_KEY = "underdogs_auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const saved = sessionStorage.getItem(AUTH_STORAGE_KEY);
    return saved ? JSON.parse(saved).isAuth === true : false;
  });
  const [user, setUser] = useState<string | null>(() => {
    const saved = sessionStorage.getItem(AUTH_STORAGE_KEY);
    return saved ? JSON.parse(saved).user : null;
  });

  useEffect(() => {
    sessionStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ isAuth: isAuthenticated, user })
    );
  }, [isAuthenticated, user]);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    const normalizedEmail = email.trim().toLowerCase();
    if (ALLOWED_ACCOUNTS[normalizedEmail] && ALLOWED_ACCOUNTS[normalizedEmail] === password) {
      setIsAuthenticated(true);
      setUser(normalizedEmail);
      return true;
    }
    return false;
  }, []);

  const loginWithGoogle = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!isFirebaseConfigured || !auth || !googleProvider) {
      return { success: false, error: "Google 로그인이 아직 설정되지 않았습니다." };
    }
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email || "";
      if (!email.endsWith("@udimpact.ai")) {
        await firebaseSignOut(auth);
        return {
          success: false,
          error: "udimpact.ai 도메인 계정만 가입할 수 있습니다.\n다른 Google 계정으로 다시 시도해 주세요.",
        };
      }
      setIsAuthenticated(true);
      setUser(email);
      return { success: true };
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/popup-closed-by-user") {
        return { success: false };
      }
      return { success: false, error: "Google 로그인 중 오류가 발생했습니다." };
    }
  }, []);

  const logout = useCallback(async () => {
    if (isFirebaseConfigured && auth) {
      try { await firebaseSignOut(auth); } catch {}
    }
    setIsAuthenticated(false);
    setUser(null);
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, loginWithGoogle, logout, isFirebaseReady: isFirebaseConfigured }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
