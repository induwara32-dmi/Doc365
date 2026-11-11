'use client';

import { ShieldCheck, HeartPulse, CreditCard, Radio } from 'lucide-react';
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
    <div className="w-full max-w-md">
      <div className="relative w-full rounded-2xl overflow-hidden shadow-card border border-slate-200 bg-white p-6 transition-all hover:shadow-md">
        {/* Subtle mint / teal background accent */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-teal-50/60 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-36 h-36 bg-slate-100/50 rounded-full blur-xl pointer-events-none" />

        {/* Header with National Health Network styling */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-3.5 mb-4 relative z-10">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase text-teal-600">
              <HeartPulse className="w-3.5 h-3.5 text-teal-600" />
              <span>Sri Lanka Digital Health Network</span>
            </div>
            <h3 className="text-sm font-semibold tracking-tight text-slate-900 mt-0.5">
              National Citizen Health Card (eGK)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-teal-600 animate-pulse" />
            <span className="inline-flex items-center gap-1 text-[11px] font-medium tracking-wide uppercase px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              {status}
            </span>
          </div>
        </div>

        {/* Smartcard Chip Graphic */}
        <div className="flex items-center gap-2 mb-3.5 relative z-10">
          <div className="w-9 h-7 rounded-md bg-gradient-to-br from-amber-200 via-amber-300 to-amber-500 border border-amber-300 shadow-xs flex items-center justify-center p-0.5">
            <div className="w-full h-full border border-amber-600/30 rounded-xs flex flex-col justify-around">
              <div className="border-b border-amber-600/30" />
              <div className="border-b border-amber-600/30" />
            </div>
          </div>
          <span className="text-[10px] font-mono tracking-wider text-slate-400 uppercase">SECURE ELEMENT &bull; NFC</span>
        </div>

        {/* Card Content & Details */}
        <div className="grid grid-cols-3 gap-4 items-center relative z-10">
          <div className="col-span-2 space-y-2.5">
            <div>
              <div className="text-[10px] uppercase font-medium text-slate-400 tracking-wider">Citizen Full Name</div>
              <div className="text-sm font-semibold tracking-tight text-slate-900 truncate">{fullName}</div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-[10px] uppercase font-medium text-slate-400">Date of Birth</div>
                <div className="font-mono text-slate-700">{dateOfBirth}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-medium text-slate-400">Gender</div>
                <div className="capitalize text-slate-700">{sex}</div>
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase font-medium text-slate-400">National Identity (NIC)</div>
              <div className="font-mono text-xs text-slate-700">{nic || 'None / Under 16'}</div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <div className="text-[10px] uppercase font-semibold text-teal-700 tracking-wider">Health ID (Universal PHN)</div>
              <div className="text-base font-bold font-mono tracking-wide text-teal-800">{healthId}</div>
            </div>
          </div>

          {/* QR Code Container */}
          <div className="flex flex-col items-center justify-center">
            <div className="p-1.5 rounded-xl bg-white shadow-xs border border-slate-200">
              <QrCodeView text={qrPayload} size={98} />
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-1.5 tracking-tight font-medium">
              {cardSerial}
            </div>
          </div>
        </div>

        {/* Footer stripe */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 relative z-10">
          <div className="flex items-center gap-1.5 text-teal-700 font-medium">
            <CreditCard className="w-3.5 h-3.5 text-teal-600" />
            <span>Three-Keys Compliant</span>
          </div>
          <span className="font-mono text-[10px] text-slate-400">Doc365 Trust Core</span>
        </div>
      </div>
    </div>
  );
}
