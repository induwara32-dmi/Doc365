'use client';

import { useState, useEffect } from 'react';
import {
  Stethoscope,
  ShieldCheck,
  CreditCard,
  Siren,
  Lock,
  Unlock,
  AlertTriangle,
  Pill,
  CheckCircle2,
  Clock,
  Building2,
  User,
  PlusCircle,
  FileText,
  FlaskConical,
  Activity,
  ChevronDown,
  Check,
  Radio,
  Sparkles,
  KeyRound,
  LogOut,
  Droplets,
  AlertOctagon,
} from 'lucide-react';
import {
  scanCard,
  breakGlassAccess,
  getPatientRecords,
  createPrescription,
  createLabOrder,
  getPatientLabOrders,
  getEmergencySummary,
  getActiveMedications,
  recordAllergy,
  getCurrentUser,
  login,
  getPublicFacilities,
} from '../../lib/api';
import { DEMO_PATIENTS, DEMO_DRUGS, DEMO_LAB_TESTS } from '../../lib/demo-data';
import DdiSafetyModal from '../../components/DdiSafetyModal';
import BreakGlassModal from '../../components/BreakGlassModal';
import SensitiveGateModal from '../../components/SensitiveGateModal';
import QrCodeView from '../../components/QrCodeView';

function calculateAge(dobString) {
  if (!dobString) return '';
  const dob = new Date(dobString);
  if (isNaN(dob.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return `${age} yrs`;
}

const PRESET_CARDS = [
  { label: 'Kumari Jayasinghe', patient: DEMO_PATIENTS[0], serial: 'CARD-100001-1' },
  { label: 'Baby Jayasinghe', patient: DEMO_PATIENTS[1], serial: 'CARD-100002-1' },
  { label: 'Sanduni Perera', patient: DEMO_PATIENTS[2], serial: 'CARD-100003-1' },
];

export default function DoctorPortal() {
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(DEMO_PATIENTS[0]);
  const [cardSerial, setCardSerial] = useState('CARD-100001-1');

  // Multi-hospital switcher state
  const [availableFacilities, setAvailableFacilities] = useState([]);
  const [activeFacility, setActiveFacility] = useState(null);
  const [isFacilityDropdownOpen, setIsFacilityDropdownOpen] = useState(false);

  // Consultation state
  const [grant, setGrant] = useState(null);
  const [isBreakGlass, setIsBreakGlass] = useState(false);
  const [records, setRecords] = useState([]);
  const [emergencySummary, setEmergencySummary] = useState(null);
  const [activeMedications, setActiveMedications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  // Modals
  const [isBreakGlassOpen, setIsBreakGlassOpen] = useState(false);
  const [isDdiModalOpen, setIsDdiModalOpen] = useState(false);
  const [ddiWarnings, setDdiWarnings] = useState([]);
  const [pendingPrescriptionData, setPendingPrescriptionData] = useState(null);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [unlockedPin, setUnlockedPin] = useState(null);

  // Prescription Form State
  const [selectedDrug, setSelectedDrug] = useState(DEMO_DRUGS[0]);
  const [dosageInstruction, setDosageInstruction] = useState(DEMO_DRUGS[0].defaultDosage);
  const [quantity, setQuantity] = useState(DEMO_DRUGS[0].quantity);
  const [daysSupply, setDaysSupply] = useState(DEMO_DRUGS[0].daysSupply);
  const [repeatsAllowed, setRepeatsAllowed] = useState(0);
  const [issuedPrescriptions, setIssuedPrescriptions] = useState([]);

  // Active Action Pad Tab ('prescribe' | 'lab')
  const [activeActionPad, setActiveActionPad] = useState('prescribe');

  // Lab Order Form State
  const [labOrders, setLabOrders] = useState([]);
  const [selectedLabTest, setSelectedLabTest] = useState(DEMO_LAB_TESTS[0]);
  const [labPriority, setLabPriority] = useState('ROUTINE');
  const [labNotes, setLabNotes] = useState('');

  // Auto-login as Dr. Perera if not authenticated
  useEffect(() => {
    async function initDoctor() {
      let user = getCurrentUser();
      if (!user || user.role !== 'DOCTOR') {
        const password = process.env.NEXT_PUBLIC_SEED_PASSWORD || 'hSk9SQ-yNLI3PBxm';
        const res = await login({ username: 'dr.perera', password });
        if (res.ok) {
          setCurrentUser(res.data.session);
        }
      } else {
        setCurrentUser(user);
      }
    }
    initDoctor();
  }, []);

  // Load facilities for hospital switcher
  useEffect(() => {
    async function loadFacilities() {
      const res = await getPublicFacilities('HOSPITAL');
      if (res.ok && res.data.facilities) {
        setAvailableFacilities(res.data.facilities);
        const currentFacId = currentUser?.facilityId;
        const matched = res.data.facilities.find((f) => f.id === currentFacId);
        setActiveFacility(matched || res.data.facilities[0]);
      }
    }
    loadFacilities();
  }, [currentUser]);

  // Update prescription defaults when drug changes
  const handleDrugChange = (drug) => {
    setSelectedDrug(drug);
    setDosageInstruction(drug.defaultDosage);
    setQuantity(drug.quantity);
    setDaysSupply(drug.daysSupply);
    setRepeatsAllowed(drug.repeatsAllowed || 0);
  };

  const handleSelectPreset = (preset) => {
    setSelectedPatient(preset.patient);
    setCardSerial(preset.serial);
    setGrant(null);
    setRecords([]);
    setEmergencySummary(null);
    setActiveMedications([]);
    setUnlockedPin(null);
    setStatusMessage(null);
  };

  const handleEndConsultation = () => {
    setGrant(null);
    setRecords([]);
    setEmergencySummary(null);
    setActiveMedications([]);
    setUnlockedPin(null);
    setStatusMessage({
      type: 'success',
      text: `Consultation concluded for ${selectedPatient.shortName || selectedPatient.name}. Card session closed.`,
    });
  };

  // Three-Keys Card Tap Simulation
  const handleCardTap = async () => {
    setLoading(true);
    setStatusMessage(null);
    const res = await scanCard({
      healthId: selectedPatient.healthId,
      cardSerial,
    });
    setLoading(false);

    if (res.ok) {
      setGrant(res.data.grant);
      setIsBreakGlass(false);
      setStatusMessage({
        type: 'success',
        text: `90-day Consultation Grant established (Expires: ${new Date(res.data.grant.expiresAt).toLocaleDateString()})`,
      });
      loadPatientClinicalData(selectedPatient.healthId);
    } else {
      setStatusMessage({ type: 'error', text: res.error.message || 'Card scan failed. Check card status.' });
    }
  };

  // Break-Glass Override
  const handleBreakGlassConfirm = async (reason) => {
    setIsBreakGlassOpen(false);
    setLoading(true);
    const res = await breakGlassAccess({
      healthId: selectedPatient.healthId,
      reason,
    });
    setLoading(false);

    if (res.ok) {
      setGrant(res.data.grant);
      setIsBreakGlass(true);
      setStatusMessage({
        type: 'warning',
        text: 'EMERGENCY OVERRIDE ACTIVATED: 24-hour access granted. High-priority audit trail logged.',
      });
      loadPatientClinicalData(selectedPatient.healthId);
    } else {
      setStatusMessage({ type: 'error', text: res.error.message });
    }
  };

  // Load verified patient records, active meds, emergency summary & lab orders
  const loadPatientClinicalData = async (healthId, pin = null) => {
    const [recRes, medRes, emergRes, labRes] = await Promise.all([
      getPatientRecords(healthId, pin),
      getActiveMedications(healthId),
      getEmergencySummary(healthId),
      getPatientLabOrders(healthId),
    ]);

    if (recRes.ok) {
      setRecords(recRes.data.records || []);
    }
    if (medRes.ok) {
      setActiveMedications(medRes.data.activeMedications || []);
    }
    if (emergRes.ok) {
      setEmergencySummary(emergRes.data.emergencySummary);
    }
    if (labRes.ok) {
      setLabOrders(labRes.data.orders || []);
    }
  };

  // Submit Lab Test Order
  const handleOrderLabTest = async () => {
    if (!grant) {
      setStatusMessage({ type: 'error', text: 'Three-Keys rule: Active consultation grant required before ordering lab tests.' });
      return;
    }

    setLoading(true);
    const res = await createLabOrder({
      patientHealthId: selectedPatient.healthId,
      testCode: selectedLabTest.code,
      testName: selectedLabTest.name,
      priority: labPriority,
      clinicalNotes: labNotes,
    });
    setLoading(false);

    if (res.ok) {
      setStatusMessage({
        type: 'success',
        text: `Lab test ordered: ${res.data.order.orderCode} (${selectedLabTest.name})`,
      });
      setLabNotes('');
      const updated = await getPatientLabOrders(selectedPatient.healthId);
      if (updated.ok) setLabOrders(updated.data.orders || []);
    } else {
      setStatusMessage({ type: 'error', text: res.error.message });
    }
  };

  // Unlock sensitive records with Patient PIN
  const handleUnlockPin = async (pin) => {
    setIsPinModalOpen(false);
    setUnlockedPin(pin);
    loadPatientClinicalData(selectedPatient.healthId, pin);
  };

  // Submit Prescription (Safety Engine Check)
  const handlePrescribe = async (overrideReason = null) => {
    if (!grant) {
      setStatusMessage({ type: 'error', text: 'Three-Keys rule: Active consultation grant required before prescribing.' });
      return;
    }

    const payload = {
      patientHealthId: selectedPatient.healthId,
      medicationCode: selectedDrug.code,
      medicationName: selectedDrug.name,
      dosageInstruction,
      quantity: Number(quantity),
      daysSupply: Number(daysSupply),
      repeatsAllowed: Number(repeatsAllowed),
      overrideReason: overrideReason || undefined,
    };

    setLoading(true);
    const res = await createPrescription(payload);
    setLoading(false);

    if (res.ok) {
      setIsDdiModalOpen(false);
      setPendingPrescriptionData(null);
      setIssuedPrescriptions([res.data.prescription, ...issuedPrescriptions]);
      setStatusMessage({
        type: 'success',
        text: `Prescription issued: ${res.data.prescription.medicationName} (QR: ${res.data.prescription.prescriptionCode})`,
      });
      loadPatientClinicalData(selectedPatient.healthId, unlockedPin);
    } else if (res.status === 422 && res.data?.error?.details?.warnings) {
      setPendingPrescriptionData(payload);
      setDdiWarnings(res.data.error.details.warnings);
      setIsDdiModalOpen(true);
    } else {
      setStatusMessage({ type: 'error', text: res.error.message });
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Clinical Command Center Header (Dark Slate/Charcoal with Cyan & Gold accents) */}
      <div className="rounded-3xl bg-slate-950 border border-slate-800 text-white p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          {/* Doctor Profile & Credentials */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-600 via-teal-500 to-emerald-500 text-white flex items-center justify-center font-bold shadow-lg shadow-cyan-500/20">
              <Stethoscope className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight text-white">
                  {currentUser?.fullName || currentUser?.label || 'Dr. R. Perera'}
                </h1>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                  {currentUser?.slmcNumber || 'SLMC #48291'}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300">
                  {currentUser?.specialization || currentUser?.jobTitle || 'Consultant Physician'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                <span>National Clinical Command Center</span>
                <span>&bull;</span>
                <span className="text-cyan-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  3-Keys Access Engine Active
                </span>
              </p>
            </div>
          </div>

          {/* Persistent Hospital Switcher & Emergency Break-Glass */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Hospital Switcher */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsFacilityDropdownOpen(!isFacilityDropdownOpen)}
                className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-500/50 text-xs text-left transition-colors"
              >
                <Building2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Active Hospital Facility</div>
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span>{activeFacility?.name || currentUser?.facilityName || 'Colombo National Hospital'}</span>
                    <span className="text-[10px] font-mono text-cyan-400">
                      [{activeFacility?.code || currentUser?.facilityCode || 'CNH-01'}]
                    </span>
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 ml-1" />
              </button>

              {isFacilityDropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-2 z-50 text-xs">
                  <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-800">
                    Switch Hospital Context
                  </div>
                  <div className="py-1 space-y-1 max-h-56 overflow-y-auto">
                    {availableFacilities.map((fac) => (
                      <button
                        key={fac.id}
                        type="button"
                        onClick={() => {
                          setActiveFacility(fac);
                          setIsFacilityDropdownOpen(false);
                          setStatusMessage({
                            type: 'success',
                            text: `Active clinical facility switched to ${fac.name} (${fac.code})`,
                          });
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl transition-colors flex items-center justify-between ${
                          activeFacility?.id === fac.id
                            ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div>
                          <div>{fac.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{fac.code} &bull; {fac.type}</div>
                        </div>
                        {activeFacility?.id === fac.id && <Check className="w-4 h-4 text-cyan-400" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Emergency Action */}
            <button
              onClick={() => setIsBreakGlassOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/30 transition-all"
            >
              <Siren className="w-4 h-4 animate-pulse" />
              <span>Emergency Break-Glass</span>
            </button>
          </div>
        </div>

        {/* Telemetry Indicator Ribbon */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-slate-400">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Access Gate</div>
            <div className="text-cyan-400 font-semibold flex items-center gap-1.5 mt-0.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>3-Keys NFC Token Gate</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Safety Verification</div>
            <div className="text-amber-400 font-semibold flex items-center gap-1.5 mt-0.5">
              <Pill className="w-3.5 h-3.5" />
              <span>DDI & Allergy Interceptor</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Diagnostic Network</div>
            <div className="text-cyan-400 font-semibold flex items-center gap-1.5 mt-0.5">
              <FlaskConical className="w-3.5 h-3.5" />
              <span>FHIR ServiceRequest Live</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Trust Core</div>
            <div className="text-emerald-400 font-semibold flex items-center gap-1.5 mt-0.5">
              <Lock className="w-3.5 h-3.5" />
              <span>Ed25519 Verified Records</span>
            </div>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-2xl text-xs flex items-center gap-2.5 font-medium border ${
            statusMessage.type === 'success'
              ? 'bg-cyan-950/40 border-cyan-500/30 text-cyan-200'
              : statusMessage.type === 'warning'
              ? 'bg-amber-950/40 border-amber-500/30 text-amber-200'
              : 'bg-red-950/40 border-red-500/30 text-red-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Balanced 2-Column Clinical Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (approx 35% / 4 grid cols): NFC Tap Station & Active Patient Card */}
        <div className="lg:col-span-4 space-y-6">
          {/* 1. NFC Card Tap Station */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-white shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-cyan-400" />
                <span>NFC Card Tap Station</span>
              </h2>
              <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded-full">
                <Radio className="w-3 h-3 animate-pulse" />
                READER READY
              </span>
            </div>

            {/* Quick Card Presets */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-2">Simulated Citizen Cards</label>
              <div className="space-y-1.5">
                {PRESET_CARDS.map((p) => {
                  const isSelected = selectedPatient.healthId === p.patient.healthId;
                  return (
                    <button
                      key={p.patient.healthId}
                      type="button"
                      onClick={() => handleSelectPreset(p)}
                      className={`w-full p-2.5 rounded-xl border text-left text-xs transition-all flex items-center justify-between ${
                        isSelected
                          ? 'border-cyan-500/60 bg-cyan-950/30 text-cyan-200 font-bold ring-1 ring-cyan-500/40'
                          : 'border-slate-800 hover:bg-slate-800/60 text-slate-300'
                      }`}
                    >
                      <div>
                        <div>{p.label}</div>
                        <div className="text-[10px] font-mono text-slate-500">{p.serial}</div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">{p.patient.healthId}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Card Serial Manual Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Card Serial / NFC Token</label>
              <input
                type="text"
                value={cardSerial}
                onChange={(e) => setCardSerial(e.target.value)}
                className="w-full text-xs font-mono p-3 rounded-xl bg-slate-950 border border-slate-800 text-cyan-300 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                placeholder="CARD-XXXXXX-X"
              />
            </div>

            {/* Direct Tap Action */}
            <button
              onClick={handleCardTap}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white shadow-lg shadow-cyan-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{loading ? 'Establishing 3-Keys Grant...' : 'Tap / Scan Health Card'}</span>
            </button>
          </div>

          {/* 2. Active Patient Card (Renders upon card scan or preset selection) */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-white shadow-xl space-y-5 relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-bold text-white">Active Citizen Record</h2>
              </div>
              {grant ? (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  GRANT VERIFIED
                </span>
              ) : (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  CARD PENDING TAP
                </span>
              )}
            </div>

            {/* Patient Identity */}
            <div className="space-y-2">
              <div className="text-base font-bold text-white leading-tight">
                {selectedPatient.name || selectedPatient.shortName}
              </div>

              {/* Demographics row */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Age / Gender</div>
                  <div className="font-semibold text-slate-200 mt-0.5">
                    {calculateAge(selectedPatient.dateOfBirth)} &bull; <span className="capitalize">{selectedPatient.sex}</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Date of Birth</div>
                  <div className="font-mono text-slate-200 mt-0.5">{selectedPatient.dateOfBirth}</div>
                </div>
              </div>

              {/* Universal Health ID */}
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-bold text-cyan-400">Universal Health ID (PHN)</div>
                  <div className="font-mono font-bold text-cyan-300 text-sm">{selectedPatient.healthId}</div>
                </div>
                <span className="text-[10px] font-mono text-slate-500">{selectedPatient.nic || 'Under 16'}</span>
              </div>
            </div>

            {/* Emergency & Biometric Facts */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] uppercase font-bold text-red-400 flex items-center gap-1">
                  <Droplets className="w-3 h-3 text-red-500" />
                  <span>Blood Group</span>
                </div>
                <div className="text-sm font-bold text-white mt-0.5">
                  {emergencySummary?.bloodGroup || selectedPatient.bloodGroup || 'Recorded in FHIR'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] uppercase font-bold text-amber-400 flex items-center gap-1">
                  <AlertOctagon className="w-3 h-3 text-amber-500" />
                  <span>Allergies</span>
                </div>
                <div className="text-xs font-semibold text-amber-200 truncate mt-0.5">
                  {emergencySummary?.allergies?.length > 0
                    ? emergencySummary.allergies.map((a) => a.substance).join(', ')
                    : 'None documented'}
                </div>
              </div>
            </div>

            {/* Consultation Grant Badge */}
            {grant && (
              <div
                className={`p-3.5 rounded-2xl border ${
                  isBreakGlass
                    ? 'bg-red-950/40 border-red-500/30 text-red-200'
                    : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs mb-1">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isBreakGlass ? '24-Hour Break-Glass Grant Active' : '90-Day Clinical Grant Active'}</span>
                </div>
                <div className="text-[11px] text-slate-400 space-y-0.5">
                  <div>Grant ID: <span className="font-mono text-[10px] text-slate-300">{grant.id?.slice(0, 12)}...</span></div>
                  <div>Expires: {new Date(grant.expiresAt).toLocaleDateString()}</div>
                </div>
              </div>
            )}

            {/* Sensitive Records PIN Gate Trigger */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              {unlockedPin ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Sensitive Records Decrypted</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(true)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-cyan-300 border border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Lock className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Unlock Sensitive Records (PIN)</span>
                </button>
              )}
            </div>

            {/* End Consultation Button */}
            {grant && (
              <button
                type="button"
                onClick={handleEndConsultation}
                className="w-full py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 text-xs font-semibold text-slate-400 hover:text-white border border-slate-800 flex items-center justify-center gap-1.5 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>End Consultation & Release Card</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Column (approx 65% / 8 grid cols): Action Pad & Verified Clinical Timeline */}
        <div className="lg:col-span-8 space-y-6">
          {/* Action Pad Switcher Tabs */}
          <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-900 border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveActionPad('prescribe')}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                activeActionPad === 'prescribe'
                  ? 'bg-slate-800 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Pill className="w-4 h-4 text-cyan-400" />
              <span>E-Prescription & DDI Safety Pad</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveActionPad('lab')}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                activeActionPad === 'lab'
                  ? 'bg-slate-800 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FlaskConical className="w-4 h-4 text-amber-400" />
              <span>Order Diagnostic Tests (FHIR ServiceRequest)</span>
            </button>
          </div>

          {/* Action Pad 1: E-Prescription Pad & DDI Safety */}
          {activeActionPad === 'prescribe' && (
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-white shadow-xl space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Pill className="w-5 h-5 text-cyan-400" />
                  <h2 className="text-sm font-bold text-white">E-Prescription Pad & Safety Engine</h2>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700">
                  HL7 FHIR MedicationRequest
                </span>
              </div>

              {/* Quick drug presets */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2">Select Medication to Prescribe</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {DEMO_DRUGS.map((d) => (
                    <button
                      key={d.code}
                      type="button"
                      onClick={() => handleDrugChange(d)}
                      className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                        selectedDrug.code === d.code
                          ? 'border-cyan-500/60 bg-cyan-950/40 font-bold text-cyan-200 ring-1 ring-cyan-500/50'
                          : 'border-slate-800 hover:bg-slate-800/60 text-slate-300'
                      }`}
                    >
                      <div className="truncate">{d.name.split(' ')[0]} {d.name.split(' ')[1]}</div>
                      <div className="text-[10px] text-slate-500 font-normal">{d.tag}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dosage & Parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Dosage Instruction</label>
                  <input
                    type="text"
                    value={dosageInstruction}
                    onChange={(e) => setDosageInstruction(e.target.value)}
                    className="w-full text-xs p-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Quantity (Units)</label>
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full text-xs p-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Days Supply</label>
                  <input
                    type="number"
                    min={1}
                    value={daysSupply}
                    onChange={(e) => setDaysSupply(e.target.value)}
                    className="w-full text-xs p-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Repeats / Refills</label>
                  <input
                    type="number"
                    min={0}
                    value={repeatsAllowed}
                    onChange={(e) => setRepeatsAllowed(e.target.value)}
                    className="w-full text-xs p-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <button
                onClick={() => handlePrescribe()}
                disabled={loading || !grant}
                className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white shadow-lg shadow-cyan-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-40"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{grant ? 'Issue Electronic Prescription' : 'Present Health Card to Prescribe'}</span>
              </button>
            </div>
          )}

          {/* Action Pad 2: Lab Orders Pad */}
          {activeActionPad === 'lab' && (
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-white shadow-xl space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <FlaskConical className="w-5 h-5 text-amber-400" />
                  <h2 className="text-sm font-bold text-white">Order Diagnostic Tests & Lab Investigations</h2>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-slate-800 text-amber-400 border border-slate-700">
                  HL7 FHIR ServiceRequest
                </span>
              </div>

              {/* Standard test presets */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2">Select Investigation Panel</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {DEMO_LAB_TESTS.map((t) => (
                    <button
                      key={t.code}
                      type="button"
                      onClick={() => setSelectedLabTest(t)}
                      className={`p-3 rounded-xl border text-left text-xs transition-all ${
                        selectedLabTest.code === t.code
                          ? 'border-amber-500/60 bg-amber-950/40 font-bold text-amber-200 ring-1 ring-amber-500/50'
                          : 'border-slate-800 hover:bg-slate-800/60 text-slate-300'
                      }`}
                    >
                      <div className="font-bold">{t.name}</div>
                      <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                        Normal: {t.normalRange} &bull; LOINC: {t.code}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Priority</label>
                  <select
                    value={labPriority}
                    onChange={(e) => setLabPriority(e.target.value)}
                    className="w-full text-xs p-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="ROUTINE">ROUTINE (Standard)</option>
                    <option value="URGENT">URGENT (Priority)</option>
                    <option value="STAT">STAT (Emergency)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Clinical Indication / Notes</label>
                  <input
                    type="text"
                    value={labNotes}
                    onChange={(e) => setLabNotes(e.target.value)}
                    placeholder="e.g. Check fasting blood sugar response to therapy"
                    className="w-full text-xs p-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleOrderLabTest}
                disabled={loading || !grant}
                className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-slate-950 shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-40"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{grant ? 'Issue Lab Order (FHIR ServiceRequest)' : 'Present Health Card to Order'}</span>
              </button>
            </div>
          )}

          {/* Active Lab Orders Pipeline */}
          {labOrders.length > 0 && (
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-white shadow-xl space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-amber-400" />
                  <span>Diagnostic Lab Orders Pipeline</span>
                </span>
                <span className="text-[11px] font-mono text-slate-400">{labOrders.length} Orders</span>
              </h3>

              <div className="space-y-2">
                {labOrders.map((o) => {
                  const isCompleted = o.status === 'COMPLETED';
                  return (
                    <div
                      key={o.id}
                      className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                        isCompleted
                          ? 'border-emerald-500/30 bg-emerald-950/20'
                          : 'border-amber-500/30 bg-amber-950/20'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{o.testName}</span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              isCompleted
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            }`}
                          >
                            {o.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          Order Code: {o.orderCode} &bull; Priority: {o.priority} &bull; Ordered: {new Date(o.orderedAt).toLocaleDateString()}
                        </div>
                        {o.clinicalNotes && (
                          <div className="text-[11px] text-slate-400 italic mt-0.5">
                            Notes: &ldquo;{o.clinicalNotes}&rdquo;
                          </div>
                        )}
                      </div>

                      {isCompleted && (
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-300 bg-slate-950 px-2.5 py-1 rounded-lg border border-emerald-500/30 self-start sm:self-center">
                          <ShieldCheck className="w-4 h-4 text-emerald-400" />
                          <span>Verified Results in Timeline</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Newly Issued Prescriptions */}
          {issuedPrescriptions.length > 0 && (
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-white shadow-xl space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                <span>Recently Issued Prescription QR Code</span>
              </h3>

              <div className="space-y-4">
                {issuedPrescriptions.map((rx) => (
                  <div key={rx.id} className="p-4 rounded-2xl border border-cyan-500/30 bg-cyan-950/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="font-bold text-sm text-white">{rx.medicationName}</div>
                      <div className="text-xs text-slate-300">{rx.dosageInstruction}</div>
                      <div className="text-xs text-cyan-300 font-mono">Code: {rx.prescriptionCode}</div>
                      <div className="text-[11px] text-emerald-400 font-semibold">
                        State: {rx.dispenseState} &bull; Repeats remaining: {rx.repeatsRemaining}
                      </div>
                    </div>
                    <div className="flex flex-col items-center p-2 rounded-xl bg-white">
                      <QrCodeView text={rx.prescriptionCode} size={90} />
                      <span className="text-[9px] font-mono text-slate-600 mt-1">Pharmacy QR Token</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Verified Clinical Records Timeline */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-white shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                <span>Verified Clinical Records & Diagnostic Timeline</span>
              </h3>
              <span className="text-xs font-mono text-slate-400">
                {records.length} Verified Records
              </span>
            </div>

            {records.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-500 space-y-2">
                <ShieldCheck className="w-10 h-10 text-slate-700 mx-auto" />
                <div>
                  {grant
                    ? 'No clinical records found for this patient.'
                    : 'NFC Card Tap required: Present and tap patient’s Health Card on the left to establish a 3-Keys session and decrypt the clinical timeline.'}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {records.map((r) => (
                  <div key={r.id} className="p-4 rounded-2xl border border-slate-800 bg-slate-950/70 hover:border-slate-700 transition-all space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-xs text-slate-200">{r.mainResource}</div>
                      <div className="flex items-center gap-1.5">
                        {r.trust?.status === 'VERIFIED' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                            <ShieldCheck className="w-3 h-3" />
                            Ed25519 Verified
                          </span>
                        )}
                        {r.isSensitive && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                            <Lock className="w-3 h-3" />
                            Sensitive
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-3">
                      <span>Facility: <strong className="text-slate-300">{r.facilityName || 'Medical Facility'}</strong></span>
                      <span>&bull;</span>
                      <span>Recorded: {new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>

                    {/* Structured Observation Display */}
                    {r.bundle?.entry?.filter((e) => e.resource?.resourceType === 'Observation').map((obs) => {
                      const res = obs.resource;
                      return (
                        <div key={res.id || Math.random()} className="mt-2 p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-200">{res.code?.text || res.code?.coding?.[0]?.display || 'Diagnostic Observation'}</span>
                            <span className="font-black text-cyan-300 bg-slate-950 px-2.5 py-1 rounded-lg border border-cyan-500/30">
                              {res.valueQuantity?.value} {res.valueQuantity?.unit}
                            </span>
                          </div>
                          {res.referenceRange?.[0]?.text && (
                            <div className="text-[11px] text-slate-400 mt-1">
                              Reference Interval: {res.referenceRange[0].text}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DDI Safety Override Modal */}
      <DdiSafetyModal
        isOpen={isDdiModalOpen}
        warnings={ddiWarnings}
        onCancel={() => {
          setIsDdiModalOpen(false);
          setPendingPrescriptionData(null);
        }}
        onConfirmOverride={(reason) => {
          handlePrescribe(reason);
        }}
      />

      {/* Emergency Break-Glass Modal */}
      <BreakGlassModal
        isOpen={isBreakGlassOpen}
        patientHealthId={selectedPatient.healthId}
        onCancel={() => setIsBreakGlassOpen(false)}
        onConfirm={handleBreakGlassConfirm}
      />

      {/* Sensitive Records PIN Gate Modal */}
      <SensitiveGateModal
        isOpen={isPinModalOpen}
        onCancel={() => setIsPinModalOpen(false)}
        onUnlock={handleUnlockPin}
      />
    </div>
  );
}
