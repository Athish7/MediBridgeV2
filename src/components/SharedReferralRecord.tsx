import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  FilePlus2,
  FileText,
  History,
  Info,
  Mail,
  MessageSquare,
  Phone,
  SearchCode,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { AccordionSection, type AccordionStatusKind } from './AccordionSection';
import { AuditLogPanel } from './AuditLogPanel';
import { ConsultationNotesPanel } from './ConsultationNotesPanel';
import { InsurancePanel } from './InsurancePanel';
import { SpecialistFinderPanel } from './SpecialistFinderPanel';
import {
  ChecklistStatusIndicator,
  CompletenessMeter,
  StatusIndicator,
  UrgencyLabel,
  VerificationLabel,
} from './StatusIndicator';
import { useClinBridge } from '../context/ClinBridgeContext';
import type { ReferringPhysicianContact, Referral } from '../types/clinbridge';
import { getInsuranceVerificationStatus } from '../utils/insuranceAdvisor';
import { analyzeReferralDeterministic } from '../utils/referralAnalyzer';

interface SharedReferralRecordProps {
  referral: Referral;
  onBack: () => void;
}

type RecordSectionKey = 'sec1' | 'sec2' | 'sec3' | 'sec4' | 'sec5' | 'sec6';

export const SharedReferralRecord: React.FC<SharedReferralRecordProps> = ({
  referral,
  onBack,
}) => {
  const {
    updateReferral,
    simulateStatusTransition,
    respondToClarification,
    sendReferralMessage,
    markReferralMessagesRead,
    openSpecialistReview,
    startNewReferral,
    setActiveSection,
    setPatientPortalReferralId,
    markDocumentsComplete,
    recordChecklistException,
    selectReferralSpecialist,
    updateInsuranceInfo,
    specialists,
    showToast,
  } = useClinBridge();

  const [openSections, setOpenSections] = useState<Record<RecordSectionKey, boolean>>({
    sec1: true,
    sec2: false,
    sec3: false,
    sec4:
      referral.status === 'Awaiting Specialist Selection' ||
      !referral.specialistId ||
      referral.status === 'Additional Information Requested' ||
      (referral.communications ?? []).some((m) => !m.readByPhysician),
    sec5: !referral.documentsComplete,
    sec6: true,
  });

  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(
    referral.analysis.extractedItems[0]?.id ?? null
  );
  const [showSpecialistFinder, setShowSpecialistFinder] = useState(
    () => referral.status === 'Awaiting Specialist Selection' || !referral.specialistId
  );
  const [docCompletionFeedback, setDocCompletionFeedback] = useState<{
    type: 'error' | 'success';
    message: string;
    unresolved?: string[];
  } | null>(null);
  const [exceptionItemId, setExceptionItemId] = useState<string | null>(null);
  const [exceptionReason, setExceptionReason] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const [editingContact, setEditingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState<ReferringPhysicianContact>(
    referral.referringPhysicianContact
  );

  const [showApptForm, setShowApptForm] = useState(false);
  const [apptDate, setApptDate] = useState('December 11, 2026');
  const [apptTime, setApptTime] = useState('09:45 AM');
  const [apptInstructions, setApptInstructions] = useState(
    'Please arrive 15 minutes early with photo ID and a current medication list.'
  );

  const [editingPatientNotes, setEditingPatientNotes] = useState(false);
  const [patientNotesDraft, setPatientNotesDraft] = useState(referral.patientNextSteps);

  const [clarificationReplyText, setClarificationReplyText] = useState('');
  const [clarificationAttachment, setClarificationAttachment] = useState<{
    name: string;
    contentText: string;
    sizeLabel: string;
  } | null>(null);

  const [msgSubject, setMsgSubject] = useState('');
  const [msgContent, setMsgContent] = useState('');

  useEffect(() => {
    setContactDraft(referral.referringPhysicianContact);
    setPatientNotesDraft(referral.patientNextSteps);
    setDocCompletionFeedback(null);
    setExceptionItemId(null);
    setShowSpecialistFinder(
      referral.status === 'Awaiting Specialist Selection' || !referral.specialistId
    );
  }, [
    referral.id,
    referral.status,
    referral.specialistId,
    referral.referringPhysicianContact,
    referral.patientNextSteps,
  ]);

  useEffect(() => {
    if (openSections.sec4 && (referral.communications ?? []).some((m) => !m.readByPhysician)) {
      markReferralMessagesRead(referral.id, 'physician');
    }
  }, [openSections.sec4, referral.id, referral.communications, markReferralMessagesRead]);

  const toggleSection = (key: RecordSectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allExpanded = Object.values(openSections).every(Boolean);
  const toggleAllSections = () => {
    const next = !allExpanded;
    setOpenSections({
      sec1: next,
      sec2: next,
      sec3: next,
      sec4: next,
      sec5: next,
      sec6: next,
    });
  };

  const specialist = specialists.find((s) => s.id === referral.specialistId);
  const communications = referral.communications ?? [];
  const unreadCount = communications.filter((m) => !m.readByPhysician).length;

  const selectedExtracted =
    referral.analysis.extractedItems.find((i) => i.id === selectedSourceId) ??
    referral.analysis.extractedItems[0];

  const verifyExtractedItem = (itemId: string) => {
    updateReferral(referral.id, (prev) => ({
      ...prev,
      analysis: {
        ...prev.analysis,
        extractedItems: prev.analysis.extractedItems.map((item) =>
          item.id === itemId ? { ...item, verificationState: 'Clinician verified' } : item
        ),
      },
    }));
    showToast('Clinical summary item marked as clinician verified.');
  };

  const saveEditedItem = (itemId: string) => {
    if (!editValue.trim()) return;
    updateReferral(referral.id, (prev) => ({
      ...prev,
      analysis: {
        ...prev.analysis,
        extractedItems: prev.analysis.extractedItems.map((item) =>
          item.id === itemId
            ? {
                ...item,
                value: editValue.trim(),
                verificationState: 'Clinician verified',
              }
            : item
        ),
      },
    }));
    setEditingItemId(null);
    showToast('Clinical item updated and verified.');
  };

  const verifyChecklistItem = (chkId: string) => {
    updateReferral(referral.id, (prev) => {
      const updatedChecklist = prev.analysis.checklist.map((c) =>
        c.id === chkId
          ? {
              ...c,
              status: 'Clinician verified' as const,
              details: 'Verified by referring physician in Shared Referral Record.',
            }
          : c
      );
      const providedOrVerified = updatedChecklist.filter(
        (c) => c.status === 'Provided' || c.status === 'Clinician verified'
      ).length;
      const newScore = Math.min(
        100,
        Math.round((providedOrVerified / Math.max(updatedChecklist.length, 1)) * 100)
      );
      const missingItems = updatedChecklist
        .filter((c) => c.status === 'Missing')
        .map((c) => c.requirement);

      return {
        ...prev,
        completeness: newScore,
        analysis: {
          ...prev.analysis,
          completenessScore: newScore,
          checklist: updatedChecklist,
          missingItems,
        },
        timeline: [
          ...prev.timeline,
          {
            id: `tl-chk-${Date.now()}`,
            title: 'Checklist requirement verified',
            description: `Clinician verified intake item.`,
            timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
            actor: prev.referringPhysician,
            stage: 'reviewed',
          },
        ],
      };
    });
    showToast('Checklist item verified and completeness updated.');
  };

  const handleAttachSupplementalDoc = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text =
        typeof reader.result === 'string' && reader.result.trim().length > 0
          ? reader.result.slice(0, 2000)
          : `Supplemental attachment uploaded: ${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB).`;

      updateReferral(referral.id, (prev) => {
        const newDoc = {
          id: `doc-sup-${Date.now()}`,
          name: file.name,
          type: file.type || 'text/plain',
          sizeLabel: `${Math.max(1, Math.round(file.size / 1024))} KB`,
          uploadedAt: new Date().toISOString().slice(0, 10),
          contentText: text,
        };
        const updatedChecklist = prev.analysis.checklist.map((c) =>
          c.status === 'Missing' || c.status === 'Needs clarification'
            ? {
                ...c,
                status: 'Provided' as const,
                details: `Supplemental record attached (${file.name}).`,
                sourceLabel: `Attachment: ${file.name}`,
                sourceExcerpt: text.slice(0, 220),
              }
            : c
        );
        const newScore = Math.min(100, Math.max(prev.completeness, 94));

        return {
          ...prev,
          documents: [...prev.documents, newDoc],
          completeness: newScore,
          analysis: {
            ...prev.analysis,
            completenessScore: newScore,
            checklist: updatedChecklist,
            missingItems: [],
            ambiguityFlags: prev.analysis.ambiguityFlags.map((a) => ({ ...a, resolved: true })),
          },
          timeline: [
            ...prev.timeline,
            {
              id: `tl-doc-${Date.now()}`,
              title: `Supplemental document attached: ${file.name}`,
              description: 'Missing intake documentation uploaded to shared record.',
              timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
              actor: prev.referringPhysician,
              stage: 'reviewed',
            },
          ],
        };
      });
      showToast(`Attached ${file.name} to shared referral record.`);
    };
    reader.readAsText(file);
  };

  const handleConfirmAppointmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    simulateStatusTransition(
      referral.id,
      'Appointment Confirmed',
      `Confirmed for ${apptDate} at ${apptTime}.`,
      {
        date: apptDate,
        time: apptTime,
        location: specialist ? `${specialist.clinic} — ${specialist.address}` : referral.receivingClinic,
        instructions: apptInstructions,
      }
    );
    setShowApptForm(false);
  };

  const openInPatientPortal = () => {
    setPatientPortalReferralId(referral.id);
    setActiveSection('patient-portal');
  };

  const handleRerunIntelligence = async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);
    let nextAnalysis = analyzeReferralDeterministic(
      referral.patient,
      referral.clinicalInput,
      specialist,
      referral.documents,
      referral.consultationNotes,
      referral.specialty
    );
    try {
      const res = await fetch('/api/referrals/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          patient: referral.patient,
          clinical: referral.clinicalInput,
          specialist,
          specialtyHint: referral.specialty,
          documents: referral.documents,
          consultationNotes: referral.consultationNotes,
          preferDeterministic: true,
        }),
      }).catch(() => null);
      if (res && res.ok) {
        nextAnalysis = await res.json();
      }
    } finally {
      window.clearTimeout(timeoutId);
    }

    updateReferral(referral.id, (prev) => ({
      ...prev,
      completeness: nextAnalysis.completenessScore,
      analysis: nextAnalysis,
      lastUpdated: new Date().toISOString().slice(0, 10),
    }));
    showToast('AI Referral Intelligence refreshed using physician-written & approved consultation notes.');
  };

  const handleSaveContact = (e: React.FormEvent) => {
    e.preventDefault();
    updateReferral(referral.id, (prev) => ({
      ...prev,
      referringPhysicianContact: contactDraft,
      referringPhysician: `${contactDraft.physicianName}, ${contactDraft.credentials}`,
      referringClinic: contactDraft.clinicName,
      lastUpdated: new Date().toISOString().slice(0, 10),
    }));
    setEditingContact(false);
    showToast('Referring physician contact information updated on shared referral.');
  };

  const handleSendPhysicianMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgContent.trim()) return;
    sendReferralMessage(referral.id, {
      senderRole: 'physician',
      subject: msgSubject,
      content: msgContent,
    });
    setMsgSubject('');
    setMsgContent('');
  };

  const insVerif =
    referral.insurance?.verificationStatus ??
    (referral.insurance ? getInsuranceVerificationStatus(referral.insurance) : 'Missing');
  const openInsReq = Boolean(
    referral.insurance?.specialistRequest && !referral.insurance.specialistRequest.resolved
  );

  const sec1Status: { kind: AccordionStatusKind; label: string } = openInsReq
    ? { kind: 'warning', label: 'Specialist requested insurance update' }
    : insVerif === 'Verified'
      ? { kind: 'complete', label: 'Verified · Insurance included' }
      : { kind: 'warning', label: `Insurance: ${insVerif}` };

  const missingClinicalFields = [
    !referral.clinicalInput.presentingSymptoms?.trim() && 'Symptoms',
    !referral.clinicalInput.currentMedications?.trim() && 'Medications',
    !referral.clinicalInput.allergies?.trim() && 'Allergies',
  ].filter(Boolean) as string[];

  const sec2Status: { kind: AccordionStatusKind; label: string } =
    missingClinicalFields.length === 0
      ? { kind: 'complete', label: 'Complete clinical profile' }
      : { kind: 'partial', label: `Missing: ${missingClinicalFields.join(', ')}` };

  const sec3Status: { kind: AccordionStatusKind; label: string } =
    referral.consultationNotes?.physicianWritten?.lastSavedAt ||
    (referral.consultationNotes?.aiNotes?.length ?? 0) > 0
      ? {
          kind: 'complete',
          label: `${referral.consultationNotes?.aiNotes?.length ?? 0} AI summary · Notes saved`,
        }
      : { kind: 'partial', label: 'Pending consultation notes' };

  const sec4Status: { kind: AccordionStatusKind; label: string } = !referral.specialistId
    ? { kind: 'missing', label: 'Specialist selection required' }
    : unreadCount > 0
      ? { kind: 'warning', label: `${unreadCount} unread clinic message(s)` }
      : { kind: 'complete', label: `${referral.specialistName} · ${referral.specialty}` };

  const unresolvedChecklistCount = referral.analysis.checklist.filter(
    (c) => c.status === 'Missing' || c.status === 'Needs clarification'
  ).length;
  const sec5Status: { kind: AccordionStatusKind; label: string } =
    unresolvedChecklistCount > 0
      ? {
          kind: 'missing',
          label: `${unresolvedChecklistCount} checklist item(s) unresolved · ${referral.documents.length} doc(s)`,
        }
      : {
          kind: 'complete',
          label: `${referral.documents.length} doc(s) · ${referral.completeness}% complete`,
        };

  const sec6Status: { kind: AccordionStatusKind; label: string } = {
    kind:
      referral.status === 'Completed' ||
      referral.status === 'Appointment Confirmed' ||
      referral.status === 'E-Consultation Confirmed' ||
      referral.status === 'Accepted'
        ? 'complete'
        : referral.status === 'Additional Information Requested' ||
            referral.status === 'Declined' ||
            referral.status === 'Reschedule Requested'
          ? 'warning'
          : 'info',
    label: referral.status,
  };

  return (
    <div className="space-y-5">
      {/* Top breadcrumb & actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 self-start"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Referrals</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleAllSections}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            {allExpanded ? 'Collapse All Sections' : 'Expand All Sections'}
          </button>
          {referral.status === 'Draft' && (
            <button
              type="button"
              onClick={() => startNewReferral({ draftId: referral.id })}
              className="px-3 py-1.5 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              <span>Edit Draft in Builder</span>
            </button>
          )}
          {referral.status !== 'Draft' &&
            referral.status !== 'Awaiting Specialist Selection' &&
            Boolean(referral.specialistId) && (
              <button
                type="button"
                onClick={() => openSpecialistReview(referral.id)}
                className="px-3 py-1.5 text-xs font-medium text-[#0F2942] bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Open in Specialist View</span>
              </button>
            )}
          <button
            type="button"
            onClick={openInPatientPortal}
            className="px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Preview in Patient Portal</span>
          </button>
        </div>
      </div>

      {/* Compact Referral Header Strip */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
              <span className="font-mono font-semibold text-slate-900">{referral.id}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">Submitted {referral.referralDate}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">Updated {referral.lastUpdated}</span>
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
              {referral.patient.name}
            </h1>
            <div className="text-xs sm:text-sm text-slate-600">
              {referral.specialty} → <span className="font-medium text-slate-800">{referral.specialistName}</span> ({referral.receivingClinic})
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 lg:text-right">
            <div>
              <div className="text-xs text-slate-500 mb-1">Status & Urgency</div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <StatusIndicator status={referral.status} />
                <span className="text-slate-300" aria-hidden="true">·</span>
                <UrgencyLabel urgency={referral.urgency} />
              </div>
              {referral.confidentialityAcknowledgement?.accepted ? (
                <div className="text-[11px] text-emerald-700 mt-1">
                  Stage 2 Unlocked by {referral.confidentialityAcknowledgement.specialistName}
                </div>
              ) : referral.status !== 'Draft' &&
                referral.status !== 'Awaiting Specialist Selection' &&
                referral.status !== 'Ready for submission' ? (
                <div className="text-[11px] text-slate-500 mt-1">
                  Stage 1 Privacy Lock Active until specialist accepts confidentiality
                </div>
              ) : null}
            </div>
            <div className="h-8 w-px bg-slate-200 hidden sm:block" />
            <div>
              <div className="text-xs text-slate-500 mb-1">Completeness</div>
              <CompletenessMeter value={referral.completeness} />
            </div>
          </div>
        </div>

        {/* Specialist Decline Notice */}
        {referral.declineDetails && (
          <div className="mt-4 p-4 bg-rose-50/70 border border-rose-200 rounded-lg space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-900">
              <XCircle className="w-4 h-4 text-rose-700 shrink-0" />
              <span>Referral Declined by Receiving Clinic · {referral.declineDetails.reasonCategory}</span>
            </div>
            <p className="text-xs text-rose-900">
              {referral.declineDetails.notes || 'No additional notes provided.'}
            </p>
            <div className="text-[11px] text-rose-700">
              Recorded by {referral.declineDetails.declinedBy} on {referral.declineDetails.declinedAt}
            </div>
          </div>
        )}

        {/* Open Clarification / Unread Message Alerts */}
        {unreadCount > 0 && !openSections.sec4 && (
          <div className="mt-4 p-3.5 bg-teal-50/80 border border-teal-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-teal-950">
              <MessageSquare className="w-4 h-4 text-teal-700 shrink-0" />
              <span>
                <strong>{unreadCount} unread specialist communication(s)</strong> on this referral record.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpenSections((prev) => ({ ...prev, sec4: true }))}
              className="px-3 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg self-start sm:self-auto"
            >
              Expand Referral Details & Reply
            </button>
          </div>
        )}
      </section>

      {/* ACCORDION 1: PATIENT INFORMATION (including Medical Insurance Information) */}
      <AccordionSection
        id="record-sec1"
        title="1. Patient Information"
        subtitle="Patient demographics, contact information, health card, referring physician contact, and medical insurance coverage."
        isOpen={openSections.sec1}
        onToggle={() => toggleSection('sec1')}
        statusKind={sec1Status.kind}
        statusLabel={sec1Status.label}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div>
            <div className="text-slate-500">Patient Full Name</div>
            <div className="text-sm font-semibold text-slate-900 mt-0.5">{referral.patient.name}</div>
          </div>
          <div>
            <div className="text-slate-500">Age & Date of Birth</div>
            <div className="font-mono text-slate-900 mt-0.5 tabular-nums">
              {typeof referral.patient.age === 'number' ? `Age ${referral.patient.age} · ` : ''}
              DOB {referral.patient.dob}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Patient ID & Health Card</div>
            <div className="font-mono text-slate-900 mt-0.5 tabular-nums">
              {referral.patient.id}
              {referral.patient.healthCardNumber ? ` · ${referral.patient.healthCardNumber}` : ''}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Phone & Email</div>
            <div className="text-slate-800 mt-0.5">
              {referral.patient.phone} · {referral.patient.email}
            </div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-slate-500">Residential Address</div>
            <div className="text-slate-800 mt-0.5">
              {referral.patient.address || 'Not recorded'}
            </div>
          </div>
        </div>

        {/* Referring Physician Contact */}
        <div className="pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-xs font-semibold text-slate-900">
              Referring Physician Contact Information
            </h3>
            <button
              type="button"
              onClick={() => setEditingContact((v) => !v)}
              className="text-xs font-medium text-[#0F2942] hover:underline"
            >
              {editingContact ? 'Cancel' : 'Edit Contact'}
            </button>
          </div>

          {!editingContact ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3.5">
              <div>
                <div className="font-semibold text-slate-900">{referral.referringPhysician}</div>
                <div className="text-slate-600">{referral.referringClinic}</div>
                <div className="text-slate-500 mt-0.5">
                  {referral.referringPhysicianContact.clinicAddress}
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>{referral.referringPhysicianContact.phone}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{referral.referringPhysicianContact.email}</span>
                </div>
              </div>
              <div className="text-slate-500">
                {referral.referringPhysicianContact.additionalContact || 'No fax/desk extension noted'}
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSaveContact}
              className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Physician Name</label>
                  <input
                    type="text"
                    required
                    value={contactDraft.physicianName}
                    onChange={(e) => setContactDraft({ ...contactDraft, physicianName: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Credentials</label>
                  <input
                    type="text"
                    value={contactDraft.credentials}
                    onChange={(e) => setContactDraft({ ...contactDraft, credentials: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Clinic Name</label>
                  <input
                    type="text"
                    required
                    value={contactDraft.clinicName}
                    onChange={(e) => setContactDraft({ ...contactDraft, clinicName: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Clinic Address</label>
                  <input
                    type="text"
                    value={contactDraft.clinicAddress}
                    onChange={(e) => setContactDraft({ ...contactDraft, clinicAddress: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Direct Phone</label>
                  <input
                    type="text"
                    required
                    value={contactDraft.phone}
                    onChange={(e) => setContactDraft({ ...contactDraft, phone: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Practice Email</label>
                  <input
                    type="email"
                    required
                    value={contactDraft.email}
                    onChange={(e) => setContactDraft({ ...contactDraft, email: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Additional Contact / Desk Extension / Fax
                  </label>
                  <input
                    type="text"
                    value={contactDraft.additionalContact ?? ''}
                    onChange={(e) =>
                      setContactDraft({ ...contactDraft, additionalContact: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingContact(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg"
                >
                  Save Contact Info
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Medical Insurance Information placed directly inside Patient Information */}
        <InsurancePanel
          insurance={referral.insurance}
          specialty={referral.specialty}
          clinicalInput={referral.clinicalInput}
          role="physician"
          embedded={true}
          onSaveInsurance={(nextIns) => updateInsuranceInfo(referral.id, nextIns)}
        />
      </AccordionSection>

      {/* ACCORDION 2: CLINICAL INFORMATION */}
      <AccordionSection
        id="record-sec2"
        title="2. Clinical Information"
        subtitle="Medical history, confirmed vs. suspected conditions, medications, allergies, symptoms, and physical exam."
        isOpen={openSections.sec2}
        onToggle={() => toggleSection('sec2')}
        statusKind={sec2Status.kind}
        statusLabel={sec2Status.label}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="font-semibold text-slate-700 mb-1">Medical Background</div>
            <p className="text-sm text-slate-800 leading-relaxed">
              {referral.patient.medicalBackground || 'Not provided'}
            </p>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="font-semibold text-slate-700 mb-1">Clinical History</div>
            <p className="text-sm text-slate-800 leading-relaxed">
              {referral.clinicalInput.clinicalHistory || 'Not provided'}
            </p>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="font-semibold text-slate-700 mb-1">Confirmed Diagnoses</div>
            <p className="text-sm text-slate-800 leading-relaxed">
              {referral.clinicalInput.confirmedDiagnoses || 'None documented'}
            </p>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="font-semibold text-slate-700 mb-1">Suspected / Preliminary Diagnoses</div>
            <p className="text-sm text-slate-800 leading-relaxed">
              {referral.clinicalInput.suspectedDiagnoses || 'None documented'}
            </p>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="font-semibold text-slate-700 mb-1">Current Medications</div>
            <p className="text-sm text-slate-800 leading-relaxed">
              {referral.clinicalInput.currentMedications || 'None listed'}
            </p>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="font-semibold text-slate-700 mb-1">Allergies & Drug Intolerances</div>
            <p className="text-sm text-slate-800 leading-relaxed">
              {referral.clinicalInput.allergies?.trim() || 'Not specified'}
            </p>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="font-semibold text-slate-700 mb-1">Presenting Symptoms</div>
            <p className="text-sm text-slate-800 leading-relaxed">
              {referral.clinicalInput.presentingSymptoms || 'Not provided'}
            </p>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="font-semibold text-slate-700 mb-1">Previous Treatments</div>
            <p className="text-sm text-slate-800 leading-relaxed">
              {referral.clinicalInput.previousTreatments || 'Not provided'}
            </p>
          </div>
          <div className="md:col-span-2 p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="font-semibold text-slate-700 mb-1">Examination Findings</div>
            <p className="text-sm text-slate-800 leading-relaxed">
              {referral.clinicalInput.examinationFindings || 'Not provided'}
            </p>
          </div>
        </div>
      </AccordionSection>

      {/* ACCORDION 3: CONSULTATION NOTES */}
      <AccordionSection
        id="record-sec3"
        title="3. Consultation Notes"
        subtitle="Physician-written consultation notes and AI-generated clinical summaries."
        isOpen={openSections.sec3}
        onToggle={() => toggleSection('sec3')}
        statusKind={sec3Status.kind}
        statusLabel={sec3Status.label}
      >
        {referral.clinicalInput.referralSummary && (
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
            <div className="font-semibold text-slate-800 mb-1">
              Concise Referral Summary (Stage 1 Triage Preview)
            </div>
            <p className="text-sm text-slate-800 leading-relaxed">
              {referral.clinicalInput.referralSummary}
            </p>
          </div>
        )}

        <ConsultationNotesPanel
          value={referral.consultationNotes ?? { aiNotes: [] }}
          specialty={referral.specialty}
          physicianName={referral.referringPhysician}
          patient={referral.patient}
          clinicalInput={referral.clinicalInput}
          documents={referral.documents}
          onChange={(nextBundle) => {
            updateReferral(referral.id, (prev) => ({
              ...prev,
              consultationNotes: nextBundle,
              lastUpdated: new Date().toISOString().slice(0, 10),
            }));
          }}
          onRerunIntelligence={() => void handleRerunIntelligence()}
          showToast={showToast}
        />
      </AccordionSection>

      {/* ACCORDION 4: REFERRAL DETAILS */}
      <AccordionSection
        id="record-sec4"
        title="4. Referral Details"
        subtitle="Referral reason, urgency, specialist destination (AI Find Specialist), clinical questions, and specialist communication."
        isOpen={openSections.sec4}
        onToggle={() => toggleSection('sec4')}
        statusKind={sec4Status.kind}
        statusLabel={sec4Status.label}
      >
        {/* Referral Reason & Destination Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="sm:col-span-2 p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="font-semibold text-slate-700 mb-1">Reason for Referral</div>
            <p className="text-sm text-slate-900">{referral.clinicalInput.reasonForReferral}</p>
            {referral.clinicalInput.clinicalQuestionsForSpecialist && (
              <p className="text-xs text-slate-600 mt-1.5">
                <strong>Questions:</strong> {referral.clinicalInput.clinicalQuestionsForSpecialist}
              </p>
            )}
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-700">Receiving Specialist</span>
              {referral.status !== 'Completed' && referral.status !== 'Declined' && (
                <button
                  type="button"
                  onClick={() => setShowSpecialistFinder((v) => !v)}
                  className="text-[11px] font-semibold text-teal-800 hover:underline inline-flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>{showSpecialistFinder ? 'Hide AI Finder' : 'AI Find Specialist'}</span>
                </button>
              )}
            </div>
            <div className="text-sm font-semibold text-slate-900">{referral.specialistName}</div>
            <div className="text-slate-600">
              {referral.specialty} · {referral.receivingClinic}
            </div>
            <div className="text-slate-500">
              {specialist?.estimatedWait ?? 'Wait time pending clinic confirmation'}
            </div>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
            <div className="font-semibold text-slate-700">Urgency & Notes</div>
            <div>
              <UrgencyLabel urgency={referral.urgency} />
            </div>
            <p className="text-slate-600 mt-1">
              {referral.clinicalInput.additionalNotes || 'No additional coordination notes.'}
            </p>
          </div>
        </div>

        {/* Callout Banner for Referrals Awaiting Specialist Selection */}
        {(referral.status === 'Awaiting Specialist Selection' || !referral.specialistId) && (
          <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-indigo-950 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-700 shrink-0" />
                <span>Specialist Selection Required Before Submission</span>
              </div>
              <p className="text-xs text-indigo-900 leading-relaxed">
                This referral already includes physician-written notes, AI-generated consultation notes, and supporting medical reports. Use <strong>AI Find Specialist</strong> below to compare clinics and confirm your destination.
              </p>
            </div>
            {!showSpecialistFinder && (
              <button
                type="button"
                onClick={() => setShowSpecialistFinder(true)}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-auto"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Find Specialist</span>
              </button>
            )}
          </div>
        )}

        {/* Inline AI Specialist Matching Panel */}
        {showSpecialistFinder && (
          <div className="pt-2">
            <SpecialistFinderPanel
              patient={referral.patient}
              clinical={referral.clinicalInput}
              consultationNotes={referral.consultationNotes}
              documents={referral.documents}
              specialists={specialists}
              selectedSpecialistId={referral.specialistId}
              initialBundle={referral.aiSpecialistRecommendations}
              currentSpecialtyHint={referral.specialty}
              onSelectSpecialist={(spId, bundle) => {
                selectReferralSpecialist(referral.id, spId, bundle);
                setShowSpecialistFinder(false);
              }}
            />
          </div>
        )}

        {/* Clarification Requests & Physician Response Thread */}
        {referral.clarificationThread && referral.clarificationThread.length > 0 && (
          <div className="border border-amber-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-amber-50/70 border-b border-amber-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Specialist Clarification Communication ({referral.clarificationThread.length})</span>
              </div>
              <span className="text-xs text-amber-800">
                Shared between Physician & Specialist Views
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {referral.clarificationThread.map((entry) => (
                <div key={entry.id} className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span>
                      Requested by <strong className="text-slate-900">{entry.requestedBy}</strong>
                    </span>
                    <span className="font-mono tabular-nums">
                      {entry.requestedAt} · {entry.status === 'Open' ? 'Awaiting physician response' : 'Responded'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div>
                      <div className="font-semibold text-slate-800">Missing / Unclear Information</div>
                      <div className="text-slate-700 mt-0.5">{entry.missingInformation}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800">Reason Clarification Required</div>
                      <div className="text-slate-700 mt-0.5">{entry.reason}</div>
                    </div>
                    {entry.notes && (
                      <div className="md:col-span-2 pt-2 border-t border-slate-200">
                        <span className="font-semibold text-slate-800">Additional Notes: </span>
                        <span className="text-slate-700">{entry.notes}</span>
                      </div>
                    )}
                  </div>

                  {entry.physicianResponse ? (
                    <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-lg space-y-1">
                      <div className="flex items-center justify-between text-xs text-teal-900">
                        <span className="font-semibold">
                          Physician Response ({entry.physicianResponse.respondedBy})
                        </span>
                        <span className="font-mono tabular-nums">
                          {entry.physicianResponse.respondedAt}
                        </span>
                      </div>
                      <p className="text-sm text-slate-800">{entry.physicianResponse.responseText}</p>
                      {entry.physicianResponse.attachedDocumentName && (
                        <div className="text-xs text-teal-800 font-medium pt-1">
                          Attached record: {entry.physicianResponse.attachedDocumentName}
                        </div>
                      )}
                    </div>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!clarificationReplyText.trim()) return;
                        respondToClarification(referral.id, {
                          clarificationId: entry.id,
                          responseText: clarificationReplyText,
                          attachedDoc: clarificationAttachment
                            ? {
                                id: `doc-clr-${Date.now()}`,
                                name: clarificationAttachment.name,
                                type: 'text/plain',
                                sizeLabel: clarificationAttachment.sizeLabel,
                                uploadedAt: new Date().toISOString().slice(0, 10),
                                contentText: clarificationAttachment.contentText,
                              }
                            : undefined,
                        });
                        setClarificationReplyText('');
                        setClarificationAttachment(null);
                      }}
                      className="space-y-3 pt-1"
                    >
                      <label className="block text-xs font-semibold text-slate-800">
                        Respond to Specialist Request
                      </label>
                      <textarea
                        rows={2}
                        required
                        value={clarificationReplyText}
                        onChange={(e) => setClarificationReplyText(e.target.value)}
                        placeholder="Confirm active medication dosage, clarify history, or note attached document..."
                        className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="cursor-pointer px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5">
                            <Upload className="w-3.5 h-3.5" />
                            <span>
                              {clarificationAttachment
                                ? `Attached: ${clarificationAttachment.name}`
                                : 'Attach Supporting File'}
                            </span>
                            <input
                              type="file"
                              accept=".txt,.pdf,.doc,.docx,.csv"
                              onChange={(ev) => {
                                const file = ev.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = () => {
                                  const text =
                                    typeof reader.result === 'string' && reader.result.trim()
                                      ? reader.result.slice(0, 2000)
                                      : `Clarification attachment: ${file.name}`;
                                  setClarificationAttachment({
                                    name: file.name,
                                    sizeLabel: `${Math.max(1, Math.round(file.size / 1024))} KB`,
                                    contentText: text,
                                  });
                                };
                                reader.readAsText(file);
                              }}
                              className="hidden"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setClarificationAttachment({
                                name: '12_Lead_ECG_Clarification.txt',
                                sizeLabel: '1.9 KB',
                                contentText:
                                  '12-Lead ECG (Nov 18, 2026): Normal sinus rhythm 72 bpm, normal intervals, no acute ST-T changes. Active Metoprolol tartrate confirmed at 50 mg BID.',
                              })
                            }
                            className="px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg"
                          >
                            + Attach Sample ECG Report
                          </button>
                        </div>

                        <button
                          type="submit"
                          className="px-4 py-1.5 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg inline-flex items-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Send Clarification Response</span>
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Direct Physician–Specialist Communication History */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 pt-2 border-t border-slate-100 items-start">
          <div className="xl:col-span-7 border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/70">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Physician–Specialist Communication ({communications.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Chronological messages between {referral.referringClinic} and {referral.receivingClinic}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  markReferralMessagesRead(referral.id, 'physician');
                  showToast('Marked specialist messages as read.');
                }}
                className="text-xs font-medium text-teal-800 hover:underline shrink-0"
              >
                Mark All Read
              </button>
            </div>

            {communications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No direct messages recorded yet on this referral.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {communications.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-4 space-y-1.5 ${
                      msg.senderRole === 'specialist' ? 'bg-slate-50/40' : 'bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-900">
                        {msg.senderName} ({msg.senderClinic}) → {msg.recipientName}
                      </span>
                      <span className="font-mono text-slate-500 tabular-nums">
                        {msg.timestamp}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-[#0F2942]">[{msg.messageType}]</span>
                      {msg.subject && <span className="font-medium text-slate-800">{msg.subject}</span>}
                    </div>
                    <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="xl:col-span-5 border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Send Message to {referral.specialistName}
            </h3>
            <form onSubmit={handleSendPhysicianMessage} className="space-y-2.5">
              <input
                type="text"
                value={msgSubject}
                onChange={(e) => setMsgSubject(e.target.value)}
                placeholder="Subject (optional)..."
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
              <textarea
                rows={3}
                required
                value={msgContent}
                onChange={(e) => setMsgContent(e.target.value)}
                placeholder="Write a coordination message or reply to the specialist..."
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg inline-flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Message to Specialist</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </AccordionSection>

      {/* ACCORDION 5: INVESTIGATIONS AND DOCUMENTS */}
      <AccordionSection
        id="record-sec5"
        title="5. Investigations and Documents"
        subtitle="Investigation summaries, uploaded documents, intake checklist verification, and AI source traceability."
        isOpen={openSections.sec5}
        onToggle={() => toggleSection('sec5')}
        statusKind={sec5Status.kind}
        statusLabel={sec5Status.label}
      >
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
          <div className="font-semibold text-slate-700 mb-1">Investigations & Lab Summary</div>
          <p className="text-sm text-slate-800 leading-relaxed">
            {referral.clinicalInput.investigations || 'No investigation summary recorded.'}
          </p>
        </div>

        {/* Checklist & Upload Control */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/70">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-[#0F2942]" />
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Specialty Intake Requirements Checklist ({referral.specialty})
                </h3>
                <p className="text-xs text-slate-500">
                  Evaluated against {referral.receivingClinic} guidelines
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer px-3 py-1.5 text-xs font-medium text-[#0F2942] bg-white border border-slate-200 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Missing Record</span>
                <input
                  type="file"
                  accept=".txt,.pdf,.doc,.docx,.csv"
                  onChange={(e) => {
                    setDocCompletionFeedback(null);
                    handleAttachSupplementalDoc(e);
                  }}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={() => {
                  const res = markDocumentsComplete(referral.id);
                  if (!res.ok) {
                    setDocCompletionFeedback({
                      type: 'error',
                      message:
                        'Cannot mark documents complete yet. Required checklist items are still missing or need clarification. Upload missing records, verify them, or record a physician-approved exception below.',
                      unresolved: res.unresolvedItems,
                    });
                  } else {
                    setDocCompletionFeedback({
                      type: 'success',
                      message:
                        'Supporting documents have been marked as collected. You can now continue preparing the referral.',
                    });
                  }
                }}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg inline-flex items-center gap-1.5 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Mark Documents Complete</span>
              </button>
            </div>
          </div>

          {referral.documentsComplete && !docCompletionFeedback && (
            <div className="px-4 py-2.5 bg-emerald-50/80 border-b border-emerald-200 flex items-center gap-2 text-xs text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                <strong>Supporting documents have been marked as collected</strong>
                {referral.documentsCompletedAt ? ` (${referral.documentsCompletedAt})` : ''}.
              </span>
            </div>
          )}

          {docCompletionFeedback && (
            <div
              className={`px-4 py-3 border-b text-xs space-y-1.5 ${
                docCompletionFeedback.type === 'error'
                  ? 'bg-rose-50/80 border-rose-200 text-rose-900'
                  : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
              }`}
            >
              <div className="font-semibold flex items-center gap-2">
                {docCompletionFeedback.type === 'error' ? (
                  <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                )}
                <span>{docCompletionFeedback.message}</span>
              </div>
              {docCompletionFeedback.unresolved && docCompletionFeedback.unresolved.length > 0 && (
                <ul className="list-disc list-inside pl-6 text-rose-800 space-y-0.5">
                  {docCompletionFeedback.unresolved.map((u) => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {referral.analysis.checklist.map((item) => {
              const isUnresolved =
                item.status === 'Missing' || item.status === 'Needs clarification';
              const isEditingException = exceptionItemId === item.id;
              return (
                <div key={item.id} className="p-4 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-sm font-medium text-slate-900">
                          {item.requirement}
                        </span>
                        <ChecklistStatusIndicator status={item.status} />
                      </div>
                      <p className="text-xs text-slate-600">{item.details}</p>
                      {item.sourceLabel && item.sourceExcerpt && (
                        <div className="text-xs text-slate-500 pt-0.5">
                          Matched in{' '}
                          <span className="font-medium text-slate-700">{item.sourceLabel}</span>: “
                          {item.sourceExcerpt}”
                        </div>
                      )}
                    </div>

                    {item.status !== 'Clinician verified' && (
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setDocCompletionFeedback(null);
                            verifyChecklistItem(item.id);
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap"
                        >
                          Mark Clinician Verified
                        </button>
                        {isUnresolved && (
                          <button
                            type="button"
                            onClick={() => {
                              setExceptionItemId(isEditingException ? null : item.id);
                              setExceptionReason('');
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                          >
                            Mark N/A / Exception
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {isEditingException && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!exceptionReason.trim()) return;
                        recordChecklistException(referral.id, item.id, exceptionReason);
                        setExceptionItemId(null);
                        setExceptionReason('');
                        setDocCompletionFeedback(null);
                      }}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row gap-2"
                    >
                      <input
                        type="text"
                        required
                        value={exceptionReason}
                        onChange={(e) => setExceptionReason(e.target.value)}
                        placeholder="Reason not applicable (e.g., No prior biopsy performed)..."
                        className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
                      />
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setExceptionItemId(null)}
                          className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-3 py-1.5 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg"
                        >
                          Save Exception
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Structured Clinical Summary + Source Traceability + Attached Documents */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          <div className="xl:col-span-7 border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/70">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  AI Structured Clinical Summary ({referral.analysis.extractedItems.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Click any entry to inspect its original source text
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleRerunIntelligence()}
                className="text-xs font-medium text-[#0F2942] hover:underline"
              >
                Re-run Analysis
              </button>
            </div>

            {referral.analysis.ambiguityFlags.some((a) => !a.resolved) && (
              <div className="px-4 py-3 bg-amber-50/80 border-b border-amber-200 space-y-2">
                {referral.analysis.ambiguityFlags
                  .filter((a) => !a.resolved)
                  .map((flag) => (
                    <div key={flag.id} className="flex items-start gap-2 text-xs">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-amber-900">{flag.title}</div>
                        <p className="text-amber-800 mt-0.5">{flag.description}</p>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            <div className="divide-y divide-slate-100">
              {referral.analysis.extractedItems.map((item) => {
                const isSelected = selectedExtracted?.id === item.id;
                const isEditing = editingItemId === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedSourceId(item.id)}
                    className={`p-4 cursor-pointer transition-colors ${
                      isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-slate-500">
                        <span className="font-medium text-slate-700">{item.section}</span>
                        <span aria-hidden="true" className="mx-1.5">·</span>
                        <span>{item.label}</span>
                      </div>
                      <VerificationLabel state={item.verificationState} />
                    </div>

                    {isEditing ? (
                      <div
                        className="mt-2 space-y-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0F2942]"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingItemId(null)}
                            className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEditedItem(item.id)}
                            className="px-3 py-1 text-xs font-medium text-white bg-[#0F2942] rounded-md"
                          >
                            Save & Verify
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-900 mt-1.5 leading-relaxed">
                        {item.value}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-slate-500">
                        Source: <span className="font-medium text-slate-700">{item.sourceLabel}</span>
                      </div>
                      {!isEditing && (
                        <div
                          className="flex items-center gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setEditingItemId(item.id);
                              setEditValue(item.value);
                            }}
                            className="text-xs font-medium text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          {item.verificationState !== 'Clinician verified' &&
                            item.verificationState !== 'Missing' && (
                              <button
                                type="button"
                                onClick={() => verifyExtractedItem(item.id)}
                                className="text-xs font-medium text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Verify</span>
                              </button>
                            )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="xl:col-span-5 space-y-4">
            <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-900">
                    Source Traceability Inspector
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Verbatim origin of selected summary item
                  </p>
                </div>
                <SearchCode className="w-4 h-4 text-teal-700" />
              </div>

              {selectedExtracted ? (
                <div className="space-y-2.5">
                  <div className="text-xs text-slate-500">
                    Selected:{' '}
                    <span className="font-medium text-slate-900">{selectedExtracted.label}</span>
                  </div>
                  <div className="p-3 bg-white border border-slate-200 rounded-lg">
                    <div className="text-[11px] font-mono font-medium text-teal-800 mb-1">
                      {selectedExtracted.sourceLabel}
                    </div>
                    <blockquote className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                      “{selectedExtracted.sourceExcerpt}”
                    </blockquote>
                  </div>
                  <div className="text-xs text-slate-600 leading-relaxed">
                    <span className="font-medium text-slate-800">Coordination relevance: </span>
                    {selectedExtracted.relevanceNote}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500 py-3">
                  Select any summary row to inspect its source text.
                </div>
              )}
            </div>

            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Supporting Documents ({referral.documents.length})
                </h3>
                <label className="cursor-pointer text-xs font-medium text-[#0F2942] hover:text-teal-700 inline-flex items-center gap-1">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Attach File</span>
                  <input
                    type="file"
                    accept=".txt,.pdf,.doc,.docx,.csv"
                    onChange={handleAttachSupplementalDoc}
                    className="hidden"
                  />
                </label>
              </div>
              {referral.documents.length === 0 ? (
                <p className="text-xs text-slate-500 py-1">No supporting documents attached yet.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {referral.documents.map((doc) => (
                    <div key={doc.id} className="py-2 space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-slate-900 inline-flex items-center gap-1.5 truncate">
                          <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{doc.name}</span>
                        </span>
                        <span className="font-mono text-slate-400 shrink-0">{doc.sizeLabel}</span>
                      </div>
                      <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 whitespace-pre-wrap">
                        {doc.contentText}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* ACCORDION 6: REFERRAL REVIEW AND SUBMISSION (Approval, Workflow, Appointments & Timeline) */}
      <AccordionSection
        id="record-sec6"
        title="6. Referral Review and Submission"
        subtitle="Physician approval & transmission actions, patient portal guidance, appointment / e-consultation status, and referral timeline."
        isOpen={openSections.sec6}
        onToggle={() => toggleSection('sec6')}
        statusKind={sec6Status.kind}
        statusLabel={sec6Status.label}
      >
        {/* Clinician Sign-Off & Demo Workflow Simulation Controls */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600 flex items-center gap-2">
            {referral.physicianApproved ? (
              <>
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Approved by {referral.referringPhysician}</span>
              </>
            ) : (
              <>
                <Info className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Pending referring physician approval & transmission</span>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {Boolean(referral.specialistId) &&
              (referral.status === 'Draft' || referral.status === 'Ready for submission') && (
                <button
                  type="button"
                  onClick={() => {
                    updateReferral(referral.id, (prev) => ({
                      ...prev,
                      physicianApproved: true,
                    }));
                    simulateStatusTransition(
                      referral.id,
                      'Submitted',
                      'Approved by referring physician and submitted to specialist clinic.'
                    );
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-[#0F2942] hover:bg-[#173A5C] text-white rounded-lg transition-colors"
                >
                  Approve & Submit Referral
                </button>
              )}
            {(referral.status === 'Submitted' ||
              referral.status === 'Awaiting Specialist Review' ||
              referral.status === 'Awaiting specialist review' ||
              referral.status === 'Anonymous Information Reviewed' ||
              referral.status === 'Awaiting Specialist Decision' ||
              referral.status === 'Additional Information Requested' ||
              referral.status === 'Clarification requested') && (
              <button
                type="button"
                onClick={() =>
                  simulateStatusTransition(
                    referral.id,
                    'Accepted',
                    `${referral.specialistName} reviewed and accepted the referral packet.`
                  )
                }
                className="px-2.5 py-1.5 text-xs font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-md transition-colors"
              >
                Simulate Clinic Acceptance
              </button>
            )}
            {Boolean(referral.specialistId) &&
              referral.status !== 'Awaiting Specialist Selection' &&
              referral.status !== 'Draft' &&
              referral.status !== 'Additional Information Requested' &&
              referral.status !== 'Clarification requested' &&
              referral.status !== 'Completed' && (
                <button
                  type="button"
                  onClick={() =>
                    simulateStatusTransition(
                      referral.id,
                      'Additional Information Requested',
                      'Receiving clinic requested clarification on pre-consultation records.'
                    )
                  }
                  className="px-2.5 py-1.5 text-xs font-medium bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-md transition-colors"
                >
                  Simulate Clarification Request
                </button>
              )}
            {(referral.status === 'Accepted' ||
              referral.status === 'Submitted' ||
              referral.status === 'Awaiting Specialist Review' ||
              referral.status === 'Awaiting specialist review') && (
              <button
                type="button"
                onClick={() => setShowApptForm((v) => !v)}
                className="px-2.5 py-1.5 text-xs font-medium bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-md transition-colors"
              >
                Simulate Appointment Confirmation
              </button>
            )}
            {(referral.status === 'Appointment Confirmed' ||
              referral.status === 'Appointment confirmed' ||
              referral.status === 'E-Consultation Confirmed') && (
              <button
                type="button"
                onClick={() =>
                  simulateStatusTransition(
                    referral.id,
                    'Completed',
                    'Specialist consultation completed and consult note returned.'
                  )
                }
                className="px-2.5 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors"
              >
                Mark Consultation Completed
              </button>
            )}
          </div>
        </div>

        {/* Inline Appointment Confirmation Form */}
        {showApptForm && (
          <form
            onSubmit={handleConfirmAppointmentSubmit}
            className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3"
          >
            <div className="text-xs font-semibold text-slate-900">
              Confirm Specialist Appointment (Demo Simulation)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-600 mb-1">Appointment Date</label>
                <input
                  type="text"
                  value={apptDate}
                  onChange={(e) => setApptDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Time</label>
                <input
                  type="text"
                  value={apptTime}
                  onChange={(e) => setApptTime(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">
                Patient Preparation Instructions
              </label>
              <input
                type="text"
                value={apptInstructions}
                onChange={(e) => setApptInstructions(e.target.value)}
                className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowApptForm(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#0F2942] rounded-lg hover:bg-[#173A5C]"
              >
                Confirm & Notify Patient Portal
              </button>
            </div>
          </form>
        )}

        {/* Patient Next Steps & Appointment / E-Consultation Status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Clinician-Approved Patient Guidance
              </h3>
              <button
                type="button"
                onClick={() => {
                  setPatientNotesDraft(referral.patientNextSteps);
                  setEditingPatientNotes((v) => !v);
                }}
                className="text-xs font-medium text-[#0F2942] hover:underline"
              >
                {editingPatientNotes ? 'Cancel' : 'Edit Instructions'}
              </button>
            </div>

            {editingPatientNotes ? (
              <div className="space-y-2.5">
                <textarea
                  value={patientNotesDraft}
                  onChange={(e) => setPatientNotesDraft(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
                />
                <button
                  type="button"
                  onClick={() => {
                    updateReferral(referral.id, (prev) => ({
                      ...prev,
                      patientNextSteps: patientNotesDraft.trim() || prev.patientNextSteps,
                    }));
                    setEditingPatientNotes(false);
                    showToast('Patient preparation instructions updated.');
                  }}
                  className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#0F2942] rounded-lg"
                >
                  Save Patient Instructions
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-lg border border-slate-100">
                {referral.patientNextSteps}
              </p>
            )}

            <button
              type="button"
              onClick={openInPatientPortal}
              className="px-3.5 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Open Simulated Patient Portal View</span>
            </button>
          </div>

          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Appointment & E-Consultation Status
            </h3>
            {referral.confirmedAppointment ? (
              <div className="p-3.5 bg-teal-50/70 border border-teal-200 rounded-lg space-y-1.5 text-xs">
                <div className="font-semibold text-teal-900 flex items-center gap-1.5">
                  <CalendarCheck className="w-4 h-4 text-teal-700" />
                  <span>
                    {referral.confirmedAppointment.mode === 'E-Consultation'
                      ? 'E-Consultation Confirmed'
                      : 'Confirmed Appointment'}
                  </span>
                </div>
                <div className="text-sm font-medium text-slate-900 font-mono tabular-nums">
                  {referral.confirmedAppointment.date} at {referral.confirmedAppointment.time}
                </div>
                <div className="text-slate-600">{referral.confirmedAppointment.location}</div>
                <div className="text-slate-700">{referral.confirmedAppointment.instructions}</div>
              </div>
            ) : (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-xs">
                <div className="font-medium text-slate-900">
                  No confirmed appointment recorded yet
                </div>
                <p className="text-slate-600 leading-relaxed">
                  An appointment remains unconfirmed until both specialist and patient confirm a time. Wait estimate:{' '}
                  <span className="font-medium text-slate-800">
                    {specialist?.estimatedWait ?? 'Pending clinic estimate'}
                  </span>
                  .
                </p>
              </div>
            )}

            {referral.eConsultation && (
              <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-1.5 text-xs">
                <div className="font-semibold text-indigo-950">
                  {referral.eConsultation.consultationMode} Status: {referral.eConsultation.patientStatus}
                </div>
                <div className="text-indigo-900 font-mono tabular-nums">
                  Proposed: {referral.eConsultation.proposedDate} at {referral.eConsultation.proposedTime}
                </div>
                {referral.eConsultation.rescheduleRequest && (
                  <div className="p-2.5 bg-white border border-amber-200 rounded text-amber-950 space-y-0.5">
                    <div className="font-semibold">
                      Patient Reschedule Request: {referral.eConsultation.rescheduleRequest.suggestedDate} at{' '}
                      {referral.eConsultation.rescheduleRequest.suggestedTime}
                    </div>
                    {referral.eConsultation.rescheduleRequest.message && (
                      <div className="text-amber-900">
                        Message: “{referral.eConsultation.rescheduleRequest.message}”
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Chronological Referral Timeline */}
        <div className="border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-[#0F2942]" />
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Chronological Referral Timeline ({referral.timeline.length})
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
                <div className="pb-3 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900">{ev.title}</span>
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

      {/* Privacy & Access Audit Trail */}
      <AuditLogPanel entries={referral.auditLog} />
    </div>
  );
};
