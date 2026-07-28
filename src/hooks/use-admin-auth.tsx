import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const ADMIN_SESSION_KEY = "mb-crunchy-admin-session";

interface AdminUser {
  adminId: string;
  username: string;
  role: string;
}

interface AdminAuthContextValue {
  admin: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasAdmins: boolean | undefined;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  getSessionToken: () => string | null;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ADMIN_SESSION_KEY);
    } catch {
      return null;
    }
  });

  const serverHasAdmins = useQuery(api.adminAuth.hasAdmins);
  const serverVerifySession = useQuery(
    api.adminAuth.verifySession,
    sessionToken ? { sessionToken } : "skip",
  );
  const serverLogin = useMutation(api.adminAuth.login);
  const serverLogout = useMutation(api.adminAuth.logout);

  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // When no session token exists, the verifySession query is skipped (stays
    // undefined forever). Only wait for queries that actually run.
    const sessionResolved = !sessionToken || serverVerifySession !== undefined;
    if (serverHasAdmins !== undefined && sessionResolved) {
      setIsChecking(false);
    }
  }, [serverHasAdmins, serverVerifySession, sessionToken]);

  // Auto-clear invalid session
  useEffect(() => {
    if (serverVerifySession === null && sessionToken && !isChecking) {
      localStorage.removeItem(ADMIN_SESSION_KEY);
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
          localStorage.setItem(ADMIN_SESSION_KEY, result.token);
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
    localStorage.removeItem(ADMIN_SESSION_KEY);
    setSessionToken(null);
  }, [sessionToken, serverLogout]);

  const getSessionToken = useCallback(() => sessionToken, [sessionToken]);

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      admin: serverVerifySession ?? null,
      isAuthenticated: Boolean(serverVerifySession),
      isLoading: isChecking || serverHasAdmins === undefined || (sessionToken !== null && serverVerifySession === undefined),
      hasAdmins: serverHasAdmins,
      login,
      logout,
      getSessionToken,
    }),
    [serverVerifySession, serverHasAdmins, isChecking, login, logout, getSessionToken],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
