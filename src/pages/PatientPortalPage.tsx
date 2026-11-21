import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Clock,
  Info,
  Lock,
  MapPin,
  Stethoscope,
  Video,
  XCircle,
} from 'lucide-react';
import { InsurancePanel } from '../components/InsurancePanel';
import { SecurePatientMessagingPanel } from '../components/SecurePatientMessagingPanel';
import { useClinBridge } from '../context/ClinBridgeContext';
import type { ReferralStatus } from '../types/clinbridge';

const PATIENT_STEPS = [
  { key: 'created', label: 'Referral Prepared' },
  { key: 'submitted', label: 'Sent to Specialist Clinic' },
  { key: 'reviewing', label: 'Clinic Reviewing' },
  { key: 'scheduled', label: 'Appointment Confirmed' },
  { key: 'completed', label: 'Consultation Completed' },
];

function getStepIndex(status: ReferralStatus): number {
  switch (status) {
    case 'Draft':
    case 'Awaiting Specialist Selection':
    case 'Ready for submission':
      return 0;
    case 'Submitted':
      return 1;
    case 'Awaiting Specialist Review':
    case 'Awaiting specialist review':
    case 'Anonymous Information Reviewed':
    case 'Confidentiality Agreement Accepted':
    case 'Full Information Unlocked':
    case 'Awaiting Specialist Decision':
    case 'Additional Information Requested':
    case 'Clarification requested':
    case 'Accepted':
    case 'Appointment Proposed':
    case 'E-Consultation Awaiting Patient Approval':
    case 'Reschedule Requested':
      return 2;
    case 'Appointment Confirmed':
    case 'E-Consultation Confirmed':
    case 'Appointment confirmed':
      return 3;
    case 'Completed':
      return 4;
    default:
      return 1;
  }
}

