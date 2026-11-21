import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  Lock,
  MessageSquare,
  Search,
} from 'lucide-react';
import {
  CompletenessMeter,
  StatusIndicator,
  UrgencyLabel,
} from '../../components/StatusIndicator';
import { useClinBridge } from '../../context/ClinBridgeContext';
import type { ReferralStatus } from '../../types/clinbridge';
import {
  formatPatientAgeRange,
  isConfidentialityUnlocked,
  redactPiiText,
} from '../../utils/privacyProjection';

const INBOX_STATUSES: Array<'All' | ReferralStatus> = [
  'All',
  'Submitted',
  'Awaiting Specialist Review',
  'Anonymous Information Reviewed',
  'Confidentiality Agreement Accepted',
  'Full Information Unlocked',
  'Awaiting Specialist Decision',
  'Additional Information Requested',
  'Accepted',
  'Declined',
  'Appointment Proposed',
  'E-Consultation Awaiting Patient Approval',
  'Reschedule Requested',
  'E-Consultation Confirmed',
  'Appointment Confirmed',
  'Completed',
];

export const SpecialistInboxPage: React.FC = () => {
  const {
    referrals,
    specialists,
    settings,
    updateSettings,
    openSpecialistReview,
    globalSearchQuery,
    setGlobalSearchQuery,
  } = useClinBridge();

  const [statusFilter, setStatusFilter] = useState<'All' | ReferralStatus>('All');
  const [physicianFilter, setPhysicianFilter] = useState('All');
  const [completenessFilter, setCompletenessFilter] = useState<'all' | 'complete' | 'incomplete'>(
    'all'
  );
  const [dateFilter, setDateFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const submittedReferrals = useMemo(() => {
    const base = referrals.filter(
      (r) =>
        r.status !== 'Draft' &&
        r.status !== 'Ready for submission' &&
        r.status !== 'Awaiting Specialist Selection' &&
        Boolean(r.specialistId)
    );
    if (settings.specialistProfileId === 'all') return base;
    return base.filter((r) => r.specialistId === settings.specialistProfileId);
  }, [referrals, settings.specialistProfileId]);

  const referringPhysicians = useMemo(
    () => [
      'All',
      ...Array.from(new Set(submittedReferrals.map((r) => r.referringPhysician))).sort(),
    ],
    [submittedReferrals]
  );

  const filtered = useMemo(() => {
    const q = globalSearchQuery.trim().toLowerCase();
    const list = submittedReferrals.filter((r) => {
      const unlocked = isConfidentialityUnlocked(r);
      const matchSearch =
        !q ||
        (unlocked && r.patient.name.toLowerCase().includes(q)) ||
        r.id.toLowerCase().includes(q) ||
        redactPiiText(r.clinicalInput.reasonForReferral, r.patient).toLowerCase().includes(q);
      const matchStatus = statusFilter === 'All' || r.status === statusFilter;
      const matchPhysician =
        physicianFilter === 'All' || r.referringPhysician === physicianFilter;
      const matchDate = !dateFilter || r.referralDate >= dateFilter;
      const matchCompleteness =
        completenessFilter === 'all' ||
        (completenessFilter === 'complete' && r.completeness >= 85) ||
        (completenessFilter === 'incomplete' && r.completeness < 85);

      return matchSearch && matchStatus && matchPhysician && matchDate && matchCompleteness;
    });

    return [...list].sort((a, b) =>
      sortOrder === 'newest'
        ? b.referralDate.localeCompare(a.referralDate)
        : a.referralDate.localeCompare(b.referralDate)
    );
  }, [
    submittedReferrals,
    globalSearchQuery,
    statusFilter,
    physicianFilter,
    dateFilter,
    completenessFilter,
    sortOrder,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Referral Requests & Incoming Inbox
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Stage 1 referrals display non-identifying clinical triage summaries until you review and accept the Specialist Confidentiality Agreement.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label htmlFor="inbox-clinic-scope" className="text-xs text-slate-500">
            Clinic Filter:
          </label>
          <select
            id="inbox-clinic-scope"
            value={settings.specialistProfileId}
            onChange={(e) => updateSettings({ specialistProfileId: e.target.value })}
            className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-800"
          >
            <option value="all">All Receiving Clinics</option>
            {specialists.map((sp) => (
              <option key={sp.id} value={sp.id}>
                {sp.name} ({sp.specialty})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={globalSearchQuery}
              onChange={(e) => setGlobalSearchQuery(e.target.value)}
              placeholder="Search by unlocked patient, referral ID, or clinical reason..."
              aria-label="Search incoming referrals"
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#0F2942]"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'All' | ReferralStatus)}
            aria-label="Filter by status"
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
          >
            {INBOX_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st === 'All' ? 'All Statuses' : st}
              </option>
            ))}
          </select>

          <select
            value={physicianFilter}
            onChange={(e) => setPhysicianFilter(e.target.value)}
            aria-label="Filter by referring physician"
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
          >
            {referringPhysicians.map((doc) => (
              <option key={doc} value={doc}>
                {doc === 'All' ? 'All Referring Physicians' : doc}
              </option>
            ))}
          </select>

          <select
            value={completenessFilter}
            onChange={(e) =>
              setCompletenessFilter(e.target.value as 'all' | 'complete' | 'incomplete')
            }
            aria-label="Filter by documentation completeness"
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
          >
            <option value="all">All Completeness Levels</option>
            <option value="complete">Complete (≥ 85%)</option>
            <option value="incomplete">Incomplete (&lt; 85%)</option>
          </select>

          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            aria-label="Received on or after date"
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
          />

          <div className="flex items-center gap-1.5 ml-auto">
            <ArrowUpDown className="w-4 h-4 text-slate-400" />
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
              aria-label="Sort incoming referrals"
              className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
            >
              <option value="newest">Sort: Newest First</option>
              <option value="oldest">Sort: Oldest First</option>
            </select>
          </div>
        </div>
      </div>

      {/* Incoming Referrals List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
            <div className="text-sm font-medium text-slate-900">
              No incoming referrals match your filters
            </div>
            <p className="text-xs text-slate-500">
              Clear active filters or switch clinic queue scope to inspect all referrals.
            </p>
            <button
              type="button"
              onClick={() => {
                setGlobalSearchQuery('');
                setStatusFilter('All');
                setPhysicianFilter('All');
                setCompletenessFilter('all');
                setDateFilter('');
              }}
              className="mt-2 px-3 py-1.5 text-xs font-medium text-[#0F2942] bg-slate-100 rounded-lg hover:bg-slate-200"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          filtered.map((ref) => {
            const unlocked = isConfidentialityUnlocked(ref);
            const displayPatientLabel = unlocked
              ? ref.patient.name
              : `Anonymous Patient · ${formatPatientAgeRange(ref.patient.age, ref.patient.dob)}`;
            const safeReason = unlocked
              ? ref.clinicalInput.reasonForReferral
              : redactPiiText(ref.clinicalInput.reasonForReferral, ref.patient);
            const safeSummary = unlocked
              ? ref.analysis.executiveSummary
              : redactPiiText(ref.analysis.executiveSummary, ref.patient);

            const needsAttention =
              ref.completeness < 85 ||
              ref.analysis.missingItems.length > 0 ||
              ref.status === 'Additional Information Requested' ||
              !ref.clinicalInput.previousTreatments.trim();
            const hasNewResponse =
              (ref.status === 'Awaiting Specialist Review' ||
                ref.status === 'Awaiting Specialist Decision') &&
              ref.clarificationThread?.some((c) => c.status === 'Responded');
            const unreadMsgs = (ref.communications ?? []).filter(
              (m) => !m.readBySpecialist
            ).length;

            return (
              <div
                key={ref.id}
                onClick={() => openSpecialistReview(ref.id)}
                className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 cursor-pointer transition-colors"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-slate-900">{ref.id}</span>
                      <span aria-hidden="true">·</span>
                      <UrgencyLabel urgency={ref.urgency} />
                      <span aria-hidden="true">·</span>
                      <span>Received {ref.referralDate}</span>
                      <span aria-hidden="true">·</span>
                      <span>From {ref.referringPhysician}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        To {ref.specialistName} ({ref.specialty})
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="font-display text-lg font-semibold text-slate-900 flex items-center gap-2">
                        {!unlocked && <Lock className="w-4 h-4 text-slate-500 shrink-0" />}
                        <span>{displayPatientLabel}</span>
                      </h2>
                      <StatusIndicator status={ref.status} />
                      {!unlocked && (
                        <span className="text-xs font-medium text-indigo-800">
                          Stage 1 Anonymous Preview
                        </span>
                      )}
                      {unreadMsgs > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800">
                          <MessageSquare className="w-3.5 h-3.5" />
                          {unreadMsgs} unread message(s)
                        </span>
                      )}
                      {hasNewResponse && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-800">
                          <MessageSquare className="w-3.5 h-3.5" />
                          Physician responded to clarification
                        </span>
                      )}
                      {needsAttention && !hasNewResponse && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Needs intake attention
                        </span>
                      )}
                    </div>

                    <div className="text-sm font-medium text-slate-800">Reason: {safeReason}</div>

                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                      Summary: {safeSummary}
                    </p>
                  </div>

                  <div className="flex sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-3 shrink-0">
                    <div className="text-left lg:text-right">
                      <div className="text-[11px] text-slate-500 mb-1">
                        Documentation Completeness
                      </div>
                      <CompletenessMeter value={ref.completeness} />
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openSpecialistReview(ref.id);
                      }}
                      className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <span>{unlocked ? 'Open Referral Review' : 'Review Stage 1 Request'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
