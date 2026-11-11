'use client';

import { useState, useEffect } from 'react';
import {
  Pill,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  AlertOctagon,
  Clock,
  Lock,
  PackageCheck,
  Scan,
  Barcode,
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

  // Load authenticated pharmacist session
  useEffect(() => {
    const user = getCurrentUser();
    if (user && user.role === 'PHARMACIST') {
      setCurrentUser(user);
    }
  }, []);

  // Handle Scan QR
  const handleScan = async (codeToScan = null) => {
    const code = (codeToScan || prescriptionCode).trim();
    if (!code) return;

    setLoading(true);
    setStatusMessage(null);
    setDispenseResult(null);

    const res = await scanPrescription(code);
    setLoading(false);

    if (res.ok) {
      setScannedData(res.data);
      setPrescriptionCode(code);
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
      handleScan(prescriptionCode.trim());
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
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Dynamic Header & NMRA License */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200/90 shadow-card">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-100 text-teal-700 flex items-center justify-center shadow-xs">
            <Pill className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-semibold text-slate-900">Pharmacy POS Counter & Verification</h1>
              <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200/80">
                Scoped Pharmacy Gateway
              </span>
              <span className="text-[10px] font-mono font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                NMRA #{currentUser?.licenseNumber || 'NMRA-PH-2024-8841'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-normal mt-0.5 flex items-center gap-2">
              <span>{currentUser?.facilityName || 'National Health Pharmacy'}</span>
              <span>&bull;</span>
              <span>Pharmacist: <strong className="text-slate-700 font-medium">{currentUser?.fullName || currentUser?.label || 'T. Fernando'}</strong></span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 border border-slate-200 self-start sm:self-center">
          <Lock className="w-3.5 h-3.5 text-teal-600" />
          <span>Zero Full-Record Leakage</span>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2.5 font-medium border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200/80 text-emerald-900'
              : statusMessage.type === 'security_block'
              ? 'bg-rose-50 border-rose-300 text-rose-950 font-semibold'
              : 'bg-rose-50 border-rose-200/80 text-rose-900'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertOctagon className="w-4 h-4 flex-shrink-0 text-rose-600" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* POS Counter Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: POS Barcode Scanner Focus */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Barcode className="w-4 h-4 text-teal-600" />
                <span>Barcode / QR Scanner Focus</span>
              </h2>
              <span className="text-[10px] font-mono text-slate-400 uppercase">POS Ready</span>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleScan();
              }}
              className="space-y-3"
            >
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Scan className="w-4 h-4 text-teal-600" />
                </div>
                <input
                  type="text"
                  value={prescriptionCode}
                  onChange={(e) => setPrescriptionCode(e.target.value)}
                  placeholder="Scan or enter RX code..."
                  className="w-full text-xs font-mono pl-10 pr-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 focus:bg-white focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100 uppercase transition-all text-slate-900"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading || !prescriptionCode.trim()}
                className="w-full py-2.5 px-4 rounded-lg text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white shadow-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <QrCode className="w-4 h-4" />
                <span>{loading ? 'Scanning & Verifying...' : 'Load & Verify Prescription'}</span>
              </button>
            </form>

            <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-1 font-normal">
              <div className="font-medium text-slate-700">POS Counter Quick Tip:</div>
              <p>Hardware optical barcode scanners automatically press enter to verify the prescription token instantly.</p>
            </div>
          </div>

          {/* Privacy Enforcement Notice */}
          <div className="p-5 rounded-2xl bg-slate-50/80 border border-slate-200/80 text-slate-700 shadow-xs space-y-2 text-xs">
            <div className="flex items-center gap-2 text-teal-700 font-semibold uppercase tracking-wider text-[11px]">
              <Lock className="w-3.5 h-3.5 text-teal-600" />
              <span>Scoped FHIR Gateway Active</span>
            </div>
            <p className="text-slate-600 leading-relaxed text-[11px] font-normal">
              Under Sri Lanka Digital Health Architecture, the pharmacy portal receives strictly scoped FHIR MedicationRequest payload.
              Zero access to past hospital stays, diagnoses, or notes.
            </p>
          </div>
        </div>

        {/* Center & Right Column: Scoped Prescription POS Display */}
        <div className="lg:col-span-2 space-y-6">
          {scannedData ? (
            <div className="space-y-6">
              {/* Prescription Header & Large POS Typography */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-card space-y-5 relative overflow-hidden">
                {/* Prominent Red ISSUED Stamp if fully dispensed */}
                {scannedData.prescription.dispenseState === 'DISPENSED' && (
                  <div className="absolute right-4 top-4 pointer-events-none transform rotate-[-6deg] z-20">
                    <div className="border-2 border-rose-600 text-rose-700 font-bold text-xl sm:text-2xl tracking-widest px-3.5 py-1.5 rounded-lg bg-rose-50/95 shadow-xs uppercase">
                      ISSUED
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-medium text-slate-400">Prescription Token</span>
                    <h2 className="text-base font-semibold font-mono text-slate-900">{scannedData.prescription.prescriptionCode}</h2>
                  </div>

                  {/* Status Badge */}
                  <div>
                    {scannedData.prescription.dispenseState === 'DISPENSED' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide bg-rose-50 text-rose-700 border border-rose-200/80">
                        <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                        DISPENSED / COMPLETED
                      </span>
                    ) : scannedData.prescription.dispenseState === 'PARTIALLY_DISPENSED' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/80">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        PARTIALLY DISPENSED ({scannedData.prescription.repeatsRemaining} REFILL REMAINING)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        VALID FOR DISPENSE (ORIGINAL FILL)
                      </span>
                    )}
                  </div>
                </div>

                {/* Patient Verification (Scoped Demographics) */}
                <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/70 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <div className="text-[10px] uppercase font-medium text-slate-400">Patient Full Name</div>
                    <div className="text-sm font-semibold text-slate-900 truncate">{scannedData.patient.fullName}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-medium text-slate-400">Health ID</div>
                    <div className="font-mono text-teal-800 font-semibold">{scannedData.patient.healthId}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-medium text-slate-400">Date of Birth</div>
                    <div className="font-mono text-slate-700">{scannedData.patient.dateOfBirth}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-medium text-slate-400">Gender</div>
                    <div className="capitalize text-slate-700">{scannedData.patient.sex}</div>
                  </div>
                </div>

                {/* Medication Details (Clean POS Display) */}
                <div className="p-5 rounded-xl bg-teal-50/40 border border-teal-200/70 space-y-3">
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase font-semibold tracking-wider text-teal-800">Prescribed Drug</div>
                    <div className="text-xl font-bold text-slate-900">{scannedData.prescription.medicationName}</div>
                    <div className="text-xs font-normal text-slate-600">{scannedData.prescription.dosageInstruction}</div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-1">
                    <div className="p-3 rounded-lg bg-white border border-teal-200/60 text-center shadow-xs">
                      <div className="text-[10px] uppercase font-medium text-slate-400">Authorized Units</div>
                      <div className="text-lg font-bold text-slate-900">{scannedData.prescription.quantity}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-white border border-teal-200/60 text-center shadow-xs">
                      <div className="text-[10px] uppercase font-medium text-slate-400">Days Supply</div>
                      <div className="text-lg font-bold text-slate-900">{scannedData.prescription.daysSupply} d</div>
                    </div>
                    <div className="p-3 rounded-lg bg-white border border-teal-200/60 text-center shadow-xs">
                      <div className="text-[10px] uppercase font-medium text-slate-400">Refills Left</div>
                      <div className="text-lg font-bold text-slate-900">{scannedData.prescription.repeatsRemaining}</div>
                    </div>
                  </div>
                </div>

                {/* Prescriber info */}
                <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between font-normal">
                  <div>Prescribed by: <strong className="text-slate-800 font-medium">{scannedData.prescriber.doctorName}</strong></div>
                  <div>Facility: <strong className="text-slate-800 font-medium">{scannedData.prescriber.facilityName}</strong></div>
                </div>
              </div>

              {/* Dispensing Action Card */}
              {scannedData.prescription.dispenseState !== 'DISPENSED' ? (
                <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-card space-y-4">
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <PackageCheck className="w-4 h-4 text-teal-600" />
                    <span>POS Counter Dispense Action</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Quantity to Dispense</label>
                      <input
                        type="number"
                        min={1}
                        value={quantityToDispense}
                        onChange={(e) => setQuantityToDispense(e.target.value)}
                        className="w-full text-sm font-semibold p-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Days Supply</label>
                      <input
                        type="number"
                        min={1}
                        value={daysSupply}
                        onChange={(e) => setDaysSupply(e.target.value)}
                        className="w-full text-sm font-semibold p-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Pharmacist Dispensing Notes</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                    />
                  </div>

                  <button
                    onClick={handleDispense}
                    disabled={loading}
                    className="w-full py-2.5 px-4 rounded-lg text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white shadow-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <PackageCheck className="w-4 h-4" />
                    <span>Record Dispense & Stamp Prescription</span>
                  </button>
                </div>
              ) : (
                <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-950 shadow-xs flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center flex-shrink-0">
                      <AlertOctagon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="inline-block px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-semibold uppercase tracking-wider mb-0.5">
                        RE-USE PROHIBITED
                      </div>
                      <h4 className="font-semibold text-sm leading-tight text-slate-900">Prescription Already Issued</h4>
                      <p className="text-xs text-slate-600 mt-0.5 max-w-lg font-normal">
                        All authorized repeats have been dispensed. Re-dispensing of this QR token is cryptographically blocked across all nationwide pharmacies.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Dispense History for this prescription */}
              {scannedData.dispenseHistory?.length > 0 && (
                <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-card space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dispense Audit Trail</h3>
                  <div className="space-y-2">
                    {scannedData.dispenseHistory.map((d) => (
                      <div key={d.id} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/70 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-slate-800">{d.pharmacyName}</div>
                          <div className="text-[11px] text-slate-500 font-normal">Dispensed by: {d.pharmacistName} &bull; {d.notes}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-slate-900">{d.quantityDispensed} units ({d.daysSupply}d)</div>
                          <div className="text-[11px] text-slate-400 font-mono">{new Date(d.dispensedAt).toLocaleDateString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-16 rounded-2xl bg-white border border-dashed border-slate-200 text-center space-y-3 text-slate-400">
              <Barcode className="w-12 h-12 mx-auto text-slate-300" />
              <div className="text-sm font-semibold text-slate-700">POS Counter Ready</div>
              <p className="text-xs max-w-md mx-auto text-slate-500 font-normal">
                Scan patient QR code or type prescription token on the left to verify authenticity and dispense medications.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
