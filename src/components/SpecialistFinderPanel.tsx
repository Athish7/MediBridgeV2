import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  MapPin,
  Sparkles,
} from 'lucide-react';
import type {
  ClinicalInput,
  ConsultationNotesBundle,
  PatientInfo,
  Specialist,
  SpecialistRecommendationBundle,
  UploadedDocument,
} from '../types/clinbridge';
import {
  hasSufficientClinicalInfoForMatching,
  recommendSpecialistsDeterministic,
} from '../utils/specialistMatcher';

interface SpecialistFinderPanelProps {
  patient: PatientInfo;
  clinical: ClinicalInput;
  consultationNotes?: ConsultationNotesBundle;
  documents: UploadedDocument[];
  specialists: Specialist[];
  selectedSpecialistId: string;
  initialBundle?: SpecialistRecommendationBundle;
  currentSpecialtyHint?: string;
  onSelectSpecialist: (
    specialistId: string,
    bundle: SpecialistRecommendationBundle
  ) => void;
  onBundleGenerated?: (bundle: SpecialistRecommendationBundle) => void;
  disabledSelection?: boolean;
}

export const SpecialistFinderPanel: React.FC<SpecialistFinderPanelProps> = ({
  patient,
  clinical,
  consultationNotes,
  documents,
  specialists,
  selectedSpecialistId,
  initialBundle,
  currentSpecialtyHint,
  onSelectSpecialist,
  onBundleGenerated,
  disabledSelection = false,
}) => {
  const [bundle, setBundle] = useState<SpecialistRecommendationBundle | undefined>(
    initialBundle
  );
  const [priorityPref, setPriorityPref] = useState<
    'balanced' | 'fastest-wait' | 'closest-location'
  >('balanced');
  const [locationPref, setLocationPref] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [pendingSpecialistId, setPendingSpecialistId] = useState<string | null>(null);

  const sufficiency = useMemo(
    () => hasSufficientClinicalInfoForMatching(clinical, consultationNotes, documents),
    [clinical, consultationNotes, documents]
  );

  const pendingSpecialist = useMemo(
    () => specialists.find((s) => s.id === pendingSpecialistId) ?? null,
    [specialists, pendingSpecialistId]
  );

  const handleFindSpecialists = async () => {
    if (!sufficiency.sufficient) return;
    setIsSearching(true);
    setPendingSpecialistId(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 4500);

    let nextBundle: SpecialistRecommendationBundle;
    try {
      const res = await fetch('/api/specialists/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          patient,
          clinical,
          consultationNotes,
          documents,
          specialists,
          currentSpecialtyHint,
          locationPreference: locationPref,
          priorityPreference: priorityPref,
        }),
      }).catch(() => null);

      if (res && res.ok) {
        nextBundle = (await res.json()) as SpecialistRecommendationBundle;
      } else {
        nextBundle = recommendSpecialistsDeterministic({
          patient,
          clinical,
          consultationNotes,
          documents,
          specialists,
          currentSpecialtyHint,
          locationPreference: locationPref,
          priorityPreference: priorityPref,
        });
      }
    } finally {
      window.clearTimeout(timeoutId);
    }

    setBundle(nextBundle);
    onBundleGenerated?.(nextBundle);
    setIsSearching(false);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-700 shrink-0" />
            <h3 className="font-display text-base font-semibold text-slate-900">
              AI Specialist Matching & Clinic Comparison
            </h3>
          </div>
          <p className="text-xs text-slate-600 mt-0.5">
            Analyzes physician-written notes, AI consultation notes, symptoms, history, prior treatments, and uploaded reports against our fictional specialist directory.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <select
            value={priorityPref}
            onChange={(e) =>
              setPriorityPref(
                e.target.value as 'balanced' | 'fastest-wait' | 'closest-location'
              )
            }
            aria-label="Recommendation priority"
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-[#0F2942]"
          >
            <option value="balanced">Balanced Clinical & Intake Fit</option>
            <option value="fastest-wait">Prioritize Shorter Simulated Wait</option>
            <option value="closest-location">Prioritize Closer Simulated Distance</option>
          </select>

          <input
            type="text"
            value={locationPref}
            onChange={(e) => setLocationPref(e.target.value)}
            placeholder="Location pref (e.g., Midtown, Downtown)..."
            aria-label="Preferred clinic area"
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 w-52 focus:outline-none focus:bg-white focus:border-[#0F2942]"
          />

          <button
            type="button"
            disabled={!sufficiency.sufficient || isSearching}
            onClick={() => void handleFindSpecialists()}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0F2942] hover:bg-[#173A5C] disabled:opacity-45 disabled:cursor-not-allowed rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            {isSearching ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Matching Specialists...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-teal-300" />
                <span>AI Find Specialist</span>
              </>
            )}
          </button>
        </div>
      </div>

      {!sufficiency.sufficient && (
        <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-lg flex items-start gap-2.5 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <span>{sufficiency.summary}</span>
        </div>
      )}

      {bundle && (
        <div className="space-y-4">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-700">
            <div>
              <span className="font-semibold text-slate-900">
                Matched Specialty Focus: {bundle.inferredSpecialty}
              </span>
              <span className="mx-1.5 text-slate-400">·</span>
              <span>{bundle.clinicalBasisSummary}</span>
            </div>
            <span className="font-mono text-[11px] text-slate-500 shrink-0">
              Engine: {bundle.engineMode === 'gemini' ? 'Gemini AI' : 'Local Matching Rules'}
            </span>
          </div>

          <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-lg flex items-start gap-2 text-xs text-amber-900">
            <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>
              <strong>Simulated Demo Data:</strong> {bundle.disclaimer}
            </span>
          </div>

          {/* Explicit Confirmation Step Banner */}
          {pendingSpecialist && (
            <div className="p-4 bg-teal-50/90 border border-teal-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5 text-xs">
                <div className="font-semibold text-teal-950 text-sm">
                  Confirm Specialist Selection: {pendingSpecialist.name}, {pendingSpecialist.credentials}
                </div>
                <div className="text-teal-900">
                  {pendingSpecialist.specialty} · {pendingSpecialist.clinic} ({pendingSpecialist.location}) ·{' '}
                  {pendingSpecialist.estimatedWait}
                </div>
                <div className="text-teal-800">
                  Confirming updates this referral’s receiving specialist destination without automatically submitting the referral.
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setPendingSpecialistId(null)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSelectSpecialist(pendingSpecialist.id, bundle);
                    setPendingSpecialistId(null);
                  }}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg inline-flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirm Selected Specialist</span>
                </button>
              </div>
            </div>
          )}

          {/* Side-by-Side Comparison Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {bundle.recommendations.map((rec, idx) => {
              const sp = specialists.find((s) => s.id === rec.specialistId);
              if (!sp) return null;
              const isConfirmedCurrent = sp.id === selectedSpecialistId;
              const isPendingConfirm = sp.id === pendingSpecialistId;

              return (
                <div
                  key={sp.id}
                  className={`rounded-xl border p-4 flex flex-col justify-between gap-4 transition-colors ${
                    isPendingConfirm
                      ? 'border-teal-600 bg-teal-50/30 ring-1 ring-teal-600'
                      : isConfirmedCurrent
                        ? 'border-[#0F2942] bg-slate-50/60 ring-1 ring-[#0F2942]'
                        : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 text-[11px] font-semibold">
                          <span className="font-mono text-slate-500">#{idx + 1}</span>
                          <span
                            className={
                              rec.suitabilityLevel === 'Strong alignment'
                                ? 'text-teal-700'
                                : rec.suitabilityLevel === 'Good alignment'
                                  ? 'text-sky-700'
                                  : 'text-slate-600'
                            }
                          >
                            {rec.suitabilityLevel}
                          </span>
                        </div>
                        <h4 className="font-display text-base font-semibold text-slate-900 mt-0.5">
                          {sp.name}, {sp.credentials}
                        </h4>
                        <div className="text-xs text-teal-800 font-medium">
                          {sp.specialty} · {sp.subspecialties.slice(0, 2).join(', ')}
                        </div>
                      </div>
                      {isConfirmedCurrent && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F2942] shrink-0">
                          <CheckCircle2 className="w-4 h-4 text-teal-700" />
                          <span>Assigned</span>
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 text-xs text-slate-600 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{sp.clinic}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          {sp.location}
                          {sp.distanceLabel ? ` · ${sp.distanceLabel}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 font-mono text-slate-800 font-medium">
                        <Clock className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                        <span>Simulated wait: {sp.estimatedWait}</span>
                      </div>
                    </div>

                    <div className="text-xs text-slate-700 leading-relaxed bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                      {rec.suitabilitySummary}
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div className="font-semibold text-slate-800">
                        Why recommended from referral notes:
                      </div>
                      <ul className="space-y-1 text-slate-600 list-disc list-inside">
                        {rec.supportingReasons.map((reason, rIdx) => (
                          <li key={rIdx} className="leading-relaxed">
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
                      <div className="font-semibold text-slate-800">
                        Clinic Intake Documentation Check:
                      </div>
                      {rec.availableRequirements.length > 0 && (
                        <div className="text-emerald-800">
                          ✓ Ready ({rec.availableRequirements.length}):{' '}
                          <span className="text-slate-700">
                            {rec.availableRequirements.join('; ')}
                          </span>
                        </div>
                      )}
                      {rec.neededRequirements.length > 0 ? (
                        <div className="text-amber-800">
                          ! Still needed ({rec.neededRequirements.length}):{' '}
                          <span className="text-slate-700">
                            {rec.neededRequirements.join('; ')}
                          </span>
                        </div>
                      ) : (
                        <div className="text-teal-800 font-medium">
                          All clinic intake requirements detected in current packet.
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={disabledSelection || isConfirmedCurrent}
                    onClick={() => setPendingSpecialistId(sp.id)}
                    className={`w-full py-2 px-3 text-xs font-semibold rounded-lg transition-colors ${
                      isConfirmedCurrent
                        ? 'bg-teal-50 text-teal-900 border border-teal-200 cursor-default'
                        : isPendingConfirm
                          ? 'bg-teal-700 text-white'
                          : 'bg-[#0F2942] hover:bg-[#173A5C] text-white disabled:opacity-45'
                    }`}
                  >
                    {isConfirmedCurrent
                      ? 'Currently Assigned Specialist'
                      : isPendingConfirm
                        ? 'Selected — Confirm Above'
                        : `Select ${sp.name}`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
