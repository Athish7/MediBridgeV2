import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  FileText,
  Info,
  Loader2,
  MapPin,
  Search,
  SearchCode,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { AccordionSection, type AccordionStatusKind } from '../components/AccordionSection';
import { ConsultationNotesPanel } from '../components/ConsultationNotesPanel';
import { InsurancePanel } from '../components/InsurancePanel';
import { SpecialistFinderPanel } from '../components/SpecialistFinderPanel';
import {
  ChecklistStatusIndicator,
  CompletenessMeter,
  VerificationLabel,
} from '../components/StatusIndicator';
import { useClinBridge } from '../context/ClinBridgeContext';
import { DEMO_PRESET_CASES } from '../data/seedData';
import type {
  AIAnalysisResult,
  ClinicalInput,
  ConsultationNotesBundle,
  GeneratedReferralFromNotes,
  MedicalInsuranceInfo,
  PatientInfo,
  PhysicianConsultationNotes,
  ReferringPhysicianContact,
  Referral,
  ReferralUrgency,
  SpecialistRecommendationBundle,
  UploadedDocument,
} from '../types/clinbridge';
import {
  createDefaultInsuranceInfo,
  getInsuranceVerificationStatus,
} from '../utils/insuranceAdvisor';
import { generateReferralFromNotesDeterministic } from '../utils/notesToReferralParser';
import { createAuditEntry } from '../utils/privacyProjection';
import { analyzeReferralDeterministic } from '../utils/referralAnalyzer';

type SectionKey = 'sec1' | 'sec2' | 'sec3' | 'sec4' | 'sec5' | 'sec6';

const SECTION_META: Array<{ id: SectionKey; short: string; label: string }> = [
  { id: 'sec1', short: '1', label: 'Patient Information' },
  { id: 'sec2', short: '2', label: 'Clinical Information' },
  { id: 'sec3', short: '3', label: 'Consultation Notes' },
  { id: 'sec4', short: '4', label: 'Referral Details' },
  { id: 'sec5', short: '5', label: 'Investigations & Docs' },
  { id: 'sec6', short: '6', label: 'Review & Submit' },
];

const EMPTY_PATIENT: PatientInfo = {
  id: 'PT-92104',
  name: '',
  dob: '',
  phone: '',
  email: '',
  address: '',
  healthCardNumber: '',
  medicalBackground: '',
};

const EMPTY_CLINICAL: ClinicalInput = {
  reasonForReferral: '',
  presentingSymptoms: '',
  clinicalHistory: '',
  previousTreatments: '',
  currentMedications: '',
  allergies: '',
  examinationFindings: '',
  investigations: '',
  confirmedDiagnoses: '',
  suspectedDiagnoses: '',
  clinicalQuestionsForSpecialist: '',
  referralSummary: '',
  additionalNotes: '',
};

const SAMPLE_PASTED_CONSULTATION_NOTES = `Patient seen for worsening exertional dyspnea and intermittent lightheadedness over 3 months.
History: Confirmed essential hypertension (since 2019) and hyperlipidemia; no prior coronary intervention.
Allergies: Penicillin (mild childhood rash).
Symptoms: Exertional shortness of breath climbing 1 flight of stairs, occasional non-sustained palpitations lasting 10-15 seconds.
Exam: BP 138/84 mmHg, HR 78 bpm regular, mild S4, lungs clear, no peripheral edema.
Confirmed diagnoses: Hypertension, Dyslipidemia.
Suspected / rule-out: Paroxysmal atrial arrhythmia vs early diastolic dysfunction — needs cardiology workup.
Investigations: 12-lead ECG shows NSR 76 bpm with mild LVH; fasting LDL 2.4 mmol/L; echocardiogram ordered, results pending.
Medications: Ramipril 10 mg daily, Rosuvastatin 20 mg daily.
Previous treatments: Lifestyle sodium restriction and antihypertensive titration.
Question for specialist: Please advise on Holter monitoring / arrhythmia evaluation and whether echocardiogram follow-up changes medical therapy.
Urgency: Semi-Urgent due to exertional lightheadedness.`;

