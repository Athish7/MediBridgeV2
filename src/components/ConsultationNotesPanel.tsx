import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardEdit,
  FileText,
  Loader2,
  Quote,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type {
  AiConsultationNote,
  ClinicalInput,
  ConsultationNotesBundle,
  PatientInfo,
  PhysicianConsultationNotes,
  StructuredConsultationDraft,
  UploadedDocument,
} from '../types/clinbridge';
import {
  buildReferralInputsSummaryText,
  generateAiConsultationNoteDeterministic,
} from '../utils/referralAnalyzer';

const EMPTY_PHYSICIAN_NOTES: PhysicianConsultationNotes = {
  reasonForConsultation: '',
  patientReportedSymptoms: '',
  relevantMedicalHistory: '',
  previousTreatmentsDiscussed: '',
  physicianObservations: '',
  physicianAssessment: '',
  treatmentPlanAndNextSteps: '',
  followUpInstructions: '',
};

const EMPTY_PATIENT_FALLBACK: PatientInfo = {
  id: '',
  name: '',
  dob: '',
  phone: '',
  email: '',
  medicalBackground: '',
};

const EMPTY_CLINICAL_FALLBACK: ClinicalInput = {
  reasonForReferral: '',
  presentingSymptoms: '',
  clinicalHistory: '',
  previousTreatments: '',
  currentMedications: '',
  examinationFindings: '',
  investigations: '',
  additionalNotes: '',
};

interface ConsultationNotesPanelProps {
  value: ConsultationNotesBundle;
  specialty: string;
  physicianName: string;
  patient?: PatientInfo;
  clinicalInput?: ClinicalInput;
  documents?: UploadedDocument[];
  onChange: (next: ConsultationNotesBundle) => void;
  onApplyPhysicianNotesToClinical?: (notes: PhysicianConsultationNotes) => void;
  onRerunIntelligence?: () => void;
  initialSubTab?: 'physician' | 'ai';
  showToast?: (msg: string) => void;
}

function nowStamp(): string {
  return new Date().toISOString().slice(0, 16).replace('T', ' ');
}

