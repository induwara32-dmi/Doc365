'use client';

import { useState, useEffect } from 'react';
import {
  Pill,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertOctagon,
  Clock,
  User,
  Building2,
  Lock,
  ArrowRight,
  PackageCheck,
  AlertTriangle,
} from 'lucide-react';
import { scanPrescription, dispensePrescription, getCurrentUser, login } from '../../lib/api';

export default function PharmacyPortal() {
  const [currentUser, setCurrentUser] = useState(null);
  const [prescriptionCode, setPrescriptionCode] = useState('');
  const [scannedData, setScannedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  // Dispense Form State
  const [quantityToDispense, setQuantityToDispense] = useState(0);
  const [daysSupply, setDaysSupply] = useState(0);
  const [notes, setNotes] = useState('Standard foil pack dispensed');
  const [dispenseResult, setDispenseResult] = useState(null);

  // Auto-login as Pharmacist Fernando
  useEffect(() => {
    async function initPharmacist() {
      let user = getCurrentUser();
      if (!user || user.role !== 'PHARMACIST') {
        const password = process.env.NEXT_PUBLIC_SEED_PASSWORD || 'hSk9SQ-yNLI3PBxm';
        const res = await login({ username: 'pharm.fernando', password });
        if (res.ok) {
          setCurrentUser(res.data.session);
        }
      } else {
        setCurrentUser(user);
      }
    }
    initPharmacist();
  }, []);

  // Handle Scan QR
  const handleScan = async (e) => {
    if (e) e.preventDefault();
    if (!prescriptionCode.trim()) return;

    setLoading(true);
    setStatusMessage(null);
    setDispenseResult(null);

    const res = await scanPrescription(prescriptionCode.trim());
    setLoading(false);

    if (res.ok) {
      setScannedData(res.data);
      setQuantityToDispense(res.data.prescription.quantity);
      setDaysSupply(res.data.prescription.daysSupply);
      setStatusMessage({
        type: 'success',
        text: `Prescription found: ${res.data.prescription.medicationName} (${res.data.prescription.dispenseState})`,
      });
    } else {
      setScannedData(null);
      setStatusMessage({ type: 'error', text: res.error.message || 'Prescription not found.' });
    }
  };

  // Handle Dispense Medication
  const handleDispense = async () => {
    if (!scannedData) return;

    setLoading(true);
    setStatusMessage(null);

    const res = await dispensePrescription(prescriptionCode.trim(), {
      quantityDispensed: Number(quantityToDispense),
      daysSupply: Number(daysSupply),
      notes,
    });
    setLoading(false);

    if (res.ok) {
      setDispenseResult(res.data);
      setStatusMessage({
        type: 'success',
        text: `Successfully dispensed! State is now: ${res.data.prescription.dispenseState}`,
      });
      // Refresh scanned view
      handleScan();
    } else if (res.status === 409 || res.data?.error?.code === 'PRESCRIPTION_ALREADY_DISPENSED') {
      setStatusMessage({
        type: 'security_block',
        text: 'RE-USE PREVENTED (409 Conflict): This prescription has already been fully dispensed and cannot be reused.',
      });
    } else {
      setStatusMessage({ type: 'error', text: res.error.message });
    }
  };

  return (
    <div className="space-y-8">
      {/* Session Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
            <Pill className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">Pharmacy Dispense & Verification Portal</h1>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-100 text-sky-800">
                Scoped Access
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Authenticated Session: <span className="font-semibold text-slate-700">{currentUser?.label || 'Demo Pharmacy Colombo, Pharmacist T. Fernando'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200">
          <Lock className="w-4 h-4 text-emerald-600" />
          <span>Zero Full-Record Leakage Guarantee</span>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2.5 font-medium border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : statusMessage.type === 'security_block'
              ? 'bg-red-50 border-red-300 text-red-950 font-bold'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertOctagon className="w-5 h-5 flex-shrink-0 text-red-600" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Main Dispensing Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: QR Scan Form */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-sky-600" />
              <span>Scan Prescription QR Code</span>
            </h2>

            <form onSubmit={handleScan} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Prescription Code (from patient QR)
                </label>
                <input
                  type="text"
                  value={prescriptionCode}
                  onChange={(e) => setPrescriptionCode(e.target.value)}
                  placeholder="DEMO-RX-YYYYMMDD-XXXXXXXX"
                  className="w-full text-xs font-mono p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 uppercase"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !prescriptionCode.trim()}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                <QrCode className="w-4 h-4" />
                <span>Verify & Load Prescription</span>
              </button>
            </form>

            <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
              <div className="font-semibold text-slate-700">Sample Demonstration Codes:</div>
              <p>Generate one from the Doctor Portal or use any active code from your previous session.</p>
            </div>
          </div>

          {/* Scoped Privacy Indicator Box */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-md space-y-3 text-xs">
            <div className="flex items-center gap-2 text-emerald-400 font-bold uppercase tracking-wider text-[11px]">
              <Lock className="w-4 h-4" />
              <span>Scoped Access Enforcement</span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Per Sri Lanka Privacy Framework and DESIGN.md: Pharmacists are strictly restricted to the scanned prescription payload.
              Full medical history, past admissions, lab reports, and sensitive notes are strictly hidden.
            </p>
          </div>
        </div>

        {/* Center & Right Column: Scoped Prescription View & Dispense Pad */}
        <div className="lg:col-span-2 space-y-6">
          {scannedData ? (
            <div className="space-y-6">
              {/* Prescription Header & Scoped Data */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Prescription Code</span>
                    <h2 className="text-base font-bold font-mono text-slate-900">{scannedData.prescription.prescriptionCode}</h2>
                  </div>

                  {/* Status Badge */}
                  <div>
                    {scannedData.prescription.dispenseState === 'DISPENSED' ? (
                      <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-black tracking-wide bg-red-600 text-white shadow-md shadow-red-600/20">
                        <AlertOctagon className="w-4 h-4" />
                        ISSUED / DISPENSED
                      </span>
                    ) : scannedData.prescription.dispenseState === 'PARTIALLY_DISPENSED' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        <Clock className="w-3.5 h-3.5" />
                        PARTIALLY DISPENSED ({scannedData.prescription.repeatsRemaining} REFILL REMAINING)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        PENDING DISPENSE (ORIGINAL FILL)
                      </span>
                    )}
                  </div>
                </div>

                {/* Patient Verification (Scoped Demographics) */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">Patient Name</div>
                    <div className="font-bold text-slate-900 truncate">{scannedData.patient.fullName}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">Health ID</div>
                    <div className="font-mono text-emerald-700 font-semibold">{scannedData.patient.healthId}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">Date of Birth</div>
                    <div className="font-mono text-slate-700">{scannedData.patient.dateOfBirth}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">Gender</div>
                    <div className="capitalize text-slate-700">{scannedData.patient.sex}</div>
                  </div>
                </div>

                {/* Medication Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Medication Prescribed</div>
                    <div className="text-base font-bold text-slate-900">{scannedData.prescription.medicationName}</div>
                    <div className="text-xs text-slate-600">{scannedData.prescription.dosageInstruction}</div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-center">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Quantity</div>
                      <div className="text-sm font-bold text-slate-800">{scannedData.prescription.quantity}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-center">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Days Supply</div>
                      <div className="text-sm font-bold text-slate-800">{scannedData.prescription.daysSupply}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-center">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Repeats Left</div>
                      <div className="text-sm font-bold text-slate-800">{scannedData.prescription.repeatsRemaining}</div>
                    </div>
                  </div>
                </div>

                {/* Prescriber info */}
                <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <div>Prescribed by: <span className="font-semibold text-slate-700">{scannedData.prescriber.doctorName}</span></div>
                  <div>Facility: <span className="font-semibold text-slate-700">{scannedData.prescriber.facilityName}</span></div>
                </div>
              </div>

              {/* Dispensing Action Card */}
              {scannedData.prescription.dispenseState !== 'DISPENSED' ? (
                <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <PackageCheck className="w-5 h-5 text-sky-600" />
                    <span>Dispense Order</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Quantity Dispensed</label>
                      <input
                        type="number"
                        min={1}
                        value={quantityToDispense}
                        onChange={(e) => setQuantityToDispense(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Days Supply</label>
                      <input
                        type="number"
                        min={1}
                        value={daysSupply}
                        onChange={(e) => setDaysSupply(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Pharmacist Notes</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  <button
                    onClick={handleDispense}
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white shadow-md shadow-sky-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    <PackageCheck className="w-4 h-4" />
                    <span>Confirm & Record Dispense (HL7 FHIR)</span>
                  </button>
                </div>
              ) : (
                <div className="p-6 rounded-2xl bg-gradient-to-r from-red-600 to-rose-700 text-white shadow-lg flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                      <AlertOctagon className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <div className="inline-block px-2.5 py-0.5 rounded-full bg-white text-red-700 text-[10px] font-black uppercase tracking-wider mb-1">
                        ISSUED / DISPENSED
                      </div>
                      <h4 className="font-bold text-base leading-tight">Prescription Already Issued</h4>
                      <p className="text-xs text-red-100 mt-1">
                        All authorized repeats have been dispensed. Re-dispensing of this QR token is cryptographically blocked across all nationwide pharmacies.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Dispense History for this prescription */}
              {scannedData.dispenseHistory?.length > 0 && (
                <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Dispense History</h3>
                  <div className="space-y-2">
                    {scannedData.dispenseHistory.map((d) => (
                      <div key={d.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-slate-800">{d.pharmacyName}</div>
                          <div className="text-[11px] text-slate-500">Dispensed by: {d.pharmacistName} &bull; {d.notes}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-slate-900">{d.quantityDispensed} units ({d.daysSupply}d)</div>
                          <div className="text-[11px] text-slate-400 font-mono">{new Date(d.dispensedAt).toLocaleDateString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 rounded-2xl bg-white border border-slate-200 text-center space-y-3 text-slate-400">
              <QrCode className="w-12 h-12 mx-auto text-slate-300" />
              <div className="text-sm font-semibold text-slate-600">No Prescription Loaded</div>
              <p className="text-xs max-w-sm mx-auto">
                Enter a prescription code from a patient QR above to retrieve the scoped dispensing payload.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
