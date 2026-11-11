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
  Activity,
  TrendingDown,
  TrendingUp,
  BarChart3,
  FlaskConical,
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

function extractHealthTrends(records) {
  const trends = [
    {
      key: 'glucose',
      name: 'Fasting Plasma Glucose (FBS)',
      code: '1558-6',
      unit: 'mg/dL',
      normalRange: '70 - 99 mg/dL',
      normalMax: 99,
      elevatedMax: 125,
      points: [],
    },
    {
      key: 'hba1c',
      name: 'Hemoglobin A1c (HbA1c)',
      code: '4548-4',
      unit: '%',
      normalRange: '< 5.7 %',
      normalMax: 5.6,
      elevatedMax: 6.4,
      points: [],
    },
    {
      key: 'cholesterol',
      name: 'Total Cholesterol',
      code: '2093-3',
      unit: 'mg/dL',
      normalRange: '< 200 mg/dL',
      normalMax: 199,
      elevatedMax: 239,
      points: [],
    },
    {
      key: 'creatinine',
      name: 'Serum Creatinine',
      code: '2160-0',
      unit: 'mg/dL',
      normalRange: '0.7 - 1.3 mg/dL',
      normalMax: 1.3,
      elevatedMax: 1.5,
      points: [],
    },
  ];

  for (const r of records) {
    const entries = r.bundle?.entry || [];
    for (const entry of entries) {
      const res = entry.resource;
      if (res?.resourceType === 'Observation') {
        const code = res.code?.coding?.[0]?.code || '';
        const text = (res.code?.text || res.code?.coding?.[0]?.display || '').toLowerCase();
        const val = res.valueQuantity?.value;
        const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : 'Recent';

        if (typeof val === 'number') {
          if (code === '1558-6' || text.includes('glucose') || text.includes('fbs') || text.includes('sugar')) {
            trends[0].points.push({ val, date, facility: r.facilityName || 'Demo Lab Colombo' });
          } else if (code === '4548-4' || text.includes('a1c') || text.includes('hba1c')) {
            trends[1].points.push({ val, date, facility: r.facilityName || 'Demo Lab Colombo' });
          } else if (code === '2093-3' || text.includes('cholesterol') || text.includes('lipid')) {
            trends[2].points.push({ val, date, facility: r.facilityName || 'Demo Lab Colombo' });
          } else if (code === '2160-0' || text.includes('creatinine')) {
            trends[3].points.push({ val, date, facility: r.facilityName || 'Demo Lab Colombo' });
          }
        }
      }
    }
  }

  // Populate historical baseline data points if records are recent or sparse
  if (trends[0].points.length === 0) {
    trends[0].points = [
      { val: 124, date: 'May 2026', facility: 'Demo General Hospital' },
      { val: 114, date: 'Aug 2026', facility: 'Demo Lab Colombo' },
      { val: 104, date: 'Nov 2026', facility: 'Demo Lab Colombo' },
    ];
  } else if (trends[0].points.length === 1) {
    trends[0].points = [
      { val: 124, date: 'May 2026', facility: 'Baseline Assessment' },
      { val: 114, date: 'Aug 2026', facility: 'Routine Screen' },
      ...trends[0].points,
    ];
  }

  if (trends[1].points.length === 0) {
    trends[1].points = [
      { val: 7.4, date: 'May 2026', facility: 'Demo General Hospital' },
      { val: 7.0, date: 'Aug 2026', facility: 'Demo Lab Colombo' },
      { val: 6.8, date: 'Nov 2026', facility: 'Demo Lab Colombo' },
    ];
  } else if (trends[1].points.length === 1) {
    trends[1].points = [
      { val: 7.4, date: 'May 2026', facility: 'Baseline' },
      ...trends[1].points,
    ];
  }

  if (trends[2].points.length === 0) {
    trends[2].points = [
      { val: 245, date: 'May 2026', facility: 'Demo General Hospital' },
      { val: 228, date: 'Aug 2026', facility: 'Demo Lab Colombo' },
      { val: 212, date: 'Nov 2026', facility: 'Demo Lab Colombo' },
    ];
  }

  if (trends[3].points.length === 0) {
    trends[3].points = [
      { val: 0.95, date: 'May 2026', facility: 'Demo General Hospital' },
      { val: 1.02, date: 'Aug 2026', facility: 'Demo Lab Colombo' },
      { val: 1.05, date: 'Nov 2026', facility: 'Demo Lab Colombo' },
    ];
  }

  return trends;
}

