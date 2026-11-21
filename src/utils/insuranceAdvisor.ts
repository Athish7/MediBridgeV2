import type {
  ClinicalInput,
  InsuranceAssessmentResult,
  InsuranceWorkflowStageStatus,
  MedicalInsuranceInfo,
} from '../types/clinbridge';

export function getInsuranceVerificationStatus(
  ins?: MedicalInsuranceInfo
): 'Verified' | 'Needs verification' | 'Missing' {
  if (!ins) return 'Missing';
  if (ins.verificationStatus) return ins.verificationStatus;
  if (ins.specialistRequest && !ins.specialistRequest.resolved) return 'Needs verification';
  if (ins.availabilityStatus === 'Not available') return 'Missing';
  if (ins.availabilityStatus === 'To be confirmed') return 'Needs verification';
  if (
    ins.availabilityStatus === 'Available and included' &&
    ins.coverageCategory !== 'Provincial Public Health Plan Only' &&
    !ins.providerName.trim()
  ) {
    return 'Needs verification';
  }
  return 'Verified';
}

export function createDefaultInsuranceInfo(): MedicalInsuranceInfo {
  return {
    availabilityStatus: 'To be confirmed',
    coverageCategory: 'Provincial Public Health Plan Only',
    provinceOrJurisdiction: 'Ontario (OHIP)',
    providerName: '',
    planType: '',
    policyOrMemberId: '',
    coverageDetails: '',
    referralServiceCoverageNotes: '',
    additionalNotes: '',
    verificationStatus: 'Needs verification',
  };
}

