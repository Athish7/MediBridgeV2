import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import type {
  AIAnalysisResult,
  AiNoteSourceType,
  ClinicalInput,
  ConsultationNotesBundle,
  DeclineReasonCategory,
  GeneratedReferralFromNotes,
  InsuranceAssessmentResult,
  MedicalInsuranceInfo,
  PatientInfo,
  Referral,
  ReferralUrgency,
  Specialist,
  SpecialistRecommendationBundle,
  StructuredConsultationDraft,
  UploadedDocument,
} from './src/types/clinbridge.ts';
import { SEED_REFERRALS, SEED_SPECIALISTS } from './src/data/seedData.ts';
import { assessInsuranceDeterministic, getInsuranceVerificationStatus } from './src/utils/insuranceAdvisor.ts';
import { generateReferralFromNotesDeterministic } from './src/utils/notesToReferralParser.ts';
import {
  CONFIDENTIALITY_AGREEMENT_TEXT,
  createAuditEntry,
  getSpecialistProfessionalId,
  isConfidentialityUnlocked,
  projectStage1AnonymousReferral,
} from './src/utils/privacyProjection.ts';
import {
  analyzeReferralDeterministic,
  generateAiConsultationNoteDeterministic,
  parseConsultationTranscriptDeterministic,
} from './src/utils/referralAnalyzer.ts';
import { recommendSpecialistsDeterministic } from './src/utils/specialistMatcher.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

function hasValidGeminiKey(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key.trim().length > 10 && key !== 'MY_GEMINI_API_KEY');
}

function formatConsultationNotesForPrompt(notes?: ConsultationNotesBundle): string {
  if (!notes) return 'None provided.';
  const parts: string[] = [];
  const pw = notes.physicianWritten;
  if (pw) {
    const fields = [
      pw.reasonForConsultation && `Reason for consultation: ${pw.reasonForConsultation}`,
      pw.patientReportedSymptoms && `Patient-reported symptoms: ${pw.patientReportedSymptoms}`,
      pw.relevantMedicalHistory && `Relevant medical history discussed: ${pw.relevantMedicalHistory}`,
      pw.previousTreatmentsDiscussed && `Previous treatments discussed: ${pw.previousTreatmentsDiscussed}`,
      pw.physicianObservations && `Physician observations: ${pw.physicianObservations}`,
      pw.physicianAssessment && `Physician assessment: ${pw.physicianAssessment}`,
      pw.treatmentPlanAndNextSteps && `Treatment plan & next steps: ${pw.treatmentPlanAndNextSteps}`,
      pw.followUpInstructions && `Follow-up instructions: ${pw.followUpInstructions}`,
    ].filter(Boolean);
    if (fields.length > 0) {
      parts.push(`[Physician-Written Consultation Notes]\n${fields.join('\n')}`);
    }
  }

  const approvedAi = (notes.aiNotes ?? []).filter((n) => n.reviewStatus === 'Approved');
  approvedAi.forEach((n, idx) => {
    const s = n.structured;
    parts.push(
      `[Physician-Approved ${n.sourceType} #${idx + 1}]\nMain reason: ${s.mainReasonForConsultation}\nPatient-reported symptoms: ${s.patientReportedSymptoms}\nMedical history: ${s.relevantMedicalHistory}\nPrevious treatments: ${s.previousTreatmentsDiscussed}\nPhysician observations: ${s.physicianObservations}\nPhysician assessment: ${s.physicianAssessment}\nPlan & follow-up: ${s.planAndFollowUpInstructions}`
    );
  });

  return parts.length > 0 ? parts.join('\n\n') : 'None provided.';
}

async function analyzeWithGemini(
  patient: PatientInfo,
  clinical: ClinicalInput,
  specialist: Specialist,
  documents: UploadedDocument[],
  consultationNotes?: ConsultationNotesBundle
): Promise<AIAnalysisResult> {
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const docText = documents
    .map((d) => `[Document: ${d.name}]\n${d.contentText}`)
    .join('\n\n');

  const requirements = Array.isArray(specialist.intakeRequirements)
    ? specialist.intakeRequirements
    : [];

  const prompt = `Analyze the following healthcare referral packet for administrative coordination.
STRICT SAFETY RULES:
- Never diagnose the patient, recommend treatments, assign clinical urgency, or invent any medical facts, labs, medications, or dates.
- If a detail is absent from the supplied text, state clearly that it was not provided.
- Link every extracted item to the exact source label and verbatim excerpt from the supplied fields, approved consultation notes, or documents.
- Preserve the distinction between patient-reported symptoms, physician observations, physician assessment, and AI-extracted details.
- Check completeness strictly against the target specialist's intake requirements.
- For extractedItems[].section use ONLY one of: "Reason for Referral", "Relevant Medical History", "Presenting Symptoms & Findings", "Previous Treatments & Medications", "Supporting Investigations".
- For extractedItems[].verificationState use ONLY one of: "Extracted from provided information", "Needs clinician review", "Missing".
- For checklist[].status use ONLY one of: "Provided", "Missing", "Needs clarification".

Target Specialist: ${specialist.name} (${specialist.specialty}, ${specialist.clinic})
Intake Requirements:
${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Patient Background: ${patient.medicalBackground || 'Not provided'}
Reason for Referral: ${clinical.reasonForReferral || 'Not provided'}
Presenting Symptoms: ${clinical.presentingSymptoms || 'Not provided'}
Clinical History: ${clinical.clinicalHistory || 'Not provided'}
Previous Treatments: ${clinical.previousTreatments || 'Not provided'}
Current Medications: ${clinical.currentMedications || 'Not provided'}
Examination Findings: ${clinical.examinationFindings || 'Not provided'}
Investigations: ${clinical.investigations || 'Not provided'}
Additional Notes: ${clinical.additionalNotes || 'Not provided'}

Consultation Notes (Physician-Written & Physician-Approved):
${formatConsultationNotesForPrompt(consultationNotes)}

Uploaded Documents:
${docText || 'None uploaded'}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction:
        'You are a healthcare referral coordination structuring assistant. Organize supplied clinical documentation and physician-approved consultation notes, detect missing intake requirements and conflicting statements (such as medication dose discrepancies), and maintain strict verbatim source traceability. Never diagnose or invent data.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          completenessScore: { type: Type.INTEGER },
          executiveSummary: { type: Type.STRING },
          extractedItems: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                section: { type: Type.STRING },
                label: { type: Type.STRING },
                value: { type: Type.STRING },
                verificationState: { type: Type.STRING },
                relevanceNote: { type: Type.STRING },
                sourceLabel: { type: Type.STRING },
                sourceExcerpt: { type: Type.STRING },
              },
            },
          },
          checklist: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                requirement: { type: Type.STRING },
                status: { type: Type.STRING },
                details: { type: Type.STRING },
                sourceLabel: { type: Type.STRING },
                sourceExcerpt: { type: Type.STRING },
              },
            },
          },
          missingItems: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          ambiguityFlags: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                sourceLabel: { type: Type.STRING },
              },
            },
          },
        },
      },
    },
  });

  const parsed = JSON.parse(response.text ?? '{}');
  const validSections = new Set([
    'Reason for Referral',
    'Relevant Medical History',
    'Presenting Symptoms & Findings',
    'Previous Treatments & Medications',
    'Supporting Investigations',
  ]);
  const validVerif = new Set([
    'Extracted from provided information',
    'Needs clinician review',
    'Missing',
    'Clinician verified',
  ]);
  const validChk = new Set([
    'Provided',
    'Missing',
    'Needs clarification',
    'Clinician verified',
  ]);

  return {
    engineMode: 'gemini',
    engineLabel: 'Gemini Referral Coordination Structuring (gemini-4-hydrogen)',
    analyzedAt: new Date().toISOString(),
    completenessScore: typeof parsed.completenessScore === 'number' ? parsed.completenessScore : 75,
    executiveSummary: parsed.executiveSummary || 'Structured summary prepared from supplied referral notes.',
    extractedItems: Array.isArray(parsed.extractedItems)
      ? parsed.extractedItems.map((item: Record<string, string>, idx: number) => ({
          id: item.id || `gem-ext-${idx}`,
          section: validSections.has(item.section) ? item.section : 'Supporting Investigations',
          label: item.label || 'Clinical Detail',
          value: item.value || 'Not provided',
          verificationState: validVerif.has(item.verificationState)
            ? item.verificationState
            : 'Extracted from provided information',
          relevanceNote: item.relevanceNote || 'Extracted from supplied referral package.',
          sourceLabel: item.sourceLabel || 'Supplied Referral Text',
          sourceExcerpt: item.sourceExcerpt || item.value || 'Not provided',
        }))
      : [],
    checklist: Array.isArray(parsed.checklist)
      ? parsed.checklist.map((chk: Record<string, string>, idx: number) => ({
          id: chk.id || `gem-chk-${idx}`,
          requirement: chk.requirement || requirements[idx] || 'Intake Requirement',
          status: validChk.has(chk.status) ? chk.status : 'Needs clarification',
          details: chk.details || 'Evaluated against clinic intake requirements.',
          sourceLabel: chk.sourceLabel,
          sourceExcerpt: chk.sourceExcerpt,
        }))
      : [],
    missingItems: Array.isArray(parsed.missingItems) ? parsed.missingItems : [],
    ambiguityFlags: Array.isArray(parsed.ambiguityFlags)
      ? parsed.ambiguityFlags.map((f: { id?: string; title?: string; description?: string; sourceLabel?: string }, idx: number) => ({
          id: f.id || `gem-amb-${idx}`,
          title: f.title || 'Needs review',
          description: f.description || '',
          sourceLabel: f.sourceLabel || 'Supplied notes',
          resolved: false,
        }))
      : [],
    sourceTraceabilityNotice:
      'All structured items above are extracted strictly from physician-entered fields, physician-approved consultation notes, and attached documents. MediBridge does not diagnose, infer unstated clinical facts, or verify medical accuracy without clinician sign-off.',
  };
}

async function parseConsultationWithGemini(
  rawContent: string,
  sourceType: AiNoteSourceType,
  specialty: string
): Promise<StructuredConsultationDraft> {
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const prompt = `Organize the following ${sourceType} from a family physician consultation into structured referral consultation fields for a ${specialty} referral.
STRICT RULES:
- Never invent symptoms, vitals, diagnoses, treatments, or history not present in the text.
- Preserve exact distinctions between what the patient reported, what the physician observed, and what the physician assessed.
- If a section is missing from the text, state clearly that it was not provided and add it to uncertainOrIncompleteItems.
- Include verbatim quotes in sourceQuotes for each extracted field.

Source Content:
${rawContent}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          mainReasonForConsultation: { type: Type.STRING },
          patientReportedSymptoms: { type: Type.STRING },
          relevantMedicalHistory: { type: Type.STRING },
          previousTreatmentsDiscussed: { type: Type.STRING },
          physicianObservations: { type: Type.STRING },
          physicianAssessment: { type: Type.STRING },
          planAndFollowUpInstructions: { type: Type.STRING },
          uncertainOrIncompleteItems: { type: Type.ARRAY, items: { type: Type.STRING } },
          supportedReferralFields: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
      },
    },
  });

  const parsed = JSON.parse(response.text ?? '{}');
  const fallback = parseConsultationTranscriptDeterministic(rawContent, sourceType, specialty);
  return {
    mainReasonForConsultation: parsed.mainReasonForConsultation || fallback.mainReasonForConsultation,
    patientReportedSymptoms: parsed.patientReportedSymptoms || fallback.patientReportedSymptoms,
    relevantMedicalHistory: parsed.relevantMedicalHistory || fallback.relevantMedicalHistory,
    previousTreatmentsDiscussed: parsed.previousTreatmentsDiscussed || fallback.previousTreatmentsDiscussed,
    physicianObservations: parsed.physicianObservations || fallback.physicianObservations,
    physicianAssessment: parsed.physicianAssessment || fallback.physicianAssessment,
    planAndFollowUpInstructions: parsed.planAndFollowUpInstructions || fallback.planAndFollowUpInstructions,
    uncertainOrIncompleteItems: Array.isArray(parsed.uncertainOrIncompleteItems)
      ? parsed.uncertainOrIncompleteItems
      : fallback.uncertainOrIncompleteItems,
    supportedReferralFields: Array.isArray(parsed.supportedReferralFields)
      ? parsed.supportedReferralFields
      : fallback.supportedReferralFields,
    sourceQuotes: fallback.sourceQuotes,
  };
}

