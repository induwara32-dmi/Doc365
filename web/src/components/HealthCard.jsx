'use client';

import { ShieldCheck, HeartPulse, CreditCard, Radio, Cpu } from 'lucide-react';
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
    <div className="group perspective-1000 w-full max-w-md">
      <div className="relative w-full rounded-3xl overflow-hidden shadow-2xl border border-emerald-500/40 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white p-7 transition-all duration-500 transform hover:scale-[1.02] hover:-rotate-1 hover:shadow-emerald-500/20">
        {/* Holographic foil overlay effect */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-emerald-500/5 to-teal-400/10 pointer-events-none" />
        <div className="absolute -top-12 -right-12 w-52 h-52 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-52 h-52 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Header with National Emblem styling */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4 mb-4 relative z-10">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase text-emerald-400">
              <HeartPulse className="w-4 h-4" />
              <span>Sri Lanka Digital Health Network</span>
            </div>
            <h3 className="text-sm font-semibold tracking-wide text-slate-200 mt-0.5">
              National Citizen Health Card (eGK)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span className="inline-flex items-center gap-1 text-[11px] font-bold tracking-wide uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              <ShieldCheck className="w-3.5 h-3.5" />
              {status}
            </span>
          </div>
        </div>

        {/* 3D Smartcard Chip Graphic */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-10 h-8 rounded-lg bg-gradient-to-br from-yellow-300 via-amber-400 to-yellow-600 border border-amber-200/80 shadow-md flex items-center justify-center p-1">
            <div className="w-full h-full border border-amber-600/40 rounded flex flex-col justify-around">
              <div className="border-b border-amber-600/40" />
              <div className="border-b border-amber-600/40" />
            </div>
          </div>
          <span className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">SECURE ELEMENT</span>
        </div>

        {/* Card Content & Details */}
        <div className="grid grid-cols-3 gap-4 items-center relative z-10">
          <div className="col-span-2 space-y-2.5">
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Citizen Full Name</div>
              <div className="text-sm font-bold tracking-tight text-white truncate">{fullName}</div>
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

            <div className="pt-1.5 border-t border-white/10">
              <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Health ID (Universal PHN)</div>
              <div className="text-base font-black font-mono tracking-wider text-emerald-300">{healthId}</div>
            </div>
          </div>

          {/* QR Code Container */}
          <div className="flex flex-col items-center justify-center">
            <div className="p-1 rounded-xl bg-white shadow-xl ring-2 ring-emerald-500/40">
              <QrCodeView text={qrPayload} size={105} />
            </div>
            <div className="text-[9px] font-mono text-emerald-400 mt-1.5 tracking-tighter">
              {cardSerial}
            </div>
          </div>
        </div>

        {/* Footer stripe */}
        <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400 relative z-10">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <CreditCard className="w-3.5 h-3.5" />
            <span className="font-semibold">Three-Keys Rule Compliant</span>
          </div>
          <span className="font-mono text-[10px] text-slate-400">Doc365 Trust Core</span>
        </div>
      </div>
    </div>
  );
}
