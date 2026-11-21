import type {
  AIAnalysisResult,
  AiNoteSourceType,
  AmbiguityFlag,
  ChecklistItem,
  ClinicalInput,
  ConsultationNotesBundle,
  ExtractedSummaryItem,
  PatientInfo,
  PhysicianConsultationNotes,
  Specialist,
  SpecialtyHighlightItem,
  StructuredConsultationDraft,
  UploadedDocument,
} from '../types/clinbridge';

interface SourceChunk {
  sourceLabel: string;
  text: string;
}

export const BASELINE_SPECIALTY_REQUIREMENTS: Record<string, string[]> = {
  Dermatology: [
    'Lesion morphology, dimensions, and duration notes',
    'Relevant medical & family skin history',
    'Topical or systemic treatment history',
  ],
  Orthopedics: [
    'Weight-bearing X-ray or MRI report',
    'Physical exam & range-of-motion notes',
    'Prior physiotherapy / conservative treatment summary',
  ],
  Cardiology: [
    '12-lead ECG (within 90 days)',
    'Lipid panel & HbA1c labs',
    'Current cardiac medication list',
    'Blood pressure readings & physical exam vitals',
  ],
  Neurology: [
    'Focused neurological examination findings',
    'Prior brain MRI or CT report (if completed)',
    'Medication trial history',
    'Symptom onset & frequency log',
  ],
  Endocrinology: [
    'TSH, Free T4, or HbA1c lab panel (within 60 days)',
    'Thyroid ultrasound report (if nodule present)',
    'Current endocrine medications & dosages',
  ],
  Gastroenterology: [
    'CBC, ferritin, and liver enzyme panel',
    'Prior endoscopy or colonoscopy report (if applicable)',
    'PPI or GI medication history',
  ],
  General: [
    'Clear reason for referral and clinical question',
    'Symptom history and focused physical exam notes',
    'Current medications and prior treatment summary',
  ],
};

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;\n])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function collectMatchingLines(
  lines: string[],
  headingPrefixes: string[],
  keywords: string[]
): string[] {
  const matched: string[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    const hasHeading = headingPrefixes.some((p) => lower.startsWith(p));
    const hasKeyword = keywords.some((kw) => lower.includes(kw));
    if (hasHeading || hasKeyword) {
      matched.push(line);
    }
  }
  return matched;
}

export function buildReferralInputsSummaryText(params: {
  patient: PatientInfo;
  clinical: ClinicalInput;
  physicianWritten?: PhysicianConsultationNotes;
  documents: UploadedDocument[];
  specialty: string;
}): string {
  const { patient, clinical, physicianWritten: pw, documents, specialty } = params;
  const lines: string[] = [
    `Specialty Focus: ${specialty}`,
    `Patient: ${patient.name || 'Unnamed patient'}${
      typeof patient.age === 'number' ? `, Age ${patient.age}` : ''
    }`,
  ];
  if (patient.medicalBackground.trim()) {
    lines.push(`Patient Background: ${patient.medicalBackground.trim()}`);
  }
  if (clinical.reasonForReferral.trim()) {
    lines.push(`Referral Reason: ${clinical.reasonForReferral.trim()}`);
  }
  if (clinical.presentingSymptoms.trim()) {
    lines.push(`Presenting Symptoms: ${clinical.presentingSymptoms.trim()}`);
  }
  if (clinical.clinicalHistory.trim()) {
    lines.push(`Clinical History: ${clinical.clinicalHistory.trim()}`);
  }
  if (clinical.previousTreatments.trim()) {
    lines.push(`Previous Treatments: ${clinical.previousTreatments.trim()}`);
  }
  if (clinical.currentMedications.trim()) {
    lines.push(`Current Medications: ${clinical.currentMedications.trim()}`);
  }
  if (clinical.allergies?.trim()) {
    lines.push(`Allergies: ${clinical.allergies.trim()}`);
  }
  if (clinical.examinationFindings.trim()) {
    lines.push(`Examination Findings: ${clinical.examinationFindings.trim()}`);
  }
  if (clinical.investigations.trim()) {
    lines.push(`Investigations: ${clinical.investigations.trim()}`);
  }
  if (pw) {
    if (pw.reasonForConsultation.trim()) {
      lines.push(`Physician Note (Reason): ${pw.reasonForConsultation.trim()}`);
    }
    if (pw.patientReportedSymptoms.trim()) {
      lines.push(`Physician Note (Symptoms): ${pw.patientReportedSymptoms.trim()}`);
    }
    if (pw.relevantMedicalHistory.trim()) {
      lines.push(`Physician Note (History): ${pw.relevantMedicalHistory.trim()}`);
    }
    if (pw.previousTreatmentsDiscussed.trim()) {
      lines.push(`Physician Note (Prior Treatments): ${pw.previousTreatmentsDiscussed.trim()}`);
    }
    if (pw.physicianObservations.trim()) {
      lines.push(`Physician Note (Observations): ${pw.physicianObservations.trim()}`);
    }
    if (pw.physicianAssessment.trim()) {
      lines.push(`Physician Note (Assessment): ${pw.physicianAssessment.trim()}`);
    }
    if (pw.treatmentPlanAndNextSteps.trim()) {
      lines.push(`Physician Note (Plan): ${pw.treatmentPlanAndNextSteps.trim()}`);
    }
    if (pw.followUpInstructions.trim()) {
      lines.push(`Physician Note (Follow-Up): ${pw.followUpInstructions.trim()}`);
    }
  }
  if (documents.length > 0) {
    lines.push(
      `Supporting Reports (${documents.length}): ${documents
        .map((d) => `${d.name} — ${d.contentText.replace(/\s+/g, ' ').trim().slice(0, 180)}`)
        .join(' | ')}`
    );
  }
  return lines.join('\n');
}

function mergeDistinctPhrases(candidates: Array<string | undefined>): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of candidates) {
    const val = (raw ?? '').trim();
    if (!val) continue;
    const norm = val.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
    if (seen.has(norm)) continue;
    const isSubsumed = kept.some((existing) =>
      existing.toLowerCase().includes(val.toLowerCase())
    );
    if (isSubsumed) continue;
    seen.add(norm);
    kept.push(val);
  }
  return kept.join(' ');
}

