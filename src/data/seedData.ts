import type {
  AiConsultationNote,
  AiNoteReviewStatus,
  AppNotification,
  AuditLogEntry,
  ClinicalInput,
  ConfidentialityAcknowledgement,
  ConsultationNotesBundle,
  EConsultationProposal,
  MedicalInsuranceInfo,
  PatientInfo,
  PhysicianConsultationNotes,
  ReferringPhysicianContact,
  Referral,
  ReferralMessage,
  ReferralUrgency,
  Specialist,
  UploadedDocument,
  UserSettings,
} from '../types/clinbridge';
import { assessInsuranceDeterministic } from '../utils/insuranceAdvisor';
import {
  CONFIDENTIALITY_AGREEMENT_TEXT,
  createAuditEntry,
  getSpecialistProfessionalId,
} from '../utils/privacyProjection';
import {
  analyzeReferralDeterministic,
  buildReferralInputsSummaryText,
  generateAiConsultationNoteDeterministic,
} from '../utils/referralAnalyzer';

export const DEFAULT_PHYSICIAN_CONTACT: ReferringPhysicianContact = {
  physicianName: 'Dr. Elena Vance',
  credentials: 'MD, CCFP',
  clinicName: 'Oakridge Family Health Team',
  clinicAddress: '310 Oakridge Crescent, Suite 200',
  phone: '(555) 204-8100',
  email: 'elena.vance@oakridgehealth.example',
  additionalContact: 'Direct Physician Desk Ext. 204 · Referral Fax (555) 204-8109',
};

export const SEED_SPECIALISTS: Specialist[] = [
  // DERMATOLOGY (3 fictional specialists)
  {
    id: 'spec-almansoor',
    name: 'Dr. Nadia Al-Mansoor',
    credentials: 'MD',
    specialty: 'Dermatology',
    clinic: 'Meridian Cutaneous Clinic',
    location: 'Midtown Health Corridor',
    address: '912 Meridian Street, Suite 105',
    distanceLabel: '4.2 km from Oakridge Clinic (Demo estimate)',
    distanceKm: 4.2,
    phone: '(555) 529-7740',
    email: 'intake.almansoor@meridianderm.example',
    estimatedWait: '2–4 weeks (Demo estimate)',
    estimatedWaitWeeks: 3,
    acceptingReferrals: true,
    intakeRequirements: [
      'Lesion morphology, dimensions, and duration notes',
      'Prior biopsy or pathology report (if performed)',
      'Topical or systemic treatment history',
    ],
    acceptedInformation: [
      'Clinical lesion descriptions & dermoscopy notes',
      'Dermatopathology reports',
      'Prior prescription history',
    ],
    subspecialties: ['Pigmented Lesions', 'Inflammatory Dermatoses', 'Acne & Rosacea'],
  },
  {
    id: 'spec-bellamy',
    name: 'Dr. Simone Bellamy',
    credentials: 'MD, FRCPC',
    specialty: 'Dermatology',
    clinic: 'Northgate Skin & Mohs Centre',
    location: 'Northgate Medical Tower',
    address: '710 Northgate Blvd, Suite 520',
    distanceLabel: '7.8 km from Oakridge Clinic (Demo estimate)',
    distanceKm: 7.8,
    phone: '(555) 488-6120',
    email: 'triage.bellamy@northgateskin.example',
    estimatedWait: '1–2 weeks (Demo estimate)',
    estimatedWaitWeeks: 1.5,
    acceptingReferrals: true,
    intakeRequirements: [
      'Lesion morphology, dimensions, and duration notes',
      'Relevant medical & family skin history',
      'Prior biopsy or pathology report (if performed)',
    ],
    acceptedInformation: [
      'Dermoscopy summaries & lesion measurements',
      'Skin cancer family history notes',
      'Surgical or biopsy pathology text',
    ],
    subspecialties: ['Suspicious Pigmented Lesions', 'Skin Cancer Screening', 'Cutaneous Surgery'],
  },
  {
    id: 'spec-castellanos',
    name: 'Dr. Rafael Castellanos',
    credentials: 'MD',
    specialty: 'Dermatology',
    clinic: 'Harbourview Dermatology Partners',
    location: 'Downtown Medical District',
    address: '420 Harbour Street, Suite 310',
    distanceLabel: '2.6 km from Oakridge Clinic (Demo estimate)',
    distanceKm: 2.6,
    phone: '(555) 234-5590',
    email: 'referrals.castellanos@harbourviewderm.example',
    estimatedWait: '3–5 weeks (Demo estimate)',
    estimatedWaitWeeks: 4,
    acceptingReferrals: true,
    intakeRequirements: [
      'Symptom onset, distribution, and trigger notes',
      'Topical or systemic treatment history',
      'Prior patch testing or biopsy report (if performed)',
    ],
    acceptedInformation: [
      'Occupational exposure & contact trigger summaries',
      'Medication & topical steroid response history',
      'Prior allergy or dermatology records',
    ],
    subspecialties: ['Eczema & Contact Dermatitis', 'Psoriasis & Biologics', 'Chronic Inflammatory Skin Disease'],
  },

  // ORTHOPEDICS (3 fictional specialists)
  {
    id: 'spec-okafor',
    name: 'Dr. Samuel Okafor',
    credentials: 'MD, FRCSC',
    specialty: 'Orthopedics',
    clinic: 'Westside Musculoskeletal Institute',
    location: 'Westside Campus',
    address: '115 Westpark Way, Building B',
    distanceLabel: '6.1 km from Oakridge Clinic (Demo estimate)',
    distanceKm: 6.1,
    phone: '(555) 610-9200',
    email: 'intake.okafor@westsidemsk.example',
    estimatedWait: '2–3 weeks (Demo estimate)',
    estimatedWaitWeeks: 2.5,
    acceptingReferrals: true,
    intakeRequirements: [
      'Weight-bearing X-ray or MRI report',
      'Physical exam & range-of-motion notes',
      'Prior physiotherapy / conservative treatment summary',
    ],
    acceptedInformation: [
      'Imaging reports (MRI, CT, plain radiographs)',
      'Physiotherapy progress letters',
      'Pain & functional limitation summary',
    ],
    subspecialties: ['Knee & Sports Reconstruction', 'Meniscal Injuries', 'Shoulder Arthroscopy'],
  },
  {
    id: 'spec-kapoor',
    name: 'Dr. Priya Kapoor',
    credentials: 'MD, FRCSC',
    specialty: 'Orthopedics',
    clinic: 'Meridian Joint & Spine Clinic',
    location: 'Midtown Health Corridor',
    address: '912 Meridian Street, Suite 410',
    distanceLabel: '4.0 km from Oakridge Clinic (Demo estimate)',
    distanceKm: 4.0,
    phone: '(555) 529-8840',
    email: 'intake.kapoor@meridianjoint.example',
    estimatedWait: '3–4 weeks (Demo estimate)',
    estimatedWaitWeeks: 3.5,
    acceptingReferrals: true,
    intakeRequirements: [
      'Weight-bearing X-ray or MRI report',
      'Physical exam & range-of-motion notes',
      'Prior physiotherapy / conservative treatment summary',
    ],
    acceptedInformation: [
      'Joint imaging reports & radiologist impressions',
      'Mobility & functional impact scores',
      'Conservative management summaries',
    ],
    subspecialties: ['Hip & Knee Arthroplasty', 'Degenerative Joint Disease', 'Spine Evaluation'],
  },
  {
    id: 'spec-mercer',
    name: 'Dr. Graham Mercer',
    credentials: 'MD',
    specialty: 'Orthopedics',
    clinic: 'Eastside Orthopedic Institute',
    location: 'Eastside Medical Plaza',
    address: '205 Riverdale Road, Suite 340',
    distanceLabel: '8.4 km from Oakridge Clinic (Demo estimate)',
    distanceKm: 8.4,
    phone: '(555) 740-6118',
    email: 'referrals.mercer@eastsideortho.example',
    estimatedWait: '4–6 weeks (Demo estimate)',
    estimatedWaitWeeks: 5,
    acceptingReferrals: true,
    intakeRequirements: [
      'Weight-bearing X-ray or MRI report',
      'Physical exam & range-of-motion notes',
      'Prior physiotherapy / conservative treatment summary',
    ],
    acceptedInformation: [
      'MSK imaging text reports',
      'Rehabilitation clinic discharge summaries',
      'Work & sport functional restriction notes',
    ],
    subspecialties: ['Sports Orthopedics', 'Upper Extremity & Shoulder', 'Ligament Instability'],
  },

  // CARDIOLOGY (3 fictional specialists)
  {
    id: 'spec-chen',
    name: 'Dr. Marcus Chen',
    credentials: 'MD, FRCPC',
    specialty: 'Cardiology',
    clinic: 'Harbourview Heart & Vascular Clinic',
    location: 'Downtown Medical District',
    address: '420 Harbour Street, Suite 600',
    distanceLabel: '2.8 km from Oakridge Clinic (Demo estimate)',
    distanceKm: 2.8,
    phone: '(555) 234-8810',
    email: 'intake.chen@harbourviewheart.example',
    estimatedWait: '3–4 weeks (Demo estimate)',
    estimatedWaitWeeks: 3.5,
    acceptingReferrals: true,
    intakeRequirements: [
      '12-lead ECG (within 90 days)',
      'Lipid panel & HbA1c labs',
      'Current cardiac medication list',
      'Blood pressure readings & physical exam vitals',
    ],
    acceptedInformation: [
      'Structured primary care consultation request',
      'PDF lab reports and ECG tracings',
      'Recent emergency or hospital discharge summaries',
    ],
    subspecialties: ['Arrhythmia', 'Preventive Cardiology', 'Hypertension'],
  },
  {
    id: 'spec-siddiqui',
    name: 'Dr. Farah Siddiqui',
    credentials: 'MD, FRCPC',
    specialty: 'Cardiology',
    clinic: 'Riverdale Heart & Arrhythmia Centre',
    location: 'Eastside Medical Plaza',
    address: '205 Riverdale Road, Suite 510',
    distanceLabel: '8.2 km from Oakridge Clinic (Demo estimate)',
    distanceKm: 8.2,
    phone: '(555) 740-9024',
    email: 'intake.siddiqui@riverdaleheart.example',
    estimatedWait: '2–3 weeks (Demo estimate)',
    estimatedWaitWeeks: 2.5,
    acceptingReferrals: true,
    intakeRequirements: [
      '12-lead ECG (within 90 days)',
      'Current cardiac medication list',
      'Blood pressure readings & physical exam vitals',
    ],
    acceptedInformation: [
      'Primary care rhythm & palpitation logs',
      '12-lead ECG & Holter summaries',
      'Medication dosage histories',
    ],
    subspecialties: ['Palpitations & Arrhythmia', 'Hypertension', 'Ambulatory Rhythm Monitoring'],
  },
  {
    id: 'spec-reyes',
    name: 'Dr. Julian Reyes',
    credentials: 'MD, FACC',
    specialty: 'Cardiology',
    clinic: 'Cascade Cardiovascular Specialists',
    location: 'Northgate Medical Tower',
    address: '710 Northgate Blvd, Suite 900',
    distanceLabel: '7.9 km from Oakridge Clinic (Demo estimate)',
    distanceKm: 7.9,
    phone: '(555) 488-9940',
    email: 'triage.reyes@cascadecardio.example',
    estimatedWait: '6–8 weeks (Demo estimate)',
    estimatedWaitWeeks: 7,
    acceptingReferrals: true,
    intakeRequirements: [
      '12-lead ECG (within 90 days)',
      'Echocardiogram report',
      'Lipid panel & renal function',
      'Current medications',
    ],
    acceptedInformation: [
      'Cardiac imaging summaries',
      'Holter monitor reports',
      'Medication reconciliation lists',
    ],
    subspecialties: ['Heart Failure', 'Valvular Heart Disease', 'Atrial Fibrillation'],
  },

  // ADDITIONAL SPECIALTIES (for directory breadth)
  {
    id: 'spec-nair',
    name: 'Dr. Priya Nair',
    credentials: 'MD, MSc',
    specialty: 'Neurology',
    clinic: 'Pacific Neurosciences Centre',
    location: 'Midtown Health Corridor',
    address: '890 Pacific Ave, Floor 4',
    distanceLabel: '4.7 km from Oakridge Clinic (Demo estimate)',
    distanceKm: 4.7,
    phone: '(555) 392-4410',
    email: 'referrals.nair@pacificneuro.example',
    estimatedWait: '5–6 weeks (Demo estimate)',
    estimatedWaitWeeks: 5.5,
    acceptingReferrals: true,
    intakeRequirements: [
      'Focused neurological examination findings',
      'Prior brain MRI or CT report (if completed)',
      'Medication trial history',
      'Symptom onset & frequency log',
    ],
    acceptedInformation: [
      'Headache or seizure diaries',
      'Radiology text reports',
      'Primary care neuro exam notes',
    ],
    subspecialties: ['Headache & Migraine', 'Neuropathy', 'TIA Follow-up'],
  },
  {
    id: 'spec-beaumont',
    name: 'Dr. Claire Beaumont',
    credentials: 'MD, FACE',
    specialty: 'Endocrinology',
    clinic: 'St. Jude Metabolic & Endocrine Care',
    location: 'Northgate Medical Tower',
    address: '710 Northgate Blvd, Suite 310',
    distanceLabel: '7.5 km from Oakridge Clinic (Demo estimate)',
    distanceKm: 7.5,
    phone: '(555) 488-1275',
    email: 'clinic.beaumont@stjudeendocrine.example',
    estimatedWait: '4–5 weeks (Demo estimate)',
    estimatedWaitWeeks: 4.5,
    acceptingReferrals: true,
    intakeRequirements: [
      'TSH, Free T4, or HbA1c lab panel (within 60 days)',
      'Thyroid ultrasound report (if nodule present)',
      'Current endocrine medications & dosages',
    ],
    acceptedInformation: [
      'Longitudinal lab trends',
      'Ultrasound & fine-needle aspiration reports',
      'Home glucose logs',
    ],
    subspecialties: ['Thyroid Disorders', 'Complex Diabetes', 'Osteoporosis'],
  },
  {
    id: 'spec-lindqvist',
    name: 'Dr. Henrik Lindqvist',
    credentials: 'MD, PhD',
    specialty: 'Gastroenterology',
    clinic: 'Riverdale Digestive Health Associates',
    location: 'Eastside Medical Plaza',
    address: '205 Riverdale Road, Suite 220',
    distanceLabel: '8.1 km from Oakridge Clinic (Demo estimate)',
    distanceKm: 8.1,
    phone: '(555) 740-3302',
    email: 'referrals.gi@riverdaledigestive.example',
    estimatedWait: '4–6 weeks (Demo estimate)',
    estimatedWaitWeeks: 5,
    acceptingReferrals: true,
    intakeRequirements: [
      'CBC, ferritin, and liver enzyme panel',
      'Prior endoscopy or colonoscopy report (if applicable)',
      'Stool testing or celiac serology',
      'PPI or GI medication history',
    ],
    acceptedInformation: [
      'Pathology & prior procedure summaries',
      'Hematology & iron studies',
      'Dietary trigger & weight history',
    ],
    subspecialties: ['IBD & Celiac', 'Iron-Deficiency Workup', 'Hepatology'],
  },
];