export function assessInsuranceDeterministic(params: {
  insurance?: MedicalInsuranceInfo;
  specialty: string;
  clinicalInput?: ClinicalInput;
}): InsuranceAssessmentResult {
  const ins = params.insurance ?? createDefaultInsuranceInfo();
  const specialty = params.specialty || 'Specialist Care';
  const combinedClinical = [
    params.clinicalInput?.reasonForReferral,
    params.clinicalInput?.investigations,
    params.clinicalInput?.previousTreatments,
    ins.coverageDetails,
    ins.referralServiceCoverageNotes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const missingDetails: string[] = [];
  const relevantCoverageHighlights: string[] = [];
  const priorAuthorizationFlags: string[] = [];
  const recommendedVerificationSteps: string[] = [];
  const remainingConfirmations: string[] = [];

  // Information Collection evaluation
  if (ins.availabilityStatus === 'Not available') {
    missingDetails.push('Extended/private insurance details are marked "Not available". Confirm whether patient relies solely on provincial public health coverage or self-pay.');
  } else if (ins.availabilityStatus === 'To be confirmed') {
    missingDetails.push('Insurance availability status is "To be confirmed" — clarify provincial health card validity and any private extended benefits.');
  }

  if (
    ins.availabilityStatus === 'Available and included' &&
    ins.coverageCategory !== 'Provincial Public Health Plan Only'
  ) {
    if (!ins.providerName.trim()) {
      missingDetails.push('Private insurance provider name is blank.');
    }
    if (!ins.planType.trim()) {
      missingDetails.push('Plan or coverage type (e.g., Employer Extended Health, Group Benefits) is not specified.');
    }
    if (!ins.policyOrMemberId.trim()) {
      missingDetails.push('Policy / member ID is blank (record only if needed for uninsured/ancillary services).');
    }
  }

  if (!ins.provinceOrJurisdiction?.trim()) {
    missingDetails.push('Provincial/territorial public plan jurisdiction (e.g., OHIP, MSP, AHCIP, RAMQ) is not specified.');
  }

  // Canadian healthcare coverage context highlights
  const isProvincialIncluded =
    ins.coverageCategory === 'Provincial Public Health Plan Only' ||
    ins.coverageCategory === 'Provincial Public Health Plan + Private Extended Coverage';

  if (isProvincialIncluded) {
    relevantCoverageHighlights.push(
      `Standard medically necessary ${specialty.toLowerCase()} consultations by a licensed specialist are generally insured under provincial/territorial public health plans (${ins.provinceOrJurisdiction || 'Provincial Public Plan'}) when referred by a primary care physician — private insurance is not typically billed for core physician consult fees.`
    );
  }

  if (
    ins.coverageCategory === 'Provincial Public Health Plan + Private Extended Coverage' ||
    ins.coverageCategory === 'Private / Employer Extended Coverage Only'
  ) {
    relevantCoverageHighlights.push(
      `Private/extended coverage (${ins.providerName || 'Private Carrier'}) may apply to non-provincially insured items such as outpatient prescriptions, biologics, physiotherapy/rehab, orthotics, medical devices, or uninsured private clinic procedures.`
    );
  }

  if (ins.referralServiceCoverageNotes.trim()) {
    relevantCoverageHighlights.push(`Entered coverage notes: ${ins.referralServiceCoverageNotes.trim()}`);
  }

  // Prior Authorization checks (non-diagnostic administrative flagging)
  if (
    combinedClinical.includes('biologic') ||
    combinedClinical.includes('isotretinoin') ||
    combinedClinical.includes('mri') ||
    combinedClinical.includes('holter') ||
    combinedClinical.includes('inject') ||
    combinedClinical.includes('surgery') ||
    combinedClinical.includes('arthroscop') ||
    combinedClinical.includes('patch')
  ) {
    priorAuthorizationFlags.push(
      'Clinical context mentions specialized therapies, outpatient devices, or diagnostic procedures that may require provincial special authorization or private drug/device prior authorization after specialist assessment.'
    );
  } else if (ins.coverageCategory === 'Private / Employer Extended Coverage Only') {
    priorAuthorizationFlags.push(
      'Private-only coverage indicated: confirm whether the receiving clinic or proposed diagnostic service requires pre-authorization before scheduling.'
    );
  } else {
    priorAuthorizationFlags.push(
      'No immediate prior-authorization trigger flagged for standard consultation intake; confirm if ancillary procedures or prescription therapies are added later.'
    );
  }

  // Recommended verification steps
  recommendedVerificationSteps.push(
    'Confirm active provincial/territorial health card eligibility at patient check-in (for publicly funded specialist consultations).'
  );
  if (ins.availabilityStatus === 'Available and included' && ins.providerName.trim()) {
    recommendedVerificationSteps.push(
      `Verify whether ${ins.providerName.trim()} extended health benefits cover any prescribed medications, physiotherapy, or non-insured clinic supplies outside provincial coverage.`
    );
  } else {
    recommendedVerificationSteps.push(
      'Ask patient to bring any supplemental drug/extended health benefit details if prescriptions, devices, or allied health follow-up are anticipated.'
    );
  }

  // Remaining confirmations
  if (ins.availabilityStatus !== 'Available and included') {
    remainingConfirmations.push('Confirm final supplemental/extended insurance availability with patient or referring clinic.');
  }
  if (!ins.referralServiceCoverageNotes.trim()) {
    remainingConfirmations.push('Document whether any non-insured services, devices, or ancillary fees apply to this referral.');
  }
  remainingConfirmations.push(
    'Actual eligibility and reimbursement remain subject to provincial fee schedules and insurer adjudication (not automated in this prototype).'
  );

  const sufficiencyStatus: InsuranceAssessmentResult['sufficiencyStatus'] =
    ins.availabilityStatus === 'Not available' || ins.availabilityStatus === 'To be confirmed'
      ? missingDetails.length >= 2
        ? 'Missing Insurance Details'
        : 'Additional Details Recommended'
      : missingDetails.length > 0
        ? 'Additional Details Recommended'
        : 'Sufficient for Intake';

  const workflowStages: InsuranceWorkflowStageStatus[] = [
    {
      stage: 'Information Collection',
      status:
        ins.availabilityStatus === 'Available and included' && missingDetails.length === 0
          ? 'Completed'
          : ins.availabilityStatus === 'Not applicable'
            ? 'Completed'
            : 'Needs Review',
      summary:
        ins.availabilityStatus === 'Available and included'
          ? `Recorded (${ins.coverageCategory}${ins.providerName ? ` · ${ins.providerName}` : ''}).`
          : `Status: ${ins.availabilityStatus}. ${missingDetails[0] || 'Confirm coverage context.'}`,
    },
    {
      stage: 'Eligibility / Coverage Verification',
      status: 'Needs Review',
      summary:
        'Preliminary intake review only. Clinic staff must verify active provincial health coverage and any private extended benefits before non-insured services.',
    },
    {
      stage: 'Prior Authorization',
      status: priorAuthorizationFlags.length > 0 ? 'Action Recommended' : 'Needs Review',
      summary: priorAuthorizationFlags[0],
    },
    {
      stage: 'Billing / Claims Submission',
      status: 'Not Simulated / Out of Scope',
      summary:
        'MediBridge prototype does not submit provincial billing claims or connect to real private insurer claim APIs.',
    },
    {
      stage: 'Actual Reimbursement',
      status: 'Not Simulated / Out of Scope',
      summary:
        'Final reimbursement is never guaranteed by AI and depends on provincial rules or private payer adjudication.',
    },
  ];

  return {
    assessedAt: new Date().toISOString(),
    engineMode: 'deterministic',
    sufficiencyStatus,
    summary: `Insurance Intake Evaluation: ${sufficiencyStatus}. ${
      isProvincialIncluded
        ? `Reflects Canadian public-private coordination (${ins.provinceOrJurisdiction || 'Provincial Plan'} covers standard medically necessary specialist visits; extended private insurance applies only to non-insured medications, devices, or ancillary care).`
        : 'Clarify provincial public coverage eligibility alongside any private plan details.'
    }`,
    missingDetails,
    relevantCoverageHighlights,
    priorAuthorizationFlags,
    recommendedVerificationSteps,
    remainingConfirmations,
    canadianHealthcareContextNote:
      'Canadian Healthcare Context: In Canada, medically necessary specialist consultations are typically funded through provincial/territorial public health insurance (e.g., OHIP, MSP, RAMQ, AHCIP), whereas private extended insurance generally applies only to prescription drugs, allied health (e.g., physiotherapy), devices, or uninsured clinic services. This assessment never assumes private insurance pays for publicly insured physician visits.',
    workflowStages,
    disclaimer:
      'Preliminary AI administrative efficiency assessment only. Does not verify live insurer eligibility, submit claims, or guarantee coverage/reimbursement.',
  };
}
