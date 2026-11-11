'use client';

import Link from 'next/link';
import {
  Stethoscope,
  Pill,
  FlaskConical,
  User,
  ShieldCheck,
  HeartPulse,
  ArrowRight,
  UserPlus,
  LogIn,
  FileCheck2,
} from 'lucide-react';
import { DEMO_PATIENTS } from '../lib/demo-data';

const ROLE_SPECS = [
  {
    role: 'DOCTOR',
    title: 'Clinical Command Center',
    actor: 'Licensed Medical Practitioners',
    icon: Stethoscope,
    boundary: 'Three Keys Access Rule',
    description:
      'Doctors can only open longitudinal records when an active 90-day AccessGrant is created via physical health card scan. Includes DDI safety engine and emergency break-glass override.',
    privileges: ['Card-tap consultation grant', 'DDI & allergy interaction alerts', 'FHIR e-prescriptions & lab orders'],
  },
  {
    role: 'PHARMACIST',
    title: 'Scoped Dispense POS Counter',
    actor: 'Registered Community Pharmacists',
    icon: Pill,
    boundary: 'Zero Record Leakage',
    description:
      'Pharmacies receive strictly scoped prescription payload data only. Full clinical history is completely hidden. Cryptographic 409 Conflict logic permanently prevents prescription reuse.',
    privileges: ['Scoped QR barcode scan', 'Refill schedule tracking', 'Cross-pharmacy re-dispense prevention'],
  },
  {
    role: 'LAB_STAFF',
    title: 'Diagnostic Laboratory Station',
    actor: 'Medical Laboratory Technologists',
    icon: FlaskConical,
    boundary: 'Facility-Signed Observations',
    description:
      'Diagnostic labs scan health cards to fulfill pending physician lab orders. Structured LOINC observations are cryptographically signed with the lab facility’s Ed25519 key.',
    privileges: ['Worklist queue & priority triage', 'Structured LOINC test results', 'Facility-level Ed25519 signing'],
  },
  {
    role: 'PATIENT',
    title: 'Citizen Health Record & Consent',
    actor: 'Every Sri Lankan Citizen',
    icon: User,
    boundary: 'Zero-Trust Patient Sovereignty',
    description:
      'Citizens own their data. Features an unalterable access ledger of every physician or facility lookup, document masking, provider blocking, and PIN-gated sensitive record security.',
    privileges: ['Apple Wallet-style digital card', 'Audit ledger of all record views', 'Sensitive record PIN protection'],
  },
];

export default function HomePage() {
  return (
    <div className="space-y-10 pb-12">
      {/* Hero Banner (Clean, Clinical-Grade Canvas) */}
      <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-card p-8 sm:p-12">
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-50/50 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="max-w-3xl space-y-5 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 border border-teal-200/70 text-teal-700 text-xs font-medium tracking-wide">
            <HeartPulse className="w-3.5 h-3.5 text-teal-600" />
            <span>Sri Lanka National Digital Health Infrastructure</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-slate-900 leading-tight">
            One Health Card for Every Citizen. Verified Records for Every Doctor.
          </h1>

          <p className="text-slate-600 text-sm sm:text-base leading-relaxed font-normal">
            A zero-trust, decentralized healthcare architecture inspired by Germany (eGK + ePA) and Taiwan (MediCloud).
            Each citizen carries a cryptographic health card key. Access is role-locked at the database level and verified on every request.
          </p>

          {/* Primary Action Buttons */}
          <div className="pt-2 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="px-6 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs sm:text-sm shadow-xs transition-all flex items-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In to Your Portal</span>
            </Link>
            <Link
              href="/register"
              className="px-6 py-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-medium text-xs sm:text-sm transition-all flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4 text-slate-500" />
              <span>Register New Health Card</span>
            </Link>
          </div>
        </div>

        {/* Feature stats */}
        <div className="mt-10 pt-6 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs relative z-10">
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

      {/* Role Architecture & Zero-Trust Boundaries (Informational - No Bypass Cards) */}
      <div>
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 uppercase tracking-wider mb-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Zero-Trust RBAC Specification</span>
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">Role-Isolated Healthcare Portals</h2>
            <p className="text-xs text-slate-500">
              Users log in with their database credentials and are automatically routed strictly to their authorized interface.
            </p>
          </div>
          <Link
            href="/login"
            className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1"
          >
            <span>Proceed to Login</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {ROLE_SPECS.map((spec) => {
            const Icon = spec.icon;
            return (
              <div
                key={spec.role}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-card flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-100/80 flex items-center justify-center text-teal-700 shadow-xs">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200/80 text-slate-700 font-mono">
                      {spec.role}
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-slate-900 mb-0.5">{spec.title}</h3>
                  <div className="text-xs font-medium text-teal-700 mb-2">
                    {spec.actor}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mb-4 font-normal">
                    {spec.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                    Core Capabilities:
                  </div>
                  <ul className="text-[11px] text-slate-500 space-y-1.5">
                    {spec.privileges.map((p, idx) => (
                      <li key={idx} className="flex items-center gap-1.5">
                        <FileCheck2 className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Citizen Health Card Registration Banner */}
      <div className="p-8 rounded-2xl bg-gradient-to-r from-teal-50/70 via-white to-slate-50 border border-teal-200/80 shadow-card flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-teal-100/80 text-teal-800 text-xs font-medium">
            <UserPlus className="w-3.5 h-3.5 text-teal-700" />
            <span>Citizen Health Card Onboarding</span>
          </div>
          <h3 className="text-xl font-semibold tracking-tight text-slate-900">Are You a Patient or Citizen?</h3>
          <p className="text-xs sm:text-sm text-slate-600 max-w-xl font-normal leading-relaxed">
            Register your digital profile with your Sri Lankan NIC to instantly receive a verifiable Luhn-checked Health ID and active digital smart card.
          </p>
        </div>
        <Link
          href="/register"
          className="flex-shrink-0 px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs shadow-xs transition-all flex items-center gap-2"
        >
          <span>Register Health Card</span>
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
