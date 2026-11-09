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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-indigo-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/10 backdrop-blur-sm">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm leading-tight">Elevated Auth Gate</h3>
              <p className="text-[11px] text-blue-100 font-medium">Sensitive Clinical Record Access</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-xs text-slate-600 mb-4 leading-relaxed">
            This record is classified as <strong>Sensitive</strong> (e.g. HIV, Reproductive Health, or Mental Health).
            Per Doc365 Consent Rules, unlocking it requires the patient to enter their confidential PIN.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
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
                  className="w-full text-center tracking-[0.5em] text-lg font-mono p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
              </div>
              {error && <p className="text-xs text-red-600 mt-1 font-medium">{error}</p>}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onCancel}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors"
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
