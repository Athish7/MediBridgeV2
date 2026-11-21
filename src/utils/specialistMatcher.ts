import type {
  ClinicalInput,
  ConsultationNotesBundle,
  PatientInfo,
  Specialist,
  SpecialistRecommendationBundle,
  SpecialistRecommendationItem,
  UploadedDocument,
} from '../types/clinbridge';
import { analyzeReferralDeterministic } from './referralAnalyzer';

export const SIMULATED_MATCHING_DISCLAIMER =
  'AI Specialist Recommendations are decision-support only using fictional demonstration clinics, simulated distances, and simulated wait-time estimates. Final specialist selection and referral submission remain under the referring physician’s control.';

export function hasSufficientClinicalInfoForMatching(
  clinical: ClinicalInput,
  consultationNotes?: ConsultationNotesBundle,
  documents: UploadedDocument[] = []
): { sufficient: boolean; summary: string } {
  const pw = consultationNotes?.physicianWritten;
  const activeAi = (consultationNotes?.aiNotes ?? []).filter(
    (n) => n.reviewStatus !== 'Rejected'
  );

  const signalCount = [
    clinical.reasonForReferral.trim(),
    clinical.presentingSymptoms.trim(),
    clinical.clinicalHistory.trim(),
    clinical.examinationFindings.trim(),
    clinical.investigations.trim(),
    pw?.reasonForConsultation.trim(),
    pw?.patientReportedSymptoms.trim(),
    pw?.physicianAssessment.trim(),
    activeAi.length > 0 ? 'ai-notes' : '',
    documents.length > 0 ? 'docs' : '',
  ].filter(Boolean).length;

  if (signalCount < 2) {
    return {
      sufficient: false,
      summary:
        'Enter at least a reason for referral and presenting symptoms (or save consultation notes) before running AI specialist matching.',
    };
  }
  return {
    sufficient: true,
    summary: 'Sufficient clinical context available for AI specialist matching.',
  };
}

function buildCombinedReferralText(
  patient: PatientInfo,
  clinical: ClinicalInput,
  consultationNotes?: ConsultationNotesBundle,
  documents: UploadedDocument[] = []
): string {
  const pw = consultationNotes?.physicianWritten;
  const activeAi = (consultationNotes?.aiNotes ?? []).filter(
    (n) => n.reviewStatus !== 'Rejected'
  );

  const parts = [
    patient.medicalBackground,
    clinical.reasonForReferral,
    clinical.presentingSymptoms,
    clinical.clinicalHistory,
    clinical.previousTreatments,
    clinical.currentMedications,
    clinical.examinationFindings,
    clinical.investigations,
    clinical.additionalNotes,
    pw?.reasonForConsultation,
    pw?.patientReportedSymptoms,
    pw?.relevantMedicalHistory,
    pw?.previousTreatmentsDiscussed,
    pw?.physicianObservations,
    pw?.physicianAssessment,
    pw?.treatmentPlanAndNextSteps,
    ...activeAi.map(
      (n) =>
        `${n.structured.mainReasonForConsultation} ${n.structured.patientReportedSymptoms} ${n.structured.relevantMedicalHistory} ${n.structured.previousTreatmentsDiscussed} ${n.structured.supportingReportFindings ?? ''} ${n.structured.physicianObservations} ${n.structured.physicianAssessment}`
    ),
    ...documents.map((d) => `${d.name} ${d.contentText}`),
  ];

  return parts.filter(Boolean).join(' ').toLowerCase();
}

