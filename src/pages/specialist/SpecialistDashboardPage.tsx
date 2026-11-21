import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Inbox,
  Lock,
  MessageSquare,
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
} from '../../utils/privacyProjection';

const SPECIALIST_STATUS_ORDER: Array<{
  status: ReferralStatus;
  label: string;
}> = [
  { status: 'Submitted', label: 'Submitted (Stage 1)' },
  { status: 'Anonymous Information Reviewed', label: 'Anonymous Info Reviewed' },
  { status: 'Awaiting Specialist Review', label: 'Awaiting Specialist Review' },
  { status: 'Awaiting Specialist Decision', label: 'Awaiting Specialist Decision' },
  { status: 'Additional Information Requested', label: 'Additional Info Requested' },
  { status: 'Accepted', label: 'Accepted' },
  { status: 'E-Consultation Awaiting Patient Approval', label: 'E-Consult Awaiting Approval' },
  { status: 'Reschedule Requested', label: 'Reschedule Requested' },
  { status: 'E-Consultation Confirmed', label: 'E-Consultation Confirmed' },
  { status: 'Appointment Proposed', label: 'Appointment Proposed' },
  { status: 'Appointment Confirmed', label: 'Appointment Confirmed' },
  { status: 'Completed', label: 'Completed' },
  { status: 'Declined', label: 'Declined' },
];