async function recommendSpecialistsWithGemini(params: {
  patient: PatientInfo;
  clinical: ClinicalInput;
  consultationNotes?: ConsultationNotesBundle;
  documents: UploadedDocument[];
  specialists: Specialist[];
  currentSpecialtyHint?: string;
  locationPreference?: string;
  priorityPreference?: 'balanced' | 'fastest-wait' | 'closest-location';
}): Promise<SpecialistRecommendationBundle> {
  const deterministic = recommendSpecialistsDeterministic(params);
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const directorySummary = params.specialists
    .map(
      (s) =>
        `ID: ${s.id} | ${s.name} (${s.specialty}) | Clinic: ${s.clinic} | Location: ${s.location} | Distance: ${s.distanceLabel ?? 'N/A'} | Wait: ${s.estimatedWait} | Subspecialties: ${s.subspecialties.join(', ')} | Requirements: ${s.intakeRequirements.join('; ')}`
    )
    .join('\n');

  const prompt = `Review the following referral clinical context and rank 3 to 4 suitable specialist options STRICTLY from the Fictional Specialist Directory below.
SAFETY & GROUNDING RULES:
- ONLY use specialistId values that exist verbatim in the directory below. NEVER invent specialists, clinics, wait times, or addresses.
- NEVER diagnose the patient or prescribe treatment. Explain recommendations strictly using the supplied referral text, approved notes, uploaded document descriptions, and clinic intake requirements.
- Clearly note which required intake documents appear available vs. still needed.

Priority Preference: ${params.priorityPreference || 'balanced'}
Location Preference: ${params.locationPreference || 'None specified'}
Reason for Referral: ${params.clinical.reasonForReferral || 'Not provided'}
Presenting Symptoms: ${params.clinical.presentingSymptoms || 'Not provided'}
Clinical History: ${params.clinical.clinicalHistory || 'Not provided'}
Previous Treatments: ${params.clinical.previousTreatments || 'Not provided'}
Investigations: ${params.clinical.investigations || 'Not provided'}
Consultation Notes:
${formatConsultationNotesForPrompt(params.consultationNotes)}
Uploaded Documents:
${params.documents.map((d) => `${d.name}: ${d.contentText.slice(0, 300)}`).join('\n') || 'None'}

Fictional Specialist Directory:
${directorySummary}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          inferredSpecialty: { type: Type.STRING },
          clinicalBasisSummary: { type: Type.STRING },
          recommendations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                specialistId: { type: Type.STRING },
                suitabilityLevel: { type: Type.STRING },
                suitabilitySummary: { type: Type.STRING },
                supportingReasons: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
            },
          },
        },
      },
    },
  });

  const parsed = JSON.parse(response.text ?? '{}');
  const validIds = new Set(params.specialists.map((s) => s.id));
  const detById = new Map(deterministic.recommendations.map((r) => [r.specialistId, r]));

  if (!Array.isArray(parsed.recommendations)) {
    return deterministic;
  }

  const grounded = parsed.recommendations
    .filter((rec: { specialistId?: string }) => rec.specialistId && validIds.has(rec.specialistId))
    .slice(0, 4)
    .map((rec: {
      specialistId: string;
      suitabilityLevel?: string;
      suitabilitySummary?: string;
      supportingReasons?: string[];
    }) => {
      const det = detById.get(rec.specialistId);
      const validLevel =
        rec.suitabilityLevel === 'Strong alignment' ||
        rec.suitabilityLevel === 'Good alignment' ||
        rec.suitabilityLevel === 'Alternative option'
          ? rec.suitabilityLevel
          : det?.suitabilityLevel ?? 'Good alignment';
      return {
        specialistId: rec.specialistId,
        suitabilityLevel: validLevel,
        suitabilitySummary: rec.suitabilitySummary || det?.suitabilitySummary || 'Aligned with referral clinical context.',
        supportingReasons:
          Array.isArray(rec.supportingReasons) && rec.supportingReasons.length > 0
            ? rec.supportingReasons.slice(0, 4)
            : det?.supportingReasons ?? [],
        availableRequirements: det?.availableRequirements ?? [],
        neededRequirements: det?.neededRequirements ?? [],
      };
    });

  if (grounded.length === 0) {
    return deterministic;
  }

  return {
    generatedAt: new Date().toISOString(),
    engineMode: 'gemini',
    inferredSpecialty: parsed.inferredSpecialty || deterministic.inferredSpecialty,
    clinicalBasisSummary: parsed.clinicalBasisSummary || deterministic.clinicalBasisSummary,
    disclaimer: deterministic.disclaimer,
    recommendations: grounded,
  };
}

async function generateReferralFromNotesWithGemini(
  rawNotes: string,
  specialtyHint?: string
): Promise<GeneratedReferralFromNotes> {
  const fallback = generateReferralFromNotesDeterministic(rawNotes, specialtyHint);
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const prompt = `Extract structured referral fields from the following raw family physician consultation notes${
    specialtyHint ? ` (target specialty context: ${specialtyHint})` : ''
  }.
STRICT CLINICAL SAFETY RULES:
- ONLY use facts explicitly stated in the pasted notes below. NEVER invent symptoms, vitals, diagnoses, test results, or medications.
- If a section is absent from the notes, leave it as an empty string "" or state clearly that it was not provided, and list missing/unclear elements in uncertainSections / missingSections.
- STRICTLY distinguish confirmedDiagnoses (established/diagnosed conditions) from suspectedDiagnoses (working/provisional/differential/rule-out impressions). Never promote a suspected diagnosis to confirmed.
- For recommendedUrgency use ONLY one of: "Routine", "Semi-Urgent", "Urgent", grounded strictly in the pasted text.

Pasted Family Physician Consultation Notes:
${rawNotes}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reasonForReferral: { type: Type.STRING },
          presentingSymptoms: { type: Type.STRING },
          clinicalHistory: { type: Type.STRING },
          examinationFindings: { type: Type.STRING },
          confirmedDiagnoses: { type: Type.STRING },
          suspectedDiagnoses: { type: Type.STRING },
          investigations: { type: Type.STRING },
          currentMedications: { type: Type.STRING },
          previousTreatments: { type: Type.STRING },
          allergies: { type: Type.STRING },
          clinicalQuestionsForSpecialist: { type: Type.STRING },
          recommendedUrgency: { type: Type.STRING },
          urgencyRationale: { type: Type.STRING },
          referralSummary: { type: Type.STRING },
          uncertainSections: { type: Type.ARRAY, items: { type: Type.STRING } },
          missingSections: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
      },
    },
  });

  const parsed = JSON.parse(response.text ?? '{}');
  const validUrgency: ReferralUrgency =
    parsed.recommendedUrgency === 'Urgent' ||
    parsed.recommendedUrgency === 'Semi-Urgent' ||
    parsed.recommendedUrgency === 'Routine'
      ? parsed.recommendedUrgency
      : fallback.recommendedUrgency;

  return {
    reasonForReferral: typeof parsed.reasonForReferral === 'string' ? parsed.reasonForReferral : fallback.reasonForReferral,
    presentingSymptoms: typeof parsed.presentingSymptoms === 'string' ? parsed.presentingSymptoms : fallback.presentingSymptoms,
    clinicalHistory: typeof parsed.clinicalHistory === 'string' ? parsed.clinicalHistory : fallback.clinicalHistory,
    examinationFindings: typeof parsed.examinationFindings === 'string' ? parsed.examinationFindings : fallback.examinationFindings,
    confirmedDiagnoses: typeof parsed.confirmedDiagnoses === 'string' ? parsed.confirmedDiagnoses : fallback.confirmedDiagnoses,
    suspectedDiagnoses: typeof parsed.suspectedDiagnoses === 'string' ? parsed.suspectedDiagnoses : fallback.suspectedDiagnoses,
    investigations: typeof parsed.investigations === 'string' ? parsed.investigations : fallback.investigations,
    currentMedications: typeof parsed.currentMedications === 'string' ? parsed.currentMedications : fallback.currentMedications,
    previousTreatments: typeof parsed.previousTreatments === 'string' ? parsed.previousTreatments : fallback.previousTreatments,
    allergies: typeof parsed.allergies === 'string' ? parsed.allergies : fallback.allergies,
    clinicalQuestionsForSpecialist:
      typeof parsed.clinicalQuestionsForSpecialist === 'string'
        ? parsed.clinicalQuestionsForSpecialist
        : fallback.clinicalQuestionsForSpecialist,
    recommendedUrgency: validUrgency,
    urgencyRationale: parsed.urgencyRationale || fallback.urgencyRationale,
    referralSummary: parsed.referralSummary || fallback.referralSummary,
    uncertainSections: Array.isArray(parsed.uncertainSections)
      ? parsed.uncertainSections
      : fallback.uncertainSections,
    missingSections: Array.isArray(parsed.missingSections)
      ? parsed.missingSections
      : fallback.missingSections,
    engineMode: 'gemini',
    disclaimer: fallback.disclaimer,
  };
}

