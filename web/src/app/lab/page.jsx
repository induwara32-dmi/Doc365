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
  Sparkles,
  ArrowRight,
  Lock,
  ChevronDown,
  Radio,
  Activity,
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

  // Load authenticated MLT lab session
  useEffect(() => {
    const user = getCurrentUser();
    if (user && user.role === 'LAB_STAFF') {
      setCurrentUser(user);
    }
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
      if (val < 70) return { status: 'LOW', label: 'Hypoglycemia Alert (<70 mg/dL)', color: 'bg-blue-50 text-blue-800 border-blue-200/80' };
      if (val <= 99) return { status: 'NORMAL', label: 'Normal Fasting Range (70-99 mg/dL)', color: 'bg-emerald-50 text-emerald-800 border-emerald-200/80' };
      if (val <= 125) return { status: 'ELEVATED', label: 'Impaired / Pre-diabetic Range (100-125 mg/dL)', color: 'bg-amber-50 text-amber-800 border-amber-200/80' };
      return { status: 'HIGH', label: 'Hyperglycemia / Diabetic Range (≥126 mg/dL)', color: 'bg-rose-50 text-rose-800 border-rose-200/80 font-semibold' };
    } else if (code === '4548-4') {
      // HbA1c
      if (val < 5.7) return { status: 'NORMAL', label: 'Optimal (<5.7%)', color: 'bg-emerald-50 text-emerald-800 border-emerald-200/80' };
      if (val <= 6.4) return { status: 'ELEVATED', label: 'Pre-diabetes Range (5.7 - 6.4%)', color: 'bg-amber-50 text-amber-800 border-amber-200/80' };
      return { status: 'HIGH', label: 'Elevated HbA1c (≥6.5%)', color: 'bg-rose-50 text-rose-800 border-rose-200/80 font-semibold' };
    } else if (code === '2093-3') {
      // Total Cholesterol
      if (val < 200) return { status: 'NORMAL', label: 'Desirable (<200 mg/dL)', color: 'bg-emerald-50 text-emerald-800 border-emerald-200/80' };
      if (val <= 239) return { status: 'ELEVATED', label: 'Borderline High (200 - 239 mg/dL)', color: 'bg-amber-50 text-amber-800 border-amber-200/80' };
      return { status: 'HIGH', label: 'High Cholesterol (≥240 mg/dL)', color: 'bg-rose-50 text-rose-800 border-rose-200/80 font-semibold' };
    } else if (code === '2160-0') {
      // Creatinine
      if (val <= 1.3) return { status: 'NORMAL', label: 'Normal Renal Function (0.7 - 1.3 mg/dL)', color: 'bg-emerald-50 text-emerald-800 border-emerald-200/80' };
      return { status: 'HIGH', label: 'Elevated Serum Creatinine (Renal Stress)', color: 'bg-rose-50 text-rose-800 border-rose-200/80 font-semibold' };
    }

    return { status: 'NORMAL', label: 'Within Reference Range', color: 'bg-emerald-50 text-emerald-800 border-emerald-200/80' };
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
      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-card p-5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5 relative z-10">
          {/* Diagnostic Facility & MLT Credentials */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-100 text-teal-700 flex items-center justify-center shadow-xs">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-semibold text-slate-900">
                  Laboratory Diagnostic Worklist & Fulfillment
                </h1>
                <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/80">
                  Diagnostic Facility
                </span>
                <span className="text-[10px] font-mono font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  PHSRC #{currentUser?.licenseNumber || 'PHSRC-LAB-2024-9120'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-normal mt-0.5 flex items-center gap-2">
                <span>{currentUser?.facilityName || 'National Diagnostic Laboratory'}</span>
                <span>&bull;</span>
                <span>
                  MLT: <strong className="text-slate-800 font-medium">{currentUser?.fullName || currentUser?.label || 'A. Silva'}</strong>
                </span>
              </p>
            </div>
          </div>

          {/* Integrated Sleek Health ID Scanner Bar */}
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <form onSubmit={handleScannerSubmit} className="relative flex-1">
              <div className="relative flex items-center">
                <div className="absolute left-3.5 flex items-center pointer-events-none text-teal-600">
                  <Radio className="w-4 h-4 animate-pulse" />
                </div>

                <input
                  ref={scannerInputRef}
                  type="text"
                  value={patientHealthId}
                  onChange={(e) => setPatientHealthId(e.target.value)}
                  placeholder="Scan Health Card or enter Health ID..."
                  className="w-full text-xs font-mono pl-10 pr-24 py-2.5 rounded-lg bg-slate-50 border border-slate-200 focus:bg-white focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 text-slate-900 placeholder-slate-400 uppercase transition-all shadow-xs"
                />

                <div className="absolute right-2 flex items-center gap-1.5">
                  <span className="hidden sm:inline-block text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-white text-slate-400 border border-slate-200">
                    Ctrl K
                  </span>
                  <button
                    type="submit"
                    disabled={loading || !patientHealthId.trim()}
                    className="px-3 py-1 rounded-md bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs transition-colors shadow-xs disabled:opacity-40"
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
                className="px-3 py-2.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-xs text-slate-700 font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-xs"
              >
                <span>Demo Patients</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {isPresetDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl bg-white border border-slate-200 shadow-lg p-2 z-50 text-xs">
                  <div className="px-3 py-1.5 text-[10px] uppercase font-semibold text-slate-400 border-b border-slate-100">
                    Quick Simulated Citizens
                  </div>
                  <div className="py-1 space-y-1">
                    {PRESET_CARDS.map((p) => (
                      <button
                        key={p.patient.healthId}
                        type="button"
                        onClick={() => handleSelectPreset(p)}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${
                          selectedPatient.healthId === p.patient.healthId
                            ? 'bg-teal-50 text-teal-800 font-semibold border border-teal-200/80'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
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

            {/* Cryptographic Facility Indicator */}
            <div className="hidden lg:flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/80 whitespace-nowrap">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[11px]">Ed25519 Ready</span>
            </div>
          </div>
        </div>
      </div>

      {/* Status Notifications */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2.5 font-medium border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200/80 text-emerald-900'
              : 'bg-rose-50 border-rose-200/80 text-rose-900'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* 2. Patient Context Banner (Compact Clean Bar) */}
      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-teal-50 border border-teal-200/80 text-teal-700 flex items-center justify-center font-bold text-sm shadow-xs flex-shrink-0">
              {selectedPatient.shortName
                ?.split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2) || 'PT'}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-semibold tracking-tight text-slate-900">
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
                {selectedPatient.dateOfBirth && (
                  <>
                    <span>{calculateAge(selectedPatient.dateOfBirth)}</span>
                    <span>&bull;</span>
                  </>
                )}
                <span className="capitalize">{selectedPatient.sex || 'Unknown'}</span>
                <span>&bull;</span>
                <span className="text-teal-700 font-medium flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-teal-600" />
                  Specimen Accession Ready
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200/80 text-xs flex items-center gap-2 text-amber-800">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>
                Pending Tests: <strong className="text-amber-900 font-mono font-bold">{pendingOrders.length}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Balanced Diagnostic Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5 cols): Pending Lab Test Orders Worklist & Completed History */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-card p-6 space-y-4">
            {/* Worklist Tab Switcher */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100/90 border border-slate-200/60">
                <button
                  type="button"
                  onClick={() => setWorklistTab('PENDING')}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    worklistTab === 'PENDING'
                      ? 'bg-white text-amber-800 border border-slate-200/60 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Pending ({pendingOrders.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setWorklistTab('COMPLETED')}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    worklistTab === 'COMPLETED'
                      ? 'bg-white text-emerald-800 border border-slate-200/60 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Fulfilled ({completedOrders.length})</span>
                </button>
              </div>

              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Worklist
              </span>
            </div>

            {/* Pending Orders Tab */}
            {worklistTab === 'PENDING' && (
              <div className="space-y-3">
                {pendingOrders.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-400 space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500/60 mx-auto" />
                    <div className="text-slate-700 font-medium">No pending orders for this patient.</div>
                    <p className="text-[11px] text-slate-400 max-w-xs mx-auto font-normal">
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
                        className={`p-4 rounded-xl border transition-all ${
                          isSelected
                            ? 'border-amber-400 bg-amber-50/40 shadow-xs'
                            : 'border-slate-200 bg-slate-50/50 hover:bg-white hover:shadow-xs'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-slate-900">{order.testName}</span>
                              <span
                                className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${
                                  isStat
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : isUrgent
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-teal-50 text-teal-700 border border-teal-200'
                                }`}
                              >
                                {order.priority}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 font-mono mt-0.5">
                              Code: {order.orderCode} &bull; LOINC: {order.testCode}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => selectOrderForResultEntry(order)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium shadow-xs flex items-center justify-center gap-1.5 transition-colors self-start sm:self-center ${
                              isSelected
                                ? 'bg-amber-600 hover:bg-amber-700 text-white font-semibold'
                                : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                            }`}
                          >
                            <span>{isSelected ? 'Active for Entry' : 'Enter Results'}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1 font-normal">
                          <div>
                            Dr: <span className="font-medium text-slate-800">{order.doctor?.fullName || 'Physician'}</span>
                          </div>
                          <div>
                            Facility: <span className="font-medium text-slate-800">{order.facility?.name || 'Hospital'}</span>
                          </div>
                          {order.clinicalNotes && (
                            <div className="w-full text-slate-500 italic mt-0.5">
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
                  <div className="text-center py-10 text-xs text-slate-400">
                    No completed reports yet for this patient.
                  </div>
                ) : (
                  completedOrders.map((co) => (
                    <div
                      key={co.id}
                      className="p-4 rounded-xl border border-emerald-200/80 bg-emerald-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{co.testName}</span>
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                            COMPLETED
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          Code: {co.orderCode} &bull; Fulfilled:{' '}
                          {new Date(co.completedAt || co.orderedAt).toLocaleString()}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-white px-2.5 py-1 rounded-lg border border-emerald-200/80 shadow-xs self-start sm:self-center">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Verified Ed25519 Record</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Cryptographic Trust Information Panel */}
          <div className="rounded-2xl bg-slate-50/80 border border-slate-200/80 p-5 shadow-xs space-y-2 text-xs">
            <div className="flex items-center gap-2 text-teal-700 font-semibold uppercase tracking-wider text-[11px]">
              <Lock className="w-3.5 h-3.5 text-teal-600" />
              <span>Client-Side Facility Cryptographic Signing</span>
            </div>
            <p className="text-slate-600 leading-relaxed text-[11px] font-normal">
              Per DESIGN.md Section 4: Demo Lab Colombo signs the HL7 FHIR DiagnosticReport + Observation bundle locally
              with its private Ed25519 key. The server validates the signature against the facility public key, creating an
              immutable, tamper-proof record.
            </p>
          </div>
        </div>

        {/* Right Column (7 cols): Structured Result Entry & Facility Signing Pad */}
        <div className="lg:col-span-7 space-y-6">
          {activeOrder ? (
            <div className="rounded-2xl bg-white border border-slate-200/90 shadow-card p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700">
                    <FileCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Structured Observation Entry & Signing
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Fulfilling Order: <span className="font-mono font-medium text-teal-700">{activeOrder.orderCode}</span> ({activeOrder.testName})
                    </p>
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600">
                  FHIR DiagnosticReport
                </span>
              </div>

              {/* Structured Observation Input Form */}
              <form onSubmit={handleSignAndUpload} className="space-y-4">
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium uppercase text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">Analyte / Test</th>
                        <th className="py-2.5 px-3">LOINC</th>
                        <th className="py-2.5 px-3 w-32">Observed Value</th>
                        <th className="py-2.5 px-3 w-24">Unit</th>
                        <th className="py-2.5 px-3">Standard Reference Interval</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="py-3 px-3 font-semibold text-slate-900">{activeOrder.testName}</td>
                        <td className="py-3 px-3 font-mono text-slate-500">{activeOrder.testCode}</td>
                        <td className="py-3 px-3">
                          <input
                            type="number"
                            step="any"
                            required
                            value={observationValue}
                            onChange={(e) => setObservationValue(e.target.value)}
                            placeholder="Value"
                            className="w-full text-sm font-semibold p-2 rounded-lg bg-white border border-slate-200 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 text-slate-900"
                          />
                        </td>
                        <td className="py-3 px-3">
                          <input
                            type="text"
                            required
                            value={observationUnit}
                            onChange={(e) => setObservationUnit(e.target.value)}
                            placeholder="Unit"
                            className="w-full text-xs font-mono p-2 rounded-lg bg-white border border-slate-200 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 text-slate-700"
                          />
                        </td>
                        <td className="py-3 px-3">
                          <input
                            type="text"
                            required
                            value={referenceRange}
                            onChange={(e) => setReferenceRange(e.target.value)}
                            placeholder="Range"
                            className="w-full text-xs p-2 rounded-lg bg-white border border-slate-200 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 text-slate-700"
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Reference Range Trigger Banner */}
                {evalResult && (
                  <div className={`p-3 rounded-lg border flex items-center justify-between gap-3 text-xs ${evalResult.color}`}>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 flex-shrink-0" />
                      <div>
                        <span className="font-semibold">Automated Clinical Trigger: </span>
                        <span>{evalResult.label}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/80 border border-current">
                      Status: {evalResult.status}
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Pathologist / Medical Technologist Remarks
                  </label>
                  <textarea
                    rows={2}
                    value={technicianNotes}
                    onChange={(e) => setTechnicianNotes(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg bg-white border border-slate-200 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 text-slate-900"
                  />
                </div>

                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={isUploading}
                    className="w-full py-2.5 px-4 rounded-lg text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white shadow-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
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
            <div className="rounded-2xl bg-white border border-dashed border-slate-200 p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-lg bg-teal-50 border border-teal-100 text-teal-700 flex items-center justify-center mx-auto">
                <FlaskConical className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-900">Diagnostic Observation Station Idle</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto font-normal">
                  Select a pending test from the worklist on the left to enter observation parameters and generate a
                  facility-signed HL7 FHIR DiagnosticReport.
                </p>
              </div>

              {pendingOrders.length > 0 && (
                <button
                  type="button"
                  onClick={() => selectOrderForResultEntry(pendingOrders[0])}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white shadow-xs inline-flex items-center gap-1.5 transition-colors"
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
