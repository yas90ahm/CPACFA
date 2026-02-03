/**
 * Auth storage: token and user in localStorage (wedge skeleton).
 */

const TOKEN_KEY = 'finos_wedge_token';
const USER_KEY = 'finos_wedge_user';

export interface WedgeUser {
  id: string;
  email: string;
  name?: string;
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
}

export function getStoredUser(): WedgeUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WedgeUser;
  } catch {
    return null;
  }
}

export function setStoredUser(user: WedgeUser): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredUser(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(USER_KEY);
}

export function clearAuth(): void {
  clearStoredToken();
  clearStoredUser();
}
