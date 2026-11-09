'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Stethoscope, Pill, FlaskConical, User, ShieldCheck, HeartPulse, ArrowRight, Lock, Key, AlertTriangle } from 'lucide-react';
import { DEMO_USERS, DEMO_PATIENTS } from '../lib/demo-data';
import { login, setSession } from '../lib/api';

export default function HomePage() {
  const router = useRouter();
  const [loadingUser, setLoadingUser] = useState(null);
  const [error, setError] = useState('');

  const handleQuickLogin = async (persona) => {
    setLoadingUser(persona.username);
    setError('');

    // Pre-configured local dev seed password
    const password = process.env.NEXT_PUBLIC_SEED_PASSWORD || 'hSk9SQ-yNLI3PBxm';

    const res = await login({
      username: persona.username,
      password,
      asPatient: persona.role === 'PATIENT',
    });

    setLoadingUser(null);

    if (res.ok) {
      router.push(persona.portalUrl);
    } else {
      setError(res.error?.message || 'Quick login failed. Make sure server is running and seeded.');
    }
  };

  return (
    <div className="space-y-12 pb-12">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white p-8 sm:p-12 shadow-2xl border border-emerald-500/20">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold tracking-wide">
            <HeartPulse className="w-4 h-4" />
            <span>Sri Lanka Digital Health Infrastructure</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
            One Health Card for Every Citizen. Verified Records for Every Doctor.
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Inspired by Germany (eGK + ePA) and Taiwan (MediCloud). When a doctor scans a patient&apos;s card,
            they see the patient&apos;s complete, cryptographic verified history across all hospitals and labs,
            while pharmacies receive strictly scoped prescription views.
          </p>
        </div>

        {/* Feature stats */}
        <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <div className="text-emerald-400 font-bold text-lg">Three Keys Rule</div>
            <div className="text-slate-400">Card + Doctor + Hospital required</div>
          </div>
          <div>
            <div className="text-emerald-400 font-bold text-lg">Ed25519 Verified</div>
            <div className="text-slate-400">Signed at facility, append-only</div>
          </div>
          <div>
            <div className="text-emerald-400 font-bold text-lg">Scoped Pharmacy</div>
            <div className="text-slate-400">Zero record leakage beyond Rx</div>
          </div>
          <div>
            <div className="text-emerald-400 font-bold text-lg">DDI Safety Engine</div>
            <div className="text-slate-400">Auto contraindication alerts</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 3 Core Role Portals */}
      <div>
        <div className="mb-6">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Explore Role-Based Portals</h2>
          <p className="text-xs text-slate-500">Launch any of the four authenticated interfaces using pre-seeded test personas.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {DEMO_USERS.map((persona) => {
            const isDoctor = persona.role === 'DOCTOR';
            const isPharm = persona.role === 'PHARMACIST';
            const isLab = persona.role === 'LAB_STAFF';
            const Icon = isDoctor ? Stethoscope : isPharm ? Pill : isLab ? FlaskConical : User;
            const accentBg = isDoctor
              ? 'from-emerald-50 to-teal-50/30'
              : isPharm
              ? 'from-sky-50 to-blue-50/30'
              : isLab
              ? 'from-amber-50 to-orange-50/30'
              : 'from-purple-50 to-indigo-50/30';
            const buttonColor = isDoctor
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : isPharm
              ? 'bg-sky-600 hover:bg-sky-700'
              : isLab
              ? 'bg-amber-600 hover:bg-amber-700'
              : 'bg-purple-600 hover:bg-purple-700';

            return (
              <div
                key={persona.username}
                className={`rounded-2xl border border-slate-200 bg-gradient-to-br ${accentBg} p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center border border-slate-200">
                      <Icon className="w-6 h-6 text-slate-800" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                      {persona.role}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 mb-1">{persona.fullName}</h3>
                  <div className="text-xs font-semibold text-slate-600 mb-2">
                    {persona.facility || 'Registered Citizen'}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mb-6">
                    {persona.description}
                  </p>
                </div>

                <div className="space-y-2 pt-4 border-t border-slate-200/60">
                  <button
                    onClick={() => handleQuickLogin(persona)}
                    disabled={loadingUser !== null}
                    className={`w-full py-2.5 px-4 rounded-xl text-white text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-2 ${buttonColor} disabled:opacity-50`}
                  >
                    <span>{loadingUser === persona.username ? 'Logging in...' : `Enter as ${persona.fullName}`}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <Link
                    href={persona.portalUrl}
                    className="block text-center text-[11px] font-semibold text-slate-500 hover:text-slate-800 py-1"
                  >
                    View Portal Direct &rarr;
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Seed Citizen Quick Reference */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Pre-Seeded Test Citizens (Luhn-Valid Demo Health IDs)</span>
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Use these simulated citizens when testing card scans, prescription authoring, and timeline reviews.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {DEMO_PATIENTS.map((p) => (
            <div key={p.healthId} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="font-bold text-slate-800">{p.shortName}</div>
              <div className="font-mono text-emerald-700 font-semibold">{p.healthId}</div>
              <div className="text-slate-500 text-[11px] mt-1">DOB: {p.dateOfBirth} &bull; {p.sex}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
