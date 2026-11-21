import React, { useEffect, useState } from 'react';
import { Check, RotateCcw, ShieldAlert } from 'lucide-react';
import { useClinBridge } from '../context/ClinBridgeContext';

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, resetDemoData, showToast } = useClinBridge();
  const [form, setForm] = useState(settings);
  const [confirmReset, setConfirmReset] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState<'checking' | 'connected' | 'deterministic'>(
    'checking'
  );

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data: { geminiConfigured?: boolean }) => {
        setGeminiStatus(data.geminiConfigured ? 'connected' : 'deterministic');
      })
      .catch(() => setGeminiStatus('deterministic'));
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(form);
    showToast('Workspace preferences saved.');
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Workspace Settings
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Configure clinician profile, primary care clinic details, notification rules, and hackathon demo controls.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* User Profile */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Clinician Profile
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={form.physicianName}
                onChange={(e) => setForm({ ...form, physicianName: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Credentials
              </label>
              <input
                type="text"
                value={form.credentials}
                onChange={(e) => setForm({ ...form, credentials: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Role
              </label>
              <input
                type="text"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Practice Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>
          </div>
        </section>

        {/* Clinic Information */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Referring Clinic Information
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              These fields pre-populate Referring Physician Contact Information on newly prepared referrals.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Clinic Name
              </label>
              <input
                type="text"
                value={form.clinicName}
                onChange={(e) => setForm({ ...form, clinicName: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Street Address
              </label>
              <input
                type="text"
                value={form.clinicAddress}
                onChange={(e) => setForm({ ...form, clinicAddress: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Clinic Phone
              </label>
              <input
                type="text"
                value={form.clinicPhone}
                onChange={(e) => setForm({ ...form, clinicPhone: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Coordination Fax / eReferral Endpoint
              </label>
              <input
                type="text"
                value={form.clinicFax}
                onChange={(e) => setForm({ ...form, clinicFax: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>
          </div>
        </section>

        {/* Notification & Application Preferences */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Notification & Application Preferences
            </h2>
          </div>

          <div className="divide-y divide-slate-100">
            {(
              [
                {
                  key: 'notifyMissingDocs',
                  label: 'Missing documentation alerts',
                  desc: 'Highlight referrals missing required specialty intake records before submission.',
                },
                {
                  key: 'notifyClarification',
                  label: 'Specialist clarification requests',
                  desc: 'Surface immediate alerts when a receiving clinic requests additional records.',
                },
                {
                  key: 'notifySpecialistAcceptance',
                  label: 'Specialist acceptance updates',
                  desc: 'Notify when receiving clinic accepts referral or confirms an appointment.',
                },
                {
                  key: 'autoRunChecklist',
                  label: 'Automatic intake checklist mapping',
                  desc: 'Evaluate entered fields against receiving clinic requirements in Step 4.',
                },
              ] as const
            ).map((pref) => (
              <label
                key={pref.key}
                className="py-3 flex items-center justify-between gap-4 cursor-pointer"
              >
                <div>
                  <div className="text-sm font-medium text-slate-900">{pref.label}</div>
                  <div className="text-xs text-slate-500">{pref.desc}</div>
                </div>
                <input
                  type="checkbox"
                  checked={form[pref.key]}
                  onChange={(e) => setForm({ ...form, [pref.key]: e.target.checked })}
                  className="w-4 h-4 accent-[#0F2942] shrink-0"
                />
              </label>
            ))}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg inline-flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Save Preferences</span>
            </button>
          </div>
        </section>
      </form>

      {/* Hackathon Demo Environment Controls */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="border-b border-slate-100 pb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Demonstration Environment & Safety Controls
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Restore initial fictional dataset between live hackathon presentations.
            </p>
          </div>
          <span className="text-xs font-medium text-teal-800">
            AI Mode:{' '}
            {geminiStatus === 'connected'
              ? 'Server-side Gemini + Deterministic Fallback'
              : 'Deterministic Clinical Rules (No API key required)'}
          </span>
        </div>

        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-2.5 text-xs text-slate-600">
          <ShieldAlert className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <span>
            MediBridge is a hackathon prototype using fictional patient, clinic, and wait-time records. It does not diagnose conditions, assign clinical urgency, or replace EMR/medical judgment.
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="text-xs text-slate-600">
            All referrals, edits, and notifications are persisted locally in your browser.
          </div>

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
              <span className="text-xs text-slate-700 font-medium">
                Restore initial seeded referrals?
              </span>
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
