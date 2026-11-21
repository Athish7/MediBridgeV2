import React, { useMemo } from 'react';
import { ArrowRight, CalendarCheck, CheckCircle2 } from 'lucide-react';
import { CompletenessMeter, StatusIndicator } from '../../components/StatusIndicator';
import { useClinBridge } from '../../context/ClinBridgeContext';
import { isConfidentialityUnlocked } from '../../utils/privacyProjection';

export const SpecialistAcceptedPage: React.FC = () => {
  const { referrals, settings, openSpecialistReview, setActiveSection } = useClinBridge();

  const acceptedList = useMemo(() => {
    const base = referrals.filter(
      (r) =>
        isConfidentialityUnlocked(r) &&
        (r.status === 'Accepted' ||
          r.status === 'Appointment Proposed' ||
          r.status === 'E-Consultation Awaiting Patient Approval' ||
          r.status === 'Reschedule Requested' ||
          r.status === 'E-Consultation Confirmed' ||
          r.status === 'Appointment Confirmed' ||
          r.status === 'Completed')
    );
    if (settings.specialistProfileId === 'all') return base;
    return base.filter((r) => r.specialistId === settings.specialistProfileId);
  }, [referrals, settings.specialistProfileId]);

  const awaitingScheduling = acceptedList.filter(
    (r) =>
      r.status === 'Accepted' ||
      r.status === 'Appointment Proposed' ||
      r.status === 'E-Consultation Awaiting Patient Approval' ||
      r.status === 'Reschedule Requested'
  );
  const scheduledOrDone = acceptedList.filter(
    (r) =>
      r.status === 'Appointment Confirmed' ||
      r.status === 'E-Consultation Confirmed' ||
      r.status === 'Completed'
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Accepted Referrals
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Track accepted referrals awaiting scheduling or patient E-Consultation approval alongside confirmed consultations.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActiveSection('specialist-appointments')}
          className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg transition-colors whitespace-nowrap self-start inline-flex items-center gap-1.5"
        >
          <CalendarCheck className="w-4 h-4" />
          <span>Manage Appointments & E-Consults</span>
        </button>
      </div>

      {/* Awaiting Appointment Scheduling or Patient Approval */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Accepted — Scheduling & Patient Confirmation ({awaitingScheduling.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Accepted referrals awaiting appointment confirmation or patient approval of a proposed E-Consultation
            </p>
          </div>
        </div>

        {awaitingScheduling.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No accepted referrals are currently waiting for scheduling.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {awaitingScheduling.map((ref) => (
              <div
                key={ref.id}
                className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-semibold text-slate-900">{ref.id}</span>
                    <span aria-hidden="true">·</span>
                    <StatusIndicator status={ref.status} />
                    <span aria-hidden="true">·</span>
                    <span>Accepted {ref.acceptedAt ?? ref.lastUpdated}</span>
                    <span aria-hidden="true">·</span>
                    <span>{ref.specialty}</span>
                  </div>
                  <div className="text-base font-semibold text-slate-900">{ref.patient.name}</div>
                  <div className="text-xs text-slate-600">
                    {ref.clinicalInput.reasonForReferral}
                  </div>
                  {ref.eConsultation && (
                    <div className="text-xs text-indigo-800 font-medium">
                      {ref.eConsultation.consultationMode} proposed for {ref.eConsultation.proposedDate} at {ref.eConsultation.proposedTime} ({ref.eConsultation.patientStatus})
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <CompletenessMeter value={ref.completeness} />
                  <button
                    type="button"
                    onClick={() => openSpecialistReview(ref.id)}
                    className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg inline-flex items-center gap-1"
                  >
                    <span>Schedule / Review</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Scheduled & Completed */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          <h2 className="font-display text-base font-semibold text-slate-900">
            Confirmed & Completed Accepted Referrals ({scheduledOrDone.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-5">Patient</th>
                <th className="py-2.5 px-4">Referral ID</th>
                <th className="py-2.5 px-4">Specialist</th>
                <th className="py-2.5 px-4">Appointment</th>
                <th className="py-2.5 px-5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {scheduledOrDone.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                    No scheduled or completed referrals yet.
                  </td>
                </tr>
              ) : (
                scheduledOrDone.map((ref) => (
                  <tr
                    key={ref.id}
                    onClick={() => openSpecialistReview(ref.id)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-5 font-medium text-slate-900 whitespace-nowrap">
                      {ref.patient.name}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                      {ref.id}
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                      {ref.specialistName} · {ref.specialty}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {ref.confirmedAppointment
                        ? `${ref.confirmedAppointment.mode ?? 'In-Person'} · ${ref.confirmedAppointment.date} at ${ref.confirmedAppointment.time}`
                        : '—'}
                    </td>
                    <td className="py-3 px-5 whitespace-nowrap">
                      <StatusIndicator status={ref.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