async function assessInsuranceWithGemini(params: {
  insurance?: MedicalInsuranceInfo;
  specialty: string;
  clinicalInput?: ClinicalInput;
}): Promise<InsuranceAssessmentResult> {
  const fallback = assessInsuranceDeterministic(params);
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const ins = params.insurance;
  const prompt = `Evaluate the administrative readiness and coverage context of the following referral medical insurance record in a CANADIAN healthcare context.
STRICT RULES:
- Clearly distinguish publicly funded provincial/territorial health insurance (e.g., OHIP, MSP, RAMQ, AHCIP) from private/extended health insurance. NEVER assume private insurance pays for publicly covered medically necessary specialist consultations, nor assume provincial insurance pays for outpatient drugs/devices/non-insured services.
- Never verify live eligibility, submit claims, or guarantee reimbursement. Present findings strictly as preliminary coordination assistance.
- Do NOT include or repeat raw member/policy IDs in the summary text.

Specialty: ${params.specialty}
Insurance Availability: ${ins?.availabilityStatus ?? 'To be confirmed'}
Coverage Category: ${ins?.coverageCategory ?? 'Not Confirmed'}
Jurisdiction: ${ins?.provinceOrJurisdiction ?? 'Not specified'}
Provider: ${ins?.providerName || 'Not provided'}
Plan Type: ${ins?.planType || 'Not provided'}
Coverage Details: ${ins?.coverageDetails || 'Not provided'}
Referral Service Notes: ${ins?.referralServiceCoverageNotes || 'Not provided'}
Clinical Context: ${params.clinicalInput?.reasonForReferral || 'Not provided'} | ${params.clinicalInput?.investigations || ''}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sufficiencyStatus: { type: Type.STRING },
          summary: { type: Type.STRING },
          missingDetails: { type: Type.ARRAY, items: { type: Type.STRING } },
          relevantCoverageHighlights: { type: Type.ARRAY, items: { type: Type.STRING } },
          priorAuthorizationFlags: { type: Type.ARRAY, items: { type: Type.STRING } },
          recommendedVerificationSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
          remainingConfirmations: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
      },
    },
  });

  const parsed = JSON.parse(response.text ?? '{}');
  const validSufficiency: InsuranceAssessmentResult['sufficiencyStatus'] =
    parsed.sufficiencyStatus === 'Sufficient for Intake' ||
    parsed.sufficiencyStatus === 'Additional Details Recommended' ||
    parsed.sufficiencyStatus === 'Missing Insurance Details'
      ? parsed.sufficiencyStatus
      : fallback.sufficiencyStatus;

  return {
    assessedAt: new Date().toISOString(),
    engineMode: 'gemini',
    sufficiencyStatus: validSufficiency,
    summary: parsed.summary || fallback.summary,
    missingDetails: Array.isArray(parsed.missingDetails) ? parsed.missingDetails : fallback.missingDetails,
    relevantCoverageHighlights: Array.isArray(parsed.relevantCoverageHighlights)
      ? parsed.relevantCoverageHighlights
      : fallback.relevantCoverageHighlights,
    priorAuthorizationFlags: Array.isArray(parsed.priorAuthorizationFlags)
      ? parsed.priorAuthorizationFlags
      : fallback.priorAuthorizationFlags,
    recommendedVerificationSteps: Array.isArray(parsed.recommendedVerificationSteps)
      ? parsed.recommendedVerificationSteps
      : fallback.recommendedVerificationSteps,
    remainingConfirmations: Array.isArray(parsed.remainingConfirmations)
      ? parsed.remainingConfirmations
      : fallback.remainingConfirmations,
    canadianHealthcareContextNote: fallback.canadianHealthcareContextNote,
    workflowStages: fallback.workflowStages,
    disclaimer: fallback.disclaimer,
  };
}

// Authoritative server-side referral store for Stage-1 privacy enforcement & RBAC
const referralStore = new Map<string, Referral>();
function resetServerReferralStore() {
  referralStore.clear();
  for (const r of SEED_REFERRALS) {
    referralStore.set(r.id, JSON.parse(JSON.stringify(r)) as Referral);
  }
}
resetServerReferralStore();

function nowFormattedServer(): string {
  return new Date().toISOString().slice(0, 16).replace('T', ' ');
}

function getActorHeaders(req: express.Request) {
  const role = String(req.header('x-medibridge-role') || req.query.role || '').toLowerCase();
  const specialistId = String(
    req.header('x-medibridge-specialist-id') || req.query.specialistId || ''
  );
  return { role, specialistId };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: hasValidGeminiKey(),
    });
  });

  const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_resolve, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      ),
    ]);

  app.post('/api/referrals/analyze', async (req, res) => {
    const {
      patient,
      clinical,
      specialist,
      specialtyHint,
      documents,
      consultationNotes,
      preferDeterministic,
    } = req.body ?? {};
    if (!patient || !clinical) {
      res.status(400).json({ error: 'Missing required patient or clinical payload.' });
      return;
    }

    const docs: UploadedDocument[] = Array.isArray(documents) ? documents : [];

    if (!preferDeterministic && specialist && hasValidGeminiKey()) {
      try {
        const result = await withTimeout(
          analyzeWithGemini(patient, clinical, specialist, docs, consultationNotes),
          5500,
          'Gemini analysis'
        );
        res.json(result);
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Gemini API call failed';
        res.status(502).json({
          error: `AI service error: ${message}`,
          fallbackAvailable: true,
        });
        return;
      }
    }

    try {
      const deterministic = analyzeReferralDeterministic(
        patient,
        clinical,
        specialist,
        docs,
        consultationNotes,
        typeof specialtyHint === 'string' ? specialtyHint : undefined
      );
      res.json(deterministic);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze referral payload';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/consultations/generate', async (req, res) => {
    const { patient, clinical, physicianWritten, documents, specialty } = req.body ?? {};
    if (!patient || !clinical) {
      res.status(400).json({ error: 'Missing patient or clinical payload for AI consultation summary.' });
      return;
    }
    const docs: UploadedDocument[] = Array.isArray(documents) ? documents : [];
    const targetSpecialty = typeof specialty === 'string' && specialty ? specialty : 'General';

    try {
      const structured = generateAiConsultationNoteDeterministic({
        patient,
        clinical,
        physicianWritten,
        documents: docs,
        specialty: targetSpecialty,
      });
      res.json({ structured, engineMode: 'deterministic' });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to generate AI consultation summary';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/consultations/parse', async (req, res) => {
    const { rawContent, sourceType, specialty, preferDeterministic } = req.body ?? {};
    if (!rawContent || typeof rawContent !== 'string') {
      res.status(400).json({ error: 'Missing rawContent string for consultation parsing.' });
      return;
    }

    const validSource: AiNoteSourceType = sourceType || 'Imported transcript';
    const targetSpecialty = typeof specialty === 'string' && specialty ? specialty : 'General';

    if (!preferDeterministic && hasValidGeminiKey()) {
      try {
        const structured = await withTimeout(
          parseConsultationWithGemini(rawContent, validSource, targetSpecialty),
          3500,
          'Gemini consultation parse'
        );
        res.json({ structured, engineMode: 'gemini' });
        return;
      } catch {
        // Fall back to deterministic parser gracefully
      }
    }

    try {
      const structured = parseConsultationTranscriptDeterministic(
        rawContent,
        validSource,
        targetSpecialty
      );
      res.json({ structured, engineMode: 'deterministic' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse consultation notes';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/specialists/recommend', async (req, res) => {
    const {
      patient,
      clinical,
      consultationNotes,
      documents,
      specialists,
      currentSpecialtyHint,
      locationPreference,
      priorityPreference,
      preferDeterministic,
    } = req.body ?? {};

    if (!patient || !clinical || !Array.isArray(specialists) || specialists.length === 0) {
      res.status(400).json({ error: 'Missing required patient, clinical, or specialists directory payload.' });
      return;
    }

    const docs: UploadedDocument[] = Array.isArray(documents) ? documents : [];

    if (!preferDeterministic && hasValidGeminiKey()) {
      try {
        const result = await withTimeout(
          recommendSpecialistsWithGemini({
            patient,
            clinical,
            consultationNotes,
            documents: docs,
            specialists,
            currentSpecialtyHint,
            locationPreference,
            priorityPreference,
          }),
          4000,
          'Gemini specialist recommendation'
        );
        res.json(result);
        return;
      } catch {
        // Fall back gracefully to grounded deterministic specialist matching
      }
    }

    try {
      const deterministic = recommendSpecialistsDeterministic({
        patient,
        clinical,
        consultationNotes,
        documents: docs,
        specialists,
        currentSpecialtyHint,
        locationPreference,
        priorityPreference,
      });
      res.json(deterministic);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to recommend specialists';
      res.status(500).json({ error: message });
    }
  });

  // --- AI: Generate Structured Referral From Pasted Consultation Notes ---
  app.post('/api/ai/generate-referral-from-notes', async (req, res) => {
    const { rawNotes, specialtyHint, preferDeterministic } = req.body ?? {};
    if (typeof rawNotes !== 'string') {
      res.status(400).json({ error: 'Missing rawNotes string.' });
      return;
    }

    if (!preferDeterministic && hasValidGeminiKey() && rawNotes.trim().length > 15) {
      try {
        const result = await withTimeout(
          generateReferralFromNotesWithGemini(rawNotes, specialtyHint),
          4500,
          'Gemini referral generation'
        );
        res.json(result);
        return;
      } catch {
        // Fallback to deterministic parser
      }
    }

    res.json(generateReferralFromNotesDeterministic(rawNotes, specialtyHint));
  });

  // --- AI: Canadian Medical Insurance Efficiency Assessment ---
  app.post('/api/ai/assess-insurance', async (req, res) => {
    const { insurance, specialty, clinicalInput, preferDeterministic } = req.body ?? {};
    const resolvedSpecialty = typeof specialty === 'string' && specialty ? specialty : 'Specialist Care';

    if (!preferDeterministic && hasValidGeminiKey()) {
      try {
        const result = await withTimeout(
          assessInsuranceWithGemini({ insurance, specialty: resolvedSpecialty, clinicalInput }),
          4500,
          'Gemini insurance assessment'
        );
        res.json(result);
        return;
      } catch {
        // Fallback to deterministic evaluator
      }
    }

    res.json(
      assessInsuranceDeterministic({
        insurance,
        specialty: resolvedSpecialty,
        clinicalInput,
      })
    );
  });

  // --- Server-side Referral Sync (for physician-side creations, updates & demo reset) ---
  app.post('/api/referrals/sync', (req, res) => {
    const { referrals, reset } = req.body ?? {};
    if (reset === true) {
      resetServerReferralStore();
      res.json({ ok: true, count: referralStore.size });
      return;
    }
    if (!Array.isArray(referrals)) {
      res.status(400).json({ error: 'Expected referrals array.' });
      return;
    }
    for (const incoming of referrals as Referral[]) {
      if (!incoming || !incoming.id) continue;
      const existing = referralStore.get(incoming.id);
      if (existing?.confidentialityAcknowledgement?.accepted && !incoming.confidentialityAcknowledgement?.accepted) {
        // Preserve server-enforced confidentiality lock state if already accepted
        referralStore.set(incoming.id, {
          ...incoming,
          confidentialityAcknowledgement: existing.confidentialityAcknowledgement,
        });
      } else {
        referralStore.set(incoming.id, incoming);
      }
    }
    res.json({ ok: true, count: referralStore.size });
  });

  // --- Stage 1 & Stage 2 Privacy-Protected Specialist Endpoints ---
  app.get('/api/specialist/referrals', (req, res) => {
    const { role, specialistId } = getActorHeaders(req);
    if (role !== 'specialist') {
      res.status(403).json({ error: 'Forbidden: Specialist role required.' });
      return;
    }
    if (!specialistId) {
      res.status(403).json({ error: 'Forbidden: Specialist identifier required.' });
      return;
    }

    const items = Array.from(referralStore.values())
      .filter(
        (r) =>
          r.status !== 'Draft' &&
          r.status !== 'Ready for submission' &&
          r.status !== 'Awaiting Specialist Selection' &&
          Boolean(r.specialistId) &&
          (specialistId === 'all' || r.specialistId === specialistId)
      )
      .map((r) => {
        if (isConfidentialityUnlocked(r)) {
          return {
            unlocked: true,
            stage: 'stage2_unlocked' as const,
            preview: projectStage1AnonymousReferral(r),
            referral: r,
          };
        }
        return {
          unlocked: false,
          stage: 'stage1_anonymous' as const,
          preview: projectStage1AnonymousReferral(r),
        };
      });

    res.json({ items });
  });

  app.get('/api/specialist/referrals/:id', (req, res) => {
    const { role, specialistId } = getActorHeaders(req);
    if (role !== 'specialist') {
      res.status(403).json({ error: 'Forbidden: Specialist role required.' });
      return;
    }
    const referral = referralStore.get(req.params.id);
    if (!referral) {
      res.status(404).json({ error: 'Referral not found.' });
      return;
    }
    // Enforce specialist assignment strictly on detail access
    if (!specialistId || referral.specialistId !== specialistId) {
      res.status(403).json({
        error: 'Access denied: this referral is not assigned to your specialist account.',
      });
      return;
    }
    if (
      referral.status === 'Draft' ||
      referral.status === 'Ready for submission' ||
      referral.status === 'Awaiting Specialist Selection'
    ) {
      res.status(403).json({ error: 'Referral has not been submitted to the specialist clinic yet.' });
      return;
    }

    if (!isConfidentialityUnlocked(referral)) {
      res.json({
        unlocked: false,
        stage: 'stage1_anonymous',
        preview: projectStage1AnonymousReferral(referral),
        auditLog: referral.auditLog ?? [],
      });
      return;
    }

    res.json({
      unlocked: true,
      stage: 'stage2_unlocked',
      preview: projectStage1AnonymousReferral(referral),
      referral,
    });
  });

  app.post('/api/specialist/referrals/:id/view-anonymous', (req, res) => {
    const { role, specialistId } = getActorHeaders(req);
    if (role !== 'specialist') {
      res.status(403).json({ error: 'Forbidden: Specialist role required.' });
      return;
    }
    const referral = referralStore.get(req.params.id);
    if (!referral || !specialistId || referral.specialistId !== specialistId) {
      res.status(403).json({ error: 'Access denied: referral is not assigned to this specialist.' });
      return;
    }

    const ts = nowFormattedServer();
    const spec = SEED_SPECIALISTS.find((s) => s.id === specialistId);
    const actorName = spec?.name ?? referral.specialistName;
    const actorId = getSpecialistProfessionalId(specialistId);

    const shouldAdvanceStatus =
      referral.status === 'Submitted' ||
      referral.status === 'Awaiting Specialist Review' ||
      referral.status === 'Awaiting specialist review';

    const alreadyLoggedView = (referral.auditLog ?? []).some(
      (a) => a.action === 'ANONYMOUS_PREVIEW_VIEWED' && a.actorId === actorId
    );

    const updated: Referral = {
      ...referral,
      status: shouldAdvanceStatus ? 'Anonymous Information Reviewed' : referral.status,
      lastUpdated: ts.slice(0, 10),
      auditLog: alreadyLoggedView
        ? referral.auditLog ?? []
        : [
            ...(referral.auditLog ?? []),
            createAuditEntry({
              actorRole: 'specialist',
              actorName,
              actorId,
              action: 'ANONYMOUS_PREVIEW_VIEWED',
              details: `Reviewed Stage 1 de-identified referral preview for ${referral.id}.`,
              timestamp: ts,
            }),
          ],
      timeline: shouldAdvanceStatus
        ? [
            ...referral.timeline,
            {
              id: `tl-anon-${Date.now()}`,
              title: 'Anonymous Information Reviewed',
              description: `${actorName} inspected Stage 1 non-identifying clinical preview.`,
              timestamp: ts,
              actor: actorName,
              stage: 'privacy',
            },
          ]
        : referral.timeline,
    };

    referralStore.set(referral.id, updated);
    res.json({
      unlocked: isConfidentialityUnlocked(updated),
      stage: isConfidentialityUnlocked(updated) ? 'stage2_unlocked' : 'stage1_anonymous',
      preview: projectStage1AnonymousReferral(updated),
      auditLog: updated.auditLog ?? [],
      status: updated.status,
    });
  });

  app.post('/api/specialist/referrals/:id/confidentiality-ack', (req, res) => {
    const { role, specialistId } = getActorHeaders(req);
    if (role !== 'specialist') {
      res.status(403).json({ error: 'Forbidden: Specialist role required.' });
      return;
    }
    const referral = referralStore.get(req.params.id);
    if (!referral || !specialistId || referral.specialistId !== specialistId) {
      res.status(403).json({ error: 'Access denied: referral is not assigned to this specialist.' });
      return;
    }

    const { accepted, statement, specialistName, professionalId } = req.body ?? {};
    if (accepted !== true) {
      res.status(400).json({ error: 'Confidentiality Agreement checkbox must be accepted.' });
      return;
    }
    if (statement && statement !== CONFIDENTIALITY_AGREEMENT_TEXT) {
      res.status(400).json({ error: 'Confidentiality statement mismatch.' });
      return;
    }

    const ts = nowFormattedServer();
    const spec = SEED_SPECIALISTS.find((s) => s.id === specialistId);
    const resolvedName =
      typeof specialistName === 'string' && specialistName.trim()
        ? specialistName.trim()
        : spec?.name ?? referral.specialistName;
    const resolvedProfId =
      typeof professionalId === 'string' && professionalId.trim()
        ? professionalId.trim()
        : getSpecialistProfessionalId(specialistId);

    // Note: Unlocking patient details MUST NOT automatically accept the referral.
    const nextStatus =
      referral.status === 'Submitted' ||
      referral.status === 'Awaiting Specialist Review' ||
      referral.status === 'Awaiting specialist review' ||
      referral.status === 'Anonymous Information Reviewed' ||
      referral.status === 'Confidentiality Agreement Accepted' ||
      referral.status === 'Full Information Unlocked'
        ? 'Awaiting Specialist Decision'
        : referral.status;

    const updated: Referral = {
      ...referral,
      status: nextStatus,
      specialistReviewedAt: ts.slice(0, 10),
      lastUpdated: ts.slice(0, 10),
      confidentialityAcknowledgement: {
        accepted: true,
        specialistId,
        specialistName: resolvedName,
        professionalId: resolvedProfId,
        acknowledgedAt: ts,
        statement: CONFIDENTIALITY_AGREEMENT_TEXT,
      },
      auditLog: [
        ...(referral.auditLog ?? []),
        createAuditEntry({
          actorRole: 'specialist',
          actorName: resolvedName,
          actorId: resolvedProfId,
          action: 'CONFIDENTIALITY_ACCEPTED',
          details: `Accepted Specialist Confidentiality Agreement (${resolvedProfId}).`,
          timestamp: ts,
        }),
        createAuditEntry({
          actorRole: 'specialist',
          actorName: resolvedName,
          actorId: resolvedProfId,
          action: 'FULL_REFERRAL_UNLOCKED',
          details: `Unlocked Stage 2 full patient identity and supporting records; referral remains ${nextStatus} pending explicit Accept/Decline decision.`,
          timestamp: ts,
        }),
      ],
      timeline: [
        ...referral.timeline,
        {
          id: `tl-conf-${Date.now()}`,
          title: 'Confidentiality Agreement Accepted & Full Information Unlocked',
          description: `${resolvedName} (${resolvedProfId}) acknowledged confidentiality. Full referral unlocked — awaiting specialist decision.`,
          timestamp: ts,
          actor: resolvedName,
          stage: 'privacy',
        },
      ],
    };

    referralStore.set(referral.id, updated);
    res.json({
      unlocked: true,
      stage: 'stage2_unlocked',
      referral: updated,
    });
  });

  app.post('/api/specialist/referrals/:id/decision', (req, res) => {
    const { role, specialistId } = getActorHeaders(req);
    if (role !== 'specialist') {
      res.status(403).json({ error: 'Forbidden: Specialist role required.' });
      return;
    }
    const referral = referralStore.get(req.params.id);
    if (!referral || !specialistId || referral.specialistId !== specialistId) {
      res.status(403).json({ error: 'Access denied: referral is not assigned to this specialist.' });
      return;
    }
    if (!isConfidentialityUnlocked(referral)) {
      res.status(403).json({
        error: 'Confidentiality Agreement must be accepted before making a referral decision.',
      });
      return;
    }

    const { decision, reasonCategory, notes } = req.body ?? {};
    const ts = nowFormattedServer();
    const spec = SEED_SPECIALISTS.find((s) => s.id === specialistId);
    const actorName = spec?.name ?? referral.specialistName;
    const actorId = getSpecialistProfessionalId(specialistId);

    if (decision === 'Accept') {
      const updated: Referral = {
        ...referral,
        status: 'Accepted',
        acceptedAt: ts.slice(0, 10),
        lastUpdated: ts.slice(0, 10),
        attentionPriority: 'Low',
        patientNextSteps: `${referral.specialistName} has accepted your referral. Clinic scheduling staff at ${referral.receivingClinic} will arrange your consultation.`,
        auditLog: [
          ...(referral.auditLog ?? []),
          createAuditEntry({
            actorRole: 'specialist',
            actorName,
            actorId,
            action: 'SPECIALIST_DECISION_ACCEPTED',
            details: typeof notes === 'string' && notes.trim() ? notes.trim() : 'Specialist accepted referral.',
            timestamp: ts,
          }),
        ],
        timeline: [
          ...referral.timeline,
          {
            id: `tl-acc-${Date.now()}`,
            title: 'Specialist accepted referral',
            description:
              typeof notes === 'string' && notes.trim()
                ? notes.trim()
                : `${actorName} accepted referral for specialist consultation.`,
            timestamp: ts,
            actor: actorName,
            stage: 'accepted',
          },
        ],
      };
      referralStore.set(referral.id, updated);
      res.json({ referral: updated });
      return;
    }

    if (decision === 'Decline') {
      const cat: DeclineReasonCategory = reasonCategory || 'Other administrative reason';
      const cleanNotes = typeof notes === 'string' ? notes.trim() : '';
      if (!cleanNotes) {
        res.status(400).json({ error: 'A decline explanation is required.' });
        return;
      }
      const updated: Referral = {
        ...referral,
        status: 'Declined',
        lastUpdated: ts.slice(0, 10),
        attentionPriority: 'High',
        declineDetails: {
          reasonCategory: cat,
          notes: cleanNotes,
          declinedBy: `${actorName} (${referral.receivingClinic})`,
          declinedAt: ts,
        },
        patientNextSteps:
          'Your family physician is coordinating an updated specialist clinic arrangement for your referral and will follow up with next steps.',
        auditLog: [
          ...(referral.auditLog ?? []),
          createAuditEntry({
            actorRole: 'specialist',
            actorName,
            actorId,
            action: 'SPECIALIST_DECISION_DECLINED',
            details: `Declined (${cat}): ${cleanNotes}`,
            timestamp: ts,
          }),
        ],
        timeline: [
          ...referral.timeline,
          {
            id: `tl-dec-${Date.now()}`,
            title: `Referral declined (${cat})`,
            description: cleanNotes,
            timestamp: ts,
            actor: actorName,
            stage: 'declined',
          },
        ],
      };
      referralStore.set(referral.id, updated);
      res.json({ referral: updated });
      return;
    }

    res.status(400).json({ error: 'Invalid decision; expected Accept or Decline.' });
  });

  app.post('/api/specialist/referrals/:id/insurance/request', (req, res) => {
    const { role, specialistId } = getActorHeaders(req);
    if (role !== 'specialist') {
      res.status(403).json({ error: 'Forbidden: Specialist role required.' });
      return;
    }
    const referral = referralStore.get(req.params.id);
    if (!referral || !specialistId || referral.specialistId !== specialistId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    const { requestedDetails, reason } = req.body ?? {};
    const ts = nowFormattedServer();
    const actorName = referral.specialistName;
    const actorId = getSpecialistProfessionalId(specialistId);

    const updatedInsurance: MedicalInsuranceInfo = {
      ...(referral.insurance ?? {
        availabilityStatus: 'To be confirmed',
        coverageCategory: 'Not Confirmed',
        provinceOrJurisdiction: 'Ontario (OHIP)',
        providerName: '',
        planType: '',
        policyOrMemberId: '',
        coverageDetails: '',
        referralServiceCoverageNotes: '',
        additionalNotes: '',
      }),
      specialistRequest: {
        id: `insreq-${Date.now()}`,
        requestedBy: `${actorName} (${referral.receivingClinic})`,
        requestedAt: ts,
        requestedDetails:
          typeof requestedDetails === 'string' && requestedDetails.trim()
            ? requestedDetails.trim()
            : 'Please confirm extended health coverage, insurer/plan type, or applicable provincial health plan details.',
        reason:
          typeof reason === 'string' && reason.trim()
            ? reason.trim()
            : 'Required for clinic administrative & pre-authorization intake coordination.',
        resolved: false,
      },
    };

    const updated: Referral = {
      ...referral,
      lastUpdated: ts.slice(0, 10),
      attentionPriority: 'High',
      insurance: updatedInsurance,
      auditLog: [
        ...(referral.auditLog ?? []),
        createAuditEntry({
          actorRole: 'specialist',
          actorName,
          actorId,
          action: 'INSURANCE_INFO_REQUESTED',
          details: updatedInsurance.specialistRequest!.requestedDetails,
          timestamp: ts,
        }),
      ],
      timeline: [
        ...referral.timeline,
        {
          id: `tl-insreq-${Date.now()}`,
          title: 'Specialist requested insurance information',
          description: updatedInsurance.specialistRequest!.requestedDetails,
          timestamp: ts,
          actor: actorName,
          stage: 'insurance',
        },
      ],
    };

    referralStore.set(referral.id, updated);
    res.json({ referral: updated });
  });

  app.post('/api/referrals/:id/insurance/update', (req, res) => {
    const referral = referralStore.get(req.params.id);
    if (!referral) {
      res.status(404).json({ error: 'Referral not found.' });
      return;
    }
    const { insurance, updatedBy } = req.body ?? {};
    if (!insurance) {
      res.status(400).json({ error: 'Missing insurance payload.' });
      return;
    }
    const ts = nowFormattedServer();
    const actor = typeof updatedBy === 'string' && updatedBy.trim() ? updatedBy.trim() : referral.referringPhysician;

    const merged: MedicalInsuranceInfo = {
      ...insurance,
      verificationStatus: getInsuranceVerificationStatus(insurance),
      lastUpdatedAt: ts,
      lastUpdatedBy: actor,
      specialistRequest: referral.insurance?.specialistRequest
        ? {
            ...referral.insurance.specialistRequest,
            resolved: true,
            resolvedAt: ts,
            resolvedBy: actor,
          }
        : undefined,
      aiAssessment: assessInsuranceDeterministic({
        insurance,
        specialty: referral.specialty,
        clinicalInput: referral.clinicalInput,
      }),
    };

    const updated: Referral = {
      ...referral,
      lastUpdated: ts.slice(0, 10),
      insurance: merged,
      auditLog: [
        ...(referral.auditLog ?? []),
        createAuditEntry({
          actorRole: 'physician',
          actorName: actor,
          actorId: 'phys-vance',
          action: 'INSURANCE_INFO_UPDATED',
          details: `Updated medical insurance status to "${merged.availabilityStatus}" (${merged.coverageCategory}).`,
          timestamp: ts,
        }),
      ],
      timeline: [
        ...referral.timeline,
        {
          id: `tl-insupd-${Date.now()}`,
          title: 'Medical insurance information updated',
          description: `Status: ${merged.availabilityStatus}${merged.providerName ? ` · ${merged.providerName}` : ''}`,
          timestamp: ts,
          actor,
          stage: 'insurance',
        },
      ],
    };

    referralStore.set(referral.id, updated);
    res.json({ referral: updated });
  });

  app.post('/api/referrals/:id/econsult/propose', (req, res) => {
    const { role, specialistId } = getActorHeaders(req);
    const referral = referralStore.get(req.params.id);
    if (!referral) {
      res.status(404).json({ error: 'Referral not found.' });
      return;
    }
    if (role === 'specialist' && specialistId && referral.specialistId !== specialistId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    if (!isConfidentialityUnlocked(referral)) {
      res.status(403).json({ error: 'Unlock patient confidentiality before scheduling consultation.' });
      return;
    }

    const { proposedDate, proposedTime, consultationReason, specialistMessage, isEConsultation } =
      req.body ?? {};
    const ts = nowFormattedServer();
    const actorName = referral.specialistName;
    const isEConsult = Boolean(isEConsultation);
    const nextStatus = isEConsult
      ? 'E-Consultation Awaiting Patient Approval'
      : 'Appointment Proposed';

    const existingMsgs = referral.eConsultation?.messages ?? [];
    const proposalMsg = {
      id: `ecmsg-${Date.now()}`,
      referralId: referral.id,
      appointmentContextLabel: `${isEConsult ? 'Proposed E-Consultation' : 'Proposed Appointment'} · ${proposedDate} at ${proposedTime}`,
      senderRole: 'specialist' as const,
      senderDisplayName: `${actorName} (${referral.receivingClinic})`,
      content:
        (typeof specialistMessage === 'string' && specialistMessage.trim()) ||
        `We have proposed an ${isEConsult ? 'online E-Consultation' : 'in-person consultation'} on ${proposedDate} at ${proposedTime}.`,
      timestamp: ts,
      readBySpecialist: true,
      readByPatient: false,
    };

    const updated: Referral = {
      ...referral,
      status: nextStatus,
      acceptedAt: referral.acceptedAt ?? ts.slice(0, 10),
      lastUpdated: ts.slice(0, 10),
      confirmedAppointment: undefined,
      eConsultation: {
        isOffered: isEConsult,
        consultationMode: isEConsult ? 'E-Consultation' : 'In-Person',
        proposedDate: String(proposedDate || ''),
        proposedTime: String(proposedTime || ''),
        consultationReason: String(consultationReason || referral.clinicalInput.reasonForReferral),
        specialistMessage: String(specialistMessage || ''),
        proposedAt: ts,
        proposedBy: actorName,
        patientStatus: 'Pending',
        rescheduleRequest: undefined,
        messages: [...existingMsgs, proposalMsg],
      },
      patientNextSteps: `${actorName} proposed an ${
        isEConsult ? 'online E-Consultation' : 'in-person consultation'
      } for ${proposedDate} at ${proposedTime}. Please accept or request a reschedule in your Patient Portal.`,
      auditLog: [
        ...(referral.auditLog ?? []),
        createAuditEntry({
          actorRole: 'specialist',
          actorName,
          actorId: getSpecialistProfessionalId(referral.specialistId),
          action: 'ECONSULT_PROPOSED',
          details: `Proposed ${isEConsult ? 'E-Consultation' : 'In-Person'} for ${proposedDate} at ${proposedTime}.`,
          timestamp: ts,
        }),
      ],
      timeline: [
        ...referral.timeline,
        {
          id: `tl-ecprop-${Date.now()}`,
          title: isEConsult ? 'E-Consultation Invitation Sent' : 'Appointment Proposed',
          description: `${proposedDate} at ${proposedTime} — awaiting patient approval.`,
          timestamp: ts,
          actor: actorName,
          stage: 'econsult',
        },
      ],
    };

    referralStore.set(referral.id, updated);
    res.json({ referral: updated });
  });

  app.post('/api/referrals/:id/econsult/respond', (req, res) => {
    const referral = referralStore.get(req.params.id);
    if (!referral || !referral.eConsultation) {
      res.status(404).json({ error: 'E-Consultation proposal not found.' });
      return;
    }

    const { decision, suggestedDate, suggestedTime, message, declineReason } = req.body ?? {};
    const ts = nowFormattedServer();
    const ec = referral.eConsultation;

    if (decision === 'Accept') {
      const confirmedStatus =
        ec.consultationMode === 'E-Consultation'
          ? 'E-Consultation Confirmed'
          : 'Appointment Confirmed';
      const updated: Referral = {
        ...referral,
        status: confirmedStatus,
        lastUpdated: ts.slice(0, 10),
        attentionPriority: 'Low',
        confirmedAppointment: {
          date: ec.proposedDate,
          time: ec.proposedTime,
          mode: ec.consultationMode,
          location:
            ec.consultationMode === 'E-Consultation'
              ? `MediBridge Online E-Consultation (${referral.receivingClinic})`
              : referral.receivingClinic,
          instructions:
            ec.consultationMode === 'E-Consultation'
              ? 'Your online E-Consultation is confirmed. Use Secure Specialist-Patient Messaging below for pre-visit questions or coordination.'
              : 'Please arrive 15 minutes early with photo ID and medication list.',
        },
        eConsultation: {
          ...ec,
          patientStatus: 'Accepted',
          respondedAt: ts,
          rescheduleRequest: undefined,
        },
        patientNextSteps: `Your ${ec.consultationMode} with ${referral.specialistName} is confirmed for ${ec.proposedDate} at ${ec.proposedTime}.`,
        auditLog: [
          ...(referral.auditLog ?? []),
          createAuditEntry({
            actorRole: 'patient',
            actorName: referral.patient.name,
            actorId: referral.patient.id,
            action: ec.consultationMode === 'E-Consultation' ? 'ECONSULT_CONFIRMED' : 'ECONSULT_ACCEPTED',
            details: `Patient accepted ${ec.consultationMode} for ${ec.proposedDate} at ${ec.proposedTime}.`,
            timestamp: ts,
          }),
        ],
        timeline: [
          ...referral.timeline,
          {
            id: `tl-ecacc-${Date.now()}`,
            title: `${ec.consultationMode} Confirmed by Patient`,
            description: `Confirmed for ${ec.proposedDate} at ${ec.proposedTime}.`,
            timestamp: ts,
            actor: referral.patient.name,
            stage: 'confirmed',
          },
        ],
      };
      referralStore.set(referral.id, updated);
      res.json({ referral: updated });
      return;
    }

    if (decision === 'Reschedule') {
      const cleanDate = typeof suggestedDate === 'string' ? suggestedDate.trim() : '';
      const cleanTime = typeof suggestedTime === 'string' ? suggestedTime.trim() : '';
      const cleanMsg = typeof message === 'string' ? message.trim() : '';
      if (!cleanDate || !cleanTime) {
        res.status(400).json({ error: 'Suggested date and suggested time are required to reschedule.' });
        return;
      }

      const rescheduleMsg = {
        id: `ecmsg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        referralId: referral.id,
        appointmentContextLabel: `Reschedule Request · ${cleanDate} at ${cleanTime}`,
        senderRole: 'patient' as const,
        senderDisplayName: `${referral.patient.name} (Patient)`,
        content: cleanMsg
          ? `Requested reschedule to ${cleanDate} at ${cleanTime}: ${cleanMsg}`
          : `Requested reschedule to ${cleanDate} at ${cleanTime}.`,
        timestamp: ts,
        readBySpecialist: false,
        readByPatient: true,
      };

      const updated: Referral = {
        ...referral,
        status: 'Reschedule Requested',
        lastUpdated: ts.slice(0, 10),
        attentionPriority: 'Standard',
        confirmedAppointment: undefined,
        eConsultation: {
          ...ec,
          patientStatus: 'Reschedule Requested',
          respondedAt: ts,
          rescheduleRequest: {
            suggestedDate: cleanDate,
            suggestedTime: cleanTime,
            message: cleanMsg || undefined,
            requestedAt: ts,
          },
          messages: [...ec.messages, rescheduleMsg],
        },
        patientNextSteps: `Reschedule requested for ${cleanDate} at ${cleanTime}. ${referral.specialistName}’s office has been notified and will confirm your proposed time or suggest another slot.`,
        auditLog: [
          ...(referral.auditLog ?? []),
          createAuditEntry({
            actorRole: 'patient',
            actorName: referral.patient.name,
            actorId: referral.patient.id,
            action: 'ECONSULT_RESCHEDULE_REQUESTED',
            details: `Requested reschedule to ${cleanDate} at ${cleanTime}${cleanMsg ? ` (${cleanMsg})` : ''}.`,
            timestamp: ts,
          }),
        ],
        timeline: [
          ...referral.timeline,
          {
            id: `tl-ecresch-${Date.now()}`,
            title: `${ec.consultationMode} Reschedule Requested`,
            description: `Patient suggested ${cleanDate} at ${cleanTime}${cleanMsg ? ` — "${cleanMsg}"` : ''}. Awaiting specialist response.`,
            timestamp: ts,
            actor: referral.patient.name,
            stage: 'econsult',
          },
        ],
      };
      referralStore.set(referral.id, updated);
      res.json({ referral: updated });
      return;
    }

    if (decision === 'Decline' && ec.consultationMode !== 'E-Consultation') {
      const updated: Referral = {
        ...referral,
        status: 'Accepted',
        lastUpdated: ts.slice(0, 10),
        attentionPriority: 'Standard',
        confirmedAppointment: undefined,
        eConsultation: {
          ...ec,
          patientStatus: 'Declined',
          respondedAt: ts,
          declineReason: typeof declineReason === 'string' ? declineReason.trim() : undefined,
        },
        patientNextSteps: `You declined the proposed ${ec.consultationMode} for ${ec.proposedDate}. ${referral.receivingClinic} has been notified to propose an alternative time.`,
        auditLog: [
          ...(referral.auditLog ?? []),
          createAuditEntry({
            actorRole: 'patient',
            actorName: referral.patient.name,
            actorId: referral.patient.id,
            action: 'ECONSULT_DECLINED',
            details: `Patient declined ${ec.consultationMode}${declineReason ? `: ${declineReason}` : ''}.`,
            timestamp: ts,
          }),
        ],
        timeline: [
          ...referral.timeline,
          {
            id: `tl-ecdec-${Date.now()}`,
            title: `${ec.consultationMode} Declined by Patient`,
            description:
              typeof declineReason === 'string' && declineReason.trim()
                ? declineReason.trim()
                : 'Patient requested alternative scheduling.',
            timestamp: ts,
            actor: referral.patient.name,
            stage: 'econsult',
          },
        ],
      };
      referralStore.set(referral.id, updated);
      res.json({ referral: updated });
      return;
    }

    res.status(400).json({ error: 'Invalid decision; expected Accept or Reschedule.' });
  });

  app.post('/api/referrals/:id/econsult/reschedule-respond', (req, res) => {
    const { role, specialistId } = getActorHeaders(req);
    const referral = referralStore.get(req.params.id);
    if (!referral || !referral.eConsultation) {
      res.status(404).json({ error: 'E-Consultation record not found.' });
      return;
    }
    if (role === 'specialist' && specialistId && referral.specialistId !== specialistId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    if (!isConfidentialityUnlocked(referral)) {
      res.status(403).json({ error: 'Unlock patient confidentiality before managing schedule requests.' });
      return;
    }

    const { action, proposedDate, proposedTime, specialistMessage } = req.body ?? {};
    const ts = nowFormattedServer();
    const ec = referral.eConsultation;
    const actorName = referral.specialistName;

    if (action === 'AcceptSuggested') {
      const acceptedDate =
        (typeof proposedDate === 'string' && proposedDate.trim()) ||
        ec.rescheduleRequest?.suggestedDate ||
        '';
      const acceptedTime =
        (typeof proposedTime === 'string' && proposedTime.trim()) ||
        ec.rescheduleRequest?.suggestedTime ||
        '';
      if (!acceptedDate || !acceptedTime) {
        res.status(400).json({ error: 'No suggested date/time found to confirm.' });
        return;
      }

      const confirmedStatus =
        ec.consultationMode === 'E-Consultation'
          ? 'E-Consultation Confirmed'
          : 'Appointment Confirmed';
      const cleanNote = typeof specialistMessage === 'string' ? specialistMessage.trim() : '';

      const confirmMsg = {
        id: `ecmsg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        referralId: referral.id,
        appointmentContextLabel: `Confirmed ${ec.consultationMode} · ${acceptedDate} at ${acceptedTime}`,
        senderRole: 'specialist' as const,
        senderDisplayName: `${actorName} (${referral.receivingClinic})`,
        content:
          cleanNote ||
          `We confirmed your requested reschedule time: ${acceptedDate} at ${acceptedTime}.`,
        timestamp: ts,
        readBySpecialist: true,
        readByPatient: false,
      };

      const updated: Referral = {
        ...referral,
        status: confirmedStatus,
        lastUpdated: ts.slice(0, 10),
        attentionPriority: 'Low',
        confirmedAppointment: {
          date: acceptedDate,
          time: acceptedTime,
          mode: ec.consultationMode,
          location:
            ec.consultationMode === 'E-Consultation'
              ? `MediBridge Online E-Consultation (${referral.receivingClinic})`
              : referral.receivingClinic,
          instructions:
            ec.consultationMode === 'E-Consultation'
              ? 'Your rescheduled online E-Consultation is confirmed. Use Secure Specialist-Patient Messaging below for pre-visit coordination.'
              : 'Your rescheduled in-person appointment is confirmed. Please arrive 15 minutes early.',
        },
        eConsultation: {
          ...ec,
          proposedDate: acceptedDate,
          proposedTime: acceptedTime,
          patientStatus: 'Accepted',
          respondedAt: ts,
          rescheduleRequest: undefined,
          messages: [...ec.messages, confirmMsg],
        },
        patientNextSteps: `Your ${ec.consultationMode} with ${actorName} is confirmed for your requested time: ${acceptedDate} at ${acceptedTime}.`,
        auditLog: [
          ...(referral.auditLog ?? []),
          createAuditEntry({
            actorRole: 'specialist',
            actorName,
            actorId: getSpecialistProfessionalId(referral.specialistId),
            action: 'ECONSULT_CONFIRMED',
            details: `Specialist accepted patient reschedule request for ${acceptedDate} at ${acceptedTime}.`,
            timestamp: ts,
          }),
        ],
        timeline: [
          ...referral.timeline,
          {
            id: `tl-ecconf-${Date.now()}`,
            title: `${ec.consultationMode} Reschedule Accepted & Confirmed`,
            description: `Specialist confirmed patient-proposed slot: ${acceptedDate} at ${acceptedTime}.`,
            timestamp: ts,
            actor: actorName,
            stage: 'confirmed',
          },
        ],
      };

      referralStore.set(referral.id, updated);
      res.json({ referral: updated });
      return;
    }

    if (action === 'CounterPropose') {
      const nextDate = typeof proposedDate === 'string' ? proposedDate.trim() : '';
      const nextTime = typeof proposedTime === 'string' ? proposedTime.trim() : '';
      const cleanNote = typeof specialistMessage === 'string' ? specialistMessage.trim() : '';
      if (!nextDate || !nextTime) {
        res.status(400).json({ error: 'New proposedDate and proposedTime are required.' });
        return;
      }

      const nextStatus =
        ec.consultationMode === 'E-Consultation'
          ? 'E-Consultation Awaiting Patient Approval'
          : 'Appointment Proposed';

      const counterMsg = {
        id: `ecmsg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        referralId: referral.id,
        appointmentContextLabel: `New Proposed Slot · ${nextDate} at ${nextTime}`,
        senderRole: 'specialist' as const,
        senderDisplayName: `${actorName} (${referral.receivingClinic})`,
        content:
          cleanNote ||
          `We are unable to accommodate the requested slot and have suggested ${nextDate} at ${nextTime}. Please accept or request another time.`,
        timestamp: ts,
        readBySpecialist: true,
        readByPatient: false,
      };

      const updated: Referral = {
        ...referral,
        status: nextStatus,
        lastUpdated: ts.slice(0, 10),
        attentionPriority: 'Standard',
        confirmedAppointment: undefined,
        eConsultation: {
          ...ec,
          proposedDate: nextDate,
          proposedTime: nextTime,
          specialistMessage: cleanNote || ec.specialistMessage,
          proposedAt: ts,
          proposedBy: actorName,
          patientStatus: 'Pending',
          rescheduleRequest: undefined,
          messages: [...ec.messages, counterMsg],
        },
        patientNextSteps: `${actorName} suggested an alternative ${ec.consultationMode} time: ${nextDate} at ${nextTime}. Please accept or request a reschedule in your Patient Portal.`,
        auditLog: [
          ...(referral.auditLog ?? []),
          createAuditEntry({
            actorRole: 'specialist',
            actorName,
            actorId: getSpecialistProfessionalId(referral.specialistId),
            action: 'ECONSULT_PROPOSED',
            details: `Suggested alternative ${ec.consultationMode} time ${nextDate} at ${nextTime}.`,
            timestamp: ts,
          }),
        ],
        timeline: [
          ...referral.timeline,
          {
            id: `tl-eccntr-${Date.now()}`,
            title: 'Alternative Consultation Time Suggested',
            description: `${actorName} proposed ${nextDate} at ${nextTime}${cleanNote ? ` — "${cleanNote}"` : ''}. Awaiting patient approval.`,
            timestamp: ts,
            actor: actorName,
            stage: 'econsult',
          },
        ],
      };

      referralStore.set(referral.id, updated);
      res.json({ referral: updated });
      return;
    }

    res.status(400).json({ error: 'Invalid action; expected AcceptSuggested or CounterPropose.' });
  });

  app.post('/api/referrals/:id/econsult/messages', (req, res) => {
    const referral = referralStore.get(req.params.id);
    if (!referral) {
      res.status(404).json({ error: 'Referral not found.' });
      return;
    }
    const { senderRole, content } = req.body ?? {};
    if ((senderRole !== 'specialist' && senderRole !== 'patient') || !content || !String(content).trim()) {
      res.status(400).json({ error: 'Valid senderRole and message content required.' });
      return;
    }
    const ts = nowFormattedServer();
    const clean = String(content).trim();
    const ec = referral.eConsultation;
    const contextLabel = referral.confirmedAppointment
      ? `${referral.confirmedAppointment.mode ?? 'Consultation'} · ${referral.confirmedAppointment.date} at ${referral.confirmedAppointment.time}`
      : ec
        ? `${ec.consultationMode} · ${ec.proposedDate} at ${ec.proposedTime}`
        : `Referral ${referral.id}`;

    const newMsg = {
      id: `ecmsg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      referralId: referral.id,
      appointmentContextLabel: contextLabel,
      senderRole: senderRole as 'specialist' | 'patient',
      senderDisplayName:
        senderRole === 'specialist'
          ? `${referral.specialistName} (${referral.receivingClinic})`
          : `${referral.patient.name} (Patient)`,
      content: clean,
      timestamp: ts,
      readBySpecialist: senderRole === 'specialist',
      readByPatient: senderRole === 'patient',
    };

    const nextEc = ec
      ? { ...ec, messages: [...ec.messages, newMsg] }
      : {
          isOffered: false,
          consultationMode: 'In-Person' as const,
          proposedDate: referral.confirmedAppointment?.date ?? '',
          proposedTime: referral.confirmedAppointment?.time ?? '',
          consultationReason: referral.clinicalInput.reasonForReferral,
          specialistMessage: '',
          proposedAt: ts,
          proposedBy: referral.specialistName,
          patientStatus: 'Accepted' as const,
          messages: [newMsg],
        };

    const updated: Referral = {
      ...referral,
      lastUpdated: ts.slice(0, 10),
      eConsultation: nextEc,
      auditLog: [
        ...(referral.auditLog ?? []),
        createAuditEntry({
          actorRole: senderRole,
          actorName: newMsg.senderDisplayName,
          actorId: senderRole === 'specialist' ? getSpecialistProfessionalId(referral.specialistId) : referral.patient.id,
          action: 'SECURE_MESSAGE_SENT',
          details: `Sent secure specialist-patient coordination message (${contextLabel}).`,
          timestamp: ts,
        }),
      ],
    };

    referralStore.set(referral.id, updated);
    res.json({ referral: updated, message: newMsg });
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api/')) {
        next();
        return;
      }
      try {
        const template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        next(e);
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MediBridge server listening on http://localhost:${PORT}`);
  });
}

startServer();
