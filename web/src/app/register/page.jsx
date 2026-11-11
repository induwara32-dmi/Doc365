'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  User,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  CreditCard,
  Building2,
  LogIn,
  Info,
} from 'lucide-react';
import { registerPatient } from '../../lib/api';

export default function RegisterPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Citizen / Patient Form
  const [patientForm, setPatientForm] = useState({
    givenName: '',
    familyName: '',
    fullName: '',
    dateOfBirth: '1995-05-15',
    sex: 'female',
    nic: '',
    username: '',
    password: '',
  });

  const handlePatientSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await registerPatient(patientForm);
    setLoading(false);

    if (res.ok) {
      setSuccess(
        `Registration successful! Generated Health ID: ${res.data.patient.healthId}. Redirecting to your Patient Portal...`
      );
      setTimeout(() => router.push('/patient'), 1500);
    } else {
      setError(res.error?.message || 'Patient registration failed');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 text-teal-800 border border-teal-200/70 text-xs font-medium tracking-wide">
          <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
          <span>National Digital Health Onboarding</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-semibold text-slate-900 tracking-tight">
          Citizen Health Card Registration
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto font-normal">
          Register for your lifelong Digital Health Card with your Sri Lankan National Identity Card (NIC).
        </p>
      </div>

      {/* Feedback Messages */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200/80 text-rose-800 text-xs flex items-center gap-2 animate-in fade-in">
          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-900 text-xs flex items-center gap-2 font-medium animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
          <span>{success}</span>
        </div>
      )}

      {/* Main Registration Form */}
      <div className="p-6 sm:p-8 rounded-2xl bg-white border border-slate-200/90 shadow-card">
        <form onSubmit={handlePatientSubmit} className="space-y-5">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <User className="w-5 h-5 text-teal-600" />
                <span>Citizen / Patient Details</span>
              </h2>
              <p className="text-xs text-slate-500 font-normal">
                Generates a verified Luhn-checked Health ID and active digital smart card key.
              </p>
            </div>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-700 font-semibold">
              Self-Service
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Given Name(s)</label>
              <input
                type="text"
                required
                placeholder="e.g. Kumari"
                value={patientForm.givenName}
                onChange={(e) => setPatientForm({ ...patientForm, givenName: e.target.value })}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 text-slate-900 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Family / Surname</label>
              <input
                type="text"
                required
                placeholder="e.g. Jayasinghe"
                value={patientForm.familyName}
                onChange={(e) => setPatientForm({ ...patientForm, familyName: e.target.value })}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 text-slate-900 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Full Official Name <span className="text-slate-400 font-normal">(as on NIC or Birth Certificate)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Herath Mudiyanselage Kumari Jayasinghe"
              value={patientForm.fullName}
              onChange={(e) => setPatientForm({ ...patientForm, fullName: e.target.value })}
              className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 text-slate-900 transition-all"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Date of Birth</label>
              <input
                type="date"
                required
                value={patientForm.dateOfBirth}
                onChange={(e) => setPatientForm({ ...patientForm, dateOfBirth: e.target.value })}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 text-slate-900 font-mono transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Administrative Sex</label>
              <select
                value={patientForm.sex}
                onChange={(e) => setPatientForm({ ...patientForm, sex: e.target.value })}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 text-slate-900 transition-all"
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Sri Lankan NIC <span className="text-slate-400 font-normal">(Optional for children)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. DEMO-NIC-199571500345"
                value={patientForm.nic}
                onChange={(e) => setPatientForm({ ...patientForm, nic: e.target.value })}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 text-slate-900 font-mono transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Login Username</label>
              <input
                type="text"
                required
                placeholder="e.g. kumari95"
                value={patientForm.username}
                onChange={(e) => setPatientForm({ ...patientForm, username: e.target.value })}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 text-slate-900 font-mono transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Account Password (min. 8 characters)</label>
              <input
                type="password"
                required
                minLength={8}
                placeholder="••••••••••••"
                value={patientForm.password}
                onChange={(e) => setPatientForm({ ...patientForm, password: e.target.value })}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 text-slate-900 font-mono transition-all"
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between border-t border-slate-100">
            <Link href="/login" className="text-xs text-slate-500 hover:text-slate-800">
              Already registered? <strong className="text-teal-700 font-semibold">Sign In</strong>
            </Link>

            <button
              type="submit"
              disabled={loading}
              className="py-2.5 px-6 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium shadow-xs transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <span>{loading ? 'Creating Health Record...' : 'Complete Registration & Issue Card'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>

      {/* Staff & Facility Onboarding Notice */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card space-y-3">
        <div className="flex items-center gap-2.5 text-slate-900 font-semibold text-sm">
          <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
            <Building2 className="w-4 h-4" />
          </div>
          <span>Staff & Clinical Facility Onboarding</span>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed font-normal">
          In compliance with Sri Lankan zero-trust healthcare governance, accounts for <strong>Doctors (SLMC)</strong>,{' '}
          <strong>Pharmacists (NMRA)</strong>, and <strong>Medical Laboratory Technologists (PHSRC)</strong> cannot be self-registered from public portals.
          Clinical staff accounts must be verified and provisioned through your institution’s System Administrator or the Ministry of Health Regulatory Registry.
        </p>

        <div className="pt-2 flex items-center justify-between text-xs">
          <span className="text-slate-500">Already have clinical credentials provisioned?</span>
          <Link
            href="/login"
            className="font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1.5"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Go to Staff Login</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