export function generateAiConsultationNoteDeterministic(params: {
  patient: PatientInfo;
  clinical: ClinicalInput;
  physicianWritten?: PhysicianConsultationNotes;
  documents: UploadedDocument[];
  specialty: string;
}): StructuredConsultationDraft {
  const { patient, clinical, physicianWritten: pw, documents, specialty } = params;
  const specClean = specialty.trim() || 'General';
  const specLower = specClean.toLowerCase();

  const sourceQuotes: Record<string, string> = {};
  const uncertainOrIncompleteItems: string[] = [];
  const supportedReferralFields: string[] = [];

  // 1. Main reason
  const mainReasonForConsultation =
    mergeDistinctPhrases([pw?.reasonForConsultation, clinical.reasonForReferral]) ||
    'Not provided in current referral record.';
  if (pw?.reasonForConsultation.trim()) {
    sourceQuotes.mainReasonForConsultation = pw.reasonForConsultation.trim();
  } else if (clinical.reasonForReferral.trim()) {
    sourceQuotes.mainReasonForConsultation = clinical.reasonForReferral.trim();
  }
  if (!mainReasonForConsultation.startsWith('Not provided')) {
    supportedReferralFields.push('Reason for Referral');
  } else {
    uncertainOrIncompleteItems.push('Primary reason for referral has not been documented.');
  }

  // 2. Patient-reported symptoms
  const patientReportedSymptoms =
    mergeDistinctPhrases([pw?.patientReportedSymptoms, clinical.presentingSymptoms]) ||
    'Not provided in current referral record.';
  if (pw?.patientReportedSymptoms.trim()) {
    sourceQuotes.patientReportedSymptoms = pw.patientReportedSymptoms.trim();
  } else if (clinical.presentingSymptoms.trim()) {
    sourceQuotes.patientReportedSymptoms = clinical.presentingSymptoms.trim();
  }
  if (!patientReportedSymptoms.startsWith('Not provided')) {
    supportedReferralFields.push('Presenting Symptoms');
  } else {
    uncertainOrIncompleteItems.push('Patient-reported symptoms and duration were not entered.');
  }

  // 3. Relevant medical history
  const relevantMedicalHistory =
    mergeDistinctPhrases([
      pw?.relevantMedicalHistory,
      clinical.clinicalHistory,
      patient.medicalBackground,
    ]) || 'Not provided in current referral record.';
  if (pw?.relevantMedicalHistory.trim()) {
    sourceQuotes.relevantMedicalHistory = pw.relevantMedicalHistory.trim();
  } else if (clinical.clinicalHistory.trim()) {
    sourceQuotes.relevantMedicalHistory = clinical.clinicalHistory.trim();
  } else if (patient.medicalBackground.trim()) {
    sourceQuotes.relevantMedicalHistory = patient.medicalBackground.trim();
  }
  if (!relevantMedicalHistory.startsWith('Not provided')) {
    supportedReferralFields.push('Relevant Medical History');
  } else {
    uncertainOrIncompleteItems.push('Relevant medical history was not documented.');
  }

  // 4. Previous treatments & current medications
  const previousTreatmentsDiscussed =
    mergeDistinctPhrases([
      pw?.previousTreatmentsDiscussed,
      clinical.previousTreatments,
      clinical.currentMedications.trim()
        ? `Current medications: ${clinical.currentMedications.trim()}`
        : '',
    ]) || 'Not provided in current referral record.';
  if (pw?.previousTreatmentsDiscussed.trim()) {
    sourceQuotes.previousTreatmentsDiscussed = pw.previousTreatmentsDiscussed.trim();
  } else if (clinical.previousTreatments.trim()) {
    sourceQuotes.previousTreatmentsDiscussed = clinical.previousTreatments.trim();
  } else if (clinical.currentMedications.trim()) {
    sourceQuotes.previousTreatmentsDiscussed = clinical.currentMedications.trim();
  }
  if (!previousTreatmentsDiscussed.startsWith('Not provided')) {
    supportedReferralFields.push('Previous Treatments & Medications');
  } else {
    uncertainOrIncompleteItems.push(
      'Prior treatments or medication trials were not documented in physician notes or clinical fields.'
    );
  }

  // 5. Supporting report findings (strictly extracted from documents + investigations field)
  const docSummaries = documents.map((d) => {
    const cleanText = d.contentText.replace(/\s+/g, ' ').trim();
    return `${d.name}: ${cleanText}`;
  });
  const supportingReportFindings =
    mergeDistinctPhrases([
      ...docSummaries,
      clinical.investigations.trim() && documents.length === 0
        ? `Entered investigations summary: ${clinical.investigations.trim()}`
        : clinical.investigations.trim(),
    ]) || 'No supporting medical reports or investigation results provided yet.';
  if (documents.length > 0) {
    sourceQuotes.supportingReportFindings = documents[0].contentText.replace(/\s+/g, ' ').trim();
    supportedReferralFields.push(`Supporting Reports (${documents.length})`);
  } else if (clinical.investigations.trim()) {
    sourceQuotes.supportingReportFindings = clinical.investigations.trim();
    supportedReferralFields.push('Investigations Summary');
  } else {
    uncertainOrIncompleteItems.push('No supporting lab, imaging, or clinical reports attached yet.');
  }

  // 6. Physician observations
  const physicianObservations =
    mergeDistinctPhrases([pw?.physicianObservations, clinical.examinationFindings]) ||
    'Not provided in current referral record.';
  if (pw?.physicianObservations.trim()) {
    sourceQuotes.physicianObservations = pw.physicianObservations.trim();
  } else if (clinical.examinationFindings.trim()) {
    sourceQuotes.physicianObservations = clinical.examinationFindings.trim();
  }
  if (!physicianObservations.startsWith('Not provided')) {
    supportedReferralFields.push('Physician Observations');
  } else {
    uncertainOrIncompleteItems.push('Objective physician examination findings or vitals were not entered.');
  }

  // 7. Physician assessment
  const physicianAssessment =
    pw?.physicianAssessment.trim() ||
    'Not explicitly documented in physician assessment field — physician review required.';
  if (pw?.physicianAssessment.trim()) {
    sourceQuotes.physicianAssessment = pw.physicianAssessment.trim();
    supportedReferralFields.push('Physician Assessment');
  } else {
    uncertainOrIncompleteItems.push(
      'Referring physician working assessment was not explicitly recorded and requires clinician confirmation.'
    );
  }

  // 8. Plan & follow-up instructions
  const planAndFollowUpInstructions =
    mergeDistinctPhrases([
      pw?.treatmentPlanAndNextSteps,
      pw?.followUpInstructions ? `Follow-up: ${pw.followUpInstructions.trim()}` : '',
      !pw?.treatmentPlanAndNextSteps.trim() ? clinical.additionalNotes : '',
    ]) || 'Not provided in current referral record.';
  if (pw?.treatmentPlanAndNextSteps.trim()) {
    sourceQuotes.planAndFollowUpInstructions = pw.treatmentPlanAndNextSteps.trim();
  } else if (pw?.followUpInstructions.trim()) {
    sourceQuotes.planAndFollowUpInstructions = pw.followUpInstructions.trim();
  } else if (clinical.additionalNotes.trim()) {
    sourceQuotes.planAndFollowUpInstructions = clinical.additionalNotes.trim();
  }

  // Uncertainty, pending studies, and medication discrepancies
  const combinedSourceChunks = collectSources(patient, clinical, documents, {
    physicianWritten: pw,
    aiNotes: [],
  });
  const combinedLower = combinedSourceChunks.map((c) => c.text.toLowerCase()).join(' ');
  if (
    combinedLower.includes('pending') ||
    combinedLower.includes('not yet') ||
    combinedLower.includes('ordered') ||
    combinedLower.includes('missing')
  ) {
    uncertainOrIncompleteItems.push(
      'Source notes reference pending, ordered, or unretrieved external results.'
    );
  }
  if (
    combinedLower.includes('unclear') ||
    combinedLower.includes('unsure') ||
    combinedLower.includes('unknown') ||
    combinedLower.includes('possibly')
  ) {
    uncertainOrIncompleteItems.push(
      'Provisional or uncertain wording ("unclear", "unsure", "unknown", or "possibly") appears in source notes — confirm prior to submission.'
    );
  }
  const doseDiscrepancy = detectDosageDiscrepancy(combinedSourceChunks);
  if (doseDiscrepancy) {
    uncertainOrIncompleteItems.push(
      `${doseDiscrepancy.title}: ${doseDiscrepancy.description}`
    );
  }

  // Specialty-adaptive breakdown highlights (strictly derived from supplied facts)
  let specialtyContextLabel = `${specClean} Referral Summary Structure`;
  let specialtyHighlights: SpecialtyHighlightItem[] = [];

  if (specLower.includes('derm')) {
    specialtyContextLabel = 'Dermatology-Adapted Consultation Structure';
    specialtyHighlights = [
      {
        label: 'Lesion / Cutaneous Presentation & Exam',
        value:
          mergeDistinctPhrases([physicianObservations, patientReportedSymptoms]) ||
          'Not provided in current referral record.',
      },
      {
        label: 'Dermatologic & Biopsy History',
        value:
          mergeDistinctPhrases([
            relevantMedicalHistory,
            documents.length > 0 ? supportingReportFindings : undefined,
          ]) || 'No prior biopsy or dermatologic history documented.',
      },
      {
        label: 'Topical / Systemic Therapy Exposure',
        value: previousTreatmentsDiscussed,
      },
    ];
  } else if (specLower.includes('ortho')) {
    specialtyContextLabel = 'Orthopedics-Adapted Consultation Structure';
    specialtyHighlights = [
      {
        label: 'Mechanical Symptoms & Joint Examination',
        value:
          mergeDistinctPhrases([patientReportedSymptoms, physicianObservations]) ||
          'Not provided in current referral record.',
      },
      {
        label: 'Diagnostic Imaging & Rehab Reports',
        value: supportingReportFindings,
      },
      {
        label: 'Conservative & Physiotherapy Trials',
        value: previousTreatmentsDiscussed,
      },
    ];
  } else if (specLower.includes('cardio')) {
    specialtyContextLabel = 'Cardiology-Adapted Consultation Structure';
    specialtyHighlights = [
      {
        label: 'Cardiopulmonary Symptoms & Vitals',
        value:
          mergeDistinctPhrases([patientReportedSymptoms, physicianObservations]) ||
          'Not provided in current referral record.',
      },
      {
        label: 'ECG, Metabolic Labs & Cardiac Reports',
        value: supportingReportFindings,
      },
      {
        label: 'Cardiovascular Medications & Reconciliation',
        value: previousTreatmentsDiscussed,
      },
    ];
  } else {
    specialtyHighlights = [
      {
        label: 'Primary Presentation & Exam Observations',
        value: mergeDistinctPhrases([patientReportedSymptoms, physicianObservations]),
      },
      {
        label: 'Supporting Investigations & Reports',
        value: supportingReportFindings,
      },
      {
        label: 'Prior Therapies & Active Medications',
        value: previousTreatmentsDiscussed,
      },
    ];
  }

  return {
    mainReasonForConsultation,
    patientReportedSymptoms,
    relevantMedicalHistory,
    previousTreatmentsDiscussed,
    supportingReportFindings,
    physicianObservations,
    physicianAssessment,
    planAndFollowUpInstructions,
    specialtyContextLabel,
    specialtyHighlights,
    uncertainOrIncompleteItems: Array.from(new Set(uncertainOrIncompleteItems)),
    supportedReferralFields: Array.from(new Set(supportedReferralFields)),
    sourceQuotes,
  };
}

