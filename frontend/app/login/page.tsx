'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, tenantId || undefined);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary, #0C0E13)' }}>
      <div className="w-full max-w-md p-8 rounded-xl" style={{ backgroundColor: 'var(--bg-surface, #14161D)', border: '1px solid var(--border-default, #2A2D37)' }}>
        <h1 className="text-3xl font-display mb-1" style={{ color: 'var(--text-primary, #E8EAF0)', fontStyle: 'italic' }}>
          Sabit
        </h1>
        <p className="mb-8" style={{ color: 'var(--text-secondary, #9DA3B0)', fontSize: '14px' }}>
          Financial Close Engine
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary, #E8EAF0)' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                backgroundColor: 'var(--bg-input, #1A1D27)',
                border: '1px solid var(--border-default, #2A2D37)',
                color: 'var(--text-primary, #E8EAF0)',
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary, #E8EAF0)' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                backgroundColor: 'var(--bg-input, #1A1D27)',
                border: '1px solid var(--border-default, #2A2D37)',
                color: 'var(--text-primary, #E8EAF0)',
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary, #E8EAF0)' }}>
              Tenant ID (optional)
            </label>
            <input
              type="text"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="tenant-xxx"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                backgroundColor: 'var(--bg-input, #1A1D27)',
                border: '1px solid var(--border-default, #2A2D37)',
                color: 'var(--text-primary, #E8EAF0)',
              }}
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: loading ? 'var(--accent-muted, #4A4FC7)' : 'var(--accent, #6366F1)',
              color: '#FFFFFF',
            }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-secondary, #9DA3B0)' }}>
          Don&apos;t have an account?{' '}
          <Link href="/register" style={{ color: 'var(--accent, #6366F1)' }} className="hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