export const ConsultationNotesPanel: React.FC<ConsultationNotesPanelProps> = ({
  value,
  specialty,
  physicianName,
  patient,
  clinicalInput,
  documents = [],
  onChange,
  onApplyPhysicianNotesToClinical,
  onRerunIntelligence,
  initialSubTab = 'physician',
  showToast,
}) => {
  const [subTab, setSubTab] = useState<'physician' | 'ai'>(initialSubTab);

  // Section A: Physician-written notes state
  const [pwDraft, setPwDraft] = useState<PhysicianConsultationNotes>(
    () => value.physicianWritten ?? EMPTY_PHYSICIAN_NOTES
  );
  const [pwDirty, setPwDirty] = useState(false);

  useEffect(() => {
    setPwDraft(value.physicianWritten ?? EMPTY_PHYSICIAN_NOTES);
    setPwDirty(false);
  }, [value.physicianWritten]);

  // Section B: Automatically generated AI Consultation Notes state
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteEditDraft, setNoteEditDraft] = useState<StructuredConsultationDraft | null>(null);
  const [expandedSourceInputsId, setExpandedSourceInputsId] = useState<string | null>(null);

  const aiNotes = value.aiNotes ?? [];
  const approvedAiCount = aiNotes.filter((n) => n.reviewStatus === 'Approved').length;
  const pendingAiCount = aiNotes.filter((n) => n.reviewStatus === 'Pending physician review').length;

  const updatePwField = (key: keyof PhysicianConsultationNotes, text: string) => {
    setPwDraft((prev) => ({ ...prev, [key]: text }));
    setPwDirty(true);
  };

  const handleSavePhysicianNotes = () => {
    const saved: PhysicianConsultationNotes = {
      ...pwDraft,
      lastSavedAt: nowStamp(),
    };
    onChange({
      ...value,
      physicianWritten: saved,
    });
    setPwDirty(false);
    showToast?.('Physician-entered consultation notes saved to referral record.');
  };

  const handleGenerateAiSummary = async () => {
    const activePatient = patient ?? EMPTY_PATIENT_FALLBACK;
    const activeClinical = clinicalInput ?? EMPTY_CLINICAL_FALLBACK;
    const activePhysicianNotes = pwDirty ? pwDraft : value.physicianWritten;
    const hasInputs = Boolean(
      activeClinical.reasonForReferral.trim() ||
        activeClinical.presentingSymptoms.trim() ||
        activePhysicianNotes?.reasonForConsultation.trim() ||
        activePhysicianNotes?.patientReportedSymptoms.trim() ||
        documents.length > 0
    );

    if (!hasInputs) {
      showToast?.(
        'Add referral clinical information, physician-written notes, or supporting documents before generating an AI Consultation Summary.'
      );
      return;
    }

    setIsGenerating(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);

    let structured: StructuredConsultationDraft;
    try {
      const res = await fetch('/api/consultations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          patient: activePatient,
          clinical: activeClinical,
          physicianWritten: activePhysicianNotes,
          documents,
          specialty,
        }),
      }).catch(() => null);

      if (res && res.ok) {
        const data = (await res.json()) as { structured: StructuredConsultationDraft };
        structured = data.structured;
      } else {
        structured = generateAiConsultationNoteDeterministic({
          patient: activePatient,
          clinical: activeClinical,
          physicianWritten: activePhysicianNotes,
          documents,
          specialty,
        });
      }
    } finally {
      window.clearTimeout(timeoutId);
      setIsGenerating(false);
    }

    const rawContent = buildReferralInputsSummaryText({
      patient: activePatient,
      clinical: activeClinical,
      physicianWritten: activePhysicianNotes,
      documents,
      specialty,
    });

    const newNote: AiConsultationNote = {
      id: `ainote-${Date.now()}`,
      sourceType: 'AI-generated from referral record',
      rawContent,
      importedAt: nowStamp(),
      structured,
      reviewStatus: 'Pending physician review',
    };

    onChange({
      ...value,
      physicianWritten: pwDirty
        ? { ...pwDraft, lastSavedAt: value.physicianWritten?.lastSavedAt ?? nowStamp() }
        : value.physicianWritten,
      aiNotes: [newNote, ...aiNotes],
    });
    if (pwDirty) setPwDirty(false);

    showToast?.(
      'AI-Generated Consultation Summary created from referral records. Review and approve before finalizing.'
    );
  };

  const updateNoteStatus = (
    noteId: string,
    status: 'Approved' | 'Rejected',
    editedStructured?: StructuredConsultationDraft
  ) => {
    const nextAiNotes = aiNotes.map((n) =>
      n.id === noteId
        ? {
            ...n,
            structured: editedStructured ?? n.structured,
            physicianEdited: editedStructured ? true : n.physicianEdited,
            reviewStatus: status,
            reviewedAt: nowStamp(),
            reviewedBy: physicianName,
          }
        : n
    );
    onChange({
      ...value,
      aiNotes: nextAiNotes,
    });
    setEditingNoteId(null);
    setNoteEditDraft(null);
    showToast?.(
      status === 'Approved'
        ? 'AI consultation summary approved and unlocked for Referral Intelligence & Specialist View.'
        : 'AI consultation summary rejected and excluded from the referral packet.'
    );
  };

  const saveEditedNoteOnly = (noteId: string) => {
    if (!noteEditDraft) return;
    const nextAiNotes = aiNotes.map((n) =>
      n.id === noteId
        ? {
            ...n,
            structured: noteEditDraft,
            physicianEdited: true,
          }
        : n
    );
    onChange({
      ...value,
      aiNotes: nextAiNotes,
    });
    setEditingNoteId(null);
    setNoteEditDraft(null);
    showToast?.('AI summary edits saved. Click Approve Note when ready to verify.');
  };

  return (
    <div className="space-y-5">
      {/* Sub-tab switch between Physician-Written and AI-Generated Notes */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => setSubTab('physician')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              subTab === 'physician'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ClipboardEdit className="w-3.5 h-3.5 text-[#0F2942]" />
            <span>A. Physician-Written Consultation Notes</span>
            {value.physicianWritten?.lastSavedAt && (
              <span className="text-[11px] font-semibold text-teal-700">· Saved</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubTab('ai')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              subTab === 'ai'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-700" />
            <span>B. AI Consultation Notes ({aiNotes.length})</span>
            {pendingAiCount > 0 && (
              <span className="text-[11px] font-semibold text-amber-700">
                · {pendingAiCount} Pending
              </span>
            )}
          </button>
        </div>

        {onRerunIntelligence && (
          <button
            type="button"
            onClick={onRerunIntelligence}
            className="px-3.5 py-2 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg inline-flex items-center gap-1.5 self-start sm:self-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Re-run AI Referral Intelligence</span>
          </button>
        )}
      </div>

      {/* SECTION A: PHYSICIAN-WRITTEN CONSULTATION NOTES */}
      {subTab === 'physician' && (
        <div className="space-y-4">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-[#0F2942] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-700" />
                <span>Source Attribution: Physician-Entered Consultation Notes</span>
              </div>
              <p className="text-xs text-slate-600">
                Documented directly by {physicianName}. Preserved separately from AI-generated summaries and analyzed by Referral Intelligence.
              </p>
            </div>
            {value.physicianWritten?.lastSavedAt && (
              <span className="text-xs font-mono text-slate-500 shrink-0 tabular-nums">
                Saved: {value.physicianWritten.lastSavedAt}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Reason for Consultation
              </label>
              <input
                type="text"
                value={pwDraft.reasonForConsultation}
                onChange={(e) => updatePwField('reasonForConsultation', e.target.value)}
                placeholder="Primary purpose of the patient encounter leading to this referral..."
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Patient-Reported Symptoms{' '}
                <span className="text-slate-400 font-normal">(Subjective)</span>
              </label>
              <textarea
                rows={3}
                value={pwDraft.patientReportedSymptoms}
                onChange={(e) => updatePwField('patientReportedSymptoms', e.target.value)}
                placeholder="Symptoms, onset, duration, and functional limitations described by the patient..."
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Relevant Medical History Discussed
              </label>
              <textarea
                rows={3}
                value={pwDraft.relevantMedicalHistory}
                onChange={(e) => updatePwField('relevantMedicalHistory', e.target.value)}
                placeholder="Comorbidities, prior diagnoses, family history, and allergies reviewed..."
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Previous Treatments Discussed
              </label>
              <textarea
                rows={3}
                value={pwDraft.previousTreatmentsDiscussed}
                onChange={(e) => updatePwField('previousTreatmentsDiscussed', e.target.value)}
                placeholder="Medications, therapies, lifestyle trials, and patient response..."
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Relevant Observations Documented by Physician{' '}
                <span className="text-slate-400 font-normal">(Objective)</span>
              </label>
              <textarea
                rows={3}
                value={pwDraft.physicianObservations}
                onChange={(e) => updatePwField('physicianObservations', e.target.value)}
                placeholder="Vitals, focused physical examination signs, measurements..."
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Physician’s Assessment
              </label>
              <textarea
                rows={3}
                value={pwDraft.physicianAssessment}
                onChange={(e) => updatePwField('physicianAssessment', e.target.value)}
                placeholder="Referring physician’s working assessment and clinical rationale for specialist input..."
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Treatment Plan and Next Steps
              </label>
              <textarea
                rows={3}
                value={pwDraft.treatmentPlanAndNextSteps}
                onChange={(e) => updatePwField('treatmentPlanAndNextSteps', e.target.value)}
                placeholder="Interim management, ordered labs/imaging, and specialist referral plan..."
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Follow-Up Instructions
              </label>
              <input
                type="text"
                value={pwDraft.followUpInstructions}
                onChange={(e) => updatePwField('followUpInstructions', e.target.value)}
                placeholder="Return precautions, monitoring logs, and primary care follow-up timeline..."
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
            {onApplyPhysicianNotesToClinical ? (
              <button
                type="button"
                onClick={() => {
                  handleSavePhysicianNotes();
                  onApplyPhysicianNotesToClinical(pwDraft);
                }}
                className="px-3.5 py-2 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg transition-colors"
              >
                Save & Populate Empty Referral Clinical Fields
              </button>
            ) : (
              <div className="text-xs text-slate-500">
                {pwDirty ? 'Unsaved edits in physician consultation notes.' : 'All physician notes saved.'}
              </div>
            )}

            <button
              type="button"
              onClick={handleSavePhysicianNotes}
              className="px-4 py-2 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg inline-flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Physician Consultation Notes</span>
            </button>
          </div>
        </div>
      )}

      {/* SECTION B: AUTOMATICALLY GENERATED AI CONSULTATION NOTES */}
      {subTab === 'ai' && (
        <div className="space-y-6">
          {/* Distinction / Safety Notice */}
          <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-amber-950">
              <div className="font-semibold">
                AI-Generated Consultation Summary — Physician Verification Required
              </div>
              <p className="text-amber-900 leading-relaxed">
                MediBridge automatically organizes these summaries strictly from the referral’s physician-written notes, clinical fields, and attached supporting medical reports. They are{' '}
                <strong>not automatically verified medical records</strong> and never fabricate absent symptoms, diagnoses, or test results. Unapproved or rejected AI notes remain excluded from the verified specialist packet.
              </p>
            </div>
          </div>

          {/* Automatic Generation Action Bar */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                AI-Generated Consultation Summary ({specialty})
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Synthesizes this referral’s physician notes, symptoms, history, prior treatments, and supporting reports into a {specialty.toLowerCase()}-adapted summary.
              </p>
            </div>
            <button
              type="button"
              disabled={isGenerating}
              onClick={() => void handleGenerateAiSummary()}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0F2942] hover:bg-[#173A5C] disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating AI Summary...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-teal-300" />
                  <span>
                    {aiNotes.length > 0
                      ? 'Regenerate AI Consultation Notes'
                      : 'Generate AI Consultation Notes'}
                  </span>
                </>
              )}
            </button>
          </div>

          {/* AI Consultation Notes Review Queue */}
          {aiNotes.length === 0 ? (
            <div className="p-6 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-500">
              No AI-generated consultation notes created for this draft yet. Enter referral clinical fields or physician notes, then click{' '}
              <strong>Generate AI Consultation Notes</strong> above.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-semibold text-slate-900">
                  AI-Generated Consultation Summary Records ({aiNotes.length})
                </span>
                <span>
                  {approvedAiCount} Approved · {pendingAiCount} Pending physician review
                </span>
              </div>

              {aiNotes.map((note) => {
                const isEditing = editingNoteId === note.id && noteEditDraft;
                const activeDraft = isEditing ? noteEditDraft : note.structured;
                const showSourceInputs = expandedSourceInputsId === note.id;

                return (
                  <div
                    key={note.id}
                    className={`bg-white border rounded-xl overflow-hidden ${
                      note.reviewStatus === 'Approved'
                        ? 'border-emerald-200'
                        : note.reviewStatus === 'Rejected'
                          ? 'border-rose-200 opacity-80'
                          : 'border-amber-300'
                    }`}
                  >
                    {/* Header bar */}
                    <div
                      className={`px-5 py-3.5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                        note.reviewStatus === 'Approved'
                          ? 'bg-emerald-50/60 border-emerald-200'
                          : note.reviewStatus === 'Rejected'
                            ? 'bg-rose-50/50 border-rose-200'
                            : 'bg-amber-50/70 border-amber-200'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-slate-900">
                            AI-Generated Consultation Summary
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="text-teal-800 font-medium">
                            {activeDraft.specialtyContextLabel || `${specialty} Referral Structure`}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-slate-500">{note.importedAt}</span>
                          {note.physicianEdited && (
                            <span className="text-teal-800 font-medium">· Physician Edited</span>
                          )}
                        </div>
                        <div className="text-xs">
                          Verification Status:{' '}
                          <span
                            className={`font-semibold ${
                              note.reviewStatus === 'Approved'
                                ? 'text-emerald-800'
                                : note.reviewStatus === 'Rejected'
                                  ? 'text-rose-800'
                                  : 'text-amber-900'
                            }`}
                          >
                            {note.reviewStatus}
                          </span>
                          {note.reviewedAt && (
                            <span className="text-slate-500 ml-2">
                              ({note.reviewedBy} · {note.reviewedAt})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSourceInputsId((curr) => (curr === note.id ? null : note.id))
                          }
                          className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md inline-flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>{showSourceInputs ? 'Hide Source Inputs' : 'View Source Inputs'}</span>
                        </button>

                        {!isEditing && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNoteId(note.id);
                              setNoteEditDraft({ ...note.structured });
                            }}
                            className="px-2.5 py-1 text-xs font-medium text-[#0F2942] bg-white border border-slate-200 hover:bg-slate-50 rounded-md"
                          >
                            Edit AI Summary
                          </button>
                        )}

                        {note.reviewStatus !== 'Approved' && (
                          <button
                            type="button"
                            onClick={() =>
                              updateNoteStatus(
                                note.id,
                                'Approved',
                                isEditing && noteEditDraft ? noteEditDraft : undefined
                              )
                            }
                            className="px-3 py-1 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md inline-flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve Note</span>
                          </button>
                        )}

                        {note.reviewStatus !== 'Rejected' && (
                          <button
                            type="button"
                            onClick={() => updateNoteStatus(note.id, 'Rejected')}
                            className="px-2.5 py-1 text-xs font-medium text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 rounded-md inline-flex items-center gap-1"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Source Inputs Drawer */}
                    {showSourceInputs && (
                      <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 space-y-1">
                        <div className="text-[11px] font-semibold text-slate-700">
                          Referral Source Data Used to Generate This Summary ({note.sourceType})
                        </div>
                        <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                          {note.rawContent}
                        </pre>
                      </div>
                    )}

                    {/* Uncertain / Incomplete Flags & Supported Specialty Fields */}
                    {(activeDraft.uncertainOrIncompleteItems.length > 0 ||
                      activeDraft.supportedReferralFields.length > 0) && (
                      <div className="px-5 py-3.5 bg-slate-50/70 border-b border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        {activeDraft.uncertainOrIncompleteItems.length > 0 && (
                          <div className="space-y-1">
                            <div className="font-semibold text-amber-900 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                              <span>Uncertain or Missing Information Flagged</span>
                            </div>
                            <ul className="list-disc list-inside text-amber-800 space-y-0.5">
                              {activeDraft.uncertainOrIncompleteItems.map((u, idx) => (
                                <li key={idx}>{u}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {activeDraft.supportedReferralFields.length > 0 && (
                          <div className="space-y-1">
                            <div className="font-semibold text-slate-800">
                              Referral Fields & Specialty Context Covered ({specialty})
                            </div>
                            <div className="text-teal-800">
                              {activeDraft.supportedReferralFields.join(' · ')}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Specialty-Adapted Highlights */}
                    {activeDraft.specialtyHighlights && activeDraft.specialtyHighlights.length > 0 && (
                      <div className="px-5 pt-4 pb-1">
                        <div className="text-[11px] font-semibold text-[#0F2942] mb-2">
                          {activeDraft.specialtyContextLabel || `${specialty} Focus Breakdown`}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {activeDraft.specialtyHighlights.map((hl) => (
                            <div
                              key={hl.label}
                              className="p-3 bg-teal-50/40 border border-teal-100 rounded-lg space-y-1"
                            >
                              <div className="text-[11px] font-semibold text-teal-900">
                                {hl.label}
                              </div>
                              <p className="text-xs text-slate-800 leading-relaxed">{hl.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Structured Fields with Verbatim Quote Traceability */}
                    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(
                        [
                          {
                            key: 'mainReasonForConsultation',
                            label: 'Reason for Consultation',
                            attribution: 'AI-organized from referral',
                          },
                          {
                            key: 'patientReportedSymptoms',
                            label: 'Symptoms & History',
                            attribution: 'Patient-reported in record',
                          },
                          {
                            key: 'relevantMedicalHistory',
                            label: 'Relevant Medical History',
                            attribution: 'AI-organized from record',
                          },
                          {
                            key: 'previousTreatmentsDiscussed',
                            label: 'Previous Treatments & Medications',
                            attribution: 'AI-organized from record',
                          },
                          {
                            key: 'supportingReportFindings',
                            label: 'Findings from Supporting Medical Reports',
                            attribution: 'Extracted from attachments & labs',
                          },
                          {
                            key: 'physicianObservations',
                            label: 'Physician Examination & Observations',
                            attribution: 'Physician-documented',
                          },
                          {
                            key: 'physicianAssessment',
                            label: 'Physician-Documented Assessment',
                            attribution: 'Physician working assessment',
                          },
                          {
                            key: 'planAndFollowUpInstructions',
                            label: 'Plan & Next Steps',
                            attribution: 'AI-organized from record',
                          },
                        ] as const
                      ).map((field) => {
                        const fieldVal =
                          (activeDraft[field.key] as string | undefined) ??
                          'Not provided in current referral record.';
                        const quote = activeDraft.sourceQuotes?.[field.key];
                        return (
                          <div
                            key={field.key}
                            className={`p-3.5 bg-slate-50/70 border border-slate-200 rounded-lg space-y-1.5 ${
                              field.key === 'mainReasonForConsultation' ||
                              field.key === 'planAndFollowUpInstructions'
                                ? 'md:col-span-2'
                                : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-semibold text-slate-800">{field.label}</span>
                              <span className="text-[11px] text-slate-500">{field.attribution}</span>
                            </div>

                            {isEditing && noteEditDraft ? (
                              <textarea
                                rows={2}
                                value={(noteEditDraft[field.key] as string | undefined) ?? ''}
                                onChange={(e) =>
                                  setNoteEditDraft({
                                    ...noteEditDraft,
                                    [field.key]: e.target.value,
                                  })
                                }
                                className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#0F2942]"
                              />
                            ) : (
                              <p className="text-sm text-slate-900 leading-relaxed">{fieldVal}</p>
                            )}

                            {quote && (
                              <div className="pt-1.5 border-t border-slate-200/70 flex items-start gap-1.5 text-[11px] text-slate-600">
                                <Quote className="w-3 h-3 text-teal-700 shrink-0 mt-0.5" />
                                <span>
                                  <strong className="text-slate-700">Source excerpt:</strong> “{quote}”
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {isEditing && (
                      <div className="px-5 pb-4 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNoteId(null);
                            setNoteEditDraft(null);
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                        >
                          Cancel Edits
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEditedNoteOnly(note.id)}
                          className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg"
                        >
                          Save Draft Edits
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateNoteStatus(note.id, 'Approved', noteEditDraft ?? undefined)
                          }
                          className="px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                        >
                          Save & Approve Note
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