const SPECIALTY_KEYWORDS: Record<string, string[]> = {
  Dermatology: [
    'skin',
    'lesion',
    'nevus',
    'mole',
    'macule',
    'plaque',
    'rash',
    'eczema',
    'dermatitis',
    'acne',
    'nodulocystic',
    'dermoscopy',
    'melanoma',
    'biopsy',
    'pruritic',
    'psoriasis',
    'topical',
    'dermatology',
  ],
  Orthopedics: [
    'knee',
    'hip',
    'shoulder',
    'meniscus',
    'meniscal',
    'acl',
    'ligament',
    'joint',
    'locking',
    'orthopedic',
    'physiotherapy',
    'x-ray',
    'radiograph',
    'fracture',
    'arthroplasty',
    'mcmurray',
    'rom',
    'musculoskeletal',
  ],
  Cardiology: [
    'heart',
    'cardiac',
    'cardiology',
    'palpitation',
    'ecg',
    'ekg',
    'arrhythmia',
    'atrial fibrillation',
    'hypertension',
    'blood pressure',
    'bp ',
    'lipid',
    'echocardiogram',
    'metoprolol',
    'ramipril',
    'dyspnea',
    'holter',
  ],
  Neurology: [
    'migraine',
    'headache',
    'aura',
    'scotoma',
    'seizure',
    'neuropathy',
    'cranial',
    'neurology',
    'brain mri',
    'tia',
  ],
  Endocrinology: [
    'thyroid',
    'tsh',
    'nodule',
    'diabetes',
    'hba1c',
    'endocrine',
    'endocrinology',
    'osteoporosis',
  ],
  Gastroenterology: [
    'anemia',
    'ferritin',
    'colonoscopy',
    'endoscopy',
    'celiac',
    'ibd',
    'liver',
    'gastroenterology',
    'gi ',
  ],
};

export function inferTargetSpecialty(
  combinedText: string,
  currentSpecialtyHint?: string
): string {
  const scores: Array<{ specialty: string; hits: number }> = Object.entries(
    SPECIALTY_KEYWORDS
  ).map(([specialty, keywords]) => ({
    specialty,
    hits: keywords.reduce((sum, kw) => (combinedText.includes(kw) ? sum + 1 : sum), 0),
  }));

  scores.sort((a, b) => b.hits - a.hits);
  if (scores[0] && scores[0].hits > 0) {
    return scores[0].specialty;
  }
  return currentSpecialtyHint || 'Dermatology';
}

function findMatchedClinicalSignals(text: string, specialist: Specialist): string[] {
  const signals: string[] = [];
  const subMap: Record<string, string[]> = {
    'pigmented lesions': ['pigmented', 'nevus', 'macule', 'melanoma', 'dermoscopy', 'mm'],
    'suspicious pigmented lesions': ['pigmented', 'nevus', 'asymmetric', 'melanoma', 'dermoscopy'],
    'skin cancer screening': ['melanoma', 'fair skin', 'skin check', 'biopsy'],
    'cutaneous surgery': ['excision', 'biopsy', 'mohs'],
    'inflammatory dermatoses': ['acne', 'eczema', 'plaque', 'rash', 'nodulocystic', 'dermatitis'],
    'acne & rosacea': ['acne', 'nodulocystic', 'scarring', 'doxycycline', 'adapalene'],
    'eczema & contact dermatitis': ['eczema', 'dermatitis', 'contact', 'coolant', 'fissured', 'hand'],
    'psoriasis & biologics': ['psoriasis', 'plaque', 'scaly'],
    'knee & sports reconstruction': ['knee', 'acl', 'menisc', 'locking', 'soccer', 'mcmurray'],
    'meniscal injuries': ['menisc', 'locking', 'catching', 'medial joint-line'],
    'degenerative joint disease': ['narrowing', 'osteoarthritis', 'degenerative'],
    'arrhythmia': ['palpitation', 'arrhythmia', 'rhythm', 'ecg', 'holter'],
    'palpitations & arrhythmia': ['palpitation', 'rapid heartbeat', 'ecg', 'metoprolol'],
    'hypertension': ['hypertension', 'blood pressure', 'bp ', 'ramipril', 'lisinopril'],
    'preventive cardiology': ['lipid', 'ldl', 'hba1c', 'rosuvastatin'],
  };

  for (const sub of specialist.subspecialties) {
    const kws = subMap[sub.toLowerCase()] ?? sub.toLowerCase().split(/\s+/);
    if (kws.some((kw) => kw.length > 2 && text.includes(kw))) {
      signals.push(sub);
    }
  }

  return signals;
}

