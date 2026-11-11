'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Stethoscope,
  Pill,
  FlaskConical,
  User,
  LogOut,
  HeartPulse,
  LogIn,
  UserPlus,
  ShieldAlert,
} from 'lucide-react';
import { getCurrentUser, clearSession } from '../lib/api';
import { useEffect, useState } from 'react';

const ROLE_CONFIGS = {
  DOCTOR: { href: '/doctor', label: 'Doctor Command Center', icon: Stethoscope },
  PHARMACIST: { href: '/pharmacy', label: 'Pharmacy POS Counter', icon: Pill },
  LAB_STAFF: { href: '/lab', label: 'Laboratory Workstation', icon: FlaskConical },
  PATIENT: { href: '/patient', label: 'My Health Portal', icon: User },
};

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    setUser(getCurrentUser());
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setAccessDenied(params.get('denied') === '1');
    }
  }, [pathname]);

  const handleLogout = () => {
    clearSession();
    setUser(null);
    router.push('/login');
  };

  const activePortalConfig = user?.role ? ROLE_CONFIGS[user.role] : null;

  return (
    <>
      {accessDenied && (
        <div className="bg-amber-500 text-white text-xs px-4 py-2 text-center font-medium flex items-center justify-center gap-2 shadow-xs">
          <ShieldAlert className="w-4 h-4 text-white" />
          <span>Access Restricted: You were automatically redirected to your authorized portal.</span>
        </div>
      )}

      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center text-white shadow-sm group-hover:bg-teal-700 transition-colors">
              <HeartPulse className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold tracking-tight text-slate-900">Doc365</span>
                <span className="text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200/70">
                  Sri Lanka
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-normal leading-none mt-0.5">National Trusted Health Network</p>
            </div>
          </Link>

          {/* Active Portal Navigation (Role-Locked for Authenticated User) */}
          {user && activePortalConfig ? (
            <nav className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/60">
              <Link
                href={activePortalConfig.href}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white text-teal-800 shadow-xs border border-slate-200/60 transition-all"
              >
                <activePortalConfig.icon className="w-3.5 h-3.5 text-teal-600" />
                <span>{activePortalConfig.label}</span>
              </Link>
            </nav>
          ) : (
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Zero-Trust Decentralized Health Platform</span>
            </div>
          )}

          {/* Session & Action Controls */}
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:block text-right">
                  <div className="text-xs font-semibold text-slate-800 flex items-center justify-end gap-1.5">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200/60 font-semibold uppercase">
                      {user.role}
                    </span>
                    {user.slmcNumber && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
                        SLMC: {user.slmcNumber}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate max-w-[180px] mt-0.5 font-medium">
                    {user.fullName || user.label}
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  title="Sign Out"
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-rose-700 hover:bg-rose-50 transition-colors border border-slate-200 text-xs font-medium flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5 text-slate-400 group-hover:text-rose-600" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/register"
                  className={`text-xs font-medium px-3.5 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                    pathname === '/register'
                      ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5 text-slate-500" />
                  <span>Register Health Card</span>
                </Link>
                <Link
                  href="/login"
                  className="text-xs font-medium px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
