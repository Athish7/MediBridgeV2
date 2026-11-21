import React, { useEffect, useState } from 'react';
import { Check, RotateCcw, ShieldAlert } from 'lucide-react';
import { useClinBridge } from '../../context/ClinBridgeContext';

export const SpecialistSettingsPage: React.FC = () => {
  const { settings, specialists, updateSettings, resetDemoData, showToast } = useClinBridge();
  const [form, setForm] = useState(settings);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(form);
    showToast('Specialist intake preferences saved.');
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Specialist Clinic Settings
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Configure receiving clinic scope, intake triage preferences, and shared demonstration controls.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Receiving Clinic & Specialist Scope
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Active Specialist / Clinic Queue
              </label>
              <select
                value={form.specialistProfileId}
                onChange={(e) => setForm({ ...form, specialistProfileId: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-[#0F2942]"
              >
                <option value="all">All Receiving Clinics (Demo Network)</option>
                {specialists.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name} — {sp.specialty} ({sp.clinic})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Clinic Intake Role
              </label>
              <input
                type="text"
                value={form.specialistClinicRole}
                onChange={(e) => setForm({ ...form, specialistClinicRole: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-100 pt-2">
            <label className="py-3 flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <div className="text-sm font-medium text-slate-900">
                  Highlight incomplete incoming packets automatically
                </div>
                <div className="text-xs text-slate-500">
                  Flag incoming referrals missing specialty intake requirements in the inbox.
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.specialistAutoFlagIncomplete}
                onChange={(e) =>
                  setForm({ ...form, specialistAutoFlagIncomplete: e.target.checked })
                }
                className="w-4 h-4 accent-[#0F2942] shrink-0"
              />
            </label>

            <label className="py-3 flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <div className="text-sm font-medium text-slate-900">
                  Notify on physician clarification responses
                </div>
                <div className="text-xs text-slate-500">
                  Create an intake alert whenever a family physician responds to a clarification request.
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.notifyClarification}
                onChange={(e) => setForm({ ...form, notifyClarification: e.target.checked })}
                className="w-4 h-4 accent-[#0F2942] shrink-0"
              />
            </label>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg inline-flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Save Specialist Settings</span>
            </button>
          </div>
        </section>
      </form>

      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Shared Demonstration Controls
          </h2>
        </div>

        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-2.5 text-xs text-slate-600">
          <ShieldAlert className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <span>
            All referral records are shared in real time across Physician, Specialist, and Patient views using fictional demonstration data.
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-600">
            Restore initial seeded referrals, clarification threads, and appointments.
          </span>

          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="px-4 py-2 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Demo Data</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  resetDemoData();
                  setConfirmReset(false);
                }}
                className="px-3.5 py-1.5 text-xs font-medium text-white bg-rose-700 hover:bg-rose-800 rounded-lg"
              >
                Confirm Reset
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
