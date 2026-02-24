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

const API_BASE = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001')
  : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
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
        let data: { error?: string; token?: string; userId?: string; tenantId?: string; role?: string };
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
        setToken(t);
        setUser({ userId, tenantId: tid, role, email });
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