export const SpecialistDashboardPage: React.FC = () => {
  const {
    referrals,
    specialists,
    settings,
    updateSettings,
    openSpecialistReview,
    setActiveSection,
  } = useClinBridge();

  const incomingReferrals = useMemo(() => {
    const submitted = referrals.filter(
      (r) =>
        r.status !== 'Draft' &&
        r.status !== 'Ready for submission' &&
        r.status !== 'Awaiting Specialist Selection' &&
        Boolean(r.specialistId)
    );
    if (settings.specialistProfileId === 'all') return submitted;
    return submitted.filter((r) => r.specialistId === settings.specialistProfileId);
  }, [referrals, settings.specialistProfileId]);

  const metrics = useMemo(() => {
    const newReceived = incomingReferrals.filter((r) => r.status === 'Submitted').length;
    const awaitingReview = incomingReferrals.filter(
      (r) =>
        r.status === 'Submitted' ||
        r.status === 'Awaiting Specialist Review' ||
        r.status === 'Anonymous Information Reviewed' ||
        r.status === 'Awaiting Specialist Decision'
    ).length;
    const clarification = incomingReferrals.filter(
      (r) => r.status === 'Additional Information Requested'
    ).length;
    const accepted = incomingReferrals.filter(
      (r) =>
        r.status === 'Accepted' ||
        r.status === 'Appointment Proposed' ||
        r.status === 'E-Consultation Awaiting Patient Approval' ||
        r.status === 'Reschedule Requested'
    ).length;
    const upcomingAppts = incomingReferrals.filter(
      (r) => r.status === 'Appointment Confirmed' || r.status === 'E-Consultation Confirmed'
    ).length;
    const unreadReplies = incomingReferrals.reduce(
      (acc, r) => acc + (r.communications ?? []).filter((m) => !m.readBySpecialist).length,
      0
    );
    return { newReceived, awaitingReview, clarification, accepted, upcomingAppts, unreadReplies };
  }, [incomingReferrals]);

  const statusOverview = useMemo(() => {
    return SPECIALIST_STATUS_ORDER.map(({ status, label }) => {
      const count = incomingReferrals.filter((r) => r.status === status).length;
      return { status, label, count };
    });
  }, [incomingReferrals]);

  const requiresAttention = useMemo(() => {
    return incomingReferrals.filter((r) => {
      const hasMissing = r.analysis.missingItems.length > 0;
      const hasOpenClarification = r.status === 'Additional Information Requested';
      const hasRescheduleReq = r.status === 'Reschedule Requested';
      const needsReview =
        r.status === 'Submitted' ||
        r.status === 'Awaiting Specialist Review' ||
        r.status === 'Anonymous Information Reviewed' ||
        r.status === 'Awaiting Specialist Decision';
      const hasUnreadMessage = (r.communications ?? []).some((m) => !m.readBySpecialist);
      const hasResponse = r.clarificationThread?.some((c) => c.status === 'Responded');
      return (
        hasMissing ||
        hasOpenClarification ||
        hasRescheduleReq ||
        needsReview ||
        hasUnreadMessage ||
        hasResponse
      );
    });
  }, [incomingReferrals]);

  return (
    <div className="space-y-6">
      {/* Header + Clinic Scope Selector */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Specialist Intake & Consultation Workspace
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Review privacy-protected Stage 1 referral requests, acknowledge confidentiality before unlocking patient identity, and coordinate E-Consultations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <label htmlFor="spec-scope" className="text-xs font-medium text-slate-500">
            Clinic Queue:
          </label>
          <select
            id="spec-scope"
            value={settings.specialistProfileId}
            onChange={(e) => updateSettings({ specialistProfileId: e.target.value })}
            className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-[#0F2942]"
          >
            <option value="all">All Receiving Clinics (Demo Network)</option>
            {specialists.map((sp) => (
              <option key={sp.id} value={sp.id}>
                {sp.name} — {sp.specialty} ({sp.clinic})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setActiveSection('specialist-inbox')}
            className="px-3.5 py-2 text-xs sm:text-sm font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg transition-colors whitespace-nowrap"
          >
            Open Referral Requests
          </button>
        </div>
      </div>

      {/* 5 Operational Workload Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" aria-label="Specialist Workload Summary">
        <button
          type="button"
          onClick={() => setActiveSection('specialist-inbox')}
          className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>New Referral Requests</span>
            <Inbox className="w-4 h-4 text-sky-700" />
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
            {metrics.newReceived}
          </div>
          <div className="mt-1 text-xs text-slate-500">Stage 1 anonymous preview ready</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('specialist-inbox')}
          className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Awaiting Review / Decision</span>
            <Clock className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
            {metrics.awaitingReview}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {metrics.unreadReplies > 0
              ? `${metrics.unreadReplies} unread physician message${metrics.unreadReplies === 1 ? '' : 's'}`
              : 'Ready for specialist triage'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('specialist-inbox')}
          className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-amber-300 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Additional Info Requested</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-amber-700 tabular-nums">
            {metrics.clarification}
          </div>
          <div className="mt-1 text-xs text-slate-500">Awaiting physician reply</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('specialist-accepted')}
          className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Accepted / Pending Patient</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
            {metrics.accepted}
          </div>
          <div className="mt-1 text-xs text-slate-500">Scheduling or E-Consult approval</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('specialist-appointments')}
          className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-teal-300 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Confirmed Consultations</span>
            <CalendarCheck className="w-4 h-4 text-teal-700" />
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-teal-800 tabular-nums">
            {metrics.upcomingAppts}
          </div>
          <div className="mt-1 text-xs text-slate-500">In-person & E-Consultations</div>
        </button>
      </section>

      {/* Requires Attention + Referral Status Queue */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Referral Requests Requiring Attention
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Stage 1 privacy protection hides patient identifiers until confidentiality is accepted
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-amber-700 tabular-nums">
              {requiresAttention.length} referral{requiresAttention.length === 1 ? '' : 's'}
            </span>
          </div>

          {requiresAttention.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No incoming referrals currently require triage action.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {requiresAttention.map((ref) => {
                const unlocked = isConfidentialityUnlocked(ref);
                const patientDisplay = unlocked
                  ? ref.patient.name
                  : `Anonymous Patient (${formatPatientAgeRange(ref.patient.age, ref.patient.dob)})`;
                const unreadForSpecialist = (ref.communications ?? []).filter(
                  (m) => !m.readBySpecialist
                ).length;
                const hasRespondedClarification =
                  (ref.status === 'Awaiting Specialist Review' ||
                    ref.status === 'Awaiting Specialist Decision') &&
                  ref.clarificationThread?.some((c) => c.status === 'Responded');

                const attentionReason = !unlocked
                  ? 'Stage 1 anonymous referral preview — review and accept confidentiality to unlock'
                  : ref.status === 'Reschedule Requested'
                    ? 'Patient requested E-Consultation reschedule — review suggested date & time'
                    : unreadForSpecialist > 0
                      ? `${unreadForSpecialist} unread message from ${ref.referringPhysician}`
                      : hasRespondedClarification
                        ? 'Physician submitted clarification response — ready for specialist decision'
                        : ref.status === 'Additional Information Requested'
                          ? 'Clarification requested by intake — awaiting physician reply'
                          : ref.status === 'Awaiting Specialist Decision'
                            ? 'Confidentiality accepted — awaiting Accept / Decline decision'
                            : ref.analysis.missingItems.length > 0
                              ? `Missing requirement: ${ref.analysis.missingItems.join(', ')}`
                              : !ref.clinicalInput.previousTreatments.trim()
                                ? 'Missing previous treatment summary'
                                : 'Awaiting specialist triage review';

                return (
                  <div
                    key={ref.id}
                    className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-900">{ref.id}</span>
                        <span aria-hidden="true">·</span>
                        <UrgencyLabel urgency={ref.urgency} />
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-slate-800 inline-flex items-center gap-1">
                          {!unlocked && <Lock className="w-3 h-3 text-slate-500" />}
                          {patientDisplay}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>From {ref.referringPhysician}</span>
                        <span aria-hidden="true">·</span>
                        <span>{ref.specialty}</span>
                      </div>
                      <div className="text-sm text-slate-700 flex items-center gap-1.5">
                        {unreadForSpecialist > 0 && unlocked && (
                          <MessageSquare className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                        )}
                        <span>{attentionReason}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <CompletenessMeter value={ref.completeness} />
                      <button
                        type="button"
                        onClick={() => openSpecialistReview(ref.id)}
                        className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg transition-colors whitespace-nowrap inline-flex items-center gap-1"
                      >
                        <span>{unlocked ? 'Review Referral' : 'Stage 1 Preview'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Operational Queue Status Summary */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
          <div className="pb-4 border-b border-slate-100">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Queue Status Breakdown
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live referral counts across clinic workflow stages
            </p>
          </div>
          <div className="divide-y divide-slate-100 mt-1 flex-1">
            {statusOverview.map((row) => (
              <div key={row.status} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-800">{row.label}</div>
                </div>
                <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums">
                  {row.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Incoming Referrals Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Recent Incoming Referrals
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Patient identifiers are withheld in Stage 1 until the Confidentiality Agreement is accepted
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveSection('specialist-inbox')}
            className="text-xs font-medium text-[#0F2942] hover:text-teal-700"
          >
            View All Incoming →
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-5">Patient / Privacy Stage</th>
                <th className="py-2.5 px-4">Referral ID</th>
                <th className="py-2.5 px-4">Urgency</th>
                <th className="py-2.5 px-4">Referring Physician</th>
                <th className="py-2.5 px-4">Specialty</th>
                <th className="py-2.5 px-4">Completeness</th>
                <th className="py-2.5 px-5">Current Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {incomingReferrals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    No incoming referrals in the selected clinic queue.
                  </td>
                </tr>
              ) : (
                incomingReferrals.map((ref) => {
                  const unlocked = isConfidentialityUnlocked(ref);
                  const unread = (ref.communications ?? []).filter(
                    (m) => !m.readBySpecialist
                  ).length;
                  return (
                    <tr
                      key={ref.id}
                      onClick={() => openSpecialistReview(ref.id)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-5 font-medium text-slate-900 whitespace-nowrap">
                        {unlocked ? (
                          <span>{ref.patient.name}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-slate-700">
                            <Lock className="w-3.5 h-3.5 text-slate-500" />
                            <span>
                              Anonymous ({formatPatientAgeRange(ref.patient.age, ref.patient.dob)})
                            </span>
                          </span>
                        )}
                        {unread > 0 && unlocked && (
                          <span className="ml-2 text-xs font-medium text-teal-700">
                            · {unread} unread msg
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-700 whitespace-nowrap tabular-nums">
                        {ref.id}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <UrgencyLabel urgency={ref.urgency} />
                      </td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {ref.referringPhysician}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        {ref.specialty}
                      </td>
                      <td className="py-3 px-4">
                        <CompletenessMeter value={ref.completeness} />
                      </td>
                      <td className="py-3 px-5 whitespace-nowrap">
                        <StatusIndicator status={ref.status} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