function createAutoAiNote(params: {
  id: string;
  patient: PatientInfo;
  clinicalInput: ClinicalInput;
  physicianWritten?: PhysicianConsultationNotes;
  documents: UploadedDocument[];
  specialty: string;
  generatedAt: string;
  reviewStatus: AiNoteReviewStatus;
  reviewedAt?: string;
  reviewedBy?: string;
}): AiConsultationNote {
  return {
    id: params.id,
    sourceType: 'AI-generated from referral record',
    rawContent: buildReferralInputsSummaryText({
      patient: params.patient,
      clinical: params.clinicalInput,
      physicianWritten: params.physicianWritten,
      documents: params.documents,
      specialty: params.specialty,
    }),
    importedAt: params.generatedAt,
    structured: generateAiConsultationNoteDeterministic({
      patient: params.patient,
      clinical: params.clinicalInput,
      physicianWritten: params.physicianWritten,
      documents: params.documents,
      specialty: params.specialty,
    }),
    reviewStatus: params.reviewStatus,
    reviewedAt: params.reviewedAt,
    reviewedBy: params.reviewedBy,
  };
}

function buildSeededReferral(params: {
  id: string;
  patient: PatientInfo;
  specialistId: string;
  specialtyHint?: string;
  referralDate: string;
  lastUpdated: string;
  status: Referral['status'];
  urgency?: ReferralUrgency;
  attentionPriority: Referral['attentionPriority'];
  clinicalInput: ClinicalInput;
  physicianWritten?: PhysicianConsultationNotes;
  aiNoteConfig: {
    id: string;
    generatedAt: string;
    reviewStatus: AiNoteReviewStatus;
    reviewedAt?: string;
    reviewedBy?: string;
  };
  documents: UploadedDocument[];
  documentsComplete?: boolean;
  documentsCompletedAt?: string;
  documentsCompletedBy?: string;
  timeline: Referral['timeline'];
  patientNextSteps: string;
  confirmedAppointment?: Referral['confirmedAppointment'];
  physicianApproved: boolean;
  acceptedAt?: string;
  clarificationThread?: Referral['clarificationThread'];
  communications?: ReferralMessage[];
  referringPhysicianContact?: ReferringPhysicianContact;
  insurance?: MedicalInsuranceInfo;
  confidentialityAcknowledgement?: ConfidentialityAcknowledgement;
  auditLog?: AuditLogEntry[];
  eConsultation?: EConsultationProposal;
  overrideCompleteness?: number;
  customAmbiguity?: Referral['analysis']['ambiguityFlags'];
  overrideChecklistStatuses?: Record<number, Referral['analysis']['checklist'][number]['status']>;
}): Referral {
  const specialist = params.specialistId
    ? SEED_SPECIALISTS.find((s) => s.id === params.specialistId)
    : undefined;
  const resolvedSpecialty = specialist?.specialty ?? params.specialtyHint ?? 'Dermatology';

  const aiNote = createAutoAiNote({
    id: params.aiNoteConfig.id,
    patient: params.patient,
    clinicalInput: params.clinicalInput,
    physicianWritten: params.physicianWritten,
    documents: params.documents,
    specialty: resolvedSpecialty,
    generatedAt: params.aiNoteConfig.generatedAt,
    reviewStatus: params.aiNoteConfig.reviewStatus,
    reviewedAt: params.aiNoteConfig.reviewedAt,
    reviewedBy: params.aiNoteConfig.reviewedBy,
  });

  const consultationNotes: ConsultationNotesBundle = {
    physicianWritten: params.physicianWritten,
    aiNotes: [aiNote],
  };

  const analysis = analyzeReferralDeterministic(
    params.patient,
    params.clinicalInput,
    specialist,
    params.documents,
    consultationNotes,
    resolvedSpecialty
  );

  if (params.customAmbiguity) {
    analysis.ambiguityFlags = [...params.customAmbiguity, ...analysis.ambiguityFlags];
  }
  if (params.overrideChecklistStatuses) {
    Object.entries(params.overrideChecklistStatuses).forEach(([idxStr, newStatus]) => {
      const idx = Number(idxStr);
      if (analysis.checklist[idx]) {
        analysis.checklist[idx].status = newStatus;
      }
    });
    analysis.missingItems = analysis.checklist
      .filter((c) => c.status === 'Missing')
      .map((c) => c.requirement);
  }
  if (typeof params.overrideCompleteness === 'number') {
    analysis.completenessScore = params.overrideCompleteness;
  }

  const contact = params.referringPhysicianContact ?? DEFAULT_PHYSICIAN_CONTACT;
  const insuranceWithAssessment: MedicalInsuranceInfo | undefined = params.insurance
    ? {
        ...params.insurance,
        aiAssessment:
          params.insurance.aiAssessment ??
          assessInsuranceDeterministic({
            insurance: params.insurance,
            specialty: resolvedSpecialty,
            clinicalInput: params.clinicalInput,
          }),
      }
    : undefined;

  return {
    id: params.id,
    patient: params.patient,
    referringPhysician: `${contact.physicianName}, ${contact.credentials}`,
    referringClinic: contact.clinicName,
    referringPhysicianContact: contact,
    specialistId: specialist?.id ?? '',
    specialistName: specialist?.name ?? 'Pending Specialist Selection',
    specialty: resolvedSpecialty,
    receivingClinic: specialist?.clinic ?? 'Awaiting Specialist Selection',
    referralDate: params.referralDate,
    lastUpdated: params.lastUpdated,
    status: params.status,
    urgency: params.urgency ?? 'Routine',
    completeness: analysis.completenessScore,
    attentionPriority: params.attentionPriority,
    clinicalInput: params.clinicalInput,
    consultationNotes,
    documents: params.documents,
    documentsComplete: params.documentsComplete,
    documentsCompletedAt: params.documentsCompletedAt,
    documentsCompletedBy: params.documentsCompletedBy,
    analysis,
    timeline: params.timeline,
    patientNextSteps: params.patientNextSteps,
    confirmedAppointment: params.confirmedAppointment,
    physicianApproved: params.physicianApproved,
    acceptedAt: params.acceptedAt,
    clarificationThread: params.clarificationThread,
    communications: params.communications,
    insurance: insuranceWithAssessment,
    confidentialityAcknowledgement: params.confidentialityAcknowledgement,
    auditLog: params.auditLog ?? [],
    eConsultation: params.eConsultation,
  };
}