export function parseConsultationTranscriptDeterministic(
  rawContent: string,
  _sourceType: AiNoteSourceType,
  specialty = 'General'
): StructuredConsultationDraft {
  const cleaned = rawContent.trim();
  if (!cleaned) {
    return {
      mainReasonForConsultation: 'Not provided in source consultation record.',
      patientReportedSymptoms: 'Not provided in source consultation record.',
      relevantMedicalHistory: 'Not provided in source consultation record.',
      previousTreatmentsDiscussed: 'Not provided in source consultation record.',
      supportingReportFindings: 'No supporting reports referenced.',
      physicianObservations: 'Not provided in source consultation record.',
      physicianAssessment: 'Not provided in source consultation record.',
      planAndFollowUpInstructions: 'Not provided in source consultation record.',
      specialtyContextLabel: `${specialty} Referral Summary Structure`,
      uncertainOrIncompleteItems: ['Consultation source content was empty.'],
      supportedReferralFields: [],
      sourceQuotes: {},
    };
  }

  const lines = splitSentences(cleaned);
  const usedQuotes: Record<string, string> = {};

  const pickSection = (
    key: string,
    headings: string[],
    keywords: string[],
    fallbackNotice: string
  ): string => {
    const hits = collectMatchingLines(lines, headings, keywords);
    if (hits.length > 0) {
      const joined = hits.slice(0, 2).join(' ');
      usedQuotes[key] = hits[0];
      return joined;
    }
    return fallbackNotice;
  };

  const mainReasonForConsultation = pickSection(
    'mainReasonForConsultation',
    ['reason:', 'reason for visit:', 'reason for consultation:', 'chief complaint:', 'cc:', 'referral reason:'],
    ['referred for', 'consultation for', 'follow-up for', 'presents for', 'evaluation of', 'chief complaint'],
    lines[0] ?? 'Not explicitly stated in consultation record.'
  );
  if (!usedQuotes.mainReasonForConsultation && lines[0]) {
    usedQuotes.mainReasonForConsultation = lines[0];
  }

  const patientReportedSymptoms = pickSection(
    'patientReportedSymptoms',
    ['subjective:', 'patient reports:', 'symptoms:', 'hpi:', 'patient:'],
    ['reports', 'describes', 'complains of', 'experiencing', 'pain', 'palpitation', 'lesion', 'dyspnea', 'swelling', 'stiffness', 'weeks', 'months'],
    'No specific patient-reported symptoms identified.'
  );

  const relevantMedicalHistory = pickSection(
    'relevantMedicalHistory',
    ['history:', 'pmh:', 'medical history:', 'background:', 'past history:'],
    ['history of', 'hypertension', 'diabetes', 'prior', 'diagnosed', 'allerg', 'chronic', 'family history', 'melanoma', 'acl'],
    'No past medical history explicitly identified.'
  );

  const previousTreatmentsDiscussed = pickSection(
    'previousTreatmentsDiscussed',
    ['previous treatments:', 'prior treatments:', 'medications:', 'meds:', 'therapies:'],
    ['tried', 'physiotherapy', 'physio', 'cream', 'topical', 'steroid', 'trial', 'discontinued', 'taking', 'mg', 'daily', 'bid', 'nsaid', 'conservative'],
    'No prior treatments or medication trials identified.'
  );

  const physicianObservations = pickSection(
    'physicianObservations',
    ['objective:', 'exam:', 'physical exam:', 'observations:', 'vitals:', 'pe:'],
    ['bp ', 'hr ', 'blood pressure', 'exam', 'tenderness', 'rom', 'murmur', 'lesion', 'mm', 'dermoscopy', 'effusion', 'mcmurray', 'clear lungs'],
    'No objective physician observations or vitals identified.'
  );

  const physicianAssessment = pickSection(
    'physicianAssessment',
    ['assessment:', 'impression:', 'clinician impression:', 'working assessment:'],
    ['assessment', 'impression', 'consistent with', 'warrants', 'suspected', 'evaluate for', 'rule out', 'candidate for'],
    'No documented physician assessment identified (review before approving).'
  );

  const planAndFollowUpInstructions = pickSection(
    'planAndFollowUpInstructions',
    ['plan:', 'follow-up:', 'follow up:', 'next steps:', 'orders:'],
    ['refer to', 'referral', 'ordered', 'ecg', 'mri', 'x-ray', 'follow up', 'follow-up', 'return if', 'continue', 'advise'],
    'No explicit follow-up plan identified.'
  );

  const supportingReportFindings = pickSection(
    'supportingReportFindings',
    ['supporting reports:', 'investigations:', 'reports:', 'labs:'],
    ['mri', 'x-ray', 'dermoscopy', 'biopsy', 'lipid', 'ecg', 'report', 'lab'],
    'No supporting reports referenced in summary.'
  );

  const uncertainOrIncompleteItems: string[] = [];
  const lowerAll = cleaned.toLowerCase();
  if (lowerAll.includes('pending') || lowerAll.includes('ordered') || lowerAll.includes('to be done')) {
    uncertainOrIncompleteItems.push(
      'Source notes reference pending or ordered investigations whose results are not yet attached.'
    );
  }
  if (lowerAll.includes('unsure') || lowerAll.includes('unclear') || lowerAll.includes('unknown') || lowerAll.includes('possibly')) {
    uncertainOrIncompleteItems.push(
      'Uncertain or provisional phrasing ("unsure", "unclear", "unknown", or "possibly") detected — requires physician clarification.'
    );
  }
  if (physicianObservations.startsWith('No objective')) {
    uncertainOrIncompleteItems.push('Objective physical examination findings or vitals were not detected.');
  }
  if (previousTreatmentsDiscussed.startsWith('No prior')) {
    uncertainOrIncompleteItems.push('Prior treatment or medication trial history was not detected.');
  }
  if (physicianAssessment.startsWith('No documented')) {
    uncertainOrIncompleteItems.push('Physician working assessment was not explicitly stated and requires manual confirmation.');
  }

  const supportedReferralFields: string[] = [];
  if (!mainReasonForConsultation.startsWith('Not ')) supportedReferralFields.push('Reason for Referral');
  if (!patientReportedSymptoms.startsWith('No specific')) supportedReferralFields.push('Presenting Symptoms');
  if (!relevantMedicalHistory.startsWith('No past')) supportedReferralFields.push('Clinical History');
  if (!previousTreatmentsDiscussed.startsWith('No prior')) supportedReferralFields.push('Previous Treatments / Medications');
  if (!physicianObservations.startsWith('No objective')) supportedReferralFields.push('Examination Findings');

  const specLower = specialty.toLowerCase();
  if (specLower.includes('cardio') && (lowerAll.includes('ecg') || lowerAll.includes('bp') || lowerAll.includes('lipid'))) {
    supportedReferralFields.push('Cardiology Intake (ECG / BP / Cardiac Meds)');
  }
  if (specLower.includes('ortho') && (lowerAll.includes('mri') || lowerAll.includes('x-ray') || lowerAll.includes('physio') || lowerAll.includes('rom'))) {
    supportedReferralFields.push('Orthopedics Intake (Imaging / ROM / Conservative Rehab)');
  }
  if (specLower.includes('derm') && (lowerAll.includes('lesion') || lowerAll.includes('mm') || lowerAll.includes('biopsy') || lowerAll.includes('topical'))) {
    supportedReferralFields.push('Dermatology Intake (Lesion Morphology / Biopsy / Topical Tx)');
  }

  return {
    mainReasonForConsultation,
    patientReportedSymptoms,
    relevantMedicalHistory,
    previousTreatmentsDiscussed,
    supportingReportFindings,
    physicianObservations,
    physicianAssessment,
    planAndFollowUpInstructions,
    specialtyContextLabel: `${specialty} Referral Summary Structure`,
    uncertainOrIncompleteItems,
    supportedReferralFields,
    sourceQuotes: usedQuotes,
  };
}

