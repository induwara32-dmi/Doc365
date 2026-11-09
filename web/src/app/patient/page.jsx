'use client';

import { useState, useEffect } from 'react';
import {
  User,
  ShieldCheck,
  Eye,
  EyeOff,
  Ban,
  Lock,
  Clock,
  History,
  AlertTriangle,
  Siren,
  KeyRound,
  CheckCircle2,
  Building2,
  FileText,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import {
  getAccessLedger,
  getPatientRecords,
  hideRecord,
  unhideRecord,
  blockProvider,
  unblockProvider,
  optOutPatient,
  optInPatient,
  setPatientPin,
  getCurrentUser,
  login,
} from '../../lib/api';
import HealthCard from '../../components/HealthCard';

export default function PatientPortal() {
  const [currentUser, setCurrentUser] = useState(null);
  const patientHealthId = 'DEMO-100001-7'; // Kumari Jayasinghe
  const [activeTab, setActiveTab] = useState('card'); // 'card' | 'ledger' | 'consent' | 'pin'

  // Data
  const [ledger, setLedger] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  // Consent & Blocking state
  const [pinInput, setPinInput] = useState('');
  const [blockFacilityCode, setBlockFacilityCode] = useState('demo-private-hospital');
  const [blockReason, setBlockReason] = useState('Personal choice / prefer local clinic');
  const [isOptedOut, setIsOptedOut] = useState(false);

  // Auto-login as Kumari
  useEffect(() => {
    async function initPatient() {
      let user = getCurrentUser();
      if (!user || user.role !== 'PATIENT') {
        const password = process.env.NEXT_PUBLIC_SEED_PASSWORD || 'hSk9SQ-yNLI3PBxm';
        const res = await login({ username: 'kumari', password, asPatient: true });
        if (res.ok) {
          setCurrentUser(res.data.session);
        }
      } else {
        setCurrentUser(user);
      }
      loadPatientData();
    }
    initPatient();
  }, []);

  const loadPatientData = async () => {
    setLoading(true);
    const [ledgerRes, recRes] = await Promise.all([
      getAccessLedger(patientHealthId),
      getPatientRecords(patientHealthId),
    ]);
    setLoading(false);

    if (ledgerRes.ok) {
      setLedger(ledgerRes.data.ledger || []);
    }
    if (recRes.ok) {
      setRecords(recRes.data.records || []);
    }
  };

  // Toggle Hide / Unhide Document
  const handleToggleHide = async (record) => {
    setStatusMessage(null);
    let res;
    if (record.isHidden) {
      res = await unhideRecord(patientHealthId, record.lineageId);
    } else {
      res = await hideRecord(patientHealthId, record.lineageId, 'Patient masked from routine view');
    }

    if (res.ok) {
      setStatusMessage({
        type: 'success',
        text: `Document status updated: ${record.isHidden ? 'Now Visible' : 'Hidden from Doctors'}.`,
      });
      loadPatientData();
    } else {
      setStatusMessage({ type: 'error', text: res.error.message });
    }
  };

  // Block Provider
  const handleBlockProvider = async (e) => {
    e.preventDefault();
    setStatusMessage(null);
    // In demo, resolve facility code to UUID via mock or pass facilityCode
    const res = await blockProvider(patientHealthId, {
      reason: blockReason,
    });

    if (res.ok) {
      setStatusMessage({ type: 'success', text: 'Provider blocked. Any active consultation grants revoked immediately.' });
      loadPatientData();
    } else {
      setStatusMessage({ type: 'error', text: res.error.message });
    }
  };

  // Set Sensitive PIN
  const handleSetPin = async (e) => {
    e.preventDefault();
    if (!pinInput || pinInput.length < 4 || pinInput.length > 6) {
      setStatusMessage({ type: 'error', text: 'PIN must be 4 to 6 digits.' });
      return;
    }
    const res = await setPatientPin(patientHealthId, pinInput);
    if (res.ok) {
      setStatusMessage({ type: 'success', text: 'Sensitive records PIN updated successfully.' });
      setPinInput('');
    } else {
      setStatusMessage({ type: 'error', text: res.error.message });
    }
  };

  // Toggle Opt Out / Opt In
  const handleToggleOptOut = async () => {
    let res;
    if (isOptedOut) {
      res = await optInPatient(patientHealthId);
      if (res.ok) setIsOptedOut(false);
    } else {
      res = await optOutPatient(patientHealthId, 'Patient preference');
      if (res.ok) setIsOptedOut(true);
    }
    if (res.ok) {
      setStatusMessage({
        type: 'success',
        text: isOptedOut ? 'Opted back in to national records.' : 'Opted out. Routine clinical access suspended.',
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
          <div className="w-11 h-11 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
            <User className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">Citizen Self-Sovereignty & Consent Portal</h1>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                Self-Sovereign
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Citizen: <span className="font-semibold text-slate-700">Herath Mudiyanselage Kumari Jayasinghe</span> ({patientHealthId})
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setActiveTab('card')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'card' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Digital Card
          </button>
          <button
            onClick={() => setActiveTab('ledger')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'ledger' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Who Viewed Me
          </button>
          <button
            onClick={() => setActiveTab('consent')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'consent' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Privacy Controls
          </button>
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

      {/* Tab 1: Digital Health Card Preview */}
      {activeTab === 'card' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <div className="flex justify-center">
            <HealthCard
              healthId="DEMO-100001-7"
              fullName="Herath Mudiyanselage Kumari Jayasinghe"
              dateOfBirth="1990-08-03"
              sex="female"
              nic="DEMO-NIC-199071500345"
              cardSerial="CARD-100001-1"
              status="ACTIVE"
            />
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900">About Your Digital Health Card</h2>
            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <p>
                <strong>The Health Card is a Key, Not a Storage Device:</strong> No medical records are stored on your card or inside the QR code.
                If lost, you can immediately block this card and have a replacement issued without losing any data.
              </p>
              <p>
                <strong>Three-Keys Security:</strong> A doctor can only access your full records when your card is physically presented and scanned,
                establishing a time-limited 90-day clinical consultation grant.
              </p>
              <p>
                <strong>Sensitive PIN Protection:</strong> Sensitive records (reproductive health, mental health) require your confidential PIN
                in addition to your card.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: "Who Viewed My Records" Access Ledger Timeline */}
      {activeTab === 'ledger' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <History className="w-5 h-5 text-purple-600" />
                <span>&quot;Who Viewed My Record&quot; Audit Ledger</span>
              </h2>
              <p className="text-xs text-slate-500">
                Estonian-style transparency: An append-only audit trail records every doctor, hospital, or pharmacy access.
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
              {ledger.length} Audit Events
            </span>
          </div>

          {ledger.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-400">
              No access events recorded yet. Access will appear as doctors and pharmacies interact with your record.
            </div>
          ) : (
            <div className="space-y-3">
              {ledger.map((item, index) => {
                const isBreakGlass = item.action?.includes('emergency') || item.action?.includes('break_glass');
                return (
                  <div
                    key={index}
                    className={`p-4 rounded-xl border text-xs transition-all ${
                      isBreakGlass
                        ? 'bg-red-50/70 border-red-200 text-red-950'
                        : 'bg-slate-50/70 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-bold flex items-center gap-2">
                        {isBreakGlass && <Siren className="w-4 h-4 text-red-600 animate-pulse" />}
                        <span className="capitalize">{item.action?.replace(/_/g, ' ')}</span>
                        {isBreakGlass && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-200 text-red-900">
                            Emergency Break-Glass
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500">
                        {new Date(item.at).toLocaleString()}
                      </div>
                    </div>

                    <div className="text-slate-600">
                      Actor: <span className="font-semibold text-slate-800">{item.actorLabel}</span>
                    </div>

                    {item.reason && (
                      <div className="mt-2 p-2 rounded-lg bg-white/80 border border-slate-200/80 text-[11px] text-slate-700">
                        <strong>Reason provided:</strong> {item.reason}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Privacy & Consent Controls */}
      {activeTab === 'consent' && (
        <div className="space-y-6">
          {/* Document Hiding Controls */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <EyeOff className="w-5 h-5 text-purple-600" />
                <span>Document Masking (Hide from Doctors)</span>
              </h2>
              <p className="text-xs text-slate-500">
                You can mask specific records from routine clinical view. Clinical records are append-only; hiding is tracked in a separate consent ledger.
              </p>
            </div>

            {records.length === 0 ? (
              <div className="text-xs text-slate-400 py-4">No records available to hide.</div>
            ) : (
              <div className="space-y-2.5">
                {records.map((r) => (
                  <div
                    key={r.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-800">{r.mainResource}</div>
                      <div className="text-[11px] text-slate-500">Facility: {r.facilityName || 'Lab / Clinic'} &bull; {new Date(r.createdAt).toLocaleDateString()}</div>
                    </div>
                    <button
                      onClick={() => handleToggleHide(r)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        r.isHidden
                          ? 'bg-amber-100 text-amber-900 border border-amber-200'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {r.isHidden ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5 text-amber-700" />
                          <span>Hidden (Masked)</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5 text-slate-500" />
                          <span>Visible to Doctors</span>
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sensitive Records PIN Setup */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-purple-600" />
              <span>Sensitive Records PIN Protection</span>
            </h2>
            <p className="text-xs text-slate-500">
              Set or update your 4-6 digit confidential PIN used to elevate access for sensitive records (mental health, HIV, reproductive care).
            </p>

            <form onSubmit={handleSetPin} className="flex items-center gap-3 max-w-sm">
              <input
                type="password"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="New 4-6 Digit PIN"
                className="text-xs font-mono p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 flex-1"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition-colors"
              >
                Save PIN
              </button>
            </form>
          </div>

          {/* Provider Blocking */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-600" />
              <span>Provider Blocking</span>
            </h2>
            <p className="text-xs text-slate-500">
              Block a specific facility or physician. Any existing 90-day consultation grants are immediately revoked.
            </p>

            <form onSubmit={handleBlockProvider} className="space-y-3 max-w-md">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Facility to Block</label>
                <select
                  value={blockFacilityCode}
                  onChange={(e) => setBlockFacilityCode(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="demo-private-hospital">Demo Private Hospital Kandy</option>
                  <option value="demo-general-hospital">Demo General Hospital Colombo</option>
                  <option value="demo-lab-colombo">Demo Lab Colombo</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Reason (Optional)</label>
                <input
                  type="text"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-sm transition-colors"
              >
                Block Provider & Revoke Grants
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
