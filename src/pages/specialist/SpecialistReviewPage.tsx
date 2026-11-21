import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Eye,
  FileText,
  History,
  Info,
  Lock,
  LockOpen,
  Mail,
  MessageSquare,
  MessageSquarePlus,
  Phone,
  SearchCode,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User,
  Video,
  XCircle,
} from 'lucide-react';
import { AccordionSection, type AccordionStatusKind } from '../../components/AccordionSection';
import { AuditLogPanel } from '../../components/AuditLogPanel';
import { InsurancePanel } from '../../components/InsurancePanel';
import { SecurePatientMessagingPanel } from '../../components/SecurePatientMessagingPanel';
import {
  ChecklistStatusIndicator,
  CompletenessMeter,
  StatusIndicator,
  UrgencyLabel,
  VerificationLabel,
} from '../../components/StatusIndicator';
import { useClinBridge } from '../../context/ClinBridgeContext';
import type {
  AnonymousReferralPreview,
  DeclineReasonCategory,
  UploadedDocument,
} from '../../types/clinbridge';
import { getInsuranceVerificationStatus } from '../../utils/insuranceAdvisor';
import {
  CONFIDENTIALITY_AGREEMENT_TEXT,
  formatPatientAgeRange,
  getSpecialistProfessionalId,
  isConfidentialityUnlocked,
  projectStage1AnonymousReferral,
} from '../../utils/privacyProjection';

const DECLINE_REASONS: DeclineReasonCategory[] = [
  'Outside specialty scope',
  'Incorrect receiving clinic',
  'Insufficient information',
  'Other administrative reason',
];