function collectSources(
  patient: PatientInfo,
  clinical: ClinicalInput,
  documents: UploadedDocument[],
  consultationNotes?: ConsultationNotesBundle
): SourceChunk[] {
  const chunks: SourceChunk[] = [];
  if (patient.medicalBackground.trim()) {
    chunks.push({ sourceLabel: 'Patient Medical Background', text: patient.medicalBackground.trim() });
  }
  if (clinical.reasonForReferral.trim()) {
    chunks.push({ sourceLabel: 'Reason for Referral field', text: clinical.reasonForReferral.trim() });
  }
  if (clinical.presentingSymptoms.trim()) {
    chunks.push({ sourceLabel: 'Presenting Symptoms field', text: clinical.presentingSymptoms.trim() });
  }
  if (clinical.clinicalHistory.trim()) {
    chunks.push({ sourceLabel: 'Clinical History field', text: clinical.clinicalHistory.trim() });
  }
  if (clinical.previousTreatments.trim()) {
    chunks.push({ sourceLabel: 'Previous Treatments field', text: clinical.previousTreatments.trim() });
  }
  if (clinical.currentMedications.trim()) {
    chunks.push({ sourceLabel: 'Current Medications field', text: clinical.currentMedications.trim() });
  }
  if (clinical.examinationFindings.trim()) {
    chunks.push({ sourceLabel: 'Examination Findings field', text: clinical.examinationFindings.trim() });
  }
  if (clinical.investigations.trim()) {
    chunks.push({ sourceLabel: 'Investigations field', text: clinical.investigations.trim() });
  }
  if (clinical.additionalNotes.trim()) {
    chunks.push({ sourceLabel: 'Additional Notes field', text: clinical.additionalNotes.trim() });
  }

  // Feed Physician-Written Consultation Notes into the universal engine
  const pw = consultationNotes?.physicianWritten;
  if (pw) {
    if (pw.reasonForConsultation.trim()) {
      chunks.push({ sourceLabel: 'Physician Consultation Notes (Reason)', text: pw.reasonForConsultation.trim() });
    }
    if (pw.patientReportedSymptoms.trim()) {
      chunks.push({ sourceLabel: 'Physician Consultation Notes (Patient Symptoms)', text: pw.patientReportedSymptoms.trim() });
    }
    if (pw.relevantMedicalHistory.trim()) {
      chunks.push({ sourceLabel: 'Physician Consultation Notes (Medical History)', text: pw.relevantMedicalHistory.trim() });
    }
    if (pw.previousTreatmentsDiscussed.trim()) {
      chunks.push({ sourceLabel: 'Physician Consultation Notes (Previous Treatments)', text: pw.previousTreatmentsDiscussed.trim() });
    }
    if (pw.physicianObservations.trim()) {
      chunks.push({ sourceLabel: 'Physician Consultation Notes (Observations)', text: pw.physicianObservations.trim() });
    }
    if (pw.physicianAssessment.trim()) {
      chunks.push({ sourceLabel: 'Physician Consultation Notes (Assessment)', text: pw.physicianAssessment.trim() });
    }
    if (pw.treatmentPlanAndNextSteps.trim()) {
      chunks.push({ sourceLabel: 'Physician Consultation Notes (Plan)', text: pw.treatmentPlanAndNextSteps.trim() });
    }
    if (pw.followUpInstructions.trim()) {
      chunks.push({ sourceLabel: 'Physician Consultation Notes (Follow-up)', text: pw.followUpInstructions.trim() });
    }
  }

  // Feed ONLY Physician-Approved AI Consultation Notes into the engine
  const approvedAiNotes = (consultationNotes?.aiNotes ?? []).filter(
    (n) => n.reviewStatus === 'Approved'
  );
  for (const note of approvedAiNotes) {
    const labelBase = `Approved ${note.sourceType}${note.sourceFileName ? ` (${note.sourceFileName})` : ''}`;
    const s = note.structured;
    const combined = [
      s.mainReasonForConsultation,
      s.patientReportedSymptoms,
      s.relevantMedicalHistory,
      s.previousTreatmentsDiscussed,
      s.physicianObservations,
      s.physicianAssessment,
      s.planAndFollowUpInstructions,
    ]
      .filter((v) => v && !v.startsWith('No ') && !v.startsWith('Not '))
      .join(' ');
    if (combined.trim()) {
      chunks.push({ sourceLabel: labelBase, text: combined.trim() });
    }
  }

  for (const doc of documents) {
    if (doc.contentText.trim()) {
      chunks.push({ sourceLabel: `Attachment: ${doc.name}`, text: doc.contentText.trim() });
    }
  }
  return chunks;
}

