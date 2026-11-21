import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  FileEdit,
  FilePlus2,
  MessageSquare,
  RotateCcw,
  Search,
} from 'lucide-react';
import { SharedReferralRecord } from '../components/SharedReferralRecord';
import { CompletenessMeter, StatusIndicator } from '../components/StatusIndicator';
import { useClinBridge } from '../context/ClinBridgeContext';
import type { Referral, ReferralStatus } from '../types/clinbridge';

const ALL_STATUSES: Array<'All' | ReferralStatus> = [
  'All',
  'Draft',
  'Awaiting Specialist Selection',
  'Ready for submission',
  'Submitted',
  'Awaiting Specialist Review',
  'Anonymous Information Reviewed',
  'Confidentiality Agreement Accepted',
  'Full Information Unlocked',
  'Awaiting Specialist Decision',
  'Accepted',
  'Additional Information Requested',
  'Declined',
  'Appointment Proposed',
  'E-Consultation Awaiting Patient Approval',
  'Reschedule Requested',
  'E-Consultation Confirmed',
  'Appointment Confirmed',
  'Completed',
];

type SortKey = 'date-desc' | 'date-asc' | 'completeness-asc' | 'completeness-desc' | 'priority';

function getReadinessIndicator(ref: Referral): { label: string; colorClass: string } {
  const hasPendingAi = (ref.consultationNotes?.aiNotes ?? []).some(
    (n) => n.reviewStatus === 'Pending physician review'
  );
  if (ref.insurance?.specialistRequest && !ref.insurance.specialistRequest.resolved) {
    return { label: 'Insurance Info Requested', colorClass: 'text-amber-700' };
  }
  if (ref.status === 'Awaiting Specialist Selection' || !ref.specialistId) {
    return { label: 'Awaiting Specialist Selection', colorClass: 'text-indigo-700' };
  }
  if (ref.status === 'Additional Information Requested' || ref.status === 'Clarification requested') {
    return { label: 'Awaiting Clarification', colorClass: 'text-amber-700' };
  }
  if (ref.analysis.missingItems.length > 0) {
    return { label: 'Missing Documents', colorClass: 'text-rose-700' };
  }
  if (hasPendingAi || ref.completeness < 80) {
    return { label: 'Needs Physician Review', colorClass: 'text-amber-700' };
  }
  if (ref.completeness === 100 && (ref.documentsComplete || ref.physicianApproved)) {
    return {
      label: ref.physicianApproved ? '100% Complete' : '100% Complete · Ready for Review',
      colorClass: 'text-emerald-700',
    };
  }
  if (!ref.physicianApproved) {
    return { label: 'Needs Physician Review', colorClass: 'text-amber-700' };
  }
  return { label: 'Documents Complete', colorClass: 'text-teal-700' };
}