export const PatientPortalPage: React.FC = () => {
  const {
    referrals,
    specialists,
    patientPortalReferralId,
    setPatientPortalReferralId,
    setActiveSection,
    openReferralRecord,
    respondEConsultation,
    sendEConsultationMessage,
    markEConsultMessagesRead,
  } = useClinBridge();

  const [declineReason, setDeclineReason] = useState('');
  const [showDeclineBox, setShowDeclineBox] = useState(false);
  const [showRescheduleBox, setShowRescheduleBox] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('2026-12-16');
  const [rescheduleTime, setRescheduleTime] = useState('02:30 PM');
  const [rescheduleMessage, setRescheduleMessage] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);

  const currentReferral = useMemo(
    () =>
      referrals.find((r) => r.id === patientPortalReferralId) ?? referrals[0],
    [referrals, patientPortalReferralId]
  );

  const specialist = useMemo(
    () => specialists.find((s) => s.id === currentReferral?.specialistId),
    [specialists, currentReferral]
  );

  if (!currentReferral) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
        No referrals available to preview.
      </div>
    );
  }

  const currentStepIdx = getStepIndex(currentReferral.status);
  const needsClarification =
    currentReferral.status === 'Additional Information Requested' ||
    currentReferral.status === 'Clarification requested';

  const eConsult = currentReferral.eConsultation;

  const handleEConsultDecision = async (decision: 'Accept' | 'Decline') => {
    setSubmittingDecision(true);
    try {
      await respondEConsultation(currentReferral.id, {
        decision,
        declineReason: decision === 'Decline' ? declineReason.trim() : undefined,
      });
      setShowDeclineBox(false);
      setShowRescheduleBox(false);
      setDeclineReason('');
    } finally {
      setSubmittingDecision(false);
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleDate.trim() || !rescheduleTime.trim()) return;
    setSubmittingDecision(true);
    try {
      await respondEConsultation(currentReferral.id, {
        decision: 'Reschedule',
        suggestedDate: rescheduleDate.trim(),
        suggestedTime: rescheduleTime.trim(),
        message: rescheduleMessage.trim() || undefined,
      });
      setShowRescheduleBox(false);
      setRescheduleMessage('');
    } finally {
      setSubmittingDecision(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Presenter Control Strip */}
      <div className="bg-[#0F2942] text-white rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="text-xs font-medium text-teal-300">
            Patient Care & E-Consultation Portal
          </div>
          <p className="text-xs text-slate-200">
            Track your referral status, accept or request a reschedule for specialist E-Consultation invitations, view your insurance details, and message your specialist clinic securely.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <label htmlFor="portal-referral-select" className="text-xs text-slate-300">
            Preview Patient:
          </label>
          <select
            id="portal-referral-select"
            value={currentReferral.id}
            onChange={(e) => {
              setPatientPortalReferralId(e.target.value);
              setShowDeclineBox(false);
              setShowRescheduleBox(false);
            }}
            className="px-3 py-1.5 text-xs bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none"
          >
            {referrals.map((r) => (
              <option key={r.id} value={r.id} className="text-slate-900">
                {r.patient.name} — {r.id} ({r.status})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setActiveSection('dashboard')}
            className="px-3 py-1.5 text-xs font-medium bg-white text-[#0F2942] rounded-lg hover:bg-slate-100 inline-flex items-center gap-1 whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Physician View</span>
          </button>
        </div>
      </div>

      {/* Patient-Facing Portal Container */}
      <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        {/* Patient Header */}
        <div className="bg-teal-900/5 border-b border-slate-200 px-6 sm:px-8 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-teal-800">
              MediBridge Patient Care Tracker
            </div>
            <h1 className="font-display text-2xl font-bold text-slate-900 mt-1">
              Hello, {currentReferral.patient.name}
            </h1>
            <p className="text-sm text-slate-600 mt-0.5">
              Referral Reference <span className="font-mono font-medium">{currentReferral.id}</span> · Referred by {currentReferral.referringPhysician}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-xs text-slate-500">Current Stage</div>
            <div className="text-base font-semibold text-[#0F2942] mt-0.5">
              {currentReferral.status === 'Declined'
                ? 'Clinic Coordination Update'
                : currentReferral.status}
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-8">
          {/* Plain-Language 5-Step Progress Tracker */}
          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-4">
              Your Referral Progress
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              {PATIENT_STEPS.map((st, idx) => {
                const isDone = idx < currentStepIdx;
                const isActive = idx === currentStepIdx;
                return (
                  <div
                    key={st.key}
                    className={`p-3 rounded-xl border ${
                      isActive
                        ? 'bg-teal-50 border-teal-300 text-teal-950'
                        : isDone
                          ? 'bg-slate-50 border-slate-200 text-slate-800'
                          : 'bg-white border-slate-100 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {isDone ? (
                        <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
                      ) : isActive ? (
                        <Clock className="w-4 h-4 text-teal-800 shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
                      )}
                      <span className="font-mono text-[11px] font-semibold tabular-nums">
                        Step {idx + 1}
                      </span>
                    </div>
                    <div className="text-xs font-medium leading-snug">{st.label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* E-Consultation / Proposed Appointment Invitation Card */}
          {eConsult && (
            <section
              className={`p-5 rounded-xl border space-y-4 ${
                eConsult.patientStatus === 'Pending'
                  ? 'bg-indigo-50/70 border-indigo-300'
                  : eConsult.patientStatus === 'Accepted'
                    ? 'bg-teal-50/70 border-teal-200'
                    : eConsult.patientStatus === 'Reschedule Requested'
                      ? 'bg-amber-50/70 border-amber-200'
                      : 'bg-rose-50/70 border-rose-200'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Video className="w-5 h-5 text-indigo-800 shrink-0 mt-0.5" />
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900">
                      {eConsult.consultationMode === 'E-Consultation'
                        ? 'Online E-Consultation Invitation'
                        : 'Proposed Specialist Appointment'}
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      From {currentReferral.specialistName} ({currentReferral.specialty}) ·{' '}
                      {currentReferral.receivingClinic}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold ${
                    eConsult.patientStatus === 'Accepted'
                      ? 'text-teal-800'
                      : eConsult.patientStatus === 'Reschedule Requested'
                        ? 'text-amber-800'
                        : eConsult.patientStatus === 'Declined'
                          ? 'text-rose-800'
                          : 'text-indigo-900'
                  }`}
                >
                  Status: {eConsult.patientStatus}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-white/90 border border-slate-200 rounded-lg p-4">
                <div>
                  <div className="text-slate-500">Proposed Date & Time</div>
                  <div className="font-semibold text-slate-900 text-sm mt-0.5 tabular-nums">
                    {eConsult.proposedDate} at {eConsult.proposedTime}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Consultation Reason</div>
                  <div className="font-medium text-slate-900 mt-0.5">
                    {eConsult.consultationReason}
                  </div>
                </div>
                {eConsult.specialistMessage && (
                  <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                    <div className="text-slate-500">Message from {currentReferral.specialistName}</div>
                    <p className="text-slate-800 text-sm mt-0.5 leading-relaxed">
                      “{eConsult.specialistMessage}”
                    </p>
                  </div>
                )}
              </div>

              {eConsult.patientStatus === 'Reschedule Requested' && eConsult.rescheduleRequest && (
                <div className="p-4 bg-white border border-amber-200 rounded-lg space-y-1.5 text-xs">
                  <div className="font-semibold text-amber-950 flex items-center gap-1.5">
                    <CalendarClock className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>Reschedule Requested — Waiting for Specialist Confirmation</span>
                  </div>
                  <div className="text-slate-700">
                    Your suggested slot:{' '}
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {eConsult.rescheduleRequest.suggestedDate} at{' '}
                      {eConsult.rescheduleRequest.suggestedTime}
                    </span>
                  </div>
                  {eConsult.rescheduleRequest.message && (
                    <div className="text-slate-600">
                      Your message: “{eConsult.rescheduleRequest.message}”
                    </div>
                  )}
                  <p className="text-amber-800 pt-1">
                    Your consultation is not yet confirmed until {currentReferral.specialistName} accepts your suggested time or proposes an alternate date and time.
                  </p>
                </div>
              )}

              {eConsult.patientStatus === 'Pending' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={submittingDecision}
                      onClick={() => void handleEConsultDecision('Accept')}
                      className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {eConsult.consultationMode === 'E-Consultation'
                          ? 'Accept E-Consultation'
                          : 'Accept Proposed Appointment'}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={submittingDecision}
                      onClick={() => {
                        setShowRescheduleBox((v) => !v);
                        setShowDeclineBox(false);
                      }}
                      className="px-4 py-2 text-xs sm:text-sm font-medium text-[#0F2942] bg-white border border-slate-300 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5"
                    >
                      <CalendarClock className="w-4 h-4" />
                      <span>
                        {eConsult.consultationMode === 'E-Consultation'
                          ? 'Reschedule E-Consultation'
                          : 'Request Reschedule'}
                      </span>
                    </button>
                    {eConsult.consultationMode !== 'E-Consultation' && (
                      <button
                        type="button"
                        disabled={submittingDecision}
                        onClick={() => {
                          setShowDeclineBox((v) => !v);
                          setShowRescheduleBox(false);
                        }}
                        className="px-4 py-2 text-xs sm:text-sm font-medium text-rose-800 bg-white border border-rose-200 hover:bg-rose-50 rounded-lg inline-flex items-center gap-1.5"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Decline</span>
                      </button>
                    )}
                  </div>

                  {showRescheduleBox && (
                    <form
                      onSubmit={handleRescheduleSubmit}
                      className="p-4 bg-white border border-slate-200 rounded-lg space-y-3"
                    >
                      <div className="text-xs font-semibold text-slate-900">
                        Suggest a Different Date & Time for Your{' '}
                        {eConsult.consultationMode === 'E-Consultation'
                          ? 'E-Consultation'
                          : 'Appointment'}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Suggested Date *
                          </label>
                          <input
                            type="date"
                            required
                            value={rescheduleDate}
                            onChange={(e) => setRescheduleDate(e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Suggested Time *
                          </label>
                          <input
                            type="text"
                            required
                            value={rescheduleTime}
                            onChange={(e) => setRescheduleTime(e.target.value)}
                            placeholder="e.g., 02:30 PM"
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Optional Message Explaining Requested Change
                        </label>
                        <textarea
                          rows={2}
                          value={rescheduleMessage}
                          onChange={(e) => setRescheduleMessage(e.target.value)}
                          placeholder="e.g., I work morning shifts and am available any afternoon after 2:00 PM..."
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-500">
                          Your appointment remains unconfirmed until the specialist confirms the new time.
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowRescheduleBox(false)}
                            className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={submittingDecision}
                            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg"
                          >
                            Send Reschedule Request
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                  {showDeclineBox && eConsult.consultationMode !== 'E-Consultation' && (
                    <div className="p-3.5 bg-white border border-rose-200 rounded-lg space-y-2.5">
                      <label className="block text-xs font-medium text-slate-700">
                        Optional reason or preferred alternative
                      </label>
                      <input
                        type="text"
                        value={declineReason}
                        onChange={(e) => setDeclineReason(e.target.value)}
                        placeholder="Unavailable at proposed time..."
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowDeclineBox(false)}
                          className="px-3 py-1 text-xs text-slate-600"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={submittingDecision}
                          onClick={() => void handleEConsultDecision('Decline')}
                          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-lg"
                        >
                          Confirm Decline
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Action / Clarification Status Banner */}
          {needsClarification ? (
            <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-sm font-semibold text-amber-950">
                  Clinic Coordination in Progress (No Patient Action Needed)
                </div>
                <p className="text-sm text-amber-900 leading-relaxed">
                  {currentReferral.receivingClinic} has asked your family physician’s office to share an additional supporting record before confirming your appointment date. Your care teams are coordinating this directly.
                </p>
              </div>
            </div>
          ) : null}

          {/* Specialist & Appointment Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Receiving Specialist */}
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Stethoscope className="w-4 h-4 text-[#0F2942]" />
                <span>Receiving Specialist & Clinic</span>
              </div>
              <div>
                <div className="text-lg font-display font-semibold text-slate-900">
                  {currentReferral.specialistName}
                </div>
                <div className="text-sm text-teal-800 font-medium">
                  {currentReferral.specialty}
                </div>
                <div className="text-sm text-slate-700 mt-1">
                  {currentReferral.receivingClinic}
                </div>
              </div>
              {specialist && (
                <div className="pt-2 border-t border-slate-200 text-xs text-slate-600 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>{specialist.address}</span>
                  </div>
                  <div>Clinic Phone: {specialist.phone}</div>
                </div>
              )}
            </div>

            {/* Appointment or Estimated Wait */}
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <CalendarCheck className="w-4 h-4 text-teal-700" />
                <span>Appointment Status</span>
              </div>

              {currentReferral.status === 'Awaiting Specialist Selection' || !specialist ? (
                <div className="space-y-2">
                  <div className="text-base font-semibold text-slate-900">
                    Specialist Clinic Selection in Progress
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Your family physician is selecting an appropriate {currentReferral.specialty.toLowerCase()} clinic for your referral. Estimated wait times and appointment updates will appear here once a specialist clinic is confirmed.
                  </p>
                </div>
              ) : currentReferral.confirmedAppointment &&
              (currentReferral.status === 'Appointment Confirmed' ||
                currentReferral.status === 'E-Consultation Confirmed' ||
                currentReferral.status === 'Appointment confirmed' ||
                currentReferral.status === 'Completed') ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-teal-800">
                    {currentReferral.confirmedAppointment.mode === 'E-Consultation'
                      ? 'E-Consultation Confirmed (Online)'
                      : `${currentReferral.confirmedAppointment.mode ?? 'In-Person'} Consultation`}
                  </div>
                  <div className="text-lg font-display font-semibold text-teal-900 tabular-nums">
                    {currentReferral.confirmedAppointment.date} at{' '}
                    {currentReferral.confirmedAppointment.time}
                  </div>
                  <div className="text-xs text-slate-700">
                    {currentReferral.confirmedAppointment.location}
                  </div>
                  <div className="p-3 bg-white border border-teal-200 rounded-lg text-xs text-slate-700 leading-relaxed">
                    <strong className="font-semibold text-slate-900">
                      Preparation Instructions:{' '}
                    </strong>
                    {currentReferral.confirmedAppointment.instructions}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-base font-semibold text-slate-900">
                    {currentReferral.status === 'Reschedule Requested'
                      ? 'Reschedule requested — appointment not yet confirmed'
                      : 'Appointment date not yet confirmed'}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Estimated clinic wait time:{' '}
                    <span className="font-mono font-semibold text-slate-900">
                      {specialist.estimatedWait}
                    </span>
                    . Confirmed dates appear here only after both you and the specialist clinic confirm the schedule.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Patient Medical Insurance Information (Read-Only with Policy ID Masking) */}
          <InsurancePanel
            insurance={currentReferral.insurance}
            specialty={currentReferral.specialty}
            role="patient"
            readOnlyPatient={true}
            defaultExpanded={true}
          />

          {/* Secure Specialist–Patient Messaging */}
          {(currentReferral.eConsultation || currentReferral.confirmedAppointment) && (
            <SecurePatientMessagingPanel
              referral={currentReferral}
              viewerRole="patient"
              onSendMessage={(content) =>
                sendEConsultationMessage(currentReferral.id, 'patient', content)
              }
              onMarkRead={() => markEConsultMessagesRead(currentReferral.id, 'patient')}
            />
          )}

          {/* Clinician-Approved Next Steps */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                Clinician-Approved Next Steps
              </h2>
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <Lock className="w-3 h-3" />
                Clinical record read-only for safety
              </span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              {currentReferral.patientNextSteps}
            </p>
          </div>

          {/* Footer Disclaimer */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0" />
              Simulated patient view using fictional data. If symptoms worsen urgently, contact emergency services or your family clinic directly.
            </span>
            <button
              type="button"
              onClick={() => openReferralRecord(currentReferral.id)}
              className="text-xs font-medium text-[#0F2942] hover:underline whitespace-nowrap"
            >
              Inspect Physician Record ({currentReferral.id}) →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
