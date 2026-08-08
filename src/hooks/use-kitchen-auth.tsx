import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const KITCHEN_SESSION_KEY = "mb-crunchy-kitchen-session";

interface KitchenUser {
  adminId: string;
  username: string;
  role: string;
  businessUnitIds: string[];
}

interface KitchenAuthContextValue {
  kitchen: KitchenUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  getSessionToken: () => string | null;
}

const KitchenAuthContext = createContext<KitchenAuthContextValue | null>(null);

export function KitchenAuthProvider({ children }: { children: React.ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(KITCHEN_SESSION_KEY);
    } catch {
      return null;
    }
  });

  const serverVerifySession = useQuery(
    api.adminAuth.verifySession,
    sessionToken ? { sessionToken } : "skip",
  );
  const serverLogin = useMutation(api.adminAuth.login);
  const serverLogout = useMutation(api.adminAuth.logout);

  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const sessionResolved = !sessionToken || serverVerifySession !== undefined;
    if (sessionResolved) {
      setIsChecking(false);
    }
  }, [serverVerifySession, sessionToken]);

  // Auto-clear invalid session
  useEffect(() => {
    if (serverVerifySession === null && sessionToken && !isChecking) {
      localStorage.removeItem(KITCHEN_SESSION_KEY);
      setSessionToken(null);
    }
  }, [serverVerifySession, sessionToken, isChecking]);

  const login = useCallback(
    async (username: string, password: string) => {
      try {
        const result = await serverLogin({
          username,
          password,
        });

        if (result.success) {
          // Verify this is a kitchen role account
          if (result.admin?.role !== "kitchen") {
            return { success: false, error: "This login is for kitchen staff only." };
          }
          localStorage.setItem(KITCHEN_SESSION_KEY, result.token);
          setSessionToken(result.token);
          return { success: true };
        }
        return { success: false, error: result.error };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Login failed. Please try again.",
        };
      }
    },
    [serverLogin],
  );

  const logout = useCallback(async () => {
    if (sessionToken) {
      try {
        await serverLogout({ sessionToken });
      } catch {
        // Logout even if server call fails
      }
    }
    localStorage.removeItem(KITCHEN_SESSION_KEY);
    setSessionToken(null);
  }, [sessionToken, serverLogout]);

  const getSessionToken = useCallback(() => sessionToken, [sessionToken]);

  const value = useMemo<KitchenAuthContextValue>(
    () => ({
      kitchen: serverVerifySession?.role === "kitchen" ? {
        adminId: serverVerifySession.adminId,
        username: serverVerifySession.username,
        role: serverVerifySession.role,
        businessUnitIds: serverVerifySession.businessUnitIds ?? [],
      } : null,
      isAuthenticated: Boolean(serverVerifySession?.role === "kitchen"),
      isLoading: isChecking || serverVerifySession === undefined,
      login,
      logout,
      getSessionToken,
    }),
    [serverVerifySession, isChecking, login, logout, getSessionToken],
  );

  return <KitchenAuthContext.Provider value={value}>{children}</KitchenAuthContext.Provider>;
}

export function useKitchenAuth(): KitchenAuthContextValue {
  const ctx = useContext(KitchenAuthContext);
  if (!ctx) throw new Error("useKitchenAuth must be used within KitchenAuthProvider");
  return ctx;
}