'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { getDefaultLandingPage } from '@/lib/permissions';
import { Eye, EyeOff, AlertCircle, Shield, Lock, CheckCircle, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const { login, token, user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Already authenticated — redirect away from login
  if (!authLoading && token) {
    router.replace(getDefaultLandingPage(user?.role ?? 'controller'));
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-base)',
        }}
      >
        <Loader2
          style={{ width: 32, height: 32, color: 'var(--interactive-primary)' }}
          className="animate-spin"
        />
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
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* Left Panel — Brand */}
      <div
        style={{
          width: '55%',
          backgroundColor: 'var(--bg-nav)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 80px',
          flexShrink: 0,
        }}
      >
        <h1
          style={{
            fontSize: 42,
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: 'white',
            textTransform: 'uppercase',
            fontFamily: 'Inter, sans-serif',
            margin: 0,
            lineHeight: 1,
          }}
        >
          SABIT
        </h1>
        <p
          style={{
            fontSize: 16,
            fontWeight: 400,
            letterSpacing: '0.08em',
            color: 'var(--text-inverse-secondary)',
            textTransform: 'uppercase',
            margin: '12px 0 0 0',
            lineHeight: 1.4,
          }}
        >
          Financial Close Engine
        </p>

        {/* Separator line */}
        <div
          style={{
            width: 80,
            height: 1,
            backgroundColor: 'white',
            opacity: 0.4,
            marginTop: 48,
          }}
        />

        {/* Tagline */}
        <p
          style={{
            fontSize: 15,
            maxWidth: 320,
            color: 'var(--text-inverse-secondary)',
            marginTop: 32,
            lineHeight: 1.6,
          }}
        >
          Deterministic financial statements. Every dollar provably correct.
        </p>
      </div>

      {/* Right Panel — Form */}
      <div
        style={{
          width: '45%',
          backgroundColor: 'var(--bg-base)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 64px',
          flexShrink: 0,
        }}
      >
        <div style={{ width: '100%', maxWidth: 360 }}>
          <h2
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            Sign In
          </h2>
          <p
            style={{
              fontSize: 14,
              color: 'var(--text-secondary)',
              marginTop: 8,
              marginBottom: 32,
            }}
          >
            Enter your credentials to continue.
          </p>

          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div>
              <label
                htmlFor="login-email"
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  marginBottom: 6,
                }}
              >
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
                style={{
                  width: '100%',
                  height: 44,
                  backgroundColor: 'var(--bg-surface-sunken)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 6,
                  padding: '0 12px',
                  fontSize: 14,
                  color: 'var(--text-primary)',
                  outline: 'none',
                  transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-focus)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26,95,180,0.12)';
                  e.currentTarget.style.backgroundColor = 'white';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-default)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.backgroundColor = 'var(--bg-surface-sunken)';
                }}
              />
            </div>

            {/* Password */}
            <div style={{ marginTop: 20 }}>
              <label
                htmlFor="login-password"
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  marginBottom: 6,
                }}
              >
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{
                    width: '100%',
                    height: 44,
                    backgroundColor: 'var(--bg-surface-sunken)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 6,
                    padding: '0 40px 0 12px',
                    fontSize: 14,
                    color: 'var(--text-primary)',
                    outline: 'none',
                    transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-focus)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26,95,180,0.12)';
                    e.currentTarget.style.backgroundColor = 'white';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-default)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.backgroundColor = 'var(--bg-surface-sunken)';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  {showPassword ? (
                    <EyeOff style={{ width: 20, height: 20 }} />
                  ) : (
                    <Eye style={{ width: 20, height: 20 }} />
                  )}
                </button>
              </div>
            </div>

            {/* Forgot password link */}
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <a
                href="#"
                style={{
                  fontSize: 13,
                  color: 'var(--text-link)',
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.textDecoration = 'underline';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.textDecoration = 'none';
                }}
              >
                Forgot password?
              </a>
            </div>

            {/* Tenant ID hidden by default — only needed for multi-tenant switching */}
            <input type="hidden" value={tenantId} />

            {/* Error state */}
            {error && (
              <div
                style={{
                  marginTop: 12,
                  backgroundColor: 'var(--status-error-bg)',
                  border: '1px solid var(--status-error-border)',
                  borderRadius: 6,
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                }}
              >
                <AlertCircle
                  style={{
                    width: 16,
                    height: 16,
                    color: 'var(--status-error)',
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                />
                <span
                  style={{
                    fontSize: 13,
                    color: 'var(--status-error)',
                    lineHeight: 1.4,
                  }}
                >
                  {error}
                </span>
              </div>
            )}

            {/* Sign In button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 32,
                width: '100%',
                height: 48,
                backgroundColor: 'var(--interactive-primary)',
                color: 'white',
                fontSize: 15,
                fontWeight: 600,
                border: 'none',
                borderRadius: 6,
                cursor: loading ? 'default' : 'pointer',
                pointerEvents: loading ? 'none' : 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'background-color var(--transition-fast)',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = 'var(--interactive-primary-hover)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--interactive-primary)';
              }}
            >
              {loading ? (
                <>
                  <Loader2
                    style={{ width: 16, height: 16 }}
                    className="animate-spin"
                  />
                  Signing In...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Divider */}
          <div
            style={{
              marginTop: 24,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                flex: 1,
                height: 1,
                backgroundColor: 'var(--border-default)',
              }}
            />
            <span
              style={{
                fontSize: 12,
                color: 'var(--text-tertiary)',
              }}
            >
              or
            </span>
            <div
              style={{
                flex: 1,
                height: 1,
                backgroundColor: 'var(--border-default)',
              }}
            />
          </div>

          {/* SSO button */}
          <button
            type="button"
            style={{
              marginTop: 16,
              width: '100%',
              height: 44,
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              transition: 'background-color var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--interactive-secondary-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
            }}
          >
            Continue with SSO
          </button>

          {/* Security badges */}
          <div
            style={{
              marginTop: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Shield style={{ width: 14, height: 14, color: 'var(--text-tertiary)' }} />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  color: 'var(--text-tertiary)',
                }}
              >
                SOC 2 Type II
              </span>
            </span>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>&nbsp;|&nbsp;</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Lock style={{ width: 14, height: 14, color: 'var(--text-tertiary)' }} />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  color: 'var(--text-tertiary)',
                }}
              >
                256-bit Encryption
              </span>
            </span>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>&nbsp;|&nbsp;</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <CheckCircle style={{ width: 14, height: 14, color: 'var(--text-tertiary)' }} />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  color: 'var(--text-tertiary)',
                }}
              >
                AICPA Compliant
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