export const ReferralsPage: React.FC = () => {
  const {
    referrals,
    selectedReferralId,
    openReferralRecord,
    closeReferralRecord,
    startNewReferral,
    globalSearchQuery,
    setGlobalSearchQuery,
    referralFilterStatus,
    setReferralFilterStatus,
    resetDemoData,
  } = useClinBridge();

  const [specialtyFilter, setSpecialtyFilter] = useState('All');
  const [sortKey, setSortKey] = useState<SortKey>('date-desc');
  const [showResetModal, setShowResetModal] = useState(false);

  const selectedReferral = useMemo(
    () => referrals.find((r) => r.id === selectedReferralId) ?? null,
    [referrals, selectedReferralId]
  );

  const specialties = useMemo(
    () => ['All', ...Array.from(new Set(referrals.map((r) => r.specialty))).sort()],
    [referrals]
  );

  const filteredReferrals = useMemo(() => {
    const q = globalSearchQuery.trim().toLowerCase();
    const list = referrals.filter((r) => {
      const matchesStatus =
        referralFilterStatus === 'All' || r.status === referralFilterStatus;
      const matchesSpecialty =
        specialtyFilter === 'All' || r.specialty === specialtyFilter;
      const matchesQuery =
        !q ||
        r.id.toLowerCase().includes(q) ||
        r.patient.name.toLowerCase().includes(q) ||
        r.specialistName.toLowerCase().includes(q) ||
        r.specialty.toLowerCase().includes(q) ||
        r.receivingClinic.toLowerCase().includes(q);
      return matchesStatus && matchesSpecialty && matchesQuery;
    });

    const priorityRank = { High: 0, Standard: 1, Low: 2 };

    return [...list].sort((a, b) => {
      if (sortKey === 'date-desc') return b.referralDate.localeCompare(a.referralDate);
      if (sortKey === 'date-asc') return a.referralDate.localeCompare(b.referralDate);
      if (sortKey === 'completeness-asc') return a.completeness - b.completeness;
      if (sortKey === 'completeness-desc') return b.completeness - a.completeness;
      return priorityRank[a.attentionPriority] - priorityRank[b.attentionPriority];
    });
  }, [referrals, globalSearchQuery, referralFilterStatus, specialtyFilter, sortKey]);

  if (selectedReferral) {
    return (
      <SharedReferralRecord
        referral={selectedReferral}
        onBack={closeReferralRecord}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Referral Management
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Track administrative status, intake completeness, and specialist clinic responses across all referrals.
          </p>
        </div>
        <button
          type="button"
          onClick={() => startNewReferral()}
          className="px-4 py-2 text-sm font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg transition-colors whitespace-nowrap self-start flex items-center gap-1.5"
        >
          <FilePlus2 className="w-4 h-4" />
          <span>New Referral</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={globalSearchQuery}
              onChange={(e) => setGlobalSearchQuery(e.target.value)}
              placeholder="Search ID, patient, specialist, or clinic..."
              aria-label="Search referrals"
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#0F2942]"
            />
          </div>

          <select
            value={specialtyFilter}
            onChange={(e) => setSpecialtyFilter(e.target.value)}
            aria-label="Filter by specialty"
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-[#0F2942]"
          >
            {specialties.map((spec) => (
              <option key={spec} value={spec}>
                {spec === 'All' ? 'All Specialties' : spec}
              </option>
            ))}
          </select>

          <select
            value={referralFilterStatus}
            onChange={(e) => setReferralFilterStatus(e.target.value)}
            aria-label="Filter by status"
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-[#0F2942]"
          >
            {ALL_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st === 'All' ? 'All Statuses' : st}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <ArrowUpDown className="w-4 h-4 text-slate-400" />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="Sort referrals"
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-[#0F2942]"
          >
            <option value="date-desc">Newest Submitted</option>
            <option value="date-asc">Oldest Submitted</option>
            <option value="priority">Admin Attention Priority</option>
            <option value="completeness-asc">Completeness (Low to High)</option>
            <option value="completeness-desc">Completeness (High to Low)</option>
          </select>
        </div>
      </div>

      {/* Referrals Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-5">Referral ID</th>
                <th className="py-3 px-4">Patient</th>
                <th className="py-3 px-4">Specialty</th>
                <th className="py-3 px-4">Receiving Specialist</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Admin Attention</th>
                <th className="py-3 px-4">Completeness & Readiness</th>
                <th className="py-3 px-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredReferrals.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center">
                    <div className="text-sm font-medium text-slate-900">
                      No referrals match your filters
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Adjust search terms or start a new referral package.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setGlobalSearchQuery('');
                        setReferralFilterStatus('All');
                        setSpecialtyFilter('All');
                      }}
                      className="mt-3 px-3 py-1.5 text-xs font-medium text-[#0F2942] bg-slate-100 rounded-lg hover:bg-slate-200"
                    >
                      Clear Filters
                    </button>
                  </td>
                </tr>
              ) : (
                filteredReferrals.map((ref) => {
                  const unreadMsgs = (ref.communications ?? []).filter(
                    (m) => !m.readByPhysician
                  ).length;
                  const readiness = getReadinessIndicator(ref);
                  return (
                  <tr
                    key={ref.id}
                    onClick={() => openReferralRecord(ref.id)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="py-3.5 px-5 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap tabular-nums">
                      <div>{ref.id}</div>
                      {unreadMsgs > 0 && (
                        <div className="font-sans text-[11px] font-semibold text-teal-700 inline-flex items-center gap-1 mt-0.5">
                          <MessageSquare className="w-3 h-3" />
                          <span>{unreadMsgs} unread</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-medium text-slate-900">{ref.patient.name}</div>
                      <div className="text-xs text-slate-500 font-mono tabular-nums">
                        {typeof ref.patient.age === 'number' ? `Age ${ref.patient.age} · ` : ''}
                        {ref.patient.id}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">
                      {ref.specialty}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-900 font-medium whitespace-nowrap">
                        {ref.specialistName}
                      </div>
                      <div className="text-xs text-slate-500 truncate max-w-[200px]">
                        {ref.receivingClinic}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-500 whitespace-nowrap tabular-nums">
                      {ref.referralDate}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <StatusIndicator status={ref.status} />
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`text-xs font-medium ${
                          ref.attentionPriority === 'High'
                            ? 'text-amber-700'
                            : ref.attentionPriority === 'Standard'
                              ? 'text-slate-700'
                              : 'text-slate-400'
                        }`}
                      >
                        {ref.attentionPriority}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="space-y-1">
                        <CompletenessMeter value={ref.completeness} />
                        <div className={`text-[11px] font-semibold ${readiness.colorClass}`}>
                          {readiness.label}
                        </div>
                      </div>
                    </td>
                    <td
                      className="py-3.5 px-5 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {ref.status === 'Draft' ? (
                        <button
                          type="button"
                          onClick={() => startNewReferral({ draftId: ref.id })}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0F2942] bg-slate-100 hover:bg-slate-200 rounded-md"
                        >
                          <FileEdit className="w-3 h-3" />
                          <span>Edit Draft</span>
                        </button>
                      ) : ref.status === 'Awaiting Specialist Selection' || !ref.specialistId ? (
                        <button
                          type="button"
                          onClick={() => openReferralRecord(ref.id)}
                          className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                        >
                          AI Find Specialist →
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openReferralRecord(ref.id)}
                          className="text-xs font-medium text-[#0F2942] hover:text-teal-700"
                        >
                          Open Record →
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Visually Separated Hackathon Demo Reset Footer */}
      <div className="pt-6 mt-8 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="text-xs text-slate-500 max-w-xl">
          <span className="font-semibold text-slate-700">Hackathon Demonstration Controls:</span>{' '}
          Restore the predefined demonstration dataset (including privacy-protected Stage 1 anonymous referrals, E-Consultation invitations, insurance records, auto-generated AI consultation notes, and specialist recommendations) across Physician, Specialist, and Patient views. User preferences in Settings are preserved.
        </div>
        <button
          type="button"
          onClick={() => setShowResetModal(true)}
          className="px-4 py-2 text-xs font-semibold text-rose-800 bg-rose-50/70 border border-rose-200 hover:bg-rose-100 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Demo</span>
        </button>
      </div>

      {/* Confirmation Dialog: Reset MediBridge Demo? */}
      {showResetModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-demo-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-rose-50 text-rose-700 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h2
                  id="reset-demo-title"
                  className="font-display text-lg font-bold text-slate-900"
                >
                  Reset MediBridge Demo?
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Reset all demonstration referrals, notes, documents, statuses, and messages to their original demo state? Any changes made during this demo session will be replaced.
                </p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  resetDemoData();
                  setShowResetModal(false);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-lg inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Demo</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
