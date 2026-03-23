'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { AlertCircle, Shield, Lock, CheckCircle, Loader2, Eye, EyeOff } from 'lucide-react';

const API_BASE = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001')
  : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001');

const badges = [
  { icon: Shield, label: 'SOC 2 Type II' },
  { icon: Lock, label: '256-bit Encryption' },
  { icon: CheckCircle, label: 'AICPA Compliant' },
] as const;

export default function RegisterPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      try { data = await res.json(); } catch { throw new Error('Invalid response from server'); }
      if (!res.ok) throw new Error(data.error ?? 'Registration failed');
      router.push('/login');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen overflow-hidden">
      {/* Left Panel -- Brand */}
      <div
        className="hidden lg:flex w-[55%] flex-col justify-center px-20 shrink-0"
        style={{ backgroundColor: 'var(--bg-nav)' }}
      >
        <h1 className="text-[2.5rem] font-semibold tracking-[0.12em] uppercase leading-none text-white">
          SABIT
        </h1>
        <p
          className="text-base tracking-[0.08em] uppercase mt-3 leading-relaxed"
          style={{ color: 'var(--text-inverse-secondary)' }}
        >
          Financial Close Engine
        </p>

        <div className="w-20 h-px bg-white/40 mt-12" />

        <p
          className="text-[15px] max-w-xs mt-8 leading-relaxed"
          style={{ color: 'var(--text-inverse-secondary)' }}
        >
          Deterministic financial statements. Every dollar provably correct.
        </p>

        <div className="flex items-center gap-3 mt-16">
          {badges.map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-white/10 text-white/60"
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Right Panel -- Form */}
      <div
        className="w-full lg:w-[45%] flex items-center justify-center px-8 lg:px-16 shrink-0"
        style={{ backgroundColor: 'var(--bg-base)' }}
      >
        <div className="w-full max-w-[360px] animate-fade-in">
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Create your account
          </h2>
          <p className="text-sm mt-2 mb-8" style={{ color: 'var(--text-secondary)' }}>
            Set up your organization in minutes
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="reg-company" className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Company Name
              </label>
              <input
                id="reg-company"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Corp"
                required
                className="w-full h-11 px-3 rounded-md text-sm focus-ring"
              />
            </div>

            <div>
              <label htmlFor="reg-name" className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Full Name
              </label>
              <input
                id="reg-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full h-11 px-3 rounded-md text-sm focus-ring"
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Email Address
              </label>
              <input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="w-full h-11 px-3 rounded-md text-sm focus-ring"
              />
            </div>

            <div>
              <label htmlFor="reg-password" className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Password
              </label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full h-11 pl-3 pr-10 rounded-md text-sm focus-ring"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 flex items-center justify-center"
                  style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none' }}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="mt-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Min 8 characters with uppercase, lowercase, number, and special character
              </p>
            </div>

            <div>
              <label htmlFor="reg-confirm" className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Confirm Password
              </label>
              <input
                id="reg-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full h-11 px-3 rounded-md text-sm focus-ring"
              />
            </div>

            {error && (
              <div
                className="flex items-start gap-2 p-3 rounded-md text-[13px] leading-snug"
                style={{ backgroundColor: 'var(--status-error-bg)', border: '1px solid var(--status-error-border)' }}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-px" style={{ color: 'var(--status-error)' }} />
                <span style={{ color: 'var(--status-error)' }}>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                'w-full h-12 rounded-md text-[15px] font-semibold text-white flex items-center justify-center gap-2 transition-colors',
                loading && 'opacity-80 cursor-default pointer-events-none'
              )}
              style={{ backgroundColor: 'var(--interactive-primary)' }}
              onMouseEnter={(e) => { if (!loading) (e.currentTarget.style.backgroundColor = 'var(--interactive-primary-hover)'); }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--interactive-primary)'; }}
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating account...</> : 'Create Account'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            Already have an account?{' '}
            <Link href="/login" className="font-medium hover:underline" style={{ color: 'var(--interactive-primary)' }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
