'use client';

import { useState } from 'react';
import { Siren, X, AlertOctagon } from 'lucide-react';

export default function BreakGlassModal({ isOpen, patientHealthId, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason || reason.trim().length < 10) {
      setError('A medical justification of at least 10 characters is required for emergency break-glass.');
      return;
    }
    setError('');
    onConfirm(reason.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border-2 border-red-500 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-700 via-rose-700 to-red-800 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/20 animate-pulse">
              <Siren className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Emergency Break-Glass Access</h3>
              <p className="text-xs text-red-200 font-medium">Unconsented Override for Critical Care</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4">
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex gap-3">
            <AlertOctagon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-bold uppercase tracking-wider text-[11px] mb-0.5">Strict Legal & Audit Notice</div>
              <p className="text-slate-700 leading-relaxed">
                Emergency break-glass access should only be invoked when the patient is unconscious, incapacitated, or physical card is unavailable.
                This action creates an immediate, high-priority audit record (`EMERGENCY_OVERRIDE_ACCESSED`) visible to the patient and regulatory authority.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Target Patient Health ID
              </label>
              <div className="text-xs font-mono font-bold bg-slate-100 p-2.5 rounded-xl text-slate-800 border border-slate-200">
                {patientHealthId}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Emergency Medical Justification <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Unconscious trauma patient admitted to Emergency Department; urgently accessing blood group, allergies, and active medications..."
                className="w-full text-xs p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 placeholder-slate-400"
              />
              {error && <p className="text-xs text-red-600 mt-1 font-medium">{error}</p>}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-600/30 transition-all flex items-center gap-1.5"
              >
                <Siren className="w-4 h-4" />
                <span>Activate Emergency Access</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
