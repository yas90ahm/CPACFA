'use client';

import * as React from 'react';
import {
  getStoredToken,
  setStoredToken,
  getStoredUser,
  setStoredUser,
  clearAuth,
  type WedgeUser,
} from '@/lib/auth';
import { authFetch } from '@/lib/apiAuth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type AuthState = {
  user: WedgeUser | null;
  token: string | null;
  ready: boolean;
};

type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>({
    user: null,
    token: null,
    ready: false,
  });

  React.useEffect(() => {
    const token = getStoredToken();
    const user = getStoredUser();
    setState({ token, user, ready: true });
  }, []);

  const login = React.useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Login failed');
    }
    const data = (await res.json()) as {
      token: string;
      userId?: string;
      user?: { id: string; email: string; name?: string };
    };
    const token = data.token;
    const user: WedgeUser = data.user
      ? { id: data.user.id, email: data.user.email, name: data.user.name }
      : { id: data.userId ?? 'local', email, name: email };
    setStoredToken(token);
    setStoredUser(user);
    setState({ token, user, ready: true });
  }, []);

  const register = React.useCallback(async (email: string, password: string, name?: string) => {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Registration failed');
    }
    const data = (await res.json()) as {
      token: string;
      userId?: string;
      user?: { id: string; email: string; name?: string };
    };
    const token = data.token;
    const user: WedgeUser = data.user
      ? { id: data.user.id, email: data.user.email, name: data.user.name }
      : { id: data.userId ?? 'local', email, name: name ?? email };
    setStoredToken(token);
    setStoredUser(user);
    setState({ token, user, ready: true });
  }, []);

  const logout = React.useCallback(() => {
    clearAuth();
    setState({ user: null, token: null, ready: true });
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