export const NewReferralPage: React.FC = () => {
  const {
    referrals,
    specialists,
    preselectedSpecialistId,
    editingDraftId,
    addReferral,
    openReferralRecord,
    setActiveSection,
    addNotification,
    settings,
    showToast,
  } = useClinBridge();

  const existingDraft = useMemo(
    () => (editingDraftId ? referrals.find((r) => r.id === editingDraftId) : undefined),
    [editingDraftId, referrals]
  );

  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    sec1: true,
    sec2: false,
    sec3: false,
    sec4: false,
    sec5: false,
    sec6: false,
  });

  const [patient, setPatient] = useState<PatientInfo>(() =>
    existingDraft ? existingDraft.patient : EMPTY_PATIENT
  );
  const [referringContact, setReferringContact] = useState<ReferringPhysicianContact>(() =>
    existingDraft?.referringPhysicianContact ?? {
      physicianName: settings.physicianName,
      credentials: settings.credentials,
      clinicName: settings.clinicName,
      clinicAddress: settings.clinicAddress,
      phone: settings.clinicPhone,
      email: settings.email,
      additionalContact: `Referral Fax: ${settings.clinicFax}`,
    }
  );
  const [clinical, setClinical] = useState<ClinicalInput>(() =>
    existingDraft ? existingDraft.clinicalInput : EMPTY_CLINICAL
  );
  const [urgency, setUrgency] = useState<ReferralUrgency>(
    () => existingDraft?.urgency ?? 'Routine'
  );
  const [insurance, setInsurance] = useState<MedicalInsuranceInfo>(
    () => existingDraft?.insurance ?? createDefaultInsuranceInfo()
  );
  const [pastedRawNotes, setPastedRawNotes] = useState('');
  const [isGeneratingFromNotes, setIsGeneratingFromNotes] = useState(false);
  const [generatedNotesReport, setGeneratedNotesReport] =
    useState<GeneratedReferralFromNotes | null>(null);

  const [consultationNotes, setConsultationNotes] = useState<ConsultationNotesBundle>(() =>
    existingDraft?.consultationNotes ?? { aiNotes: [] }
  );
  const [documents, setDocuments] = useState<UploadedDocument[]>(() =>
    existingDraft ? existingDraft.documents : []
  );
  const [selectedSpecialistId, setSelectedSpecialistId] = useState<string>(() => {
    if (existingDraft) {
      return (
        existingDraft.specialistId ||
        specialists.find((s) => s.specialty === existingDraft.specialty)?.id ||
        specialists[0].id
      );
    }
    if (preselectedSpecialistId) return preselectedSpecialistId;
    return specialists[0].id;
  });

  // Directory filters inside Section 4
  const [specSearch, setSpecSearch] = useState('');
  const [specFilter, setSpecFilter] = useState('All');
  const [locFilter, setLocFilter] = useState('All');
  const [waitFilter, setWaitFilter] = useState<'all' | 'fast'>('all');

  // AI Analysis inside Section 6
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState(0);
  const [preferDeterministic, setPreferDeterministic] = useState(true);
  const [analysisNotice, setAnalysisNotice] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(() =>
    existingDraft ? existingDraft.analysis : null
  );
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [editingExtractId, setEditingExtractId] = useState<string | null>(null);
  const [extractDraftText, setExtractDraftText] = useState('');

  // Submission & Checklist State
  const [patientGuidance, setPatientGuidance] = useState(
    'Your referral is being sent to the specialist clinic. Their intake coordinator will contact you once reviewed.'
  );
  const [physicianAttested, setPhysicianAttested] = useState(false);
  const [documentsComplete, setDocumentsComplete] = useState<boolean>(
    () => existingDraft?.documentsComplete ?? false
  );
  const [checklistExceptions, setChecklistExceptions] = useState<Record<string, string>>(
    () => existingDraft?.checklistExceptions ?? {}
  );
  const [aiRecommendations, setAiRecommendations] = useState<
    SpecialistRecommendationBundle | undefined
  >(() => existingDraft?.aiSpecialistRecommendations);
  const [docFeedback, setDocFeedback] = useState<{
    type: 'error' | 'success';
    message: string;
    unresolved?: string[];
  } | null>(null);
  const [exceptionRowId, setExceptionRowId] = useState<string | null>(null);
  const [exceptionText, setExceptionText] = useState('');

  useEffect(() => {
    if (existingDraft) {
      setPatient(existingDraft.patient);
      setReferringContact(existingDraft.referringPhysicianContact);
      setClinical(existingDraft.clinicalInput);
      setUrgency(existingDraft.urgency ?? 'Routine');
      setInsurance(existingDraft.insurance ?? createDefaultInsuranceInfo());
      setConsultationNotes(existingDraft.consultationNotes ?? { aiNotes: [] });
      setDocuments(existingDraft.documents);
      setSelectedSpecialistId(
        existingDraft.specialistId ||
          specialists.find((s) => s.specialty === existingDraft.specialty)?.id ||
          specialists[0].id
      );
      setAnalysis(existingDraft.analysis);
      setDocumentsComplete(Boolean(existingDraft.documentsComplete));
      setChecklistExceptions(existingDraft.checklistExceptions ?? {});
      setAiRecommendations(existingDraft.aiSpecialistRecommendations);
    }
  }, [existingDraft, specialists]);

  useEffect(() => {
    if (preselectedSpecialistId) {
      setSelectedSpecialistId(preselectedSpecialistId);
    }
  }, [preselectedSpecialistId]);

  const selectedSpecialist = useMemo(
    () => specialists.find((s) => s.id === selectedSpecialistId) ?? specialists[0],
    [specialists, selectedSpecialistId]
  );

  const filteredSpecialists = useMemo(() => {
    const q = specSearch.trim().toLowerCase();
    return specialists.filter((sp) => {
      const matchSpec = specFilter === 'All' || sp.specialty === specFilter;
      const matchLoc = locFilter === 'All' || sp.location === locFilter;
      const matchWait = waitFilter === 'all' || sp.estimatedWaitWeeks <= 4;
      const matchQuery =
        !q ||
        sp.name.toLowerCase().includes(q) ||
        sp.clinic.toLowerCase().includes(q) ||
        sp.specialty.toLowerCase().includes(q);
      return matchSpec && matchLoc && matchWait && matchQuery;
    });
  }, [specialists, specSearch, specFilter, locFilter, waitFilter]);

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const jumpToSection = (key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: true }));
    window.setTimeout(() => {
      document.getElementById(`new-ref-${key}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 60);
  };

  const allExpanded = Object.values(openSections).every(Boolean);
  const toggleAllSections = () => {
    const nextVal = !allExpanded;
    setOpenSections({
      sec1: nextVal,
      sec2: nextVal,
      sec3: nextVal,
      sec4: nextVal,
      sec5: nextVal,
      sec6: nextVal,
    });
  };

  const loadPresetCase = (presetId: string) => {
    const preset = DEMO_PRESET_CASES.find((p) => p.id === presetId);
    if (!preset) return;
    setPatient(preset.patient);
    setClinical(preset.clinical);
    setDocuments(preset.documents);
    setSelectedSpecialistId(preset.specialistId);
    setInsurance({
      ...createDefaultInsuranceInfo(),
      availabilityStatus: 'Available and included',
      coverageCategory: 'Provincial Public Health Plan + Private Extended Coverage',
      provinceOrJurisdiction: 'Ontario (OHIP)',
      providerName: 'Sun Life Financial (Demo)',
      planType: 'Employer Extended Health Benefits',
      verificationStatus: 'Verified',
    });
    setAnalysis(null);
    setDocumentsComplete(false);
    setChecklistExceptions({});
    setAiRecommendations(undefined);
    setDocFeedback(null);
    setPhysicianAttested(false);
    showToast(`Loaded demo case: ${preset.patient.name}`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const rawText = typeof reader.result === 'string' ? reader.result.trim() : '';
        const isReadableText =
          file.type.startsWith('text/') ||
          file.name.endsWith('.txt') ||
          file.name.endsWith('.csv') ||
          (rawText.length > 0 && !rawText.includes('\u0000'));

        const contentText = isReadableText
          ? rawText.slice(0, 2500)
          : `Uploaded document (${file.name}, ${Math.max(1, Math.round(file.size / 1024))} KB). Structured text preview simulated for binary attachment.`;

        setDocuments((prev) => [
          ...prev,
          {
            id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            type: file.type || 'application/octet-stream',
            sizeLabel: `${Math.max(1, Math.round(file.size / 1024))} KB`,
            uploadedAt: new Date().toISOString().slice(0, 10),
            contentText,
          },
        ]);
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  };

  const addSampleEcgAttachment = () => {
    const sampleDoc: UploadedDocument = {
      id: `doc-ecg-${Date.now()}`,
      name: '12_Lead_ECG_Report_Nov16.txt',
      type: 'text/plain',
      sizeLabel: '2.1 KB',
      uploadedAt: new Date().toISOString().slice(0, 10),
      contentText:
        '12-Lead Electrocardiogram (Nov 16, 2026): Normal sinus rhythm at 74 bpm. Normal PR (158 ms) and QRS (88 ms) intervals. No acute ST-T wave ischemic changes.',
    };
    setDocuments((prev) => [...prev, sampleDoc]);
    showToast('Attached sample 12-lead ECG report.');
  };

  const removeDocument = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const handleGenerateReferralFromNotes = async () => {
    if (!pastedRawNotes.trim()) {
      showToast('Paste family physician consultation notes before generating referral fields.');
      return;
    }
    setIsGeneratingFromNotes(true);
    let generated: GeneratedReferralFromNotes;
    try {
      const res = await fetch('/api/ai/generate-referral-from-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawNotes: pastedRawNotes,
          specialtyHint: selectedSpecialist?.specialty,
        }),
      }).catch(() => null);

      if (res && res.ok) {
        generated = (await res.json()) as GeneratedReferralFromNotes;
      } else {
        generated = generateReferralFromNotesDeterministic(
          pastedRawNotes,
          selectedSpecialist?.specialty
        );
      }
    } finally {
      setIsGeneratingFromNotes(false);
    }

    setClinical((prev) => ({
      ...prev,
      reasonForReferral: generated.reasonForReferral || prev.reasonForReferral,
      presentingSymptoms: generated.presentingSymptoms || prev.presentingSymptoms,
      clinicalHistory: generated.clinicalHistory || prev.clinicalHistory,
      examinationFindings: generated.examinationFindings || prev.examinationFindings,
      confirmedDiagnoses: generated.confirmedDiagnoses || prev.confirmedDiagnoses,
      suspectedDiagnoses: generated.suspectedDiagnoses || prev.suspectedDiagnoses,
      investigations: generated.investigations || prev.investigations,
      currentMedications: generated.currentMedications || prev.currentMedications,
      previousTreatments: generated.previousTreatments || prev.previousTreatments,
      allergies: generated.allergies || prev.allergies,
      clinicalQuestionsForSpecialist:
        generated.clinicalQuestionsForSpecialist || prev.clinicalQuestionsForSpecialist,
      referralSummary: generated.referralSummary || prev.referralSummary,
    }));
    setUrgency(generated.recommendedUrgency);
    setGeneratedNotesReport(generated);
    setAnalysis(null);
    showToast('Referral fields populated from consultation notes. Review & edit before submitting.');
  };

  const runAiAnalysis = async (forceDeterministic?: boolean) => {
    setIsAnalyzing(true);
    setAnalysisPhase(1);
    setAnalysisNotice(null);

    const useDet = typeof forceDeterministic === 'boolean' ? forceDeterministic : preferDeterministic;

    const phaseTimer1 = window.setTimeout(() => setAnalysisPhase(2), 350);
    const phaseTimer2 = window.setTimeout(() => setAnalysisPhase(3), 700);
    const phaseTimer3 = window.setTimeout(() => setAnalysisPhase(4), 1000);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 7000);

    try {
      const [apiRes] = await Promise.all([
        fetch('/api/referrals/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            patient,
            clinical,
            specialist: selectedSpecialist,
            documents,
            consultationNotes,
            preferDeterministic: useDet,
          }),
        }).catch(() => null),
        new Promise((resolve) => window.setTimeout(resolve, 1100)),
      ]);

      let result: AIAnalysisResult;
      if (apiRes && apiRes.ok) {
        result = (await apiRes.json()) as AIAnalysisResult;
      } else {
        if (!useDet) {
          const errBody = apiRes ? await apiRes.json().catch(() => ({})) : {};
          setAnalysisNotice(
            `${errBody.error || 'Live Gemini endpoint timed out or is unavailable'} — using local deterministic clinical structuring engine.`
          );
        }
        result = analyzeReferralDeterministic(
          patient,
          clinical,
          selectedSpecialist,
          documents,
          consultationNotes
        );
      }

      setAnalysis(result);
      setSelectedSourceId(result.extractedItems[0]?.id ?? null);
      setPatientGuidance(
        result.missingItems.length > 0
          ? `Your referral to ${selectedSpecialist.name} is being prepared while our office completes ${result.missingItems.length} supporting record(s). Estimated wait time is ${selectedSpecialist.estimatedWait}.`
          : `Your referral has been prepared for ${selectedSpecialist.name} at ${selectedSpecialist.clinic}. Estimated wait time is ${selectedSpecialist.estimatedWait}.`
      );
    } finally {
      window.clearTimeout(timeoutId);
      window.clearTimeout(phaseTimer1);
      window.clearTimeout(phaseTimer2);
      window.clearTimeout(phaseTimer3);
      setIsAnalyzing(false);
    }
  };

  const verifyExtracted = (itemId: string) => {
    if (!analysis) return;
    setAnalysis({
      ...analysis,
      extractedItems: analysis.extractedItems.map((i) =>
        i.id === itemId ? { ...i, verificationState: 'Clinician verified' } : i
      ),
    });
  };

  const saveExtractEdit = (itemId: string) => {
    if (!analysis || !extractDraftText.trim()) return;
    setAnalysis({
      ...analysis,
      extractedItems: analysis.extractedItems.map((i) =>
        i.id === itemId
          ? { ...i, value: extractDraftText.trim(), verificationState: 'Clinician verified' }
          : i
      ),
    });
    setEditingExtractId(null);
  };

  const verifyChecklistRow = (chkId: string) => {
    const active =
      analysis ??
      analyzeReferralDeterministic(patient, clinical, selectedSpecialist, documents, consultationNotes);
    const updatedChecklist = active.checklist.map((c) =>
      c.id === chkId
        ? {
            ...c,
            status: 'Clinician verified' as const,
            details: 'Verified directly by referring clinician.',
          }
        : c
    );
    const completedCount = updatedChecklist.filter(
      (c) => c.status === 'Provided' || c.status === 'Clinician verified'
    ).length;
    const score = Math.round((completedCount / Math.max(updatedChecklist.length, 1)) * 100);
    setDocFeedback(null);
    setAnalysis({
      ...active,
      completenessScore: Math.max(active.completenessScore, score),
      checklist: updatedChecklist,
      missingItems: updatedChecklist.filter((c) => c.status === 'Missing').map((c) => c.requirement),
    });
  };

  const recordDraftException = (chkId: string, reason: string) => {
    if (!reason.trim()) return;
    const active =
      analysis ??
      analyzeReferralDeterministic(patient, clinical, selectedSpecialist, documents, consultationNotes);
    const clean = reason.trim();
    const nextExceptions = { ...checklistExceptions, [chkId]: clean };
    setChecklistExceptions(nextExceptions);
    const updatedChecklist = active.checklist.map((c) =>
      c.id === chkId
        ? {
            ...c,
            status: 'Clinician verified' as const,
            details: `Not applicable / physician exception: ${clean}`,
            sourceLabel: 'Physician Exception Approval',
            sourceExcerpt: clean,
          }
        : c
    );
    const completedCount = updatedChecklist.filter(
      (c) => c.status === 'Provided' || c.status === 'Clinician verified'
    ).length;
    const score = Math.round((completedCount / Math.max(updatedChecklist.length, 1)) * 100);
    setDocFeedback(null);
    setExceptionRowId(null);
    setExceptionText('');
    setAnalysis({
      ...active,
      completenessScore: Math.max(active.completenessScore, score),
      checklist: updatedChecklist,
      missingItems: updatedChecklist.filter((c) => c.status === 'Missing').map((c) => c.requirement),
    });
  };

  const handleMarkDraftDocumentsComplete = () => {
    const activeAnalysis =
      analysis ??
      analyzeReferralDeterministic(
        patient,
        clinical,
        selectedSpecialist,
        documents,
        consultationNotes
      );
    if (!analysis) {
      setAnalysis(activeAnalysis);
    }

    const unresolved = activeAnalysis.checklist
      .filter(
        (c) =>
          (c.status === 'Missing' || c.status === 'Needs clarification') &&
          !checklistExceptions[c.id]
      )
      .map((c) => c.requirement);

    if (unresolved.length > 0) {
      setDocumentsComplete(false);
      setDocFeedback({
        type: 'error',
        message:
          'Cannot mark documents complete yet. Required checklist items are still missing or need clarification. Upload missing records, verify them, or mark a physician exception below.',
        unresolved,
      });
      return;
    }

    setDocumentsComplete(true);
    setDocFeedback({
      type: 'success',
      message:
        'Supporting documents have been marked as collected. You can now continue preparing the referral.',
    });
    showToast('Supporting documents have been marked as collected.');
  };

  const applyPhysicianNotesToClinical = (notes: PhysicianConsultationNotes) => {
    setClinical((prev) => ({
      ...prev,
      reasonForReferral: prev.reasonForReferral.trim() || notes.reasonForConsultation,
      presentingSymptoms: prev.presentingSymptoms.trim() || notes.patientReportedSymptoms,
      clinicalHistory: prev.clinicalHistory.trim() || notes.relevantMedicalHistory,
      previousTreatments: prev.previousTreatments.trim() || notes.previousTreatmentsDiscussed,
      examinationFindings: prev.examinationFindings.trim() || notes.physicianObservations,
      additionalNotes:
        prev.additionalNotes.trim() ||
        [notes.treatmentPlanAndNextSteps, notes.followUpInstructions].filter(Boolean).join(' '),
    }));
    setAnalysis(null);
    showToast('Empty referral clinical fields populated from physician consultation notes.');
  };

  const submitReferral = (asDraft: boolean) => {
    const finalAnalysis =
      analysis ??
      analyzeReferralDeterministic(
        patient,
        clinical,
        selectedSpecialist,
        documents,
        consultationNotes
      );

    const newId =
      existingDraft?.id ?? `CB-2026-${Math.floor(1050 + Math.random() * 8900)}`;
    const today = new Date().toISOString().slice(0, 10);
    const nowTime = new Date().toISOString().slice(0, 16).replace('T', ' ');

    const newReferral: Referral = {
      id: newId,
      patient: {
        ...patient,
        name: patient.name.trim() || 'Unnamed Demo Patient',
        dob: patient.dob || '1970-01-01',
      },
      referringPhysician: `${referringContact.physicianName}, ${referringContact.credentials}`,
      referringClinic: referringContact.clinicName,
      referringPhysicianContact: referringContact,
      specialistId: selectedSpecialist.id,
      specialistName: selectedSpecialist.name,
      specialty: selectedSpecialist.specialty,
      receivingClinic: selectedSpecialist.clinic,
      referralDate: today,
      lastUpdated: today,
      status: asDraft ? 'Draft' : 'Submitted',
      urgency,
      completeness: finalAnalysis.completenessScore,
      attentionPriority:
        asDraft || finalAnalysis.missingItems.length > 0 ? 'High' : 'Standard',
      clinicalInput: clinical,
      consultationNotes,
      documents,
      documentsComplete,
      documentsCompletedAt: documentsComplete ? nowTime : undefined,
      documentsCompletedBy: documentsComplete ? referringContact.physicianName : undefined,
      checklistExceptions:
        Object.keys(checklistExceptions).length > 0 ? checklistExceptions : undefined,
      aiSpecialistRecommendations: aiRecommendations,
      analysis: finalAnalysis,
      insurance: {
        ...insurance,
        verificationStatus: insurance.verificationStatus ?? getInsuranceVerificationStatus(insurance),
        lastUpdatedAt: nowTime,
        lastUpdatedBy: referringContact.physicianName,
      },
      auditLog: [
        ...(existingDraft?.auditLog ?? []),
        ...(asDraft
          ? []
          : [
              createAuditEntry({
                actorRole: 'physician',
                actorName: referringContact.physicianName,
                actorId: 'phys-vance',
                action: 'REFERRAL_SUBMITTED',
                details: `Submitted referral ${newId} to ${selectedSpecialist.name} (${selectedSpecialist.clinic}) with Stage 1 privacy protection enabled.`,
                timestamp: nowTime,
              }),
            ]),
      ],
      communications: existingDraft?.communications ?? [],
      timeline: [
        {
          id: `tl-init-${Date.now()}`,
          title: 'Referral initiated',
          description: `Created by ${referringContact.physicianName} for ${selectedSpecialist.specialty}.`,
          timestamp: nowTime,
          actor: referringContact.physicianName,
          stage: 'initiated',
        },
        {
          id: `tl-org-${Date.now() + 1}`,
          title: 'Clinical information organized',
          description: `Structured ${finalAnalysis.extractedItems.length} clinical elements with source traceability.`,
          timestamp: nowTime,
          actor: 'MediBridge AI',
          stage: 'organized',
        },
        ...(asDraft
          ? []
          : [
              {
                id: `tl-sub-${Date.now() + 2}`,
                title: 'Referral approved & submitted',
                description: `Approved by ${referringContact.physicianName} and submitted to ${selectedSpecialist.clinic}. Stage 1 anonymous preview ready for specialist review.`,
                timestamp: nowTime,
                actor: referringContact.physicianName,
                stage: 'submitted' as const,
              },
            ]),
      ],
      patientNextSteps: patientGuidance,
      physicianApproved: !asDraft,
    };

    addReferral(newReferral);
    addNotification({
      title: asDraft ? `Draft saved · ${newId}` : `New incoming referral · ${newId}`,
      message: asDraft
        ? `Saved draft referral for ${newReferral.patient.name} (${selectedSpecialist.specialty}).`
        : `Submitted referral for ${newReferral.patient.name} to ${selectedSpecialist.clinic}.`,
      timestamp: 'Just now',
      type: asDraft ? 'info' : 'action',
      referralId: newId,
      audience: asDraft ? 'physician' : 'specialist',
    });

    showToast(
      asDraft
        ? `Draft ${newId} saved to Referral Management.`
        : `Referral ${newId} submitted and persisted!`
    );
    openReferralRecord(newId);
  };

  // Live deterministic preview for Section 5/6 when explicit analysis hasn't been triggered
  const liveAnalysis = useMemo(
    () =>
      analysis ??
      analyzeReferralDeterministic(
        patient,
        clinical,
        selectedSpecialist,
        documents,
        consultationNotes
      ),
    [analysis, patient, clinical, selectedSpecialist, documents, consultationNotes]
  );

  const selectedSourceItem =
    liveAnalysis.extractedItems.find((i) => i.id === selectedSourceId) ??
    liveAnalysis.extractedItems[0];

  // Live section completion indicators
  const insVerif = insurance.verificationStatus ?? getInsuranceVerificationStatus(insurance);
  const sec1Missing: string[] = [];
  if (!patient.name.trim()) sec1Missing.push('Patient name');
  if (!patient.dob.trim() && typeof patient.age !== 'number') sec1Missing.push('DOB or age');
  if (!patient.phone.trim() && !patient.email.trim()) sec1Missing.push('Contact phone/email');
  if (insVerif !== 'Verified') sec1Missing.push(`Insurance (${insVerif})`);
  const sec1Status: { kind: AccordionStatusKind; label: string } =
    sec1Missing.length === 0
      ? { kind: 'complete', label: 'Complete · Insurance verified' }
      : {
          kind: !patient.name.trim() ? 'missing' : 'warning',
          label: `Needs ${sec1Missing.join(', ')}`,
        };

  const sec2Missing: string[] = [];
  if (!clinical.presentingSymptoms.trim()) sec2Missing.push('Presenting symptoms');
  if (!clinical.clinicalHistory.trim() && !patient.medicalBackground.trim()) {
    sec2Missing.push('Medical history');
  }
  if (!clinical.currentMedications.trim()) sec2Missing.push('Medications');
  if (!clinical.allergies?.trim()) sec2Missing.push('Allergies');
  const sec2Status: { kind: AccordionStatusKind; label: string } =
    sec2Missing.length === 0
      ? { kind: 'complete', label: 'Complete' }
      : sec2Missing.length >= 3
        ? { kind: 'missing', label: `Missing: ${sec2Missing.slice(0, 2).join(', ')}` }
        : { kind: 'partial', label: `Optional / pending: ${sec2Missing.join(', ')}` };

  const hasConsultationNotes = Boolean(
    consultationNotes.physicianWritten?.lastSavedAt ||
      (consultationNotes.aiNotes?.length ?? 0) > 0 ||
      pastedRawNotes.trim() ||
      clinical.referralSummary?.trim()
  );
  const sec3Status: { kind: AccordionStatusKind; label: string } = hasConsultationNotes
    ? {
        kind: 'complete',
        label: `${consultationNotes.aiNotes?.length ?? 0} AI summary · Notes ready`,
      }
    : { kind: 'partial', label: 'Optional — paste notes or document consultation' };

  const sec4Missing: string[] = [];
  if (!clinical.reasonForReferral.trim()) sec4Missing.push('Reason for referral');
  if (!selectedSpecialist?.id) sec4Missing.push('Specialist selection');
  const sec4Status: { kind: AccordionStatusKind; label: string } =
    sec4Missing.length === 0
      ? {
          kind: 'complete',
          label: `${selectedSpecialist.specialty} · ${selectedSpecialist.name} (${urgency})`,
        }
      : { kind: 'missing', label: `Missing: ${sec4Missing.join(', ')}` };

  const missingChecklistCount = liveAnalysis.checklist.filter(
    (c) => (c.status === 'Missing' || c.status === 'Needs clarification') && !checklistExceptions[c.id]
  ).length;
  const sec5Status: { kind: AccordionStatusKind; label: string } =
    missingChecklistCount === 0 && (documents.length > 0 || clinical.investigations.trim())
      ? {
          kind: 'complete',
          label: `${documents.length} doc${documents.length === 1 ? '' : 's'} · Intake ready`,
        }
      : missingChecklistCount > 0
        ? {
            kind: 'missing',
            label: `${missingChecklistCount} checklist item${missingChecklistCount === 1 ? '' : 's'} missing`,
          }
        : { kind: 'partial', label: `${documents.length} documents attached` };

  const allCriticalMissing = [
    ...(!patient.name.trim() ? [{ section: 'sec1' as SectionKey, label: 'Patient Full Name' }] : []),
    ...(insVerif !== 'Verified'
      ? [{ section: 'sec1' as SectionKey, label: `Medical Insurance (${insVerif})` }]
      : []),
    ...(!clinical.presentingSymptoms.trim()
      ? [{ section: 'sec2' as SectionKey, label: 'Presenting Symptoms' }]
      : []),
    ...(!clinical.allergies?.trim()
      ? [{ section: 'sec2' as SectionKey, label: 'Allergies (or NKDA)' }]
      : []),
    ...(!clinical.reasonForReferral.trim()
      ? [{ section: 'sec4' as SectionKey, label: 'Reason for Referral' }]
      : []),
    ...(missingChecklistCount > 0
      ? [
          {
            section: 'sec5' as SectionKey,
            label: `${missingChecklistCount} Missing Intake Document(s)`,
          },
        ]
      : []),
  ];

  const sec6Status: { kind: AccordionStatusKind; label: string } =
    allCriticalMissing.length === 0
      ? { kind: 'complete', label: `Ready for submission · ${liveAnalysis.completenessScore}%` }
      : {
          kind: 'warning',
          label: `${allCriticalMissing.length} item${allCriticalMissing.length === 1 ? '' : 's'} highlighted · ${liveAnalysis.completenessScore}%`,
        };

  return (
    <div className="space-y-5">
      {/* Header + Demo Preset Bar */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            {existingDraft ? `Resume Draft · ${existingDraft.id}` : 'Prepare New Referral'}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Expand any section below to complete patient demographics, medical insurance, clinical details, consultation notes, and supporting documents.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 mr-1">Demo Quick-Fill:</span>
          {DEMO_PRESET_CASES.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => loadPresetCase(preset.id)}
              title={preset.subtitle}
              className="px-3 py-1.5 text-xs font-medium text-[#0F2942] bg-white border border-slate-200 hover:border-[#0F2942] rounded-lg transition-colors whitespace-nowrap"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Compact Section Jump Strip + Expand/Collapse All */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {SECTION_META.map((sec) => {
            const isOpen = openSections[sec.id];
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => jumpToSection(sec.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                  isOpen
                    ? 'bg-[#0F2942] text-white border-[#0F2942]'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="font-mono mr-1">{sec.short}.</span>
                {sec.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            Completeness: <strong className="text-slate-900">{liveAnalysis.completenessScore}%</strong>
          </div>
          <button
            type="button"
            onClick={toggleAllSections}
            className="px-3 py-1.5 text-xs font-medium text-[#0F2942] bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
          >
            {allExpanded ? 'Collapse All Sections' : 'Expand All Sections'}
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('dashboard')}
            className="text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* ACCORDION 1: PATIENT INFORMATION (including Medical Insurance Information) */}
      <AccordionSection
        id="new-ref-sec1"
        title="1. Patient Information"
        subtitle="Demographics, contact details, health card, medical insurance coverage, and referring physician information."
        isOpen={openSections.sec1}
        onToggle={() => toggleSection('sec1')}
        statusKind={sec1Status.kind}
        statusLabel={sec1Status.label}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Patient Full Name *
            </label>
            <input
              type="text"
              value={patient.name}
              onChange={(e) => setPatient({ ...patient, name: e.target.value })}
              placeholder="e.g., Margaret Holloway"
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Date of Birth *
              </label>
              <input
                type="date"
                value={patient.dob}
                onChange={(e) => setPatient({ ...patient, dob: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Age (Years)
              </label>
              <input
                type="number"
                min={0}
                max={120}
                value={patient.age ?? ''}
                onChange={(e) =>
                  setPatient({
                    ...patient,
                    age: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="e.g., 42"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Patient ID
              </label>
              <input
                type="text"
                value={patient.id}
                onChange={(e) => setPatient({ ...patient, id: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Phone Number *
            </label>
            <input
              type="tel"
              value={patient.phone}
              onChange={(e) => setPatient({ ...patient, phone: e.target.value })}
              placeholder="(555) 614-8820"
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={patient.email}
              onChange={(e) => setPatient({ ...patient, email: e.target.value })}
              placeholder="patient@example.com"
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Residential Address (Protected in Stage 1)
            </label>
            <input
              type="text"
              value={patient.address ?? ''}
              onChange={(e) => setPatient({ ...patient, address: e.target.value })}
              placeholder="e.g., 142 Maplewood Ave, Toronto, ON"
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Health Card Number (Protected in Stage 1)
            </label>
            <input
              type="text"
              value={patient.healthCardNumber ?? ''}
              onChange={(e) => setPatient({ ...patient, healthCardNumber: e.target.value })}
              placeholder="e.g., 7408-519-402-GH"
              className="w-full px-3.5 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
            />
          </div>
        </div>

        {/* Medical Insurance Information directly embedded inside Patient Information */}
        <InsurancePanel
          insurance={insurance}
          specialty={selectedSpecialist.specialty}
          clinicalInput={clinical}
          role="physician"
          editable={true}
          embedded={true}
          onChangeDraft={setInsurance}
        />

        {/* Referring Physician Contact Information */}
        <div className="pt-4 border-t border-slate-200 space-y-4">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Referring Physician Contact Information
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Shared with the receiving specialist clinic for direct clinical coordination and clarification follow-ups.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Referring Physician Name
              </label>
              <input
                type="text"
                value={referringContact.physicianName}
                onChange={(e) =>
                  setReferringContact({ ...referringContact, physicianName: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Credentials
              </label>
              <input
                type="text"
                value={referringContact.credentials}
                onChange={(e) =>
                  setReferringContact({ ...referringContact, credentials: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Referring Clinic Name
              </label>
              <input
                type="text"
                value={referringContact.clinicName}
                onChange={(e) =>
                  setReferringContact({ ...referringContact, clinicName: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Clinic Address
              </label>
              <input
                type="text"
                value={referringContact.clinicAddress}
                onChange={(e) =>
                  setReferringContact({ ...referringContact, clinicAddress: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Direct Phone
              </label>
              <input
                type="tel"
                value={referringContact.phone}
                onChange={(e) =>
                  setReferringContact({ ...referringContact, phone: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Practice Email
              </label>
              <input
                type="email"
                value={referringContact.email}
                onChange={(e) =>
                  setReferringContact({ ...referringContact, email: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Additional Contact / Fax / Desk Notes
              </label>
              <input
                type="text"
                value={referringContact.additionalContact ?? ''}
                onChange={(e) =>
                  setReferringContact({ ...referringContact, additionalContact: e.target.value })
                }
                placeholder="e.g., Direct Physician Desk Ext. 204 · Fax (555) 204-8109"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
              />
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* ACCORDION 2: CLINICAL INFORMATION */}
      <AccordionSection
        id="new-ref-sec2"
        title="2. Clinical Information"
        subtitle="Medical background, confirmed vs. suspected conditions, medications, allergies, symptoms, and exam findings."
        isOpen={openSections.sec2}
        onToggle={() => toggleSection('sec2')}
        statusKind={sec2Status.kind}
        statusLabel={sec2Status.label}
      >
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            Relevant Medical Background
          </label>
          <textarea
            rows={2}
            value={patient.medicalBackground}
            onChange={(e) =>
              setPatient({ ...patient, medicalBackground: e.target.value })
            }
            placeholder="Chronic conditions, surgical history, family history, and baseline health context..."
            className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Confirmed Diagnoses (Established Only)
            </label>
            <input
              type="text"
              value={clinical.confirmedDiagnoses ?? ''}
              onChange={(e) =>
                setClinical({ ...clinical, confirmedDiagnoses: e.target.value })
              }
              placeholder="Only confirmed/established conditions (never provisional)..."
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Suspected / Preliminary Diagnoses (Provisional)
            </label>
            <input
              type="text"
              value={clinical.suspectedDiagnoses ?? ''}
              onChange={(e) =>
                setClinical({ ...clinical, suspectedDiagnoses: e.target.value })
              }
              placeholder="Working or differential impressions requiring specialist assessment..."
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Current Medications
            </label>
            <textarea
              rows={3}
              value={clinical.currentMedications}
              onChange={(e) =>
                setClinical({ ...clinical, currentMedications: e.target.value })
              }
              placeholder="Medication names, dosages, and schedules..."
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Allergies & Drug Intolerances
            </label>
            <textarea
              rows={3}
              value={clinical.allergies ?? ''}
              onChange={(e) =>
                setClinical({ ...clinical, allergies: e.target.value })
              }
              placeholder="e.g., Penicillin (rash), or No known drug allergies (NKDA)..."
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Presenting Symptoms *
            </label>
            <textarea
              rows={3}
              value={clinical.presentingSymptoms}
              onChange={(e) =>
                setClinical({ ...clinical, presentingSymptoms: e.target.value })
              }
              placeholder="Onset, frequency, severity, and functional impact..."
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Clinical History
            </label>
            <textarea
              rows={3}
              value={clinical.clinicalHistory}
              onChange={(e) =>
                setClinical({ ...clinical, clinicalHistory: e.target.value })
              }
              placeholder="Prior visits, longitudinal progression, relevant comorbidities..."
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Previous Treatments
            </label>
            <textarea
              rows={3}
              value={clinical.previousTreatments}
              onChange={(e) =>
                setClinical({ ...clinical, previousTreatments: e.target.value })
              }
              placeholder="Prior therapies, physiotherapy, or medication trials..."
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Relevant Examination Findings
            </label>
            <textarea
              rows={3}
              value={clinical.examinationFindings}
              onChange={(e) =>
                setClinical({ ...clinical, examinationFindings: e.target.value })
              }
              placeholder="Vitals, physical exam observations, range of motion..."
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
            />
          </div>
        </div>
      </AccordionSection>

      {/* ACCORDION 3: CONSULTATION NOTES */}
      <AccordionSection
        id="new-ref-sec3"
        title="3. Consultation Notes"
        subtitle="Paste encounter notes to auto-populate structured referral fields, or enter and approve physician consultation notes."
        isOpen={openSections.sec3}
        onToggle={() => toggleSection('sec3')}
        statusKind={sec3Status.kind}
        statusLabel={sec3Status.label}
      >
        {/* Copy & Paste Consultation Notes -> AI Generate Referral */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <label
                htmlFor="paste-fp-notes"
                className="block text-xs font-semibold text-[#0F2942]"
              >
                Paste Family Physician Consultation Notes
              </label>
              <p className="text-xs text-slate-500 mt-0.5">
                Convert pasted free-text visit notes into editable referral fields without fabricating unstated clinical facts.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setPastedRawNotes(SAMPLE_PASTED_CONSULTATION_NOTES)}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg"
              >
                Insert Sample Note
              </button>
              <button
                type="button"
                disabled={isGeneratingFromNotes || !pastedRawNotes.trim()}
                onClick={() => void handleGenerateReferralFromNotes()}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0F2942] hover:bg-[#173A5C] disabled:opacity-45 rounded-lg inline-flex items-center gap-1.5"
              >
                {isGeneratingFromNotes ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-teal-300" />
                )}
                <span>
                  {isGeneratingFromNotes ? 'Generating Referral...' : 'Generate Referral from Notes'}
                </span>
              </button>
            </div>
          </div>

          <textarea
            id="paste-fp-notes"
            rows={4}
            value={pastedRawNotes}
            onChange={(e) => setPastedRawNotes(e.target.value)}
            placeholder="Copy and paste your consultation notes, patient history, symptoms, examination findings, allergies, suspected diagnosis, investigations, and treatment plan here."
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
          />

          {generatedNotesReport && (
            <div className="p-3.5 bg-white border border-teal-200 rounded-lg space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-teal-900">
                <span>
                  AI Extraction Completed ({generatedNotesReport.engineMode === 'gemini' ? 'Gemini AI' : 'Clinical Rules'}) · Urgency: {generatedNotesReport.recommendedUrgency}
                </span>
                <span className="text-[11px] font-normal text-slate-500">
                  All clinical & referral fields remain fully editable
                </span>
              </div>
              {generatedNotesReport.uncertainSections.length > 0 && (
                <div className="text-amber-800">
                  <strong>Missing / Needs Physician Confirmation:</strong>{' '}
                  {generatedNotesReport.uncertainSections.join('; ')}
                </div>
              )}
              <div className="text-[11px] text-slate-500 italic">
                {generatedNotesReport.disclaimer}
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            Concise Referral Summary (Visible in Stage 1 Anonymous Preview)
          </label>
          <textarea
            rows={2}
            value={clinical.referralSummary ?? ''}
            onChange={(e) =>
              setClinical({ ...clinical, referralSummary: e.target.value })
            }
            placeholder="Brief clinical overview summarizing reason, confirmed vs suspected findings, and key question..."
            className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
          />
        </div>

        <ConsultationNotesPanel
          value={consultationNotes}
          specialty={selectedSpecialist.specialty}
          physicianName={`${referringContact.physicianName}, ${referringContact.credentials}`}
          patient={patient}
          clinicalInput={clinical}
          documents={documents}
          onChange={(next) => {
            setConsultationNotes(next);
            setAnalysis(null);
          }}
          onApplyPhysicianNotesToClinical={applyPhysicianNotesToClinical}
          showToast={showToast}
        />
      </AccordionSection>

      {/* ACCORDION 4: REFERRAL DETAILS */}
      <AccordionSection
        id="new-ref-sec4"
        title="4. Referral Details"
        subtitle="Reason for referral, urgency level, clinical questions, and AI-assisted or manual specialist clinic selection."
        isOpen={openSections.sec4}
        onToggle={() => toggleSection('sec4')}
        statusKind={sec4Status.kind}
        statusLabel={sec4Status.label}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Reason for Referral *
            </label>
            <input
              type="text"
              value={clinical.reasonForReferral}
              onChange={(e) =>
                setClinical({ ...clinical, reasonForReferral: e.target.value })
              }
              placeholder="Primary consultation question for the specialist..."
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Referral Urgency Level
            </label>
            <select
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as ReferralUrgency)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
            >
              <option value="Routine">Routine</option>
              <option value="Semi-Urgent">Semi-Urgent</option>
              <option value="Urgent">Urgent</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Specific Clinical Questions for Specialist
            </label>
            <input
              type="text"
              value={clinical.clinicalQuestionsForSpecialist ?? ''}
              onChange={(e) =>
                setClinical({ ...clinical, clinicalQuestionsForSpecialist: e.target.value })
              }
              placeholder="e.g., Diagnostic workup guidance, medication adjustment, procedural candidacy..."
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Additional Scheduling / Coordination Notes
            </label>
            <input
              type="text"
              value={clinical.additionalNotes}
              onChange={(e) =>
                setClinical({ ...clinical, additionalNotes: e.target.value })
              }
              placeholder="Scheduling preferences, accessibility needs, or coordination notes..."
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
            />
          </div>
        </div>

        {/* AI Specialist Matching Panel */}
        <SpecialistFinderPanel
          patient={patient}
          clinical={clinical}
          consultationNotes={consultationNotes}
          documents={documents}
          specialists={specialists}
          selectedSpecialistId={selectedSpecialistId}
          initialBundle={aiRecommendations}
          currentSpecialtyHint={selectedSpecialist.specialty}
          onBundleGenerated={(bundle) => setAiRecommendations(bundle)}
          onSelectSpecialist={(spId, bundle) => {
            setSelectedSpecialistId(spId);
            setAiRecommendations(bundle);
            setAnalysis(null);
            setDocumentsComplete(false);
            setDocFeedback(null);
            const picked = specialists.find((s) => s.id === spId);
            if (picked) {
              showToast(
                `Selected ${picked.name} (${picked.clinic}). Intake checklist updated automatically.`
              );
            }
          }}
        />

        {/* Directory Selection */}
        <div className="pt-4 border-t border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Receiving Specialist Directory ({filteredSpecialists.length})
              </h3>
              <p className="text-xs text-slate-500">
                Selected: <span className="font-semibold text-slate-800">{selectedSpecialist.name}</span> ({selectedSpecialist.specialty} · {selectedSpecialist.clinic})
              </p>
            </div>
            <span className="text-xs text-amber-800 font-medium">
              Wait times & distances shown are fictional demo estimates
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={specSearch}
                onChange={(e) => setSpecSearch(e.target.value)}
                placeholder="Filter by specialist or clinic name..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#0F2942]"
              />
            </div>

            <select
              value={specFilter}
              onChange={(e) => setSpecFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
            >
              <option value="All">All Specialties</option>
              {Array.from(new Set(specialists.map((s) => s.specialty))).map((sp) => (
                <option key={sp} value={sp}>
                  {sp}
                </option>
              ))}
            </select>

            <select
              value={locFilter}
              onChange={(e) => setLocFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
            >
              <option value="All">All Locations</option>
              {Array.from(new Set(specialists.map((s) => s.location))).map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>

            <select
              value={waitFilter}
              onChange={(e) => setWaitFilter(e.target.value as 'all' | 'fast')}
              className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
            >
              <option value="all">Any Estimated Wait</option>
              <option value="fast">Est. Wait ≤ 4 Weeks</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredSpecialists.map((sp) => {
              const selected = sp.id === selectedSpecialistId;
              return (
                <button
                  key={sp.id}
                  type="button"
                  onClick={() => {
                    setSelectedSpecialistId(sp.id);
                    setAnalysis(null);
                    setDocumentsComplete(false);
                    setDocFeedback(null);
                  }}
                  className={`text-left bg-white rounded-xl p-4 border transition-colors ${
                    selected
                      ? 'border-[#0F2942] ring-1 ring-[#0F2942]'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium text-teal-700">
                        {sp.specialty} · {sp.subspecialties.join(', ')}
                      </div>
                      <div className="font-display text-sm font-semibold text-slate-900 mt-0.5">
                        {sp.name}, {sp.credentials}
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5">{sp.clinic}</div>
                    </div>
                    {selected && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F2942]">
                        <CheckCircle2 className="w-4 h-4 text-teal-700" />
                        Selected
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {sp.location}
                      {sp.distanceLabel ? ` · ${sp.distanceLabel}` : ''}
                    </span>
                    <span className="font-mono font-medium text-slate-800">
                      Est. wait: {sp.estimatedWait}
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-slate-600">
                    <span className="font-medium text-slate-800">Intake requirements: </span>
                    {sp.intakeRequirements.join(' · ')}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </AccordionSection>

      {/* ACCORDION 5: INVESTIGATIONS AND DOCUMENTS */}
      <AccordionSection
        id="new-ref-sec5"
        title="5. Investigations and Documents"
        subtitle="Laboratory/imaging results, uploaded medical reports, and clinic intake document checklist verification."
        isOpen={openSections.sec5}
        onToggle={() => toggleSection('sec5')}
        statusKind={sec5Status.kind}
        statusLabel={sec5Status.label}
      >
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            Relevant Investigations (Labs, ECG, Imaging Summaries)
          </label>
          <textarea
            rows={3}
            value={clinical.investigations}
            onChange={(e) =>
              setClinical({ ...clinical, investigations: e.target.value })
            }
            placeholder="Labs, ECG, ultrasound/MRI findings, dates..."
            className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
          />
        </div>

        {/* Document Attachment Workflow */}
        <div className="pt-3 border-t border-slate-100 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Attached Clinical Documents ({documents.length})
              </h3>
              <p className="text-xs text-slate-500">
                Attach lab summaries, progress notes, or PDF reports for AI source extraction.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addSampleEcgAttachment}
                className="px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg transition-colors"
              >
                + Attach Sample 12-Lead ECG
              </button>
              <label className="cursor-pointer px-3 py-1.5 text-xs font-medium text-[#0F2942] bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload File</span>
                <input
                  type="file"
                  multiple
                  accept=".txt,.pdf,.doc,.docx,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {documents.length > 0 && (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="p-3 bg-slate-50/70 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-900">
                      <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{doc.name}</span>
                      <span className="font-mono text-slate-400">{doc.sizeLabel}</span>
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2">{doc.contentText}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeDocument(doc.id)}
                    aria-label={`Remove ${doc.name}`}
                    className="p-1 text-slate-400 hover:text-rose-600 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Specialty Intake Checklist */}
        <div className="pt-4 border-t border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-[#0F2942]" />
              <h3 className="font-display text-sm font-semibold text-slate-900">
                {selectedSpecialist.specialty} Intake Checklist ({selectedSpecialist.clinic})
              </h3>
            </div>
            <button
              type="button"
              onClick={handleMarkDraftDocumentsComplete}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg inline-flex items-center gap-1.5 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Mark Documents Complete</span>
            </button>
          </div>

          {docFeedback && (
            <div
              className={`p-3.5 border rounded-lg text-xs space-y-1.5 ${
                docFeedback.type === 'error'
                  ? 'bg-rose-50/80 border-rose-200 text-rose-900'
                  : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
              }`}
            >
              <div className="font-semibold flex items-center gap-2">
                {docFeedback.type === 'error' ? (
                  <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                )}
                <span>{docFeedback.message}</span>
              </div>
              {docFeedback.unresolved && docFeedback.unresolved.length > 0 && (
                <ul className="list-disc list-inside pl-6 text-rose-800 space-y-0.5">
                  {docFeedback.unresolved.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {documentsComplete && !docFeedback && (
            <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                Supporting documents have been marked as collected. You can now review and submit the referral.
              </span>
            </div>
          )}

          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
            {liveAnalysis.checklist.map((chk) => {
              const isUnresolved =
                chk.status === 'Missing' || chk.status === 'Needs clarification';
              const editingExc = exceptionRowId === chk.id;
              return (
                <div key={chk.id} className="p-3.5 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                      <div className="flex flex-wrap items-center gap-2 self-start sm:self-center shrink-0">
                        <button
                          type="button"
                          onClick={() => verifyChecklistRow(chk.id)}
                          className="px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-md whitespace-nowrap"
                        >
                          Clinician Verify
                        </button>
                        {isUnresolved && (
                          <button
                            type="button"
                            onClick={() => {
                              setExceptionRowId(editingExc ? null : chk.id);
                              setExceptionText('');
                            }}
                            className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap"
                          >
                            Mark N/A / Exception
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {editingExc && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={exceptionText}
                        onChange={(e) => setExceptionText(e.target.value)}
                        placeholder="Reason not applicable (e.g., No prior biopsy performed)..."
                        className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setExceptionRowId(null)}
                          className="px-2.5 py-1 text-xs text-slate-600"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => recordDraftException(chk.id, exceptionText)}
                          className="px-3 py-1 text-xs font-medium text-white bg-[#0F2942] rounded-md"
                        >
                          Save Exception
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </AccordionSection>

      {/* ACCORDION 6: REFERRAL REVIEW AND SUBMISSION */}
      <AccordionSection
        id="new-ref-sec6"
        title="6. Referral Review and Submission"
        subtitle="Complete summary of entered information, highlighted missing items, AI source traceability, clinician attestation, and submission."
        isOpen={openSections.sec6}
        onToggle={() => toggleSection('sec6')}
        statusKind={sec6Status.kind}
        statusLabel={sec6Status.label}
      >
        {/* Highlight Missing Required Information */}
        {allCriticalMissing.length > 0 && (
          <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2.5">
            <div className="text-xs font-semibold text-amber-950 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                Highlighted Missing or Unverified Information ({allCriticalMissing.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {allCriticalMissing.map((item) => (
                <button
                  key={`${item.section}-${item.label}`}
                  type="button"
                  onClick={() => jumpToSection(item.section)}
                  className="px-2.5 py-1 text-xs font-medium text-amber-950 bg-white border border-amber-300 hover:border-amber-500 rounded-md transition-colors"
                >
                  {item.label} →
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Complete Live Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm">
          <div className="space-y-1">
            <div className="text-xs text-slate-500">Patient & Insurance</div>
            <div className="font-semibold text-slate-900">
              {patient.name || 'Unnamed Demo Patient'}
            </div>
            <div className="text-xs text-slate-600 font-mono tabular-nums">
              {typeof patient.age === 'number' ? `Age ${patient.age} · ` : ''}
              DOB: {patient.dob || 'Not specified'} · {patient.id}
            </div>
            <div className="text-xs text-slate-700">
              Insurance:{' '}
              <span
                className={
                  insVerif === 'Verified'
                    ? 'font-semibold text-emerald-700'
                    : 'font-semibold text-amber-700'
                }
              >
                {insVerif}
              </span>
              {insurance.providerName ? ` (${insurance.providerName})` : ''}
            </div>
            <button
              type="button"
              onClick={() => jumpToSection('sec1')}
              className="text-xs font-medium text-[#0F2942] hover:underline"
            >
              Edit Patient & Insurance
            </button>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-slate-500">Clinical Snapshot</div>
            <div className="text-xs text-slate-800">
              <strong>Symptoms:</strong>{' '}
              {clinical.presentingSymptoms || 'Not entered'}
            </div>
            <div className="text-xs text-slate-800">
              <strong>Allergies:</strong>{' '}
              {clinical.allergies?.trim() || 'Not entered'}
            </div>
            <div className="text-xs text-slate-800">
              <strong>Medications:</strong>{' '}
              {clinical.currentMedications || 'None listed'}
            </div>
            <button
              type="button"
              onClick={() => jumpToSection('sec2')}
              className="text-xs font-medium text-[#0F2942] hover:underline"
            >
              Edit Clinical Info
            </button>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-slate-500">Receiving Specialist & Urgency</div>
            <div className="font-semibold text-slate-900">
              {selectedSpecialist.name}
            </div>
            <div className="text-xs text-slate-600">
              {selectedSpecialist.specialty} · {selectedSpecialist.clinic}
            </div>
            <div className="text-xs text-slate-700">
              Urgency: <strong>{urgency}</strong> · {documents.length} attachment(s)
            </div>
            <button
              type="button"
              onClick={() => jumpToSection('sec4')}
              className="text-xs font-medium text-[#0F2942] hover:underline"
            >
              Change Specialist or Details
            </button>
          </div>
        </div>

        {/* AI Referral Intelligence Control & Verification */}
        <div className="border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                AI Referral Intelligence & Completeness Verification
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Verifying supplied clinical information against {selectedSpecialist.name}’s{' '}
                {selectedSpecialist.specialty} intake criteria.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start">
              <CompletenessMeter value={liveAnalysis.completenessScore} />
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  disabled={isAnalyzing}
                  onClick={() => {
                    setPreferDeterministic(false);
                    void runAiAnalysis(false);
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    !preferDeterministic
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Live AI (Gemini)
                </button>
                <button
                  type="button"
                  disabled={isAnalyzing}
                  onClick={() => {
                    setPreferDeterministic(true);
                    void runAiAnalysis(true);
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    preferDeterministic
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Local Rules
                </button>
              </div>
              <button
                type="button"
                disabled={isAnalyzing}
                onClick={() => void runAiAnalysis()}
                className="px-3.5 py-1.5 text-xs font-medium text-[#0F2942] bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                {isAnalyzing ? 'Analyzing...' : 'Run AI Verification'}
              </button>
            </div>
          </div>

          {analysisNotice && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              {analysisNotice}
            </div>
          )}

          {isAnalyzing ? (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2.5 text-sm font-medium text-[#0F2942]">
                <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
                <span>Structuring clinical referral packet and verifying source traceability...</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                {[
                  '1. Parsing clinical fields & attachments',
                  '2. Checking specialty intake criteria',
                  '3. Detecting gaps & dosage conflicts',
                  '4. Linking verbatim source excerpts',
                ].map((label, idx) => {
                  const done = analysisPhase > idx + 1;
                  const active = analysisPhase === idx + 1;
                  return (
                    <div
                      key={label}
                      className={`p-2.5 rounded-lg border ${
                        done
                          ? 'bg-teal-50 border-teal-200 text-teal-900'
                          : active
                            ? 'bg-white border-[#0F2942] text-slate-900 font-medium'
                            : 'bg-white border-slate-200 text-slate-400'
                      }`}
                    >
                      {label}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-xs text-slate-500">
                Engine: <span className="font-medium text-slate-800">{liveAnalysis.engineLabel}</span>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">
                {liveAnalysis.executiveSummary}
              </p>

              {(liveAnalysis.missingItems.length > 0 || liveAnalysis.ambiguityFlags.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {liveAnalysis.missingItems.length > 0 && (
                    <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-lg space-y-1.5">
                      <div className="text-xs font-semibold text-rose-900 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-700" />
                        <span>Missing Intake Documentation ({liveAnalysis.missingItems.length})</span>
                      </div>
                      <ul className="text-xs text-rose-800 space-y-1 list-disc list-inside">
                        {liveAnalysis.missingItems.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() => jumpToSection('sec5')}
                        className="text-xs font-medium text-rose-900 underline pt-1"
                      >
                        Jump to Section 5 to attach missing files
                      </button>
                    </div>
                  )}

                  {liveAnalysis.ambiguityFlags.map((flag) => (
                    <div
                      key={flag.id}
                      className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-lg space-y-1"
                    >
                      <div className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-700" />
                        <span>{flag.title}</span>
                      </div>
                      <p className="text-xs text-amber-800 leading-relaxed">
                        {flag.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                <div className="xl:col-span-7 border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                  {liveAnalysis.extractedItems.map((item) => {
                    const active = selectedSourceItem?.id === item.id;
                    const isEditing = editingExtractId === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedSourceId(item.id)}
                        className={`p-3.5 cursor-pointer transition-colors ${
                          active ? 'bg-slate-50' : 'hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs text-slate-500">
                            <span className="font-medium text-slate-800">{item.section}</span>
                            <span aria-hidden="true" className="mx-1.5">
                              ·
                            </span>
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
                              rows={2}
                              value={extractDraftText}
                              onChange={(e) => setExtractDraftText(e.target.value)}
                              className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingExtractId(null)}
                                className="text-xs text-slate-600"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => saveExtractEdit(item.id)}
                                className="px-2.5 py-1 text-xs font-medium text-white bg-[#0F2942] rounded"
                              >
                                Save & Verify
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-slate-900 mt-1 leading-relaxed">
                            {item.value}
                          </p>
                        )}

                        <div
                          className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-slate-500">
                            Source: <span className="text-slate-700">{item.sourceLabel}</span>
                          </span>
                          {!isEditing && analysis && (
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingExtractId(item.id);
                                  setExtractDraftText(item.value);
                                }}
                                className="text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
                              >
                                <Edit3 className="w-3 h-3" />
                                Edit
                              </button>
                              {item.verificationState !== 'Clinician verified' &&
                                item.verificationState !== 'Missing' && (
                                  <button
                                    type="button"
                                    onClick={() => verifyExtracted(item.id)}
                                    className="font-medium text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    Verify
                                  </button>
                                )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Source Traceability Inspector */}
                <div className="xl:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <div>
                      <h4 className="font-display text-sm font-semibold text-slate-900">
                        Source Traceability Panel
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Click any extracted item to inspect verbatim source text
                      </p>
                    </div>
                    <SearchCode className="w-4 h-4 text-teal-700" />
                  </div>

                  {selectedSourceItem ? (
                    <div className="space-y-2.5">
                      <div className="text-xs font-medium text-slate-800">
                        {selectedSourceItem.section} · {selectedSourceItem.label}
                      </div>
                      <div className="p-3 bg-white border border-slate-200 rounded-lg">
                        <div className="text-[11px] font-mono font-medium text-teal-800 mb-1">
                          {selectedSourceItem.sourceLabel}
                        </div>
                        <blockquote className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                          “{selectedSourceItem.sourceExcerpt}”
                        </blockquote>
                      </div>
                      <div className="text-xs text-slate-600 leading-relaxed">
                        <span className="font-medium text-slate-800">Why relevant: </span>
                        {selectedSourceItem.relevanceNote}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 py-3">
                      Select an extracted clinical row to inspect its source excerpt.
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-500 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span>{liveAnalysis.sourceTraceabilityNotice}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Patient-facing instructions */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            Clinician-Approved Patient Portal Guidance
          </label>
          <textarea
            rows={2}
            value={patientGuidance}
            onChange={(e) => setPatientGuidance(e.target.value)}
            className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
          />
        </div>

        {/* Clinician Attestation */}
        <label className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
          <input
            type="checkbox"
            checked={physicianAttested}
            onChange={(e) => setPhysicianAttested(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#0F2942]"
          />
          <span className="text-xs text-slate-700 leading-relaxed">
            <span className="font-semibold text-slate-900 block mb-0.5">
              Clinician Verification & Approval Attestation
            </span>
            I confirm that I have reviewed this structured referral summary, acknowledge any flagged missing documentation, and approve referral submission as {settings.physicianName}. (Demo simulation — no real clinical transmission occurs.)
          </span>
        </label>

        <div className="pt-1 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => submitReferral(true)}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
          >
            Save as Draft
          </button>
          <button
            type="button"
            disabled={!physicianAttested}
            onClick={() => submitReferral(false)}
            className="px-5 py-2 text-sm font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] disabled:opacity-45 disabled:cursor-not-allowed rounded-lg transition-colors inline-flex items-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Approve & Submit Referral</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </AccordionSection>
    </div>
  );
};
