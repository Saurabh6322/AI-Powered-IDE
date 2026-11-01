/**
 * AuthContext — manages JWT auth state across the app.
 *
 * Stores tokens in localStorage, provides login/register/logout methods,
 * attaches Bearer token to API requests, and auto-refreshes on mount.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

const API_BASE = "/api/auth";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  oauth_provider: string | null;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginWithOAuth: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => void;
  getToken: () => string | null;
}

type AuthContextValue = AuthState & AuthActions;

const AuthCtx = createContext<AuthContextValue | null>(null);

function saveTokens(access: string, refresh: string) {
  try {
    localStorage.setItem("ide-access-token", access);
    localStorage.setItem("ide-refresh-token", refresh);
  } catch {}
}

function clearTokens() {
  try {
    localStorage.removeItem("ide-access-token");
    localStorage.removeItem("ide-refresh-token");
  } catch {}
}

function loadToken(): string | null {
  try {
    return localStorage.getItem("ide-access-token");
  } catch {
    return null;
  }
}

function loadRefreshToken(): string | null {
  try {
    return localStorage.getItem("ide-refresh-token");
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(loadToken);
  const [loading, setLoading] = useState(true);

  const handleAuthResponse = useCallback(async (resp: Response) => {
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: "Auth failed" }));
      throw new Error(err.detail || "Auth failed");
    }
    const data = await resp.json();
    setToken(data.access_token);
    setUser(data.user);
    saveTokens(data.access_token, data.refresh_token);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const resp = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      await handleAuthResponse(resp);
    },
    [handleAuthResponse]
  );

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      const resp = await fetch(`${API_BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      await handleAuthResponse(resp);
    },
    [handleAuthResponse]
  );

  const loginWithOAuth = useCallback(
    async (accessToken: string, refreshToken: string) => {
      saveTokens(accessToken, refreshToken);
      setToken(accessToken);
      const resp = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setUser(data.user);
      }
    },
    []
  );

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    clearTokens();
  }, []);

  const getToken = useCallback(() => token, [token]);

  // On mount: try to load user from stored token
  useEffect(() => {
    const existingToken = loadToken();
    if (!existingToken) {
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/me`, {
      headers: { Authorization: `Bearer ${existingToken}` },
    })
      .then(async (resp) => {
        if (resp.ok) {
          const data = await resp.json();
          setUser(data.user);
          setToken(existingToken);
        } else {
          // Try refresh
          const refreshToken = loadRefreshToken();
          if (refreshToken) {
            const refreshResp = await fetch(`${API_BASE}/refresh`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ refresh_token: refreshToken }),
            });
            if (refreshResp.ok) {
              const refreshData = await refreshResp.json();
              setToken(refreshData.access_token);
              saveTokens(refreshData.access_token, refreshToken);
              const meResp = await fetch(`${API_BASE}/me`, {
                headers: { Authorization: `Bearer ${refreshData.access_token}` },
              });
              if (meResp.ok) {
                const meData = await meResp.json();
                setUser(meData.user);
              }
            } else {
              clearTokens();
            }
          } else {
            clearTokens();
          }
        }
      })
      .catch(() => clearTokens())
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthCtx.Provider
      value={{ user, token, loading, login, register, loginWithOAuth, logout, getToken }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
