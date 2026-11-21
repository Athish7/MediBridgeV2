import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type {
  ClinicalInput,
  InsuranceAssessmentResult,
  InsuranceAvailabilityStatus,
  MedicalInsuranceInfo,
} from '../types/clinbridge';
import {
  assessInsuranceDeterministic,
  createDefaultInsuranceInfo,
  getInsuranceVerificationStatus,
} from '../utils/insuranceAdvisor';
import { maskIdentifier } from '../utils/privacyProjection';

interface InsurancePanelProps {
  insurance?: MedicalInsuranceInfo;
  specialty: string;
  clinicalInput?: ClinicalInput;
  role: 'physician' | 'specialist' | 'patient';
  editable?: boolean;
  embedded?: boolean;
  readOnlyPatient?: boolean;
  defaultExpanded?: boolean;
  onSaveInsurance?: (next: MedicalInsuranceInfo) => Promise<void> | void;
  onChangeDraft?: (next: MedicalInsuranceInfo) => void;
  onRequestInsuranceInfo?: (payload: { requestedDetails: string; reason: string }) => Promise<void> | void;
}

const AVAILABILITY_OPTIONS: InsuranceAvailabilityStatus[] = [
  'Available and included',
  'Not available',
  'Not applicable',
  'To be confirmed',
];

const COVERAGE_CATEGORIES: MedicalInsuranceInfo['coverageCategory'][] = [
  'Provincial Public Health Plan + Private Extended Coverage',
  'Provincial Public Health Plan Only',
  'Private / Employer Extended Coverage Only',
  'Self-Pay / Uninsured',
  'Not Confirmed',
];

const VERIFICATION_OPTIONS: NonNullable<MedicalInsuranceInfo['verificationStatus']>[] = [
  'Verified',
  'Needs verification',
  'Missing',
];

