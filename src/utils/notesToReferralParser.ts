import type { GeneratedReferralFromNotes, ReferralUrgency } from '../types/clinbridge';

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;\n])\s+|\r?\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractMatching(
  segments: string[],
  prefixes: string[],
  keywords: string[]
): string {
  const hits: string[] = [];
  for (const seg of segments) {
    const lower = seg.toLowerCase();
    const prefixHit = prefixes.some((p) => lower.startsWith(p));
    const kwHit = keywords.some((k) => lower.includes(k));
    if (prefixHit || kwHit) {
      // Strip common label prefix cleanly
      let cleaned = seg;
      for (const p of prefixes) {
        if (lower.startsWith(p)) {
          cleaned = seg.slice(p.length).trim();
          break;
        }
      }
      if (cleaned) hits.push(cleaned);
    }
  }
  return Array.from(new Set(hits)).slice(0, 3).join(' ');
}

export function generateReferralFromNotesDeterministic(
  rawNotes: string,
  specialtyHint?: string
): GeneratedReferralFromNotes {
  const cleaned = rawNotes.trim();
  const lines = splitLines(cleaned);
  const sentences = splitSentences(cleaned);
  const segments = Array.from(new Set([...lines, ...sentences]));
  const lowerAll = cleaned.toLowerCase();

  if (!cleaned) {
    return {
      reasonForReferral: '',
      presentingSymptoms: '',
      clinicalHistory: '',
      examinationFindings: '',
      confirmedDiagnoses: '',
      suspectedDiagnoses: '',
      investigations: '',
      currentMedications: '',
      allergies: '',
      previousTreatments: '',
      clinicalQuestionsForSpecialist: '',
      recommendedUrgency: 'Routine',
      urgencyRationale: 'Default Routine urgency — no consultation notes entered yet.',
      referralSummary: '',
      uncertainSections: ['No consultation notes text was provided.'],
      missingSections: ['Reason for referral', 'Symptoms', 'Examination findings', 'Investigations'],
      engineMode: 'deterministic',
      disclaimer:
        'AI-generated referral draft from supplied notes. Physician review, editing, and clinical confirmation are required prior to submission.',
    };
  }

  const reasonForReferral = extractMatching(
    segments,
    [
      'reason for referral:',
      'reason for visit:',
      'reason for consultation:',
      'reason:',
      'chief complaint:',
      'cc:',
      'presenting complaint:',
      'refer to:',
      'referral:',
    ],
    ['referred for', 'refer for', 'evaluation of', 'consultation for', 'specialist opinion', 'assessment of']
  );

  const presentingSymptoms = extractMatching(
    segments,
    ['symptoms:', 'presenting symptoms:', 'hpi:', 'history of present illness:', 'subjective:', 'patient reports:'],
    [
      'pain',
      'palpitation',
      'shortness of breath',
      'dyspnea',
      'lesion',
      'rash',
      'itch',
      'pruritus',
      'swelling',
      'headache',
      'weakness',
      'numbness',
      'fatigue',
      'locking',
      'catching',
      'weeks',
      'months',
      'days',
    ]
  );

  const clinicalHistory = extractMatching(
    segments,
    ['medical history:', 'relevant medical history:', 'pmh:', 'past medical history:', 'history:', 'background:'],
    ['history of', 'hypertension', 'diabetes', 'asthma', 'melanoma', 'family history', 'prior surgery', 'allergy', 'allergies', 'smoker']
  );

  const examinationFindings = extractMatching(
    segments,
    ['exam:', 'examination:', 'physical exam:', 'pe:', 'objective:', 'observations:', 'vitals:'],
    ['bp ', 'blood pressure', 'hr ', 'heart rate', 'spo2', 'temp', 'tenderness', 'rom', 'range of motion', 'murmur', 'lesion', 'mm', 'dermoscopy', 'effusion', 'mcmurray', 'clear lungs', 'neurological']
  );

  // Strictly separate confirmed vs. suspected/provisional diagnoses
  const confirmedDiagnoses = extractMatching(
    segments,
    ['confirmed diagnosis:', 'confirmed diagnoses:', 'established diagnosis:', 'known diagnosis:'],
    ['confirmed ', 'biopsy-proven', 'diagnosed with', 'established ']
  );

  const suspectedDiagnoses = extractMatching(
    segments,
    [
      'suspected diagnosis:',
      'suspected diagnoses:',
      'provisional diagnosis:',
      'working diagnosis:',
      'differential:',
      'impression:',
      'assessment:',
    ],
    ['suspected', 'rule out', 'r/o', 'possible', 'probable', 'likely', 'differential', 'suspicious for', 'query ', '?']
  );

  const investigations = extractMatching(
    segments,
    ['investigations:', 'labs:', 'imaging:', 'workup:', 'results:', 'tests:'],
    ['ecg', 'ekg', 'mri', 'x-ray', 'xray', 'ultrasound', 'ct ', 'cbc', 'tsh', 'hba1c', 'lipid', 'ferritin', 'creatinine', 'egfr', 'biopsy', 'pending', 'ordered']
  );

  const currentMedications = extractMatching(
    segments,
    ['current medications:', 'medications:', 'meds:', 'rx:', 'active meds:'],
    ['mg', 'mcg', 'daily', 'bid', 'tid', 'prn', 'metoprolol', 'ramipril', 'atorvastatin', 'rosuvastatin', 'metformin', 'levothyroxine', 'naproxen', 'ibuprofen']
  );

  const allergies = extractMatching(
    segments,
    ['allergies:', 'allergy:', 'drug allergies:', 'nkda:'],
    ['nkda', 'no known drug allergies', 'allergic to', 'anaphylaxis', 'penicillin', 'sulfa']
  );

  const previousTreatments = extractMatching(
    segments,
    ['previous treatments:', 'prior treatments:', 'treatment history:', 'treatments:', 'plan:', 'treatment plan:'],
    ['tried', 'physiotherapy', 'physio', 'cream', 'topical', 'steroid', 'trial', 'discontinued', 'conservative', 'lifestyle']
  );

  const clinicalQuestionsForSpecialist = extractMatching(
    segments,
    ['clinical question:', 'clinical questions:', 'questions for specialist:', 'question:'],
    ['please evaluate', 'would appreciate', 'advise on', 'candidate for', 'need opinion on', 'whether ']
  );

  // Urgency heuristic strictly from explicit red-flag or urgency terms in text
  let recommendedUrgency: ReferralUrgency = 'Routine';
  let urgencyRationale = 'No urgent red-flag keywords detected in pasted notes; suggested Routine unless physician overrides.';
  if (
    lowerAll.includes('urgent') ||
    lowerAll.includes('stat') ||
    lowerAll.includes('red flag') ||
    lowerAll.includes('melanoma') ||
    lowerAll.includes('syncope') ||
    lowerAll.includes('chest pain') ||
    lowerAll.includes('rapidly growing') ||
    lowerAll.includes('progressive weakness')
  ) {
    recommendedUrgency = 'Urgent';
    urgencyRationale = 'Urgent or high-priority clinical phrasing detected in supplied notes — physician confirmation required.';
  } else if (
    lowerAll.includes('semi-urgent') ||
    lowerAll.includes('soon') ||
    lowerAll.includes('worsening') ||
    lowerAll.includes('changing') ||
    lowerAll.includes('refractory')
  ) {
    recommendedUrgency = 'Semi-Urgent';
    urgencyRationale = 'Worsening, changing, or refractory phrasing detected in supplied notes — confirm Semi-Urgent vs Routine.';
  }

  const uncertainSections: string[] = [];
  const missingSections: string[] = [];

  if (!reasonForReferral) {
    missingSections.push('Reason for referral');
    uncertainSections.push('Primary reason for referral was not explicitly labelled — confirm concise consultation question.');
  }
  if (!presentingSymptoms) missingSections.push('Presenting symptoms');
  if (!clinicalHistory) missingSections.push('Relevant medical history');
  if (!examinationFindings) {
    missingSections.push('Examination findings');
    uncertainSections.push('Objective examination findings or vitals were not detected in the pasted notes.');
  }
  if (!investigations) {
    missingSections.push('Investigations / lab results');
  }
  if (!currentMedications) missingSections.push('Current medications');
  if (!confirmedDiagnoses && !suspectedDiagnoses) {
    uncertainSections.push('No confirmed or suspected diagnosis phrasing detected — confirm working impression if applicable.');
  }

  if (
    lowerAll.includes('unclear') ||
    lowerAll.includes('unsure') ||
    lowerAll.includes('unknown') ||
    lowerAll.includes('pending') ||
    lowerAll.includes('?')
  ) {
    uncertainSections.push(
      'Notes include pending items or provisional/uncertain wording ("unclear", "pending", or "?") — review extracted fields carefully.'
    );
  }

  const summaryParts = [
    specialtyHint ? `Draft ${specialtyHint} referral summary generated from family physician consultation notes.` : 'Draft specialist referral summary generated from family physician consultation notes.',
    reasonForReferral ? `Reason: ${reasonForReferral}` : '',
    presentingSymptoms ? `Symptoms: ${presentingSymptoms}` : '',
    confirmedDiagnoses ? `Confirmed diagnosis: ${confirmedDiagnoses}` : '',
    suspectedDiagnoses ? `Suspected/provisional impression: ${suspectedDiagnoses}` : '',
    investigations ? `Investigations: ${investigations}` : '',
    clinicalQuestionsForSpecialist ? `Specialist question: ${clinicalQuestionsForSpecialist}` : '',
  ].filter(Boolean);

  return {
    reasonForReferral: reasonForReferral || (lines[0] ?? ''),
    presentingSymptoms,
    clinicalHistory,
    examinationFindings,
    confirmedDiagnoses,
    suspectedDiagnoses,
    investigations,
    currentMedications,
    allergies,
    previousTreatments,
    clinicalQuestionsForSpecialist:
      clinicalQuestionsForSpecialist ||
      (reasonForReferral ? `Please evaluate and advise on management for: ${reasonForReferral}` : ''),
    recommendedUrgency,
    urgencyRationale,
    referralSummary: summaryParts.join(' '),
    uncertainSections,
    missingSections,
    engineMode: 'deterministic',
    disclaimer:
      'Extracted strictly from pasted family physician notes without inventing missing clinical data. Physician must review, verify, and edit all fields before submission.',
  };
}
