import React, { useMemo, useState } from 'react';
import { CalendarCheck, Eye, FileText, Search, ShieldCheck, User } from 'lucide-react';
import { StatusIndicator } from '../../components/StatusIndicator';
import { useClinBridge } from '../../context/ClinBridgeContext';
import type { Referral, UploadedDocument } from '../../types/clinbridge';
import { isConfidentialityUnlocked } from '../../utils/privacyProjection';

export const SpecialistPatientsPage: React.FC = () => {
  const { referrals, settings, openSpecialistReview } = useClinBridge();
  const [search, setSearch] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<UploadedDocument | null>(null);

  const authorizedReferrals = useMemo(() => {
    const unlockedSubmitted = referrals.filter(
      (r) =>
        r.status !== 'Draft' &&
        r.status !== 'Ready for submission' &&
        r.status !== 'Awaiting Specialist Selection' &&
        Boolean(r.specialistId) &&
        isConfidentialityUnlocked(r)
    );
    if (settings.specialistProfileId === 'all') return unlockedSubmitted;
    return unlockedSubmitted.filter((r) => r.specialistId === settings.specialistProfileId);
  }, [referrals, settings.specialistProfileId]);

  const patientRecords = useMemo(() => {
    const map = new Map<
      string,
      {
        patient: Referral['patient'];
        referrals: Referral[];
      }
    >();

    authorizedReferrals.forEach((r) => {
      const existing = map.get(r.patient.id);
      if (existing) {
        existing.referrals.push(r);
      } else {
        map.set(r.patient.id, { patient: r.patient, referrals: [r] });
      }
    });

    const q = search.trim().toLowerCase();
    return Array.from(map.values()).filter(
      (entry) =>
        !q ||
        entry.patient.name.toLowerCase().includes(q) ||
        entry.patient.id.toLowerCase().includes(q) ||
        entry.referrals.some((r) => r.id.toLowerCase().includes(q))
    );
  }, [authorizedReferrals, search]);

  const activePatient =
    patientRecords.find((p) => p.patient.id === selectedPatientId) ??
    patientRecords[0] ??
    null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Clinic Patient Records
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Only patients whose referrals have passed Stage 2 Specialist Confidentiality Agreement unlock appear in identifiable clinic records.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg self-start">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          Stage 2 Confidentiality Verified
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 4 cols: Patient Search & List */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-3.5 border-b border-slate-100">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search unlocked patient name or ID..."
                aria-label="Search clinic patients"
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#0F2942]"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {patientRecords.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                No confidentiality-unlocked patient records in this queue yet.
              </div>
            ) : (
              patientRecords.map(({ patient, referrals: refs }) => {
                const isSelected = activePatient?.patient.id === patient.id;
                const latest = refs[0];
                return (
                  <button
                    key={patient.id}
                    type="button"
                    onClick={() => {
                      setSelectedPatientId(patient.id);
                      setPreviewDoc(null);
                    }}
                    className={`w-full text-left p-4 transition-colors block ${
                      isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-slate-900">
                        {patient.name}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                        {patient.id}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      DOB {patient.dob} · {refs.length} referral{refs.length === 1 ? '' : 's'}
                    </div>
                    <div className="mt-2">
                      <StatusIndicator status={latest.status} />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right 8 cols: Authorized Patient Detail */}
        <div className="lg:col-span-8 space-y-6">
          {!activePatient ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
              Select a confidentiality-unlocked patient to view authorized referral records.
            </div>
          ) : (
            <>
              <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-[#0F2942]">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-display text-xl font-bold text-slate-900">
                        {activePatient.patient.name}
                      </h2>
                      <div className="text-xs text-slate-500 font-mono">
                        {activePatient.patient.id} · DOB {activePatient.patient.dob} ·{' '}
                        {activePatient.patient.phone}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Relevant Medical Background (From Referral Records)
                  </div>
                  <p className="text-sm text-slate-800 mt-1">
                    {activePatient.patient.medicalBackground}
                  </p>
                </div>
              </section>

              {/* Referral History & Upcoming / Completed */}
              <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    Authorized Referral History ({activePatient.referrals.length})
                  </h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {activePatient.referrals.map((ref) => (
                    <div key={ref.id} className="p-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="font-mono font-semibold text-slate-900">
                              {ref.id}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{ref.specialty}</span>
                            <span aria-hidden="true">·</span>
                            <span>Referred {ref.referralDate}</span>
                          </div>
                          <div className="text-sm font-semibold text-slate-900 mt-1">
                            {ref.clinicalInput.reasonForReferral}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusIndicator status={ref.status} />
                          <button
                            type="button"
                            onClick={() => openSpecialistReview(ref.id)}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg"
                          >
                            Open Review
                          </button>
                        </div>
                      </div>

                      {ref.confirmedAppointment && (
                        <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-lg text-xs text-teal-900 flex items-center gap-2">
                          <CalendarCheck className="w-4 h-4 text-teal-700 shrink-0" />
                          <span>
                            {ref.status === 'Completed' ? 'Completed Visit' : 'Upcoming Appointment'}:{' '}
                            <strong>
                              {ref.confirmedAppointment.mode ?? 'In-Person'} ·{' '}
                              {ref.confirmedAppointment.date} at {ref.confirmedAppointment.time}
                            </strong>{' '}
                            — {ref.confirmedAppointment.location}
                          </span>
                        </div>
                      )}

                      {/* Supporting Documents */}
                      {ref.documents.length > 0 && (
                        <div className="pt-1 space-y-2">
                          <div className="text-xs font-medium text-slate-500">
                            Associated Documentation ({ref.documents.length})
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {ref.documents.map((doc) => (
                              <button
                                key={doc.id}
                                type="button"
                                onClick={() =>
                                  setPreviewDoc((curr) => (curr?.id === doc.id ? null : doc))
                                }
                                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg inline-flex items-center gap-1.5 text-slate-700"
                              >
                                <FileText className="w-3.5 h-3.5 text-slate-400" />
                                <span>{doc.name}</span>
                                <Eye className="w-3 h-3 text-[#0F2942]" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {previewDoc && (
                <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold text-slate-900">
                      Document Preview: {previewDoc.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreviewDoc(null)}
                      className="text-xs text-slate-500 hover:text-slate-900"
                    >
                      Close
                    </button>
                  </div>
                  <pre className="text-xs text-slate-700 bg-slate-50 p-3.5 rounded-lg border border-slate-100 whitespace-pre-wrap font-sans leading-relaxed">
                    {previewDoc.contentText}
                  </pre>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
