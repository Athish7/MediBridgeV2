import type {
  AnonymousReferralPreview,
  AuditLogEntry,
  PatientInfo,
  Referral,
  ReferralStatus,
} from '../types/clinbridge';

export const CONFIDENTIALITY_AGREEMENT_TEXT =
  'I confirm that I am an authorized healthcare professional reviewing this referral for legitimate clinical purposes. I agree to maintain the confidentiality and security of all patient information and will only access and use this information for the purpose of providing appropriate healthcare.';

export const SPECIALIST_PROFESSIONAL_IDS: Record<string, string> = {
  'spec-almansoor': 'CPSO-84192-DERM',
  'spec-bellamy': 'CPSO-73204-DERM',
  'spec-castellanos': 'CPSO-69011-DERM',
  'spec-okafor': 'CPSO-88340-ORTHO',
  'spec-kapoor': 'CPSO-91205-ORTHO',
  'spec-mercer': 'CPSO-64419-ORTHO',
  'spec-chen': 'CPSO-77412-CARD',
  'spec-siddiqui': 'CPSO-80533-CARD',
  'spec-reyes': 'CPSO-72984-CARD',
  'spec-nair': 'CPSO-85109-NEUR',
  'spec-beaumont': 'CPSO-79440-ENDO',
  'spec-lindqvist': 'CPSO-68122-GAST',
};

export function getSpecialistProfessionalId(specialistId: string): string {
  return SPECIALIST_PROFESSIONAL_IDS[specialistId] || `CPSO-${specialistId.toUpperCase()}`;
}

export function normalizeReferralStatus(status: ReferralStatus | string): ReferralStatus {
  if (status === 'Awaiting specialist review') return 'Awaiting Specialist Review';
  if (status === 'Clarification requested') return 'Additional Information Requested';
  if (status === 'Appointment confirmed') return 'Appointment Confirmed';
  return status as ReferralStatus;
}

export function isConfidentialityUnlocked(referral: Pick<Referral, 'confidentialityAcknowledgement'>): boolean {
  return Boolean(referral.confidentialityAcknowledgement?.accepted);
}

