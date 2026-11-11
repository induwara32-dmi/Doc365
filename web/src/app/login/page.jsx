'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  HeartPulse,
  Lock,
  User,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  HelpCircle,
  Stethoscope,
  Pill,
  FlaskConical,
  CreditCard,
} from 'lucide-react';
import { login } from '../../lib/api';

const ROLE_PORTALS = {
  DOCTOR: '/doctor',
  PHARMACIST: '/pharmacy',
  LAB_STAFF: '/lab',
  PATIENT: '/patient',
};

export default function LoginPage() {
  const router = useRouter();

  const [from, setFrom] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDemoHelp, setShowDemoHelp] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setFrom(params.get('from') || '');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Please provide your username or Health ID and password.');
      return;
    }

    setLoading(true);
    setError('');

    const res = await login({
      username: identifier.trim(),
      password,
    });

    setLoading(false);

    if (res.ok && res.data?.session) {
      const userRole = res.data.session.role;
      const targetPortal = ROLE_PORTALS[userRole] || '/';

      // If redirected from a permitted portal, go there; otherwise go to user's assigned portal
      if (from && from.startsWith(targetPortal)) {
        router.push(from);
      } else {
        router.push(targetPortal);
      }
    } else {
      // Security best practice: avoid user enumeration
      setError('Invalid username, Health ID, or password. Please try again.');
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-xl bg-teal-600 items-center justify-center text-white shadow-sm mb-2">
            <HeartPulse className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sign in to Doc365</h1>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            Zero-trust national health record portal. Access is role-locked based on verified database credentials.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200/90 text-rose-800 text-xs flex items-center gap-2.5 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* Redirect Notice */}
        {from && !error && (
          <div className="p-3 rounded-xl bg-teal-50 border border-teal-200/80 text-teal-800 text-xs flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-600 flex-shrink-0" />
            <span>Authentication required to access clinical portal: <strong className="font-mono">{from}</strong></span>
          </div>
        )}

        {/* Unified Login Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-card p-7 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Identifier Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Username or Health ID
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. dr.perera or DEMO-100001-7"
                  autoComplete="username"
                  required
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-mono"
                />
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              </div>
              <p className="text-[11px] text-slate-400">
                Staff: use your facility username. Citizens: enter your Health ID or username.
              </p>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Password / Account PIN
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-mono"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              {loading ? (
                <span>Verifying credentials...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          {/* Citizen Self-Registration Link */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>New patient or citizen?</span>
            <Link href="/register" className="font-semibold text-teal-700 hover:text-teal-800">
              Register Health Card
            </Link>
          </div>
        </div>

        {/* Demo Credentials Reference Box (Collapsible for test verification) */}
        <div className="rounded-xl border border-slate-200 bg-white/70 p-4 text-xs text-slate-600 shadow-xs">
          <button
            type="button"
            onClick={() => setShowDemoHelp(!showDemoHelp)}
            className="w-full flex items-center justify-between font-medium text-slate-700 hover:text-slate-900"
          >
            <span className="flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-teal-600" />
              <span>Seeded Test Accounts & Credentials</span>
            </span>
            <span className="text-[10px] text-teal-700 underline font-normal">
              {showDemoHelp ? 'Hide' : 'Show'}
            </span>
          </button>

          {showDemoHelp && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 text-[11px] text-slate-600">
              <p className="text-[10px] text-slate-500 mb-1.5">
                All seeded accounts use password: <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 font-semibold">hSk9SQ-yNLI3PBxm</code>
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/60">
                  <div className="font-sans font-semibold text-slate-800 text-[10px] flex items-center gap-1">
                    <Stethoscope className="w-3 h-3 text-teal-600" /> Doctor
                  </div>
                  <div className="text-slate-700 mt-0.5">dr.perera</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/60">
                  <div className="font-sans font-semibold text-slate-800 text-[10px] flex items-center gap-1">
                    <Pill className="w-3 h-3 text-teal-600" /> Pharmacist
                  </div>
                  <div className="text-slate-700 mt-0.5">pharm.fernando</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/60">
                  <div className="font-sans font-semibold text-slate-800 text-[10px] flex items-center gap-1">
                    <FlaskConical className="w-3 h-3 text-teal-600" /> Lab MLT
                  </div>
                  <div className="text-slate-700 mt-0.5">mlt.silva</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/60">
                  <div className="font-sans font-semibold text-slate-800 text-[10px] flex items-center gap-1">
                    <CreditCard className="w-3 h-3 text-teal-600" /> Patient
                  </div>
                  <div className="text-slate-700 mt-0.5">kumari <span className="font-sans text-[10px] text-slate-400">or</span> DEMO-100001-7</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