export const SEED_REFERRALS: Referral[] = [
  // SCENARIO 0: Prepared Dermatology referral AWAITING SPECIALIST SELECTION (no specialist selected yet — ready for "AI Find Specialist")
  buildSeededReferral({
    id: 'CB-2026-2000',
    patient: {
      id: 'PT-31048',
      name: 'Camille Laurent',
      dob: '1988-05-14',
      age: 38,
      phone: '(555) 412-9083',
      email: 'camille.laurent@example.com',
      address: '412 Maplewood Ave, Toronto, ON',
      healthCardNumber: '4812-309-214-AB',
      medicalBackground:
        'Fair skin phototype II, blistering sunburns in adolescence, sister diagnosed with cutaneous melanoma at age 41; no personal prior skin biopsies.',
    },
    specialistId: '',
    specialtyHint: 'Dermatology',
    referralDate: '2026-11-20',
    lastUpdated: '2026-11-20',
    status: 'Awaiting Specialist Selection',
    urgency: 'Semi-Urgent',
    attentionPriority: 'High',
    physicianApproved: false,
    documentsComplete: true,
    documentsCompletedAt: '2026-11-20 09:30',
    documentsCompletedBy: 'Dr. Elena Vance, MD, CCFP',
    overrideCompleteness: 100,
    insurance: {
      availabilityStatus: 'Available and included',
      coverageCategory: 'Provincial Public Health Plan + Private Extended Coverage',
      provinceOrJurisdiction: 'Ontario (OHIP)',
      providerName: 'Sun Life Financial (Demo)',
      planType: 'Employer Extended Health Benefits',
      policyOrMemberId: 'SLF-884219-04',
      coverageDetails: 'OHIP covers specialist dermatology consultation and medically indicated excisional biopsy; Sun Life covers 80% outpatient prescription drugs.',
      referralServiceCoverageNotes: 'Consultation & diagnostic dermoscopy covered under OHIP; cosmetic scar products excluded.',
      additionalNotes: 'Verified at Oakridge reception Nov 20, 2026.',
      verificationStatus: 'Verified',
      lastUpdatedAt: '2026-11-20 09:20',
      lastUpdatedBy: 'Dr. Elena Vance',
    },
    clinicalInput: {
      reasonForReferral:
        'Dermatology assessment and dermoscopic evaluation for changing pigmented lesion on upper back.',
      presentingSymptoms:
        '9-month darkening and asymmetric expansion of a pigmented macule on the right upper back (from 4 mm to 7 mm) with occasional mild pruritus.',
      clinicalHistory:
        'First-degree family history of melanoma (sister at age 41). Patient has had no prior skin biopsies or destructive lesion procedures.',
      previousTreatments:
        'No topical steroids, cryotherapy, or destructive treatments applied to lesion; uses SPF 50 daily.',
      currentMedications: 'Loratadine 10 mg PRN.',
      allergies: 'No known drug allergies (NKDA).',
      examinationFindings:
        'Right upper back: 7 mm x 6 mm asymmetric dark brown macule with irregular scalloped border and focal color variegation on primary care dermoscopy.',
      investigations:
        'Primary care dermoscopy measurement log (Nov 19, 2026) and baseline 2025 annual skin check note attached. No prior biopsy performed.',
      additionalNotes:
        'Patient prefers shorter wait time or Midtown/Northgate clinic access. Ready for AI Find Specialist matching.',
    },
    physicianWritten: {
      reasonForConsultation:
        'Urgent dermatologic dermoscopy and excisional biopsy evaluation of a changing 7 x 6 mm pigmented lesion on the right upper back.',
      patientReportedSymptoms:
        'Patient noticed progressive darkening and border irregularity over 9 months with occasional mild itching after clothing friction.',
      relevantMedicalHistory:
        'Fitzpatrick II phototype, childhood sunburns, sister treated for melanoma at age 41; no prior personal biopsies.',
      previousTreatmentsDiscussed:
        'No topical creams or lesion procedures attempted; counseled on strict broad-spectrum UV protection.',
      physicianObservations:
        'Right upper back 7 mm x 6 mm asymmetric pigmented macule with scalloped border and two-tone pigment network on dermoscopy.',
      physicianAssessment:
        'Clinically atypical changing pigmented nevus with high-risk family history; specialist dermoscopy and likely excisional biopsy indicated.',
      treatmentPlanAndNextSteps:
        'Use MediBridge AI Find Specialist to compare Dermatology clinics with shortest wait time and skin cancer screening focus, then confirm destination.',
      followUpInstructions:
        'Avoid sun exposure/tanning over upper back, photograph if any bleeding develops, and attend dermatology visit once scheduled.',
      lastSavedAt: '2026-11-20 09:20',
    },
    aiNoteConfig: {
      id: 'ainote-2000-1',
      generatedAt: '2026-11-20 09:22',
      reviewStatus: 'Approved',
      reviewedAt: '2026-11-20 09:28',
      reviewedBy: 'Dr. Elena Vance, MD, CCFP',
    },
    documents: [
      {
        id: 'doc-2000-1',
        name: 'Dermoscopy_Upper_Back_Measurement_Nov19.txt',
        type: 'text/plain',
        sizeLabel: '2.1 KB',
        uploadedAt: '2026-11-20',
        contentText:
          '[Fictional Demo Document] Primary Care Dermoscopy Note (Nov 19, 2026): Right upper back pigmented lesion measuring 7 mm x 6 mm, asymmetric scalloped border, two-tone brown pigment variegation. Prior biopsy: none performed.',
      },
      {
        id: 'doc-2000-2',
        name: 'Baseline_Annual_Skin_Check_2025.txt',
        type: 'text/plain',
        sizeLabel: '1.6 KB',
        uploadedAt: '2026-11-20',
        contentText:
          '[Fictional Demo Document] Annual Skin Exam (Oct 2025): Right scapular nevus previously measured 4 mm, uniform light brown. Family history updated: sister diagnosed with melanoma in 2024.',
      },
    ],
    timeline: [
      {
        id: 'tl-2000-1',
        title: 'Consultation notes & AI summary prepared',
        description:
          'Physician-written notes saved and AI-Generated Consultation Summary verified from clinical fields and 2 supporting dermatology records.',
        timestamp: '2026-11-20 09:28',
        actor: 'Dr. Elena Vance',
        stage: 'organized',
      },
      {
        id: 'tl-2000-2',
        title: 'Awaiting Specialist Selection',
        description:
          'Supporting dermatology records collected against baseline intake protocol. Ready for AI Find Specialist matching and physician confirmation.',
        timestamp: '2026-11-20 09:30',
        actor: 'MediBridge Coordination',
        stage: 'reviewed',
      },
    ],
    communications: [],
    patientNextSteps:
      'Your family physician has completed your clinical summary and supporting skin measurements and is selecting an appropriate dermatology clinic for your referral.',
  }),

  // SCENARIO 1: Fully completed Dermatology referral (100% complete, docs complete, approved AI notes, ready for physician approval/submission)
  buildSeededReferral({
    id: 'CB-2026-2001',
    patient: {
      id: 'PT-38192',
      name: 'Linnea Bergstrom',
      dob: '1997-03-19',
      age: 29,
      phone: '(555) 940-5521',
      email: 'linnea.b@example.com',
      medicalBackground:
        'Fair skin phototype II, family history of melanoma (maternal uncle at age 52), no prior skin biopsies.',
    },
    specialistId: 'spec-almansoor',
    referralDate: '2026-11-19',
    lastUpdated: '2026-11-19',
    status: 'Ready for submission',
    attentionPriority: 'Standard',
    physicianApproved: false,
    documentsComplete: true,
    documentsCompletedAt: '2026-11-19 10:15',
    documentsCompletedBy: 'Dr. Elena Vance, MD, CCFP',
    overrideCompleteness: 100,
    clinicalInput: {
      reasonForReferral:
        'Dermatology assessment of changing pigmented nevus on left posterior shoulder.',
      presentingSymptoms:
        'Asymmetric dark brown macule noticed to have darkened and widened from 5 mm to 8 mm over the past 6 months; occasional mild itch.',
      clinicalHistory:
        'No prior biopsy performed; maternal uncle treated for cutaneous melanoma. Regular SPF 50 use.',
      previousTreatments:
        'No prior topical medications, cryotherapy, or destructive treatments applied to lesion.',
      currentMedications: 'Combined oral contraceptive pill.',
      examinationFindings:
        'Left posterior shoulder: 8 mm x 6 mm asymmetric pigmented macule with notched border and two shades of brown on dermoscopy.',
      investigations:
        'Baseline 2025 skin check summary and Nov 18 dermoscopy lesion measurement sheet attached. No prior surgical excision.',
      additionalNotes: 'Patient available weekday mornings for Meridian Cutaneous Clinic.',
    },
    physicianWritten: {
      reasonForConsultation:
        'Dermatology evaluation of a changing 8 x 6 mm pigmented lesion on the left posterior shoulder.',
      patientReportedSymptoms:
        'Patient notes darkening and expansion over 6 months with mild intermittent itching after shirt friction.',
      relevantMedicalHistory:
        'Fitzpatrick II skin, maternal uncle with melanoma at age 52, no previous skin biopsies.',
      previousTreatmentsDiscussed:
        'No topical therapies or prior lesion treatments attempted; advised ongoing broad-spectrum sunscreen.',
      physicianObservations:
        'Left posterior shoulder 8 mm x 6 mm asymmetric macule with irregular notched border and two pigment tones on dermoscopy.',
      physicianAssessment:
        'Atypical changing pigmented nevus requiring specialist dermoscopy and consideration for excisional biopsy.',
      treatmentPlanAndNextSteps:
        'Attach Nov 18 dermoscopy measurement record and 2025 baseline skin exam; submit to Dr. Nadia Al-Mansoor.',
      followUpInstructions:
        'Avoid UV tanning, monitor for bleeding or rapid ulceration, and attend dermatology visit once scheduled.',
      lastSavedAt: '2026-11-19 10:10',
    },
    aiNoteConfig: {
      id: 'ainote-2001-1',
      generatedAt: '2026-11-19 10:11',
      reviewStatus: 'Approved',
      reviewedAt: '2026-11-19 10:13',
      reviewedBy: 'Dr. Elena Vance, MD, CCFP',
    },
    documents: [
      {
        id: 'doc-2001-1',
        name: 'Dermoscopy_Lesion_Measurement_Nov18.txt',
        type: 'text/plain',
        sizeLabel: '2.2 KB',
        uploadedAt: '2026-11-19',
        contentText:
          '[Fictional Demo Document] Dermoscopy & Lesion Measurement (Nov 18, 2026): Left posterior shoulder macule measuring 8 mm x 6 mm. Asymmetric border with pigment variegation (light/dark brown). Prior biopsy/pathology: none performed to date.',
      },
      {
        id: 'doc-2001-2',
        name: 'Prior_Skin_Check_Summary_2025.txt',
        type: 'text/plain',
        sizeLabel: '1.7 KB',
        uploadedAt: '2026-11-19',
        contentText:
          '[Fictional Demo Document] Baseline Primary Care Skin Exam (Oct 2025): Left posterior shoulder nevus previously measured 5 mm x 4 mm, uniform light brown. Patient instructed on sun protection; no topical treatment prescribed.',
      },
    ],
    timeline: [
      {
        id: 'tl-2001-1',
        title: 'Referral prepared with physician & AI consultation notes',
        description:
          'Physician-written notes, auto-generated AI Consultation Summary, and 2 fictional demo records organized.',
        timestamp: '2026-11-19 10:12',
        actor: 'Dr. Elena Vance',
        stage: 'organized',
      },
      {
        id: 'tl-2001-2',
        title: 'Supporting documents marked collected',
        description:
          'All Meridian Cutaneous Clinic dermatology intake items verified and marked complete.',
        timestamp: '2026-11-19 10:15',
        actor: 'Dr. Elena Vance',
        stage: 'reviewed',
      },
    ],
    communications: [],
    patientNextSteps:
      'Your supporting documents are complete and your family physician is completing final sign-off before sending your dermatology referral to Meridian Cutaneous Clinic.',
  }),

  // SCENARIO 2: Dermatology referral MISSING required documents
  buildSeededReferral({
    id: 'CB-2026-2002',
    patient: {
      id: 'PT-44219',
      name: 'Kieran Patel',
      dob: '1985-06-14',
      age: 41,
      phone: '(555) 318-7742',
      email: 'kieran.patel@example.com',
      medicalBackground:
        'Mild childhood flexural eczema, machinist exposed to cutting coolants, no known drug allergies.',
    },
    specialistId: 'spec-castellanos',
    referralDate: '2026-11-18',
    lastUpdated: '2026-11-18',
    status: 'Draft',
    attentionPriority: 'High',
    physicianApproved: false,
    documentsComplete: false,
    overrideCompleteness: 68,
    overrideChecklistStatuses: {
      2: 'Missing',
    },
    insurance: {
      availabilityStatus: 'To be confirmed',
      coverageCategory: 'Provincial Public Health Plan Only',
      provinceOrJurisdiction: 'Ontario (OHIP)',
      providerName: '',
      planType: '',
      policyOrMemberId: '',
      coverageDetails: 'OHIP health card verified; private extended benefits for topical compounding & patch test kit pending patient confirmation.',
      referralServiceCoverageNotes: 'Confirm whether workplace WSIB or extended plan applies.',
      additionalNotes: 'Reception left voicemail for patient to bring extended plan card.',
      verificationStatus: 'Needs verification',
    },
    clinicalInput: {
      reasonForReferral:
        'Dermatology assessment for chronic bilateral hand and distal forearm dermatitis.',
      presentingSymptoms:
        '5 months of pruritic erythematous fissured plaques on dorsal hands and wrists; worsens during work shifts.',
      clinicalHistory:
        'Mild childhood eczema; current flare began after switching industrial coolant at machine shop.',
      previousTreatments:
        'Betamethasone valerate 0.1% ointment BID for 3 weeks (partial transient relief with rebound) and frequent emollients.',
      currentMedications: 'Betamethasone valerate 0.1% ointment PRN, Cetirizine 10 mg daily.',
      allergies: 'No known drug allergies; suspected occupational contact sensitivity to metalworking coolant.',
      examinationFindings:
        'Bilateral dorsal hands show hyperkeratotic scaling plaques and shallow painful fissures; no secondary purulence.',
      investigations:
        'Occupational skin clinic note attached; prior allergy testing or skin scraping results not yet retrieved from workplace clinic.',
      additionalNotes:
        'Waiting on external clinic to fax prior testing report before final submission.',
    },
    physicianWritten: {
      reasonForConsultation:
        'Evaluate refractory chronic hand dermatitis with suspected occupational contact component.',
      patientReportedSymptoms:
        'Itchy cracked skin over dorsal hands and wrists for 5 months, flaring after exposure to shop coolants.',
      relevantMedicalHistory:
        'Childhood eczema; works as CNC machinist; no systemic immunosuppressant history.',
      previousTreatmentsDiscussed:
        'Tried betamethasone valerate 0.1% ointment for 3 weeks and barrier creams with incomplete control.',
      physicianObservations:
        'Hyperkeratotic erythematous plaques and superficial fissures over bilateral dorsal hands and wrists.',
      physicianAssessment:
        'Refractory hand dermatitis likely allergic/irritant contact dermatitis; refer for dermatology workup.',
      treatmentPlanAndNextSteps:
        'Collect external occupational clinic report prior to submitting to Harbourview Dermatology Partners.',
      followUpInstructions:
        'Use cotton-lined nitrile gloves at work and continue bland petrolatum ointment.',
      lastSavedAt: '2026-11-18 15:10',
    },
    aiNoteConfig: {
      id: 'ainote-2002-1',
      generatedAt: '2026-11-18 15:11',
      reviewStatus: 'Approved',
      reviewedAt: '2026-11-18 15:13',
      reviewedBy: 'Dr. Elena Vance, MD, CCFP',
    },
    documents: [
      {
        id: 'doc-2002-1',
        name: 'Primary_Care_Dermatitis_Note.txt',
        type: 'text/plain',
        sizeLabel: '1.9 KB',
        uploadedAt: '2026-11-18',
        contentText:
          '[Fictional Demo Document] Primary Care Visit Note (Nov 18, 2026): Chronic bilateral dorsal hand fissured dermatitis for 5 months. Partial response to betamethasone valerate 0.1% ointment. External workplace testing report still missing.',
      },
    ],
    timeline: [
      {
        id: 'tl-2002-1',
        title: 'Draft referral initiated',
        description:
          'Consultation notes saved and AI summary generated; checklist flagged missing prior allergy/patch testing or biopsy documentation.',
        timestamp: '2026-11-18 15:15',
        actor: 'Dr. Elena Vance',
        stage: 'initiated',
      },
    ],
    communications: [],
    patientNextSteps:
      'Your family doctor’s office is waiting to receive one additional test record before sending your dermatology referral.',
  }),

  // SCENARIO 3: Dermatology referral with INCOMPLETE consultation information
  buildSeededReferral({
    id: 'CB-2026-2003',
    patient: {
      id: 'PT-51903',
      name: 'Miriam Solis',
      dob: '1972-09-28',
      age: 54,
      phone: '(555) 622-9104',
      email: 'miriam.solis@example.com',
      medicalBackground: 'Mild seasonal rhinitis; uncertain prior dermatology history.',
    },
    specialistId: 'spec-bellamy',
    referralDate: '2026-11-18',
    lastUpdated: '2026-11-18',
    status: 'Draft',
    attentionPriority: 'High',
    physicianApproved: false,
    documentsComplete: false,
    overrideCompleteness: 54,
    clinicalInput: {
      reasonForReferral:
        'Dermatology assessment of persistent erythematous scaly plaque on right anterior shin.',
      presentingSymptoms:
        'Scaly pruritic patch on right lower leg; exact onset and progression uncertain.',
      clinicalHistory:
        'Patient unsure whether prior skin checks were performed at her former family clinic.',
      previousTreatments: '',
      currentMedications: 'Cetirizine 10 mg PRN.',
      examinationFindings:
        'Right anterior shin: 14 mm erythematous scaly plaque without warmth or purulence.',
      investigations: 'No prior skin biopsy or scraping documented.',
      additionalNotes:
        'Duration and prior over-the-counter cream trials remain unclear and need confirmation before referral.',
    },
    physicianWritten: {
      reasonForConsultation:
        'Assess persistent scaly plaque on right anterior shin.',
      patientReportedSymptoms:
        'Reports intermittent itching over right shin patch; unclear exact start date (possibly 4–8 months ago).',
      relevantMedicalHistory:
        'Seasonal allergies; unclear if prior skin checks or biopsies were performed elsewhere.',
      previousTreatmentsDiscussed: '',
      physicianObservations:
        '14 mm well-demarcated erythematous scaly plaque on right anterior shin.',
      physicianAssessment: '',
      treatmentPlanAndNextSteps:
        'Clarify prior topical treatment trials and symptom timeline before completing Northgate Skin referral.',
      followUpInstructions: 'Return or message clinic with names of any creams used.',
      lastSavedAt: '2026-11-18 11:20',
    },
    aiNoteConfig: {
      id: 'ainote-2003-1',
      generatedAt: '2026-11-18 11:22',
      reviewStatus: 'Pending physician review',
    },
    documents: [],
    timeline: [
      {
        id: 'tl-2003-1',
        title: 'Incomplete draft saved',
        description:
          'Auto-generated AI summary flagged uncertain duration/history, missing prior treatments, and blank physician assessment.',
        timestamp: '2026-11-18 11:25',
        actor: 'Dr. Elena Vance',
        stage: 'initiated',
      },
    ],
    communications: [],
    patientNextSteps:
      'Your family physician is confirming a few details about your symptoms and prior creams before finalizing your referral.',
  }),

  // SCENARIO 4: Orthopedics referral with UPLOADED REPORTS + Confirmed Appointment
  buildSeededReferral({
    id: 'CB-2026-2004',
    patient: {
      id: 'PT-60319',
      name: 'David Kowalski',
      dob: '1979-01-27',
      age: 47,
      phone: '(555) 703-1148',
      email: 'david.kowalski@example.com',
      address: '89 Cedar Creek Rd, Toronto, ON',
      healthCardNumber: '5921-440-812-CD',
      medicalBackground:
        'Right ACL repair (2014), recreational runner, no systemic medical comorbidities.',
    },
    specialistId: 'spec-okafor',
    referralDate: '2026-11-08',
    lastUpdated: '2026-11-16',
    status: 'Appointment Confirmed',
    urgency: 'Routine',
    attentionPriority: 'Low',
    physicianApproved: true,
    documentsComplete: true,
    documentsCompletedAt: '2026-11-08 15:10',
    documentsCompletedBy: 'Dr. Elena Vance, MD, CCFP',
    overrideCompleteness: 100,
    insurance: {
      availabilityStatus: 'Available and included',
      coverageCategory: 'Provincial Public Health Plan + Private Extended Coverage',
      provinceOrJurisdiction: 'Ontario (OHIP)',
      providerName: 'Canada Life (Demo)',
      planType: 'Extended Health & Paramedical Plan',
      policyOrMemberId: 'CL-771092-11',
      coverageDetails: 'OHIP covers orthopedic consultation and arthroscopic procedures; Canada Life covers physiotherapy ($1,500/yr) and custom knee bracing.',
      referralServiceCoverageNotes: 'Post-op or conservative physiotherapy benefits active.',
      additionalNotes: 'Patient requested confirmation of bracing coverage if recommended.',
      lastUpdatedAt: '2026-11-08 15:10',
      lastUpdatedBy: 'Dr. Elena Vance',
    },
    confidentialityAcknowledgement: {
      accepted: true,
      specialistId: 'spec-okafor',
      specialistName: 'Dr. Samuel Okafor',
      professionalId: getSpecialistProfessionalId('spec-okafor'),
      acknowledgedAt: '2026-11-10 09:12',
      statement: CONFIDENTIALITY_AGREEMENT_TEXT,
    },
    auditLog: [
      createAuditEntry({
        actorRole: 'physician',
        actorName: 'Dr. Elena Vance',
        actorId: 'phys-vance',
        action: 'REFERRAL_SUBMITTED',
        details: 'Submitted orthopedic referral CB-2026-2004 to Dr. Samuel Okafor.',
        timestamp: '2026-11-08 15:20',
      }),
      createAuditEntry({
        actorRole: 'specialist',
        actorName: 'Dr. Samuel Okafor',
        actorId: getSpecialistProfessionalId('spec-okafor'),
        action: 'CONFIDENTIALITY_ACCEPTED',
        details: 'Accepted Stage 2 Confidentiality Agreement and unlocked full identifiable patient record.',
        timestamp: '2026-11-10 09:12',
      }),
      createAuditEntry({
        actorRole: 'specialist',
        actorName: 'Dr. Samuel Okafor',
        actorId: getSpecialistProfessionalId('spec-okafor'),
        action: 'SPECIALIST_DECISION_ACCEPTED',
        details: 'Accepted referral CB-2026-2004 for medial meniscal tear consultation.',
        timestamp: '2026-11-11 09:40',
      }),
      createAuditEntry({
        actorRole: 'specialist',
        actorName: 'Westside Scheduling',
        actorId: 'spec-okafor',
        action: 'APPOINTMENT_CONFIRMED',
        details: 'Confirmed December 4, 2026 at 10:30 AM consultation.',
        timestamp: '2026-11-16 13:15',
      }),
    ],
    eConsultation: {
      isOffered: false,
      consultationMode: 'In-Person',
      proposedDate: 'December 4, 2026',
      proposedTime: '10:30 AM',
      consultationReason: 'Right medial knee mechanical locking & MRI review',
      specialistMessage: 'Looking forward to reviewing your October 22 MRI and examining your right knee in person.',
      proposedAt: '2026-11-16 13:15',
      proposedBy: 'Dr. Samuel Okafor',
      patientStatus: 'Accepted',
      respondedAt: '2026-11-16 14:00',
      messages: [
        {
          id: 'ecmsg-2004-1',
          referralId: 'CB-2026-2004',
          appointmentContextLabel: 'Consultation · December 4, 2026 at 10:30 AM',
          senderRole: 'specialist',
          senderDisplayName: 'Dr. Samuel Okafor (Westside MSK)',
          content: 'Hello David, our clinic has reviewed your MRI and physiotherapy notes ahead of your December 4 visit. Please bring shorts for the knee exam.',
          timestamp: '2026-11-16 13:20',
          readBySpecialist: true,
          readByPatient: false,
        },
      ],
    },
    clinicalInput: {
      reasonForReferral:
        'Orthopedic surgical opinion for persistent right medial knee pain and mechanical locking.',
      presentingSymptoms:
        '5 months of medial joint-line pain, intermittent locking descending stairs, and mild post-activity effusion.',
      clinicalHistory:
        'Twisting injury during recreational soccer in June 2026; persistent pain despite 12-week rehab.',
      previousTreatments:
        '12 weeks (18 sessions) of outpatient physiotherapy at Westpark Rehab; naproxen 375 mg PRN.',
      currentMedications: 'Naproxen 375 mg PRN with food.',
      examinationFindings:
        'Right knee mild effusion, medial joint-line tenderness, positive McMurray test medially, negative Lachman, ROM 5–125 degrees.',
      investigations:
        'Right Knee Weight-Bearing X-Ray (Aug 18, 2026) and Right Knee MRI (Oct 22, 2026) attached as simulated demo reports.',
      additionalNotes: 'Patient available for morning appointments.',
    },
    physicianWritten: {
      reasonForConsultation:
        'Orthopedic review for persistent right medial knee mechanical locking following June soccer injury.',
      patientReportedSymptoms:
        'Medial knee pain and catching when descending stairs for 5 months despite completing full physiotherapy program.',
      relevantMedicalHistory:
        'Prior right ACL reconstruction in 2014; otherwise healthy.',
      previousTreatmentsDiscussed:
        'Completed 12 weeks (18 sessions) of quadriceps/hamstring physiotherapy (see Physiotherapy_Progress_Report_12Wk.txt) and naproxen PRN.',
      physicianObservations:
        'Mild effusion, positive medial McMurray, intact ACL graft on Lachman, ROM 5–125 degrees.',
      physicianAssessment:
        'Symptomatic posterior horn medial meniscal tear confirmed on Oct 22 MRI after failed conservative rehabilitation.',
      treatmentPlanAndNextSteps:
        'Forward Right Knee MRI report, weight-bearing X-ray, and 12-week physio summary to Dr. Samuel Okafor.',
      followUpInstructions:
        'Avoid deep pivoting sports pending orthopedic consultation; use ice/naproxen PRN.',
      lastSavedAt: '2026-11-08 15:05',
    },
    aiNoteConfig: {
      id: 'ainote-2004-1',
      generatedAt: '2026-11-08 15:06',
      reviewStatus: 'Approved',
      reviewedAt: '2026-11-08 15:08',
      reviewedBy: 'Dr. Elena Vance, MD, CCFP',
    },
    documents: [
      {
        id: 'doc-2004-1',
        name: 'Right_Knee_MRI_Report_Oct22.txt',
        type: 'text/plain',
        sizeLabel: '3.1 KB',
        uploadedAt: '2026-11-08',
        contentText:
          '[Fictional Demo Document] MRI RIGHT KNEE (Oct 22, 2026): Intact ACL reconstruction graft. Complex oblique tear involving the posterior horn and body of the medial meniscus with small parameniscal cyst. Mild joint effusion.',
      },
      {
        id: 'doc-2004-2',
        name: 'WeightBearing_Knee_XRay_Aug18.txt',
        type: 'text/plain',
        sizeLabel: '1.8 KB',
        uploadedAt: '2026-11-08',
        contentText:
          '[Fictional Demo Document] WEIGHT-BEARING RIGHT KNEE RADIOGRAPH (Aug 18, 2026): Mild medial compartment joint-space narrowing; intact ACL fixation hardware; no acute fracture or loose body.',
      },
      {
        id: 'doc-2004-3',
        name: 'Physiotherapy_Progress_Report_12Wk.txt',
        type: 'text/plain',
        sizeLabel: '2.4 KB',
        uploadedAt: '2026-11-08',
        contentText:
          '[Fictional Demo Document] Westpark Physiotherapy Discharge Report: Patient completed 12 weeks (18 sessions) of conservative rehab. Quadriceps strength restored, but mechanical catching persists during knee flexion under load.',
      },
    ],
    timeline: [
      {
        id: 'tl-2004-1',
        title: 'Referral initiated & documents marked collected',
        description:
          'Submitted by Dr. Elena Vance with simulated MRI, weight-bearing X-ray, and 12-week physiotherapy reports.',
        timestamp: '2026-11-08 15:20',
        actor: 'Dr. Elena Vance',
        stage: 'submitted',
      },
      {
        id: 'tl-2004-2',
        title: 'Specialist accepted referral',
        description: 'Dr. Samuel Okafor accepted referral for right medial knee evaluation.',
        timestamp: '2026-11-11 09:40',
        actor: 'Dr. Samuel Okafor',
        stage: 'accepted',
      },
      {
        id: 'tl-2004-3',
        title: 'Appointment confirmed',
        description: 'Confirmed for Dec 4, 2026 at 10:30 AM at Westside Musculoskeletal Institute.',
        timestamp: '2026-11-16 13:15',
        actor: 'Westside Scheduling',
        stage: 'confirmed',
      },
    ],
    confirmedAppointment: {
      date: 'December 4, 2026',
      time: '10:30 AM',
      location: 'Westside Musculoskeletal Institute — 115 Westpark Way, Building B',
      instructions:
        'Please arrive 15 minutes early with photo ID, wear shorts or loose trousers for knee examination, and bring a list of current medications.',
    },
    communications: [],
    patientNextSteps:
      'Your orthopedic consultation with Dr. Samuel Okafor is confirmed for December 4, 2026 at 10:30 AM. Please review the arrival and clothing instructions below.',
  }),

  // SCENARIO 5: Dermatology referral AWAITING PHYSICIAN REVIEW (auto-generated AI notes pending sign-off)
  buildSeededReferral({
    id: 'CB-2026-2005',
    patient: {
      id: 'PT-68341',
      name: 'Hannah Cho',
      dob: '1993-02-11',
      age: 33,
      phone: '(555) 844-1903',
      email: 'hannah.cho@example.com',
      medicalBackground:
        'No chronic liver or lipid disorders; no drug allergies; negative baseline pregnancy screen Nov 12, 2026.',
    },
    specialistId: 'spec-almansoor',
    referralDate: '2026-11-18',
    lastUpdated: '2026-11-18',
    status: 'Draft',
    attentionPriority: 'High',
    physicianApproved: false,
    documentsComplete: true,
    documentsCompletedAt: '2026-11-18 16:20',
    documentsCompletedBy: 'Oakridge Clinic Intake',
    overrideCompleteness: 88,
    overrideChecklistStatuses: {
      0: 'Provided',
      1: 'Provided',
      2: 'Provided',
    },
    clinicalInput: {
      reasonForReferral:
        'Dermatology consultation for refractory nodulocystic facial and upper-back acne.',
      presentingSymptoms:
        '10 months of painful deep inflammatory nodules along jawline, cheeks, and upper back with early scarring.',
      clinicalHistory:
        'Progressive scarring despite guideline topical retinoid and oral tetracycline courses.',
      previousTreatments:
        'Adapalene 0.1% / benzoyl peroxide 2.5% gel nightly x 16 weeks; oral doxycycline 100 mg daily x 12 weeks.',
      currentMedications: 'Adapalene 0.1% / BPO 2.5% gel nightly.',
      examinationFindings:
        '8 tender deep inflammatory nodules on bilateral cheeks/jawline, 4 nodules on upper back, early ice-pick scarring.',
      investigations:
        'Baseline CBC, ALT, fasting lipids, and negative pregnancy screen (Nov 12, 2026) attached; prior biopsy not applicable (inflammatory acne).',
      additionalNotes:
        'Auto-generated AI Consultation Summary awaiting final physician review and approval prior to submission.',
    },
    physicianWritten: {
      reasonForConsultation:
        'Refractory nodulocystic acne with early scarring; request dermatology assessment.',
      patientReportedSymptoms:
        'Painful jawline and back nodules for 10 months causing scarring and distress.',
      relevantMedicalHistory: 'Healthy 33-year-old female, no hepatic or lipid abnormalities.',
      previousTreatmentsDiscussed:
        '16 weeks adapalene/BPO and 12 weeks oral doxycycline 100 mg daily without adequate clearing.',
      physicianObservations:
        '8 facial nodules, 4 upper-back nodules, early pitted scars, no systemic symptoms.',
      physicianAssessment:
        'Refractory nodulocystic acne; discuss systemic isotretinoin eligibility with dermatologist.',
      treatmentPlanAndNextSteps:
        'Physician to review auto-generated AI Consultation Summary and approve referral packet for submission.',
      followUpInstructions:
        'Continue gentle non-comedogenic cleanser; avoid picking nodules.',
      lastSavedAt: '2026-11-18 16:15',
    },
    aiNoteConfig: {
      id: 'ainote-2005-1',
      generatedAt: '2026-11-18 16:18',
      reviewStatus: 'Pending physician review',
    },
    documents: [
      {
        id: 'doc-2005-1',
        name: 'Acne_Treatment_Timeline_Summary.txt',
        type: 'text/plain',
        sizeLabel: '1.8 KB',
        uploadedAt: '2026-11-18',
        contentText:
          '[Fictional Demo Document] Prior Acne Therapy Log: Adapalene 0.1% / BPO 2.5% gel (Jul–Nov 2026, 16 wks) + Doxycycline 100 mg daily (Aug–Nov 2026, 12 wks). Residual nodulocystic lesions persist.',
      },
      {
        id: 'doc-2005-2',
        name: 'Baseline_Lab_Workup_Nov12.txt',
        type: 'text/plain',
        sizeLabel: '1.6 KB',
        uploadedAt: '2026-11-18',
        contentText:
          '[Fictional Demo Document] Baseline Lab Panel (Nov 12, 2026): CBC normal, ALT 19 U/L, Fasting Triglycerides 1.1 mmol/L, Total Cholesterol 4.2 mmol/L, Urine hCG negative. Note: No skin biopsy performed (non-neoplastic inflammatory lesion).',
      },
    ],
    timeline: [
      {
        id: 'tl-2005-1',
        title: 'AI consultation summary generated',
        description:
          'Auto-generated AI Consultation Summary and supporting lab/treatment records queued for Dr. Elena Vance’s review and approval.',
        timestamp: '2026-11-18 16:22',
        actor: 'MediBridge AI',
        stage: 'organized',
      },
    ],
    communications: [],
    patientNextSteps:
      'Your clinic has prepared your dermatology referral packet and it is currently awaiting your family physician’s final review before being sent.',
  }),

  // SCENARIO 6: Cardiology referral REQUIRING SPECIALIST CLARIFICATION (kept ID CB-2026-1042)
  buildSeededReferral({
    id: 'CB-2026-1042',
    patient: {
      id: 'PT-88410',
      name: 'Arthur Pendelton',
      dob: '1962-04-18',
      age: 64,
      phone: '(555) 812-3094',
      email: 'arthur.pendelton@example.com',
      address: '214 Harbourfront Terrace, Toronto, ON',
      healthCardNumber: '6204-819-332-EF',
      medicalBackground:
        'Hypertension (12 yrs), dyslipidemia, former smoker (quit 2018), mild CKD stage 2.',
    },
    specialistId: 'spec-chen',
    referralDate: '2026-11-15',
    lastUpdated: '2026-11-18',
    status: 'Additional Information Requested',
    urgency: 'Semi-Urgent',
    attentionPriority: 'High',
    physicianApproved: true,
    documentsComplete: false,
    overrideCompleteness: 68,
    insurance: {
      availabilityStatus: 'Available and included',
      coverageCategory: 'Provincial Public Health Plan + Private Extended Coverage',
      provinceOrJurisdiction: 'Ontario (OHIP)',
      providerName: 'Medavie Blue Cross (Demo)',
      planType: 'Retiree Extended Health & Drug Plan',
      policyOrMemberId: 'MBC-401982-09',
      coverageDetails: 'OHIP covers cardiology consultation and 12-lead ECG. Blue Cross covers outpatient prescriptions and diagnostic Holter patch co-pay if applicable.',
      referralServiceCoverageNotes: 'Confirm whether ambulatory Holter patch monitoring fee applies or is provincially insured.',
      additionalNotes: '',
      lastUpdatedAt: '2026-11-15 09:20',
      lastUpdatedBy: 'Dr. Elena Vance',
    },
    confidentialityAcknowledgement: {
      accepted: true,
      specialistId: 'spec-chen',
      specialistName: 'Dr. Marcus Chen',
      professionalId: getSpecialistProfessionalId('spec-chen'),
      acknowledgedAt: '2026-11-18 14:05',
      statement: CONFIDENTIALITY_AGREEMENT_TEXT,
    },
    auditLog: [
      createAuditEntry({
        actorRole: 'physician',
        actorName: 'Dr. Elena Vance',
        actorId: 'phys-vance',
        action: 'REFERRAL_SUBMITTED',
        details: 'Submitted cardiology referral CB-2026-1042 to Dr. Marcus Chen.',
        timestamp: '2026-11-15 09:30',
      }),
      createAuditEntry({
        actorRole: 'specialist',
        actorName: 'Dr. Marcus Chen',
        actorId: getSpecialistProfessionalId('spec-chen'),
        action: 'CONFIDENTIALITY_ACCEPTED',
        details: 'Accepted Stage 2 Confidentiality Agreement and unlocked patient details.',
        timestamp: '2026-11-18 14:05',
      }),
      createAuditEntry({
        actorRole: 'specialist',
        actorName: 'Dr. Marcus Chen',
        actorId: getSpecialistProfessionalId('spec-chen'),
        action: 'CLARIFICATION_REQUESTED',
        details: 'Requested 12-lead ECG tracing and Metoprolol dosage verification.',
        timestamp: '2026-11-18 14:10',
      }),
    ],
    clinicalInput: {
      reasonForReferral:
        'Cardiology evaluation for intermittent exertional palpitations and borderline elevated blood pressure.',
      presentingSymptoms:
        '3-month history of brief rapid heartbeat episodes during brisk walking, lasting 5–10 minutes without syncope or chest pain.',
      clinicalHistory:
        'Followed in primary care for hypertension and hyperlipidemia. Note from Oct 29 visit states metoprolol tartrate was increased to 50 mg BID due to palpitations.',
      previousTreatments:
        'Lifestyle sodium restriction; switched from hydrochlorothiazide to ramipril in 2023.',
      currentMedications:
        'Metoprolol tartrate 25 mg daily, Ramipril 10 mg daily, Rosuvastatin 20 mg nightly.',
      examinationFindings:
        'BP 146/88 mmHg (seated, repeated), HR 82 bpm regular on exam, no peripheral edema, clear lung fields.',
      investigations:
        'Lipid panel (Nov 2, 2026): LDL 2.1 mmol/L, HDL 1.1 mmol/L. HbA1c 6.1%. eGFR 71. Recent 12-lead ECG pending clinic upload.',
      additionalNotes:
        'Patient reports episodes occur mostly in mornings. Clinic requested ECG tracing prior to final intake triage.',
    },
    physicianWritten: {
      reasonForConsultation:
        'Evaluate exertional palpitations and borderline hypertension; coordinate rhythm assessment.',
      patientReportedSymptoms:
        'Brief rapid heartbeat episodes during brisk morning walks lasting 5–10 minutes without syncope.',
      relevantMedicalHistory:
        '12-year hypertension, dyslipidemia, CKD stage 2, quit smoking 2018.',
      previousTreatmentsDiscussed:
        'Dietary sodium reduction; switched HCTZ to ramipril 10 mg daily in 2023; trial increase of metoprolol documented Oct 29.',
      physicianObservations:
        'BP 146/88 mmHg seated, HR 82 bpm regular, lungs clear, no peripheral edema.',
      physicianAssessment:
        'Intermittent exertional palpitations and borderline elevated BP; refer to cardiology for rhythm evaluation.',
      treatmentPlanAndNextSteps:
        'Confirm active Metoprolol tartrate dose with patient and upload recent 12-lead ECG tracing to Harbourview Heart Clinic.',
      followUpInstructions:
        'Avoid strenuous exertion if dizzy; seek urgent care for chest pain or fainting.',
      lastSavedAt: '2026-11-15 09:12',
    },
    aiNoteConfig: {
      id: 'ainote-1042-1',
      generatedAt: '2026-11-15 09:13',
      reviewStatus: 'Approved',
      reviewedAt: '2026-11-15 09:14',
      reviewedBy: 'Dr. Elena Vance, MD, CCFP',
    },
    documents: [
      {
        id: 'doc-1042-1',
        name: 'Primary_Care_Progress_Note_Oct29.txt',
        type: 'text/plain',
        sizeLabel: '4.2 KB',
        uploadedAt: '2026-11-15',
        contentText:
          '[Fictional Demo Document] Visit Date: Oct 29, 2026. Patient describes 3 months of intermittent exertional palpitations.\nMedication update discussed: Metoprolol tartrate 50 mg BID trial initiated after persistent morning episodes.\nPlan: Order lipid panel, HbA1c, and repeat 12-lead ECG (not yet scanned into chart).',
      },
      {
        id: 'doc-1042-2',
        name: 'Lab_Summary_Nov02.txt',
        type: 'text/plain',
        sizeLabel: '2.8 KB',
        uploadedAt: '2026-11-15',
        contentText:
          '[Fictional Demo Document] Fasting Lipid Panel & Metabolic Screen (Nov 2, 2026):\nTotal Cholesterol: 4.1 mmol/L | LDL-C: 2.1 mmol/L | HDL-C: 1.1 mmol/L | Triglycerides: 1.9 mmol/L\nHbA1c: 6.1% | Creatinine: 96 umol/L | eGFR: 71 mL/min.',
      },
    ],
    timeline: [
      {
        id: 'tl-1',
        title: 'Referral initiated',
        description: 'Draft created by Dr. Elena Vance for cardiology consultation.',
        timestamp: '2026-11-15 09:15',
        actor: 'Dr. Elena Vance',
        stage: 'initiated',
      },
      {
        id: 'tl-2',
        title: 'Clinical information organized',
        description: 'Clinical notes, AI Consultation Summary, and 2 simulated lab/progress attachments structured for intake.',
        timestamp: '2026-11-15 09:22',
        actor: 'MediBridge AI',
        stage: 'organized',
      },
      {
        id: 'tl-3',
        title: 'Referral approved & submitted',
        description: 'Submitted to Harbourview Heart & Vascular Clinic.',
        timestamp: '2026-11-15 09:30',
        actor: 'Dr. Elena Vance',
        stage: 'submitted',
      },
      {
        id: 'tl-4',
        title: 'Clarification requested by receiving clinic',
        description:
          'Clinic intake coordinator requested 12-lead ECG within 90 days and confirmation of current Metoprolol dosage.',
        timestamp: '2026-11-18 14:10',
        actor: 'Harbourview Heart Intake',
        stage: 'clarification',
      },
    ],
    clarificationThread: [
      {
        id: 'clr-1042-1',
        requestedBy: 'Dr. Marcus Chen / Harbourview Heart Intake',
        requestedAt: '2026-11-18 14:10',
        missingInformation:
          '12-lead ECG (within 90 days) & active Metoprolol tartrate dosage verification',
        reason:
          'Clinical progress note (Oct 29) documents Metoprolol tartrate 50 mg BID while the Current Medications field lists 25 mg daily, and the ECG tracing has not yet been attached.',
        notes:
          'Please confirm current daily dosage and attach the most recent 12-lead ECG PDF/report so intake triage can proceed.',
        status: 'Open',
      },
    ],
    communications: [
      {
        id: 'msg-1042-1',
        referralId: 'CB-2026-1042',
        senderRole: 'specialist',
        senderName: 'Dr. Marcus Chen',
        senderClinic: 'Harbourview Heart & Vascular Clinic',
        recipientRole: 'physician',
        recipientName: 'Dr. Elena Vance',
        recipientClinic: 'Oakridge Family Health Team',
        messageType: 'Formal clarification request',
        subject: 'ECG tracing & Metoprolol dosage reconciliation needed',
        content:
          'Please confirm current Metoprolol tartrate daily dosage (50 mg BID vs. 25 mg daily) and attach the most recent 12-lead ECG report so intake triage can proceed.',
        timestamp: '2026-11-18 14:10',
        readByPhysician: false,
        readBySpecialist: true,
        clarificationId: 'clr-1042-1',
        clarificationMeta: {
          missingInformation:
            '12-lead ECG (within 90 days) & active Metoprolol tartrate dosage verification',
          reason:
            'Clinical progress note (Oct 29) documents Metoprolol tartrate 50 mg BID while Current Medications lists 25 mg daily.',
          notes: 'Attach 12-lead ECG PDF/report if scanned into primary care EMR.',
          status: 'Open',
        },
      },
      {
        id: 'msg-1042-2',
        referralId: 'CB-2026-1042',
        senderRole: 'specialist',
        senderName: 'Dr. Marcus Chen',
        senderClinic: 'Harbourview Heart & Vascular Clinic',
        recipientRole: 'physician',
        recipientName: 'Dr. Elena Vance',
        recipientClinic: 'Oakridge Family Health Team',
        messageType: 'General message',
        subject: 'Holter preference prior to visit',
        content:
          'Hi Elena — once the 12-lead ECG is uploaded, let me know if Mr. Pendelton has already had ambulatory Holter monitoring or if you would like our clinic to coordinate a 48-hour patch at intake.',
        timestamp: '2026-11-18 15:05',
        readByPhysician: false,
        readBySpecialist: true,
      },
    ],
    patientNextSteps:
      'Your family doctor’s office is currently sharing an updated heart tracing (ECG) and confirming your current medication list with Harbourview Heart & Vascular Clinic. No action is needed from you right now.',
  }),

  // SCENARIO 7: Incoming Cardiology referral in STAGE 1 ANONYMOUS REVIEW (Confidentiality Agreement NOT yet accepted)
  buildSeededReferral({
    id: 'CB-2026-2006',
    patient: {
      id: 'PT-95104',
      name: 'Nadia Benali',
      dob: '1974-08-03',
      age: 52,
      phone: '(555) 391-6420',
      email: 'nadia.benali@example.com',
      address: '620 Birchmount Rd, Unit 8, Toronto, ON',
      healthCardNumber: '7408-519-402-GH',
      medicalBackground:
        'Hypothyroidism (stable on levothyroxine), mild hypercholesterolemia, non-smoker, family history of premature coronary artery disease.',
    },
    specialistId: 'spec-siddiqui',
    referralDate: '2026-11-20',
    lastUpdated: '2026-11-20',
    status: 'Submitted',
    urgency: 'Urgent',
    attentionPriority: 'High',
    physicianApproved: true,
    documentsComplete: true,
    documentsCompletedAt: '2026-11-20 08:45',
    documentsCompletedBy: 'Dr. Elena Vance, MD, CCFP',
    overrideCompleteness: 100,
    insurance: {
      availabilityStatus: 'To be confirmed',
      coverageCategory: 'Provincial Public Health Plan Only',
      provinceOrJurisdiction: 'Ontario (OHIP)',
      providerName: '',
      planType: 'Provincial Public Coverage (Extended private plan unconfirmed)',
      policyOrMemberId: '',
      coverageDetails: 'OHIP covers specialist cardiology consultation and ECG.',
      referralServiceCoverageNotes: 'Confirm whether patient holds private drug/Holter extended benefits if needed.',
      additionalNotes: '',
      lastUpdatedAt: '2026-11-20 08:40',
      lastUpdatedBy: 'Dr. Elena Vance',
    },
    auditLog: [
      createAuditEntry({
        actorRole: 'physician',
        actorName: 'Dr. Elena Vance',
        actorId: 'phys-vance',
        action: 'REFERRAL_SUBMITTED',
        details: 'Submitted Stage-1 privacy-protected cardiology referral CB-2026-2006 to Dr. Farah Siddiqui.',
        timestamp: '2026-11-20 08:50',
      }),
    ],
    clinicalInput: {
      reasonForReferral:
        'Urgent cardiology evaluation for recurrent paroxysmal palpitations with near-syncope.',
      presentingSymptoms:
        '6-week history of sudden-onset rapid regular palpitations (HR ~160 bpm on home smartwatch) lasting 15–20 minutes, twice associated with lightheadedness.',
      clinicalHistory:
        'No prior structural heart disease documented. Sister had SVT ablation at age 45; father had MI at age 58.',
      previousTreatments:
        'Advised vagal maneuvers and caffeine avoidance; no antiarrhythmic therapy initiated pending cardiology review.',
      currentMedications: 'Levothyroxine 75 mcg daily, Rosuvastatin 10 mg nightly.',
      examinationFindings:
        'Seated BP 124/76 mmHg, HR 68 bpm regular in clinic, normal S1/S2 without murmur, lungs clear, no orthostatic drop.',
      investigations:
        '12-lead ECG (Nov 18, 2026): Normal sinus rhythm 66 bpm, QTc 428 ms, no pre-excitation. TSH 2.1 mIU/L, electrolytes & CBC normal.',
      confirmedDiagnoses: 'Primary hypothyroidism (stable)',
      suspectedDiagnoses: 'Suspected paroxysmal supraventricular tachycardia (SVT) vs. paroxysmal atrial fibrillation',
      clinicalQuestionsForSpecialist:
        'Evaluate for ambulatory Holter/event monitoring, risk stratification for near-syncope, and medical vs. EP ablation management.',
      referralSummary:
        '52-year-old female presenting with 6 weeks of recurrent rapid palpitations and two episodes of near-syncope. Baseline ECG and TSH normal; urgent rhythm evaluation requested.',
      additionalNotes: 'Open to E-Consultation for initial triage or expedited clinic visit.',
    },
    physicianWritten: {
      reasonForConsultation:
        'Urgent cardiology assessment of paroxysmal palpitations with two lightheadedness episodes.',
      patientReportedSymptoms:
        'Sudden-onset rapid heartbeat episodes lasting 15–20 minutes twice weekly, accompanied by mild presyncope twice.',
      relevantMedicalHistory:
        'Stable hypothyroidism, mild dyslipidemia, family history of SVT and early CAD.',
      previousTreatmentsDiscussed:
        'Caffeine cessation and Valsalva maneuver education; no beta-blocker started prior to ECG/Holter.',
      physicianObservations:
        'BP 124/76 mmHg, HR 68 bpm regular in office, normal cardiac auscultation.',
      physicianAssessment:
        'Suspected paroxysmal SVT; confirmed euthyroid on normal TSH and normal baseline 12-lead ECG.',
      treatmentPlanAndNextSteps:
        'Submit de-identified Stage-1 referral to Dr. Farah Siddiqui at Riverdale Heart & Arrhythmia Centre.',
      followUpInstructions:
        'Present immediately to Emergency Department if syncope, chest pain, or sustained tachycardia occurs.',
      lastSavedAt: '2026-11-20 08:40',
    },
    aiNoteConfig: {
      id: 'ainote-2006-1',
      generatedAt: '2026-11-20 08:42',
      reviewStatus: 'Approved',
      reviewedAt: '2026-11-20 08:45',
      reviewedBy: 'Dr. Elena Vance, MD, CCFP',
    },
    documents: [
      {
        id: 'doc-2006-1',
        name: '12_Lead_ECG_Tracing_Summary_Nov18.txt',
        type: 'text/plain',
        sizeLabel: '2.0 KB',
        uploadedAt: '2026-11-20',
        contentText:
          '[Fictional Demo Document] Patient: Nadia Benali (DOB 1974-08-03, OHIP 7408-519-402-GH). 12-Lead ECG (Nov 18, 2026): Normal sinus rhythm at 66 bpm, PR 152 ms, QRS 84 ms, QTc 428 ms. No ischemic changes.',
      },
      {
        id: 'doc-2006-2',
        name: 'Thyroid_Electrolytes_Panel_Nov17.txt',
        type: 'text/plain',
        sizeLabel: '1.5 KB',
        uploadedAt: '2026-11-20',
        contentText:
          '[Fictional Demo Document] Lab Panel (Nov 17, 2026): TSH 2.1 mIU/L, Na 140, K 4.3, Hb 132 g/L, eGFR 86 mL/min.',
      },
    ],
    timeline: [
      {
        id: 'tl-2006-1',
        title: 'Referral approved & submitted (Stage 1 Privacy Protected)',
        description:
          'Submitted by Dr. Elena Vance to Riverdale Heart & Arrhythmia Centre. Patient identifiers withheld pending specialist Confidentiality Agreement.',
        timestamp: '2026-11-20 08:50',
        actor: 'Dr. Elena Vance',
        stage: 'submitted',
      },
    ],
    communications: [],
    patientNextSteps:
      'Your referral has been sent securely to Riverdale Heart & Arrhythmia Centre. Your personal identifying details remain protected until the specialist accepts confidentiality.',
  }),

  // SCENARIO 8: Endocrinology referral with E-CONSULTATION INVITATION awaiting patient approval
  buildSeededReferral({
    id: 'CB-2026-2007',
    patient: {
      id: 'PT-77320',
      name: 'Samuel Moreau',
      dob: '1981-11-09',
      age: 45,
      phone: '(555) 290-4812',
      email: 'samuel.moreau@example.com',
      address: '54 St. Clair Ave W, Apt 904, Toronto, ON',
      healthCardNumber: '8111-294-770-JK',
      medicalBackground:
        'Subclinical hypothyroidism diagnosed 2025, benign 1.3 cm right thyroid nodule on ultrasound, no neck radiation history.',
    },
    specialistId: 'spec-beaumont',
    referralDate: '2026-11-14',
    lastUpdated: '2026-11-20',
    status: 'E-Consultation Awaiting Patient Approval',
    urgency: 'Routine',
    attentionPriority: 'Standard',
    physicianApproved: true,
    acceptedAt: '2026-11-18',
    documentsComplete: true,
    documentsCompletedAt: '2026-11-14 14:15',
    documentsCompletedBy: 'Dr. Elena Vance, MD, CCFP',
    overrideCompleteness: 100,
    insurance: {
      availabilityStatus: 'Available and included',
      coverageCategory: 'Provincial Public Health Plan + Private Extended Coverage',
      provinceOrJurisdiction: 'Ontario (OHIP)',
      providerName: 'Manulife (Demo)',
      planType: 'Group Extended Health Plan',
      policyOrMemberId: 'MNL-552810-02',
      coverageDetails: 'OHIP covers endocrinology e-consultation and follow-up ultrasound; Manulife covers prescription thyroid therapies.',
      referralServiceCoverageNotes: 'Virtual OHIP-insured specialist consultation eligible.',
      additionalNotes: 'Extended plan verified Nov 14, 2026.',
      verificationStatus: 'Verified',
      lastUpdatedAt: '2026-11-14 14:10',
      lastUpdatedBy: 'Dr. Elena Vance',
    },
    confidentialityAcknowledgement: {
      accepted: true,
      specialistId: 'spec-beaumont',
      specialistName: 'Dr. Claire Beaumont',
      professionalId: getSpecialistProfessionalId('spec-beaumont'),
      acknowledgedAt: '2026-11-17 11:02',
      statement: CONFIDENTIALITY_AGREEMENT_TEXT,
    },
    auditLog: [
      createAuditEntry({
        actorRole: 'physician',
        actorName: 'Dr. Elena Vance',
        actorId: 'phys-vance',
        action: 'REFERRAL_SUBMITTED',
        details: 'Submitted endocrinology referral CB-2026-2007 to Dr. Claire Beaumont.',
        timestamp: '2026-11-14 14:20',
      }),
      createAuditEntry({
        actorRole: 'specialist',
        actorName: 'Dr. Claire Beaumont',
        actorId: getSpecialistProfessionalId('spec-beaumont'),
        action: 'CONFIDENTIALITY_ACCEPTED',
        details: 'Accepted Stage 2 Confidentiality Agreement and unlocked patient record.',
        timestamp: '2026-11-17 11:02',
      }),
      createAuditEntry({
        actorRole: 'specialist',
        actorName: 'Dr. Claire Beaumont',
        actorId: getSpecialistProfessionalId('spec-beaumont'),
        action: 'SPECIALIST_DECISION_ACCEPTED',
        details: 'Accepted referral CB-2026-2007 for thyroid nodule & TSH review.',
        timestamp: '2026-11-18 10:15',
      }),
      createAuditEntry({
        actorRole: 'specialist',
        actorName: 'Dr. Claire Beaumont',
        actorId: getSpecialistProfessionalId('spec-beaumont'),
        action: 'ECONSULT_PROPOSED',
        details: 'Proposed E-Consultation for December 2, 2026 at 02:00 PM; awaiting patient approval.',
        timestamp: '2026-11-20 09:05',
      }),
    ],
    eConsultation: {
      isOffered: true,
      consultationMode: 'E-Consultation',
      proposedDate: 'December 2, 2026',
      proposedTime: '02:00 PM',
      consultationReason: 'Review 1.3 cm right thyroid nodule ultrasound & TSH trend',
      specialistMessage:
        'Because your ultrasound and recent thyroid labs are complete, we can conduct your initial consultation conveniently as an online E-Consultation to review surveillance vs. biopsy criteria.',
      proposedAt: '2026-11-20 09:05',
      proposedBy: 'Dr. Claire Beaumont',
      patientStatus: 'Pending',
      messages: [
        {
          id: 'ecmsg-2007-1',
          referralId: 'CB-2026-2007',
          appointmentContextLabel: 'Proposed E-Consultation · December 2, 2026 at 02:00 PM',
          senderRole: 'specialist',
          senderDisplayName: 'Dr. Claire Beaumont (St. Jude Endocrine)',
          content: 'Hello Samuel, we have proposed a virtual E-Consultation on December 2 at 2:00 PM. Please review the invitation in your Patient Portal and accept or request a reschedule at your convenience.',
          timestamp: '2026-11-20 09:06',
          readBySpecialist: true,
          readByPatient: false,
        },
      ],
    },
    clinicalInput: {
      reasonForReferral:
        'Endocrinology consultation for rising TSH and 1.3 cm right-lobe thyroid nodule surveillance.',
      presentingSymptoms:
        'Mild cold intolerance and afternoon fatigue over 4 months; no compressive neck symptoms, dysphagia, or hoarseness.',
      clinicalHistory:
        'Mildly elevated TSH (6.8 mIU/L) with normal Free T4 (14.2 pmol/L); benign-appearing TI-RADS 3 nodule.',
      previousTreatments: 'Observation without levothyroxine initiation to date.',
      currentMedications: 'Vitamin D3 1000 IU daily.',
      allergies: 'Penicillin (mild rash in childhood).',
      examinationFindings:
        'BP 118/74 mmHg, HR 66 bpm, non-tender mobile right thyroid lobe without cervical lymphadenopathy.',
      investigations:
        'TSH 6.8 mIU/L, Free T4 14.2 pmol/L (Nov 10, 2026); Thyroid Ultrasound (Nov 6, 2026): 1.3 cm TI-RADS 3 spongiform right lobe nodule.',
      confirmedDiagnoses: 'Subclinical hypothyroidism',
      suspectedDiagnoses: 'Benign thyroid nodule (TI-RADS 3); evaluate levothyroxine threshold',
      clinicalQuestionsForSpecialist:
        'Advise on interval ultrasound follow-up vs. FNA and whether low-dose levothyroxine is indicated.',
      referralSummary:
        '45-year-old male with subclinical hypothyroidism (TSH 6.8, normal Free T4) and a 1.3 cm TI-RADS 3 thyroid nodule. Complete labs and ultrasound attached.',
      additionalNotes: 'Patient works remotely and prefers virtual E-Consultation if clinically appropriate.',
    },
    physicianWritten: {
      reasonForConsultation:
        'Endocrinology evaluation for subclinical hypothyroidism and 1.3 cm TI-RADS 3 thyroid nodule.',
      patientReportedSymptoms: 'Mild fatigue and cold sensitivity; no neck pressure or swallowing changes.',
      relevantMedicalHistory: 'No radiation exposure or family history of thyroid malignancy.',
      previousTreatmentsDiscussed: 'Watched expectantly; no thyroid hormone started.',
      physicianObservations: 'Normal neck exam, no palpable lymphadenopathy.',
      physicianAssessment: 'Subclinical hypothyroidism + TI-RADS 3 thyroid nodule; ideal for virtual review.',
      treatmentPlanAndNextSteps: 'Referred to Dr. Claire Beaumont with ultrasound and lab panel.',
      followUpInstructions: 'Report any neck swelling or voice changes.',
      lastSavedAt: '2026-11-14 14:05',
    },
    aiNoteConfig: {
      id: 'ainote-2007-1',
      generatedAt: '2026-11-14 14:07',
      reviewStatus: 'Approved',
      reviewedAt: '2026-11-14 14:12',
      reviewedBy: 'Dr. Elena Vance, MD, CCFP',
    },
    documents: [
      {
        id: 'doc-2007-1',
        name: 'Thyroid_Ultrasound_Nov06.txt',
        type: 'text/plain',
        sizeLabel: '1.9 KB',
        uploadedAt: '2026-11-14',
        contentText:
          '[Fictional Demo Document] Thyroid Ultrasound (Nov 6, 2026): Right lobe 1.3 x 1.0 x 0.9 cm spongiform nodule (TI-RADS 3). No suspicious cervical lymph nodes.',
      },
      {
        id: 'doc-2007-2',
        name: 'Thyroid_Lab_Panel_Nov10.txt',
        type: 'text/plain',
        sizeLabel: '1.4 KB',
        uploadedAt: '2026-11-14',
        contentText:
          '[Fictional Demo Document] Lab Panel (Nov 10, 2026): TSH 6.8 mIU/L (High), Free T4 14.2 pmol/L (Normal), Anti-TPO positive.',
      },
    ],
    timeline: [
      {
        id: 'tl-2007-1',
        title: 'Referral submitted & accepted by Dr. Claire Beaumont',
        description: 'Confidentiality acknowledged and referral accepted.',
        timestamp: '2026-11-18 10:15',
        actor: 'Dr. Claire Beaumont',
        stage: 'accepted',
      },
      {
        id: 'tl-2007-2',
        title: 'E-Consultation Proposed',
        description:
          'Dr. Claire Beaumont proposed an online E-Consultation for December 2, 2026 at 02:00 PM. Awaiting patient confirmation.',
        timestamp: '2026-11-20 09:05',
        actor: 'Dr. Claire Beaumont',
        stage: 'econsult',
      },
    ],
    communications: [],
    patientNextSteps:
      'Dr. Claire Beaumont has offered an online E-Consultation on December 2, 2026 at 02:00 PM. Please accept or request a reschedule in your Patient Portal.',
  }),
];

