'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { setAuthTokenGetter, setAuthExpiredHandler } from '@/lib/api';

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
    return { token: t, user: u ? JSON.parse(u) : null };
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
  const [token, setToken] = useState<string | null>(() => loadFromStorage().token);
  const [user, setUser] = useState<AuthUser | null>(() => loadFromStorage().user);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const getAuthToken = useCallback(() => token, [token]);

  useEffect(() => {
    setAuthTokenGetter(getAuthToken);
  }, [getAuthToken]);

  useEffect(() => {
    setAuthExpiredHandler(() => {
      setToken(null);
      setUser(null);
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
        const { token: t, userId, tenantId: tid, role } = data as {
          token: string;
          userId: string;
          tenantId: string;
          role: string;
        };
        const authUser: AuthUser = { userId, tenantId: tid, role, email: data.email ?? email, name: data.name ?? undefined };
        setToken(t);
        setUser(authUser);
        saveToStorage(t, authUser);
        if (role === 'operating_partner') {
          router.push('/portfolio');
        } else if (role === 'admin') {
          router.push('/portfolio');
        } else {
          router.push('/close');
        }
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
