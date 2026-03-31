'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';
import {
  Shield,
  UserPlus,
  AlertCircle,
  ChevronDown,
  Clock,
  Zap,
} from 'lucide-react';

const ROLES = [
  'Controller',
  'CFO',
  'Staff Accountant',
  'Admin',
] as const;

interface RegisterResponse {
  token?: string;
  user?: {
    userId: string;
    tenantId: string;
    role: string;
    email: string;
    name: string;
  };
  message?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('');

  const registerMutation = useMutation({
    mutationFn: () =>
      apiFetch<RegisterResponse>('/api/auth/register', {
        method: 'POST',
        body: { companyName, name, email, password, role },
      }),
    onSuccess: () => {
      router.push('/onboarding');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate();
  };

  const errorMessage =
    registerMutation.error instanceof ApiError
      ? registerMutation.error.message
      : registerMutation.error
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
            Start your first certified close.
          </h1>

          {/* Subtitle */}
          <div className="mt-6 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#B8860B]/10 flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4 text-[#B8860B]/70" />
            </div>
            <span className="text-[#B8860B]/80 text-lg font-normal">
              2 hours to setup. Not 2 days.
            </span>
          </div>

          {/* Highlights */}
          <ul className="mt-12 space-y-5">
            {[
              'Upload your GL and map in minutes',
              'Deterministic statement generation',
              'Cryptographically signed certification',
              'Complete audit trail from day one',
            ].map((text) => (
              <li key={text} className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-lg bg-[#B8860B]/10 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-4 h-4 text-[#B8860B]/70" />
                </div>
                <span className="text-[#F5F0E8]/70 text-sm font-normal">
                  {text}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom */}
        <div className="border-t border-[#B8860B]/15 pt-6">
          <span className="text-[#F5F0E8]/40 text-xs font-normal tracking-wide uppercase">
            No credit card required
          </span>
        </div>
      </div>

      {/* RIGHT — Registration form */}
      <div className="flex-1 flex items-center justify-center bg-[#F5F0E8] px-6 py-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <Shield className="w-5 h-5 text-[#B8860B]" />
            <span className="text-[#B8860B] text-lg font-medium">SABIT</span>
          </div>

          <h2 className="text-2xl font-medium text-[#2C2416] mb-1">
            Create your workspace
          </h2>
          <p className="text-sm text-[#8B7A5E] mb-8">
            Set up your financial close environment
          </p>

          {/* Error banner */}
          {errorMessage && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-[#C44B2B]/20 bg-[#C44B2B]/5 px-4 py-3">
              <AlertCircle className="w-4 h-4 text-[#C44B2B] mt-0.5 flex-shrink-0" />
              <p className="text-sm text-[#C44B2B]">{errorMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Company name */}
            <div>
              <label
                htmlFor="companyName"
                className="block text-sm font-medium text-[#2C2416] mb-1.5"
              >
                Company name
              </label>
              <input
                id="companyName"
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Holdings LLC"
                className="w-full rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] px-4 py-2.5 text-sm text-[#2C2416] placeholder:text-[#8B7A5E]/50 focus:outline-none focus:ring-2 focus:ring-[#B8860B]/30 focus:border-[#B8860B] transition-colors"
              />
            </div>

            {/* Name */}
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-[#2C2416] mb-1.5"
              >
                Your name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                autoComplete="name"
                className="w-full rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] px-4 py-2.5 text-sm text-[#2C2416] placeholder:text-[#8B7A5E]/50 focus:outline-none focus:ring-2 focus:ring-[#B8860B]/30 focus:border-[#B8860B] transition-colors"
              />
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-[#2C2416] mb-1.5"
              >
                Work email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@company.com"
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
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                autoComplete="new-password"
                minLength={8}
                className="w-full rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] px-4 py-2.5 text-sm text-[#2C2416] placeholder:text-[#8B7A5E]/50 focus:outline-none focus:ring-2 focus:ring-[#B8860B]/30 focus:border-[#B8860B] transition-colors"
              />
            </div>

            {/* Role dropdown */}
            <div>
              <label
                htmlFor="role"
                className="block text-sm font-medium text-[#2C2416] mb-1.5"
              >
                Role
              </label>
              <div className="relative">
                <select
                  id="role"
                  required
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] px-4 py-2.5 pr-10 text-sm text-[#2C2416] focus:outline-none focus:ring-2 focus:ring-[#B8860B]/30 focus:border-[#B8860B] transition-colors"
                >
                  <option value="" disabled>
                    Select your role
                  </option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B7A5E] pointer-events-none" />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full rounded-lg bg-[#B8860B] px-4 py-2.5 text-sm font-medium text-[#F5F0E8] hover:bg-[#B8860B]/90 focus:outline-none focus:ring-2 focus:ring-[#B8860B]/50 focus:ring-offset-2 focus:ring-offset-[#F5F0E8] disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {registerMutation.isPending ? (
                <span className="inline-block w-4 h-4 border-2 border-[#F5F0E8]/30 border-t-[#F5F0E8] rounded-full animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              {registerMutation.isPending
                ? 'Creating workspace...'
                : 'Create Workspace & Start Setup'}
            </button>
          </form>

          {/* Sign in link */}
          <p className="mt-8 text-center text-sm text-[#8B7A5E]">
            Already have a workspace?{' '}
            <a
              href="/login"
              className="text-[#3B6EA5] font-medium hover:underline"
            >
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
