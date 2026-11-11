'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Stethoscope, Pill, FlaskConical, User, ShieldCheck, HeartPulse, ArrowRight, AlertTriangle, UserPlus } from 'lucide-react';
import { DEMO_USERS, DEMO_PATIENTS } from '../lib/demo-data';
import { login } from '../lib/api';

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
    <div className="space-y-10 pb-12">
      {/* Hero Banner (Clean, Clinical-Grade Canvas) */}
      <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-card p-8 sm:p-12">
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-50/50 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="max-w-3xl space-y-4 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 border border-teal-200/70 text-teal-700 text-xs font-medium tracking-wide">
            <HeartPulse className="w-3.5 h-3.5 text-teal-600" />
            <span>Sri Lanka Digital Health Infrastructure</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-slate-900 leading-tight">
            One Health Card for Every Citizen. Verified Records for Every Doctor.
          </h1>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed font-normal">
            Inspired by Germany (eGK + ePA) and Taiwan (MediCloud). When a doctor scans a patient&apos;s card,
            they see the patient&apos;s complete, cryptographic verified history across all hospitals and labs,
            while pharmacies receive strictly scoped prescription views.
          </p>
        </div>

        {/* Feature stats */}
        <div className="mt-8 pt-6 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs relative z-10">
          <div>
            <div className="text-teal-700 font-semibold text-lg">Three Keys Rule</div>
            <div className="text-slate-500 font-normal">Card + Doctor + Hospital required</div>
          </div>
          <div>
            <div className="text-teal-700 font-semibold text-lg">Ed25519 Verified</div>
            <div className="text-slate-500 font-normal">Signed at facility, append-only</div>
          </div>
          <div>
            <div className="text-teal-700 font-semibold text-lg">Scoped Pharmacy</div>
            <div className="text-slate-500 font-normal">Zero record leakage beyond Rx</div>
          </div>
          <div>
            <div className="text-teal-700 font-semibold text-lg">DDI Safety Engine</div>
            <div className="text-slate-500 font-normal">Auto contraindication alerts</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200/80 text-rose-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 4 Core Role Portals */}
      <div>
        <div className="mb-6">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Explore Role-Based Portals</h2>
          <p className="text-xs text-slate-500">Launch any of the four authenticated interfaces using pre-seeded test personas.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {DEMO_USERS.map((persona) => {
            const isDoctor = persona.role === 'DOCTOR';
            const isPharm = persona.role === 'PHARMACIST';
            const isLab = persona.role === 'LAB_STAFF';
            const Icon = isDoctor ? Stethoscope : isPharm ? Pill : isLab ? FlaskConical : User;

            return (
              <div
                key={persona.username}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-card hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-100/80 flex items-center justify-center text-teal-700">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200/80 text-slate-600">
                      {persona.role}
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-slate-900 mb-0.5">{persona.fullName}</h3>
                  <div className="text-xs font-medium text-slate-500 mb-2">
                    {persona.facility || 'Registered Citizen'}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mb-6 font-normal">
                    {persona.description}
                  </p>
                </div>

                <div className="space-y-2 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => handleQuickLogin(persona)}
                    disabled={loadingUser !== null}
                    className="w-full py-2.5 px-4 rounded-lg text-white text-xs font-medium shadow-xs transition-all flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50"
                  >
                    <span>{loadingUser === persona.username ? 'Logging in...' : `Enter as ${persona.fullName}`}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <Link
                    href={persona.portalUrl}
                    className="block text-center text-[11px] font-medium text-slate-500 hover:text-slate-800 py-1 transition-colors"
                  >
                    View Portal Direct &rarr;
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Multi-Tenant Registration & Onboarding Banner */}
      <div className="p-8 rounded-2xl bg-gradient-to-r from-teal-50/70 via-white to-slate-50 border border-teal-200/80 shadow-card flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-teal-100/80 text-teal-800 text-xs font-medium">
            <UserPlus className="w-3.5 h-3.5 text-teal-700" />
            <span>Multi-Tenant Role Onboarding</span>
          </div>
          <h3 className="text-xl font-semibold tracking-tight text-slate-900">Register Your Account or Healthcare Facility</h3>
          <p className="text-xs sm:text-sm text-slate-600 max-w-xl font-normal leading-relaxed">
            Self-service onboarding for Citizens (with Luhn Health ID generation), Doctors (SLMC credentials), Pharmacies (NMRA license), and Diagnostic Labs (PHSRC accreditation).
          </p>
        </div>
        <Link
          href="/register"
          className="flex-shrink-0 px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs shadow-xs transition-all flex items-center gap-2"
        >
          <span>Open Registration Hub</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Seed Citizen Quick Reference */}
      <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-card">
        <h3 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-teal-600" />
          <span>Pre-Seeded Test Citizens (Luhn-Valid Demo Health IDs)</span>
        </h3>
        <p className="text-xs text-slate-500 mb-4 font-normal">
          Use these simulated citizens when testing card scans, prescription authoring, and timeline reviews.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {DEMO_PATIENTS.map((p) => (
            <div key={p.healthId} className="p-3.5 rounded-lg bg-slate-50/80 border border-slate-200/70">
              <div className="font-semibold text-slate-900">{p.shortName}</div>
              <div className="font-mono text-teal-700 font-medium text-xs mt-0.5">{p.healthId}</div>
              <div className="text-slate-500 text-[11px] mt-1">DOB: {p.dateOfBirth} &bull; {p.sex}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