function findMatchingExcerpt(
  sources: SourceChunk[],
  keywords: string[]
): { sourceLabel: string; sourceExcerpt: string } | null {
  for (const chunk of sources) {
    const sentences = chunk.text
      .split(/(?<=[.!?;\n])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if (keywords.some((kw) => lower.includes(kw))) {
        return {
          sourceLabel: chunk.sourceLabel,
          sourceExcerpt: sentence,
        };
      }
    }
  }
  return null;
}

function extractChecklistKeywords(requirement: string): string[] {
  const lower = requirement.toLowerCase();
  if (lower.includes('ecg')) return ['ecg', 'ekg', 'electrocardiogram', 'sinus', 'rhythm'];
  if (lower.includes('echocardiogram')) return ['echo', 'echocardiogram', 'ejection fraction', 'lvef', 'valv'];
  if (lower.includes('lipid')) return ['lipid', 'cholesterol', 'ldl', 'hdl', 'triglyceride', 'hba1c', 'a1c'];
  if (lower.includes('blood pressure')) return ['bp', 'blood pressure', 'mmhg', 'hypertension'];
  if (lower.includes('medication')) return ['mg', 'daily', 'bid', 'medication', 'metoprolol', 'ramipril', 'statin', 'omeprazole', 'ppi', 'levothyroxine', 'ibuprofen'];
  if (lower.includes('neurological')) return ['cranial', 'reflex', 'motor', 'sensory', 'gait', 'neurolog', 'visual field'];
  if (lower.includes('mri') || lower.includes('ct') || lower.includes('x-ray')) return ['mri', 'ct', 'x-ray', 'xray', 'radiograph', 'imaging', 'menisc'];
  if (lower.includes('symptom')) return ['pain', 'headache', 'aura', 'palpitation', 'dyspnea', 'fatigue', 'onset', 'weeks', 'months'];
  if (lower.includes('physical exam') || lower.includes('range-of-motion')) return ['exam', 'rom', 'range of motion', 'tenderness', 'mcmurray', 'swelling', 'bp ', 'hr '];
  if (lower.includes('physiotherapy') || lower.includes('conservative')) return ['physio', 'pt ', 'rehab', 'exercise', 'conservative', 'nsaid'];
  if (lower.includes('tsh') || lower.includes('thyroid')) return ['tsh', 'free t4', 'ft4', 'thyroid', 'ultrasound', 'nodule'];
  if (lower.includes('cbc') || lower.includes('ferritin') || lower.includes('liver')) return ['cbc', 'hemoglobin', 'ferritin', 'iron', 'alt', 'ast', 'liver'];
  if (lower.includes('endoscopy') || lower.includes('colonoscopy')) return ['endoscopy', 'colonoscopy', 'egd', 'gi'];
  if (lower.includes('stool') || lower.includes('celiac')) return ['stool', 'fit', 'calprotectin', 'celiac', 'ttg'];
  if (lower.includes('lesion') || lower.includes('morphology')) return ['lesion', 'nevus', 'mm', 'border', 'pigment', 'erythema', 'macule'];
  if (lower.includes('skin history') || lower.includes('family')) return ['melanoma', 'skin', 'fitzpatrick', 'history', 'sunburn', 'biopsy'];
  if (lower.includes('biopsy')) return ['biopsy', 'pathology', 'excision'];
  if (lower.includes('topical') || lower.includes('systemic')) return ['cream', 'ointment', 'topical', 'steroid', 'prednisone', 'trial', 'hydrocortisone', 'tacrolimus', 'sunscreen', 'no topical'];
  if (lower.includes('esr') || lower.includes('crp') || lower.includes('ana')) return ['esr', 'crp', 'ana', 'rf', 'ccp'];
  if (lower.includes('joint') || lower.includes('stiffness')) return ['joint', 'mcp', 'pip', 'stiffness', 'synovitis'];
  return lower.split(/\s+/).filter((w) => w.length > 4);
}

