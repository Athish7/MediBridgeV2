export type ReferralStatus =
  | 'Draft'
  | 'Awaiting Specialist Selection'
  | 'Ready for submission'
  | 'Submitted'
  | 'Awaiting Specialist Review'
  | 'Awaiting specialist review'
  | 'Anonymous Information Reviewed'
  | 'Confidentiality Agreement Accepted'
  | 'Full Information Unlocked'
  | 'Awaiting Specialist Decision'
  | 'Accepted'
  | 'Declined'
  | 'Additional Information Requested'
  | 'Clarification requested'
  | 'Appointment Proposed'
  | 'E-Consultation Awaiting Patient Approval'
  | 'Reschedule Requested'
  | 'E-Consultation Confirmed'
  | 'Appointment Confirmed'
  | 'Appointment confirmed'
  | 'Completed';

export type ReferralUrgency = 'Routine' | 'Semi-Urgent' | 'Urgent';

export type VerificationState =
  | 'Extracted from provided information'
  | 'Needs clinician review'
  | 'Missing'
  | 'Clinician verified';

export type ChecklistStatus =
  | 'Provided'
  | 'Missing'
  | 'Needs clarification'
  | 'Clinician verified';

export type AdminAttentionPriority = 'High' | 'Standard' | 'Low';

export type Perspective = 'physician' | 'specialist' | 'patient';

export interface PatientInfo {
  id: string;
  name: string;
  dob: string;
  age?: number;
  phone: string;
  email: string;
  address?: string;
  healthCardNumber?: string;
  medicalBackground: string;
}

export interface ReferringPhysicianContact {
  physicianName: string;
  credentials: string;
  clinicName: string;
  clinicAddress: string;
  phone: string;
  email: string;
  additionalContact?: string;
}

export interface UploadedDocument {
  id: string;
  name: string;
  type: string;
  sizeLabel: string;
  uploadedAt: string;
  contentText: string;
}

export interface ClinicalInput {
  reasonForReferral: string;
  presentingSymptoms: string;
  clinicalHistory: string;
  previousTreatments: string;
  currentMedications: string;
  allergies?: string;
  examinationFindings: string;
  investigations: string;
  confirmedDiagnoses?: string;
  suspectedDiagnoses?: string;
  clinicalQuestionsForSpecialist?: string;
  referralSummary?: string;
  additionalNotes: string;
}

export interface PhysicianConsultationNotes {
  reasonForConsultation: string;
  patientReportedSymptoms: string;
  relevantMedicalHistory: string;
  previousTreatmentsDiscussed: string;
  physicianObservations: string;
  physicianAssessment: string;
  treatmentPlanAndNextSteps: string;
  followUpInstructions: string;
  lastSavedAt?: string;
}

export type AiNoteSourceType =
  | 'AI-generated from referral record'
  | 'AI-generated'
  | 'Imported transcript'
  | 'Imported medical scribe summary'
  | 'Uploaded audio recording';

export type AiNoteReviewStatus = 'Pending physician review' | 'Approved' | 'Rejected';

export interface SpecialtyHighlightItem {
  label: string;
  value: string;
}

export interface StructuredConsultationDraft {
  mainReasonForConsultation: string;
  patientReportedSymptoms: string;
  relevantMedicalHistory: string;
  previousTreatmentsDiscussed: string;
  supportingReportFindings?: string;
  physicianObservations: string;
  physicianAssessment: string;
  planAndFollowUpInstructions: string;
  specialtyContextLabel?: string;
  specialtyHighlights?: SpecialtyHighlightItem[];
  uncertainOrIncompleteItems: string[];
  supportedReferralFields: string[];
  sourceQuotes: Record<string, string>;
}

export interface AiConsultationNote {
  id: string;
  sourceType: AiNoteSourceType;
  sourceFileName?: string;
  rawContent: string;
  importedAt: string;
  structured: StructuredConsultationDraft;
  reviewStatus: AiNoteReviewStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  physicianEdited?: boolean;
}

export interface ConsultationNotesBundle {
  physicianWritten?: PhysicianConsultationNotes;
  aiNotes?: AiConsultationNote[];
}

