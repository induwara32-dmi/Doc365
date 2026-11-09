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
} from 'lucide-react';
import {
  scanCard,
  breakGlassAccess,
  getPatientRecords,
  createPrescription,
  getEmergencySummary,
  getActiveMedications,
  recordAllergy,
  getCurrentUser,
  login,
} from '../../lib/api';
import { DEMO_PATIENTS, DEMO_DRUGS } from '../../lib/demo-data';
import DdiSafetyModal from '../../components/DdiSafetyModal';
import BreakGlassModal from '../../components/BreakGlassModal';
import SensitiveGateModal from '../../components/SensitiveGateModal';
import QrCodeView from '../../components/QrCodeView';

export default function DoctorPortal() {
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(DEMO_PATIENTS[0]);
  const [cardSerial, setCardSerial] = useState('CARD-100001-1');

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

  // Update prescription defaults when drug changes
  const handleDrugChange = (drug) => {
    setSelectedDrug(drug);
    setDosageInstruction(drug.defaultDosage);
    setQuantity(drug.quantity);
    setDaysSupply(drug.daysSupply);
    setRepeatsAllowed(drug.repeatsAllowed || 0);
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
      setStatusMessage({ type: 'success', text: `90-day Consultation Grant established (Expires: ${new Date(res.data.grant.expiresAt).toLocaleDateString()})` });
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
      setStatusMessage({ type: 'warning', text: 'EMERGENCY OVERRIDE ACTIVATED: 24-hour access granted. High-priority audit trail logged.' });
      loadPatientClinicalData(selectedPatient.healthId);
    } else {
      setStatusMessage({ type: 'error', text: res.error.message });
    }
  };

  // Load verified patient records, active meds & emergency summary
  const loadPatientClinicalData = async (healthId, pin = null) => {
    const [recRes, medRes, emergRes] = await Promise.all([
      getPatientRecords(healthId, pin),
      getActiveMedications(healthId),
      getEmergencySummary(healthId),
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
      // Refresh medication list
      loadPatientClinicalData(selectedPatient.healthId, unlockedPin);
    } else if (res.status === 422 && res.data?.error?.details?.warnings) {
      // DDI or Allergy Warning Intercepted!
      setPendingPrescriptionData(payload);
      setDdiWarnings(res.data.error.details.warnings);
      setIsDdiModalOpen(true);
    } else {
      setStatusMessage({ type: 'error', text: res.error.message });
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner / Session Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
            <Stethoscope className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">Doctor Clinical Consultation Portal</h1>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                Three-Keys Rule
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Authenticated Session: <span className="font-semibold text-slate-700">{currentUser?.label || 'Dr. R. Perera'}</span>
            </p>
          </div>
        </div>

        {/* Emergency Action */}
        <button
          onClick={() => setIsBreakGlassOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-red-600/20 transition-all"
        >
          <Siren className="w-4 h-4 animate-pulse" />
          <span>Emergency Break-Glass</span>
        </button>
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
        {/* Left Column: Patient Lookup, Card Tap & Identity */}
        <div className="space-y-6">
          {/* Card Tap / Access Establishment Box */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              <span>1. Present Citizen Health Card</span>
            </h2>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Select Patient</label>
              <div className="grid grid-cols-1 gap-1.5">
                {DEMO_PATIENTS.map((p) => (
                  <button
                    key={p.healthId}
                    type="button"
                    onClick={() => {
                      setSelectedPatient(p);
                      setGrant(null);
                      setRecords([]);
                    }}
                    className={`text-left p-2.5 rounded-xl border text-xs transition-all ${
                      selectedPatient.healthId === p.healthId
                        ? 'border-emerald-500 bg-emerald-50/50 text-emerald-950 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div>{p.shortName}</div>
                    <div className="text-[11px] font-mono text-slate-500">{p.healthId}</div>
                  </button>
                ))}
              </div>
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
              <span>Tap / Scan Health Card</span>
            </button>
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

        {/* Center & Right Column: Clinical Timeline & E-Prescription Pad */}
        <div className="lg:col-span-2 space-y-6">
          {/* E-Prescription Writer */}
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
