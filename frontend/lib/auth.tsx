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

const STORAGE_KEY_TOKEN = 'cpa_auth_token';
const STORAGE_KEY_USER = 'cpa_auth_user';

function loadFromStorage(): { token: string | null; user: AuthUser | null } {
  if (typeof window === 'undefined') return { token: null, user: null };
  try {
    const t = localStorage.getItem(STORAGE_KEY_TOKEN);
    const u = localStorage.getItem(STORAGE_KEY_USER);
    const parsed = u ? JSON.parse(u) as AuthUser : null;
    // Normalize backend role names (e.g. "preparer" → "controller") when loading from storage
    if (parsed) parsed.role = normalizeRole(parsed.role);
    return { token: t, user: parsed };
  } catch {
    return { token: null, user: null };
  }
}

function saveToStorage(token: string | null, user: AuthUser | null) {
  if (typeof window === 'undefined') return;
  try {
    if (token) localStorage.setItem(STORAGE_KEY_TOKEN, token);
    else localStorage.removeItem(STORAGE_KEY_TOKEN);
    if (user) localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY_USER);
  } catch { /* localStorage may be unavailable */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Ref holds the token synchronously — no closure staleness.
  // Initialize from localStorage during render (before any effects).
  const tokenRef = useRef<string | null>(null);
  const isLoadingRef = useRef(true);
  if (tokenRef.current === null && typeof window !== 'undefined') {
    const stored = loadFromStorage();
    if (stored.token) tokenRef.current = stored.token;
  }

  // Hydrate React state from localStorage on client mount
  useEffect(() => {
    const stored = loadFromStorage();
    if (stored.token) {
      setToken(stored.token);
      setUser(stored.user);
      tokenRef.current = stored.token;
    }
    setIsLoading(false);
    isLoadingRef.current = false;
  }, []);

  // Keep ref in sync with state changes (login, logout, token refresh)
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // Stable callback — reads from ref, never stale
  const getAuthToken = useCallback(() => tokenRef.current, []);

  useEffect(() => {
    setAuthTokenGetter(getAuthToken);
  }, [getAuthToken]);

  useEffect(() => {
    setAuthExpiredHandler(() => {
      // Don't wipe credentials during hydration — a 401 from a stale
      // getter is a race condition, not a real auth expiry.
      if (isLoadingRef.current) return;
      setToken(null);
      setUser(null);
      tokenRef.current = null;
      saveToStorage(null, null);
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
        const { token: t, userId, tenantId: tid, role: rawRole } = data as {
          token: string;
          userId: string;
          tenantId: string;
          role: string;
        };
        const role = normalizeRole(rawRole);
        const authUser: AuthUser = { userId, tenantId: tid, role, email: data.email ?? email, name: data.name ?? undefined };
        setToken(t);
        setUser(authUser);
        saveToStorage(t, authUser);
        router.push(getDefaultLandingPage(role));
      } catch (err) {
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [router]
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    saveToStorage(null, null);
    try { localStorage.removeItem('sabit_demo_mode'); } catch { /* noop */ }
    router.replace('/login');
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isLoading,
      login,
      logout,
      getAuthToken,
    }),
    [token, user, isLoading, login, logout, getAuthToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