export interface GeneratedReferralFromNotes {
  reasonForReferral: string;
  presentingSymptoms: string;
  clinicalHistory: string;
  examinationFindings: string;
  confirmedDiagnoses: string;
  suspectedDiagnoses: string;
  investigations: string;
  currentMedications: string;
  allergies?: string;
  previousTreatments: string;
  clinicalQuestionsForSpecialist: string;
  recommendedUrgency: ReferralUrgency;
  urgencyRationale: string;
  referralSummary: string;
  uncertainSections: string[];
  missingSections: string[];
  engineMode: 'gemini' | 'deterministic';
  disclaimer: string;
}

export type InsuranceAvailabilityStatus =
  | 'Available and included'
  | 'Not available'
  | 'Not applicable'
  | 'To be confirmed';

export interface InsuranceWorkflowStageStatus {
  stage:
    | 'Information Collection'
    | 'Eligibility / Coverage Verification'
    | 'Prior Authorization'
    | 'Billing / Claims Submission'
    | 'Actual Reimbursement';
  status: 'Completed' | 'Needs Review' | 'Action Recommended' | 'Not Simulated / Out of Scope';
  summary: string;
}

export interface InsuranceAssessmentResult {
  assessedAt: string;
  engineMode: 'gemini' | 'deterministic';
  sufficiencyStatus: 'Sufficient for Intake' | 'Additional Details Recommended' | 'Missing Insurance Details';
  summary: string;
  missingDetails: string[];
  relevantCoverageHighlights: string[];
  priorAuthorizationFlags: string[];
  recommendedVerificationSteps: string[];
  remainingConfirmations: string[];
  canadianHealthcareContextNote: string;
  workflowStages: InsuranceWorkflowStageStatus[];
  disclaimer: string;
}

