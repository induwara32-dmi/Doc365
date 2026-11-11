'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Stethoscope, Pill, FlaskConical, User, LogOut, HeartPulse } from 'lucide-react';
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

        {/* Navigation Portals */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/60">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-white text-teal-800 shadow-xs border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-teal-600' : 'text-slate-400'}`} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Active Session & Actions */}
        <div className="flex items-center gap-3">
          <Link
            href="/register"
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
              pathname === '/register'
                ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span>Register / Join</span>
          </Link>

          {user ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right">
                <div className="text-xs font-semibold text-slate-800 flex items-center justify-end gap-1">
                  <span>{user.role || 'Citizen'}</span>
                  {user.slmcNumber && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-teal-50 text-teal-700 border border-teal-200/60">
                      {user.slmcNumber}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 truncate max-w-[180px]">{user.fullName || user.label}</div>
              </div>
              <button
                onClick={handleLogout}
                title="Switch Account / Logout"
                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors border border-slate-200/80"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              href="/"
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white shadow-xs transition-colors"
            >
              Demo Hub
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