export const SpecialistReviewPage: React.FC = () => {
  const {
    referrals,
    specialists,
    settings,
    specialistReviewReferralId,
    openSpecialistReview,
    setActiveSection,
    markAnonymousReviewed,
    acceptConfidentialityAndUnlock,
    acceptReferral,
    requestClarification,
    sendReferralMessage,
    markReferralMessagesRead,
    declineReferral,
    confirmReferralAppointment,
    proposeEConsultation,
    respondToRescheduleRequest,
    sendEConsultationMessage,
    markEConsultMessagesRead,
    requestInsuranceInfo,
    simulateStatusTransition,
    updateReferral,
    showToast,
  } = useClinBridge();

  const availableReferrals = useMemo(
    () =>
      referrals.filter(
        (r) =>
          r.status !== 'Draft' &&
          r.status !== 'Ready for submission' &&
          r.status !== 'Awaiting Specialist Selection' &&
          Boolean(r.specialistId)
      ),
    [referrals]
  );

  const referral = useMemo(
    () =>
      availableReferrals.find((r) => r.id === specialistReviewReferralId) ??
      availableReferrals[0] ??
      null,
    [availableReferrals, specialistReviewReferralId]
  );

  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<UploadedDocument | null>(null);
  const [activeActionPanel, setActiveActionPanel] = useState<
    'none' | 'clarify' | 'decline' | 'appointment'
  >('none');

  // Stage 1/2 backend-verified privacy state
  const [apiPreview, setApiPreview] = useState<AnonymousReferralPreview | null>(null);
  const [apiForbiddenError, setApiForbiddenError] = useState<string | null>(null);
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  // Direct message form state
  const [directMsgSubject, setDirectMsgSubject] = useState('');
  const [directMsgBody, setDirectMsgBody] = useState('');

  // Clarification form state
  const [missingInfo, setMissingInfo] = useState('');
  const [clarifyReason, setClarifyReason] = useState('');
  const [clarifyNotes, setClarifyNotes] = useState('');

  // Decline form state
  const [declineCategory, setDeclineCategory] =
    useState<DeclineReasonCategory>('Outside specialty scope');
  const [declineNotes, setDeclineNotes] = useState('');

  // Appointment & E-Consultation form state
  const [apptDate, setApptDate] = useState('December 9, 2026');
  const [apptTime, setApptTime] = useState('10:15 AM');
  const [apptLocation, setApptLocation] = useState('');
  const [apptInstructions, setApptInstructions] = useState(
    'Please arrive 15 minutes early with photo ID and a list of current medications.'
  );
  const [offerEConsult, setOfferEConsult] = useState(false);
  const [eConsultReason, setEConsultReason] = useState('');
  const [eConsultMessage, setEConsultMessage] = useState('');

  // E-Consultation Reschedule Response state
  const [showCounterProposeForm, setShowCounterProposeForm] = useState(false);
  const [counterDate, setCounterDate] = useState('2026-12-18');
  const [counterTime, setCounterTime] = useState('02:00 PM');
  const [counterMessage, setCounterMessage] = useState('');
  const [submittingRescheduleAction, setSubmittingRescheduleAction] = useState(false);

  // Stage 3 Multi-Open Accordion State
  const [openSections, setOpenSections] = useState<
    Record<'sec1' | 'sec2' | 'sec3' | 'sec4' | 'sec5' | 'sec6', boolean>
  >({
    sec1: true,
    sec2: true,
    sec3: false,
    sec4: false,
    sec5: false,
    sec6: true,
  });

  const toggleSection = (key: 'sec1' | 'sec2' | 'sec3' | 'sec4' | 'sec5' | 'sec6') => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setAllSections = (open: boolean) => {
    setOpenSections({
      sec1: open,
      sec2: open,
      sec3: open,
      sec4: open,
      sec5: open,
      sec6: open,
    });
  };

  const actingSpecialistId =
    settings.specialistProfileId === 'all'
      ? referral?.specialistId ?? ''
      : settings.specialistProfileId;

  const unlocked = referral ? isConfidentialityUnlocked(referral) : false;

  // Fetch Stage 1 / Stage 2 projection from backend with strict role + specialist header
  useEffect(() => {
    if (!referral) return;
    let cancelled = false;
    setAgreementChecked(false);
    setApiForbiddenError(null);

    const fetchSpecialistRecord = async () => {
      try {
        const res = await fetch(
          `/api/specialist/referrals/${encodeURIComponent(referral.id)}`,
          {
            headers: {
              'x-medibridge-role': 'specialist',
              'x-medibridge-specialist-id': actingSpecialistId,
            },
          }
        );
        if (cancelled) return;
        if (res.status === 403) {
          const err = await res.json().catch(() => ({}));
          setApiForbiddenError(
            err.error ||
              'Access denied: this referral is assigned to a different specialist clinic.'
          );
          setApiPreview(null);
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (data.unlocked === false && data.preview) {
            setApiPreview(data.preview as AnonymousReferralPreview);
          } else {
            setApiPreview(null);
          }
        }
      } catch {
        // local projection fallback remains safe
      }
    };

    void fetchSpecialistRecord();
    return () => {
      cancelled = true;
    };
  }, [referral?.id, unlocked, actingSpecialistId]);

  // Log Stage 1 anonymous preview review automatically once per referral
  useEffect(() => {
    if (!referral || unlocked || apiForbiddenError) return;
    if (
      referral.status === 'Submitted' ||
      referral.status === 'Awaiting Specialist Review'
    ) {
      void markAnonymousReviewed(referral.id, actingSpecialistId);
    }
  }, [referral?.id, referral?.status, unlocked, apiForbiddenError, actingSpecialistId, markAnonymousReviewed]);

  if (!referral) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
        <div className="text-base font-semibold text-slate-900">
          No submitted referrals available to review
        </div>
        <p className="text-sm text-slate-500">
          Switch to Physician View to submit a referral, or return to the Specialist Dashboard.
        </p>
      </div>
    );
  }

  const specialist = specialists.find((s) => s.id === referral.specialistId);
  const actingSpecialist = specialists.find((s) => s.id === actingSpecialistId) ?? specialist;
  const professionalId = getSpecialistProfessionalId(actingSpecialistId || referral.specialistId);

  const selectedExtracted =
    referral.analysis.extractedItems.find((i) => i.id === selectedSourceId) ??
    referral.analysis.extractedItems[0];

  const coreCompletenessItems = [
    {
      label: 'Reason for referral',
      present: Boolean(referral.clinicalInput.reasonForReferral.trim()),
    },
    {
      label: 'Relevant clinical history',
      present: Boolean(referral.clinicalInput.clinicalHistory.trim()),
    },
    {
      label: 'Previous treatments',
      present: Boolean(referral.clinicalInput.previousTreatments.trim()),
    },
    {
      label: 'Examination findings',
      present: Boolean(referral.clinicalInput.examinationFindings.trim()),
    },
    {
      label: 'Investigation results',
      present: Boolean(referral.clinicalInput.investigations.trim()),
    },
    {
      label: 'Supporting documents',
      present: referral.documents.length > 0,
    },
  ];

  const handleOpenAppointmentPanel = () => {
    setApptLocation(
      specialist ? `${specialist.clinic} — ${specialist.address}` : referral.receivingClinic
    );
    setOfferEConsult(Boolean(referral.eConsultation?.isOffered));
    setEConsultReason(
      referral.eConsultation?.consultationReason || referral.clinicalInput.reasonForReferral
    );
    setEConsultMessage(
      referral.eConsultation?.specialistMessage ||
        'Would you like to review your initial clinical findings and pre-consultation plan via an online E-Consultation?'
    );
    setActiveActionPanel((curr) => (curr === 'appointment' ? 'none' : 'appointment'));
  };

  const handleAcceptConfidentiality = async () => {
    if (!agreementChecked) return;
    setUnlocking(true);
    try {
      const result = await acceptConfidentialityAndUnlock(referral.id, {
        specialistId: actingSpecialistId || referral.specialistId,
        specialistName: actingSpecialist?.name ?? referral.specialistName,
        professionalId,
        accepted: true,
      });
      if (!result.ok && result.error) {
        showToast(result.error);
      } else {
        setApiPreview(null);
      }
    } finally {
      setUnlocking(false);
    }
  };

  const handleVerifyChecklistItem = (chkId: string) => {
    updateReferral(referral.id, (prev) => {
      const updated = prev.analysis.checklist.map((c) =>
        c.id === chkId
          ? {
              ...c,
              status: 'Clinician verified' as const,
              details: `Verified by specialist intake (${prev.specialistName}).`,
            }
          : c
      );
      const satisfied = updated.filter(
        (c) => c.status === 'Provided' || c.status === 'Clinician verified'
      ).length;
      const newScore = Math.min(
        100,
        Math.round((satisfied / Math.max(updated.length, 1)) * 100)
      );
      return {
        ...prev,
        completeness: newScore,
        analysis: {
          ...prev.analysis,
          completenessScore: newScore,
          checklist: updated,
          missingItems: updated.filter((c) => c.status === 'Missing').map((c) => c.requirement),
        },
        timeline: [
          ...prev.timeline,
          {
            id: `tl-sp-ver-${Date.now()}`,
            title: 'Specialist verified documentation item',
            description: 'Intake checklist requirement verified by specialist clinic.',
            timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
            actor: prev.specialistName,
            stage: 'reviewed',
          },
        ],
      };
    });
    showToast('Checklist item verified.');
  };

  const handleClarificationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!missingInfo.trim() || !clarifyReason.trim()) return;
    requestClarification(referral.id, {
      missingInformation: missingInfo,
      reason: clarifyReason,
      notes: clarifyNotes,
    });
    setMissingInfo('');
    setClarifyReason('');
    setClarifyNotes('');
    setActiveActionPanel('none');
  };

  const handleDeclineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await declineReferral(referral.id, {
      reasonCategory: declineCategory,
      notes: declineNotes,
    });
    setDeclineNotes('');
    setActiveActionPanel('none');
  };

  const handleAppointmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (offerEConsult) {
      await proposeEConsultation(referral.id, {
        proposedDate: apptDate,
        proposedTime: apptTime,
        consultationReason: eConsultReason.trim() || referral.clinicalInput.reasonForReferral,
        specialistMessage: eConsultMessage.trim(),
        isEConsultation: true,
      });
    } else {
      confirmReferralAppointment(referral.id, {
        date: apptDate,
        time: apptTime,
        mode: 'In-Person',
        location:
          apptLocation.trim() ||
          (specialist ? `${specialist.clinic} — ${specialist.address}` : referral.receivingClinic),
        instructions: apptInstructions,
      });
    }
    setActiveActionPanel('none');
  };

  const handleProposeInPersonForPatientApproval = async () => {
    await proposeEConsultation(referral.id, {
      proposedDate: apptDate,
      proposedTime: apptTime,
      consultationReason: eConsultReason.trim() || referral.clinicalInput.reasonForReferral,
      specialistMessage:
        eConsultMessage.trim() ||
        `Proposed in-person consultation at ${apptLocation || referral.receivingClinic}. Please confirm availability.`,
      isEConsultation: false,
    });
    setActiveActionPanel('none');
  };

  const canAccept =
    unlocked &&
    referral.status !== 'Accepted' &&
    referral.status !== 'Appointment Confirmed' &&
    referral.status !== 'E-Consultation Confirmed' &&
    referral.status !== 'Appointment Proposed' &&
    referral.status !== 'E-Consultation Awaiting Patient Approval' &&
    referral.status !== 'Reschedule Requested' &&
    referral.status !== 'Completed' &&
    referral.status !== 'Declined';

  const handleAcceptPatientSuggestedTime = async () => {
    setSubmittingRescheduleAction(true);
    try {
      await respondToRescheduleRequest(referral.id, { action: 'AcceptSuggested' });
      setShowCounterProposeForm(false);
    } finally {
      setSubmittingRescheduleAction(false);
    }
  };

  const handleSubmitCounterProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!counterDate.trim() || !counterTime.trim()) return;
    setSubmittingRescheduleAction(true);
    try {
      await respondToRescheduleRequest(referral.id, {
        action: 'CounterPropose',
        proposedDate: counterDate.trim(),
        proposedTime: counterTime.trim(),
        specialistMessage: counterMessage.trim() || undefined,
      });
      setShowCounterProposeForm(false);
      setCounterMessage('');
    } finally {
      setSubmittingRescheduleAction(false);
    }
  };

  const referringContact = referral.referringPhysicianContact;
  const communications = referral.communications ?? [];
  const unreadBySpecialist = communications.filter((m) => !m.readBySpecialist).length;
  const physicianWrittenNotes = referral.consultationNotes?.physicianWritten;
  const approvedAiNotes = (referral.consultationNotes?.aiNotes ?? []).filter(
    (n) => n.reviewStatus === 'Approved'
  );

  const handleCopyPhone = async () => {
    try {
      await navigator.clipboard.writeText(referringContact.phone);
      showToast(`Copied ${referringContact.phone} to clipboard.`);
    } catch {
      showToast(`Referring clinic phone: ${referringContact.phone}`);
    }
  };

  const handleSendDirectMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!directMsgBody.trim()) return;
    sendReferralMessage(referral.id, {
      senderRole: 'specialist',
      subject: directMsgSubject,
      content: directMsgBody,
    });
    markReferralMessagesRead(referral.id, 'specialist');
    setDirectMsgSubject('');
    setDirectMsgBody('');
  };

  // Strict Stage 1 preview object (no PII)
  const stage1Preview = apiPreview ?? projectStage1AnonymousReferral(referral);

  return (
    <div className="space-y-6">
      {/* Top Navigation & Referral Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setActiveSection('specialist-inbox')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 self-start"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Referral Requests</span>
        </button>

        <div className="flex items-center gap-2">
          <label htmlFor="review-switcher" className="text-xs text-slate-500">
            Reviewing:
          </label>
          <select
            id="review-switcher"
            value={referral.id}
            onChange={(e) => {
              openSpecialistReview(e.target.value);
              setSelectedSourceId(null);
              setPreviewDoc(null);
              setActiveActionPanel('none');
            }}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-800"
          >
            {availableReferrals.map((r) => {
              const rUnlocked = isConfidentialityUnlocked(r);
              const labelName = rUnlocked
                ? r.patient.name
                : `Anonymous (${formatPatientAgeRange(r.patient.age, r.patient.dob)})`;
              return (
                <option key={r.id} value={r.id}>
                  {r.id} · {labelName} ({r.status})
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Role-Based Assignment 403 Guard */}
      {apiForbiddenError && (
        <section className="bg-rose-50 border border-rose-200 rounded-xl p-6 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-rose-950">
            <ShieldAlert className="w-5 h-5 text-rose-700 shrink-0" />
            <span>Role-Based Specialist Access Restriction (HTTP 403)</span>
          </div>
          <p className="text-sm text-rose-900">{apiForbiddenError}</p>
          <p className="text-xs text-rose-800">
            Active specialist queue filter is set to <strong>{actingSpecialist?.name ?? settings.specialistProfileId}</strong>, while this referral belongs to <strong>{referral.specialistName}</strong>. Switch Clinic Queue back to “All Receiving Clinics” or select {referral.specialistName} to review.
          </p>
        </section>
      )}

      {/* STAGE 1 & STAGE 2 PRIVACY-PROTECTED GATE */}
      {!apiForbiddenError && !unlocked && (
        <div className="space-y-6">
          {/* Stage 1 Banner & Summary Header */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="p-4 bg-indigo-50/80 border border-indigo-200 rounded-xl flex items-start gap-3">
              <Lock className="w-5 h-5 text-indigo-800 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-sm font-semibold text-indigo-950">
                  Stage 1: Anonymous Referral Request (Confidentiality Gate Active)
                </div>
                <p className="text-xs text-indigo-900 leading-relaxed">
                  {stage1Preview.privacyNotice}
                </p>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-5 border-b border-slate-100">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-slate-900">{stage1Preview.id}</span>
                  <span aria-hidden="true">·</span>
                  <UrgencyLabel urgency={stage1Preview.urgency} />
                  <span aria-hidden="true">·</span>
                  <span>Submitted {stage1Preview.referralDate}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Target: {stage1Preview.specialistName} ({stage1Preview.specialty})
                  </span>
                </div>
                <h1 className="font-display text-2xl font-bold text-slate-900 flex items-center gap-2">
                  <Lock className="w-5 h-5 text-slate-500" />
                  <span>Anonymous Patient · {stage1Preview.patientAgeLabel}</span>
                </h1>
                <p className="text-sm text-slate-700">{stage1Preview.reasonForReferral}</p>
              </div>

              <div className="flex flex-wrap items-center gap-5 shrink-0">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Current Status</div>
                  <StatusIndicator status={stage1Preview.status} />
                </div>
                <div className="h-8 w-px bg-slate-200 hidden sm:block" />
                <div>
                  <div className="text-xs text-slate-500 mb-1">Intake Completeness</div>
                  <CompletenessMeter value={stage1Preview.completeness} />
                </div>
              </div>
            </div>

            {/* Stage 1 Non-Identifying Clinical Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-sm">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="text-xs font-semibold text-slate-800 uppercase tracking-wide">
                  De-Identified Clinical Consultation Summary
                </div>
                <div>
                  <div className="text-xs text-slate-500">Patient Age / Range</div>
                  <div className="font-medium text-slate-900 mt-0.5">
                    {stage1Preview.patientAgeLabel}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Reason for Referral</div>
                  <div className="text-slate-900 mt-0.5">{stage1Preview.reasonForReferral}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Brief Consultation Summary</div>
                  <p className="text-slate-800 mt-0.5 leading-relaxed">
                    {stage1Preview.briefConsultationSummary}
                  </p>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Presenting Symptoms</div>
                  <p className="text-slate-800 mt-0.5 leading-relaxed">
                    {stage1Preview.symptoms}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="text-xs font-semibold text-slate-800 uppercase tracking-wide">
                  Diagnoses, History & Investigations (De-Identified)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                    <div className="text-[11px] font-semibold text-slate-600">
                      Confirmed Diagnoses
                    </div>
                    <div className="text-xs text-slate-900 mt-0.5">
                      {stage1Preview.confirmedDiagnoses}
                    </div>
                  </div>
                  <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                    <div className="text-[11px] font-semibold text-amber-800">
                      Preliminary / Suspected Diagnosis
                    </div>
                    <div className="text-xs text-slate-900 mt-0.5">
                      {stage1Preview.preliminaryOrSuspectedDiagnosis}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">De-Identified Medical History</div>
                  <p className="text-slate-800 mt-0.5 leading-relaxed">
                    {stage1Preview.deidentifiedMedicalHistory}
                  </p>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Investigations Summary</div>
                  <p className="text-slate-800 mt-0.5 leading-relaxed">
                    {stage1Preview.investigationsSummary}
                  </p>
                </div>
                <div className="pt-1 border-t border-slate-200 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Insurance Readiness: <strong>{stage1Preview.insuranceStatusSummary.availabilityStatus}</strong> ({stage1Preview.insuranceStatusSummary.coverageCategory})
                  </span>
                  <span className="text-slate-500">Policy / Health Card IDs withheld</span>
                </div>
              </div>
            </div>

            {stage1Preview.documentSummaries.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-700">
                  Redacted Supporting Record Previews ({stage1Preview.documentSummaries.length})
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {stage1Preview.documentSummaries.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1"
                    >
                      <div className="font-medium text-slate-900">{doc.name}</div>
                      <p className="text-slate-600 leading-relaxed">{doc.redactedExcerpt}…</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* STAGE 2: SPECIALIST CONFIDENTIALITY AGREEMENT CHECKPOINT */}
          <section className="bg-white border-2 border-[#0F2942] rounded-xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-6 h-6 text-[#0F2942] shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Stage 2: Specialist Confidentiality Agreement
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Accepting this agreement unlocks full identifiable patient details and records for review. Unlocking does NOT accept or decline the referral.
                  </p>
                </div>
              </div>
            </div>

            <blockquote className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 leading-relaxed font-medium">
              “{CONFIDENTIALITY_AGREEMENT_TEXT}”
            </blockquote>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50/70 border border-slate-200 rounded-lg p-3.5">
              <div>
                <div className="text-slate-500">Authorizing Specialist</div>
                <div className="font-semibold text-slate-900 mt-0.5">
                  {actingSpecialist?.name ?? referral.specialistName}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Professional License / ID</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {professionalId}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Audit Timestamp</div>
                <div className="font-mono text-slate-700 mt-0.5 tabular-nums">
                  {new Date().toISOString().slice(0, 16).replace('T', ' ')}
                </div>
              </div>
            </div>

            <label className="flex items-start gap-3 p-3.5 bg-teal-50/50 border border-teal-200 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={agreementChecked}
                onChange={(e) => setAgreementChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-[#0F2942] rounded border-slate-300"
              />
              <span className="text-xs sm:text-sm font-medium text-slate-900">
                I confirm and accept the Specialist Confidentiality Agreement statement above, and understand my access will be recorded in the referral audit log.
              </span>
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <span className="text-xs text-slate-500">
                After unlocking, you will choose separately whether to Accept or Decline this referral.
              </span>
              <button
                type="button"
                disabled={!agreementChecked || unlocking}
                onClick={() => void handleAcceptConfidentiality()}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0F2942] hover:bg-[#173A5C] disabled:opacity-45 rounded-lg inline-flex items-center gap-2 transition-colors"
              >
                <LockOpen className="w-4 h-4" />
                <span>
                  {unlocking
                    ? 'Recording Agreement & Unlocking...'
                    : 'Accept & Unlock Patient Information'}
                </span>
              </button>
            </div>
          </section>

          <AuditLogPanel entries={referral.auditLog} />
        </div>
      )}

      {/* STAGE 3: FULL UNLOCKED REFERRAL REVIEW & SEPARATE DECISION */}
      {!apiForbiddenError && unlocked && (() => {
        const insVerif =
          referral.insurance?.verificationStatus ??
          getInsuranceVerificationStatus(referral.insurance);
        const hasOpenInsReq = Boolean(
          referral.insurance?.specialistRequest && !referral.insurance.specialistRequest.resolved
        );
        const sec1StatusKind: AccordionStatusKind = hasOpenInsReq
          ? 'warning'
          : insVerif === 'Verified'
            ? 'complete'
            : insVerif === 'Missing'
              ? 'missing'
              : 'warning';
        const sec1StatusLabel = hasOpenInsReq
          ? 'Insurance Info Requested'
          : `Insurance: ${insVerif}`;

        const clinicalMissingCount = [
          referral.clinicalInput.presentingSymptoms,
          referral.clinicalInput.clinicalHistory,
          referral.clinicalInput.currentMedications,
          referral.clinicalInput.previousTreatments,
          referral.clinicalInput.examinationFindings,
        ].filter((v) => !v.trim()).length;
        const sec2StatusKind: AccordionStatusKind =
          clinicalMissingCount === 0 ? 'complete' : 'partial';
        const sec2StatusLabel =
          clinicalMissingCount === 0
            ? 'All clinical fields present'
            : `${clinicalMissingCount} field${clinicalMissingCount === 1 ? '' : 's'} missing`;

        const notesCount = (physicianWrittenNotes ? 1 : 0) + approvedAiNotes.length;
        const sec3StatusKind: AccordionStatusKind = notesCount > 0 ? 'complete' : 'warning';
        const sec3StatusLabel =
          notesCount > 0
            ? `${notesCount} clinical note source${notesCount === 1 ? '' : 's'}`
            : 'No consultation notes';

        const openClarifications = (referral.clarificationThread ?? []).filter(
          (c) => c.status !== 'Responded'
        ).length;
        const sec4StatusKind: AccordionStatusKind =
          openClarifications > 0 || unreadBySpecialist > 0 ? 'warning' : 'complete';
        const sec4StatusLabel =
          unreadBySpecialist > 0
            ? `${unreadBySpecialist} unread message${unreadBySpecialist === 1 ? '' : 's'}`
            : openClarifications > 0
              ? `${openClarifications} open clarification`
              : `${communications.length} message${communications.length === 1 ? '' : 's'}`;

        const missingDocsCount = referral.analysis.missingItems.length;
        const sec5StatusKind: AccordionStatusKind =
          missingDocsCount > 0 ? 'missing' : 'complete';
        const sec5StatusLabel =
          missingDocsCount > 0
            ? `${referral.completeness}% · ${missingDocsCount} missing`
            : `${referral.completeness}% · ${referral.documents.length} file${referral.documents.length === 1 ? '' : 's'}`;

        const isRescheduleRequested =
          referral.status === 'Reschedule Requested' ||
          referral.eConsultation?.patientStatus === 'Reschedule Requested';
        const sec6StatusKind: AccordionStatusKind = isRescheduleRequested
          ? 'warning'
          : referral.status === 'Appointment Confirmed' ||
              referral.status === 'E-Consultation Confirmed' ||
              referral.status === 'Accepted' ||
              referral.status === 'Completed'
            ? 'complete'
            : referral.status === 'Declined'
              ? 'missing'
              : 'info';

        return (
        <div className="space-y-4">
          {/* Confidentiality Verified Notice */}
          {referral.confidentialityAcknowledgement && (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-950">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  <strong>Stage 2 Confidentiality Agreement Accepted</strong> by{' '}
                  {referral.confidentialityAcknowledgement.specialistName} (
                  <span className="font-mono">
                    {referral.confidentialityAcknowledgement.professionalId}
                  </span>
                  ) on{' '}
                  <span className="font-mono">
                    {referral.confidentialityAcknowledgement.acknowledgedAt}
                  </span>
                  .
                </span>
              </div>
              <span className="text-emerald-800 font-medium">
                {referral.status === 'Awaiting Specialist Decision'
                  ? 'Awaiting Separate Accept / Decline Decision'
                  : 'Full Clinical Access Active'}
              </span>
            </div>
          )}

          {/* Reschedule Requested Urgent Alert Banner */}
          {isRescheduleRequested && referral.eConsultation?.rescheduleRequest && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 text-xs text-amber-950">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-sm">
                    Patient Requested E-Consultation Reschedule
                  </div>
                  <p className="mt-0.5 text-amber-900">
                    Suggested:{' '}
                    <span className="font-mono font-semibold tabular-nums">
                      {referral.eConsultation.rescheduleRequest.suggestedDate} at{' '}
                      {referral.eConsultation.rescheduleRequest.suggestedTime}
                    </span>
                    {referral.eConsultation.rescheduleRequest.message
                      ? ` — “${referral.eConsultation.rescheduleRequest.message}”`
                      : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpenSections((prev) => ({ ...prev, sec6: true }))}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg whitespace-nowrap self-start sm:self-center"
              >
                Respond in Section 6 ↓
              </button>
            </div>
          )}

          {/* Header Summary Card + Accordion Controls */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-slate-900">{referral.id}</span>
                  <span aria-hidden="true">·</span>
                  <UrgencyLabel urgency={referral.urgency} />
                  <span aria-hidden="true">·</span>
                  <span>Submitted {referral.referralDate}</span>
                  <span aria-hidden="true">·</span>
                  <span>From {referral.referringPhysician}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Target: {referral.specialistName} ({referral.specialty})
                  </span>
                </div>
                <h1 className="font-display text-2xl font-bold text-slate-900">
                  {referral.patient.name}
                </h1>
                <p className="text-sm text-slate-700">
                  {referral.clinicalInput.reasonForReferral}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-5 shrink-0">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Current Status</div>
                  <StatusIndicator status={referral.status} />
                </div>
                <div className="h-8 w-px bg-slate-200 hidden sm:block" />
                <div>
                  <div className="text-xs text-slate-500 mb-1">Intake Completeness</div>
                  <CompletenessMeter value={referral.completeness} />
                </div>
              </div>
            </div>

            {/* Section Jump Navigation & Expand/Collapse Controls */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { key: 'sec1', label: '1. Patient & Insurance' },
                    { key: 'sec2', label: '2. Clinical Info' },
                    { key: 'sec3', label: '3. Consultation Notes' },
                    { key: 'sec4', label: '4. Referral & Messaging' },
                    { key: 'sec5', label: '5. Investigations & Docs' },
                    { key: 'sec6', label: '6. Decision & E-Consult' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setOpenSections((prev) => ({ ...prev, [item.key]: true }));
                      document
                        .getElementById(`specialist-${item.key}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      openSections[item.key]
                        ? 'bg-slate-100 border-slate-300 text-slate-900 font-medium'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setAllSections(true)}
                  className="text-[#0F2942] hover:underline font-medium"
                >
                  Expand All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => setAllSections(false)}
                  className="text-slate-600 hover:underline font-medium"
                >
                  Collapse All
                </button>
              </div>
            </div>
          </section>

          {/* SECTION 1: Patient Information (with embedded Medical Insurance Information) */}
          <AccordionSection
            id="specialist-sec1"
            title="1. Patient Information"
            subtitle="Unlocked patient demographics, contact details, appointment status, and medical insurance coverage"
            isOpen={openSections.sec1}
            onToggle={() => toggleSection('sec1')}
            statusKind={sec1StatusKind}
            statusLabel={sec1StatusLabel}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-500">Patient Name</div>
                <div className="font-medium text-slate-900 mt-0.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#0F2942] shrink-0" />
                  <span>{referral.patient.name}</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Date of Birth / Patient ID</div>
                <div className="font-mono text-xs text-slate-800 mt-1 tabular-nums">
                  {referral.patient.dob}
                  {typeof referral.patient.age === 'number' ? ` (Age ${referral.patient.age})` : ''} ·{' '}
                  {referral.patient.id}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Authorized Contact & Health Card</div>
                <div className="text-xs text-slate-700 mt-0.5">{referral.patient.phone}</div>
                <div className="text-xs text-slate-500">{referral.patient.email}</div>
                {referral.patient.address && (
                  <div className="text-xs text-slate-500 mt-0.5">{referral.patient.address}</div>
                )}
                {referral.patient.healthCardNumber && (
                  <div className="text-xs font-mono text-slate-700 mt-0.5">
                    Health Card: {referral.patient.healthCardNumber}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs text-slate-500">Appointment / E-Consult Status</div>
                <div className="text-xs font-medium text-slate-800 mt-0.5">
                  {referral.confirmedAppointment
                    ? `${referral.confirmedAppointment.mode ?? 'In-Person'} · ${referral.confirmedAppointment.date} · ${referral.confirmedAppointment.time}`
                    : referral.eConsultation
                      ? `${referral.eConsultation.consultationMode} (${referral.eConsultation.patientStatus})`
                      : `Pending (${specialist?.estimatedWait ?? 'Wait estimate unavailable'})`}
                </div>
              </div>
            </div>

            {/* Medical Insurance Information embedded directly inside Patient Information */}
            <InsurancePanel
              embedded={true}
              insurance={referral.insurance}
              specialty={referral.specialty}
              clinicalInput={referral.clinicalInput}
              role="specialist"
              onRequestInsuranceInfo={(payload) => requestInsuranceInfo(referral.id, payload)}
            />
          </AccordionSection>

          {/* SECTION 2: Clinical Information */}
          <AccordionSection
            id="specialist-sec2"
            title="2. Clinical Information"
            subtitle="Medical background, diagnoses, symptoms, medications, allergies, treatments, and exam findings"
            isOpen={openSections.sec2}
            onToggle={() => toggleSection('sec2')}
            statusKind={sec2StatusKind}
            statusLabel={sec2StatusLabel}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-xs font-semibold text-slate-600 block">
                  Confirmed Diagnoses
                </span>
                <span className="text-sm text-slate-900 font-medium mt-1 block">
                  {referral.clinicalInput.confirmedDiagnoses || 'None documented'}
                </span>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-xs font-semibold text-amber-800 block">
                  Suspected / Working Diagnoses
                </span>
                <span className="text-sm text-slate-900 font-medium mt-1 block">
                  {referral.clinicalInput.suspectedDiagnoses || 'Not specified separately'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-1">
                <div className="text-xs font-semibold text-slate-600">Relevant Medical History</div>
                <p className="text-sm text-slate-900 leading-relaxed">
                  {[referral.patient.medicalBackground, referral.clinicalInput.clinicalHistory]
                    .filter(Boolean)
                    .join(' ') || 'Not provided in referral packet.'}
                </p>
              </div>
              <div className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-1">
                <div className="text-xs font-semibold text-slate-600">Presenting Symptoms</div>
                <p className="text-sm text-slate-900 leading-relaxed">
                  {referral.clinicalInput.presentingSymptoms || 'Not provided.'}
                </p>
              </div>
              <div className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-1">
                <div className="text-xs font-semibold text-slate-600">Current Medications</div>
                <p className="text-sm text-slate-900 leading-relaxed">
                  {referral.clinicalInput.currentMedications || 'Not provided.'}
                </p>
              </div>
              <div className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-1">
                <div className="text-xs font-semibold text-slate-600">Allergies & Adverse Reactions</div>
                <p className="text-sm text-slate-900 leading-relaxed">
                  {referral.clinicalInput.allergies || 'No known drug allergies documented (NKDA).'}
                </p>
              </div>
              <div className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">Previous Treatments</span>
                  {!referral.clinicalInput.previousTreatments.trim() && (
                    <span className="text-[11px] font-medium text-rose-700">Missing</span>
                  )}
                </div>
                <p
                  className={`text-sm leading-relaxed ${
                    !referral.clinicalInput.previousTreatments.trim()
                      ? 'text-rose-700'
                      : 'text-slate-900'
                  }`}
                >
                  {referral.clinicalInput.previousTreatments ||
                    'Not provided in referral packet.'}
                </p>
              </div>
              <div className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">Examination Findings</span>
                  {!referral.clinicalInput.examinationFindings.trim() && (
                    <span className="text-[11px] font-medium text-rose-700">Missing</span>
                  )}
                </div>
                <p
                  className={`text-sm leading-relaxed ${
                    !referral.clinicalInput.examinationFindings.trim()
                      ? 'text-rose-700'
                      : 'text-slate-900'
                  }`}
                >
                  {referral.clinicalInput.examinationFindings || 'Not provided.'}
                </p>
              </div>
            </div>

            {referral.clinicalInput.additionalNotes && (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                <div className="text-xs font-semibold text-slate-600 mb-1">
                  Additional Clinical Notes
                </div>
                <p className="text-slate-800">{referral.clinicalInput.additionalNotes}</p>
              </div>
            )}
          </AccordionSection>

          {/* SECTION 3: Consultation Notes */}
          <AccordionSection
            id="specialist-sec3"
            title="3. Consultation Notes"
            subtitle="Physician-entered consultation notes and physician-approved AI-generated consultation summaries"
            isOpen={openSections.sec3}
            onToggle={() => toggleSection('sec3')}
            statusKind={sec3StatusKind}
            statusLabel={sec3StatusLabel}
          >
            {!physicianWrittenNotes && approvedAiNotes.length === 0 ? (
              <p className="text-sm text-slate-500">
                No structured physician consultation notes or approved AI consultation notes were included with this referral.
              </p>
            ) : (
              <div className="space-y-6">
                {physicianWrittenNotes && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                      <span className="font-semibold text-[#0F2942]">
                        Physician-Entered Consultation Notes ({referringContact.physicianName})
                      </span>
                      {physicianWrittenNotes.lastSavedAt && (
                        <span className="font-mono text-slate-500 tabular-nums">
                          Saved {physicianWrittenNotes.lastSavedAt}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      {[
                        {
                          label: 'Reason for Consultation',
                          val: physicianWrittenNotes.reasonForConsultation,
                        },
                        {
                          label: 'Patient-Reported Symptoms',
                          val: physicianWrittenNotes.patientReportedSymptoms,
                        },
                        {
                          label: 'Relevant Medical History',
                          val: physicianWrittenNotes.relevantMedicalHistory,
                        },
                        {
                          label: 'Previous Treatments Discussed',
                          val: physicianWrittenNotes.previousTreatmentsDiscussed,
                        },
                        {
                          label: 'Physician Observations',
                          val: physicianWrittenNotes.physicianObservations,
                        },
                        {
                          label: 'Physician Assessment',
                          val: physicianWrittenNotes.physicianAssessment,
                        },
                        {
                          label: 'Treatment Plan & Next Steps',
                          val: physicianWrittenNotes.treatmentPlanAndNextSteps,
                        },
                        {
                          label: 'Follow-Up Instructions',
                          val: physicianWrittenNotes.followUpInstructions,
                        },
                      ]
                        .filter((item) => item.val.trim())
                        .map((item) => (
                          <div
                            key={item.label}
                            className="p-3 bg-slate-50 border border-slate-200 rounded-lg"
                          >
                            <div className="text-xs font-semibold text-slate-700 mb-0.5">
                              {item.label}
                            </div>
                            <p className="text-sm text-slate-900 leading-relaxed">{item.val}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {approvedAiNotes.map((note) => (
                  <div
                    key={note.id}
                    className="space-y-3 pt-2 border-t border-slate-100 first:border-t-0 first:pt-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-emerald-800 inline-flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                        <span>
                          Source: {note.sourceType}
                          {note.sourceFileName ? ` (${note.sourceFileName})` : ''} · Approved by{' '}
                          {note.reviewedBy || referringContact.physicianName}
                        </span>
                      </span>
                      {note.reviewedAt && (
                        <span className="font-mono text-slate-500 tabular-nums">
                          {note.reviewedAt}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      {[
                        {
                          label: 'Main Reason for Consultation',
                          val: note.structured.mainReasonForConsultation,
                        },
                        {
                          label: 'Patient-Reported Symptoms',
                          val: note.structured.patientReportedSymptoms,
                        },
                        {
                          label: 'Relevant Medical History',
                          val: note.structured.relevantMedicalHistory,
                        },
                        {
                          label: 'Previous Treatments Discussed',
                          val: note.structured.previousTreatmentsDiscussed,
                        },
                        {
                          label: 'Physician Observations',
                          val: note.structured.physicianObservations,
                        },
                        {
                          label: 'Physician Assessment',
                          val: note.structured.physicianAssessment,
                        },
                        {
                          label: 'Plan & Follow-Up Instructions',
                          val: note.structured.planAndFollowUpInstructions,
                        },
                        ...(note.structured.supportingReportFindings
                          ? [
                              {
                                label: 'Findings from Supporting Medical Reports',
                                val: note.structured.supportingReportFindings,
                              },
                            ]
                          : []),
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="p-3 bg-slate-50 border border-slate-200 rounded-lg"
                        >
                          <div className="text-xs font-semibold text-slate-700 mb-0.5">
                            {item.label}
                          </div>
                          <p className="text-sm text-slate-900 leading-relaxed">{item.val}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AccordionSection>

          {/* SECTION 4: Referral Details & Referring Physician Communication */}
          <AccordionSection
            id="specialist-sec4"
            title="4. Referral Details"
            subtitle="Referral metadata, clinical questions, referring physician contact, clarifications, and communication log"
            isOpen={openSections.sec4}
            onToggle={() => toggleSection('sec4')}
            statusKind={sec4StatusKind}
            statusLabel={sec4StatusLabel}
          >
            {/* Referral Metadata & Clinical Questions */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-slate-500">Referral ID & Date</div>
                  <div className="font-mono text-xs text-slate-800 mt-0.5 tabular-nums">
                    {referral.id} · {referral.referralDate}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Referring Physician</div>
                  <div className="font-medium text-slate-900 mt-0.5">
                    {referral.referringPhysician}
                  </div>
                  <div className="text-xs text-slate-500">{referral.referringClinic}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Receiving Specialist & Clinic</div>
                  <div className="font-medium text-slate-900 mt-0.5">
                    {referral.specialistName} ({referral.specialty}) · {referral.receivingClinic}
                  </div>
                </div>
              </div>
              {referral.clinicalInput.clinicalQuestionsForSpecialist && (
                <div className="pt-2 border-t border-slate-200">
                  <span className="text-xs font-semibold text-slate-600 block">
                    Clinical Questions for Specialist
                  </span>
                  <span className="text-sm text-slate-900 mt-0.5 block">
                    {referral.clinicalInput.clinicalQuestionsForSpecialist}
                  </span>
                </div>
              )}
            </div>

            {/* Clarification History */}
            {referral.clarificationThread && referral.clarificationThread.length > 0 && (
              <div className="border border-amber-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-amber-50/70 border-b border-amber-200 flex items-center justify-between">
                  <div className="text-xs font-semibold text-amber-950 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-700" />
                    <span>Clarification History ({referral.clarificationThread.length})</span>
                  </div>
                  <span className="text-xs text-amber-800">Synchronized with Physician View</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {referral.clarificationThread.map((clr) => (
                    <div key={clr.id} className="p-4 space-y-2.5 bg-white">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <span>
                          Requested by <strong className="text-slate-900">{clr.requestedBy}</strong>
                        </span>
                        <span className="font-mono tabular-nums">
                          {clr.requestedAt} · {clr.status}
                        </span>
                      </div>
                      <div className="text-sm text-slate-800">
                        <strong className="font-semibold">Missing / Unclear:</strong>{' '}
                        {clr.missingInformation}
                        <div className="text-xs text-slate-600 mt-1">
                          <strong>Reason:</strong> {clr.reason}
                          {clr.notes ? ` · ${clr.notes}` : ''}
                        </div>
                      </div>
                      {clr.physicianResponse ? (
                        <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-lg space-y-1">
                          <div className="flex items-center justify-between text-xs text-teal-900 font-semibold">
                            <span>Physician Response ({clr.physicianResponse.respondedBy})</span>
                            <span className="font-mono tabular-nums">
                              {clr.physicianResponse.respondedAt}
                            </span>
                          </div>
                          <p className="text-sm text-slate-900">
                            {clr.physicianResponse.responseText}
                          </p>
                          {clr.physicianResponse.attachedDocumentName && (
                            <div className="text-xs text-teal-800 font-medium">
                              Attached file: {clr.physicianResponse.attachedDocumentName}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs font-medium text-amber-800">
                          Awaiting response from {referral.referringPhysician} in Physician View.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contact Referring Physician & Direct Communication History */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
              <div className="xl:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div>
                    <h3 className="font-display text-sm font-semibold text-slate-900">
                      Contact Referring Physician
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Direct office contact & coordination messaging
                    </p>
                  </div>
                  <Phone className="w-4 h-4 text-[#0F2942]" />
                </div>

                <div className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-2 text-xs">
                  <div className="text-sm font-semibold text-slate-900">
                    {referringContact.physicianName}, {referringContact.credentials}
                  </div>
                  <div className="text-slate-700 font-medium">{referringContact.clinicName}</div>
                  <div className="text-slate-600">{referringContact.clinicAddress}</div>
                  <div className="pt-2 border-t border-slate-100 space-y-1 text-slate-700">
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="font-mono">{referringContact.phone}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>{referringContact.email}</span>
                    </div>
                    {referringContact.additionalContact && (
                      <div className="text-slate-500">{referringContact.additionalContact}</div>
                    )}
                  </div>

                  <div className="pt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopyPhone()}
                      className="px-2.5 py-1.5 text-xs font-medium text-[#0F2942] bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-md inline-flex items-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Phone</span>
                    </button>
                    <a
                      href={`mailto:${referringContact.email}?subject=${encodeURIComponent(
                        `MediBridge Referral ${referral.id} — ${referral.patient.name}`
                      )}`}
                      className="px-2.5 py-1.5 text-xs font-medium text-[#0F2942] bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-md inline-flex items-center gap-1"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Email Referring Office</span>
                    </a>
                  </div>
                </div>

                <form onSubmit={handleSendDirectMessage} className="space-y-2.5">
                  <div className="text-xs font-semibold text-slate-900">
                    Send In-Platform Message to {referringContact.physicianName}
                  </div>
                  <input
                    type="text"
                    value={directMsgSubject}
                    onChange={(e) => setDirectMsgSubject(e.target.value)}
                    placeholder="Subject (optional, e.g., Holter preference)"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
                  />
                  <textarea
                    rows={3}
                    required
                    value={directMsgBody}
                    onChange={(e) => setDirectMsgBody(e.target.value)}
                    placeholder="Send a direct clinical coordination message or follow-up question..."
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {referral.status !== 'Completed' && referral.status !== 'Declined' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveActionPanel('clarify');
                          setOpenSections((prev) => ({ ...prev, sec6: true }));
                        }}
                        className="text-xs font-medium text-amber-800 hover:underline"
                      >
                        Open formal clarification →
                      </button>
                    )}
                    <button
                      type="submit"
                      className="px-3.5 py-2 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg inline-flex items-center gap-1.5 ml-auto"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send Message</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Chronological Communication History */}
              <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-[#0F2942]" />
                      <span>Communication History ({communications.length})</span>
                      {unreadBySpecialist > 0 && (
                        <span className="text-xs font-semibold text-teal-700">
                          · {unreadBySpecialist} Unread
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Synchronized log of general messages, clarification requests, and physician replies
                    </p>
                  </div>
                  {unreadBySpecialist > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        markReferralMessagesRead(referral.id, 'specialist');
                        showToast('Marked physician messages as read.');
                      }}
                      className="text-xs font-medium text-teal-800 hover:underline shrink-0"
                    >
                      Mark All Read
                    </button>
                  )}
                </div>

                {communications.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No messages or clarification requests exchanged on this referral yet.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto">
                    {communications.map((msg) => (
                      <div
                        key={msg.id}
                        className={`p-4 space-y-1.5 ${
                          msg.senderRole === 'physician' ? 'bg-teal-50/30' : 'bg-white'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-900">
                            {msg.senderName} → {msg.recipientName}
                          </span>
                          <span className="font-mono text-slate-500 tabular-nums">
                            {msg.timestamp} ·{' '}
                            <span
                              className={`font-sans font-semibold ${
                                msg.readBySpecialist ? 'text-slate-400' : 'text-teal-700'
                              }`}
                            >
                              {msg.readBySpecialist ? 'Read' : 'Unread'}
                            </span>
                          </span>
                        </div>
                        <div className="text-xs flex flex-wrap items-center gap-2">
                          <span
                            className={`font-semibold ${
                              msg.messageType === 'Formal clarification request'
                                ? 'text-amber-800'
                                : msg.messageType === 'Clarification response'
                                  ? 'text-teal-800'
                                  : 'text-[#0F2942]'
                            }`}
                          >
                            [{msg.messageType}]
                          </span>
                          {msg.subject && (
                            <span className="font-semibold text-slate-800">{msg.subject}</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </p>
                        {msg.attachedDocumentName && (
                          <div className="text-xs text-teal-800 font-medium">
                            Attached file: {msg.attachedDocumentName}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </AccordionSection>

          {/* SECTION 5: Investigations and Documents */}
          <AccordionSection
            id="specialist-sec5"
            title="5. Investigations and Documents"
            subtitle="Relevant test summaries, attached medical documents, AI source traceability, and specialty intake checklist"
            isOpen={openSections.sec5}
            onToggle={() => toggleSection('sec5')}
            statusKind={sec5StatusKind}
            statusLabel={sec5StatusLabel}
          >
            {/* Investigations Text Summary */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-semibold text-slate-700">
                  Relevant Investigations Summary
                </span>
                <span
                  className={`text-xs font-medium ${
                    !referral.clinicalInput.investigations.trim()
                      ? 'text-rose-700'
                      : 'text-slate-500'
                  }`}
                >
                  {!referral.clinicalInput.investigations.trim()
                    ? 'Missing'
                    : referral.physicianApproved
                      ? 'Submitted by referring MD'
                      : 'AI-organized'}
                </span>
              </div>
              <p
                className={`text-sm leading-relaxed ${
                  !referral.clinicalInput.investigations.trim()
                    ? 'text-rose-700'
                    : 'text-slate-900'
                }`}
              >
                {referral.clinicalInput.investigations || 'Not provided.'}
              </p>
            </div>

            {/* AI-Organized Source Traceability + Supporting Docs */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
              <div className="xl:col-span-7 border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>Source-Traceable Clinical Extractions (click to verify origin)</span>
                  <span className="font-normal text-slate-500">AI vs. Clinician-verified</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {referral.analysis.extractedItems.map((item) => {
                    const active = selectedExtracted?.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedSourceId(item.id)}
                        className={`w-full text-left px-4 py-3 transition-colors block ${
                          active ? 'bg-slate-50' : 'hover:bg-slate-50/50'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-700">
                            {item.section} · {item.label}
                          </span>
                          <VerificationLabel state={item.verificationState} />
                        </div>
                        <p className="text-sm text-slate-900 mt-1">{item.value}</p>
                        <div className="text-xs text-slate-500 mt-1">
                          Source: {item.sourceLabel}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="xl:col-span-5 space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <div>
                      <h3 className="font-display text-sm font-semibold text-slate-900">
                        Source Traceability Inspector
                      </h3>
                      <p className="text-xs text-slate-500">
                        Verbatim excerpt for selected extraction
                      </p>
                    </div>
                    <SearchCode className="w-4 h-4 text-teal-700" />
                  </div>
                  {selectedExtracted ? (
                    <div className="space-y-2">
                      <div className="p-3 bg-white border border-slate-200 rounded-lg">
                        <div className="text-[11px] font-mono font-medium text-teal-800 mb-1">
                          {selectedExtracted.sourceLabel}
                        </div>
                        <blockquote className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                          “{selectedExtracted.sourceExcerpt}”
                        </blockquote>
                      </div>
                      <div className="text-xs text-slate-600">
                        {selectedExtracted.relevanceNote}
                      </div>
                    </div>
                  ) : null}
                  <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-500">
                    AI extraction does not constitute clinical verification. Review primary notes and attached files prior to triage decisions.
                  </div>
                </div>

                {/* Supporting Documentation */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
                    <h3 className="font-display text-sm font-semibold text-slate-900">
                      Supporting Documentation ({referral.documents.length})
                    </h3>
                  </div>

                  {referral.documents.length === 0 ? (
                    <p className="text-xs text-slate-500 py-2">
                      No supporting documents were attached to this referral.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {referral.documents.map((doc) => (
                        <div key={doc.id} className="py-2.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 truncate flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{doc.name}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5 tabular-nums">
                              {doc.sizeLabel} · Uploaded {doc.uploadedAt}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewDoc((curr) => (curr?.id === doc.id ? null : doc))
                            }
                            className="px-2.5 py-1 text-xs font-medium text-[#0F2942] bg-slate-100 hover:bg-slate-200 rounded-md inline-flex items-center gap-1 shrink-0"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{previewDoc?.id === doc.id ? 'Hide' : 'Preview'}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {previewDoc && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                      <div className="text-xs font-mono font-semibold text-slate-800">
                        Document Preview: {previewDoc.name}
                      </div>
                      <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                        {previewDoc.contentText}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Specialty Intake Checklist */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-[#0F2942]" />
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-900">
                    Documentation Completeness & {referral.specialty} Intake Checklist
                  </h3>
                </div>
              </div>

              <div className="px-4 py-3 bg-slate-50/70 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {coreCompletenessItems.map((item) => (
                  <div key={item.label} className="text-xs flex items-center gap-1.5">
                    {item.present ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                    )}
                    <span
                      className={item.present ? 'text-slate-800' : 'text-rose-700 font-medium'}
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="divide-y divide-slate-100">
                {referral.analysis.checklist.map((chk) => (
                  <div
                    key={chk.id}
                    className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">
                          {chk.requirement}
                        </span>
                        <ChecklistStatusIndicator status={chk.status} />
                      </div>
                      <p className="text-xs text-slate-600">{chk.details}</p>
                    </div>
                    {chk.status !== 'Clinician verified' && (
                      <button
                        type="button"
                        onClick={() => handleVerifyChecklistItem(chk.id)}
                        className="px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-md whitespace-nowrap self-start sm:self-center inline-flex items-center gap-1"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Verify</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </AccordionSection>

          {/* SECTION 6: Referral Review, Specialist Decision & E-Consultation Coordination */}
          <AccordionSection
            id="specialist-sec6"
            title="6. Referral Review, Decision & E-Consultation Coordination"
            subtitle="Triage actions, E-Consultation scheduling & reschedule responses, patient messaging, and shared timeline"
            isOpen={openSections.sec6}
            onToggle={() => toggleSection('sec6')}
            statusKind={sec6StatusKind}
            statusLabel={referral.status}
          >
            {/* Specialist Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>
                  Specialist triage decisions synchronize across Physician & Patient Views.
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canAccept && (
                  <button
                    type="button"
                    onClick={() => void acceptReferral(referral.id)}
                    className="px-3.5 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Accept Referral</span>
                  </button>
                )}

                {referral.status !== 'Completed' && referral.status !== 'Declined' && (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveActionPanel((curr) => (curr === 'clarify' ? 'none' : 'clarify'))
                    }
                    className="px-3.5 py-2 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <MessageSquarePlus className="w-4 h-4" />
                    <span>Request Clarification</span>
                  </button>
                )}

                {referral.status !== 'Declined' && referral.status !== 'Completed' && (
                  <button
                    type="button"
                    onClick={handleOpenAppointmentPanel}
                    className="px-3.5 py-2 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <CalendarCheck className="w-4 h-4" />
                    <span>
                      {referral.confirmedAppointment
                        ? 'Update Appointment'
                        : 'Schedule / Offer E-Consultation'}
                    </span>
                  </button>
                )}

                {(referral.status === 'Appointment Confirmed' ||
                  referral.status === 'E-Consultation Confirmed') && (
                  <button
                    type="button"
                    onClick={() =>
                      simulateStatusTransition(
                        referral.id,
                        'Completed',
                        `Consultation completed by ${referral.specialistName}.`
                      )
                    }
                    className="px-3.5 py-2 text-xs font-medium text-teal-900 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Mark Consultation Completed
                  </button>
                )}

                {referral.status !== 'Declined' && referral.status !== 'Completed' && (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveActionPanel((curr) => (curr === 'decline' ? 'none' : 'decline'))
                    }
                    className="px-3.5 py-2 text-xs font-medium text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Decline Referral</span>
                  </button>
                )}
              </div>
            </div>

            {/* Action Panel: Request Clarification */}
            {activeActionPanel === 'clarify' && (
              <form
                onSubmit={handleClarificationSubmit}
                className="p-5 bg-amber-50/60 border border-amber-200 rounded-xl space-y-4"
              >
                <div className="text-sm font-semibold text-amber-950">
                  Request Clarification from {referral.referringPhysician}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      What information is missing?
                    </label>
                    <input
                      type="text"
                      required
                      value={missingInfo}
                      onChange={(e) => setMissingInfo(e.target.value)}
                      placeholder="e.g., Previous conservative treatments & recent 12-lead ECG"
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Why is clarification required?
                    </label>
                    <input
                      type="text"
                      required
                      value={clarifyReason}
                      onChange={(e) => setClarifyReason(e.target.value)}
                      placeholder="e.g., Needed for clinic intake triage prior to scheduling"
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Additional notes for referring office
                  </label>
                  <textarea
                    rows={2}
                    value={clarifyNotes}
                    onChange={(e) => setClarifyNotes(e.target.value)}
                    placeholder="Optional administrative instructions..."
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveActionPanel('none')}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-medium text-white bg-amber-700 hover:bg-amber-800 rounded-lg"
                  >
                    Submit Clarification Request
                  </button>
                </div>
              </form>
            )}

            {/* Action Panel: Decline Referral */}
            {activeActionPanel === 'decline' && (
              <form
                onSubmit={handleDeclineSubmit}
                className="p-5 bg-rose-50/60 border border-rose-200 rounded-xl space-y-4"
              >
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-rose-950">
                    Decline Referral (Administrative Routing Decision)
                  </div>
                  <p className="text-xs text-rose-800">
                    Select an administrative reason to return this referral to the referring physician.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Reason for Decline
                    </label>
                    <select
                      value={declineCategory}
                      onChange={(e) =>
                        setDeclineCategory(e.target.value as DeclineReasonCategory)
                      }
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                    >
                      {DECLINE_REASONS.map((reason) => (
                        <option key={reason} value={reason}>
                          {reason}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Administrative Explanation (Required)
                    </label>
                    <input
                      type="text"
                      required
                      value={declineNotes}
                      onChange={(e) => setDeclineNotes(e.target.value)}
                      placeholder="Provide clear guidance for alternative clinic routing..."
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveActionPanel('none')}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-medium text-white bg-rose-700 hover:bg-rose-800 rounded-lg"
                  >
                    Confirm Administrative Decline
                  </button>
                </div>
              </form>
            )}

            {/* Action Panel: Schedule Consultation / Offer E-Consultation */}
            {activeActionPanel === 'appointment' && (
              <form
                onSubmit={handleAppointmentSubmit}
                className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">
                    Schedule Specialist Consultation
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-900 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={offerEConsult}
                      onChange={(e) => setOfferEConsult(e.target.checked)}
                      className="w-4 h-4 text-[#0F2942] rounded"
                    />
                    <Video className="w-3.5 h-3.5 text-indigo-700" />
                    <span>Offer E-Consultation (Patient Approval Required)</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Proposed / Appointment Date
                    </label>
                    <input
                      type="text"
                      required
                      value={apptDate}
                      onChange={(e) => setApptDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Proposed / Appointment Time
                    </label>
                    <input
                      type="text"
                      required
                      value={apptTime}
                      onChange={(e) => setApptTime(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {offerEConsult ? 'Consultation Mode' : 'Clinic Location'}
                    </label>
                    {offerEConsult ? (
                      <div className="px-3 py-2 text-sm bg-indigo-50/60 border border-indigo-200 rounded-lg text-indigo-950 font-medium">
                        MediBridge Online E-Consultation
                      </div>
                    ) : (
                      <input
                        type="text"
                        required
                        value={apptLocation}
                        onChange={(e) => setApptLocation(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                      />
                    )}
                  </div>
                </div>

                {offerEConsult ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        E-Consultation Reason
                      </label>
                      <input
                        type="text"
                        required
                        value={eConsultReason}
                        onChange={(e) => setEConsultReason(e.target.value)}
                        placeholder="e.g., Review echo/Holter results and symptom progression"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
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
                        placeholder="Brief message explaining why an online E-Consultation is offered..."
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Appointment Instructions for Patient
                    </label>
                    <input
                      type="text"
                      value={apptInstructions}
                      onChange={(e) => setApptInstructions(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveActionPanel('none')}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  {!offerEConsult && (
                    <button
                      type="button"
                      onClick={() => void handleProposeInPersonForPatientApproval()}
                      className="px-3.5 py-1.5 text-xs font-medium text-[#0F2942] bg-white border border-slate-300 hover:bg-slate-100 rounded-lg"
                    >
                      Propose Date for Patient Approval
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg"
                  >
                    {offerEConsult
                      ? 'Send E-Consultation Invitation to Patient'
                      : 'Save & Confirm In-Person Appointment'}
                  </button>
                </div>
              </form>
            )}

            {/* E-Consultation Proposal + Patient Reschedule Handling */}
            {referral.eConsultation && (
              <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-indigo-950">
                    <Video className="w-4 h-4 text-indigo-700 shrink-0" />
                    <span>
                      {referral.eConsultation.consultationMode} · Patient Status:{' '}
                      {referral.eConsultation.patientStatus}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-indigo-800 tabular-nums">
                    {referral.eConsultation.proposedDate} at {referral.eConsultation.proposedTime}
                  </span>
                </div>
                <p className="text-xs text-indigo-900">
                  <strong>Reason:</strong> {referral.eConsultation.consultationReason}
                  {referral.eConsultation.specialistMessage
                    ? ` · Message: “${referral.eConsultation.specialistMessage}”`
                    : ''}
                </p>

                {/* Reschedule Requested Card with Accept Proposed Time or Suggest Another Date & Time */}
                {isRescheduleRequested && referral.eConsultation.rescheduleRequest && (
                  <div className="p-4 bg-white border border-amber-300 rounded-xl space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-amber-950 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>Patient Requested Reschedule (Appointment Unconfirmed)</span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                        Requested {referral.eConsultation.rescheduleRequest.requestedAt}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-amber-50/60 border border-amber-200 rounded-lg p-3">
                      <div>
                        <div className="text-slate-500">Patient Suggested Date & Time</div>
                        <div className="font-mono font-semibold text-slate-900 text-sm mt-0.5 tabular-nums">
                          {referral.eConsultation.rescheduleRequest.suggestedDate} at{' '}
                          {referral.eConsultation.rescheduleRequest.suggestedTime}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">Patient Message</div>
                        <div className="text-slate-800 mt-0.5">
                          {referral.eConsultation.rescheduleRequest.message ||
                            'No additional message provided.'}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        disabled={submittingRescheduleAction}
                        onClick={() => void handleAcceptPatientSuggestedTime()}
                        className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Accept Proposed Time</span>
                      </button>
                      <button
                        type="button"
                        disabled={submittingRescheduleAction}
                        onClick={() => {
                          setShowCounterProposeForm((v) => !v);
                          if (!showCounterProposeForm && referral.eConsultation?.rescheduleRequest) {
                            setCounterDate(referral.eConsultation.rescheduleRequest.suggestedDate);
                            setCounterTime(referral.eConsultation.rescheduleRequest.suggestedTime);
                          }
                        }}
                        className="px-3.5 py-2 text-xs font-medium text-[#0F2942] bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg"
                      >
                        Suggest Another Date & Time
                      </button>
                    </div>

                    {showCounterProposeForm && (
                      <form
                        onSubmit={handleSubmitCounterProposal}
                        className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3"
                      >
                        <div className="text-xs font-semibold text-slate-900">
                          Propose Alternate E-Consultation Date & Time to Patient
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-700 mb-1">
                              New Proposed Date
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
                              New Proposed Time
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
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-700 mb-1">
                            Note to Patient (Optional)
                          </label>
                          <input
                            type="text"
                            value={counterMessage}
                            onChange={(e) => setCounterMessage(e.target.value)}
                            placeholder="Explain clinic availability or alternative slot..."
                            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setShowCounterProposeForm(false)}
                            className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={submittingRescheduleAction}
                            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg"
                          >
                            Send New Date & Time to Patient
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

                {referral.eConsultation.declineReason && (
                  <div className="text-xs text-rose-800 font-medium">
                    Patient note: {referral.eConsultation.declineReason}
                  </div>
                )}
              </div>
            )}

            {/* Secure Specialist–Patient Messaging */}
            {(referral.eConsultation || referral.confirmedAppointment) && (
              <SecurePatientMessagingPanel
                referral={referral}
                viewerRole="specialist"
                onSendMessage={(content) =>
                  sendEConsultationMessage(referral.id, 'specialist', content)
                }
                onMarkRead={() => markEConsultMessagesRead(referral.id, 'specialist')}
              />
            )}

            {/* Shared Chronological Referral Timeline */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3 mb-4">
                <History className="w-4 h-4 text-[#0F2942]" />
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Shared Referral Timeline
                </h3>
              </div>
              <div className="space-y-4">
                {referral.timeline.map((ev, idx) => (
                  <div key={ev.id} className="flex gap-3.5">
                    <div className="flex flex-col items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#0F2942] mt-1.5 shrink-0" />
                      {idx < referral.timeline.length - 1 && (
                        <div className="w-px flex-1 bg-slate-200 my-1" />
                      )}
                    </div>
                    <div className="pb-2 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900">{ev.title}</span>
                        <span className="font-mono text-xs text-slate-500 tabular-nums">
                          {ev.timestamp}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">{ev.description}</p>
                      <div className="text-[11px] text-slate-400 mt-0.5">Actor: {ev.actor}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </AccordionSection>

          {/* Privacy, Confidentiality & Access Audit Log */}
          <AuditLogPanel entries={referral.auditLog} />
        </div>
        );
      })()}
    </div>
  );
};
