'use client';

import { useState } from 'react';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';

export default function DdiSafetyModal({ isOpen, warnings = [], onConfirmOverride, onCancel }) {
  const [overrideReason, setOverrideReason] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!overrideReason || overrideReason.trim().length < 5) {
      setError('A clinical justification of at least 5 characters is required for override.');
      return;
    }
    setError('');
    onConfirmOverride(overrideReason.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-red-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-rose-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/10 backdrop-blur-sm">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Clinical Safety Alert</h3>
              <p className="text-xs text-red-100 font-medium">Drug-Drug Interaction & Allergy Interception</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning list */}
        <div className="p-6 space-y-4">
          <div className="text-xs text-slate-600">
            The Doc365 Safety Engine intercepted the following high-risk interactions or contraindications for this patient:
          </div>

          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
            {warnings.map((w, index) => {
              const isCritical = w.severity === 'CRITICAL';
              return (
                <div
                  key={index}
                  className={`p-3.5 rounded-xl border text-xs ${
                    isCritical
                      ? 'bg-red-50/70 border-red-200 text-red-900'
                      : 'bg-amber-50/70 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold mb-1">
                    <span className="flex items-center gap-1.5 uppercase tracking-wide text-[11px]">
                      <AlertTriangle className={`w-3.5 h-3.5 ${isCritical ? 'text-red-600' : 'text-amber-600'}`} />
                      {w.title || w.type.replace(/_/g, ' ')}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        isCritical ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'
                      }`}
                    >
                      {w.severity}
                    </span>
                  </div>
                  <p className="text-slate-700 leading-relaxed font-medium mt-1">{w.message}</p>
                </div>
              );
            })}
          </div>

          {/* Override Form */}
          <form onSubmit={handleSubmit} className="pt-3 border-t border-slate-100">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Clinical Override Justification <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={2}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="e.g. Patient instructed to stop NSAID immediately; co-prescribing PPI and monitoring INR..."
              className="w-full text-xs p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 placeholder-slate-400"
            />
            {error && <p className="text-xs text-red-600 mt-1 font-medium">{error}</p>}
            <p className="text-[11px] text-slate-500 mt-1">
              Your clinical override reason will be permanently recorded in the append-only prescription ledger and audit log.
            </p>

            <div className="flex items-center justify-end gap-2.5 mt-5">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel Prescription
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white shadow-sm transition-colors"
              >
                Confirm Clinical Override
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