export const SEED_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-stage1-2006',
    title: 'New Anonymous Referral Request · CB-2026-2006',
    message:
      'Dr. Elena Vance submitted an Urgent Cardiology referral (Stage 1 de-identified preview). Accept the Confidentiality Agreement to unlock patient identifiers.',
    timestamp: 'Just now',
    type: 'action',
    referralId: 'CB-2026-2006',
    audience: 'specialist',
    read: false,
  },
  {
    id: 'notif-econsult-2007',
    title: 'E-Consultation Invitation · CB-2026-2007',
    message:
      'Dr. Claire Beaumont (Endocrinology) proposed an online E-Consultation for Samuel Moreau on December 2, 2026 at 02:00 PM. Patient approval required.',
    timestamp: '10 mins ago',
    type: 'action',
    referralId: 'CB-2026-2007',
    audience: 'patient',
    read: false,
  },
  {
    id: 'notif-0',
    title: 'Awaiting Specialist Selection · CB-2026-2000',
    message:
      'Camille Laurent’s dermatology referral has physician notes, AI Consultation Summary, and supporting dermoscopy reports ready — run AI Find Specialist to select a clinic.',
    timestamp: 'Just now',
    type: 'action',
    referralId: 'CB-2026-2000',
    audience: 'physician',
    read: false,
  },
  {
    id: 'notif-1',
    title: 'Clarification & message · CB-2026-1042',
    message:
      'Dr. Marcus Chen sent a clarification request and direct message regarding Arthur Pendelton’s ECG and Metoprolol dosage.',
    timestamp: '18 mins ago',
    type: 'warning',
    referralId: 'CB-2026-1042',
    audience: 'physician',
    read: false,
  },
  {
    id: 'notif-2',
    title: 'Awaiting physician review · CB-2026-2005',
    message:
      'Hannah Cho’s dermatology referral has an AI-generated consultation summary pending your review before submission.',
    timestamp: '45 mins ago',
    type: 'action',
    referralId: 'CB-2026-2005',
    audience: 'physician',
    read: false,
  },
  {
    id: 'notif-3',
    title: 'Missing required report · CB-2026-2002',
    message:
      'Kieran Patel’s dermatology draft is missing prior patch/allergy or biopsy documentation in the intake checklist.',
    timestamp: '2 hours ago',
    type: 'warning',
    referralId: 'CB-2026-2002',
    audience: 'physician',
    read: false,
  },
  {
    id: 'notif-4',
    title: 'Ready for final approval · CB-2026-2001',
    message:
      'Linnea Bergstrom’s dermatology referral is 100% complete with collected documents and approved notes.',
    timestamp: '3 hours ago',
    type: 'success',
    referralId: 'CB-2026-2001',
    audience: 'physician',
    read: false,
  },
  {
    id: 'notif-5',
    title: 'Patient portal updated · CB-2026-2004',
    message:
      'David Kowalski’s confirmed orthopedic appointment (Dec 4, 10:30 AM) and MRI/physio packet are visible in Patient Portal Preview.',
    timestamp: '2 days ago',
    type: 'info',
    referralId: 'CB-2026-2004',
    audience: 'all',
    read: true,
  },
];