export function recommendSpecialistsDeterministic(params: {
  patient: PatientInfo;
  clinical: ClinicalInput;
  consultationNotes?: ConsultationNotesBundle;
  documents?: UploadedDocument[];
  specialists: Specialist[];
  currentSpecialtyHint?: string;
  locationPreference?: string;
  priorityPreference?: 'balanced' | 'fastest-wait' | 'closest-location';
}): SpecialistRecommendationBundle {
  const {
    patient,
    clinical,
    consultationNotes,
    documents = [],
    specialists,
    currentSpecialtyHint,
    locationPreference = '',
    priorityPreference = 'balanced',
  } = params;

  const combinedText = buildCombinedReferralText(patient, clinical, consultationNotes, documents);
  const inferredSpecialty = inferTargetSpecialty(combinedText, currentSpecialtyHint);
  const locPrefLower = (locationPreference || clinical.additionalNotes || '').toLowerCase();

  const scored = specialists.map((sp) => {
    const analysis = analyzeReferralDeterministic(
      patient,
      clinical,
      sp,
      documents,
      consultationNotes
    );

    const availableRequirements = analysis.checklist
      .filter((c) => c.status === 'Provided' || c.status === 'Clinician verified')
      .map((c) => c.requirement);
    const neededRequirements = analysis.checklist
      .filter((c) => c.status === 'Missing' || c.status === 'Needs clarification')
      .map((c) => c.requirement);

    const reqCoverage =
      analysis.checklist.length > 0
        ? availableRequirements.length / analysis.checklist.length
        : 0.7;

    const specialtyMatchScore =
      sp.specialty.toLowerCase() === inferredSpecialty.toLowerCase() ? 55 : 0;

    const matchedSubs = findMatchedClinicalSignals(combinedText, sp);
    const subspecialtyScore = Math.min(20, matchedSubs.length * 10);

    const waitBonus = Math.max(0, 12 - sp.estimatedWaitWeeks * 1.5);
    const distanceVal = sp.distanceKm ?? 5;
    const distanceBonus = Math.max(0, 10 - distanceVal * 0.9);

    const prefBoost =
      (priorityPreference === 'fastest-wait' ? waitBonus * 1.1 : 0) +
      (priorityPreference === 'closest-location' ? distanceBonus * 1.1 : 0) +
      (locPrefLower &&
      (locPrefLower.includes(sp.location.toLowerCase()) ||
        (locPrefLower.includes('downtown') && sp.location.toLowerCase().includes('downtown')) ||
        (locPrefLower.includes('midtown') && sp.location.toLowerCase().includes('midtown')) ||
        (locPrefLower.includes('northgate') && sp.location.toLowerCase().includes('northgate')) ||
        (locPrefLower.includes('eastside') && sp.location.toLowerCase().includes('eastside')) ||
        (locPrefLower.includes('shortest') && sp.estimatedWaitWeeks <= 3))
        ? 10
        : 0);

    const totalScore =
      specialtyMatchScore +
      subspecialtyScore +
      reqCoverage * 22 +
      waitBonus +
      distanceBonus +
      prefBoost;

    const reasons: string[] = [];
    if (specialtyMatchScore > 0) {
      if (matchedSubs.length > 0) {
        reasons.push(
          `Clinical focus aligns with ${sp.specialty} (${matchedSubs.join(', ')}) based on documented referral reason and notes.`
        );
      } else {
        reasons.push(
          `Specialty matches ${sp.specialty} referral scope based on supplied clinical documentation.`
        );
      }
    } else {
      reasons.push(
        `Alternative ${sp.specialty} directory option (outside primary ${inferredSpecialty} match).`
      );
    }

    if (availableRequirements.length === analysis.checklist.length && analysis.checklist.length > 0) {
      reasons.push(
        `All ${availableRequirements.length} clinic intake requirements appear present in current notes/attachments.`
      );
    } else if (availableRequirements.length > 0) {
      reasons.push(
        `${availableRequirements.length} of ${analysis.checklist.length} intake requirements satisfied; ${neededRequirements.length} remaining (${neededRequirements.join('; ')}).`
      );
    } else {
      reasons.push(
        `Requires ${neededRequirements.length} intake item(s) before submission (${neededRequirements.join('; ')}).`
      );
    }

    reasons.push(
      `Simulated wait time: ${sp.estimatedWait}${sp.distanceLabel ? ` · ${sp.distanceLabel}` : ''}.`
    );

    return {
      specialist: sp,
      totalScore,
      reqCoverage,
      matchedSubs,
      availableRequirements,
      neededRequirements,
      reasons,
    };
  });

  scored.sort((a, b) => b.totalScore - a.totalScore);

  const inSpecialty = scored.filter(
    (s) => s.specialist.specialty.toLowerCase() === inferredSpecialty.toLowerCase()
  );
  const topCandidates =
    inSpecialty.length >= 3 ? inSpecialty.slice(0, 4) : scored.slice(0, 4);

  const recommendations: SpecialistRecommendationItem[] = topCandidates.map((entry, idx) => {
    const suitabilityLevel: SpecialistRecommendationItem['suitabilityLevel'] =
      idx === 0 && entry.matchedSubs.length > 0
        ? 'Strong alignment'
        : entry.specialist.specialty === inferredSpecialty
          ? idx === 0
            ? 'Strong alignment'
            : 'Good alignment'
          : 'Alternative option';

    const suitabilitySummary =
      idx === 0
        ? `Highest directory alignment for ${inferredSpecialty}${
            entry.matchedSubs.length > 0 ? ` (${entry.matchedSubs[0]})` : ''
          } with ${entry.availableRequirements.length}/${
            entry.availableRequirements.length + entry.neededRequirements.length
          } intake items ready.`
        : entry.neededRequirements.length === 0
          ? `Complete intake match (${entry.specialist.estimatedWait}; ${
              entry.specialist.distanceLabel ?? entry.specialist.location
            }).`
          : `${entry.specialist.subspecialties[0] ?? entry.specialist.specialty} clinic (${
              entry.specialist.estimatedWait
            }) — ${entry.neededRequirements.length} intake item(s) still needed.`;

    return {
      specialistId: entry.specialist.id,
      suitabilityLevel,
      suitabilitySummary,
      supportingReasons: entry.reasons,
      availableRequirements: entry.availableRequirements,
      neededRequirements: entry.neededRequirements,
    };
  });

  const basisSignals = [
    clinical.reasonForReferral.trim() && 'referral reason',
    (clinical.presentingSymptoms.trim() ||
      consultationNotes?.physicianWritten?.patientReportedSymptoms.trim()) &&
      'documented symptoms',
    (consultationNotes?.physicianWritten?.lastSavedAt ||
      (consultationNotes?.aiNotes ?? []).some((n) => n.reviewStatus === 'Approved')) &&
      'physician-written & approved consultation notes',
    clinical.previousTreatments.trim() && 'previous treatments',
    (clinical.investigations.trim() || documents.length > 0) &&
      `${documents.length} uploaded document(s)/investigations`,
  ].filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    engineMode: 'deterministic',
    inferredSpecialty,
    clinicalBasisSummary: `Analyzed ${basisSignals.join(', ') || 'entered referral fields'} to rank ${
      recommendations.length
    } fictional ${inferredSpecialty} specialists from the MediBridge demonstration directory.`,
    disclaimer: SIMULATED_MATCHING_DISCLAIMER,
    recommendations,
  };
}
