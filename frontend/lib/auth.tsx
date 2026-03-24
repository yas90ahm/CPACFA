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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

const STORAGE_KEY_USER = 'cpa_auth_user';

function loadUserFromStorage(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const u = localStorage.getItem(STORAGE_KEY_USER);
    const parsed = u ? JSON.parse(u) as AuthUser : null;
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
    // Clean up any legacy token from localStorage
    localStorage.removeItem('cpa_auth_token');
  } catch { /* localStorage may be unavailable */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const isLoadingRef = useRef(true);

  // Hydrate user from localStorage on client mount (cookie handles auth)
  useEffect(() => {
    const storedUser = loadUserFromStorage();
    if (storedUser) setUser(storedUser);
    setIsLoading(false);
    isLoadingRef.current = false;
  }, []);

  // Cookie handles auth — getAuthToken returns null
  const getAuthToken = useCallback(() => null, []);

  useEffect(() => {
    setAuthTokenGetter(getAuthToken);
  }, [getAuthToken]);

  useEffect(() => {
    setAuthExpiredHandler(() => {
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
          credentials: 'include',
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
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Best-effort
    }
    setUser(null);
    saveUserToStorage(null);
    router.replace('/login');
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token: null, // Auth is via HttpOnly cookie on .sabit.ai domain
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
