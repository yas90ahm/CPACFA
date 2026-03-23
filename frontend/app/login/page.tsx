'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { getDefaultLandingPage } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Eye, EyeOff, AlertCircle, Loader2, ChevronDown } from 'lucide-react';

export default function LoginPage() {
  const { login, token, user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!authLoading && token) {
    router.replace(getDefaultLandingPage(user?.role ?? 'controller'));
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-base)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--interactive-primary)' }} />
      </div>
    );
  }

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
    <div className="flex min-h-screen overflow-hidden">
      {/* Left Panel -- Brand */}
      <div
        className="hidden lg:flex w-[55%] flex-col justify-center px-20 shrink-0"
        style={{ backgroundColor: 'var(--bg-nav)' }}
      >
        <h1 className="text-[2.5rem] font-semibold tracking-[0.12em] uppercase leading-none text-white">
          SABIT
        </h1>

        <div className="w-20 h-px bg-white/40 mt-12" />

        <p
          className="text-[15px] max-w-xs mt-8 leading-relaxed"
          style={{ color: 'var(--text-inverse-secondary)' }}
        >
          Deterministic financial statements. Every dollar provably correct.
        </p>
      </div>

      {/* Right Panel -- Form */}
      <div
        className="w-full lg:w-[45%] flex items-center justify-center px-8 lg:px-16 shrink-0"
        style={{ backgroundColor: 'var(--bg-base)' }}
      >
        <div className="w-full max-w-[360px] animate-fade-in">
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Welcome back
          </h2>
          <p className="text-sm mt-2 mb-8" style={{ color: 'var(--text-secondary)' }}>
            Sign in to your account
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="login-email" className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
                className="w-full h-11 px-3 rounded-md text-sm focus-ring"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
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
            </div>

            {/* Advanced: Tenant ID */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-xs font-medium"
              style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', padding: 0 }}
            >
              Advanced
              <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showAdvanced && 'rotate-180')} />
            </button>
            {showAdvanced && (
              <div>
                <label htmlFor="login-tenant" className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  Tenant ID <span style={{ color: 'var(--text-tertiary)' }}>(optional)</span>
                </label>
                <input
                  id="login-tenant"
                  type="text"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  placeholder="tenant-uuid"
                  autoComplete="off"
                  className="w-full h-11 px-3 rounded-md text-sm focus-ring"
                />
              </div>
            )}

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
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</> : 'Sign In'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            Don&apos;t have an account?{' '}
            <Link href="/register" className="font-medium hover:underline" style={{ color: 'var(--interactive-primary)' }}>
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