export interface InsuranceRequestRecord {
  id: string;
  requestedBy: string;
  requestedAt: string;
  requestedDetails: string;
  reason: string;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface MedicalInsuranceInfo {
  availabilityStatus: InsuranceAvailabilityStatus;
  coverageCategory:
    | 'Provincial Public Health Plan + Private Extended Coverage'
    | 'Provincial Public Health Plan Only'
    | 'Private / Employer Extended Coverage Only'
    | 'Self-Pay / Uninsured'
    | 'Not Confirmed';
  provinceOrJurisdiction?: string;
  providerName: string;
  planType: string;
  policyOrMemberId: string;
  coverageDetails: string;
  referralServiceCoverageNotes: string;
  additionalNotes: string;
  verificationStatus?: 'Verified' | 'Needs verification' | 'Missing';
  lastUpdatedAt?: string;
  lastUpdatedBy?: string;
  specialistRequest?: InsuranceRequestRecord;
  aiAssessment?: InsuranceAssessmentResult;
}

export interface ConfidentialityAcknowledgement {
  accepted: boolean;
  specialistId: string;
  specialistName: string;
  professionalId: string;
  acknowledgedAt: string;
  statement: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorRole: 'physician' | 'specialist' | 'patient' | 'system';
  actorName: string;
  actorId: string;
  action:
    | 'REFERRAL_SUBMITTED'
    | 'ANONYMOUS_PREVIEW_VIEWED'
    | 'CONFIDENTIALITY_ACCEPTED'
    | 'FULL_REFERRAL_UNLOCKED'
    | 'SPECIALIST_DECISION_ACCEPTED'
    | 'SPECIALIST_DECISION_DECLINED'
    | 'CLARIFICATION_REQUESTED'
    | 'CLARIFICATION_RESPONDED'
    | 'INSURANCE_INFO_REQUESTED'
    | 'INSURANCE_INFO_UPDATED'
    | 'ECONSULT_PROPOSED'
    | 'ECONSULT_ACCEPTED'
    | 'ECONSULT_CONFIRMED'
    | 'ECONSULT_RESCHEDULE_REQUESTED'
    | 'ECONSULT_DECLINED'
    | 'APPOINTMENT_CONFIRMED'
    | 'SECURE_MESSAGE_SENT';
  details: string;
  safeguardMode: 'Prototype Simulation (Server RBAC + Stage-1 De-identification)';
}

export interface AnonymousReferralPreview {
  id: string;
  referralDate: string;
  lastUpdated: string;
  status: ReferralStatus;
  specialistId: string;
  specialistName: string;
  specialty: string;
  receivingClinic: string;
  urgency: ReferralUrgency;
  patientAgeLabel: string;
  deidentifiedMedicalHistory: string;
  reasonForReferral: string;
  briefConsultationSummary: string;
  symptoms: string;
  preliminaryOrSuspectedDiagnosis: string;
  confirmedDiagnoses: string;
  investigationsSummary: string;
  documentSummaries: Array<{
    id: string;
    name: string;
    uploadedAt: string;
    redactedExcerpt: string;
  }>;
  completeness: number;
  insuranceStatusSummary: {
    availabilityStatus: InsuranceAvailabilityStatus;
    coverageCategory: MedicalInsuranceInfo['coverageCategory'];
    hasSpecialistRequest: boolean;
  };
  privacyNotice: string;
  confidentialityAccepted: boolean;
  privacyStage: 'stage1_anonymous' | 'stage2_unlocked';
  auditLogCount: number;
}

export interface EConsultationMessage {
  id: string;
  referralId: string;
  appointmentContextLabel: string;
  senderRole: 'specialist' | 'patient';
  senderDisplayName: string;
  content: string;
  timestamp: string;
  readBySpecialist: boolean;
  readByPatient: boolean;
}

export interface EConsultationRescheduleRequest {
  suggestedDate: string;
  suggestedTime: string;
  message?: string;
  requestedAt: string;
}

export interface EConsultationProposal {
  isOffered: boolean;
  consultationMode: 'E-Consultation' | 'In-Person';
  proposedDate: string;
  proposedTime: string;
  consultationReason: string;
  specialistMessage: string;
  proposedAt: string;
  proposedBy: string;
  patientStatus: 'Pending' | 'Accepted' | 'Reschedule Requested' | 'Declined';
  respondedAt?: string;
  rescheduleRequest?: EConsultationRescheduleRequest;
  declineReason?: string;
  messages: EConsultationMessage[];
}

export interface ExtractedSummaryItem {
  id: string;
  section:
    | 'Reason for Referral'
    | 'Relevant Medical History'
    | 'Presenting Symptoms & Findings'
    | 'Previous Treatments & Medications'
    | 'Supporting Investigations';
  label: string;
  value: string;
  verificationState: VerificationState;
  relevanceNote: string;
  sourceLabel: string;
  sourceExcerpt: string;
}

export interface ChecklistItem {
  id: string;
  requirement: string;
  status: ChecklistStatus;
  details: string;
  sourceLabel?: string;
  sourceExcerpt?: string;
}

export interface AmbiguityFlag {
  id: string;
  title: string;
  description: string;
  sourceLabel: string;
  resolved: boolean;
}

export interface AIAnalysisResult {
  engineMode: 'gemini' | 'deterministic';
  engineLabel: string;
  analyzedAt: string;
  completenessScore: number;
  executiveSummary: string;
  extractedItems: ExtractedSummaryItem[];
  checklist: ChecklistItem[];
  missingItems: string[];
  ambiguityFlags: AmbiguityFlag[];
  sourceTraceabilityNotice: string;
}

export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  actor: string;
  stage:
    | 'initiated'
    | 'organized'
    | 'reviewed'
    | 'approved'
    | 'submitted'
    | 'received'
    | 'privacy'
    | 'clarification'
    | 'insurance'
    | 'econsult'
    | 'message'
    | 'accepted'
    | 'declined'
    | 'confirmed'
    | 'cancelled'
    | 'completed';
}

export interface ClarificationEntry {
  id: string;
  requestedBy: string;
  requestedAt: string;
  missingInformation: string;
  reason: string;
  notes: string;
  status: 'Open' | 'Responded';
  physicianResponse?: {
    respondedBy: string;
    respondedAt: string;
    responseText: string;
    attachedDocumentName?: string;
  };
}

export type CommunicationMessageType =
  | 'General message'
  | 'Formal clarification request'
  | 'Clarification response';

export interface ReferralMessage {
  id: string;
  referralId: string;
  senderRole: 'physician' | 'specialist';
  senderName: string;
  senderClinic: string;
  recipientRole: 'physician' | 'specialist';
  recipientName: string;
  recipientClinic: string;
  messageType: CommunicationMessageType;
  subject?: string;
  content: string;
  timestamp: string;
  readByPhysician: boolean;
  readBySpecialist: boolean;
  clarificationId?: string;
  clarificationMeta?: {
    missingInformation: string;
    reason: string;
    notes?: string;
    status: 'Open' | 'Responded';
  };
  attachedDocumentName?: string;
}

