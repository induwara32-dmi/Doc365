'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  User,
  Stethoscope,
  Pill,
  FlaskConical,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Building2,
  Lock,
  CreditCard,
  FileBadge,
} from 'lucide-react';
import {
  registerPatient,
  registerDoctor,
  registerPharmacy,
  registerLab,
  getPublicFacilities,
} from '../../lib/api';

export default function RegisterPage() {
  const router = useRouter();

  // Role selection: 'patient' | 'doctor' | 'pharmacy' | 'lab'
  const [selectedRole, setSelectedRole] = useState('patient');
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Patient Form
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

  // Doctor Form
  const [doctorForm, setDoctorForm] = useState({
    fullName: '',
    slmcNumber: '',
    specialization: 'General Medicine',
    facilityId: '',
    jobTitle: 'Consultant Physician',
    username: '',
    password: '',
  });

  // Pharmacy Form
  const [pharmacyForm, setPharmacyForm] = useState({
    pharmacyName: '',
    pharmacyCode: '',
    nmraLicense: '',
    fullName: '',
    jobTitle: 'Supervising Pharmacist',
    username: '',
    password: '',
  });

  // Lab Form
  const [labForm, setLabForm] = useState({
    labName: '',
    labCode: '',
    phsrcRegNo: '',
    fullName: '',
    jobTitle: 'Medical Laboratory Technologist',
    username: '',
    password: '',
  });

  // Load facilities for doctor selection
  useEffect(() => {
    async function fetchHospitals() {
      const res = await getPublicFacilities('HOSPITAL');
      if (res.ok && res.data.facilities) {
        setFacilities(res.data.facilities);
        if (res.data.facilities.length > 0) {
          setDoctorForm((prev) => ({ ...prev, facilityId: res.data.facilities[0].id }));
        }
      }
    }
    fetchHospitals();
  }, []);

  const handlePatientSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await registerPatient(patientForm);
    setLoading(false);

    if (res.ok) {
      setSuccess(`Registration successful! Generated Health ID: ${res.data.patient.healthId}. Redirecting to Patient Portal...`);
      setTimeout(() => router.push('/patient'), 1500);
    } else {
      setError(res.error?.message || 'Patient registration failed');
    }
  };

  const handleDoctorSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await registerDoctor(doctorForm);
    setLoading(false);

    if (res.ok) {
      setSuccess(`Doctor credentials verified! Welcome Dr. ${res.data.user.fullName}. Redirecting to Doctor Clinical Portal...`);
      setTimeout(() => router.push('/doctor'), 1500);
    } else {
      setError(res.error?.message || 'Doctor registration failed');
    }
  };

  const handlePharmacySubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await registerPharmacy(pharmacyForm);
    setLoading(false);

    if (res.ok) {
      setSuccess(`Pharmacy facility onboarded! NMRA License ${res.data.facility.licenseNumber} registered. Redirecting to Pharmacy Portal...`);
      setTimeout(() => router.push('/pharmacy'), 1500);
    } else {
      setError(res.error?.message || 'Pharmacy registration failed');
    }
  };

  const handleLabSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await registerLab(labForm);
    setLoading(false);

    if (res.ok) {
      setSuccess(`Diagnostic Lab onboarded! PHSRC Accreditation ${res.data.facility.licenseNumber} verified. Redirecting to Laboratory Portal...`);
      setTimeout(() => router.push('/lab'), 1500);
    } else {
      setError(res.error?.message || 'Laboratory registration failed');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>National Health Onboarding</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
          Join the Doc365 Healthcare Network
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto">
          Multi-tenant registration for Citizens, Licensed Doctors, Certified Pharmacies, and Accredited Diagnostic Labs.
        </p>
      </div>

      {/* Role Selection Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            id: 'patient',
            label: 'Citizen / Patient',
            desc: 'Digital Health Card & Records',
            icon: User,
            color: 'purple',
          },
          {
            id: 'doctor',
            label: 'Doctor (SLMC)',
            desc: 'Clinical Practice & Rx',
            icon: Stethoscope,
            color: 'emerald',
          },
          {
            id: 'pharmacy',
            label: 'Pharmacy (NMRA)',
            desc: 'Scoped Dispensing & POS',
            icon: Pill,
            color: 'sky',
          },
          {
            id: 'lab',
            label: 'Diagnostic Lab',
            desc: 'PHSRC Accredited Testing',
            icon: FlaskConical,
            color: 'amber',
          },
        ].map((item) => {
          const isSelected = selectedRole === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setSelectedRole(item.id);
                setError('');
                setSuccess('');
              }}
              className={`p-4 rounded-2xl border text-left transition-all ${
                isSelected
                  ? 'border-emerald-600 bg-white ring-2 ring-emerald-500/20 shadow-md'
                  : 'border-slate-200 bg-slate-50/50 hover:bg-white text-slate-600'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 ${
                  isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="font-bold text-xs text-slate-900">{item.label}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{item.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Feedback Messages */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2 font-medium">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
          <span>{success}</span>
        </div>
      )}

      {/* Form Container */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200 shadow-sm">
        {/* Form 1: Patient Registration */}
        {selectedRole === 'patient' && (
          <form onSubmit={handlePatientSubmit} className="space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <User className="w-5 h-5 text-purple-600" />
                <span>Citizen / Patient Registration</span>
              </h2>
              <p className="text-xs text-slate-500">
                Creates your lifelong Health ID, active digital health card, and sovereign patient account.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Given Name(s)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kumari"
                  value={patientForm.givenName}
                  onChange={(e) => setPatientForm({ ...patientForm, givenName: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Family / Surname</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jayasinghe"
                  value={patientForm.familyName}
                  onChange={(e) => setPatientForm({ ...patientForm, familyName: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Legal Name (as in Birth Certificate / NIC)</label>
                <input
                  type="text"
                  placeholder="e.g. Herath Mudiyanselage Kumari Jayasinghe"
                  value={patientForm.fullName}
                  onChange={(e) => setPatientForm({ ...patientForm, fullName: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date of Birth</label>
                <input
                  type="date"
                  required
                  value={patientForm.dateOfBirth}
                  onChange={(e) => setPatientForm({ ...patientForm, dateOfBirth: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Biological Sex</label>
                <select
                  value={patientForm.sex}
                  onChange={(e) => setPatientForm({ ...patientForm, sex: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                >
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">National Identity Card (NIC - Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 199071500345 or 907150034V"
                  value={patientForm.nic}
                  onChange={(e) => setPatientForm({ ...patientForm, nic: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Choose Username</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. kumari.j"
                  value={patientForm.username}
                  onChange={(e) => setPatientForm({ ...patientForm, username: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Password (min 8 chars)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••••••"
                  value={patientForm.password}
                  onChange={(e) => setPatientForm({ ...patientForm, password: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <span>{loading ? 'Creating Citizen Health ID...' : 'Complete Citizen Registration'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Form 2: Doctor Registration */}
        {selectedRole === 'doctor' && (
          <form onSubmit={handleDoctorSubmit} className="space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-emerald-600" />
                <span>Doctor & Medical Specialist Registration</span>
              </h2>
              <p className="text-xs text-slate-500">
                Register as a licensed physician to access patient verified histories and prescribe medicines.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Doctor Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. K. M. Wickramasinghe"
                  value={doctorForm.fullName}
                  onChange={(e) => setDoctorForm({ ...doctorForm, fullName: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">SLMC Registration Number</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SLMC-48291"
                  value={doctorForm.slmcNumber}
                  onChange={(e) => setDoctorForm({ ...doctorForm, slmcNumber: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Clinical Specialization</label>
                <select
                  value={doctorForm.specialization}
                  onChange={(e) => setDoctorForm({ ...doctorForm, specialization: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="General Medicine">General Medicine</option>
                  <option value="Cardiology">Cardiology</option>
                  <option value="Endocrinology & Diabetology">Endocrinology & Diabetology</option>
                  <option value="Pediatrics">Pediatrics</option>
                  <option value="General Surgery">General Surgery</option>
                  <option value="Oncology">Oncology</option>
                  <option value="Nephrology">Nephrology</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Hospital Facility</label>
                <select
                  required
                  value={doctorForm.facilityId}
                  onChange={(e) => setDoctorForm({ ...doctorForm, facilityId: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  {facilities.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Choose Username</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. dr.wickrama"
                  value={doctorForm.username}
                  onChange={(e) => setDoctorForm({ ...doctorForm, username: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••••••"
                  value={doctorForm.password}
                  onChange={(e) => setDoctorForm({ ...doctorForm, password: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <span>{loading ? 'Verifying SLMC Credentials...' : 'Register as Medical Doctor'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Form 3: Pharmacy Registration */}
        {selectedRole === 'pharmacy' && (
          <form onSubmit={handlePharmacySubmit} className="space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Pill className="w-5 h-5 text-sky-600" />
                <span>Pharmacy Facility & Pharmacist Onboarding</span>
              </h2>
              <p className="text-xs text-slate-500">
                Register a licensed retail or hospital pharmacy under NMRA regulations.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Pharmacy Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lanka Meds Colombo 03"
                  value={pharmacyForm.pharmacyName}
                  onChange={(e) => setPharmacyForm({ ...pharmacyForm, pharmacyName: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Facility Short Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. lanka-meds-colombo-3"
                  value={pharmacyForm.pharmacyCode}
                  onChange={(e) => setPharmacyForm({ ...pharmacyForm, pharmacyCode: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 lowercase font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">NMRA License Number</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. NMRA-PH-2026-9921"
                  value={pharmacyForm.nmraLicense}
                  onChange={(e) => setPharmacyForm({ ...pharmacyForm, nmraLicense: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 uppercase font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Supervising Pharmacist Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. S. L. Weerasinghe"
                  value={pharmacyForm.fullName}
                  onChange={(e) => setPharmacyForm({ ...pharmacyForm, fullName: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Pharmacist Username</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. pharm.weerasinghe"
                  value={pharmacyForm.username}
                  onChange={(e) => setPharmacyForm({ ...pharmacyForm, username: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••••••"
                  value={pharmacyForm.password}
                  onChange={(e) => setPharmacyForm({ ...pharmacyForm, password: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white shadow-md shadow-sky-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <span>{loading ? 'Registering Pharmacy Facility...' : 'Complete Pharmacy Onboarding'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Form 4: Diagnostic Laboratory Registration */}
        {selectedRole === 'lab' && (
          <form onSubmit={handleLabSubmit} className="space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-amber-600" />
                <span>Diagnostic Laboratory & MLT Onboarding</span>
              </h2>
              <p className="text-xs text-slate-500">
                Register an accredited pathology laboratory under PHSRC accreditation with cryptographic signing capabilities.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Laboratory Facility Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Diagnostics Kandy"
                  value={labForm.labName}
                  onChange={(e) => setLabForm({ ...labForm, labName: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Lab Short Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. apex-diagnostics-kandy"
                  value={labForm.labCode}
                  onChange={(e) => setLabForm({ ...labForm, labCode: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 lowercase font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">PHSRC Registration Number</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PHSRC-LAB-2026-7712"
                  value={labForm.phsrcRegNo}
                  onChange={(e) => setLabForm({ ...labForm, phsrcRegNo: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Lead MLT Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. P. A. Ranasinghe"
                  value={labForm.fullName}
                  onChange={(e) => setLabForm({ ...labForm, fullName: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">MLT Username</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. mlt.ranasinghe"
                  value={labForm.username}
                  onChange={(e) => setLabForm({ ...labForm, username: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••••••"
                  value={labForm.password}
                  onChange={(e) => setLabForm({ ...labForm, password: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <span>{loading ? 'Registering Diagnostic Lab...' : 'Complete Laboratory Onboarding'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>

      {/* Back to Home */}
      <div className="text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Portal Hub</span>
        </Link>
      </div>
    </div>
  );
}
