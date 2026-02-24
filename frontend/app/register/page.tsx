'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_BASE = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001')
  : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001');

export default function RegisterPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantName: companyName,
          name: fullName || undefined,
          email,
          password,
        }),
      });

      let data: { error?: string; token?: string };
      try {
        data = await res.json();
      } catch {
        throw new Error('Invalid response from server');
      }

      if (!res.ok) {
        throw new Error(data.error ?? 'Registration failed');
      }

      router.push('/login');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    backgroundColor: 'var(--bg-input, #1A1D27)',
    border: '1px solid var(--border-default, #2A2D37)',
    color: 'var(--text-primary, #E8EAF0)',
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary, #0C0E13)' }}>
      <div className="w-full max-w-md p-8 rounded-xl" style={{ backgroundColor: 'var(--bg-surface, #14161D)', border: '1px solid var(--border-default, #2A2D37)' }}>
        <h1 className="text-3xl font-display mb-1" style={{ color: 'var(--text-primary, #E8EAF0)', fontStyle: 'italic' }}>
          Sovereign
        </h1>
        <p className="mb-8" style={{ color: 'var(--text-secondary, #9DA3B0)', fontSize: '14px' }}>
          Create your account
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary, #E8EAF0)' }}>
              Company Name
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Corp"
              required
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary, #E8EAF0)' }}>
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={inputStyle}
            />
          </div>

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
              style={inputStyle}
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
              style={inputStyle}
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted, #6B7280)' }}>
              Min 8 characters with uppercase, lowercase, number, and special character
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary, #E8EAF0)' }}>
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={inputStyle}
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
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-secondary, #9DA3B0)' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--accent, #6366F1)' }} className="hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
