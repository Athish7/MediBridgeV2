import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  Clock,
  FileEdit,
  FilePlus2,
  MessageSquare,
  Search,
  Send,
} from 'lucide-react';
import { CompletenessMeter, StatusIndicator } from '../components/StatusIndicator';
import { useClinBridge } from '../context/ClinBridgeContext';
import type { ReferralStatus } from '../types/clinbridge';

const STATUS_ORDER: ReferralStatus[] = [
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

export const DashboardPage: React.FC = () => {
  const {
    referrals,
    openReferralRecord,
    startNewReferral,
    setActiveSection,
    setReferralFilterStatus,
  } = useClinBridge();

  const [tableSearch, setTableSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const stats = useMemo(() => {
    const active = referrals.filter((r) => r.status !== 'Completed').length;
    const awaiting = referrals.filter(
      (r) =>
        r.status === 'Submitted' ||
        r.status === 'Awaiting Specialist Review' ||
        r.status === 'Anonymous Information Reviewed' ||
        r.status === 'Awaiting Specialist Decision'
    ).length;
    const clarifications = referrals.filter(
      (r) =>
        r.status === 'Additional Information Requested' ||
        r.status === 'Draft' ||
        r.status === 'Awaiting Specialist Selection' ||
        Boolean(r.insurance?.specialistRequest && !r.insurance.specialistRequest.resolved) ||
        r.completeness < 80
    ).length;
    const unreadMessages = referrals.reduce(
      (acc, r) => acc + (r.communications ?? []).filter((m) => !m.readByPhysician).length,
      0
    );
    const upcomingAppointments = referrals.filter(
      (r) => r.status === 'Appointment Confirmed' || r.status === 'E-Consultation Confirmed'
    ).length;
    return { active, awaiting, clarifications, unreadMessages, upcomingAppointments };
  }, [referrals]);

  const attentionList = useMemo(
    () =>
      referrals.filter(
        (r) =>
          r.status === 'Additional Information Requested' ||
          r.status === 'Draft' ||
          r.status === 'Awaiting Specialist Selection' ||
          Boolean(r.insurance?.specialistRequest && !r.insurance.specialistRequest.resolved) ||
          r.completeness < 80 ||
          (r.communications ?? []).some((m) => !m.readByPhysician)
      ),
    [referrals]
  );

  const statusDistribution = useMemo(() => {
    const counts = new Map<ReferralStatus, number>();
    STATUS_ORDER.forEach((s) => counts.set(s, 0));
    referrals.forEach((r) => counts.set(r.status, (counts.get(r.status) ?? 0) + 1));
    return STATUS_ORDER.map((status) => ({
      status,
      count: counts.get(status) ?? 0,
      pct: referrals.length ? Math.round(((counts.get(status) ?? 0) / referrals.length) * 100) : 0,
    })).filter((d) => d.count > 0);
  }, [referrals]);

  const recentReferrals = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    return referrals.filter((r) => {
      const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
      const matchesQuery =
        !q ||
        r.patient.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.specialty.toLowerCase().includes(q) ||
        r.receivingClinic.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [referrals, statusFilter, tableSearch]);

  const recentEvents = useMemo(() => {
    const events = referrals.flatMap((r) =>
      r.timeline.map((ev) => ({
        ...ev,
        referralId: r.id,
        patientName: r.patient.name,
        specialty: r.specialty,
      }))
    );
    return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 6);
  }, [referrals]);

  const jumpToFilteredReferrals = (status: string) => {
    setReferralFilterStatus(status);
    setActiveSection('referrals');
  };

  return (
    <div className="space-y-6">
      {/* Operational Overview Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Clinical Referral Workspace
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Manage referrals, consultation notes, specialist clarifications, and upcoming consultations across your primary care queue.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              const flagged =
                referrals.find((r) => r.status === 'Additional Information Requested') ??
                attentionList[0] ??
                referrals[0];
              if (flagged) openReferralRecord(flagged.id);
            }}
            className="px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            Inspect Flagged Referral
          </button>
          <button
            type="button"
            onClick={() => startNewReferral()}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5"
          >
            <FilePlus2 className="w-4 h-4" />
            <span>Create Referral</span>
          </button>
        </div>
      </div>

      {/* 4 Operational KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" aria-label="Operational Summary">
        <button
          type="button"
          onClick={() => jumpToFilteredReferrals('All')}
          className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Active Referrals</span>
            <Send className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
            {stats.active}
          </div>
          <div className="mt-1.5 text-xs text-slate-500">
            Across {statusDistribution.length} active workflow stages
          </div>
        </button>

        <button
          type="button"
          onClick={() => jumpToFilteredReferrals('Awaiting Specialist Review')}
          className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Pending Specialist Review</span>
            <Clock className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
            {stats.awaiting}
          </div>
          <div className="mt-1.5 text-xs text-slate-500">
            Submitted or queued at receiving clinics
          </div>
        </button>

        <button
          type="button"
          onClick={() => jumpToFilteredReferrals('Additional Information Requested')}
          className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-amber-300 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Clarifications & Unread Messages</span>
            <MessageSquare className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-amber-700 tabular-nums">
            {stats.clarifications}
            {stats.unreadMessages > 0 && (
              <span className="ml-2 text-sm font-sans font-semibold text-teal-800">
                ({stats.unreadMessages} unread)
              </span>
            )}
          </div>
          <div className="mt-1.5 text-xs text-slate-500">
            Clarifications, insurance requests, or incomplete drafts
          </div>
        </button>

        <button
          type="button"
          onClick={() => jumpToFilteredReferrals('Appointment Confirmed')}
          className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-teal-300 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Upcoming Appointments</span>
            <CalendarCheck className="w-4 h-4 text-teal-700" />
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-teal-800 tabular-nums">
            {stats.upcomingAppointments}
          </div>
          <div className="mt-1.5 text-xs text-slate-500">
            Confirmed specialist consultation dates
          </div>
        </button>
      </section>

      {/* Operational Split: Attention Required + Status Overview + Activity Feed */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Attention Required & Unread Communications (5 cols) */}
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Attention Required & Messages
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Outstanding clarifications, unread specialist messages, or incomplete drafts
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-amber-700 tabular-nums">
              {attentionList.length} item{attentionList.length === 1 ? '' : 's'}
            </span>
          </div>

          {attentionList.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              All active referrals are up to date with zero unread messages.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 flex-1">
              {attentionList.map((ref) => {
                const unreadCount = (ref.communications ?? []).filter(
                  (m) => !m.readByPhysician
                ).length;

                return (
                  <div
                    key={ref.id}
                    className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-900">{ref.id}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-slate-800">{ref.patient.name}</span>
                        <span aria-hidden="true">·</span>
                        <span>{ref.specialty}</span>
                      </div>
                      <div className="text-xs text-slate-700">
                        {ref.insurance?.specialistRequest && !ref.insurance.specialistRequest.resolved ? (
                          <span className="font-semibold text-amber-800">
                            Insurance info requested by {ref.specialistName}: {ref.insurance.specialistRequest.requestedDetails}
                          </span>
                        ) : unreadCount > 0 ? (
                          <span className="font-medium text-teal-800">
                            {unreadCount} unread message{unreadCount === 1 ? '' : 's'} from {ref.specialistName}
                          </span>
                        ) : ref.status === 'Awaiting Specialist Selection' || !ref.specialistId ? (
                          <span className="font-medium text-indigo-700">
                            Awaiting specialist selection — run AI Find Specialist
                          </span>
                        ) : ref.analysis.missingItems.length > 0 ? (
                          <span>
                            Missing:{' '}
                            <span className="font-medium text-rose-700">
                              {ref.analysis.missingItems.join(', ')}
                            </span>
                          </span>
                        ) : ref.analysis.ambiguityFlags.length > 0 ? (
                          <span className="text-amber-800 font-medium">
                            {ref.analysis.ambiguityFlags[0].title}
                          </span>
                        ) : (
                          <span>Pending clinician review and submission</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      {ref.status === 'Draft' ? (
                        <button
                          type="button"
                          onClick={() => startNewReferral({ draftId: ref.id })}
                          className="px-3 py-1.5 text-xs font-medium text-[#0F2942] bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5"
                        >
                          <FileEdit className="w-3.5 h-3.5" />
                          <span>Resume Draft</span>
                        </button>
                      ) : ref.status === 'Awaiting Specialist Selection' || !ref.specialistId ? (
                        <button
                          type="button"
                          onClick={() => openReferralRecord(ref.id)}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1"
                        >
                          <span>Find Specialist</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openReferralRecord(ref.id)}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg transition-colors whitespace-nowrap flex items-center gap-1"
                        >
                          <span>Open</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Referral Status Queue Breakdown (3 cols) */}
        <div className="xl:col-span-3 bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
          <div className="pb-4 border-b border-slate-100">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Referral Statuses
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any status to filter queue
            </p>
          </div>

          <div className="flex-1 divide-y divide-slate-100 mt-1">
            {statusDistribution.map((row) => (
              <button
                key={row.status}
                type="button"
                onClick={() => jumpToFilteredReferrals(row.status)}
                className="w-full py-3 flex items-center justify-between gap-2 text-left hover:bg-slate-50 px-1.5 -mx-1.5 rounded-md transition-colors"
              >
                <div className="min-w-0">
                  <StatusIndicator status={row.status} />
                </div>
                <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums shrink-0">
                  {row.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Coordination Activity Feed (4 cols) */}
        <div className="xl:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Coordination Activity Feed
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Recent messages, verifications, and clinic updates
            </p>
          </div>

          <div className="divide-y divide-slate-100 flex-1">
            {recentEvents.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => openReferralRecord(ev.referralId)}
                className="w-full px-5 py-3.5 text-left hover:bg-slate-50 transition-colors block"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="font-mono font-medium text-slate-800">{ev.referralId}</span>
                  <span className="font-mono text-[11px] tabular-nums">{ev.timestamp}</span>
                </div>
                <div className="text-sm font-medium text-slate-900 mt-0.5">{ev.title}</div>
                <div className="text-xs text-slate-600 mt-0.5 line-clamp-2">
                  {ev.patientName} · {ev.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Referrals Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Recent Referrals
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select any referral row to open its Shared Referral Record
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Filter by patient or ID..."
                aria-label="Filter recent referrals"
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#0F2942] w-48"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter recent referrals by status"
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-[#0F2942]"
            >
              <option value="All">All Statuses</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-5">Patient</th>
                <th className="py-2.5 px-4">Referral ID</th>
                <th className="py-2.5 px-4">Specialty</th>
                <th className="py-2.5 px-4">Receiving Clinic</th>
                <th className="py-2.5 px-4">Referral Date</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-5 text-right">Completeness</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {recentReferrals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    No referrals match your current filter.
                  </td>
                </tr>
              ) : (
                recentReferrals.map((ref) => {
                  const unread = (ref.communications ?? []).filter(
                    (m) => !m.readByPhysician
                  ).length;
                  return (
                    <tr
                      key={ref.id}
                      onClick={() => openReferralRecord(ref.id)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-5 font-medium text-slate-900 whitespace-nowrap">
                        <span>{ref.patient.name}</span>
                        {unread > 0 && (
                          <span className="ml-2 text-xs font-medium text-teal-700">
                            · {unread} unread msg
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap tabular-nums">
                        {ref.id}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">{ref.specialty}</td>
                      <td className="py-3 px-4 text-slate-600 max-w-[220px] truncate">
                        {ref.receivingClinic}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500 whitespace-nowrap tabular-nums">
                        {ref.referralDate}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusIndicator status={ref.status} />
                      </td>
                      <td className="py-3 px-5">
                        <div className="flex justify-end">
                          <CompletenessMeter value={ref.completeness} />
                        </div>
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