function detectDosageDiscrepancy(sources: SourceChunk[]): AmbiguityFlag | null {
  const medRegex = /\b([a-z]{4,})\s+(\d+\s*mg(?:\s+(?:daily|bid|tid|od|qhs|once daily|twice daily))?)/gi;
  const sightings = new Map<string, Array<{ dose: string; sourceLabel: string; snippet: string }>>();

  for (const chunk of sources) {
    let match: RegExpExecArray | null;
    while ((match = medRegex.exec(chunk.text)) !== null) {
      const drug = match[1].toLowerCase();
      const dose = match[2].toLowerCase().replace(/\s+/g, ' ').trim();
      const arr = sightings.get(drug) ?? [];
      arr.push({
        dose,
        sourceLabel: chunk.sourceLabel,
        snippet: match[0],
      });
      sightings.set(drug, arr);
    }
  }

  for (const [drug, list] of sightings.entries()) {
    const distinctDoses = Array.from(new Set(list.map((i) => i.dose)));
    if (distinctDoses.length > 1) {
      const capDrug = drug.charAt(0).toUpperCase() + drug.slice(1);
      return {
        id: `amb-${drug}-dose`,
        title: `Medication dosage discrepancy detected for ${capDrug}`,
        description: `Supplied documentation lists "${list[0].dose}" in ${list[0].sourceLabel} versus "${list[1].dose}" in ${list[1].sourceLabel}. Clinician reconciliation recommended before specialist intake.`,
        sourceLabel: `${list[0].sourceLabel} / ${list[1].sourceLabel}`,
        resolved: false,
      };
    }
  }
  return null;
}

