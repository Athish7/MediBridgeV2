import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  Edit3,
  Info,
  MessageSquare,
  Video,
  XCircle,
} from 'lucide-react';
import { SecurePatientMessagingPanel } from '../../components/SecurePatientMessagingPanel';
import { StatusIndicator } from '../../components/StatusIndicator';
import { useClinBridge } from '../../context/ClinBridgeContext';
import type { Referral } from '../../types/clinbridge';
import { isConfidentialityUnlocked } from '../../utils/privacyProjection';

export const SpecialistAppointmentsPage: React.FC = () => {
  const {
    referrals,
    specialists,
    settings,
    confirmReferralAppointment,
    cancelReferralAppointment,
    proposeEConsultation,
    respondToRescheduleRequest,
    sendEConsultationMessage,
    markEConsultMessagesRead,
    openSpecialistReview,
  } = useClinBridge();

  const relevantReferrals = useMemo(() => {
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

  const [editingReferral, setEditingReferral] = useState<Referral | null>(null);
  const [apptDate, setApptDate] = useState('');
  const [apptTime, setApptTime] = useState('');
  const [apptLocation, setApptLocation] = useState('');
  const [apptInstructions, setApptInstructions] = useState('');
  const [offerEConsult, setOfferEConsult] = useState(false);
  const [eConsultReason, setEConsultReason] = useState('');
  const [eConsultMessage, setEConsultMessage] = useState('');

  const [messagingReferralId, setMessagingReferralId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('Patient requested reschedule');

  const [counterReferralId, setCounterReferralId] = useState<string | null>(null);
  const [counterDate, setCounterDate] = useState('2026-12-18');
  const [counterTime, setCounterTime] = useState('02:00 PM');
  const [counterMessage, setCounterMessage] = useState('');
  const [submittingRescheduleId, setSubmittingRescheduleId] = useState<string | null>(null);

  const openScheduleModal = (ref: Referral) => {
    const sp = specialists.find((s) => s.id === ref.specialistId);
    setEditingReferral(ref);
    setApptDate(
      ref.confirmedAppointment?.date ?? ref.eConsultation?.proposedDate ?? 'December 12, 2026'
    );
    setApptTime(ref.confirmedAppointment?.time ?? ref.eConsultation?.proposedTime ?? '11:00 AM');
    setApptLocation(
      ref.confirmedAppointment?.location ??
        (sp ? `${sp.clinic} — ${sp.address}` : ref.receivingClinic)
    );
    setApptInstructions(
      ref.confirmedAppointment?.instructions ??
        'Please arrive 15 minutes early with photo ID and current medication list.'
    );
    setOfferEConsult(Boolean(ref.eConsultation?.isOffered));
    setEConsultReason(
      ref.eConsultation?.consultationReason ?? ref.clinicalInput.reasonForReferral
    );
    setEConsultMessage(
      ref.eConsultation?.specialistMessage ??
        'We would like to invite you to an online E-Consultation to review your initial findings and plan next steps.'
    );
  };

  const handleSaveAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReferral) return;

    if (offerEConsult) {
      await proposeEConsultation(editingReferral.id, {
        proposedDate: apptDate.trim(),
        proposedTime: apptTime.trim(),
        consultationReason:
          eConsultReason.trim() || editingReferral.clinicalInput.reasonForReferral,
        specialistMessage: eConsultMessage.trim(),
        isEConsultation: true,
      });
    } else {
      const isUpdate = Boolean(editingReferral.confirmedAppointment);
      confirmReferralAppointment(
        editingReferral.id,
        {
          date: apptDate.trim(),
          time: apptTime.trim(),
          mode: 'In-Person',
          location: apptLocation.trim(),
          instructions: apptInstructions.trim(),
        },
        isUpdate
      );
    }
    setEditingReferral(null);
  };

  const confirmedRows = relevantReferrals.filter(
    (r) =>
      r.status === 'Appointment Confirmed' ||
      r.status === 'E-Consultation Confirmed' ||
      r.status === 'Completed'
  );
  const rescheduleRows = relevantReferrals.filter(
    (r) => r.status === 'Reschedule Requested'
  );
  const pendingApprovalRows = relevantReferrals.filter(
    (r) =>
      r.status === 'E-Consultation Awaiting Patient Approval' ||
      r.status === 'Appointment Proposed'
  );
  const pendingScheduleRows = relevantReferrals.filter((r) => r.status === 'Accepted');

  const handleAcceptSuggestedTime = async (refId: string) => {
    setSubmittingRescheduleId(refId);
    try {
      await respondToRescheduleRequest(refId, { action: 'AcceptSuggested' });
      if (counterReferralId === refId) setCounterReferralId(null);
    } finally {
      setSubmittingRescheduleId(null);
    }
  };

  const handleCounterProposeSubmit = async (e: React.FormEvent, refId: string) => {
    e.preventDefault();
    if (!counterDate.trim() || !counterTime.trim()) return;
    setSubmittingRescheduleId(refId);
    try {
      await respondToRescheduleRequest(refId, {
        action: 'CounterPropose',
        proposedDate: counterDate.trim(),
        proposedTime: counterTime.trim(),
        specialistMessage: counterMessage.trim() || undefined,
      });
      setCounterReferralId(null);
      setCounterMessage('');
    } finally {
      setSubmittingRescheduleId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Appointment & E-Consultation Management
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Schedule in-person consultations, offer E-Consultations requiring patient confirmation, respond to reschedule requests, and message patients securely.
        </p>
      </div>

      <div className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-slate-700">
        <Info className="w-4 h-4 text-[#0F2942] shrink-0 mt-0.5" />
        <span>
          <strong className="font-semibold text-slate-900">Scheduling & E-Consultation Rule:</strong>{' '}
          Proposed E-Consultations remain unconfirmed until the patient accepts or both parties agree on a rescheduled date and time.
        </span>
      </div>

      {/* Create / Edit Appointment or E-Consultation Form */}
      {editingReferral && (
        <form
          onSubmit={handleSaveAppointment}
          className="bg-white border border-[#0F2942] rounded-xl p-6 space-y-4 shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                {editingReferral.confirmedAppointment ? 'Update Consultation' : 'Schedule Consultation'} ·{' '}
                {editingReferral.patient.name} ({editingReferral.id})
              </h2>
              <p className="text-xs text-slate-500">
                {editingReferral.specialistName} · {editingReferral.receivingClinic}
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-900 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={offerEConsult}
                onChange={(e) => setOfferEConsult(e.target.checked)}
                className="w-4 h-4 text-[#0F2942] rounded"
              />
              <Video className="w-3.5 h-3.5 text-indigo-700" />
              <span>Offer E-Consultation</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {offerEConsult ? 'Proposed Date' : 'Appointment Date'}
              </label>
              <input
                type="text"
                required
                value={apptDate}
                onChange={(e) => setApptDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {offerEConsult ? 'Proposed Time' : 'Appointment Time'}
              </label>
              <input
                type="text"
                required
                value={apptTime}
                onChange={(e) => setApptTime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {offerEConsult ? 'Consultation Mode' : 'Clinic Location'}
              </label>
              {offerEConsult ? (
                <div className="px-3 py-2 text-sm bg-indigo-50/70 border border-indigo-200 rounded-lg text-indigo-950 font-medium">
                  MediBridge Online E-Consultation
                </div>
              ) : (
                <input
                  type="text"
                  required
                  value={apptLocation}
                  onChange={(e) => setApptLocation(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              )}
            </div>
          </div>

          {offerEConsult ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Consultation Reason
                </label>
                <input
                  type="text"
                  required
                  value={eConsultReason}
                  onChange={(e) => setEConsultReason(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Short Message to Patient
                </label>
                <input
                  type="text"
                  required
                  value={eConsultMessage}
                  onChange={(e) => setEConsultMessage(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Patient Preparation Instructions
              </label>
              <input
                type="text"
                value={apptInstructions}
                onChange={(e) => setApptInstructions(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingReferral(null)}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg"
            >
              {offerEConsult
                ? 'Send E-Consultation Invitation'
                : 'Save & Confirm In-Person Appointment'}
            </button>
          </div>
        </form>
      )}

      {/* Patient Reschedule Requests */}
      {rescheduleRows.length > 0 && (
        <section className="bg-white border border-amber-300 rounded-xl overflow-hidden">
          <div className="px-5 py-4 bg-amber-50/70 border-b border-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700" />
            <h2 className="font-display text-base font-semibold text-amber-950">
              Patient Reschedule Requests ({rescheduleRows.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {rescheduleRows.map((ref) => {
              const req = ref.eConsultation?.rescheduleRequest;
              const isCounterOpen = counterReferralId === ref.id;
              const busy = submittingRescheduleId === ref.id;

              return (
                <div key={ref.id} className="p-5 space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-900">{ref.id}</span>
                        <span aria-hidden="true">·</span>
                        <StatusIndicator status={ref.status} />
                      </div>
                      <div className="text-base font-semibold text-slate-900">
                        {ref.patient.name}
                      </div>
                      {ref.eConsultation && (
                        <div className="text-xs text-slate-600">
                          Original offer:{' '}
                          <span className="font-mono">
                            {ref.eConsultation.proposedDate} at {ref.eConsultation.proposedTime}
                          </span>
                        </div>
                      )}
                      {req && (
                        <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs space-y-1">
                          <div>
                            <span className="text-slate-600">Patient Suggested: </span>
                            <span className="font-mono font-semibold text-slate-900 tabular-nums">
                              {req.suggestedDate} at {req.suggestedTime}
                            </span>
                          </div>
                          {req.message && (
                            <div className="text-slate-800">
                              <span className="font-semibold">Patient message:</span> “{req.message}”
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleAcceptSuggestedTime(ref.id)}
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Accept Proposed Time</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (isCounterOpen) {
                            setCounterReferralId(null);
                          } else {
                            setCounterReferralId(ref.id);
                            if (req) {
                              setCounterDate(req.suggestedDate);
                              setCounterTime(req.suggestedTime);
                            }
                          }
                        }}
                        className="px-3.5 py-1.5 text-xs font-medium text-[#0F2942] bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg"
                      >
                        Suggest Another Date & Time
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setMessagingReferralId((curr) => (curr === ref.id ? null : ref.id))
                        }
                        className="px-3 py-1.5 text-xs font-medium text-[#0F2942] bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Messages</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openSpecialistReview(ref.id)}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg"
                      >
                        View Review
                      </button>
                    </div>
                  </div>

                  {isCounterOpen && (
                    <form
                      onSubmit={(e) => void handleCounterProposeSubmit(e, ref.id)}
                      className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3"
                    >
                      <div className="text-xs font-semibold text-slate-900">
                        Propose Alternate Date & Time to {ref.patient.name}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-700 mb-1">
                            New Date
                          </label>
                          <input
                            type="date"
                            required
                            value={counterDate}
                            onChange={(e) => setCounterDate(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-700 mb-1">
                            New Time
                          </label>
                          <input
                            type="text"
                            required
                            value={counterTime}
                            onChange={(e) => setCounterTime(e.target.value)}
                            placeholder="e.g., 02:30 PM"
                            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-700 mb-1">
                            Note to Patient (Optional)
                          </label>
                          <input
                            type="text"
                            value={counterMessage}
                            onChange={(e) => setCounterMessage(e.target.value)}
                            placeholder="Explain alternative clinic slot..."
                            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setCounterReferralId(null)}
                          className="px-3 py-1.5 text-xs text-slate-600"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={busy}
                          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg"
                        >
                          Send Alternate Proposal
                        </button>
                      </div>
                    </form>
                  )}

                  {messagingReferralId === ref.id && (
                    <SecurePatientMessagingPanel
                      referral={ref}
                      viewerRole="specialist"
                      onSendMessage={(content) =>
                        sendEConsultationMessage(ref.id, 'specialist', content)
                      }
                      onMarkRead={() => markEConsultMessagesRead(ref.id, 'specialist')}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* E-Consultations & Proposals Awaiting Patient Approval */}
      {pendingApprovalRows.length > 0 && (
        <section className="bg-white border border-indigo-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 bg-indigo-50/60 border-b border-indigo-100 flex items-center gap-2">
            <Video className="w-4 h-4 text-indigo-700" />
            <h2 className="font-display text-base font-semibold text-indigo-950">
              Awaiting Patient Approval ({pendingApprovalRows.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {pendingApprovalRows.map((ref) => (
              <div key={ref.id} className="p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-slate-900">{ref.id}</span>
                      <span aria-hidden="true">·</span>
                      <StatusIndicator status={ref.status} />
                    </div>
                    <div className="text-base font-semibold text-slate-900">{ref.patient.name}</div>
                    {ref.eConsultation && (
                      <div className="text-xs text-indigo-900">
                        {ref.eConsultation.consultationMode} proposed for{' '}
                        <strong>
                          {ref.eConsultation.proposedDate} at {ref.eConsultation.proposedTime}
                        </strong>{' '}
                        — {ref.eConsultation.consultationReason}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setMessagingReferralId((curr) => (curr === ref.id ? null : ref.id))
                      }
                      className="px-3 py-1.5 text-xs font-medium text-[#0F2942] bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Patient Messages</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openSpecialistReview(ref.id)}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg"
                    >
                      View Review
                    </button>
                  </div>
                </div>

                {messagingReferralId === ref.id && (
                  <SecurePatientMessagingPanel
                    referral={ref}
                    viewerRole="specialist"
                    onSendMessage={(content) =>
                      sendEConsultationMessage(ref.id, 'specialist', content)
                    }
                    onMarkRead={() => markEConsultMessagesRead(ref.id, 'specialist')}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Accepted Referrals Ready for Scheduling */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Accepted Referrals Ready to Schedule ({pendingScheduleRows.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Assign a confirmed in-person visit or offer an E-Consultation for accepted patients
            </p>
          </div>
        </div>

        {pendingScheduleRows.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            No accepted referrals waiting for initial scheduling.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingScheduleRows.map((ref) => {
              const sp = specialists.find((s) => s.id === ref.specialistId);
              return (
                <div
                  key={ref.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-slate-900">{ref.id}</span>
                      <span aria-hidden="true">·</span>
                      <span>{ref.specialty}</span>
                      <span aria-hidden="true">·</span>
                      <span>Est. clinic wait: {sp?.estimatedWait ?? 'Pending'}</span>
                    </div>
                    <div className="text-base font-semibold text-slate-900">
                      {ref.patient.name}
                    </div>
                    <div className="text-xs text-slate-600">
                      {ref.specialistName} · {ref.receivingClinic}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openSpecialistReview(ref.id)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                    >
                      View Review
                    </button>
                    <button
                      type="button"
                      onClick={() => openScheduleModal(ref)}
                      className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg inline-flex items-center gap-1.5"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      <span>Schedule / Offer E-Consult</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Upcoming & Completed Appointments Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <CalendarCheck className="w-4 h-4 text-teal-700" />
          <h2 className="font-display text-base font-semibold text-slate-900">
            Confirmed & Completed Consultations ({confirmedRows.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-5">Patient Name</th>
                <th className="py-2.5 px-4">Referral ID</th>
                <th className="py-2.5 px-4">Mode & Date</th>
                <th className="py-2.5 px-4">Time</th>
                <th className="py-2.5 px-4">Location / Channel</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {confirmedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                    No confirmed consultations yet.
                  </td>
                </tr>
              ) : (
                confirmedRows.map((ref) => (
                  <React.Fragment key={ref.id}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-5 font-medium text-slate-900 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openSpecialistReview(ref.id)}
                          className="hover:underline text-left"
                        >
                          {ref.patient.name}
                        </button>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                        {ref.id}
                      </td>
                      <td className="py-3 px-4 text-slate-800 whitespace-nowrap">
                        <span className="text-xs font-semibold text-teal-800 mr-1.5">
                          [{ref.confirmedAppointment?.mode ?? 'In-Person'}]
                        </span>
                        {ref.confirmedAppointment?.date ?? '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                        {ref.confirmedAppointment?.time ?? '—'}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 max-w-[240px] truncate">
                        {ref.confirmedAppointment?.location ?? ref.receivingClinic}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusIndicator status={ref.status} />
                      </td>
                      <td className="py-3 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() =>
                              setMessagingReferralId((curr) => (curr === ref.id ? null : ref.id))
                            }
                            className="text-xs font-medium text-teal-800 hover:text-teal-950 inline-flex items-center gap-1"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Message</span>
                          </button>
                          {(ref.status === 'Appointment Confirmed' ||
                            ref.status === 'E-Consultation Confirmed') && (
                            <>
                              <button
                                type="button"
                                onClick={() => openScheduleModal(ref)}
                                className="text-xs font-medium text-[#0F2942] hover:text-teal-700 inline-flex items-center gap-1"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Update</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setCancellingId(ref.id)}
                                className="text-xs font-medium text-rose-700 hover:text-rose-900 inline-flex items-center gap-1"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Cancel</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {messagingReferralId === ref.id && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={7} className="p-4">
                          <SecurePatientMessagingPanel
                            referral={ref}
                            viewerRole="specialist"
                            onSendMessage={(content) =>
                              sendEConsultationMessage(ref.id, 'specialist', content)
                            }
                            onMarkRead={() => markEConsultMessagesRead(ref.id, 'specialist')}
                          />
                        </td>
                      </tr>
                    )}

                    {cancellingId === ref.id && (
                      <tr className="bg-rose-50/50">
                        <td colSpan={7} className="px-5 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                              <span className="text-xs font-semibold text-rose-900 whitespace-nowrap">
                                Cancellation Reason:
                              </span>
                              <input
                                type="text"
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                className="flex-1 px-2.5 py-1 text-xs bg-white border border-rose-200 rounded"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setCancellingId(null)}
                                className="px-2.5 py-1 text-xs text-slate-600"
                              >
                                Keep Appointment
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  cancelReferralAppointment(ref.id, cancelReason);
                                  setCancellingId(null);
                                }}
                                className="px-3 py-1 text-xs font-medium text-white bg-rose-700 hover:bg-rose-800 rounded"
                              >
                                Confirm Cancellation
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
