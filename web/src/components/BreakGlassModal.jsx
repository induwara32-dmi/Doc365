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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-lg rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-rose-50/70 border-b border-rose-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-100 text-rose-700">
              <Siren className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm leading-tight">Emergency Break-Glass Access</h3>
              <p className="text-xs text-rose-700 font-normal">Unconsented Override for Critical Care</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-rose-100/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4">
          <div className="p-3.5 rounded-lg bg-rose-50/50 border border-rose-200/80 text-rose-950 text-xs flex gap-3">
            <AlertOctagon className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold uppercase tracking-wider text-[11px] text-rose-800 mb-0.5">Strict Legal & Audit Notice</div>
              <p className="text-slate-600 leading-relaxed font-normal">
                Emergency break-glass access should only be invoked when the patient is unconscious, incapacitated, or physical card is unavailable.
                This action creates an immediate, high-priority audit record (<code className="font-mono text-rose-700 bg-rose-100/60 px-1 py-0.5 rounded">EMERGENCY_OVERRIDE_ACCESSED</code>) visible to the patient and regulatory authority.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Target Patient Health ID
              </label>
              <div className="text-xs font-mono font-semibold bg-slate-50 p-2.5 rounded-lg text-slate-800 border border-slate-200">
                {patientHealthId}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Emergency Medical Justification <span className="text-rose-600">*</span>
              </label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Unconscious trauma patient admitted to Emergency Department; urgently accessing blood group, allergies, and active medications..."
                className="w-full text-xs p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 placeholder-slate-400 text-slate-900"
              />
              {error && <p className="text-xs text-rose-600 mt-1 font-medium">{error}</p>}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Siren className="w-3.5 h-3.5" />
                <span>Activate Emergency Access</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