export function analyzeReferralDeterministic(
  patient: PatientInfo,
  clinical: ClinicalInput,
  specialist: Specialist | undefined,
  documents: UploadedDocument[],
  consultationNotes?: ConsultationNotesBundle,
  specialtyHint?: string
): AIAnalysisResult {
  const effectiveSpecialty = specialist?.specialty || specialtyHint || 'General';
  const targetClinicLabel = specialist
    ? `${specialist.clinic} (${specialist.specialty})`
    : `MediBridge ${effectiveSpecialty} Baseline Intake Protocol`;

  const sources = collectSources(patient, clinical, documents, consultationNotes);
  const extractedItems: ExtractedSummaryItem[] = [];

  const pw = consultationNotes?.physicianWritten;
  const approvedAi = (consultationNotes?.aiNotes ?? []).filter(
    (n) => n.reviewStatus === 'Approved'
  );
  const pendingAi = (consultationNotes?.aiNotes ?? []).filter(
    (n) => n.reviewStatus === 'Pending physician review'
  );

  // 1. Reason for referral
  const effectiveReason =
    clinical.reasonForReferral.trim() ||
    pw?.reasonForConsultation.trim() ||
    approvedAi.find((n) => !n.structured.mainReasonForConsultation.startsWith('Not '))?.structured
      .mainReasonForConsultation ||
    '';

  if (effectiveReason) {
    const sourceLabel = clinical.reasonForReferral.trim()
      ? 'Reason for Referral field'
      : pw?.reasonForConsultation.trim()
        ? 'Physician Consultation Notes (Reason)'
        : `Approved ${approvedAi[0]?.sourceType ?? 'AI Note'}`;
    extractedItems.push({
      id: 'ext-reason',
      section: 'Reason for Referral',
      label: 'Primary referral objective',
      value: effectiveReason,
      verificationState: 'Extracted from provided information',
      relevanceNote: specialist
        ? `Frames the ${effectiveSpecialty.toLowerCase()} consultation scope for ${specialist.name}.`
        : `Frames the ${effectiveSpecialty.toLowerCase()} consultation scope for specialist selection.`,
      sourceLabel,
      sourceExcerpt: effectiveReason,
    });
  } else {
    extractedItems.push({
      id: 'ext-reason-missing',
      section: 'Reason for Referral',
      label: 'Primary referral objective',
      value: 'Not provided in submitted referral fields.',
      verificationState: 'Missing',
      relevanceNote: 'Receiving clinic requires a clear clinical question for intake triage.',
      sourceLabel: 'Referral Intake Check',
      sourceExcerpt: 'No text entered in Reason for Referral field or consultation notes.',
    });
  }

  // 2. Relevant medical history
  const historyParts: string[] = [];
  if (patient.medicalBackground.trim()) historyParts.push(patient.medicalBackground.trim());
  if (clinical.clinicalHistory.trim()) historyParts.push(clinical.clinicalHistory.trim());
  if (pw?.relevantMedicalHistory.trim()) historyParts.push(pw.relevantMedicalHistory.trim());
  const approvedHistory = approvedAi
    .map((n) => n.structured.relevantMedicalHistory)
    .find((v) => v && !v.startsWith('No past') && !v.startsWith('Not provided'));
  if (approvedHistory && !historyParts.includes(approvedHistory)) {
    historyParts.push(approvedHistory);
  }

  if (historyParts.length > 0) {
    const sourceLabel = clinical.clinicalHistory.trim()
      ? 'Clinical History field'
      : patient.medicalBackground.trim()
        ? 'Patient Medical Background'
        : pw?.relevantMedicalHistory.trim()
          ? 'Physician Consultation Notes (Medical History)'
          : `Approved ${approvedAi[0]?.sourceType ?? 'AI Note'}`;
    extractedItems.push({
      id: 'ext-history',
      section: 'Relevant Medical History',
      label: 'Documented clinical background',
      value: historyParts.join(' '),
      verificationState: 'Extracted from provided information',
      relevanceNote: 'Establishes baseline comorbidities and longitudinal context for specialist review.',
      sourceLabel,
      sourceExcerpt: historyParts[0],
    });
  } else {
    extractedItems.push({
      id: 'ext-history-missing',
      section: 'Relevant Medical History',
      label: 'Documented clinical background',
      value: 'Not provided in submitted clinical history or consultation notes.',
      verificationState: 'Missing',
      relevanceNote: 'Baseline medical history prevents duplicate workups at consultation.',
      sourceLabel: 'Referral Intake Check',
      sourceExcerpt: 'Both Patient Medical Background and Clinical History fields are empty.',
    });
  }

  // 3. Presenting symptoms & exam findings
  const effectiveSymptoms =
    clinical.presentingSymptoms.trim() ||
    pw?.patientReportedSymptoms.trim() ||
    approvedAi
      .map((n) => n.structured.patientReportedSymptoms)
      .find((v) => v && !v.startsWith('No specific') && !v.startsWith('Not provided')) ||
    '';

  if (effectiveSymptoms) {
    const sourceLabel = clinical.presentingSymptoms.trim()
      ? 'Presenting Symptoms field'
      : pw?.patientReportedSymptoms.trim()
        ? 'Physician Consultation Notes (Patient Symptoms)'
        : `Approved ${approvedAi[0]?.sourceType ?? 'AI Note'}`;
    extractedItems.push({
      id: 'ext-symptoms',
      section: 'Presenting Symptoms & Findings',
      label: 'Patient-reported symptoms & timeline',
      value: effectiveSymptoms,
      verificationState: 'Extracted from provided information',
      relevanceNote: 'Preserves patient-reported symptom onset, pattern, and functional impact.',
      sourceLabel,
      sourceExcerpt: effectiveSymptoms,
    });
  } else {
    extractedItems.push({
      id: 'ext-symptoms-missing',
      section: 'Presenting Symptoms & Findings',
      label: 'Patient-reported symptoms & timeline',
      value: 'Not provided.',
      verificationState: 'Missing',
      relevanceNote: 'Symptom duration and character help the receiving clinic plan appropriate visit length.',
      sourceLabel: 'Referral Intake Check',
      sourceExcerpt: 'Presenting Symptoms field is empty.',
    });
  }

  const effectiveExam =
    clinical.examinationFindings.trim() ||
    pw?.physicianObservations.trim() ||
    approvedAi
      .map((n) => n.structured.physicianObservations)
      .find((v) => v && !v.startsWith('No objective') && !v.startsWith('Not provided')) ||
    '';

  if (effectiveExam) {
    const sourceLabel = clinical.examinationFindings.trim()
      ? 'Examination Findings field'
      : pw?.physicianObservations.trim()
        ? 'Physician Consultation Notes (Observations)'
        : `Approved ${approvedAi[0]?.sourceType ?? 'AI Note'}`;
    extractedItems.push({
      id: 'ext-exam',
      section: 'Presenting Symptoms & Findings',
      label: 'Physician observations & examination findings',
      value: effectiveExam,
      verificationState: 'Extracted from provided information',
      relevanceNote: 'Objective vitals and physical exam signs documented by the physician.',
      sourceLabel,
      sourceExcerpt: effectiveExam,
    });
  } else {
    const docExam = findMatchingExcerpt(sources.filter((s) => s.sourceLabel.startsWith('Attachment:')), [
      'bp ',
      'exam',
      'tenderness',
      'auscultation',
      'rom',
      'reflex',
    ]);
    if (docExam) {
      extractedItems.push({
        id: 'ext-exam-doc',
        section: 'Presenting Symptoms & Findings',
        label: 'Exam observation from attached document',
        value: docExam.sourceExcerpt,
        verificationState: 'Needs clinician review',
        relevanceNote: 'Pulled from uploaded attachment because Examination Findings was left blank.',
        sourceLabel: docExam.sourceLabel,
        sourceExcerpt: docExam.sourceExcerpt,
      });
    } else {
      extractedItems.push({
        id: 'ext-exam-missing',
        section: 'Presenting Symptoms & Findings',
        label: 'Physician observations & examination findings',
        value: 'Not provided in referral form, consultation notes, or attachments.',
        verificationState: 'Missing',
        relevanceNote: 'Recent focused exam findings are commonly expected at intake.',
        sourceLabel: 'Referral Intake Check',
        sourceExcerpt: 'No examination findings found.',
      });
    }
  }

  // Physician assessment (if documented in consultation notes)
  const effectiveAssessment =
    pw?.physicianAssessment.trim() ||
    approvedAi
      .map((n) => n.structured.physicianAssessment)
      .find((v) => v && !v.startsWith('No documented') && !v.startsWith('Not explicitly')) ||
    '';
  if (effectiveAssessment) {
    extractedItems.push({
      id: 'ext-assessment',
      section: 'Presenting Symptoms & Findings',
      label: 'Referring physician working assessment',
      value: effectiveAssessment,
      verificationState: pw?.physicianAssessment.trim()
        ? 'Clinician verified'
        : 'Needs clinician review',
      relevanceNote: 'Captures the referring physician’s documented consultation assessment (distinct from AI extraction).',
      sourceLabel: pw?.physicianAssessment.trim()
        ? 'Physician Consultation Notes (Assessment)'
        : `Approved ${approvedAi[0]?.sourceType ?? 'AI Note'}`,
      sourceExcerpt: effectiveAssessment,
    });
  }

  // 4. Previous treatments & medications
  const effectiveTreatments =
    clinical.previousTreatments.trim() ||
    pw?.previousTreatmentsDiscussed.trim() ||
    approvedAi
      .map((n) => n.structured.previousTreatmentsDiscussed)
      .find((v) => v && !v.startsWith('No prior') && !v.startsWith('Not provided')) ||
    '';

  if (effectiveTreatments) {
    const sourceLabel = clinical.previousTreatments.trim()
      ? 'Previous Treatments field'
      : pw?.previousTreatmentsDiscussed.trim()
        ? 'Physician Consultation Notes (Previous Treatments)'
        : `Approved ${approvedAi[0]?.sourceType ?? 'AI Note'}`;
    extractedItems.push({
      id: 'ext-treatments',
      section: 'Previous Treatments & Medications',
      label: 'Prior therapies & interventions',
      value: effectiveTreatments,
      verificationState: 'Extracted from provided information',
      relevanceNote: 'Documents conservative or prior therapeutic trials so the specialist does not repeat ineffective steps.',
      sourceLabel,
      sourceExcerpt: effectiveTreatments,
    });
  } else {
    extractedItems.push({
      id: 'ext-treatments-missing',
      section: 'Previous Treatments & Medications',
      label: 'Prior therapies & interventions',
      value: 'No prior treatments documented.',
      verificationState: 'Needs clinician review',
      relevanceNote: 'Confirm whether any conservative therapy or prior medication trial was attempted.',
      sourceLabel: 'Referral Intake Check',
      sourceExcerpt: 'Previous Treatments field and consultation notes have no prior therapies listed.',
    });
  }

  if (clinical.currentMedications.trim()) {
    extractedItems.push({
      id: 'ext-meds',
      section: 'Previous Treatments & Medications',
      label: 'Current medication list',
      value: clinical.currentMedications.trim(),
      verificationState: 'Extracted from provided information',
      relevanceNote: 'Required for safe medication reconciliation at the receiving clinic.',
      sourceLabel: 'Current Medications field',
      sourceExcerpt: clinical.currentMedications.trim(),
    });
  } else {
    extractedItems.push({
      id: 'ext-meds-missing',
      section: 'Previous Treatments & Medications',
      label: 'Current medication list',
      value: 'Not provided.',
      verificationState: 'Missing',
      relevanceNote: 'Active medications should be confirmed prior to specialist consultation.',
      sourceLabel: 'Referral Intake Check',
      sourceExcerpt: 'Current Medications field is empty.',
    });
  }

  // 5. Supporting investigations
  if (clinical.investigations.trim()) {
    extractedItems.push({
      id: 'ext-investigations',
      section: 'Supporting Investigations',
      label: 'Labs & diagnostic reports entered',
      value: clinical.investigations.trim(),
      verificationState: 'Extracted from provided information',
      relevanceNote: 'Provides prerequisite diagnostic results requested by the receiving specialty.',
      sourceLabel: 'Investigations field',
      sourceExcerpt: clinical.investigations.trim(),
    });
  }

  for (const doc of documents) {
    const firstRelevantLine =
      doc.contentText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(' — ') || doc.name;
    extractedItems.push({
      id: `ext-doc-${doc.id}`,
      section: 'Supporting Investigations',
      label: `Attached record: ${doc.name}`,
      value: firstRelevantLine,
      verificationState: 'Extracted from provided information',
      relevanceNote: 'Included in the shared referral packet for specialist clinic review.',
      sourceLabel: `Attachment: ${doc.name}`,
      sourceExcerpt: doc.contentText.trim() || `Uploaded file (${doc.sizeLabel})`,
    });
  }

  if (!clinical.investigations.trim() && documents.length === 0) {
    extractedItems.push({
      id: 'ext-investigations-missing',
      section: 'Supporting Investigations',
      label: 'Diagnostic labs & imaging',
      value: 'No investigations or supporting documents provided.',
      verificationState: 'Missing',
      relevanceNote: `${targetClinicLabel} specifies pre-consultation investigations in its intake checklist.`,
      sourceLabel: 'Referral Intake Check',
      sourceExcerpt: 'Investigations field and attachments are empty.',
    });
  }

  // Checklist evaluation against specialist.intakeRequirements or specialty baseline
  const requirements =
    specialist && Array.isArray(specialist.intakeRequirements)
      ? specialist.intakeRequirements
      : BASELINE_SPECIALTY_REQUIREMENTS[effectiveSpecialty] ?? BASELINE_SPECIALTY_REQUIREMENTS.General;

  const checklist: ChecklistItem[] = requirements.map((req, idx) => {
    const keywords = extractChecklistKeywords(req);
    const match = findMatchingExcerpt(sources, keywords);

    if (match) {
      const needsNote =
        match.sourceExcerpt.toLowerCase().includes('pending') ||
        match.sourceExcerpt.toLowerCase().includes('ordered') ||
        match.sourceExcerpt.toLowerCase().includes('unclear');
      return {
        id: `chk-${idx}`,
        requirement: req,
        status: needsNote ? 'Needs clarification' : 'Provided',
        details: needsNote
          ? 'Referenced as pending or incomplete in supplied notes — verify availability before submission.'
          : `Matched directly in ${match.sourceLabel}.`,
        sourceLabel: match.sourceLabel,
        sourceExcerpt: match.sourceExcerpt,
      };
    }

    return {
      id: `chk-${idx}`,
      requirement: req,
      status: 'Missing',
      details: `Required by ${targetClinicLabel}; not detected in provided fields, consultation notes, or attachments.`,
    };
  });

  const missingItems = checklist
    .filter((c) => c.status === 'Missing')
    .map((c) => c.requirement);

  // Ambiguity detection
  const ambiguityFlags: AmbiguityFlag[] = [];
  if (pendingAi.length > 0) {
    ambiguityFlags.push({
      id: 'amb-unapproved-ai-notes',
      title: `${pendingAi.length} AI consultation note(s) awaiting physician review`,
      description:
        'Unapproved AI-generated consultation notes are excluded from the verified referral packet until the physician reviews and approves them.',
      sourceLabel: pendingAi[0].sourceType,
      resolved: false,
    });
  }

  const doseDiscrepancy = detectDosageDiscrepancy(sources);
  if (doseDiscrepancy) {
    ambiguityFlags.push(doseDiscrepancy);
  }

  const allText = sources.map((s) => s.text.toLowerCase()).join(' ');
  if (allText.includes('pending') || allText.includes('to be done') || allText.includes('scheduled next week')) {
    const pendingMatch = findMatchingExcerpt(sources, ['pending', 'to be done', 'scheduled next week']);
    ambiguityFlags.push({
      id: 'amb-pending-study',
      title: 'Pending investigation referenced in clinical notes',
      description:
        'A diagnostic study or result is described as pending. Submitting before results return may trigger a specialist clarification request.',
      sourceLabel: pendingMatch?.sourceLabel ?? 'Supplied Clinical Notes',
      resolved: false,
    });
  }

  if (clinical.additionalNotes.toLowerCase().includes('unknown') || clinical.additionalNotes.toLowerCase().includes('unsure')) {
    ambiguityFlags.push({
      id: 'amb-uncertainty',
      title: 'Unconfirmed clinical detail noted',
      description: 'Additional notes contain uncertain phrasing ("unknown" or "unsure"). Confirm whether clarification should be added prior to submission.',
      sourceLabel: 'Additional Notes field',
      resolved: false,
    });
  }

  const totalChecks = Math.max(checklist.length, 1);
  const satisfiedWeight = checklist.reduce((acc, item) => {
    if (item.status === 'Provided' || item.status === 'Clinician verified') return acc + 1;
    if (item.status === 'Needs clarification') return acc + 0.5;
    return acc;
  }, 0);
  const coreFieldBonus =
    (effectiveReason ? 1 : 0) +
    (effectiveSymptoms ? 1 : 0) +
    (clinical.currentMedications.trim() || effectiveTreatments ? 1 : 0);

  const rawScore = Math.round(((satisfiedWeight / totalChecks) * 0.75 + (coreFieldBonus / 3) * 0.25) * 100);
  const completenessScore = Math.max(15, Math.min(100, rawScore));

  const executiveSummary = [
    specialist
      ? `Structured referral packet prepared for ${patient.name || 'patient'} (${patient.id || 'ID pending'}) to ${specialist.name} (${specialist.specialty}, ${specialist.clinic}).`
      : `Structured ${effectiveSpecialty} referral packet prepared for ${patient.name || 'patient'} (${patient.id || 'ID pending'}) — awaiting specialist selection via AI Find Specialist or directory.`,
    effectiveReason
      ? `Primary referral focus: ${effectiveReason}`
      : 'Primary referral reason has not yet been specified.',
    missingItems.length > 0
      ? `${missingItems.length} intake requirement(s) not detected in provided documentation (${missingItems.join('; ')}).`
      : `All ${checklist.length} specialty intake requirements were located in the supplied documentation.`,
  ].join(' ');

  return {
    engineMode: 'deterministic',
    engineLabel: 'MediBridge Deterministic Clinical Structuring Engine',
    analyzedAt: new Date().toISOString(),
    completenessScore,
    executiveSummary,
    extractedItems,
    checklist,
    missingItems,
    ambiguityFlags,
    sourceTraceabilityNotice:
      'All structured items above are extracted strictly from physician-entered fields, physician-approved consultation notes, and attached documents. MediBridge does not diagnose, infer unstated clinical facts, or verify medical accuracy without clinician sign-off.',
  };
}