export type DeclineReasonCategory =
  | 'Outside specialty scope'
  | 'Incorrect receiving clinic'
  | 'Insufficient information'
  | 'Other administrative reason';

export interface DeclineDetails {
  reasonCategory: DeclineReasonCategory;
  notes: string;
  declinedBy: string;
  declinedAt: string;
}

export interface ConfirmedAppointment {
  date: string;
  time: string;
  location: string;
  instructions: string;
  mode?: 'In-Person' | 'E-Consultation';
}

export interface Specialist {
  id: string;
  name: string;
  credentials: string;
  specialty: string;
  clinic: string;
  location: string;
  address: string;
  distanceLabel?: string;
  distanceKm?: number;
  phone: string;
  email?: string;
  estimatedWait: string;
  estimatedWaitWeeks: number;
  acceptingReferrals: boolean;
  intakeRequirements: string[];
  acceptedInformation: string[];
  subspecialties: string[];
}

export interface SpecialistRecommendationItem {
  specialistId: string;
  suitabilityLevel: 'Strong alignment' | 'Good alignment' | 'Alternative option';
  suitabilitySummary: string;
  supportingReasons: string[];
  availableRequirements: string[];
  neededRequirements: string[];
}

export interface SpecialistRecommendationBundle {
  generatedAt: string;
  engineMode: 'gemini' | 'deterministic';
  inferredSpecialty: string;
  clinicalBasisSummary: string;
  disclaimer: string;
  recommendations: SpecialistRecommendationItem[];
}

export interface Referral {
  id: string;
  patient: PatientInfo;
  referringPhysician: string;
  referringClinic: string;
  referringPhysicianContact: ReferringPhysicianContact;
  specialistId: string;
  specialistName: string;
  specialty: string;
  receivingClinic: string;
  referralDate: string;
  lastUpdated: string;
  status: ReferralStatus;
  urgency: ReferralUrgency;
  completeness: number;
  attentionPriority: AdminAttentionPriority;
  clinicalInput: ClinicalInput;
  consultationNotes?: ConsultationNotesBundle;
  documents: UploadedDocument[];
  documentsComplete?: boolean;
  documentsCompletedAt?: string;
  documentsCompletedBy?: string;
  checklistExceptions?: Record<string, string>;
  aiSpecialistRecommendations?: SpecialistRecommendationBundle;
  analysis: AIAnalysisResult;
  timeline: TimelineEvent[];
  patientNextSteps: string;
  confirmedAppointment?: ConfirmedAppointment;
  physicianApproved: boolean;
  acceptedAt?: string;
  specialistReviewedAt?: string;
  clarificationThread?: ClarificationEntry[];
  communications?: ReferralMessage[];
  declineDetails?: DeclineDetails;
  insurance?: MedicalInsuranceInfo;
  confidentialityAcknowledgement?: ConfidentialityAcknowledgement;
  auditLog?: AuditLogEntry[];
  eConsultation?: EConsultationProposal;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'warning' | 'success' | 'info' | 'action';
  referralId?: string;
  audience?: 'physician' | 'specialist' | 'patient' | 'all';
  read: boolean;
}

export interface UserSettings {
  physicianName: string;
  credentials: string;
  role: string;
  email: string;
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
  clinicFax: string;
  emrBridgeEnabled: boolean;
  notifyMissingDocs: boolean;
  notifySpecialistAcceptance: boolean;
  notifyClarification: boolean;
  notifyPatientUpdates: boolean;
  compactTables: boolean;
  autoRunChecklist: boolean;
  specialistProfileId: string;
  specialistClinicRole: string;
  specialistAutoFlagIncomplete: boolean;
}

export type PhysicianNavSection =
  | 'dashboard'
  | 'referrals'
  | 'new-referral'
  | 'specialists'
  | 'patient-portal'
  | 'settings';

export type SpecialistNavSection =
  | 'specialist-dashboard'
  | 'specialist-inbox'
  | 'specialist-review'
  | 'specialist-accepted'
  | 'specialist-appointments'
  | 'specialist-patients'
  | 'specialist-settings';

export type NavSection = PhysicianNavSection | SpecialistNavSection;
