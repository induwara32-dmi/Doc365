'use client';

import { ShieldCheck, HeartPulse, CreditCard } from 'lucide-react';
import QrCodeView from './QrCodeView';

export default function HealthCard({
  healthId = 'DEMO-100001-7',
  fullName = 'Kumari Jayasinghe',
  dateOfBirth = '1990-08-03',
  sex = 'female',
  nic = 'DEMO-NIC-199071500345',
  cardSerial = 'CARD-100001-1',
  status = 'ACTIVE',
}) {
  const qrPayload = `${healthId}|${cardSerial}`;

  return (
    <div className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-emerald-500/30 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-white p-6 transition-all hover:shadow-emerald-500/10">
      {/* Background seal watermarks */}
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-start justify-between border-b border-white/10 pb-4 mb-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase text-emerald-400">
            <HeartPulse className="w-4 h-4" />
            <span>Sri Lanka National Health Service</span>
          </div>
          <h3 className="text-sm font-medium tracking-wide text-slate-300 mt-0.5">
            Digital Citizen Health Card
          </h3>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
          <ShieldCheck className="w-3.5 h-3.5" />
          {status}
        </span>
      </div>

      {/* Card Content & Details */}
      <div className="grid grid-cols-3 gap-4 items-center">
        <div className="col-span-2 space-y-2.5">
          <div>
            <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Citizen Full Name</div>
            <div className="text-sm font-semibold tracking-tight text-white truncate">{fullName}</div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-[10px] uppercase font-medium text-slate-400">Date of Birth</div>
              <div className="font-mono text-slate-200">{dateOfBirth}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-medium text-slate-400">Gender</div>
              <div className="capitalize text-slate-200">{sex}</div>
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase font-medium text-slate-400">National Identity (NIC)</div>
            <div className="font-mono text-xs text-slate-200">{nic || 'None / Under 16'}</div>
          </div>

          <div className="pt-1 border-t border-white/10">
            <div className="text-[10px] uppercase font-medium text-emerald-400">Health ID (Universal PHN)</div>
            <div className="text-base font-bold font-mono tracking-wider text-emerald-300">{healthId}</div>
          </div>
        </div>

        {/* QR Code Container */}
        <div className="flex flex-col items-center justify-center">
          <QrCodeView text={qrPayload} size={110} className="shadow-md" />
          <div className="text-[9px] font-mono text-slate-400 mt-1 tracking-tighter">
            {cardSerial}
          </div>
        </div>
      </div>

      {/* Footer stripe */}
      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-1">
          <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
          <span>Three-Keys Access Rule Compliant</span>
        </div>
        <span className="font-mono text-[10px] text-slate-500">Doc365 Trust Core</span>
      </div>
    </div>
  );
}