export const DEFAULT_SETTINGS: UserSettings = {
  physicianName: 'Dr. Elena Vance',
  credentials: 'MD, CCFP',
  role: 'Referring Family Physician',
  email: 'elena.vance@oakridgehealth.example',
  clinicName: 'Oakridge Family Health Team',
  clinicAddress: '310 Oakridge Crescent, Suite 200',
  clinicPhone: '(555) 204-8100',
  clinicFax: '(555) 204-8109',
  emrBridgeEnabled: true,
  notifyMissingDocs: true,
  notifySpecialistAcceptance: true,
  notifyClarification: true,
  notifyPatientUpdates: true,
  compactTables: false,
  autoRunChecklist: true,
  specialistProfileId: 'all',
  specialistClinicRole: 'Receiving Specialist & Intake Coordinator',
  specialistAutoFlagIncomplete: true,
};

export interface DemoPresetCase {
  id: string;
  label: string;
  subtitle: string;
  specialistId: string;
  patient: PatientInfo;
  clinical: ClinicalInput;
  documents: UploadedDocument[];
}

export const DEMO_PRESET_CASES: DemoPresetCase[] = [
  {
    id: 'preset-derm-complete',
    label: 'Dermatology Case (Changing Nevus)',
    subtitle: 'Loads a dermatology case ready for AI specialist matching and checklist review.',
    specialistId: 'spec-almansoor',
    patient: {
      id: 'PT-93410',
      name: 'Clara Hendrick',
      dob: '1989-04-12',
      age: 37,
      phone: '(555) 442-8190',
      email: 'clara.hendrick@example.com',
      medicalBackground: 'Fair skin, significant childhood sunburns, no prior melanoma.',
    },
    clinical: {
      reasonForReferral: 'Dermatology evaluation for changing pigmented nevus on right upper arm.',
      presentingSymptoms: '4-month enlargement of asymmetric brown-black macule from 4 mm to 7 mm with mild scaling.',
      clinicalHistory: 'No prior skin biopsy performed. Regular outdoor runner.',
      previousTreatments: 'None applied directly to lesion; uses SPF 30 daily.',
      currentMedications: 'None.',
      allergies: 'No known drug allergies (NKDA).',
      examinationFindings: 'Right lateral upper arm: 7 mm x 6 mm asymmetric pigmented macule with irregular border and two-tone pigment.',
      investigations: 'Clinical dermoscopy note attached below.',
      additionalNotes: 'Patient prefers shortest wait time or Midtown/Northgate clinic.',
    },
    documents: [
      {
        id: 'demo-doc-derm-1',
        name: 'Dermoscopy_Upper_Arm_Note.txt',
        type: 'text/plain',
        sizeLabel: '1.7 KB',
        uploadedAt: '2026-11-19',
        contentText:
          '[Fictional Demo Document] Dermoscopy Summary: 7 mm x 6 mm pigmented lesion on right upper arm, irregular border. No prior biopsy performed.',
      },
    ],
  },
  {
    id: 'preset-cardio-gap',
    label: 'Cardiology Case (With Gap)',
    subtitle: 'Shows AI catching a missing 12-lead ECG and conflicting Metoprolol dose across notes.',
    specialistId: 'spec-chen',
    patient: {
      id: 'PT-90412',
      name: 'Margaret Holloway',
      dob: '1959-07-22',
      age: 67,
      phone: '(555) 614-8820',
      email: 'm.holloway@example.com',
      medicalBackground: 'Hypertension (9 yrs), prediabetes, osteoarthritis of hands.',
    },
    clinical: {
      reasonForReferral: 'Cardiology evaluation for recurrent exertional dyspnea and irregular pulse episodes.',
      presentingSymptoms: '2-month history of shortness of breath climbing one flight of stairs and brief fluttering palpitations twice weekly.',
      clinicalHistory: 'Longstanding hypertension managed in family practice. Progress note from Nov 10 mentions increasing metoprolol to 50 mg BID.',
      previousTreatments: 'Dietary salt reduction; previously tried amlodipine 5 mg (discontinued due to ankle edema).',
      currentMedications: 'Metoprolol succinate 25 mg daily, Perindopril 4 mg daily, Atorvastatin 10 mg nightly.',
      allergies: 'Amlodipine intolerance (peripheral edema); NKDA.',
      examinationFindings: 'BP 138/84 mmHg, HR 78 bpm, mild bilateral ankle trace edema, JVP normal.',
      investigations: 'Lipid panel (Nov 5): LDL 2.3 mmol/L, HbA1c 6.3%. Baseline 12-lead ECG ordered — results pending clinic scan.',
      additionalNotes: 'Patient prefers downtown clinic access.',
    },
    documents: [
      {
        id: 'demo-doc-1',
        name: 'Clinic_Progress_Note_Nov10.txt',
        type: 'text/plain',
        sizeLabel: '3.1 KB',
        uploadedAt: '2026-11-18',
        contentText:
          '[Fictional Demo Document] Encounter Date: Nov 10, 2026\nSubjective: Margaret Holloway reports dyspnea on stairs and twice-weekly palpitations.\nMedication Discussion: Increased metoprolol 50 mg BID on trial; continue perindopril 4 mg daily.\nPending Items: 12-lead ECG ordered today; lab lipid panel completed Nov 5 (LDL 2.3 mmol/L, HbA1c 6.3%).',
      },
    ],
  },
  {
    id: 'preset-ortho-complete',
    label: 'Orthopedics Case (Complete)',
    subtitle: 'Shows 100% specialty intake verification ready for clean approval & submission.',
    specialistId: 'spec-okafor',
    patient: {
      id: 'PT-91805',
      name: 'Trevor Lindholm',
      dob: '1983-10-14',
      age: 43,
      phone: '(555) 773-2041',
      email: 't.lindholm@example.com',
      medicalBackground: 'Otherwise healthy, no prior knee surgeries, works as a carpenter.',
    },
    clinical: {
      reasonForReferral: 'Orthopedic consultation for persistent right knee medial meniscus tear limiting work duties.',
      presentingSymptoms: '4 months of right medial knee pain, painful pivoting, and intermittent catching after kneeling.',
      clinicalHistory: 'Acute kneeling twist injury at work in July 2026. Pain persists despite structured rehabilitation.',
      previousTreatments: '10 weeks of outpatient physiotherapy focusing on VMO strengthening and activity modification; topical diclofenac.',
      currentMedications: 'Ibuprofen 400 mg PRN (max twice weekly), Topical diclofenac 1% gel PRN.',
      allergies: 'No known drug allergies (NKDA).',
      examinationFindings: 'Right knee ROM 0–120 degrees, localized medial joint-line tenderness, positive Thessaly and McMurray tests medially, ligaments stable.',
      investigations: 'Right Knee Weight-Bearing X-ray (Aug 2026): Preserved joint space, no fracture. Right Knee MRI (Oct 30, 2026): Horizontal tear posterior horn medial meniscus.',
      additionalNotes: 'Worker requires clearance or surgical options discussion.',
    },
    documents: [
      {
        id: 'demo-doc-2',
        name: 'MRI_Right_Knee_Oct30.txt',
        type: 'text/plain',
        sizeLabel: '2.7 KB',
        uploadedAt: '2026-11-18',
        contentText:
          '[Fictional Demo Document] MRI RIGHT KNEE (Oct 30, 2026): Horizontal cleavage tear of the posterior horn of the medial meniscus extending to the inferior articular surface. Cruciate and collateral ligaments intact.',
      },
      {
        id: 'demo-doc-3',
        name: 'Physio_Summary_10Weeks.txt',
        type: 'text/plain',
        sizeLabel: '1.8 KB',
        uploadedAt: '2026-11-18',
        contentText:
          '[Fictional Demo Document] Physiotherapy Summary: Completed 10 weeks conservative knee program. Strength improved, however catching and medial pain persist with deep kneeling.',
      },
    ],
  },
];