export const InsurancePanel: React.FC<InsurancePanelProps> = ({
  insurance,
  specialty,
  clinicalInput,
  role,
  editable = false,
  embedded = false,
  readOnlyPatient = false,
  defaultExpanded = false,
  onSaveInsurance,
  onChangeDraft,
  onRequestInsuranceInfo,
}) => {
  const base = insurance ?? createDefaultInsuranceInfo();
  const [expanded, setExpanded] = useState(
    embedded || defaultExpanded || Boolean(base.specialistRequest && !base.specialistRequest.resolved)
  );
  const [isEditing, setIsEditing] = useState(
    editable && role === 'physician' && !onSaveInsurance && !readOnlyPatient
  );
  const [draft, setDraft] = useState<MedicalInsuranceInfo>(base);
  const [revealPolicyId, setRevealPolicyId] = useState(false);

  const prevInsuranceRef = useRef(insurance);
  useEffect(() => {
    if (insurance && insurance !== prevInsuranceRef.current) {
      prevInsuranceRef.current = insurance;
      setDraft(insurance);
      setAssessment(insurance.aiAssessment);
    }
  }, [insurance]);

  const [isAssessing, setIsAssessing] = useState(false);
  const [assessment, setAssessment] = useState<InsuranceAssessmentResult | undefined>(
    base.aiAssessment
  );

  const [showRequestForm, setShowRequestForm] = useState(false);
  const [reqDetails, setReqDetails] = useState(
    'Please confirm private extended benefits carrier, plan type, or provincial health card coverage jurisdiction for diagnostic/treatment planning.'
  );
  const [reqReason, setReqReason] = useState(
    'Needed to confirm outpatient imaging/medication/device coverage prior to specialist treatment plan.'
  );
  const [saving, setSaving] = useState(false);

  const updateField = <K extends keyof MedicalInsuranceInfo>(
    key: K,
    val: MedicalInsuranceInfo[K]
  ) => {
    const next = { ...draft, [key]: val };
    setDraft(next);
    if (onChangeDraft) {
      onChangeDraft(next);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveInsurance) return;
    setSaving(true);
    try {
      await onSaveInsurance({ ...draft, aiAssessment: assessment ?? draft.aiAssessment });
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleRunAssessment = async () => {
    setIsAssessing(true);
    const targetIns = isEditing || onChangeDraft ? draft : base;
    try {
      const res = await fetch('/api/ai/assess-insurance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          insurance: targetIns,
          specialty,
          clinicalInput,
        }),
      });
      if (res.ok) {
        const result = (await res.json()) as InsuranceAssessmentResult;
        setAssessment(result);
        if (onChangeDraft) {
          onChangeDraft({ ...targetIns, aiAssessment: result });
        }
        return;
      }
    } catch {
      // fallback below
    } finally {
      setIsAssessing(false);
    }
    const fallback = assessInsuranceDeterministic({
      insurance: targetIns,
      specialty,
      clinicalInput,
    });
    setAssessment(fallback);
  };

  const handleSpecialistRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onRequestInsuranceInfo || !reqDetails.trim()) return;
    setSaving(true);
    try {
      await onRequestInsuranceInfo({
        requestedDetails: reqDetails.trim(),
        reason: reqReason.trim() || 'Clinic administrative coverage verification.',
      });
      setShowRequestForm(false);
    } finally {
      setSaving(false);
    }
  };

  const openRequest = base.specialistRequest && !base.specialistRequest.resolved;
  const displayIns = isEditing || onChangeDraft ? draft : base;
  const verificationStatus =
    displayIns.verificationStatus ?? getInsuranceVerificationStatus(displayIns);
  const needsVerificationWarning =
    verificationStatus === 'Missing' ||
    verificationStatus === 'Needs verification' ||
    displayIns.availabilityStatus === 'To be confirmed' ||
    displayIns.availabilityStatus === 'Not available';

  const outerClass = embedded
    ? 'pt-5 mt-5 border-t border-slate-200 space-y-4'
    : 'bg-white border border-slate-200 rounded-xl overflow-hidden';

  const headerClass = embedded
    ? 'w-full flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none'
    : 'w-full px-5 py-3.5 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none';

  const bodyClass = embedded ? 'space-y-4' : 'p-5 space-y-5';

  return (
    <section className={outerClass}>
      {/* Compact Header Toggle */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        className={headerClass}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-[#0F2942] shrink-0" />
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Medical Insurance Information
          </h3>
          <span
            className={`text-xs font-medium ${
              verificationStatus === 'Verified'
                ? 'text-emerald-700'
                : verificationStatus === 'Missing'
                  ? 'text-red-700'
                  : 'text-amber-700'
            }`}
          >
            · {verificationStatus}
          </span>
          {displayIns.providerName && (
            <span className="text-xs text-slate-500">({displayIns.providerName})</span>
          )}
          {openRequest && (
            <span className="text-xs font-semibold text-amber-800 inline-flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Specialist requested update
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span>{expanded ? 'Hide details' : 'Expand details'}</span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {expanded && (
        <div className={bodyClass}>
          {needsVerificationWarning && !readOnlyPatient && (
            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">
                  Insurance {verificationStatus === 'Missing' ? 'missing' : 'needs verification'}:{' '}
                </span>
                Confirm provider, plan type, or provincial health coverage notes so clinic intake can verify eligibility without delays.
              </div>
            </div>
          )}
          {/* Open Specialist Insurance Request Banner */}
          {openRequest && base.specialistRequest && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-1.5 text-xs">
              <div className="font-semibold text-amber-950 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  Specialist Requested Medical Insurance Clarification
                </span>
                <span className="font-mono text-amber-800 tabular-nums">
                  {base.specialistRequest.requestedAt}
                </span>
              </div>
              <p className="text-amber-900">{base.specialistRequest.requestedDetails}</p>
              <div className="text-amber-800">Reason: {base.specialistRequest.reason}</div>
              {role === 'physician' && onSaveInsurance && !isEditing && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(base);
                      setIsEditing(true);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-md"
                  >
                    Update Insurance Information Inline
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Resolved request acknowledgement */}
          {base.specialistRequest?.resolved && (
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                Specialist insurance request resolved on{' '}
                <span className="font-mono">{base.specialistRequest.resolvedAt}</span> by{' '}
                {base.specialistRequest.resolvedBy}.
              </span>
            </div>
          )}

          {/* Edit Mode OR Read-Only Summary */}
          {!readOnlyPatient && (isEditing || (editable && role === 'physician' && onChangeDraft)) ? (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Insurance Availability Status
                  </label>
                  <select
                    value={draft.availabilityStatus}
                    onChange={(e) => {
                      const nextAvail = e.target.value as InsuranceAvailabilityStatus;
                      const nextVerif: MedicalInsuranceInfo['verificationStatus'] =
                        nextAvail === 'Available and included'
                          ? 'Verified'
                          : nextAvail === 'Not available'
                            ? 'Missing'
                            : 'Needs verification';
                      const next: MedicalInsuranceInfo = {
                        ...draft,
                        availabilityStatus: nextAvail,
                        verificationStatus: nextVerif,
                      };
                      setDraft(next);
                      if (onChangeDraft) onChangeDraft(next);
                    }}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                  >
                    {AVAILABILITY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Insurance Verification Status
                  </label>
                  <select
                    value={draft.verificationStatus ?? getInsuranceVerificationStatus(draft)}
                    onChange={(e) =>
                      updateField(
                        'verificationStatus',
                        e.target.value as MedicalInsuranceInfo['verificationStatus']
                      )
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                  >
                    {VERIFICATION_OPTIONS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Coverage Category (Canadian Context)
                  </label>
                  <select
                    value={draft.coverageCategory}
                    onChange={(e) =>
                      updateField(
                        'coverageCategory',
                        e.target.value as MedicalInsuranceInfo['coverageCategory']
                      )
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                  >
                    {COVERAGE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Province / Territory Plan
                  </label>
                  <input
                    type="text"
                    value={draft.provinceOrJurisdiction ?? ''}
                    onChange={(e) => updateField('provinceOrJurisdiction', e.target.value)}
                    placeholder="e.g., Ontario (OHIP), BC (MSP), Alberta (AHCIP)"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Extended / Private Insurance Provider (if applicable)
                  </label>
                  <input
                    type="text"
                    value={draft.providerName}
                    onChange={(e) => updateField('providerName', e.target.value)}
                    placeholder="e.g., Sun Life, Manulife, Canada Life, Blue Cross (Demo)"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Plan or Coverage Type
                  </label>
                  <input
                    type="text"
                    value={draft.planType}
                    onChange={(e) => updateField('planType', e.target.value)}
                    placeholder="e.g., Employer Extended Health / Provincial Public"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Policy or Member ID (Optional / Masked in Shared Views)
                  </label>
                  <input
                    type="text"
                    value={draft.policyOrMemberId}
                    onChange={(e) => updateField('policyOrMemberId', e.target.value)}
                    placeholder="e.g., SL-884210-01"
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Coverage Details & Relevant Service Notes
                  </label>
                  <textarea
                    rows={2}
                    value={draft.coverageDetails}
                    onChange={(e) => updateField('coverageDetails', e.target.value)}
                    placeholder="Note public consultation coverage vs extended drug/imaging/device benefits..."
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Notes Related to Referral Services / Procedures
                  </label>
                  <input
                    type="text"
                    value={draft.referralServiceCoverageNotes}
                    onChange={(e) => updateField('referralServiceCoverageNotes', e.target.value)}
                    placeholder="e.g., Any prior authorization or special benefit confirmation needed..."
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Additional Insurance Notes
                  </label>
                  <textarea
                    rows={2}
                    value={draft.additionalNotes}
                    onChange={(e) => updateField('additionalNotes', e.target.value)}
                    placeholder="Reception verification notes, secondary group plan details, or patient card follow-up..."
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {onSaveInsurance && (
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(base);
                      setIsEditing(false);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg"
                  >
                    {saving ? 'Saving...' : 'Save Insurance Update'}
                  </button>
                </div>
              )}
            </form>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                <div>
                  <div className="text-slate-500">Availability Status</div>
                  <div className="font-semibold text-slate-900 mt-0.5">
                    {displayIns.availabilityStatus}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Coverage Category</div>
                  <div className="font-semibold text-slate-900 mt-0.5">
                    {displayIns.coverageCategory}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Jurisdiction / Public Plan</div>
                  <div className="font-medium text-slate-900 mt-0.5">
                    {displayIns.provinceOrJurisdiction || 'Not specified'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Provider & Plan Type</div>
                  <div className="font-medium text-slate-900 mt-0.5">
                    {displayIns.providerName || 'Not provided'}
                    {displayIns.planType ? ` · ${displayIns.planType}` : ''}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Policy / Member ID</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-slate-800">
                      {revealPolicyId
                        ? displayIns.policyOrMemberId || 'Not provided'
                        : maskIdentifier(displayIns.policyOrMemberId)}
                    </span>
                    {displayIns.policyOrMemberId && (
                      <button
                        type="button"
                        onClick={() => setRevealPolicyId((v) => !v)}
                        className="text-slate-500 hover:text-slate-900"
                        title={revealPolicyId ? 'Mask ID' : 'Reveal ID'}
                      >
                        {revealPolicyId ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Verification Status</div>
                  <div
                    className={`font-semibold mt-0.5 ${
                      verificationStatus === 'Verified'
                        ? 'text-emerald-700'
                        : verificationStatus === 'Missing'
                          ? 'text-red-700'
                          : 'text-amber-700'
                    }`}
                  >
                    {verificationStatus}
                  </div>
                </div>
              </div>

              {(displayIns.coverageDetails ||
                displayIns.referralServiceCoverageNotes ||
                displayIns.additionalNotes) && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                  {displayIns.coverageDetails && (
                    <div className="text-slate-700">
                      <span className="font-semibold text-slate-900">Coverage Details: </span>
                      {displayIns.coverageDetails}
                    </div>
                  )}
                  {displayIns.referralServiceCoverageNotes && (
                    <div className="text-slate-700">
                      <span className="font-semibold text-slate-900">Referral Service Notes: </span>
                      {displayIns.referralServiceCoverageNotes}
                    </div>
                  )}
                  {displayIns.additionalNotes && (
                    <div className="text-slate-700">
                      <span className="font-semibold text-slate-900">Additional Insurance Notes: </span>
                      {displayIns.additionalNotes}
                    </div>
                  )}
                </div>
              )}

              {/* Action Toolbar */}
              {!readOnlyPatient && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {role === 'physician' && onSaveInsurance && (
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(base);
                        setIsEditing(true);
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-[#0F2942] bg-slate-100 hover:bg-slate-200 rounded-lg"
                    >
                      Edit Insurance Details
                    </button>
                  )}

                  {role === 'specialist' && onRequestInsuranceInfo && (
                    <button
                      type="button"
                      onClick={() => setShowRequestForm((v) => !v)}
                      className="px-3 py-1.5 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg"
                    >
                      Request Insurance Information
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleRunAssessment()}
                    disabled={isAssessing}
                    className="px-3 py-1.5 text-xs font-medium text-teal-900 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg inline-flex items-center gap-1.5"
                  >
                    {isAssessing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {assessment ? 'Refresh AI Insurance Assessment' : 'Run AI Insurance Assessment'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Specialist Request Insurance Form */}
          {showRequestForm && role === 'specialist' && (
            <form
              onSubmit={handleSpecialistRequestSubmit}
              className="p-4 bg-amber-50/70 border border-amber-200 rounded-lg space-y-3"
            >
              <div className="text-xs font-semibold text-amber-950">
                Request Insurance / Coverage Clarification from Family Physician
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Requested Information
                </label>
                <input
                  type="text"
                  required
                  value={reqDetails}
                  onChange={(e) => setReqDetails(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Administrative / Intake Reason
                </label>
                <input
                  type="text"
                  required
                  value={reqReason}
                  onChange={(e) => setReqReason(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRequestForm(false)}
                  className="px-3 py-1 text-xs text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg"
                >
                  Send Insurance Request
                </button>
              </div>
            </form>
          )}

          {/* Run Assessment Button when in wizard draft mode */}
          {!readOnlyPatient && (isEditing || (editable && role === 'physician' && onChangeDraft)) && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => void handleRunAssessment()}
                disabled={isAssessing}
                className="px-3 py-1.5 text-xs font-medium text-teal-900 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg inline-flex items-center gap-1.5"
              >
                {isAssessing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>Evaluate Insurance Readiness with AI</span>
              </button>
            </div>
          )}

          {/* AI Insurance Assessment Output */}
          {assessment && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-700" />
                  <span className="text-xs font-semibold text-slate-900">
                    AI Insurance Efficiency Assessment ({assessment.sufficiencyStatus})
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  {assessment.engineMode === 'gemini' ? 'Gemini AI' : 'Canadian Rules Engine'}
                </span>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed">{assessment.summary}</p>

              <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 leading-relaxed">
                <strong className="text-slate-900">Canadian Coverage Context: </strong>
                {assessment.canadianHealthcareContextNote}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1.5">
                  <div className="font-semibold text-slate-900">Missing Details & Prior Auth</div>
                  {assessment.missingDetails.length > 0 ? (
                    <ul className="list-disc list-inside text-amber-800 space-y-0.5">
                      {assessment.missingDetails.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-emerald-700">No missing intake insurance fields detected.</div>
                  )}
                  {assessment.priorAuthorizationFlags.length > 0 && (
                    <ul className="list-disc list-inside text-slate-600 pt-1 border-t border-slate-100 space-y-0.5">
                      {assessment.priorAuthorizationFlags.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1.5">
                  <div className="font-semibold text-slate-900">
                    Recommended Verification & Remaining Confirmations
                  </div>
                  <ul className="list-disc list-inside text-slate-700 space-y-0.5">
                    {assessment.recommendedVerificationSteps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                  {assessment.remainingConfirmations.length > 0 && (
                    <ul className="list-disc list-inside text-slate-500 pt-1 border-t border-slate-100 space-y-0.5">
                      {assessment.remainingConfirmations.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Explicit 5-Stage Lifecycle Separation */}
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-slate-600">
                  5-Stage Healthcare Insurance Lifecycle Separation
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                  {assessment.workflowStages.map((st) => (
                    <div
                      key={st.stage}
                      className="p-2.5 bg-white border border-slate-200 rounded-lg text-[11px] space-y-1"
                    >
                      <div className="font-semibold text-slate-900 leading-tight">{st.stage}</div>
                      <div
                        className={`font-medium ${
                          st.status === 'Completed'
                            ? 'text-emerald-700'
                            : st.status === 'Needs Review' || st.status === 'Action Recommended'
                              ? 'text-amber-700'
                              : 'text-slate-500'
                        }`}
                      >
                        {st.status}
                      </div>
                      <div className="text-slate-600 leading-snug">{st.summary}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-[11px] text-slate-500 italic">{assessment.disclaimer}</div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
