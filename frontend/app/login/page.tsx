'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Shield, ArrowRight, Play, User, Briefcase, Eye, TrendingUp } from 'lucide-react';

export default function LoginPage() {
  const { login, token, user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);

  // Already authenticated — redirect
  if (!authLoading && token) {
    if (user?.role === 'operating_partner' || user?.role === 'admin') {
      router.replace('/portfolio');
    } else {
      router.replace('/close');
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B0F1A]">
        <div className="animate-spin h-8 w-8 border-2 border-[#7C5CFC] border-t-transparent rounded-full" />
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

  const DEMO_ROLES = [
    { key: 'controller', label: 'Controller', name: 'Sarah Chen', email: 'controller@demo.sabit.io', icon: User, color: '#7C5CFC', desc: 'Full close workflow access' },
    { key: 'cfo', label: 'CFO', name: 'Michael Torres', email: 'cfo@demo.sabit.io', icon: Briefcase, color: '#34D399', desc: 'Review, certify & sign' },
    { key: 'auditor', label: 'Auditor', name: 'Emily Park', email: 'auditor@demo.sabit.io', icon: Eye, color: '#FBBF24', desc: 'Read-only audit access' },
    { key: 'partner', label: 'PE Partner', name: 'James Whitfield', email: 'partner@demo.sabit.io', icon: TrendingUp, color: '#F87171', desc: 'Portfolio-level view' },
  ] as const;

  const handleDemoLogin = async (demoEmail: string, roleKey: string) => {
    setError('');
    setDemoLoading(roleKey);
    try {
      localStorage.setItem('sabit_demo_mode', 'true');
      await login(demoEmail, 'SabitDemo2025!', 'apex-capital-partners');
    } catch (err: unknown) {
      localStorage.removeItem('sabit_demo_mode');
      setError(err instanceof Error ? err.message : 'Demo login failed');
    } finally {
      setDemoLoading(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0F1A] relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-[#7C5CFC]/5 blur-[120px]" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] rounded-full bg-[#7C5CFC]/3 blur-[100px]" />

      <div className="relative z-10 w-full max-w-[420px] mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#7C5CFC]/10 border border-[#7C5CFC]/20 mb-4">
            <Shield className="w-6 h-6 text-[#7C5CFC]" />
          </div>
          <h1 className="text-2xl font-semibold text-white tracking-[0.15em] uppercase">
            Sabit
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Financial Close Engine
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#141829] border border-[#262C48] rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-medium text-white mb-1">Sign in</h2>
          <p className="text-sm text-gray-500 mb-6">Enter your credentials to continue</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="w-full px-4 py-3 rounded-xl bg-[#0d1017] border border-[#1e2235] text-white text-sm placeholder:text-gray-600 focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/20 focus:outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-[#0d1017] border border-[#1e2235] text-white text-sm placeholder:text-gray-600 focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/20 focus:outline-none transition-all"
              />
            </div>

            <input type="hidden" value={tenantId} />

            {error && (
              <div className="px-4 py-3 rounded-xl text-sm bg-red-500/5 border border-red-500/20 text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-medium bg-[#7C5CFC] text-white hover:bg-[#6B4FE0] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-gray-600">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-[#7C5CFC] hover:text-white transition-colors">
            Register
          </Link>
        </p>

        {/* Demo section */}
        <div className="mt-6">
          {!showDemo ? (
            <button
              onClick={() => setShowDemo(true)}
              className="w-full py-3 rounded-xl text-sm font-medium bg-[#141829] border border-[#262C48] text-gray-400 hover:text-white hover:border-[#7C5CFC]/30 transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              Try Demo
            </button>
          ) : (
            <div className="bg-[#141829] border border-[#262C48] rounded-2xl p-5 shadow-2xl">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Demo Environment</p>
              <p className="text-[11px] text-gray-600 mb-4">Apex Capital Partners — 3 portfolio companies</p>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_ROLES.map((role) => {
                  const Icon = role.icon;
                  const isLoading = demoLoading === role.key;
                  return (
                    <button
                      key={role.key}
                      onClick={() => handleDemoLogin(role.email, role.key)}
                      disabled={!!demoLoading}
                      className="group relative flex flex-col items-start p-3 rounded-xl bg-[#0d1017] border border-[#1e2235] hover:border-[#7C5CFC]/40 transition-all text-left disabled:opacity-50"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: `${role.color}15`, border: `1px solid ${role.color}30` }}
                        >
                          {isLoading ? (
                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <Icon className="w-3.5 h-3.5" style={{ color: role.color }} />
                          )}
                        </div>
                        <span className="text-xs font-semibold text-white">{role.label}</span>
                      </div>
                      <p className="text-[10px] text-gray-500">{role.name}</p>
                      <p className="text-[9px] text-gray-700 mt-0.5">{role.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Trust badge */}
        <div className="mt-8 flex items-center justify-center gap-4 text-[10px] text-gray-700 uppercase tracking-wider">
          <span>Ed25519 Signed</span>
          <span className="w-1 h-1 rounded-full bg-gray-700" />
          <span>Hash-Chained Audit</span>
          <span className="w-1 h-1 rounded-full bg-gray-700" />
          <span>SOC 2 Ready</span>
        </div>
      </div>
    </div>
  );
}