export function formatPatientAgeRange(age?: number, dob?: string): string {
  let computedAge = age;
  if (typeof computedAge !== 'number' && dob) {
    const birthYear = Number(dob.slice(0, 4));
    if (!Number.isNaN(birthYear) && birthYear > 1900) {
      computedAge = 2026 - birthYear;
    }
  }
  if (typeof computedAge !== 'number' || Number.isNaN(computedAge)) {
    return 'Age range not specified';
  }
  const lower = Math.floor(computedAge / 10) * 10;
  const upper = lower + 9;
  return `Age ${computedAge} (${lower}–${upper} yrs range)`;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redactPiiText(
  text: string | undefined,
  patient: Pick<PatientInfo, 'id' | 'name' | 'dob' | 'phone' | 'email' | 'address' | 'healthCardNumber'>,
  extraSensitiveValues: Array<string | undefined> = []
): string {
  if (!text) return '';
  let result = text;

  const exactCandidates: string[] = [
    patient.name,
    patient.dob,
    patient.phone,
    patient.email,
    patient.address ?? '',
    patient.healthCardNumber ?? '',
    patient.id,
    ...extraSensitiveValues.map((v) => v ?? ''),
  ]
    .map((v) => v.trim())
    .filter((v) => v.length >= 3);

  // Also strip individual first/last name tokens >= 3 characters to prevent partial leaks
  const nameTokens = (patient.name || '')
    .split(/\s+/)
    .map((t) => t.replace(/[^\w'-]/g, '').trim())
    .filter((t) => t.length >= 3);

  const allTargets = Array.from(new Set([...exactCandidates, ...nameTokens])).sort(
    (a, b) => b.length - a.length
  );

  for (const target of allTargets) {
    const regex = new RegExp(`\\b${escapeRegExp(target)}\\b`, 'gi');
    result = result.replace(regex, '[Redacted Patient Identifier]');
  }

  // Generic patterns: email, phone numbers, OHIP/health card patterns, DOB YYYY-MM-DD
  result = result.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[Redacted Contact]');
  result = result.replace(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, '[Redacted Phone]');
  result = result.replace(/\b\d{4}-\d{3}-\d{3}(?:-[A-Z]{2})?\b/gi, '[Redacted Health Card]');
  result = result.replace(/\b(?:19|20)\d{2}-\d{2}-\d{2}\b/g, '[Redacted Date]');

  return result;
}

export function projectStage1AnonymousReferral(referral: Referral): AnonymousReferralPreview {
  const p = referral.patient;
  const extraIds = [referral.insurance?.policyOrMemberId];

  const pw = referral.consultationNotes?.physicianWritten;
  const approvedAi = (referral.consultationNotes?.aiNotes ?? []).find(
    (n) => n.reviewStatus === 'Approved'
  );

  const rawSummary =
    referral.clinicalInput.referralSummary?.trim() ||
    pw?.physicianAssessment?.trim() ||
    approvedAi?.structured.mainReasonForConsultation ||
    referral.analysis.executiveSummary;

  const suspected =
    referral.clinicalInput.suspectedDiagnoses?.trim() ||
    pw?.physicianAssessment?.trim() ||
    'Not explicitly separated in initial record';

  const confirmed = referral.clinicalInput.confirmedDiagnoses?.trim() || 'None documented';

  return {
    id: referral.id,
    referralDate: referral.referralDate,
    lastUpdated: referral.lastUpdated,
    status: normalizeReferralStatus(referral.status),
    specialistId: referral.specialistId,
    specialistName: referral.specialistName,
    specialty: referral.specialty,
    receivingClinic: referral.receivingClinic,
    urgency: referral.urgency ?? 'Routine',
    patientAgeLabel: formatPatientAgeRange(p.age, p.dob),
    deidentifiedMedicalHistory:
      redactPiiText(
        [p.medicalBackground, referral.clinicalInput.clinicalHistory].filter(Boolean).join(' '),
        p,
        extraIds
      ) || 'No de-identified medical history recorded.',
    reasonForReferral:
      redactPiiText(referral.clinicalInput.reasonForReferral, p, extraIds) ||
      'Specialist consultation requested.',
    briefConsultationSummary:
      redactPiiText(rawSummary, p, extraIds) ||
      'Brief clinical consultation summary pending.',
    symptoms:
      redactPiiText(referral.clinicalInput.presentingSymptoms, p, extraIds) ||
      'Not specified.',
    preliminaryOrSuspectedDiagnosis: redactPiiText(suspected, p, extraIds),
    confirmedDiagnoses: redactPiiText(confirmed, p, extraIds),
    investigationsSummary:
      redactPiiText(referral.clinicalInput.investigations, p, extraIds) ||
      'No investigation summary entered.',
    documentSummaries: referral.documents.map((doc, idx) => ({
      id: doc.id,
      name: `De-identified Supporting Record #${idx + 1} (${doc.sizeLabel})`,
      uploadedAt: doc.uploadedAt,
      redactedExcerpt: redactPiiText(doc.contentText, p, extraIds).slice(0, 320),
    })),
    completeness: referral.completeness,
    insuranceStatusSummary: {
      availabilityStatus: referral.insurance?.availabilityStatus ?? 'To be confirmed',
      coverageCategory: referral.insurance?.coverageCategory ?? 'Not Confirmed',
      hasSpecialistRequest: Boolean(
        referral.insurance?.specialistRequest && !referral.insurance.specialistRequest.resolved
      ),
    },
    privacyNotice:
      'Stage 1 Privacy Protection Active: Direct patient identifiers (name, date of birth, address, phone, email, health card, and policy IDs) are withheld at the API level until the Confidentiality Agreement is accepted.',
    confidentialityAccepted: isConfidentialityUnlocked(referral),
    privacyStage: isConfidentialityUnlocked(referral) ? 'stage2_unlocked' : 'stage1_anonymous',
    auditLogCount: (referral.auditLog ?? []).length,
  };
}

export function createAuditEntry(params: {
  actorRole: AuditLogEntry['actorRole'];
  actorName: string;
  actorId: string;
  action: AuditLogEntry['action'];
  details: string;
  timestamp?: string;
}): AuditLogEntry {
  const ts =
    params.timestamp ?? new Date().toISOString().slice(0, 16).replace('T', ' ');
  return {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: ts,
    actorRole: params.actorRole,
    actorName: params.actorName,
    actorId: params.actorId,
    action: params.action,
    details: params.details,
    safeguardMode: 'Prototype Simulation (Server RBAC + Stage-1 De-identification)',
  };
}

export function maskIdentifier(value?: string): string {
  if (!value || !value.trim()) return 'Not provided';
  const clean = value.trim();
  if (clean.length <= 4) return '••••';
  return `•••• ${clean.slice(-4)}`;
}
