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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-lg rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-rose-50/60 border-b border-rose-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-100 text-rose-700">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm leading-tight">Clinical Safety Alert</h3>
              <p className="text-xs text-rose-700 font-normal">Drug-Drug Interaction & Allergy Interception</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-rose-100/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Warning list */}
        <div className="p-6 space-y-4">
          <div className="text-xs text-slate-600 leading-relaxed">
            The Doc365 Safety Engine intercepted the following high-risk interactions or contraindications for this patient:
          </div>

          <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
            {warnings.map((w, index) => {
              const isCritical = w.severity === 'CRITICAL';
              return (
                <div
                  key={index}
                  className={`p-3.5 rounded-lg border text-xs ${
                    isCritical
                      ? 'bg-rose-50/60 border-rose-200/80 text-rose-900'
                      : 'bg-amber-50/60 border-amber-200/80 text-amber-900'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold mb-1">
                    <span className="flex items-center gap-1.5 uppercase tracking-wide text-[11px]">
                      <AlertTriangle className={`w-3.5 h-3.5 ${isCritical ? 'text-rose-600' : 'text-amber-600'}`} />
                      {w.title || w.type.replace(/_/g, ' ')}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase ${
                        isCritical
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {w.severity}
                    </span>
                  </div>
                  <p className="text-slate-700 leading-relaxed mt-1 font-normal">{w.message}</p>
                </div>
              );
            })}
          </div>

          {/* Override Form */}
          <form onSubmit={handleSubmit} className="pt-3 border-t border-slate-100 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Clinical Override Justification <span className="text-rose-600">*</span>
              </label>
              <textarea
                rows={2}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g. Patient instructed to stop NSAID immediately; co-prescribing PPI and monitoring INR..."
                className="w-full text-xs p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 placeholder-slate-400 text-slate-900"
              />
              {error && <p className="text-xs text-rose-600 mt-1 font-medium">{error}</p>}
              <p className="text-[11px] text-slate-400 mt-1">
                Your clinical override reason will be permanently recorded in the append-only prescription ledger and audit log.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Cancel Prescription
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors"
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
