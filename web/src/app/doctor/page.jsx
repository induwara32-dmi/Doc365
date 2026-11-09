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
  Users,
  ChevronDown,
  Check,
  ArrowRight,
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

export default function DoctorPortal() {
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(DEMO_PATIENTS[0]);
  const [cardSerial, setCardSerial] = useState('CARD-100001-1');

  // Multi-hospital switcher state
  const [availableFacilities, setAvailableFacilities] = useState([]);
  const [activeFacility, setActiveFacility] = useState(null);
  const [isFacilityDropdownOpen, setIsFacilityDropdownOpen] = useState(false);

  // Live Patient Queue State
  const [patientQueue, setPatientQueue] = useState([
    {
      token: '#01',
      patient: DEMO_PATIENTS[0],
      cardSerial: 'CARD-100001-1',
      status: 'IN_CONSULTATION',
      complaint: 'Routine Review: Type 2 Diabetes & Hyperlipidemia',
      triagePriority: 'ROUTINE',
      waitTime: '10 min ago',
    },
    {
      token: '#02',
      patient: DEMO_PATIENTS[1],
      cardSerial: 'CARD-100002-1',
      status: 'WAITING',
      complaint: 'Hypertension Followup & Chest Discomfort',
      triagePriority: 'URGENT',
      waitTime: '25 min ago',
    },
    {
      token: '#03',
      patient: DEMO_PATIENTS[2],
      cardSerial: 'CARD-100003-1',
      status: 'WAITING',
      complaint: 'Fasting Blood Sugar & Routine Renal Profile',
      triagePriority: 'ROUTINE',
      waitTime: '40 min ago',
    },
  ]);
  const [queueFilter, setQueueFilter] = useState('ALL');

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

  // Active Action Pad Tab
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

  // Select patient from queue
  const handleSelectQueueItem = (item) => {
    setSelectedPatient(item.patient);
    setCardSerial(item.cardSerial);
    setGrant(null);
    setRecords([]);
    setEmergencySummary(null);
    setActiveMedications([]);
    setPatientQueue((prev) =>
      prev.map((q) => (q.token === item.token ? { ...q, status: 'IN_CONSULTATION' } : q))
    );
  };

  // Complete current consultation
  const handleCompleteConsultation = () => {
    setPatientQueue((prev) =>
      prev.map((q) =>
        q.patient.healthId === selectedPatient.healthId ? { ...q, status: 'COMPLETED' } : q
      )
    );
    setStatusMessage({
      type: 'success',
      text: `Consultation marked complete for ${selectedPatient.fullName}. All cryptographic records verified & synchronized.`,
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

  const filteredQueue = patientQueue.filter((q) => {
    if (queueFilter === 'ALL') return true;
    return q.status === queueFilter;
  });

  const waitingCount = patientQueue.filter((q) => q.status === 'WAITING').length;
  const inConsultCount = patientQueue.filter((q) => q.status === 'IN_CONSULTATION').length;
  const completedCount = patientQueue.filter((q) => q.status === 'COMPLETED').length;

  return (
    <div className="space-y-6">
      {/* Clinical Command Center Header (Dark Slate Aesthetic) */}
      <div className="rounded-3xl bg-slate-950 border border-slate-800 text-white p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          {/* Doctor Profile & Credentials */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-bold shadow-lg shadow-emerald-500/20">
              <Stethoscope className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight text-white">
                  {currentUser?.fullName || currentUser?.label || 'Dr. R. Perera'}
                </h1>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                  {currentUser?.slmcNumber || 'SLMC #48291'}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {currentUser?.specialization || currentUser?.jobTitle || 'Consultant Physician'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                <span>National Clinical Command Center</span>
                <span>&bull;</span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  3-Keys Access Engine Live
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
                className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-600 text-xs text-left transition-colors"
              >
                <Building2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Active Hospital Facility</div>
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span>{activeFacility?.name || currentUser?.facilityName || 'Colombo National Hospital'}</span>
                    <span className="text-[10px] font-mono text-emerald-400">
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
                            ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div>
                          <div>{fac.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{fac.code} &bull; {fac.type}</div>
                        </div>
                        {activeFacility?.id === fac.id && <Check className="w-4 h-4 text-emerald-400" />}
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
            <div className="text-emerald-400 font-semibold flex items-center gap-1.5 mt-0.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>3-Keys NFC Token Gate</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Safety Verification</div>
            <div className="text-emerald-400 font-semibold flex items-center gap-1.5 mt-0.5">
              <Pill className="w-3.5 h-3.5" />
              <span>DDI & Allergy Interceptor</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Diagnostic Network</div>
            <div className="text-emerald-400 font-semibold flex items-center gap-1.5 mt-0.5">
              <FlaskConical className="w-3.5 h-3.5" />
              <span>FHIR ServiceRequest Live</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Audit Level</div>
            <div className="text-slate-200 font-semibold flex items-center gap-1.5 mt-0.5">
              <Lock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Tamper-Evident Ledger</span>
            </div>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2.5 font-medium border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : statusMessage.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-red-50 border-red-200 text-red-900'
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

      {/* Main Clinical Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Live Consultation Queue, Card Tap & Identity */}
        <div className="space-y-6">
          {/* Live Patient Queue Box */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                <span>Live Patient Queue</span>
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                {patientQueue.length} In Clinic
              </span>
            </div>

            {/* Queue Filter Tabs */}
            <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 text-[11px] font-semibold text-slate-600">
              <button
                type="button"
                onClick={() => setQueueFilter('ALL')}
                className={`py-1 rounded-lg text-center transition-all ${
                  queueFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'hover:text-slate-900'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setQueueFilter('WAITING')}
                className={`py-1 rounded-lg text-center transition-all ${
                  queueFilter === 'WAITING' ? 'bg-white text-amber-700 shadow-sm font-bold' : 'hover:text-slate-900'
                }`}
              >
                Wait ({waitingCount})
              </button>
              <button
                type="button"
                onClick={() => setQueueFilter('IN_CONSULTATION')}
                className={`py-1 rounded-lg text-center transition-all ${
                  queueFilter === 'IN_CONSULTATION' ? 'bg-white text-emerald-700 shadow-sm font-bold' : 'hover:text-slate-900'
                }`}
              >
                Active ({inConsultCount})
              </button>
              <button
                type="button"
                onClick={() => setQueueFilter('COMPLETED')}
                className={`py-1 rounded-lg text-center transition-all ${
                  queueFilter === 'COMPLETED' ? 'bg-white text-slate-700 shadow-sm font-bold' : 'hover:text-slate-900'
                }`}
              >
                Done ({completedCount})
              </button>
            </div>

            {/* Queue Items */}
            <div className="space-y-2">
              {filteredQueue.map((item) => {
                const isSelected = selectedPatient.healthId === item.patient.healthId;
                const isUrgent = item.triagePriority === 'URGENT';
                const isCompleted = item.status === 'COMPLETED';

                return (
                  <div
                    key={item.token}
                    onClick={() => handleSelectQueueItem(item)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/50 shadow-sm ring-1 ring-emerald-500'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <span className="font-mono text-emerald-700 bg-white border border-emerald-200 px-1.5 py-0.2 rounded text-[10px]">
                          {item.token}
                        </span>
                        <span className="text-slate-900">{item.patient.fullName}</span>
                      </div>
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          isCompleted
                            ? 'bg-slate-100 text-slate-600'
                            : item.status === 'IN_CONSULTATION'
                            ? 'bg-emerald-100 text-emerald-800'
                            : isUrgent
                            ? 'bg-red-100 text-red-800 animate-pulse'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {item.status === 'IN_CONSULTATION' ? 'Active' : item.status}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-600 mb-1 line-clamp-1">{item.complaint}</div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span>{item.patient.healthId}</span>
                      <span>{item.waitTime}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Three-Keys Card Tap Station */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                <span>NFC Card Tap Station</span>
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase">3-Keys Gate</span>
            </h2>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
              <div className="text-[10px] uppercase font-bold text-slate-400">Selected Citizen</div>
              <div className="text-xs font-bold text-slate-900">{selectedPatient.fullName}</div>
              <div className="text-[11px] font-mono text-emerald-700 font-semibold">{selectedPatient.healthId}</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Simulated Card Serial</label>
              <input
                type="text"
                value={cardSerial}
                onChange={(e) => setCardSerial(e.target.value)}
                className="w-full text-xs font-mono p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              onClick={handleCardTap}
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Establish 3-Keys Grant (Card Tap)</span>
            </button>

            {grant && (
              <button
                type="button"
                onClick={handleCompleteConsultation}
                className="w-full py-2 px-4 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center justify-center gap-1.5 transition-all"
              >
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Mark Consultation Complete</span>
              </button>
            )}
          </div>

          {/* Access Grant Status Badge */}
          {grant && (
            <div
              className={`p-4 rounded-2xl border ${
                isBreakGlass
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs mb-1">
                <Clock className="w-4 h-4" />
                <span>{isBreakGlass ? '24-Hour Break-Glass Grant Active' : '90-Day Clinical Grant Active'}</span>
              </div>
              <div className="text-[11px] text-slate-600 space-y-0.5">
                <div>Grant ID: <span className="font-mono text-[10px]">{grant.id?.slice(0, 8)}...</span></div>
                <div>Expires: {new Date(grant.expiresAt).toLocaleString()}</div>
              </div>
            </div>
          )}

          {/* Emergency Facts Summary */}
          {emergencySummary && (
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Emergency Quick Summary</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="text-[10px] uppercase text-slate-400 font-bold">Blood Group</div>
                  <div className="text-sm font-bold text-slate-900">{emergencySummary.bloodGroup}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="text-[10px] uppercase text-slate-400 font-bold">Documented Allergies</div>
                  <div className="font-semibold text-red-700 truncate">
                    {emergencySummary.allergies?.length > 0
                      ? emergencySummary.allergies.map((a) => a.substance).join(', ')
                      : 'None recorded'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Center & Right Column: Clinical Action Pad & Timeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Action Pad Selector Tabs */}
          <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveActionPad('prescribe')}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                activeActionPad === 'prescribe'
                  ? 'bg-white text-emerald-800 shadow-sm border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Pill className="w-4 h-4 text-emerald-600" />
              <span>E-Prescription Pad & DDI Safety</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveActionPad('lab')}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                activeActionPad === 'lab'
                  ? 'bg-white text-amber-800 shadow-sm border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FlaskConical className="w-4 h-4 text-amber-600" />
              <span>Order Diagnostic Tests (Lab Orders)</span>
            </button>
          </div>

          {/* Action Pad 1: E-Prescription Writer */}
          {activeActionPad === 'prescribe' && (
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Pill className="w-5 h-5 text-emerald-600" />
                  <h2 className="text-sm font-bold text-slate-900">E-Prescription Pad & Safety Engine</h2>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  HL7 FHIR MedicationRequest
                </span>
              </div>

              {/* Quick drug presets */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Select Drug to Prescribe</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {DEMO_DRUGS.map((d) => (
                    <button
                      key={d.code}
                      type="button"
                      onClick={() => handleDrugChange(d)}
                      className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                        selectedDrug.code === d.code
                          ? 'border-emerald-500 bg-emerald-50/60 font-bold text-emerald-950'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
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
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Dosage Instruction</label>
                  <input
                    type="text"
                    value={dosageInstruction}
                    onChange={(e) => setDosageInstruction(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Quantity (Units)</label>
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Days Supply</label>
                  <input
                    type="number"
                    min={1}
                    value={daysSupply}
                    onChange={(e) => setDaysSupply(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Repeats / Refills</label>
                  <input
                    type="number"
                    min={0}
                    value={repeatsAllowed}
                    onChange={(e) => setRepeatsAllowed(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <button
                onClick={() => handlePrescribe()}
                disabled={loading || !grant}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Issue Electronic Prescription</span>
              </button>
            </div>
          )}

          {/* Action Pad 2: Lab Orders Pad */}
          {activeActionPad === 'lab' && (
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <FlaskConical className="w-5 h-5 text-amber-600" />
                  <h2 className="text-sm font-bold text-slate-900">Order Diagnostic Tests & Lab Investigations</h2>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                  HL7 FHIR ServiceRequest
                </span>
              </div>

              {/* Standard test presets */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Select Investigation Panel</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {DEMO_LAB_TESTS.map((t) => (
                    <button
                      key={t.code}
                      type="button"
                      onClick={() => setSelectedLabTest(t)}
                      className={`p-3 rounded-xl border text-left text-xs transition-all ${
                        selectedLabTest.code === t.code
                          ? 'border-amber-500 bg-amber-50/60 font-bold text-amber-950 shadow-sm'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
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
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Priority</label>
                  <select
                    value={labPriority}
                    onChange={(e) => setLabPriority(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  >
                    <option value="ROUTINE">ROUTINE (Standard)</option>
                    <option value="URGENT">URGENT (Priority)</option>
                    <option value="STAT">STAT (Immediate Emergency)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Clinical Indication / Notes</label>
                  <input
                    type="text"
                    value={labNotes}
                    onChange={(e) => setLabNotes(e.target.value)}
                    placeholder="e.g. Check fasting glucose level following metformin therapy"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleOrderLabTest}
                disabled={loading || !grant}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Issue Lab Order (FHIR ServiceRequest)</span>
              </button>
            </div>
          )}

          {/* Active Lab Orders Pipeline */}
          {labOrders.length > 0 && (
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-amber-600" />
                  <span>Diagnostic Lab Orders Pipeline</span>
                </span>
                <span className="text-[11px] font-semibold text-slate-500">{labOrders.length} Orders</span>
              </h3>

              <div className="space-y-2">
                {labOrders.map((o) => {
                  const isCompleted = o.status === 'COMPLETED';
                  return (
                    <div
                      key={o.id}
                      className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                        isCompleted
                          ? 'border-emerald-200 bg-emerald-50/30'
                          : 'border-amber-200 bg-amber-50/30'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{o.testName}</span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              isCompleted
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {o.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          Order Code: {o.orderCode} &bull; Priority: {o.priority} &bull; Ordered: {new Date(o.orderedAt).toLocaleDateString()}
                        </div>
                        {o.clinicalNotes && (
                          <div className="text-[11px] text-slate-600 italic mt-0.5">
                            Notes: &ldquo;{o.clinicalNotes}&rdquo;
                          </div>
                        )}
                      </div>

                      {isCompleted && (
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 bg-white px-2.5 py-1 rounded-lg border border-emerald-200 shadow-sm self-start sm:self-center">
                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
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
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Recently Issued Prescription QR Code</span>
              </h3>

              <div className="space-y-4">
                {issuedPrescriptions.map((rx) => (
                  <div key={rx.id} className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="font-bold text-sm text-slate-900">{rx.medicationName}</div>
                      <div className="text-xs text-slate-600">{rx.dosageInstruction}</div>
                      <div className="text-xs text-slate-500 font-mono">Code: {rx.prescriptionCode}</div>
                      <div className="text-[11px] text-emerald-700 font-semibold">
                        State: {rx.dispenseState} &bull; Repeats remaining: {rx.repeatsRemaining}
                      </div>
                    </div>
                    <div className="flex flex-col items-center">
                      <QrCodeView text={rx.prescriptionCode} size={90} />
                      <span className="text-[9px] font-mono text-slate-500 mt-1">Pharmacy Scan QR</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clinical Records Timeline */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span>Verified Clinical Records Timeline</span>
              </h3>
              {!unlockedPin && (
                <button
                  onClick={() => setIsPinModalOpen(true)}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Unlock Sensitive Records</span>
                </button>
              )}
            </div>

            {records.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                {grant ? 'No clinical records found for this patient.' : 'Scan patient card to open verified clinical records.'}
              </div>
            ) : (
              <div className="space-y-3">
                {records.map((r) => (
                  <div key={r.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white transition-all space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-xs text-slate-800">{r.mainResource}</div>
                      <div className="flex items-center gap-1.5">
                        {r.trust?.status === 'VERIFIED' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            <ShieldCheck className="w-3 h-3" />
                            Ed25519 Verified
                          </span>
                        )}
                        {r.isSensitive && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                            <Lock className="w-3 h-3" />
                            Sensitive
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-3">
                      <span>Facility: {r.facilityName || 'Facility'}</span>
                      <span>Recorded: {new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>

                    {/* Structured Observation Display */}
                    {r.bundle?.entry?.filter((e) => e.resource?.resourceType === 'Observation').map((obs) => {
                      const res = obs.resource;
                      return (
                        <div key={res.id || Math.random()} className="mt-2 p-2.5 rounded-lg bg-white border border-slate-200/80 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">{res.code?.text || res.code?.coding?.[0]?.display || 'Diagnostic Observation'}</span>
                            <span className="font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              {res.valueQuantity?.value} {res.valueQuantity?.unit}
                            </span>
                          </div>
                          {res.referenceRange?.[0]?.text && (
                            <div className="text-[11px] text-slate-500 mt-0.5">
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
