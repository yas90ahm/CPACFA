'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { setAuthTokenGetter, setAuthExpiredHandler } from '@/lib/api';
import { normalizeRole, getDefaultLandingPage } from '@/lib/permissions';

export interface AuthUser {
  userId: string;
  tenantId: string;
  role: string;
  email?: string;
  name?: string;
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string, tenantId?: string) => Promise<void>;
  logout: () => void;
  getAuthToken: () => string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const STORAGE_KEY_USER = 'cpa_auth_user';

function loadUserFromStorage(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const u = localStorage.getItem(STORAGE_KEY_USER);
    const parsed = u ? JSON.parse(u) as AuthUser : null;
    // Normalize backend role names (e.g. "preparer" → "controller") when loading from storage
    if (parsed) parsed.role = normalizeRole(parsed.role);
    return parsed;
  } catch {
    return null;
  }
}

function saveUserToStorage(user: AuthUser | null) {
  if (typeof window === 'undefined') return;
  try {
    if (user) localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY_USER);
    // Clean up legacy token from localStorage if present
    localStorage.removeItem('cpa_auth_token');
  } catch { /* localStorage may be unavailable */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Token kept in memory (not localStorage) for API clients that need Bearer auth.
  // HttpOnly cookie is the primary auth mechanism for the web frontend.
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const isLoadingRef = useRef(true);

  // Hydrate user from localStorage on client mount (cookie handles auth, user is for display)
  useEffect(() => {
    const storedUser = loadUserFromStorage();
    if (storedUser) {
      setUser(storedUser);
    }
    setIsLoading(false);
    isLoadingRef.current = false;
  }, []);

  // Return the in-memory token for API calls that need Bearer auth as fallback
  const tokenRef = useRef<string | null>(null);
  const getAuthToken = useCallback(() => tokenRef.current, []);

  useEffect(() => {
    setAuthTokenGetter(getAuthToken);
  }, [getAuthToken]);

  useEffect(() => {
    setAuthExpiredHandler(() => {
      // Don't wipe credentials during hydration — a 401 from a stale
      // getter is a race condition, not a real auth expiry.
      if (isLoadingRef.current) return;
      setUser(null);
      saveUserToStorage(null);
      router.replace('/login');
    });
  }, [router]);

  const login = useCallback(
    async (email: string, password: string, tenantId?: string) => {
      setIsLoading(true);
      try {
        const url = `${API_BASE}/api/auth/login`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include', // Receive and store HttpOnly cookie
          body: JSON.stringify({ email, password, tenantId: tenantId || undefined }),
        });
        let data: { error?: string; token?: string; userId?: string; tenantId?: string; role?: string; email?: string; name?: string | null };
        try {
          data = await res.json();
        } catch {
          throw new Error(res.status === 404 ? 'Login endpoint not found. Is the backend running on ' + API_BASE + '?' : 'Invalid response from server');
        }
        if (!res.ok) {
          throw new Error((data as { error?: string }).error ?? 'Login failed');
        }
        const { userId, tenantId: tid, role: rawRole } = data as {
          token: string;
          userId: string;
          tenantId: string;
          role: string;
        };
        const role = normalizeRole(rawRole);
        const authUser: AuthUser = { userId, tenantId: tid, role, email: data.email ?? email, name: data.name ?? undefined };
        // Store token in memory for Bearer auth fallback (cross-origin deployments)
        const jwt = (data as { token?: string }).token ?? null;
        tokenRef.current = jwt;
        setToken(jwt);
        setUser(authUser);
        saveUserToStorage(authUser);
        router.push(getDefaultLandingPage(role));
      } catch (err) {
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [router]
  );

  const logout = useCallback(async () => {
    // Call backend to clear the HttpOnly cookie
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Best-effort; proceed with client-side cleanup even if request fails
    }
    tokenRef.current = null;
    setToken(null);
    setUser(null);
    saveUserToStorage(null);
    router.replace('/login');
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token, // In-memory token for Bearer auth fallback; cookie is primary
      user,
      isLoading,
      login,
      logout,
      getAuthToken,
    }),
    [user, isLoading, login, logout, getAuthToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
