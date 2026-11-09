'use client';

import { useState, useEffect } from 'react';
import {
  FlaskConical,
  CreditCard,
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

export default function LabPortal() {
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(DEMO_PATIENTS[0]);
  const [patientHealthId, setPatientHealthId] = useState(DEMO_PATIENTS[0].healthId);

  // Lab Orders state
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [worklistTab, setWorklistTab] = useState('PENDING'); // 'PENDING' | 'COMPLETED' | 'ALL'

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
      const pending = res.data.orders?.find((o) => o.status === 'ORDERED');
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

  const handlePatientSelect = (patient) => {
    setSelectedPatient(patient);
    setPatientHealthId(patient.healthId);
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
    setTechnicianNotes(`Analysis verified at ${currentUser?.facilityName || 'Demo Lab Colombo'}. Specimen collected in appropriate container.`);
  };

  // Calculate reference range evaluation trigger
  const evaluateObservation = () => {
    const val = parseFloat(observationValue);
    if (isNaN(val) || !activeOrder) return null;

    const code = activeOrder.testCode;
    if (code === '1558-6') {
      // Glucose
      if (val < 70) return { status: 'LOW', label: 'Hypoglycemia Alert', color: 'bg-blue-100 text-blue-800 border-blue-300' };
      if (val <= 99) return { status: 'NORMAL', label: 'Normal Fasting Range', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
      if (val <= 125) return { status: 'ELEVATED', label: 'Impaired / Pre-diabetic Range', color: 'bg-amber-100 text-amber-800 border-amber-300' };
      return { status: 'HIGH', label: 'Hyperglycemia / Diabetic Range (Trigger Alert)', color: 'bg-red-100 text-red-900 border-red-300 font-bold' };
    } else if (code === '4548-4') {
      // HbA1c
      if (val < 5.7) return { status: 'NORMAL', label: 'Optimal (<5.7%)', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
      if (val <= 6.4) return { status: 'ELEVATED', label: 'Pre-diabetes Range (5.7 - 6.4%)', color: 'bg-amber-100 text-amber-800 border-amber-300' };
      return { status: 'HIGH', label: 'Elevated HbA1c (≥6.5%)', color: 'bg-red-100 text-red-900 border-red-300 font-bold' };
    } else if (code === '2093-3') {
      // Cholesterol
      if (val < 200) return { status: 'NORMAL', label: 'Desirable (<200 mg/dL)', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
      if (val <= 239) return { status: 'ELEVATED', label: 'Borderline High (200 - 239 mg/dL)', color: 'bg-amber-100 text-amber-800 border-amber-300' };
      return { status: 'HIGH', label: 'High Cholesterol (≥240 mg/dL)', color: 'bg-red-100 text-red-900 border-red-300 font-bold' };
    } else if (code === '2160-0') {
      // Creatinine
      if (val <= 1.3) return { status: 'NORMAL', label: 'Normal Renal Function (0.7 - 1.3 mg/dL)', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
      return { status: 'HIGH', label: 'Elevated Serum Creatinine (Renal Stress)', color: 'bg-red-100 text-red-900 border-red-300 font-bold' };
    }

    return { status: 'NORMAL', label: 'Within Reference Range', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
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
    <div className="space-y-8">
      {/* Session Header with Dynamic MLT & PHSRC Credentials */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-600 to-yellow-500 text-white flex items-center justify-center font-bold shadow-md shadow-amber-500/20">
            <FlaskConical className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-slate-900">Laboratory Diagnostic Worklist & Fulfillment</h1>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                Diagnostic Facility
              </span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                PHSRC #{currentUser?.licenseNumber || 'PHSRC-LAB-2024-9120'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-2">
              <span>{currentUser?.facilityName || 'National Diagnostic Laboratory'}</span>
              <span>&bull;</span>
              <span>MLT: <strong className="text-slate-800">{currentUser?.fullName || currentUser?.label || 'A. Silva'}</strong></span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 self-start sm:self-center">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Ed25519 Cryptographic Signer Active</span>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2.5 font-medium border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Health Card Tap & Patient Lookup */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-amber-600" />
              <span>Patient Identification & Health Card</span>
            </h2>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Quick Patient Presets
              </label>
              <div className="space-y-2">
                {DEMO_PATIENTS.map((p) => {
                  const isSelected = selectedPatient.healthId === p.healthId;
                  return (
                    <button
                      key={p.healthId}
                      type="button"
                      onClick={() => handlePatientSelect(p)}
                      className={`w-full p-3 rounded-xl border text-left text-xs transition-all flex items-center justify-between ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50/60 font-bold text-amber-950'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div>
                        <div className="font-bold">{p.shortName || p.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{p.healthId}</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Scan / Enter Health ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={patientHealthId}
                  onChange={(e) => setPatientHealthId(e.target.value)}
                  placeholder="DEMO-XXXXXX-X"
                  className="w-full text-xs font-mono p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase"
                />
                <button
                  type="button"
                  onClick={() => loadLabOrders(patientHealthId)}
                  disabled={loading || !patientHealthId.trim()}
                  className="px-3.5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 disabled:opacity-50"
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Facility Signing Information Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-md space-y-3 text-xs">
            <div className="flex items-center gap-2 text-amber-400 font-bold uppercase tracking-wider text-[11px]">
              <Lock className="w-4 h-4" />
              <span>Client-Side Facility Signing</span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Per DESIGN.md Section 4: Demo Lab Colombo signs the HL7 FHIR bundle locally with its private Ed25519 key.
              The server verifies the signature against the database public key, creating an immutable verified record.
            </p>
          </div>
        </div>

        {/* Center & Right Column: Pending Orders & Result Entry */}
        <div className="lg:col-span-2 space-y-6">
          {/* Pending Orders Section */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span>Pending Lab Test Orders</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Tests requested by doctors for {selectedPatient.shortName || selectedPatient.name}
                </p>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                {pendingOrders.length} Pending
              </span>
            </div>

            {pendingOrders.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto" />
                <div>No pending orders for this patient.</div>
                <p className="text-[11px] text-slate-500">
                  Issue an investigation from the Doctor Portal (/doctor) to test fulfillment here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingOrders.map((order) => {
                  const isSelected = activeOrder?.id === order.id;
                  const isUrgent = order.priority === 'URGENT' || order.priority === 'STAT';

                  return (
                    <div
                      key={order.id}
                      className={`p-4 rounded-xl border transition-all ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50/40 shadow-sm'
                          : 'border-slate-200 bg-slate-50/40 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900">{order.testName}</span>
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                                isUrgent
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : 'bg-blue-100 text-blue-800 border border-blue-200'
                              }`}
                            >
                              {order.priority}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 font-mono">
                            Order Code: {order.orderCode} &bull; LOINC: {order.testCode}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => selectOrderForResultEntry(order)}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm flex items-center justify-center gap-1.5 transition-all self-start sm:self-center"
                        >
                          <span>{isSelected ? 'Active for Entry' : 'Enter Results'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="text-[11px] text-slate-600 pt-2 border-t border-slate-200/60 flex flex-wrap gap-x-4 gap-y-1">
                        <div>
                          Requested by: <span className="font-semibold text-slate-800">{order.doctor?.fullName || 'Physician'}</span>
                        </div>
                        <div>
                          Facility: <span className="font-semibold text-slate-800">{order.facility?.name || 'Hospital'}</span>
                        </div>
                        {order.clinicalNotes && (
                          <div className="w-full text-slate-500 italic mt-0.5">
                            Notes: &ldquo;{order.clinicalNotes}&rdquo;
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Structured Result Entry & Cryptographic Signing Pad */}
          {activeOrder && (
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-amber-600" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Structured Observation Entry & Cryptographic Signing
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Fulfilling Order: <span className="font-mono font-bold text-slate-800">{activeOrder.orderCode}</span> ({activeOrder.testName})
                    </p>
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  FHIR DiagnosticReport
                </span>
              </div>

              {/* Structured Tabular Observation Input Pad */}
              <form onSubmit={handleSignAndUpload} className="space-y-4">
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
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
                        <td className="py-3 px-3 font-bold text-slate-900">{activeOrder.testName}</td>
                        <td className="py-3 px-3 font-mono text-slate-500">{activeOrder.testCode}</td>
                        <td className="py-3 px-3">
                          <input
                            type="number"
                            step="any"
                            required
                            value={observationValue}
                            onChange={(e) => setObservationValue(e.target.value)}
                            placeholder="Value"
                            className="w-full text-sm font-bold p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-900"
                          />
                        </td>
                        <td className="py-3 px-3">
                          <input
                            type="text"
                            required
                            value={observationUnit}
                            onChange={(e) => setObservationUnit(e.target.value)}
                            placeholder="Unit"
                            className="w-full text-xs font-mono p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-700"
                          />
                        </td>
                        <td className="py-3 px-3">
                          <input
                            type="text"
                            required
                            value={referenceRange}
                            onChange={(e) => setReferenceRange(e.target.value)}
                            placeholder="Range"
                            className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-700"
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Reference Range Trigger Banner */}
                {evalResult && (
                  <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${evalResult.color}`}>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 flex-shrink-0" />
                      <div>
                        <span className="font-bold">Automated Clinical Trigger: </span>
                        <span>{evalResult.label}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/80 border border-current">
                      Status: {evalResult.status}
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Pathologist / Medical Technologist Remarks
                  </label>
                  <textarea
                    rows={2}
                    value={technicianNotes}
                    onChange={(e) => setTechnicianNotes(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isUploading}
                    className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
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
          )}

          {/* Completed Orders History */}
          {completedOrders.length > 0 && (
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Fulfilled & Verified Laboratory Reports</span>
              </h3>

              <div className="space-y-3">
                {completedOrders.map((co) => (
                  <div
                    key={co.id}
                    className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{co.testName}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          COMPLETED
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Code: {co.orderCode} &bull; Completed: {new Date(co.completedAt || co.orderedAt).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 bg-white px-2.5 py-1 rounded-lg border border-emerald-200 shadow-sm">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>Verified Ed25519 Record</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
