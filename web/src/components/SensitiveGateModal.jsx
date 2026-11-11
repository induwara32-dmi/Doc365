'use client';

import { useState } from 'react';
import { Lock, KeyRound, X } from 'lucide-react';

export default function SensitiveGateModal({ isOpen, onUnlock, onCancel }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!pin || pin.length < 4 || pin.length > 6) {
      setError('Please enter a valid 4-6 digit patient PIN.');
      return;
    }
    setError('');
    onUnlock(pin);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-sm rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-teal-50/70 border-b border-teal-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-teal-100 text-teal-700">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm leading-tight">Elevated Auth Gate</h3>
              <p className="text-xs text-teal-700 font-normal">Sensitive Clinical Record Access</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-teal-100/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-xs text-slate-600 mb-4 leading-relaxed font-normal">
            This record is classified as <strong>Sensitive</strong> (e.g. HIV, Reproductive Health, or Mental Health).
            Per Doc365 Consent Rules, unlocking it requires the patient to enter their confidential PIN.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Patient 4-6 Digit PIN
              </label>
              <div className="relative">
                <input
                  type="password"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  autoFocus
                  className="w-full text-center tracking-[0.5em] text-lg font-mono p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-900 placeholder-slate-400"
                />
                <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
              </div>
              {error && <p className="text-xs text-rose-600 mt-1 font-medium">{error}</p>}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={onCancel}
                className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white shadow-xs transition-colors"
              >
                Verify & Unlock
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
