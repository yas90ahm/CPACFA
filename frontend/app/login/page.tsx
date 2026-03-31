'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';
import {
  Shield,
  Link2,
  Cpu,
  Users,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  Building2,
  AlertCircle,
} from 'lucide-react';

interface LoginResponse {
  token: string;
  user: {
    userId: string;
    tenantId: string;
    role: string;
    email: string;
    name: string;
  };
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const loginMutation = useMutation({
    mutationFn: () =>
      apiFetch<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      }),
    onSuccess: (data) => {
      localStorage.setItem('cpa_auth_token', data.token);
      localStorage.setItem('cpa_auth_user', JSON.stringify(data.user));
      router.push('/close');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate();
  };

  const errorMessage =
    loginMutation.error instanceof ApiError
      ? loginMutation.error.message
      : loginMutation.error
        ? 'An unexpected error occurred. Please try again.'
        : null;

  return (
    <div className="min-h-screen flex">
      {/* LEFT — Brand panel */}
      <div className="hidden lg:flex flex-1 flex-col justify-between bg-[#2C2416] p-12 xl:p-16">
        <div>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 rounded-lg bg-[#B8860B]/15 flex items-center justify-center">
              <Shield className="w-5 h-5 text-[#B8860B]" />
            </div>
            <span className="text-[#B8860B] text-xl font-medium tracking-tight">
              SABIT
            </span>
          </div>

          {/* Hero */}
          <h1 className="text-[#B8860B] text-3xl xl:text-4xl font-medium leading-tight max-w-md">
            Deterministic financial statements. Every dollar provably correct.
          </h1>

          {/* Bullet points */}
          <ul className="mt-12 space-y-5">
            {[
              {
                icon: Shield,
                text: 'Ed25519 digital certification',
              },
              {
                icon: Link2,
                text: 'Hash-chained audit trail',
              },
              {
                icon: Cpu,
                text: '13 ASC codification modules',
              },
              {
                icon: Users,
                text: 'AI advisory with human-in-the-loop',
              },
            ].map((item) => (
              <li key={item.text} className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-lg bg-[#B8860B]/10 flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-4 h-4 text-[#B8860B]/70" />
                </div>
                <span className="text-[#F5F0E8]/70 text-sm font-normal">
                  {item.text}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Trust bar */}
        <div className="border-t border-[#B8860B]/15 pt-6">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#B8860B]/40" />
            <span className="text-[#F5F0E8]/40 text-xs font-normal tracking-wide uppercase">
              Trusted by PE-backed companies
            </span>
          </div>
        </div>
      </div>

      {/* RIGHT — Login form */}
      <div className="flex-1 flex items-center justify-center bg-[#F5F0E8] px-6 py-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <Shield className="w-5 h-5 text-[#B8860B]" />
            <span className="text-[#B8860B] text-lg font-medium">SABIT</span>
          </div>

          <h2 className="text-2xl font-medium text-[#2C2416] mb-1">
            Welcome back
          </h2>
          <p className="text-sm text-[#8B7A5E] mb-8">
            Sign in to your workspace
          </p>

          {/* Error banner */}
          {errorMessage && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-[#C44B2B]/20 bg-[#C44B2B]/5 px-4 py-3">
              <AlertCircle className="w-4 h-4 text-[#C44B2B] mt-0.5 flex-shrink-0" />
              <p className="text-sm text-[#C44B2B]">{errorMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-[#2C2416] mb-1.5"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="controller@company.com"
                autoComplete="email"
                className="w-full rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] px-4 py-2.5 text-sm text-[#2C2416] placeholder:text-[#8B7A5E]/50 focus:outline-none focus:ring-2 focus:ring-[#B8860B]/30 focus:border-[#B8860B] transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-[#2C2416] mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] px-4 py-2.5 pr-11 text-sm text-[#2C2416] placeholder:text-[#8B7A5E]/50 focus:outline-none focus:ring-2 focus:ring-[#B8860B]/30 focus:border-[#B8860B] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B7A5E] hover:text-[#2C2416] transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full rounded-lg bg-[#B8860B] px-4 py-2.5 text-sm font-medium text-[#F5F0E8] hover:bg-[#B8860B]/90 focus:outline-none focus:ring-2 focus:ring-[#B8860B]/50 focus:ring-offset-2 focus:ring-offset-[#F5F0E8] disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loginMutation.isPending ? (
                <span className="inline-block w-4 h-4 border-2 border-[#F5F0E8]/30 border-t-[#F5F0E8] rounded-full animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loginMutation.isPending ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#DDD5C2]" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-[#F5F0E8] px-4 text-xs text-[#8B7A5E] uppercase tracking-wider">
                or
              </span>
            </div>
          </div>

          {/* SSO */}
          <button
            type="button"
            className="w-full rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] px-4 py-2.5 text-sm font-medium text-[#2C2416] hover:bg-[#DDD5C2]/50 focus:outline-none focus:ring-2 focus:ring-[#B8860B]/30 transition-colors flex items-center justify-center gap-2"
          >
            <Building2 className="w-4 h-4 text-[#8B7A5E]" />
            Continue with SSO
          </button>

          {/* Security badges */}
          <div className="mt-10 flex items-center justify-center gap-6">
            {[
              { icon: Lock, label: '256-bit TLS' },
              { icon: Shield, label: 'SOC 2 Type II' },
              { icon: Building2, label: 'Multi-tenant' },
            ].map((badge) => (
              <div
                key={badge.label}
                className="flex items-center gap-1.5 text-[#8B7A5E]/60"
              >
                <badge.icon className="w-3 h-3" />
                <span className="text-xs">{badge.label}</span>
              </div>
            ))}
          </div>

          {/* Register link */}
          <p className="mt-8 text-center text-sm text-[#8B7A5E]">
            No workspace yet?{' '}
            <a
              href="/register"
              className="text-[#3B6EA5] font-medium hover:underline"
            >
              Create one
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
