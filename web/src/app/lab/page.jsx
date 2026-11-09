'use client';

import { useState, useEffect, useRef } from 'react';
import {
  FlaskConical,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  FileCheck,
  Upload,
  Search,
  Sparkles,
  ArrowRight,
  User,
  Building2,
  Lock,
  ChevronDown,
  Radio,
  Activity,
  FileText,
  Zap,
} from 'lucide-react';
import {
  getCurrentUser,
  login,
  getPatientLabOrders,
  completeLabOrder,
  uploadRecord,
  signBundleClient,
} from '../../lib/api';
import { DEMO_PATIENTS, DEMO_LAB_TESTS } from '../../lib/demo-data';

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

export default function LabPortal() {
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(DEMO_PATIENTS[0]);
  const [patientHealthId, setPatientHealthId] = useState(DEMO_PATIENTS[0].healthId);

  // Scanner bar state & shortcut ref
  const scannerInputRef = useRef(null);
  const [isPresetDropdownOpen, setIsPresetDropdownOpen] = useState(false);
  const presetDropdownRef = useRef(null);

  // Lab Orders state
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [worklistTab, setWorklistTab] = useState('PENDING'); // 'PENDING' | 'COMPLETED'

  // Result Entry Pad state
  const [activeOrder, setActiveOrder] = useState(null);
  const [observationValue, setObservationValue] = useState('');
  const [observationUnit, setObservationUnit] = useState('mg/dL');
  const [referenceRange, setReferenceRange] = useState('70 - 99 mg/dL (Normal)');
  const [technicianNotes, setTechnicianNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Auto-login as MLT Silva if not authenticated
  useEffect(() => {
    async function initMlt() {
      let user = getCurrentUser();
      if (!user || user.role !== 'LAB_STAFF') {
        const password = process.env.NEXT_PUBLIC_SEED_PASSWORD || 'hSk9SQ-yNLI3PBxm';
        const res = await login({ username: 'mlt.silva', password });
        if (res.ok) {
          setCurrentUser(res.data.session);
        }
      } else {
        setCurrentUser(user);
      }
    }
    initMlt();
  }, []);

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

  // Close preset dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (presetDropdownRef.current && !presetDropdownRef.current.contains(event.target)) {
        setIsPresetDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch orders whenever selected patient changes
  useEffect(() => {
    if (patientHealthId) {
      loadLabOrders(patientHealthId);
    }
  }, [patientHealthId]);

  const loadLabOrders = async (healthId) => {
    setLoading(true);
    setStatusMessage(null);
    const res = await getPatientLabOrders(healthId);
    setLoading(false);

    if (res.ok) {
      setOrders(res.data.orders || []);
      const pending = res.data.orders?.find((o) => o.status === 'ORDERED' || o.status === 'IN_PROGRESS');
      if (pending) {
        selectOrderForResultEntry(pending);
      } else {
        setActiveOrder(null);
      }
    } else {
      setStatusMessage({ type: 'error', text: res.error.message });
      setOrders([]);
    }
  };

  const handleScannerSubmit = (e) => {
    if (e) e.preventDefault();
    if (!patientHealthId.trim()) return;

    const query = patientHealthId.trim().toUpperCase();
    const matched =
      DEMO_PATIENTS.find(
        (p) =>
          p.healthId.toUpperCase() === query ||
          (p.shortName && p.shortName.toUpperCase().includes(query)) ||
          (p.name && p.name.toUpperCase().includes(query)) ||
          (p.nic && p.nic.toUpperCase() === query)
      ) || PRESET_CARDS.find((pc) => pc.serial.toUpperCase() === query)?.patient;

    if (matched) {
      setSelectedPatient(matched);
      setPatientHealthId(matched.healthId);
      loadLabOrders(matched.healthId);
    } else {
      const customPatient = {
        healthId: query,
        name: `Patient ${query}`,
        shortName: query,
        sex: 'unknown',
        dateOfBirth: null,
      };
      setSelectedPatient(customPatient);
      loadLabOrders(query);
    }
  };

  const handleSelectPreset = (preset) => {
    setSelectedPatient(preset.patient);
    setPatientHealthId(preset.patient.healthId);
    setIsPresetDropdownOpen(false);
    loadLabOrders(preset.patient.healthId);
  };

  const selectOrderForResultEntry = (order) => {
    setActiveOrder(order);
    const matchedPreset = DEMO_LAB_TESTS.find((t) => t.code === order.testCode);
    if (matchedPreset) {
      setObservationValue(String(matchedPreset.defaultVal));
      setObservationUnit(matchedPreset.unit);
      setReferenceRange(`${matchedPreset.normalRange} (Normal)`);
    } else {
      setObservationValue('100');
      setObservationUnit('units');
      setReferenceRange('Reference range on file');
    }
    setTechnicianNotes(
      `Analysis verified at ${currentUser?.facilityName || 'Demo Lab Colombo'}. Specimen collected in appropriate container.`
    );
  };

  // Automated reference range evaluation
  const evaluateObservation = () => {
    const val = parseFloat(observationValue);
    if (isNaN(val) || !activeOrder) return null;

    const code = activeOrder.testCode;
    if (code === '1558-6') {
      // Fasting Blood Glucose
      if (val < 70) return { status: 'LOW', label: 'Hypoglycemia Alert (<70 mg/dL)', color: 'bg-blue-950/50 text-blue-300 border-blue-500/40' };
      if (val <= 99) return { status: 'NORMAL', label: 'Normal Fasting Range (70-99 mg/dL)', color: 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40' };
      if (val <= 125) return { status: 'ELEVATED', label: 'Impaired / Pre-diabetic Range (100-125 mg/dL)', color: 'bg-amber-950/50 text-amber-300 border-amber-500/40' };
      return { status: 'HIGH', label: 'Hyperglycemia / Diabetic Range (≥126 mg/dL)', color: 'bg-rose-950/60 text-rose-300 border-rose-500/50 font-bold' };
    } else if (code === '4548-4') {
      // HbA1c
      if (val < 5.7) return { status: 'NORMAL', label: 'Optimal (<5.7%)', color: 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40' };
      if (val <= 6.4) return { status: 'ELEVATED', label: 'Pre-diabetes Range (5.7 - 6.4%)', color: 'bg-amber-950/50 text-amber-300 border-amber-500/40' };
      return { status: 'HIGH', label: 'Elevated HbA1c (≥6.5%)', color: 'bg-rose-950/60 text-rose-300 border-rose-500/50 font-bold' };
    } else if (code === '2093-3') {
      // Total Cholesterol
      if (val < 200) return { status: 'NORMAL', label: 'Desirable (<200 mg/dL)', color: 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40' };
      if (val <= 239) return { status: 'ELEVATED', label: 'Borderline High (200 - 239 mg/dL)', color: 'bg-amber-950/50 text-amber-300 border-amber-500/40' };
      return { status: 'HIGH', label: 'High Cholesterol (≥240 mg/dL)', color: 'bg-rose-950/60 text-rose-300 border-rose-500/50 font-bold' };
    } else if (code === '2160-0') {
      // Creatinine
      if (val <= 1.3) return { status: 'NORMAL', label: 'Normal Renal Function (0.7 - 1.3 mg/dL)', color: 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40' };
      return { status: 'HIGH', label: 'Elevated Serum Creatinine (Renal Stress)', color: 'bg-rose-950/60 text-rose-300 border-rose-500/50 font-bold' };
    }

    return { status: 'NORMAL', label: 'Within Reference Range', color: 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40' };
  };

  const evalResult = evaluateObservation();

  // Sign & Upload Report (Ed25519 Facility Signature)
  const handleSignAndUpload = async (e) => {
    e.preventDefault();
    if (!activeOrder) {
      setStatusMessage({ type: 'error', text: 'Please select a lab order to fulfill.' });
      return;
    }
    if (!observationValue.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter a numeric observation value.' });
      return;
    }

    setIsUploading(true);
    setStatusMessage(null);

    try {
      const reportId = `rep-${Date.now()}`;
      const obsId = `obs-${Date.now()}`;

      // 1. Build standard FHIR R4 DiagnosticReport / Observation Bundle
      const bundle = {
        resourceType: 'Bundle',
        id: `bundle-${reportId}`,
        type: 'collection',
        entry: [
          {
            resource: {
              resourceType: 'Patient',
              id: 'p-01',
              identifier: [{ system: 'urn:doc365:demo-phn', value: selectedPatient.healthId }],
              name: [{ text: selectedPatient.name || selectedPatient.shortName }],
            },
          },
          {
            resource: {
              resourceType: 'Observation',
              id: obsId,
              status: 'final',
              code: {
                coding: [
                  {
                    system: 'http://loinc.org',
                    code: activeOrder.testCode,
                    display: activeOrder.testName,
                  },
                ],
                text: activeOrder.testName,
              },
              subject: { reference: `Patient/${selectedPatient.healthId}` },
              valueQuantity: {
                value: parseFloat(observationValue),
                unit: observationUnit,
                system: 'http://unitsofmeasure.org',
                code: observationUnit,
              },
              referenceRange: [
                {
                  text: referenceRange,
                },
              ],
              note: technicianNotes ? [{ text: technicianNotes }] : [],
            },
          },
          {
            resource: {
              resourceType: 'DiagnosticReport',
              id: reportId,
              status: 'final',
              code: {
                coding: [
                  {
                    system: 'http://loinc.org',
                    code: activeOrder.testCode,
                    display: activeOrder.testName,
                  },
                ],
                text: activeOrder.testName,
              },
              subject: { reference: `Patient/${selectedPatient.healthId}` },
              performer: [
                {
                  reference: 'Organization/demo-lab-colombo',
                  display: 'Demo Lab Colombo',
                },
              ],
              result: [{ reference: `Observation/${obsId}` }],
            },
          },
        ],
      };

      // 2. Cryptographic Ed25519 signing by facility client
      const signRes = await signBundleClient(bundle, 'Organization/demo-lab-colombo');
      if (signRes.error || !signRes.provenance) {
        throw new Error(signRes.error || 'Failed to sign report with facility private key');
      }

      // 3. Upload verified record to Doc365 backend
      const uploadRes = await uploadRecord({
        bundle,
        provenance: signRes.provenance,
        isSensitive: false,
      });

      if (!uploadRes.ok) {
        throw new Error(uploadRes.error?.message || 'Failed to upload signed clinical record');
      }

      const uploadedRecord = uploadRes.data.record;

      // 4. Mark lab order as COMPLETED, linking the uploaded record
      const completeRes = await completeLabOrder(activeOrder.id, {
        resultRecordId: uploadedRecord.id,
      });

      if (!completeRes.ok) {
        throw new Error(completeRes.error?.message || 'Failed to update lab order completion state');
      }

      setStatusMessage({
        type: 'success',
        text: `Report signed & uploaded! Order ${activeOrder.orderCode} completed. Cryptographic hash: ${uploadedRecord.bundleSha256.slice(0, 16)}...`,
      });

      // Reload orders
      await loadLabOrders(selectedPatient.healthId);
      setActiveOrder(null);
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setIsUploading(false);
    }
  };

  const pendingOrders = orders.filter((o) => o.status === 'ORDERED' || o.status === 'IN_PROGRESS');
  const completedOrders = orders.filter((o) => o.status === 'COMPLETED');

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Header-Integrated Laboratory Command & ID Scanner Bar */}
      <div className="rounded-3xl bg-slate-950 border border-slate-800 text-white p-5 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-16 w-72 h-72 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5 relative z-10">
          {/* Diagnostic Facility & MLT Credentials */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 via-emerald-600 to-teal-500 text-white flex items-center justify-center font-bold shadow-md shadow-emerald-500/20">
              <FlaskConical className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold tracking-tight text-white">
                  Laboratory Diagnostic Worklist & Fulfillment
                </h1>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300">
                  Diagnostic Facility
                </span>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                  PHSRC #{currentUser?.licenseNumber || 'PHSRC-LAB-2024-9120'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium mt-0.5 flex items-center gap-2">
                <span>{currentUser?.facilityName || 'National Diagnostic Laboratory'}</span>
                <span>&bull;</span>
                <span>
                  MLT: <strong className="text-slate-200">{currentUser?.fullName || currentUser?.label || 'A. Silva'}</strong>
                </span>
              </p>
            </div>
          </div>

          {/* Integrated Sleek Health ID Scanner Bar */}
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <form onSubmit={handleScannerSubmit} className="relative flex-1">
              <div className="relative flex items-center">
                <div className="absolute left-3.5 flex items-center pointer-events-none text-emerald-400">
                  <Radio className="w-4 h-4 animate-pulse" />
                </div>

                <input
                  ref={scannerInputRef}
                  type="text"
                  value={patientHealthId}
                  onChange={(e) => setPatientHealthId(e.target.value)}
                  placeholder="Scan Health Card or enter Health ID..."
                  className="w-full text-xs font-mono pl-10 pr-24 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-700 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 text-white placeholder-slate-500 transition-all shadow-inner uppercase"
                />

                <div className="absolute right-2 flex items-center gap-1.5">
                  <span className="hidden sm:inline-block text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    Ctrl K
                  </span>
                  <button
                    type="submit"
                    disabled={loading || !patientHealthId.trim()}
                    className="px-3 py-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-emerald-500/20 disabled:opacity-40"
                  >
                    Scan ID
                  </button>
                </div>
              </div>
            </form>

            {/* Discreet Demo Preset Selector */}
            <div className="relative" ref={presetDropdownRef}>
              <button
                type="button"
                onClick={() => setIsPresetDropdownOpen(!isPresetDropdownOpen)}
                className="px-3 py-2.5 rounded-2xl bg-slate-900 border border-slate-700 hover:border-slate-600 text-xs text-slate-300 font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <span>Demo Patients</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {isPresetDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-2 z-50 text-xs">
                  <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-800">
                    Quick Simulated Citizens
                  </div>
                  <div className="py-1 space-y-1">
                    {PRESET_CARDS.map((p) => (
                      <button
                        key={p.patient.healthId}
                        type="button"
                        onClick={() => handleSelectPreset(p)}
                        className={`w-full text-left px-3 py-2 rounded-xl transition-colors flex items-center justify-between ${
                          selectedPatient.healthId === p.patient.healthId
                            ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <div>
                          <div className="font-bold">{p.label}</div>
                          <div className="text-[10px] font-mono text-emerald-400">{p.serial}</div>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">{p.patient.healthId}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Cryptographic Facility Indicator */}
            <div className="hidden lg:flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-2xl bg-slate-900/90 border border-emerald-500/30 text-emerald-300 whitespace-nowrap">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-[11px]">Ed25519 Ready</span>
            </div>
          </div>
        </div>
      </div>

      {/* Status Notifications */}
      {statusMessage && (
        <div
          className={`p-4 rounded-2xl text-xs flex items-center gap-2.5 font-medium border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
              : 'bg-red-950/40 border-red-500/30 text-red-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* 2. Patient Context Banner (Compact Glassmorphic Bar) */}
      <div className="rounded-3xl bg-slate-900/90 backdrop-blur-md border border-slate-800 text-white p-5 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-amber-500 text-white flex items-center justify-center font-black text-base shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-400/30 flex-shrink-0">
              {selectedPatient.shortName
                ?.split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2) || 'PT'}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-bold tracking-tight text-white">
                  {selectedPatient.name || selectedPatient.shortName}
                </h2>
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg bg-slate-950 border border-emerald-500/30 text-emerald-300">
                  {selectedPatient.healthId}
                </span>
                {selectedPatient.nic && (
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700">
                    NIC: {selectedPatient.nic}
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                {selectedPatient.dateOfBirth && (
                  <>
                    <span>{calculateAge(selectedPatient.dateOfBirth)}</span>
                    <span>&bull;</span>
                  </>
                )}
                <span className="capitalize">{selectedPatient.sex || 'Unknown'}</span>
                <span>&bull;</span>
                <span className="text-emerald-400 font-medium flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  Specimen Accession Ready
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs flex items-center gap-2 text-slate-300">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>
                Pending Tests: <strong className="text-amber-300 font-mono font-bold">{pendingOrders.length}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Balanced Diagnostic Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5 cols): Pending Lab Test Orders Worklist & Completed History */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 shadow-2xl space-y-4">
            {/* Worklist Tab Switcher */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWorklistTab('PENDING')}
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                    worklistTab === 'PENDING'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Pending ({pendingOrders.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setWorklistTab('COMPLETED')}
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                    worklistTab === 'COMPLETED'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Fulfilled ({completedOrders.length})</span>
                </button>
              </div>

              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                Worklist
              </span>
            </div>

            {/* Pending Orders Tab */}
            {worklistTab === 'PENDING' && (
              <div className="space-y-3">
                {pendingOrders.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-500 space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500/40 mx-auto" />
                    <div className="text-slate-300 font-semibold">No pending orders for this patient.</div>
                    <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                      Issue an investigation from the Doctor Portal (/doctor) to test diagnostic fulfillment here.
                    </p>
                  </div>
                ) : (
                  pendingOrders.map((order) => {
                    const isSelected = activeOrder?.id === order.id;
                    const isStat = order.priority === 'STAT';
                    const isUrgent = order.priority === 'URGENT';

                    return (
                      <div
                        key={order.id}
                        className={`p-4 rounded-2xl border transition-all ${
                          isSelected
                            ? 'border-amber-500/80 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                            : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-white">{order.testName}</span>
                              <span
                                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                                  isStat
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                                    : isUrgent
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                                }`}
                              >
                                {order.priority}
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 font-mono mt-0.5">
                              Code: {order.orderCode} &bull; LOINC: {order.testCode}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => selectOrderForResultEntry(order)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-1.5 transition-all self-start sm:self-center ${
                              isSelected
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                            }`}
                          >
                            <span>{isSelected ? 'Active for Entry' : 'Enter Results'}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-800/80 flex flex-wrap gap-x-4 gap-y-1">
                          <div>
                            Dr: <span className="font-semibold text-slate-200">{order.doctor?.fullName || 'Physician'}</span>
                          </div>
                          <div>
                            Facility: <span className="font-semibold text-slate-200">{order.facility?.name || 'Hospital'}</span>
                          </div>
                          {order.clinicalNotes && (
                            <div className="w-full text-slate-400 italic mt-0.5">
                              Notes: &ldquo;{order.clinicalNotes}&rdquo;
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Fulfilled Reports Tab */}
            {worklistTab === 'COMPLETED' && (
              <div className="space-y-3">
                {completedOrders.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-500">
                    No completed reports yet for this patient.
                  </div>
                ) : (
                  completedOrders.map((co) => (
                    <div
                      key={co.id}
                      className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-200">{co.testName}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            COMPLETED
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Code: {co.orderCode} &bull; Fulfilled:{' '}
                          {new Date(co.completedAt || co.orderedAt).toLocaleString()}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-300 bg-slate-950 px-2.5 py-1 rounded-lg border border-emerald-500/30 shadow-sm self-start sm:self-center">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>Verified Ed25519 Record</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Cryptographic Trust Information Panel */}
          <div className="rounded-3xl bg-slate-950 border border-slate-800 p-5 shadow-2xl space-y-3 text-xs">
            <div className="flex items-center gap-2 text-emerald-400 font-bold uppercase tracking-wider text-[11px]">
              <Lock className="w-4 h-4" />
              <span>Client-Side Facility Cryptographic Signing</span>
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Per DESIGN.md Section 4: Demo Lab Colombo signs the HL7 FHIR DiagnosticReport + Observation bundle locally
              with its private Ed25519 key. The server validates the signature against the facility public key, creating an
              immutable, tamper-proof record.
            </p>
          </div>
        </div>

        {/* Right Column (7 cols): Structured Result Entry & Facility Signing Pad */}
        <div className="lg:col-span-7 space-y-6">
          {activeOrder ? (
            <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <FileCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Structured Observation Entry & Signing
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Fulfilling Order: <span className="font-mono font-bold text-amber-300">{activeOrder.orderCode}</span> ({activeOrder.testName})
                    </p>
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-700 text-slate-300">
                  FHIR DiagnosticReport
                </span>
              </div>

              {/* Structured Observation Input Form */}
              <form onSubmit={handleSignAndUpload} className="space-y-4">
                <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">Analyte / Test</th>
                        <th className="py-2.5 px-3">LOINC</th>
                        <th className="py-2.5 px-3 w-32">Observed Value</th>
                        <th className="py-2.5 px-3 w-24">Unit</th>
                        <th className="py-2.5 px-3">Standard Reference Interval</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      <tr>
                        <td className="py-3 px-3 font-bold text-white">{activeOrder.testName}</td>
                        <td className="py-3 px-3 font-mono text-slate-400">{activeOrder.testCode}</td>
                        <td className="py-3 px-3">
                          <input
                            type="number"
                            step="any"
                            required
                            value={observationValue}
                            onChange={(e) => setObservationValue(e.target.value)}
                            placeholder="Value"
                            className="w-full text-sm font-bold p-2 rounded-xl bg-slate-900 border border-slate-700 focus:outline-none focus:border-amber-400 text-white"
                          />
                        </td>
                        <td className="py-3 px-3">
                          <input
                            type="text"
                            required
                            value={observationUnit}
                            onChange={(e) => setObservationUnit(e.target.value)}
                            placeholder="Unit"
                            className="w-full text-xs font-mono p-2 rounded-xl bg-slate-900 border border-slate-700 focus:outline-none focus:border-amber-400 text-slate-200"
                          />
                        </td>
                        <td className="py-3 px-3">
                          <input
                            type="text"
                            required
                            value={referenceRange}
                            onChange={(e) => setReferenceRange(e.target.value)}
                            placeholder="Range"
                            className="w-full text-xs p-2 rounded-xl bg-slate-900 border border-slate-700 focus:outline-none focus:border-amber-400 text-slate-200"
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Reference Range Trigger Banner */}
                {evalResult && (
                  <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs ${evalResult.color}`}>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 flex-shrink-0" />
                      <div>
                        <span className="font-bold">Automated Clinical Trigger: </span>
                        <span>{evalResult.label}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-900/80 border border-current">
                      Status: {evalResult.status}
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Pathologist / Medical Technologist Remarks
                  </label>
                  <textarea
                    rows={2}
                    value={technicianNotes}
                    onChange={(e) => setTechnicianNotes(e.target.value)}
                    className="w-full text-xs p-3 rounded-2xl bg-slate-950 border border-slate-700 focus:outline-none focus:border-emerald-400 text-slate-200"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isUploading}
                    className="w-full py-3.5 px-4 rounded-2xl text-xs font-bold bg-gradient-to-r from-amber-500 via-emerald-600 to-teal-500 hover:from-amber-400 hover:to-teal-400 text-slate-950 shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    <span>
                      {isUploading
                        ? 'Signing with Ed25519 & Uploading...'
                        : 'Sign with Ed25519 & Upload Verified Report'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-12 text-center shadow-2xl space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                <FlaskConical className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">Diagnostic Observation Station Idle</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Select a pending test from the worklist on the left to enter observation parameters and generate a
                  facility-signed HL7 FHIR DiagnosticReport.
                </p>
              </div>

              {pendingOrders.length > 0 && (
                <button
                  type="button"
                  onClick={() => selectOrderForResultEntry(pendingOrders[0])}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20 inline-flex items-center gap-1.5 transition-all"
                >
                  <span>Fulfill First Order ({pendingOrders[0].testName})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}