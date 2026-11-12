'use client';

import { useState, useEffect, useRef } from 'react';
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
  Search,
  Zap,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
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
  getPublicFacilities,
} from '../../lib/api';
import { DEMO_PATIENTS, DEMO_DRUGS, DEMO_LAB_TESTS, FREQUENT_ROUTINE_DRUGS } from '../../lib/demo-data';
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

  // Linear Workflow State Machine: 'SCAN' | 'PATIENT_SUMMARY' | 'PRESCRIBE' | 'LAB_ORDER'
  const [workflowStep, setWorkflowStep] = useState('SCAN');

  const [selectedPatient, setSelectedPatient] = useState(DEMO_PATIENTS[0]);
  const [cardSerial, setCardSerial] = useState('CARD-100001-1');

  // Multi-hospital switcher state
  const [availableFacilities, setAvailableFacilities] = useState([]);
  const [activeFacility, setActiveFacility] = useState(null);
  const [isFacilityDropdownOpen, setIsFacilityDropdownOpen] = useState(false);

  // Scanner bar state & shortcut ref
  const scannerInputRef = useRef(null);
  const [isPresetDropdownOpen, setIsPresetDropdownOpen] = useState(false);

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

  // Prescription Form State & Autocomplete
  const [selectedDrug, setSelectedDrug] = useState(DEMO_DRUGS[0]);
  const [drugSearchQuery, setDrugSearchQuery] = useState(DEMO_DRUGS[0].name);
  const [isDrugDropdownOpen, setIsDrugDropdownOpen] = useState(false);
  const drugDropdownRef = useRef(null);
  const [dosageInstruction, setDosageInstruction] = useState(DEMO_DRUGS[0].defaultDosage);
  const [quantity, setQuantity] = useState(DEMO_DRUGS[0].quantity);
  const [daysSupply, setDaysSupply] = useState(DEMO_DRUGS[0].daysSupply);
  const [repeatsAllowed, setRepeatsAllowed] = useState(0);
  const [issuedPrescriptions, setIssuedPrescriptions] = useState([]);

  // Lab Order Form State
  const [labOrders, setLabOrders] = useState([]);
  const [selectedLabTest, setSelectedLabTest] = useState(DEMO_LAB_TESTS[0]);
  const [labPriority, setLabPriority] = useState('ROUTINE');
  const [labNotes, setLabNotes] = useState('');

  // Load authenticated doctor session
  useEffect(() => {
    const user = getCurrentUser();
    if (user && user.role === 'DOCTOR') {
      setCurrentUser(user);
    }
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

  // Global Ctrl+K / Cmd+K shortcut to focus card scanner
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        scannerInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close drug dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (drugDropdownRef.current && !drugDropdownRef.current.contains(event.target)) {
        setIsDrugDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update prescription defaults when drug changes
  const handleDrugChange = (drug) => {
    setSelectedDrug(drug);
    setDrugSearchQuery(drug.name);
    setDosageInstruction(drug.defaultDosage || '1 tablet once daily');
    setQuantity(drug.quantity || 30);
    setDaysSupply(drug.daysSupply || 30);
    setRepeatsAllowed(drug.repeatsAllowed !== undefined ? drug.repeatsAllowed : 0);
    setIsDrugDropdownOpen(false);
  };

  // Custom drug selection
  const handleSelectCustomDrug = (customName) => {
    const slug = customName.trim().toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 16);
    const customObj = {
      code: `CUSTOM-${slug}`,
      name: customName.trim(),
      generic: customName.trim(),
      class: 'OTHER',
      defaultDosage: '1 tablet once daily as directed',
      quantity: 30,
      daysSupply: 30,
      repeatsAllowed: 0,
      tag: 'Custom',
    };
    setSelectedDrug(customObj);
    setDrugSearchQuery(customName.trim());
    setDosageInstruction(customObj.defaultDosage);
    setQuantity(customObj.quantity);
    setDaysSupply(customObj.daysSupply);
    setRepeatsAllowed(customObj.repeatsAllowed);
    setIsDrugDropdownOpen(false);
  };

  // Filtered drug presets based on search query
  const filteredDrugs = DEMO_DRUGS.filter((d) => {
    if (!drugSearchQuery) return true;
    const q = drugSearchQuery.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      (d.generic && d.generic.toLowerCase().includes(q)) ||
      (d.code && d.code.toLowerCase().includes(q)) ||
      (d.class && d.class.toLowerCase().includes(q))
    );
  });

  const routineDrugs = DEMO_DRUGS.filter((d) => FREQUENT_ROUTINE_DRUGS.includes(d.code));

  // Reset / Finish Consultation & Return to Step 1 (SCAN)
  const handleFinishAndNextPatient = () => {
    setGrant(null);
    setIsBreakGlass(false);
    setRecords([]);
    setEmergencySummary(null);
    setActiveMedications([]);
    setLabOrders([]);
    setIssuedPrescriptions([]);
    setUnlockedPin(null);
    setWorkflowStep('SCAN');
    setStatusMessage({
      type: 'success',
      text: `Consultation session for ${selectedPatient.shortName || selectedPatient.name} completed. Ready to scan next patient card.`,
    });
  };

  // Handle Preset Select
  const handleSelectPreset = (preset, autoTap = false) => {
    setSelectedPatient(preset.patient);
    setCardSerial(preset.serial);
    setIsPresetDropdownOpen(false);
    if (autoTap) {
      handleCardTap(preset.patient, preset.serial);
    }
  };

  // Handle Card Tap / Scan (creates 90-day AccessGrant)
  const handleCardTap = async (patientToScan = selectedPatient, serialToUse = cardSerial) => {
    setLoading(true);
    setStatusMessage(null);
    const res = await scanCard({
      cardSerial: serialToUse,
      patientHealthId: patientToScan.healthId,
    });
    setLoading(false);

    if (res.ok) {
      setGrant(res.data.grant);
      setIsBreakGlass(false);
      setStatusMessage({
        type: 'success',
        text: `NFC Card verified (${res.data.grant.cardSerial}). 90-day clinical consultation grant active.`,
      });
      loadPatientClinicalData(patientToScan.healthId);
      // Advance to Step 2: Patient Summary & Actions
      setWorkflowStep('PATIENT_SUMMARY');
    } else {
      setStatusMessage({ type: 'error', text: res.error.message || 'Card scan failed. Check card status.' });
    }
  };

  // Handle Enter / Submit from the scanner
  const handleScannerSubmit = (e) => {
    e.preventDefault();
    if (!cardSerial.trim()) return;

    const query = cardSerial.trim().toUpperCase();
    const matched =
      DEMO_PATIENTS.find(
        (p) => p.healthId.toUpperCase() === query || query.includes(p.healthId.slice(-4))
      ) || PRESET_CARDS.find((pc) => pc.serial.toUpperCase() === query)?.patient;

    if (matched) {
      setSelectedPatient(matched);
      const serial = PRESET_CARDS.find((pc) => pc.patient.healthId === matched.healthId)?.serial || query;
      setCardSerial(serial);
      handleCardTap(matched, serial);
    } else {
      handleCardTap(selectedPatient, cardSerial.trim());
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
      // Advance to Step 2: Patient Summary & Actions
      setWorkflowStep('PATIENT_SUMMARY');
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
      {/* 1. Doctor Command Header & Facility Switcher (Always Accessible) */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-5 shadow-card relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-11 h-11 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 shadow-xs">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-semibold tracking-tight text-slate-900">
                  {currentUser?.fullName || currentUser?.label || 'Dr. R. Perera'}
                </h1>
                <span className="text-[10px] font-mono font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200/80 text-teal-700">
                  {currentUser?.slmcNumber || 'SLMC #48291'}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600">
                  {currentUser?.specialization || currentUser?.jobTitle || 'Consultant Physician'}
                </span>
              </div>

              {/* Hospital Switcher dropdown */}
              <div className="relative inline-block mt-1">
                <button
                  type="button"
                  onClick={() => setIsFacilityDropdownOpen(!isFacilityDropdownOpen)}
                  className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <Building2 className="w-3.5 h-3.5 text-teal-600" />
                  <span className="font-medium text-slate-700">
                    {activeFacility?.name || currentUser?.facilityName || 'Colombo National Hospital'}
                  </span>
                  <span className="text-[10px] font-mono text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded border border-teal-200/60">
                    {activeFacility?.code || currentUser?.facilityCode || 'CNH-01'}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {isFacilityDropdownOpen && (
                  <div className="absolute left-0 mt-2 w-72 rounded-xl bg-white border border-slate-200 shadow-lg p-2 z-50 text-xs">
                    <div className="px-3 py-1.5 text-[10px] uppercase font-semibold text-slate-400 border-b border-slate-100">
                      Switch Hospital Facility
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
                              text: `Clinical facility switched to ${fac.name} (${fac.code})`,
                            });
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${
                            activeFacility?.id === fac.id
                              ? 'bg-teal-50 text-teal-800 font-semibold border border-teal-200/80'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div>
                            <div>{fac.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{fac.code} &bull; {fac.type}</div>
                          </div>
                          {activeFacility?.id === fac.id && <Check className="w-4 h-4 text-teal-600" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Workflow Status / Action Indicator */}
          <div className="flex items-center gap-3">
            {workflowStep !== 'SCAN' && (
              <button
                type="button"
                onClick={handleFinishAndNextPatient}
                className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200/80 text-xs font-medium transition-all flex items-center gap-1.5 shadow-xs"
                title="Finish consultation and prepare station for next patient"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Finish & Scan Next Patient</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Global Status Banner */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2.5 font-medium border animate-in fade-in ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200/80 text-emerald-900'
              : statusMessage.type === 'warning'
              ? 'bg-amber-50 border-amber-200/80 text-amber-900'
              : 'bg-rose-50 border-rose-200/80 text-rose-900'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-600" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 1: CARD SCAN (Landing State - Clean, Centered Scanner Station)      */}
      {/* ========================================================================= */}
      {workflowStep === 'SCAN' && (
        <div className="max-w-2xl mx-auto py-10 px-4">
          <div className="rounded-2xl bg-white border border-slate-200/90 p-8 sm:p-12 shadow-card text-center space-y-6">
            {/* Animated NFC Station Badge */}
            <div className="inline-flex w-16 h-16 rounded-2xl bg-teal-50 border border-teal-100 text-teal-600 items-center justify-center shadow-xs">
              <Radio className="w-8 h-8 animate-pulse text-teal-600" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                Scan Patient Health Card
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                Tap the citizen&apos;s physical NFC Health Card or enter their Health ID to initiate a Three-Keys verified consultation.
              </p>
            </div>

            {/* Centered Scanner Input Bar */}
            <form onSubmit={handleScannerSubmit} className="max-w-lg mx-auto relative pt-2">
              <div className="relative flex items-center">
                <div className="absolute left-3.5 flex items-center pointer-events-none text-teal-600">
                  <CreditCard className="w-5 h-5 text-slate-400" />
                </div>

                <input
                  ref={scannerInputRef}
                  type="text"
                  value={cardSerial}
                  onChange={(e) => setCardSerial(e.target.value)}
                  placeholder="Tap NFC Card or enter Health ID / Serial..."
                  className="w-full text-xs sm:text-sm font-mono pl-11 pr-28 py-3.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-100 text-slate-900 placeholder-slate-400 transition-all shadow-xs"
                />

                <div className="absolute right-2.5 flex items-center gap-1.5">
                  <span className="hidden sm:inline-block text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-white text-slate-400 border border-slate-200">
                    Ctrl K
                  </span>
                  <button
                    type="submit"
                    disabled={loading || !cardSerial.trim()}
                    className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs transition-colors shadow-xs disabled:opacity-40"
                  >
                    {loading ? 'Verifying...' : 'Scan Card'}
                  </button>
                </div>
              </div>
            </form>

            {/* Quick Testing Presets & Emergency Access */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              {/* Presets Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsPresetDropdownOpen(!isPresetDropdownOpen)}
                  className="px-3.5 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium flex items-center gap-2 transition-colors"
                >
                  <User className="w-3.5 h-3.5 text-teal-600" />
                  <span>Demo Patient Cards</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {isPresetDropdownOpen && (
                  <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-72 rounded-xl bg-white border border-slate-200 shadow-xl p-2 z-50 text-left">
                    <div className="px-3 py-1.5 text-[10px] uppercase font-semibold text-slate-400 border-b border-slate-100">
                      Pre-Seeded Test Citizens
                    </div>
                    <div className="py-1 space-y-1">
                      {PRESET_CARDS.map((p) => (
                        <button
                          key={p.patient.healthId}
                          type="button"
                          onClick={() => handleSelectPreset(p, true)}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-700 hover:text-slate-900 transition-colors flex items-center justify-between"
                        >
                          <div>
                            <div className="font-semibold text-slate-900">{p.label}</div>
                            <div className="text-[10px] font-mono text-teal-700">{p.serial}</div>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400">{p.patient.healthId}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Emergency Break-Glass Link */}
              <button
                type="button"
                onClick={() => setIsBreakGlassOpen(true)}
                className="text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1.5 transition-colors"
              >
                <Siren className="w-3.5 h-3.5 text-rose-500" />
                <span>Emergency Break-Glass Override</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEPS 2 & 3: PATIENT HERO BANNER (Shown whenever patient is active)       */}
      {/* ========================================================================= */}
      {workflowStep !== 'SCAN' && (
        <div className="rounded-2xl bg-white border border-slate-200/90 p-6 shadow-card relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            {/* Avatar & Primary Demographics */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-teal-50 border border-teal-200/80 text-teal-700 flex items-center justify-center font-bold text-base shadow-xs flex-shrink-0">
                {selectedPatient.shortName
                  ?.split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2) || 'PT'}
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                    {selectedPatient.name || selectedPatient.shortName}
                  </h2>
                  <span className="font-mono bg-slate-100 text-teal-800 px-2 py-0.5 rounded-md text-xs font-semibold border border-slate-200/60">
                    {selectedPatient.healthId}
                  </span>
                  {selectedPatient.nic && (
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/60">
                      NIC: {selectedPatient.nic}
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap font-normal">
                  <span>{calculateAge(selectedPatient.dateOfBirth)}</span>
                  <span>&bull;</span>
                  <span className="capitalize">{selectedPatient.sex}</span>
                  <span>&bull;</span>
                  <span>DOB: {selectedPatient.dateOfBirth}</span>
                </div>
              </div>
            </div>

            {/* Clinical Facts & Access Badge */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Blood Group */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                <Droplets className="w-3.5 h-3.5 text-rose-500" />
                <div>
                  <span className="text-[9px] uppercase font-semibold text-slate-400 block leading-tight">Blood Group</span>
                  <span className="font-semibold text-slate-900 leading-tight">
                    {emergencySummary?.bloodGroup || selectedPatient.bloodGroup || 'O+'}
                  </span>
                </div>
              </div>

              {/* Documented Allergies */}
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${
                  emergencySummary?.allergies?.length > 0
                    ? 'bg-rose-50 border-rose-200/80 text-rose-700'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <AlertOctagon
                  className={`w-3.5 h-3.5 ${
                    emergencySummary?.allergies?.length > 0 ? 'text-rose-600' : 'text-slate-400'
                  }`}
                />
                <div>
                  <span className="text-[9px] uppercase font-semibold text-slate-400 block leading-tight">Allergies</span>
                  <span className="font-medium text-xs leading-tight truncate max-w-[150px]">
                    {emergencySummary?.allergies?.length > 0
                      ? emergencySummary.allergies.map((a) => a.substance).join(', ')
                      : 'None documented'}
                  </span>
                </div>
              </div>

              {/* Active 90-Day Clinical Grant Badge */}
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${
                  grant
                    ? isBreakGlass
                      ? 'bg-rose-50 border-rose-200/80 text-rose-700'
                      : 'bg-emerald-50 border-emerald-200/80 text-emerald-700'
                    : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}
              >
                <Clock
                  className={`w-3.5 h-3.5 ${
                    grant ? (isBreakGlass ? 'text-rose-600' : 'text-emerald-600') : 'text-slate-400'
                  }`}
                />
                <div>
                  <span className="text-[9px] uppercase font-semibold text-slate-400 block leading-tight">3-Keys Status</span>
                  <span>
                    {grant
                      ? isBreakGlass
                        ? '24h Break-Glass'
                        : '90-Day Access Active'
                      : 'Card Tap Pending'}
                  </span>
                </div>
              </div>

              {/* Sensitive Records PIN Trigger */}
              {grant && (
                <div>
                  {unlockedPin ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 border border-purple-200/80 text-purple-700 text-xs font-medium">
                      <Unlock className="w-3.5 h-3.5 text-purple-600" />
                      <span>Sensitive Decrypted</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsPinModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-xs font-medium text-teal-700 border border-slate-200 transition-colors shadow-xs"
                    >
                      <Lock className="w-3.5 h-3.5 text-teal-600" />
                      <span>Unlock PIN</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: PATIENT DETAILS + TWO PRIMARY ACTION BUTTONS                      */}
      {/* ========================================================================= */}
      {workflowStep === 'PATIENT_SUMMARY' && (
        <div className="space-y-6">
          {/* Two Large Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Action 1: Prescribe Medicine */}
            <button
              type="button"
              onClick={() => setWorkflowStep('PRESCRIBE')}
              className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-card hover:shadow-md hover:border-teal-500/80 hover:-translate-y-0.5 transition-all text-left flex flex-col justify-between group"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 group-hover:bg-teal-600 group-hover:text-white transition-colors shadow-xs">
                    <Pill className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200/70">
                    HL7 FHIR MedicationRequest
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-bold tracking-tight text-slate-900 group-hover:text-teal-700 transition-colors">
                    Prescribe Medicine
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed mt-1">
                    Open the E-Prescription pad with automated drug-drug interaction (DDI) safety engine, allergy checks, and digital QR tokens.
                  </p>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-teal-700">
                <span>Open Prescription Pad</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>

            {/* Action 2: Issue Lab Report / Order */}
            <button
              type="button"
              onClick={() => setWorkflowStep('LAB_ORDER')}
              className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-card hover:shadow-md hover:border-amber-500/80 hover:-translate-y-0.5 transition-all text-left flex flex-col justify-between group"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition-colors shadow-xs">
                    <FlaskConical className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/70">
                    HL7 FHIR ServiceRequest
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-bold tracking-tight text-slate-900 group-hover:text-amber-700 transition-colors">
                    Issue Lab Report / Order
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed mt-1">
                    Order diagnostic investigation panels (FBS, HbA1c, Lipids, Creatinine) and review facility-signed laboratory reports.
                  </p>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-amber-700">
                <span>Open Diagnostic Order Pad</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          </div>

          {/* Verified Clinical Records Timeline (Reviewed at summary stage) */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-card space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600" />
                <span>Verified Longitudinal Clinical Records</span>
              </h3>
              <span className="text-xs font-mono text-slate-500">
                {records.length} Records Verified
              </span>
            </div>

            {records.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 space-y-2">
                <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto" />
                <div className="text-slate-500 font-normal">
                  No previous records found for this citizen in the national registry.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {records.map((r) => (
                  <div
                    key={r.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:shadow-xs transition-all space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-xs text-slate-800">{r.mainResource}</div>
                      <div className="flex items-center gap-1.5">
                        {r.trust?.status === 'VERIFIED' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            Ed25519 Verified
                          </span>
                        )}
                        {r.isSensitive && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200/80">
                            <Lock className="w-3 h-3 text-purple-600" />
                            Sensitive
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-3">
                      <span>Facility: <strong className="text-slate-700 font-medium">{r.facilityName || 'Medical Facility'}</strong></span>
                      <span>&bull;</span>
                      <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>

                    {/* Structured Observation Display */}
                    {r.bundle?.entry?.filter((e) => e.resource?.resourceType === 'Observation').map((obs) => {
                      const res = obs.resource;
                      return (
                        <div key={res.id || Math.random()} className="mt-2 p-2.5 rounded-lg bg-white border border-slate-200 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-800">
                              {res.code?.text || res.code?.coding?.[0]?.display || 'Diagnostic Observation'}
                            </span>
                            <span className="font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200/60 font-mono text-[11px]">
                              {res.valueQuantity?.value} {res.valueQuantity?.unit}
                            </span>
                          </div>
                          {res.referenceRange?.[0]?.text && (
                            <div className="text-[11px] text-slate-500 mt-1">
                              Reference: {res.referenceRange[0].text}
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
      )}

      {/* ========================================================================= */}
      {/* STEP 3A: DEDICATED PRESCRIBE VIEW                                         */}
      {/* ========================================================================= */}
      {workflowStep === 'PRESCRIBE' && (
        <div className="space-y-6">
          {/* Navigation Bar: Back & Finish */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setWorkflowStep('PATIENT_SUMMARY')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 text-xs font-semibold shadow-xs transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Patient Actions</span>
            </button>

            <button
              type="button"
              onClick={handleFinishAndNextPatient}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 text-xs font-medium shadow-xs transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Finish & Next Patient</span>
            </button>
          </div>

          {/* E-Prescription Pad & Safety Engine */}
          <div className="p-6 sm:p-8 rounded-2xl bg-white border border-slate-200/90 shadow-card space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700">
                  <Pill className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">E-Prescription Pad & Safety Engine</h2>
                  <p className="text-[11px] text-slate-500 font-normal">Author verified prescriptions with automated DDI contraindication safety checks.</p>
                </div>
              </div>
              <span className="text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200/70">
                HL7 FHIR MedicationRequest
              </span>
            </div>

            {/* Searchable Medication Autocomplete & Custom Entry */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700">
                  Search Medication Catalog or Enter Custom Drug
                </label>
                <span className="text-[10px] text-slate-400 font-mono">
                  {DEMO_DRUGS.length} Presets Available
                </span>
              </div>

              {/* Autocomplete Input Container */}
              <div ref={drugDropdownRef} className="relative">
                <div className="relative flex items-center">
                  <div className="absolute left-3.5 flex items-center pointer-events-none text-slate-400">
                    <Search className="w-4 h-4 text-teal-600" />
                  </div>

                  <input
                    type="text"
                    value={drugSearchQuery}
                    onChange={(e) => {
                      setDrugSearchQuery(e.target.value);
                      setIsDrugDropdownOpen(true);
                    }}
                    onFocus={() => setIsDrugDropdownOpen(true)}
                    placeholder="Type medication name (e.g. Losartan, Metformin, Azithromycin)..."
                    className="w-full text-xs p-2.5 pl-10 pr-10 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all"
                  />

                  {drugSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setDrugSearchQuery('');
                        setIsDrugDropdownOpen(true);
                      }}
                      className="absolute right-3 text-slate-400 hover:text-slate-600 text-xs p-1"
                      title="Clear"
                    >
                      &times;
                    </button>
                  )}
                </div>

                {/* Floating Autocomplete Dropdown */}
                {isDrugDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-2 rounded-xl bg-white border border-slate-200 shadow-lg p-2 z-50 max-h-72 overflow-y-auto space-y-1">
                    {filteredDrugs.length > 0 ? (
                      filteredDrugs.map((d) => (
                        <button
                          key={d.code}
                          type="button"
                          onClick={() => handleDrugChange(d)}
                          className={`w-full p-2.5 rounded-lg text-left text-xs transition-colors flex items-center justify-between ${
                            selectedDrug.code === d.code
                              ? 'bg-teal-50 text-teal-800 font-semibold border border-teal-200/80'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="font-medium text-slate-900 flex items-center gap-2">
                              <span>{d.name}</span>
                              {d.generic && d.generic !== d.name && (
                                <span className="text-[10px] text-slate-400 font-normal">({d.generic})</span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
                              <span className="text-teal-700 font-medium">{d.code}</span>
                              <span>&bull;</span>
                              <span className="text-amber-700">{d.class}</span>
                              <span>&bull;</span>
                              <span>{d.tag}</span>
                            </div>
                          </div>
                          {selectedDrug.code === d.code && (
                            <Check className="w-4 h-4 text-teal-600 flex-shrink-0" />
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="p-3 text-center text-xs text-slate-400">
                        No exact catalog match found.
                      </div>
                    )}

                    {/* Custom Medication Entry Action */}
                    {drugSearchQuery.trim() && (
                      <button
                        type="button"
                        onClick={() => handleSelectCustomDrug(drugSearchQuery.trim())}
                        className="w-full p-2.5 rounded-lg text-left text-xs bg-slate-50 hover:bg-teal-50/60 border-t border-slate-100 flex items-center justify-between text-teal-800 transition-colors mt-1"
                      >
                        <div className="flex items-center gap-2">
                          <PlusCircle className="w-4 h-4 text-teal-600 flex-shrink-0" />
                          <div>
                            <span className="text-slate-500 font-normal">Prescribe Custom Medication: </span>
                            <strong className="text-slate-900 font-medium">&ldquo;{drugSearchQuery.trim()}&rdquo;</strong>
                          </div>
                        </div>
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 flex-shrink-0 font-medium">
                          Custom Drug
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Quick-Select Chips for Routine Prescriptions */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-500" />
                  Routine:
                </span>
                {routineDrugs.map((d) => {
                  const isSelected = selectedDrug.code === d.code;
                  return (
                    <button
                      key={d.code}
                      type="button"
                      onClick={() => handleDrugChange(d)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                        isSelected
                          ? 'bg-teal-50 text-teal-700 border border-teal-200/80 font-semibold shadow-xs'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/80'
                      }`}
                    >
                      {d.name.split(' ')[0]} {d.name.split(' ')[1]}
                    </button>
                  );
                })}
              </div>

              {/* Selected Medication Card */}
              {selectedDrug && (
                <div className="p-3.5 rounded-xl bg-teal-50/40 border border-teal-200/70 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-teal-100/80 border border-teal-200/60 text-teal-700 flex items-center justify-center font-bold flex-shrink-0">
                      <Pill className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 text-xs sm:text-sm">{selectedDrug.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>Code: <strong className="text-teal-700">{selectedDrug.code}</strong></span>
                        <span>&bull;</span>
                        <span>Class: <strong className="text-slate-700">{selectedDrug.class || 'OTHER'}</strong></span>
                        <span>&bull;</span>
                        <span className="text-slate-400">{selectedDrug.tag}</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-teal-100/80 text-teal-800 border border-teal-200/60 flex-shrink-0">
                    Selected Target
                  </span>
                </div>
              )}
            </div>

            {/* Dosage & Parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Dosage Instruction</label>
                <input
                  type="text"
                  value={dosageInstruction}
                  onChange={(e) => setDosageInstruction(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity (Units)</label>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Days Supply</label>
                <input
                  type="number"
                  min={1}
                  value={daysSupply}
                  onChange={(e) => setDaysSupply(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Repeats / Refills</label>
                <input
                  type="number"
                  min={0}
                  value={repeatsAllowed}
                  onChange={(e) => setRepeatsAllowed(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </div>
            </div>

            <button
              onClick={() => handlePrescribe()}
              disabled={loading || !grant}
              className="w-full py-3 px-4 rounded-xl text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{grant ? 'Issue Electronic Prescription' : 'Present Health Card to Prescribe'}</span>
            </button>
          </div>

          {/* Newly Issued Prescriptions */}
          {issuedPrescriptions.length > 0 && (
            <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-card space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
                <span>Recently Issued Prescription QR Code</span>
              </h3>

              <div className="space-y-4">
                {issuedPrescriptions.map((rx) => (
                  <div key={rx.id} className="p-4 rounded-xl border border-teal-200/80 bg-teal-50/30 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="font-semibold text-sm text-slate-900">{rx.medicationName}</div>
                      <div className="text-xs text-slate-600">{rx.dosageInstruction}</div>
                      <div className="text-xs text-teal-700 font-mono font-medium">Code: {rx.prescriptionCode}</div>
                      <div className="text-[11px] text-emerald-700 font-medium">
                        State: {rx.dispenseState} &bull; Repeats remaining: {rx.repeatsRemaining}
                      </div>
                    </div>

                    <div className="flex flex-col items-center p-2 rounded-lg bg-white border border-slate-200 shadow-xs">
                      <QrCodeView text={rx.prescriptionCode} size={90} />
                      <span className="text-[9px] font-mono text-slate-500 mt-1">Pharmacy QR Token</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 3B: DEDICATED LAB ORDER VIEW                                         */}
      {/* ========================================================================= */}
      {workflowStep === 'LAB_ORDER' && (
        <div className="space-y-6">
          {/* Navigation Bar: Back & Finish */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setWorkflowStep('PATIENT_SUMMARY')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 text-xs font-semibold shadow-xs transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Patient Actions</span>
            </button>

            <button
              type="button"
              onClick={handleFinishAndNextPatient}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 text-xs font-medium shadow-xs transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Finish & Next Patient</span>
            </button>
          </div>

          {/* Lab Orders Pad */}
          <div className="p-6 sm:p-8 rounded-2xl bg-white border border-slate-200/90 shadow-card space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-700">
                  <FlaskConical className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">Order Diagnostic Tests & Lab Investigations</h2>
                  <p className="text-[11px] text-slate-500 font-normal">Generate structured FHIR ServiceRequest orders for accredited diagnostic laboratories.</p>
                </div>
              </div>
              <span className="text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200/70">
                HL7 FHIR ServiceRequest
              </span>
            </div>

            {/* Standard test presets */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Select Investigation Panel</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {DEMO_LAB_TESTS.map((t) => (
                  <button
                    key={t.code}
                    type="button"
                    onClick={() => setSelectedLabTest(t)}
                    className={`p-3.5 rounded-xl border text-left text-xs transition-all ${
                      selectedLabTest.code === t.code
                        ? 'border-amber-400 bg-amber-50/60 font-semibold text-amber-900 ring-1 ring-amber-400/40'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-semibold text-slate-900">{t.name}</div>
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                <select
                  value={labPriority}
                  onChange={(e) => setLabPriority(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                >
                  <option value="ROUTINE">ROUTINE (Standard)</option>
                  <option value="URGENT">URGENT (Priority)</option>
                  <option value="STAT">STAT (Emergency)</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Clinical Indication / Notes</label>
                <input
                  type="text"
                  value={labNotes}
                  onChange={(e) => setLabNotes(e.target.value)}
                  placeholder="e.g. Fasting glucose level monitoring post treatment"
                  className="w-full text-xs p-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleOrderLabTest}
              disabled={loading || !grant}
              className="w-full py-3 px-4 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{grant ? 'Issue Lab Order (FHIR ServiceRequest)' : 'Present Health Card to Order'}</span>
            </button>
          </div>

          {/* Active Lab Orders Pipeline */}
          {labOrders.length > 0 && (
            <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-card space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-amber-600" />
                  <span>Diagnostic Lab Orders Pipeline</span>
                </span>
                <span className="text-[11px] font-mono text-slate-500">{labOrders.length} Orders</span>
              </h3>

              <div className="space-y-2">
                {labOrders.map((o) => {
                  const isCompleted = o.status === 'COMPLETED';
                  return (
                    <div
                      key={o.id}
                      className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                        isCompleted
                          ? 'border-emerald-200/80 bg-emerald-50/40'
                          : 'border-amber-200/80 bg-amber-50/40'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{o.testName}</span>
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              isCompleted
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {o.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          Order Code: {o.orderCode} &bull; Priority: {o.priority} &bull; Ordered: {new Date(o.orderedAt).toLocaleDateString()}
                        </div>
                        {o.clinicalNotes && (
                          <div className="text-[11px] text-slate-500 italic mt-0.5">
                            Notes: &ldquo;{o.clinicalNotes}&rdquo;
                          </div>
                        )}
                      </div>

                      {isCompleted && (
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-white px-2.5 py-1 rounded-lg border border-emerald-200/80 self-start sm:self-center shadow-xs">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Verified Results in Timeline</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

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