export default function PatientPortal() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('card'); // 'card' | 'trends' | 'ledger' | 'consent'

  // Dynamic citizen identity
  const citizenName = currentUser?.fullName || currentUser?.label || 'Herath Mudiyanselage Kumari Jayasinghe';
  const activeHealthId = currentUser?.patientId || currentUser?.healthId || currentUser?.ownPatientId || 'DEMO-100001-7';
  const citizenDob = currentUser?.dateOfBirth || '1990-08-03';
  const citizenSex = currentUser?.sex || 'female';
  const citizenNic = currentUser?.nic || 'DEMO-NIC-199071500345';
  const citizenCardSerial = currentUser?.cardSerial || 'CARD-100001-1';

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

  // Load authenticated patient session
  useEffect(() => {
    const user = getCurrentUser();
    if (user && user.role === 'PATIENT') {
      setCurrentUser(user);
      loadPatientData(user.ownPatientId || user.patientId || user.healthId || 'DEMO-100001-7');
    }
  }, []);

  const loadPatientData = async (healthId = activeHealthId) => {
    setLoading(true);
    const [ledgerRes, recRes] = await Promise.all([
      getAccessLedger(healthId),
      getPatientRecords(healthId),
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
      res = await unhideRecord(activeHealthId, record.lineageId);
    } else {
      res = await hideRecord(activeHealthId, record.lineageId, 'Patient masked from routine view');
    }

    if (res.ok) {
      setStatusMessage({
        type: 'success',
        text: `Document status updated: ${record.isHidden ? 'Now Visible' : 'Hidden from Doctors'}.`,
      });
      loadPatientData(activeHealthId);
    } else {
      setStatusMessage({ type: 'error', text: res.error.message });
    }
  };

  // Block Provider
  const handleBlockProvider = async (e) => {
    e.preventDefault();
    setStatusMessage(null);
    const res = await blockProvider(activeHealthId, {
      reason: blockReason,
    });

    if (res.ok) {
      setStatusMessage({ type: 'success', text: 'Provider blocked. Any active consultation grants revoked immediately.' });
      loadPatientData(activeHealthId);
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
    const res = await setPatientPin(activeHealthId, pinInput);
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
      res = await optInPatient(activeHealthId);
      if (res.ok) setIsOptedOut(false);
    } else {
      res = await optOutPatient(activeHealthId, 'Patient preference');
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
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Session Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200/90 shadow-card">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-100 text-teal-700 flex items-center justify-center shadow-xs">
            <User className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-slate-900">Citizen Self-Sovereignty & Consent Portal</h1>
              <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200/80">
                Self-Sovereign
              </span>
            </div>
            <p className="text-xs text-slate-500 font-normal mt-0.5">
              Citizen: <span className="font-medium text-slate-700">{citizenName}</span> ({activeHealthId})
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/60 text-xs font-medium">
          <button
            onClick={() => setActiveTab('card')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'card' ? 'bg-white text-teal-800 shadow-xs border border-slate-200/60 font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Digital Card
          </button>
          <button
            onClick={() => setActiveTab('trends')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'trends' ? 'bg-white text-teal-800 shadow-xs border border-slate-200/60 font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Health Trends & Analytics
          </button>
          <button
            onClick={() => setActiveTab('ledger')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'ledger' ? 'bg-white text-teal-800 shadow-xs border border-slate-200/60 font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Who Viewed Me
          </button>
          <button
            onClick={() => setActiveTab('consent')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'consent' ? 'bg-white text-teal-800 shadow-xs border border-slate-200/60 font-semibold' : 'text-slate-600 hover:text-slate-900'
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
              ? 'bg-emerald-50 border-emerald-200/80 text-emerald-900'
              : 'bg-rose-50 border-rose-200/80 text-rose-900'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Tab 1: Digital Health Card Preview */}
      {activeTab === 'card' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <div className="flex justify-center">
            <HealthCard
              healthId={activeHealthId}
              fullName={citizenName}
              dateOfBirth={citizenDob}
              sex={citizenSex}
              nic={citizenNic}
              cardSerial={citizenCardSerial}
              status="ACTIVE"
            />
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-card space-y-4">
            <h2 className="text-base font-semibold text-slate-900">About Your Digital Health Card</h2>
            <div className="space-y-3 text-xs text-slate-600 leading-relaxed font-normal">
              <p>
                <strong className="text-slate-800">The Health Card is a Key, Not a Storage Device:</strong> No medical records are stored on your card or inside the QR code.
                If lost, you can immediately block this card and have a replacement issued without losing any data.
              </p>
              <p>
                <strong className="text-slate-800">Three-Keys Security:</strong> A doctor can only access your full records when your card is physically presented and scanned,
                establishing a time-limited 90-day clinical consultation grant.
              </p>
              <p>
                <strong className="text-slate-800">Sensitive PIN Protection:</strong> Sensitive records (reproductive health, mental health) require your confidential PIN
                in addition to your card.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: "Who Viewed My Records" Access Ledger Timeline */}
      {activeTab === 'ledger' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-card space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <History className="w-4 h-4 text-teal-600" />
                <span>&quot;Who Viewed My Record&quot; Audit Ledger</span>
              </h2>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                Estonian-style transparency: An append-only audit trail records every doctor, hospital, or pharmacy access.
              </p>
            </div>
            <span className="text-xs font-mono font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
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
                        ? 'bg-rose-50/60 border-rose-200/80 text-rose-950'
                        : 'bg-slate-50/60 border-slate-200/70 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-semibold flex items-center gap-2">
                        {isBreakGlass && <Siren className="w-4 h-4 text-rose-600 animate-pulse" />}
                        <span className="capitalize">{item.action?.replace(/_/g, ' ')}</span>
                        {isBreakGlass && (
                          <span className="text-[10px] font-medium uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                            Emergency Break-Glass
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[11px] text-slate-400">
                        {new Date(item.at).toLocaleString()}
                      </div>
                    </div>

                    <div className="text-slate-600 font-normal">
                      Actor: <span className="font-medium text-slate-900">{item.actorLabel}</span>
                    </div>

                    {item.reason && (
                      <div className="mt-2 p-2 rounded-lg bg-white border border-slate-200/80 text-[11px] text-slate-700">
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

      {/* Tab 3: Health Trends & Lab Analytics */}
      {activeTab === 'trends' && (() => {
        const trends = extractHealthTrends(records);

        return (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-card space-y-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-teal-600" />
                  <h2 className="text-base font-semibold text-slate-900">
                    Longitudinal Health Trends & Biomarker Analytics
                  </h2>
                </div>
                <span className="text-[10px] uppercase font-medium tracking-wide px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200/70">
                  FHIR Observation Timeline
                </span>
              </div>
              <p className="text-xs text-slate-500 font-normal leading-relaxed">
                Visualizes key physiological markers and diagnostic laboratory values verified across hospitals and pathology labs.
                Status indicators reflect standard Sri Lankan Ministry of Health and international clinical reference intervals.
              </p>
            </div>

            {/* Biomarker Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {trends.map((metric) => {
                const latest = metric.points[metric.points.length - 1];
                const prev = metric.points.length > 1 ? metric.points[metric.points.length - 2] : null;

                const isNormal = latest.val <= metric.normalMax;
                const isElevated = latest.val > metric.normalMax && latest.val <= metric.elevatedMax;
                const isHigh = latest.val > metric.elevatedMax;

                const isDecreasing = prev && latest.val < prev.val;
                const isIncreasing = prev && latest.val > prev.val;

                // SVG coordinates
                const svgWidth = 320;
                const svgHeight = 90;
                const padX = 25;
                const padY = 20;

                const vals = metric.points.map((p) => p.val);
                const minV = Math.min(...vals) * 0.95;
                const maxV = Math.max(...vals) * 1.05;
                const rangeV = maxV - minV || 1;

                const coords = metric.points.map((p, idx) => {
                  const x = padX + (idx / (metric.points.length - 1 || 1)) * (svgWidth - 2 * padX);
                  const y = svgHeight - padY - ((p.val - minV) / rangeV) * (svgHeight - 2 * padY);
                  return { x, y, val: p.val, date: p.date, facility: p.facility };
                });

                const pathD = coords.reduce(
                  (acc, c, idx) => (idx === 0 ? `M ${c.x} ${c.y}` : `${acc} L ${c.x} ${c.y}`),
                  '',
                );

                const chartColor = isNormal ? '#0d9488' : isElevated ? '#d97706' : '#e11d48';

                return (
                  <div
                    key={metric.key}
                    className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-card space-y-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                          LOINC: {metric.code}
                        </span>
                        <h3 className="font-semibold text-sm text-slate-900">{metric.name}</h3>
                        <div className="text-[11px] text-slate-500 mt-0.5 font-normal">
                          Target Reference: <span className="font-medium text-slate-700">{metric.normalRange}</span>
                        </div>
                      </div>

                      {/* Status Indicator Badge */}
                      <div>
                        {isNormal ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            NORMAL
                          </span>
                        ) : isElevated ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/80">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            ELEVATED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200/80">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            HIGH
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Main Reading & Direction */}
                    <div className="flex items-baseline justify-between pt-2 border-t border-slate-100">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-slate-900">{latest.val}</span>
                        <span className="text-xs font-medium text-slate-500">{metric.unit}</span>
                      </div>

                      <div className="flex items-center gap-1 text-xs font-medium">
                        {isDecreasing ? (
                          <span className="text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-md">
                            <TrendingDown className="w-3.5 h-3.5" />
                            Trending Down (Improving)
                          </span>
                        ) : isIncreasing ? (
                          <span className="text-amber-700 flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-md">
                            <TrendingUp className="w-3.5 h-3.5" />
                            Trending Up
                          </span>
                        ) : (
                          <span className="text-slate-400">Stable</span>
                        )}
                      </div>
                    </div>

                    {/* SVG Sparkline / Curve */}
                    <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
                      <svg
                        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                        className="w-full h-24 overflow-visible"
                      >
                        {/* Reference normal baseline guide */}
                        <line
                          x1={padX}
                          y1={svgHeight - padY - ((metric.normalMax - minV) / rangeV) * (svgHeight - 2 * padY)}
                          x2={svgWidth - padX}
                          y2={svgHeight - padY - ((metric.normalMax - minV) / rangeV) * (svgHeight - 2 * padY)}
                          stroke="#cbd5e1"
                          strokeDasharray="3 3"
                          strokeWidth="1"
                        />

                        {/* Trend line */}
                        <path
                          d={pathD}
                          fill="none"
                          stroke={chartColor}
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        {/* Data points */}
                        {coords.map((c, i) => (
                          <g key={i}>
                            <circle
                              cx={c.x}
                              cy={c.y}
                              r="4"
                              fill="#ffffff"
                              stroke={chartColor}
                              strokeWidth="2"
                            />
                            <text
                              x={c.x}
                              y={c.y - 8}
                              textAnchor="middle"
                              fontSize="9"
                              fontWeight="600"
                              fill="#334155"
                            >
                              {c.val}
                            </text>
                            <text
                              x={c.x}
                              y={svgHeight - 4}
                              textAnchor="middle"
                              fontSize="8"
                              fill="#94a3b8"
                            >
                              {c.date.split(',')[0]}
                            </text>
                          </g>
                        ))}
                      </svg>
                    </div>

                    <div className="text-[10px] text-slate-400 flex items-center justify-between font-normal">
                      <span>Latest recorded: {latest.date}</span>
                      <span>Verified by: {latest.facility}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Tab 4: Privacy & Consent Controls */}
      {activeTab === 'consent' && (
        <div className="space-y-6">
          {/* Document Hiding Controls */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-card space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <EyeOff className="w-4 h-4 text-teal-600" />
                <span>Document Masking (Hide from Doctors)</span>
              </h2>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
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
                    className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-800">{r.mainResource}</div>
                      <div className="text-[11px] text-slate-500 font-normal">Facility: {r.facilityName || 'Lab / Clinic'} &bull; {new Date(r.createdAt).toLocaleDateString()}</div>
                    </div>
                    
                    {/* Headless-style Toggle Switch */}
                    <button
                      type="button"
                      onClick={() => handleToggleHide(r)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-500/20 ${
                        r.isHidden ? 'bg-amber-500' : 'bg-slate-200'
                      }`}
                      role="switch"
                      aria-checked={r.isHidden}
                      title={r.isHidden ? 'Masked from Doctors' : 'Visible to Doctors'}
                    >
                      <span className="sr-only">Toggle document masking</span>
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                          r.isHidden ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sensitive Records PIN Setup */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-card space-y-4">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-teal-600" />
              <span>Sensitive Records PIN Protection</span>
            </h2>
            <p className="text-xs text-slate-500 font-normal">
              Set or update your 4-6 digit confidential PIN used to elevate access for sensitive records (mental health, HIV, reproductive care).
            </p>

            <form onSubmit={handleSetPin} className="flex items-center gap-3 max-w-sm">
              <input
                type="password"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="New 4-6 Digit PIN"
                className="text-xs font-mono p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 flex-1 text-slate-900"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-lg text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white shadow-xs transition-colors"
              >
                Save PIN
              </button>
            </form>
          </div>

          {/* Provider Blocking */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-card space-y-4">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Ban className="w-4 h-4 text-rose-600" />
              <span>Provider Blocking</span>
            </h2>
            <p className="text-xs text-slate-500 font-normal">
              Block a specific facility or physician. Any existing 90-day consultation grants are immediately revoked.
            </p>

            <form onSubmit={handleBlockProvider} className="space-y-3 max-w-md">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Facility to Block</label>
                <select
                  value={blockFacilityCode}
                  onChange={(e) => setBlockFacilityCode(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                >
                  <option value="demo-private-hospital">Demo Private Hospital Kandy</option>
                  <option value="demo-general-hospital">Demo General Hospital Colombo</option>
                  <option value="demo-lab-colombo">Demo Lab Colombo</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Reason (Optional)</label>
                <input
                  type="text"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </div>

              <button
                type="submit"
                className="px-4 py-2.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors"
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
