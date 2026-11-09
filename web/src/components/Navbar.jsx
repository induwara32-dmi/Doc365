'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Shield, Stethoscope, Pill, FlaskConical, User, LogOut, HeartPulse } from 'lucide-react';
import { getCurrentUser, clearSession } from '../lib/api';
import { useEffect, useState } from 'react';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    setUser(getCurrentUser());
  }, [pathname]);

  const handleLogout = () => {
    clearSession();
    setUser(null);
    router.push('/');
  };

  const navLinks = [
    { href: '/doctor', label: 'Doctor Portal', icon: Stethoscope },
    { href: '/lab', label: 'Laboratory', icon: FlaskConical },
    { href: '/pharmacy', label: 'Pharmacy', icon: Pill },
    { href: '/patient', label: 'Patient Portal', icon: User },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
            <HeartPulse className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-bold tracking-tight text-slate-900">Doc365</span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                Sri Lanka
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">National Trusted Health Network</p>
          </div>
        </Link>

        {/* Navigation Portals */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Active Session & Actions */}
        <div className="flex items-center gap-3">
          <Link
            href="/register"
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
              pathname === '/register'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                : 'border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span>Register / Join</span>
          </Link>

          {user ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right">
                <div className="text-xs font-bold text-slate-800 flex items-center justify-end gap-1">
                  <span>{user.role || 'Citizen'}</span>
                  {user.slmcNumber && (
                    <span className="text-[10px] font-mono px-1 rounded bg-emerald-100 text-emerald-800">
                      {user.slmcNumber}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 truncate max-w-[200px]">{user.fullName || user.label}</div>
              </div>
              <button
                onClick={handleLogout}
                title="Switch Account / Logout"
                className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors border border-slate-200"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              href="/"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
            >
              Demo Hub
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
