import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_PHYSICIAN_CONTACT,
  DEFAULT_SETTINGS,
  SEED_NOTIFICATIONS,
  SEED_REFERRALS,
  SEED_SPECIALISTS,
} from '../data/seedData';
import type {
  AppNotification,
  ClarificationEntry,
  ConfirmedAppointment,
  DeclineReasonCategory,
  MedicalInsuranceInfo,
  NavSection,
  Perspective,
  Referral,
  ReferralMessage,
  ReferralStatus,
  Specialist,
  SpecialistRecommendationBundle,
  TimelineEvent,
  UploadedDocument,
  UserSettings,
} from '../types/clinbridge';
import { createDefaultInsuranceInfo, getInsuranceVerificationStatus } from '../utils/insuranceAdvisor';
import {
  CONFIDENTIALITY_AGREEMENT_TEXT,
  createAuditEntry,
  getSpecialistProfessionalId,
  isConfidentialityUnlocked,
  normalizeReferralStatus,
} from '../utils/privacyProjection';
import { analyzeReferralDeterministic } from '../utils/referralAnalyzer';

const STORAGE_KEYS = {
  referrals: 'medibridge_referrals_v5',
  notifications: 'medibridge_notifications_v5',
  settings: 'medibridge_settings_v1',
};

function cloneSeedReferrals(): Referral[] {
  return JSON.parse(JSON.stringify(SEED_REFERRALS)) as Referral[];
}

function cloneSeedNotifications(): AppNotification[] {
  return JSON.parse(JSON.stringify(SEED_NOTIFICATIONS)) as AppNotification[];
}

interface ClinBridgeContextValue {
  referrals: Referral[];
  specialists: Specialist[];
  notifications: AppNotification[];
  settings: UserSettings;
  perspective: Perspective;
  switchPerspective: (p: Perspective) => void;
  activeSection: NavSection;
  setActiveSection: (section: NavSection) => void;
  selectedReferralId: string | null;
  openReferralRecord: (id: string) => void;
  closeReferralRecord: () => void;
  specialistReviewReferralId: string | null;
  openSpecialistReview: (id: string) => void;
  preselectedSpecialistId: string | null;
  editingDraftId: string | null;
  startNewReferral: (opts?: { specialistId?: string; draftId?: string }) => void;
  patientPortalReferralId: string;
  setPatientPortalReferralId: (id: string) => void;
  globalSearchQuery: string;
  setGlobalSearchQuery: (q: string) => void;
  referralFilterStatus: string;
  setReferralFilterStatus: (s: string) => void;
  addReferral: (referral: Referral) => void;
  updateReferral: (id: string, updater: (prev: Referral) => Referral) => void;
  simulateStatusTransition: (
    id: string,
    newStatus: ReferralStatus,
    note?: string,
    appointment?: ConfirmedAppointment
  ) => void;
  markAnonymousReviewed: (id: string, specialistId: string) => Promise<void>;
  acceptConfidentialityAndUnlock: (
    id: string,
    payload: {
      specialistId: string;
      specialistName?: string;
      professionalId?: string;
      accepted: boolean;
    }
  ) => Promise<{ ok: boolean; error?: string; referral?: Referral }>;
  acceptReferral: (id: string, note?: string) => Promise<void>;
  requestClarification: (
    id: string,
    payload: { missingInformation: string; reason: string; notes: string }
  ) => void;
  respondToClarification: (
    id: string,
    payload: {
      clarificationId: string;
      responseText: string;
      attachedDoc?: UploadedDocument;
    }
  ) => void;
  sendReferralMessage: (
    id: string,
    payload: {
      senderRole: 'physician' | 'specialist';
      subject?: string;
      content: string;
    }
  ) => void;
  markReferralMessagesRead: (id: string, viewerRole: 'physician' | 'specialist') => void;
  declineReferral: (
    id: string,
    payload: { reasonCategory: DeclineReasonCategory; notes: string }
  ) => Promise<void>;
  confirmReferralAppointment: (
    id: string,
    appointment: ConfirmedAppointment,
    isUpdate?: boolean
  ) => void;
  cancelReferralAppointment: (id: string, reason: string) => void;
  requestInsuranceInfo: (
    id: string,
    payload: { requestedDetails: string; reason: string }
  ) => Promise<void>;
  updateInsuranceInfo: (id: string, insurance: MedicalInsuranceInfo) => Promise<void>;
  proposeEConsultation: (
    id: string,
    payload: {
      proposedDate: string;
      proposedTime: string;
      consultationReason: string;
      specialistMessage: string;
      isEConsultation: boolean;
    }
  ) => Promise<void>;
  respondEConsultation: (
    id: string,
    payload: {
      decision: 'Accept' | 'Reschedule' | 'Decline';
      suggestedDate?: string;
      suggestedTime?: string;
      message?: string;
      declineReason?: string;
    }
  ) => Promise<void>;
  respondToRescheduleRequest: (
    id: string,
    payload: {
      action: 'AcceptSuggested' | 'CounterPropose';
      proposedDate?: string;
      proposedTime?: string;
      specialistMessage?: string;
    }
  ) => Promise<void>;
  sendEConsultationMessage: (
    id: string,
    senderRole: 'specialist' | 'patient',
    content: string
  ) => Promise<void>;
  markEConsultMessagesRead: (id: string, viewerRole: 'specialist' | 'patient') => void;
  markNotificationRead: (id: string) => void;
  dismissNotification: (id: string) => void;
  markAllNotificationsRead: () => void;
  addNotification: (notif: Omit<AppNotification, 'id' | 'read'>) => void;
  markDocumentsComplete: (id: string) => { ok: boolean; unresolvedItems: string[] };
  recordChecklistException: (id: string, checklistItemId: string, reason: string) => void;
  selectReferralSpecialist: (
    id: string,
    specialistId: string,
    recommendationBundle?: SpecialistRecommendationBundle
  ) => void;
  updateSettings: (partial: Partial<UserSettings>) => void;
  resetDemoData: () => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

const ClinBridgeContext = createContext<ClinBridgeContextValue | null>(null);

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeReferral(ref: Referral): Referral {
  const seedMatch = SEED_REFERRALS.find((s) => s.id === ref.id);
    const mergedInsurance = ref.insurance ?? seedMatch?.insurance ?? createDefaultInsuranceInfo();
    return {
    ...ref,
    status: normalizeReferralStatus(ref.status),
    urgency: ref.urgency ?? seedMatch?.urgency ?? 'Routine',
    referringPhysicianContact: ref.referringPhysicianContact ?? {
      ...DEFAULT_PHYSICIAN_CONTACT,
      physicianName:
        ref.referringPhysician.split(',')[0] || DEFAULT_PHYSICIAN_CONTACT.physicianName,
      clinicName: ref.referringClinic || DEFAULT_PHYSICIAN_CONTACT.clinicName,
    },
    consultationNotes: ref.consultationNotes ?? seedMatch?.consultationNotes,
    communications: ref.communications ?? seedMatch?.communications ?? [],
    insurance: {
      ...mergedInsurance,
      verificationStatus:
        mergedInsurance.verificationStatus ?? getInsuranceVerificationStatus(mergedInsurance),
    },
    confidentialityAcknowledgement:
      ref.confidentialityAcknowledgement ?? seedMatch?.confidentialityAcknowledgement,
    auditLog: ref.auditLog ?? seedMatch?.auditLog ?? [],
    eConsultation: ref.eConsultation ?? seedMatch?.eConsultation,
  };
}

function nowFormatted(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function pickInitialSpecialistReviewId(list: Referral[]): string {
  return (
    list.find(
      (r) =>
        r.status !== 'Draft' &&
        r.status !== 'Ready for submission' &&
        r.status !== 'Awaiting Specialist Selection' &&
        !isConfidentialityUnlocked(r)
    )?.id ??
    list.find(
      (r) =>
        r.status !== 'Draft' &&
        r.status !== 'Ready for submission' &&
        r.status !== 'Awaiting Specialist Selection'
    )?.id ??
    list[0]?.id ??
    ''
  );
}

function pickInitialPatientPortalId(list: Referral[]): string {
  return (
    list.find((r) => r.status === 'E-Consultation Awaiting Patient Approval')?.id ??
    list.find((r) => r.status === 'Reschedule Requested')?.id ??
    list.find((r) => r.status === 'E-Consultation Confirmed' || r.status === 'Appointment Confirmed')
      ?.id ??
    list[0]?.id ??
    ''
  );
}

export const ClinBridgeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [referrals, setReferrals] = useState<Referral[]>(() => {
    const stored = loadFromStorage<Referral[]>(STORAGE_KEYS.referrals, cloneSeedReferrals());
    const list = stored.length > 0 ? stored : cloneSeedReferrals();
    return list.map(normalizeReferral);
  });

  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    loadFromStorage<AppNotification[]>(STORAGE_KEYS.notifications, cloneSeedNotifications())
  );

  const [settings, setSettings] = useState<UserSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...loadFromStorage<Partial<UserSettings>>(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
  }));

  const [activeSection, setActiveSectionState] = useState<NavSection>('dashboard');
  const [selectedReferralId, setSelectedReferralId] = useState<string | null>(null);
  const [specialistReviewReferralId, setSpecialistReviewReferralId] = useState<string | null>(() =>
    pickInitialSpecialistReviewId(SEED_REFERRALS)
  );
  const [preselectedSpecialistId, setPreselectedSpecialistId] = useState<string | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [patientPortalReferralId, setPatientPortalReferralId] = useState<string>(() =>
    pickInitialPatientPortalId(SEED_REFERRALS)
  );
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [referralFilterStatus, setReferralFilterStatus] = useState('All');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const perspective: Perspective = activeSection.startsWith('specialist-')
    ? 'specialist'
    : activeSection === 'patient-portal'
      ? 'patient'
      : 'physician';

  const hasSyncedInitial = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.referrals, JSON.stringify(referrals));
    } catch {
      // ignore storage quota errors
    }
    // Keep authoritative Express store synchronized with client referral edits/creations
    const payload = referrals;
    void fetch('/api/referrals/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referrals: payload }),
    }).catch(() => {
      // ignore offline sync failure during background update
    });
    hasSyncedInitial.current = true;
  }, [referrals]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.notifications, JSON.stringify(notifications));
    } catch {
      // ignore storage quota errors
    }
  }, [notifications]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    } catch {
      // ignore storage quota errors
    }
  }, [settings]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3600);
  }, []);

  const switchPerspective = (p: Perspective) => {
    setSelectedReferralId(null);
    if (p === 'physician') {
      setActiveSectionState('dashboard');
    } else if (p === 'specialist') {
      setActiveSectionState('specialist-dashboard');
    } else {
      setActiveSectionState('patient-portal');
    }
  };

  const setActiveSection = (section: NavSection) => {
    setSelectedReferralId(null);
    if (section !== 'new-referral') {
      setEditingDraftId(null);
    }
    setActiveSectionState(section);
  };

  const openReferralRecord = (id: string) => {
    setSelectedReferralId(id);
    setActiveSectionState('referrals');
  };

  const closeReferralRecord = () => {
    setSelectedReferralId(null);
  };

  const openSpecialistReview = (id: string) => {
    setSpecialistReviewReferralId(id);
    setActiveSectionState('specialist-review');
  };

  const startNewReferral = (opts?: { specialistId?: string; draftId?: string }) => {
    setSelectedReferralId(null);
    setPreselectedSpecialistId(opts?.specialistId ?? null);
    setEditingDraftId(opts?.draftId ?? null);
    setActiveSectionState('new-referral');
  };

  const addNotification = useCallback((notif: Omit<AppNotification, 'id' | 'read'>) => {
    const entry: AppNotification = {
      ...notif,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      read: false,
    };
    setNotifications((prev) => [entry, ...prev]);
  }, []);

  const addReferral = (referral: Referral) => {
    const normalized = normalizeReferral(referral);
    setReferrals((prev) => {
      const exists = prev.some((r) => r.id === normalized.id);
      if (exists) {
        return prev.map((r) => (r.id === normalized.id ? normalized : r));
      }
      return [normalized, ...prev];
    });
    setPatientPortalReferralId(normalized.id);
    if (normalized.status !== 'Draft') {
      setSpecialistReviewReferralId(normalized.id);
    }
  };

  const updateReferral = useCallback((id: string, updater: (prev: Referral) => Referral) => {
    setReferrals((prev) => prev.map((r) => (r.id === id ? updater(r) : r)));
  }, []);

  const simulateStatusTransition = (
    id: string,
    newStatusRaw: ReferralStatus,
    note?: string,
    appointment?: ConfirmedAppointment
  ) => {
    const newStatus = normalizeReferralStatus(newStatusRaw);
    const target = referrals.find((r) => r.id === id);
    if (!target) return;

    const stageMap: Partial<Record<ReferralStatus, TimelineEvent['stage']>> = {
      Draft: 'initiated',
      'Awaiting Specialist Selection': 'organized',
      'Ready for submission': 'reviewed',
      Submitted: 'submitted',
      'Awaiting Specialist Review': 'reviewed',
      'Anonymous Information Reviewed': 'privacy',
      'Confidentiality Agreement Accepted': 'privacy',
      'Full Information Unlocked': 'privacy',
      'Awaiting Specialist Decision': 'reviewed',
      Accepted: 'accepted',
      'Additional Information Requested': 'clarification',
      Declined: 'declined',
      'Appointment Proposed': 'econsult',
      'E-Consultation Awaiting Patient Approval': 'econsult',
      'Reschedule Requested': 'econsult',
      'E-Consultation Confirmed': 'confirmed',
      'Appointment Confirmed': 'confirmed',
      Completed: 'completed',
    };

    const nextStepsMap: Partial<Record<ReferralStatus, string>> = {
      Draft: 'Your family physician is preparing your referral documentation.',
      'Awaiting Specialist Selection':
        'Your family physician has prepared your clinical summary and is selecting an appropriate specialist clinic for your referral.',
      'Ready for submission': 'Your referral documentation is verified and ready for transmission.',
      Submitted: `Your referral has been submitted to ${target.receivingClinic}. Their intake team will review it shortly.`,
      'Awaiting Specialist Review': `${target.receivingClinic} has verified intake records and queued your referral for ${target.specialistName}.`,
      'Anonymous Information Reviewed': `${target.receivingClinic} is reviewing your non-identifying clinical triage summary prior to unlocking your full profile.`,
      'Confidentiality Agreement Accepted': `${target.specialistName} accepted confidentiality protections for your referral.`,
      'Full Information Unlocked': `${target.specialistName} has unlocked your full referral packet for clinical decision.`,
      'Awaiting Specialist Decision': `${target.specialistName} has reviewed your full referral and is making an intake decision.`,
      Accepted: `${target.specialistName} has accepted your referral. Clinic scheduling will contact you with an appointment slot.`,
      'Additional Information Requested': `${target.receivingClinic} requested additional information from your family physician’s office. No action is needed from you right now.`,
      Declined: `Your family physician is reviewing alternative specialist coordination options for your referral.`,
      'Appointment Proposed': `${target.receivingClinic} has proposed a consultation slot for your review.`,
      'E-Consultation Awaiting Patient Approval': `${target.specialistName} invited you to an online E-Consultation. Please accept or request a reschedule in your Patient Portal.`,
      'Reschedule Requested': `Your reschedule request has been sent to ${target.specialistName}’s office. Awaiting specialist confirmation.`,
      'E-Consultation Confirmed': appointment
        ? `Your online E-Consultation with ${target.specialistName} is confirmed for ${appointment.date} at ${appointment.time}.`
        : `Your online E-Consultation with ${target.specialistName} has been confirmed.`,
      'Appointment Confirmed': appointment
        ? `Your consultation with ${target.specialistName} is confirmed for ${appointment.date} at ${appointment.time}.`
        : `Your appointment with ${target.specialistName} has been confirmed.`,
      Completed: `Your specialist consultation with ${target.specialistName} is complete. Follow-up summary has been returned to your family physician.`,
    };

    const newEvent: TimelineEvent = {
      id: `tl-${Date.now()}`,
      title: `Status updated: ${newStatus}`,
      description: note || `Referral moved to ${newStatus}.`,
      timestamp: nowFormatted(),
      actor:
        newStatus === 'Accepted' ||
        newStatus === 'Appointment Confirmed' ||
        newStatus === 'E-Consultation Confirmed' ||
        newStatus === 'Additional Information Requested' ||
        newStatus === 'Declined'
          ? target.receivingClinic
          : target.referringPhysicianContact.physicianName,
      stage: stageMap[newStatus] ?? 'reviewed',
    };

    updateReferral(id, (prev) => ({
      ...prev,
      status: newStatus,
      lastUpdated: todayIso(),
      acceptedAt: newStatus === 'Accepted' ? todayIso() : prev.acceptedAt,
      specialistReviewedAt:
        newStatus === 'Awaiting Specialist Review' || newStatus === 'Awaiting Specialist Decision'
          ? todayIso()
          : prev.specialistReviewedAt,
      attentionPriority:
        newStatus === 'Additional Information Requested' || newStatus === 'Draft'
          ? 'High'
          : newStatus === 'Completed' ||
              newStatus === 'Appointment Confirmed' ||
              newStatus === 'E-Consultation Confirmed'
            ? 'Low'
            : 'Standard',
      confirmedAppointment: appointment ?? prev.confirmedAppointment,
      patientNextSteps: nextStepsMap[newStatus] ?? prev.patientNextSteps,
      timeline: [...prev.timeline, newEvent],
    }));

    addNotification({
      title: `${newStatus} · ${target.id}`,
      message: `${target.patient.name} (${target.specialty}) — ${note || `Status updated to ${newStatus}.`}`,
      timestamp: 'Just now',
      type:
        newStatus === 'Additional Information Requested' || newStatus === 'Declined'
          ? 'warning'
          : newStatus === 'Accepted' ||
              newStatus === 'Appointment Confirmed' ||
              newStatus === 'E-Consultation Confirmed'
            ? 'success'
            : 'info',
      referralId: target.id,
      audience: 'all',
    });

    showToast(`Referral ${target.id} updated to "${newStatus}"`);
  };

  const markAnonymousReviewed = useCallback(
    async (id: string, specialistId: string) => {
      const target = referrals.find((r) => r.id === id);
      if (!target || isConfidentialityUnlocked(target)) return;

      try {
        const res = await fetch(`/api/specialist/referrals/${encodeURIComponent(id)}/view-anonymous`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-medibridge-role': 'specialist',
            'x-medibridge-specialist-id': specialistId,
          },
        });
        if (res.ok) {
          const data = await res.json();
          updateReferral(id, (prev) => ({
            ...prev,
            status: normalizeReferralStatus(data.status || prev.status),
            auditLog: Array.isArray(data.auditLog) ? data.auditLog : prev.auditLog,
          }));
          return;
        }
      } catch {
        // fallback locally
      }

      const ts = nowFormatted();
      const actorId = getSpecialistProfessionalId(specialistId);
      const shouldAdvance =
        target.status === 'Submitted' || target.status === 'Awaiting Specialist Review';
      updateReferral(id, (prev) => ({
        ...prev,
        status: shouldAdvance ? 'Anonymous Information Reviewed' : prev.status,
        auditLog: (prev.auditLog ?? []).some(
          (a) => a.action === 'ANONYMOUS_PREVIEW_VIEWED' && a.actorId === actorId
        )
          ? prev.auditLog
          : [
              ...(prev.auditLog ?? []),
              createAuditEntry({
                actorRole: 'specialist',
                actorName: prev.specialistName,
                actorId,
                action: 'ANONYMOUS_PREVIEW_VIEWED',
                details: `Reviewed Stage 1 de-identified referral preview for ${prev.id}.`,
                timestamp: ts,
              }),
            ],
      }));
    },
    [referrals, updateReferral]
  );

  const acceptConfidentialityAndUnlock = async (
    id: string,
    payload: {
      specialistId: string;
      specialistName?: string;
      professionalId?: string;
      accepted: boolean;
    }
  ): Promise<{ ok: boolean; error?: string; referral?: Referral }> => {
    if (!payload.accepted) {
      return { ok: false, error: 'You must accept the Confidentiality Agreement statement.' };
    }
    const target = referrals.find((r) => r.id === id);
    if (!target) {
      return { ok: false, error: 'Referral not found.' };
    }

    try {
      const res = await fetch(
        `/api/specialist/referrals/${encodeURIComponent(id)}/confidentiality-ack`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-medibridge-role': 'specialist',
            'x-medibridge-specialist-id': payload.specialistId,
          },
          body: JSON.stringify({
            accepted: payload.accepted,
            specialistName: payload.specialistName,
            professionalId: payload.professionalId,
            statement: CONFIDENTIALITY_AGREEMENT_TEXT,
          }),
        }
      );

      if (res.ok) {
        const data = (await res.json()) as { referral: Referral };
        const unlocked = normalizeReferral(data.referral);
        updateReferral(id, () => unlocked);
        addNotification({
          title: `Confidentiality accepted · ${id}`,
          message: `${unlocked.specialistName} acknowledged patient confidentiality and unlocked ${id}. Referral awaits specialist Accept/Decline decision.`,
          timestamp: 'Just now',
          type: 'info',
          referralId: id,
          audience: 'physician',
        });
        showToast(`Patient identity unlocked for ${id}. Please review and accept or decline.`);
        return { ok: true, referral: unlocked };
      } else {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err.error || 'Failed to record confidentiality agreement.' };
      }
    } catch {
      // Local fallback if network call interrupted
      const ts = nowFormatted();
      const resolvedName = payload.specialistName || target.specialistName;
      const resolvedProf =
        payload.professionalId || getSpecialistProfessionalId(payload.specialistId);
      const nextStatus: ReferralStatus =
        target.status === 'Submitted' ||
        target.status === 'Awaiting Specialist Review' ||
        target.status === 'Anonymous Information Reviewed'
          ? 'Awaiting Specialist Decision'
          : target.status;

      const updated: Referral = {
        ...target,
        status: nextStatus,
        specialistReviewedAt: todayIso(),
        lastUpdated: todayIso(),
        confidentialityAcknowledgement: {
          accepted: true,
          specialistId: payload.specialistId,
          specialistName: resolvedName,
          professionalId: resolvedProf,
          acknowledgedAt: ts,
          statement: CONFIDENTIALITY_AGREEMENT_TEXT,
        },
        auditLog: [
          ...(target.auditLog ?? []),
          createAuditEntry({
            actorRole: 'specialist',
            actorName: resolvedName,
            actorId: resolvedProf,
            action: 'CONFIDENTIALITY_ACCEPTED',
            details: `Accepted Specialist Confidentiality Agreement (${resolvedProf}).`,
            timestamp: ts,
          }),
          createAuditEntry({
            actorRole: 'specialist',
            actorName: resolvedName,
            actorId: resolvedProf,
            action: 'FULL_REFERRAL_UNLOCKED',
            details: `Unlocked Stage 2 full patient identity; status set to ${nextStatus}.`,
            timestamp: ts,
          }),
        ],
      };
      updateReferral(id, () => updated);
      showToast(`Patient identity unlocked for ${id}. Please review and accept or decline.`);
      return { ok: true, referral: updated };
    }
  };

  const acceptReferral = async (id: string, note?: string) => {
    const target = referrals.find((r) => r.id === id);
    if (!target) return;
    if (!isConfidentialityUnlocked(target)) {
      showToast('Please accept the Confidentiality Agreement before accepting the referral.');
      return;
    }

    try {
      const res = await fetch(`/api/specialist/referrals/${encodeURIComponent(id)}/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-medibridge-role': 'specialist',
          'x-medibridge-specialist-id': target.specialistId,
        },
        body: JSON.stringify({ decision: 'Accept', notes: note }),
      });
      if (res.ok) {
        const data = (await res.json()) as { referral: Referral };
        updateReferral(id, () => normalizeReferral(data.referral));
        addNotification({
          title: `Specialist accepted referral · ${target.id}`,
          message: `${target.specialistName} accepted ${target.patient.name}’s ${target.specialty} referral.`,
          timestamp: 'Just now',
          type: 'success',
          referralId: target.id,
          audience: 'physician',
        });
        showToast(`Referral ${target.id} accepted.`);
        return;
      }
    } catch {
      // fallback below
    }

    const timestamp = nowFormatted();
    const actor = `${target.specialistName} (${target.receivingClinic})`;
    updateReferral(id, (prev) => ({
      ...prev,
      status: 'Accepted',
      acceptedAt: todayIso(),
      specialistReviewedAt: todayIso(),
      lastUpdated: todayIso(),
      attentionPriority: 'Low',
      patientNextSteps: `${prev.specialistName} has accepted your referral. Clinic scheduling staff at ${prev.receivingClinic} will arrange your appointment date.`,
      auditLog: [
        ...(prev.auditLog ?? []),
        createAuditEntry({
          actorRole: 'specialist',
          actorName: prev.specialistName,
          actorId: getSpecialistProfessionalId(prev.specialistId),
          action: 'SPECIALIST_DECISION_ACCEPTED',
          details: note?.trim() || 'Specialist accepted referral.',
          timestamp,
        }),
      ],
      timeline: [
        ...prev.timeline,
        {
          id: `tl-acc-${Date.now()}`,
          title: 'Specialist accepted referral',
          description:
            note?.trim() || `${prev.specialistName} accepted referral for specialist consultation.`,
          timestamp,
          actor,
          stage: 'accepted',
        },
      ],
    }));

    addNotification({
      title: `Specialist accepted referral · ${target.id}`,
      message: `${target.specialistName} accepted ${target.patient.name}’s ${target.specialty} referral.`,
      timestamp: 'Just now',
      type: 'success',
      referralId: target.id,
      audience: 'physician',
    });

    showToast(`Referral ${target.id} accepted.`);
  };

  const requestClarification = (
    id: string,
    payload: { missingInformation: string; reason: string; notes: string }
  ) => {
    const target = referrals.find((r) => r.id === id);
    if (!target) return;
    const timestamp = nowFormatted();
    const actor = `${target.specialistName} / ${target.receivingClinic}`;
    const clrId = `clr-${Date.now()}`;

    const newEntry: ClarificationEntry = {
      id: clrId,
      requestedBy: actor,
      requestedAt: timestamp,
      missingInformation: payload.missingInformation.trim(),
      reason: payload.reason.trim(),
      notes: payload.notes.trim(),
      status: 'Open',
    };

    const commMsg: ReferralMessage = {
      id: `msg-clr-${Date.now()}`,
      referralId: target.id,
      senderRole: 'specialist',
      senderName: target.specialistName,
      senderClinic: target.receivingClinic,
      recipientRole: 'physician',
      recipientName: target.referringPhysicianContact.physicianName,
      recipientClinic: target.referringPhysicianContact.clinicName,
      messageType: 'Formal clarification request',
      subject: `Clarification requested: ${payload.missingInformation.trim()}`,
      content: `${payload.reason.trim()}${payload.notes.trim() ? ` — ${payload.notes.trim()}` : ''}`,
      timestamp,
      readByPhysician: false,
      readBySpecialist: true,
      clarificationId: clrId,
      clarificationMeta: {
        missingInformation: payload.missingInformation.trim(),
        reason: payload.reason.trim(),
        notes: payload.notes.trim(),
        status: 'Open',
      },
    };

    updateReferral(id, (prev) => ({
      ...prev,
      status: 'Additional Information Requested',
      specialistReviewedAt: todayIso(),
      lastUpdated: todayIso(),
      attentionPriority: 'High',
      clarificationThread: [...(prev.clarificationThread ?? []), newEntry],
      communications: [...(prev.communications ?? []), commMsg],
      patientNextSteps: `${prev.receivingClinic} is coordinating with your family physician’s office to obtain an additional supporting record before scheduling your visit. No action is needed from you right now.`,
      auditLog: [
        ...(prev.auditLog ?? []),
        createAuditEntry({
          actorRole: 'specialist',
          actorName: prev.specialistName,
          actorId: getSpecialistProfessionalId(prev.specialistId),
          action: 'CLARIFICATION_REQUESTED',
          details: `Requested: ${payload.missingInformation.trim()}`,
          timestamp,
        }),
      ],
      timeline: [
        ...prev.timeline,
        {
          id: `tl-clr-${Date.now()}`,
          title: 'Additional information requested by specialist',
          description: `Requested: ${payload.missingInformation.trim()}. ${payload.reason.trim()}`,
          timestamp,
          actor,
          stage: 'clarification',
        },
      ],
    }));

    addNotification({
      title: `Additional information requested · ${target.id}`,
      message: `${target.specialistName} (${target.receivingClinic}) requested clarification for ${target.patient.name}: ${payload.missingInformation.trim()}`,
      timestamp: 'Just now',
      type: 'warning',
      referralId: target.id,
      audience: 'physician',
    });

    showToast(`Clarification request sent to ${target.referringPhysician}.`);
  };

  const respondToClarification = (
    id: string,
    payload: {
      clarificationId: string;
      responseText: string;
      attachedDoc?: UploadedDocument;
    }
  ) => {
    const target = referrals.find((r) => r.id === id);
    if (!target) return;
    const timestamp = nowFormatted();
    const physicianName = target.referringPhysicianContact.physicianName || settings.physicianName;
    const physicianClinic = target.referringPhysicianContact.clinicName || settings.clinicName;

    const responseMsg: ReferralMessage = {
      id: `msg-resp-${Date.now()}`,
      referralId: target.id,
      senderRole: 'physician',
      senderName: physicianName,
      senderClinic: physicianClinic,
      recipientRole: 'specialist',
      recipientName: target.specialistName,
      recipientClinic: target.receivingClinic,
      messageType: 'Clarification response',
      subject: `Clarification response for ${target.patient.name}`,
      content: payload.responseText.trim(),
      timestamp,
      readByPhysician: true,
      readBySpecialist: false,
      clarificationId: payload.clarificationId,
      attachedDocumentName: payload.attachedDoc?.name,
    };

    updateReferral(id, (prev) => {
      const updatedThread = (prev.clarificationThread ?? []).map((entry) =>
        entry.id === payload.clarificationId
          ? {
              ...entry,
              status: 'Responded' as const,
              physicianResponse: {
                respondedBy: physicianName,
                respondedAt: timestamp,
                responseText: payload.responseText.trim(),
                attachedDocumentName: payload.attachedDoc?.name,
              },
            }
          : entry
      );

      const updatedComms = (prev.communications ?? []).map((m) =>
        m.clarificationId === payload.clarificationId && m.clarificationMeta
          ? {
              ...m,
              readByPhysician: true,
              clarificationMeta: { ...m.clarificationMeta, status: 'Responded' as const },
            }
          : m
      );

      const updatedDocs = payload.attachedDoc
        ? [...prev.documents, payload.attachedDoc]
        : prev.documents;

      const updatedChecklist = payload.attachedDoc
        ? prev.analysis.checklist.map((c) =>
            c.status === 'Missing' || c.status === 'Needs clarification'
              ? {
                  ...c,
                  status: 'Provided' as const,
                  details: `Updated via physician clarification response (${payload.attachedDoc?.name}).`,
                  sourceLabel: `Attachment: ${payload.attachedDoc?.name}`,
                  sourceExcerpt: payload.attachedDoc?.contentText.slice(0, 200),
                }
              : c
          )
        : prev.analysis.checklist.map((c) =>
            c.status === 'Needs clarification'
              ? {
                  ...c,
                  status: 'Clinician verified' as const,
                  details: `Clarified by referring physician: ${payload.responseText.trim().slice(0, 120)}`,
                }
              : c
          );

      const satisfiedCount = updatedChecklist.filter(
        (c) => c.status === 'Provided' || c.status === 'Clinician verified'
      ).length;
      const newCompleteness = payload.attachedDoc
        ? Math.min(
            100,
            Math.max(
              prev.completeness,
              Math.round((satisfiedCount / Math.max(updatedChecklist.length, 1)) * 100)
            )
          )
        : Math.min(100, Math.max(prev.completeness, 88));

      const nextStatus: ReferralStatus = isConfidentialityUnlocked(prev)
        ? 'Awaiting Specialist Decision'
        : 'Awaiting Specialist Review';

      return {
        ...prev,
        status: nextStatus,
        lastUpdated: todayIso(),
        attentionPriority: 'Standard',
        documents: updatedDocs,
        completeness: newCompleteness,
        clarificationThread: updatedThread,
        communications: [...updatedComms, responseMsg],
        analysis: {
          ...prev.analysis,
          completenessScore: newCompleteness,
          checklist: updatedChecklist,
          missingItems: updatedChecklist
            .filter((c) => c.status === 'Missing')
            .map((c) => c.requirement),
          ambiguityFlags: prev.analysis.ambiguityFlags.map((a) => ({ ...a, resolved: true })),
        },
        patientNextSteps: `Your family physician has provided the requested update to ${prev.receivingClinic}. Your referral is back under specialist review.`,
        auditLog: [
          ...(prev.auditLog ?? []),
          createAuditEntry({
            actorRole: 'physician',
            actorName: physicianName,
            actorId: 'phys-vance',
            action: 'CLARIFICATION_RESPONDED',
            details: payload.responseText.trim().slice(0, 160),
            timestamp,
          }),
        ],
        timeline: [
          ...prev.timeline,
          {
            id: `tl-resp-${Date.now()}`,
            title: 'Physician responded to clarification',
            description: `${payload.responseText.trim()}${
              payload.attachedDoc ? ` (Attached: ${payload.attachedDoc.name})` : ''
            }`,
            timestamp,
            actor: physicianName,
            stage: 'reviewed',
          },
        ],
      };
    });

    addNotification({
      title: `Clarification response received · ${target.id}`,
      message: `${physicianName} responded to clarification for ${target.patient.name}. Ready for specialist review.`,
      timestamp: 'Just now',
      type: 'action',
      referralId: target.id,
      audience: 'specialist',
    });

    showToast(`Clarification response sent to ${target.receivingClinic}.`);
  };

  const sendReferralMessage = (
    id: string,
    payload: {
      senderRole: 'physician' | 'specialist';
      subject?: string;
      content: string;
    }
  ) => {
    const target = referrals.find((r) => r.id === id);
    if (!target || !payload.content.trim()) return;
    const timestamp = nowFormatted();
    const physicianName = target.referringPhysicianContact.physicianName || settings.physicianName;
    const physicianClinic = target.referringPhysicianContact.clinicName || settings.clinicName;

    const isSpecialist = payload.senderRole === 'specialist';
    const newMessage: ReferralMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      referralId: target.id,
      senderRole: payload.senderRole,
      senderName: isSpecialist ? target.specialistName : physicianName,
      senderClinic: isSpecialist ? target.receivingClinic : physicianClinic,
      recipientRole: isSpecialist ? 'physician' : 'specialist',
      recipientName: isSpecialist ? physicianName : target.specialistName,
      recipientClinic: isSpecialist ? physicianClinic : target.receivingClinic,
      messageType: 'General message',
      subject: payload.subject?.trim() || undefined,
      content: payload.content.trim(),
      timestamp,
      readByPhysician: !isSpecialist,
      readBySpecialist: isSpecialist,
    };

    updateReferral(id, (prev) => ({
      ...prev,
      lastUpdated: todayIso(),
      communications: [...(prev.communications ?? []), newMessage],
      timeline: [
        ...prev.timeline,
        {
          id: `tl-msg-${Date.now()}`,
          title: isSpecialist
            ? 'Specialist sent message to referring physician'
            : 'Referring physician replied to specialist',
          description: payload.subject?.trim()
            ? `${payload.subject.trim()}: ${payload.content.trim()}`
            : payload.content.trim(),
          timestamp,
          actor: newMessage.senderName,
          stage: 'message',
        },
      ],
    }));

    addNotification({
      title: isSpecialist
        ? `Message from ${target.specialistName} · ${target.id}`
        : `Reply from ${physicianName} · ${target.id}`,
      message: `${target.patient.name}: ${payload.content.trim().slice(0, 120)}`,
      timestamp: 'Just now',
      type: 'action',
      referralId: target.id,
      audience: isSpecialist ? 'physician' : 'specialist',
    });

    showToast(
      isSpecialist
        ? `Message sent to ${physicianName}.`
        : `Reply sent to ${target.specialistName}.`
    );
  };

  const markReferralMessagesRead = (id: string, viewerRole: 'physician' | 'specialist') => {
    const target = referrals.find((r) => r.id === id);
    if (!target) return;
    const hasUnread = (target.communications ?? []).some((m) =>
      viewerRole === 'physician' ? !m.readByPhysician : !m.readBySpecialist
    );
    if (!hasUnread) return;

    updateReferral(id, (prev) => ({
      ...prev,
      communications: (prev.communications ?? []).map((m) =>
        viewerRole === 'physician'
          ? { ...m, readByPhysician: true }
          : { ...m, readBySpecialist: true }
      ),
    }));
  };

  const declineReferral = async (
    id: string,
    payload: { reasonCategory: DeclineReasonCategory; notes: string }
  ) => {
    const target = referrals.find((r) => r.id === id);
    if (!target) return;
    if (!isConfidentialityUnlocked(target)) {
      showToast('Please accept the Confidentiality Agreement before submitting a decision.');
      return;
    }

    try {
      const res = await fetch(`/api/specialist/referrals/${encodeURIComponent(id)}/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-medibridge-role': 'specialist',
          'x-medibridge-specialist-id': target.specialistId,
        },
        body: JSON.stringify({
          decision: 'Decline',
          reasonCategory: payload.reasonCategory,
          notes: payload.notes,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { referral: Referral };
        updateReferral(id, () => normalizeReferral(data.referral));
        addNotification({
          title: `Referral declined · ${target.id}`,
          message: `${target.receivingClinic} declined ${target.patient.name}’s referral (${payload.reasonCategory}).`,
          timestamp: 'Just now',
          type: 'warning',
          referralId: target.id,
          audience: 'physician',
        });
        showToast(`Referral ${target.id} declined (${payload.reasonCategory}).`);
        return;
      }
    } catch {
      // fallback below
    }

    const timestamp = nowFormatted();
    const actor = `${target.specialistName} (${target.receivingClinic})`;
    updateReferral(id, (prev) => ({
      ...prev,
      status: 'Declined',
      specialistReviewedAt: todayIso(),
      lastUpdated: todayIso(),
      attentionPriority: 'High',
      declineDetails: {
        reasonCategory: payload.reasonCategory,
        notes: payload.notes.trim(),
        declinedBy: actor,
        declinedAt: timestamp,
      },
      patientNextSteps:
        'Your family physician is coordinating an updated specialist clinic arrangement for your referral and will follow up with next steps.',
      auditLog: [
        ...(prev.auditLog ?? []),
        createAuditEntry({
          actorRole: 'specialist',
          actorName: prev.specialistName,
          actorId: getSpecialistProfessionalId(prev.specialistId),
          action: 'SPECIALIST_DECISION_DECLINED',
          details: `Declined (${payload.reasonCategory}): ${payload.notes.trim()}`,
          timestamp,
        }),
      ],
      timeline: [
        ...prev.timeline,
        {
          id: `tl-dec-${Date.now()}`,
          title: `Referral declined (${payload.reasonCategory})`,
          description: payload.notes.trim() || `Declined due to ${payload.reasonCategory.toLowerCase()}.`,
          timestamp,
          actor,
          stage: 'declined',
        },
      ],
    }));

    addNotification({
      title: `Referral declined · ${target.id}`,
      message: `${target.receivingClinic} declined ${target.patient.name}’s referral (${payload.reasonCategory}).`,
      timestamp: 'Just now',
      type: 'warning',
      referralId: target.id,
      audience: 'physician',
    });

    showToast(`Referral ${target.id} declined (${payload.reasonCategory}).`);
  };

  const confirmReferralAppointment = (
    id: string,
    appointment: ConfirmedAppointment,
    isUpdate = false
  ) => {
    const target = referrals.find((r) => r.id === id);
    if (!target) return;
    const timestamp = nowFormatted();
    const actor = `${target.receivingClinic} Scheduling`;

    updateReferral(id, (prev) => ({
      ...prev,
      status: 'Appointment Confirmed',
      acceptedAt: prev.acceptedAt ?? todayIso(),
      lastUpdated: todayIso(),
      attentionPriority: 'Low',
      confirmedAppointment: { ...appointment, mode: appointment.mode ?? 'In-Person' },
      patientNextSteps: `Your consultation with ${prev.specialistName} is confirmed for ${appointment.date} at ${appointment.time} at ${appointment.location}.`,
      auditLog: [
        ...(prev.auditLog ?? []),
        createAuditEntry({
          actorRole: 'specialist',
          actorName: actor,
          actorId: getSpecialistProfessionalId(prev.specialistId),
          action: 'APPOINTMENT_CONFIRMED',
          details: `${isUpdate ? 'Updated' : 'Confirmed'} ${appointment.mode ?? 'In-Person'} appointment for ${appointment.date} at ${appointment.time}.`,
          timestamp,
        }),
      ],
      timeline: [
        ...prev.timeline,
        {
          id: `tl-appt-${Date.now()}`,
          title: isUpdate ? 'Appointment updated' : 'Appointment confirmed',
          description: `${appointment.date} at ${appointment.time} — ${appointment.location}`,
          timestamp,
          actor,
          stage: 'confirmed',
        },
      ],
    }));

    addNotification({
      title: `${isUpdate ? 'Appointment updated' : 'Appointment confirmed'} · ${target.id}`,
      message: `${target.patient.name} scheduled with ${target.specialistName} on ${appointment.date} at ${appointment.time}.`,
      timestamp: 'Just now',
      type: 'success',
      referralId: target.id,
      audience: 'all',
    });

    showToast(
      isUpdate
        ? `Appointment updated for ${target.patient.name}.`
        : `Appointment confirmed for ${target.patient.name}.`
    );
  };

  const cancelReferralAppointment = (id: string, reason: string) => {
    const target = referrals.find((r) => r.id === id);
    if (!target) return;
    const timestamp = nowFormatted();
    const actor = `${target.receivingClinic} Scheduling`;

    updateReferral(id, (prev) => ({
      ...prev,
      status: 'Accepted',
      lastUpdated: todayIso(),
      attentionPriority: 'Standard',
      confirmedAppointment: undefined,
      patientNextSteps: `Your previously scheduled appointment at ${prev.receivingClinic} was cancelled (${reason.trim() || 'scheduling change'}). The clinic team will contact you to reschedule.`,
      timeline: [
        ...prev.timeline,
        {
          id: `tl-can-${Date.now()}`,
          title: 'Appointment cancelled',
          description:
            reason.trim() || 'Appointment cancelled by clinic scheduling; awaiting new slot.',
          timestamp,
          actor,
          stage: 'cancelled',
        },
      ],
    }));

    addNotification({
      title: `Appointment cancelled · ${target.id}`,
      message: `${target.patient.name}’s appointment at ${target.receivingClinic} was cancelled. Referral remains Accepted for rescheduling.`,
      timestamp: 'Just now',
      type: 'warning',
      referralId: target.id,
      audience: 'all',
    });

    showToast(`Appointment cancelled for ${target.id}; status returned to Accepted.`);
  };

  const requestInsuranceInfo = async (
    id: string,
    payload: { requestedDetails: string; reason: string }
  ) => {
    const target = referrals.find((r) => r.id === id);
    if (!target) return;

    try {
      const res = await fetch(
        `/api/specialist/referrals/${encodeURIComponent(id)}/insurance/request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-medibridge-role': 'specialist',
            'x-medibridge-specialist-id': target.specialistId,
          },
          body: JSON.stringify(payload),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as { referral: Referral };
        updateReferral(id, () => normalizeReferral(data.referral));
        addNotification({
          title: `Insurance information requested · ${target.id}`,
          message: `${target.specialistName} requested medical insurance/coverage clarification for ${target.patient.name}: ${payload.requestedDetails}`,
          timestamp: 'Just now',
          type: 'warning',
          referralId: target.id,
          audience: 'physician',
        });
        showToast(`Insurance information request sent to ${target.referringPhysician}.`);
        return;
      }
    } catch {
      // fallback below
    }

    const ts = nowFormatted();
    updateReferral(id, (prev) => ({
      ...prev,
      lastUpdated: todayIso(),
      attentionPriority: 'High',
      insurance: {
        ...(prev.insurance ?? createDefaultInsuranceInfo()),
        specialistRequest: {
          id: `insreq-${Date.now()}`,
          requestedBy: `${prev.specialistName} (${prev.receivingClinic})`,
          requestedAt: ts,
          requestedDetails: payload.requestedDetails,
          reason: payload.reason,
          resolved: false,
        },
      },
      auditLog: [
        ...(prev.auditLog ?? []),
        createAuditEntry({
          actorRole: 'specialist',
          actorName: prev.specialistName,
          actorId: getSpecialistProfessionalId(prev.specialistId),
          action: 'INSURANCE_INFO_REQUESTED',
          details: payload.requestedDetails,
          timestamp: ts,
        }),
      ],
    }));

    addNotification({
      title: `Insurance information requested · ${target.id}`,
      message: `${target.specialistName} requested medical insurance/coverage clarification for ${target.patient.name}: ${payload.requestedDetails}`,
      timestamp: 'Just now',
      type: 'warning',
      referralId: target.id,
      audience: 'physician',
    });
    showToast(`Insurance information request sent to ${target.referringPhysician}.`);
  };

  const updateInsuranceInfo = async (id: string, insurance: MedicalInsuranceInfo) => {
    const target = referrals.find((r) => r.id === id);
    if (!target) return;
    const actor = target.referringPhysicianContact.physicianName || settings.physicianName;

    try {
      const res = await fetch(`/api/referrals/${encodeURIComponent(id)}/insurance/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insurance, updatedBy: actor }),
      });
      if (res.ok) {
        const data = (await res.json()) as { referral: Referral };
        updateReferral(id, () => normalizeReferral(data.referral));
        addNotification({
          title: `Insurance information updated · ${target.id}`,
          message: `${actor} updated insurance details (${insurance.availabilityStatus}) for referral ${target.id}.`,
          timestamp: 'Just now',
          type: 'success',
          referralId: target.id,
          audience: 'specialist',
        });
        showToast('Medical insurance information updated and synchronized.');
        return;
      }
    } catch {
      // fallback below
    }

    const ts = nowFormatted();
    updateReferral(id, (prev) => ({
      ...prev,
      lastUpdated: todayIso(),
      insurance: {
        ...insurance,
        lastUpdatedAt: ts,
        lastUpdatedBy: actor,
        specialistRequest: prev.insurance?.specialistRequest
          ? {
              ...prev.insurance.specialistRequest,
              resolved: true,
              resolvedAt: ts,
              resolvedBy: actor,
            }
          : undefined,
      },
      auditLog: [
        ...(prev.auditLog ?? []),
        createAuditEntry({
          actorRole: 'physician',
          actorName: actor,
          actorId: 'phys-vance',
          action: 'INSURANCE_INFO_UPDATED',
          details: `Updated insurance status to "${insurance.availabilityStatus}".`,
          timestamp: ts,
        }),
      ],
    }));

    showToast('Medical insurance information updated and synchronized.');
  };

  const proposeEConsultation = async (
    id: string,
    payload: {
      proposedDate: string;
      proposedTime: string;
      consultationReason: string;
      specialistMessage: string;
      isEConsultation: boolean;
    }
  ) => {
    const target = referrals.find((r) => r.id === id);
    if (!target) return;
    if (!isConfidentialityUnlocked(target)) {
      showToast('Unlock patient confidentiality before offering an appointment or E-Consultation.');
      return;
    }

    try {
      const res = await fetch(`/api/referrals/${encodeURIComponent(id)}/econsult/propose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-medibridge-role': 'specialist',
          'x-medibridge-specialist-id': target.specialistId,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = (await res.json()) as { referral: Referral };
        updateReferral(id, () => normalizeReferral(data.referral));
        addNotification({
          title: payload.isEConsultation
            ? `E-Consultation invitation · ${target.id}`
            : `Appointment proposed · ${target.id}`,
          message: `${target.specialistName} proposed ${payload.proposedDate} at ${payload.proposedTime}. Patient approval requested.`,
          timestamp: 'Just now',
          type: 'action',
          referralId: target.id,
          audience: 'patient',
        });
        showToast(
          payload.isEConsultation
            ? `E-Consultation invitation sent to ${target.patient.name} in Patient Portal.`
            : `Appointment proposal sent to ${target.patient.name}.`
        );
        return;
      }
    } catch {
      // fallback below
    }

    const ts = nowFormatted();
    const nextStatus: ReferralStatus = payload.isEConsultation
      ? 'E-Consultation Awaiting Patient Approval'
      : 'Appointment Proposed';
    updateReferral(id, (prev) => ({
      ...prev,
      status: nextStatus,
      acceptedAt: prev.acceptedAt ?? todayIso(),
      lastUpdated: todayIso(),
      confirmedAppointment: undefined,
      eConsultation: {
        isOffered: payload.isEConsultation,
        consultationMode: payload.isEConsultation ? 'E-Consultation' : 'In-Person',
        proposedDate: payload.proposedDate,
        proposedTime: payload.proposedTime,
        consultationReason: payload.consultationReason,
        specialistMessage: payload.specialistMessage,
        proposedAt: ts,
        proposedBy: prev.specialistName,
        patientStatus: 'Pending',
        rescheduleRequest: undefined,
        messages: [
          ...(prev.eConsultation?.messages ?? []),
          {
            id: `ecmsg-${Date.now()}`,
            referralId: prev.id,
            appointmentContextLabel: `${payload.isEConsultation ? 'E-Consultation' : 'Appointment'} · ${payload.proposedDate} at ${payload.proposedTime}`,
            senderRole: 'specialist',
            senderDisplayName: `${prev.specialistName} (${prev.receivingClinic})`,
            content:
              payload.specialistMessage.trim() ||
              `Proposed ${payload.isEConsultation ? 'E-Consultation' : 'visit'} for ${payload.proposedDate} at ${payload.proposedTime}.`,
            timestamp: ts,
            readBySpecialist: true,
            readByPatient: false,
          },
        ],
      },
      patientNextSteps: `${prev.specialistName} proposed an ${payload.isEConsultation ? 'E-Consultation' : 'appointment'} on ${payload.proposedDate} at ${payload.proposedTime}. Please accept or request a reschedule in your Patient Portal.`,
    }));

    showToast(
      payload.isEConsultation
        ? `E-Consultation invitation sent to ${target.patient.name}.`
        : `Appointment proposal sent to ${target.patient.name}.`
    );
  };

  const respondEConsultation = async (
    id: string,
    payload: {
      decision: 'Accept' | 'Reschedule' | 'Decline';
      suggestedDate?: string;
      suggestedTime?: string;
      message?: string;
      declineReason?: string;
    }
  ) => {
    const target = referrals.find((r) => r.id === id);
    if (!target || !target.eConsultation) return;

    try {
      const res = await fetch(`/api/referrals/${encodeURIComponent(id)}/econsult/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = (await res.json()) as { referral: Referral };
        updateReferral(id, () => normalizeReferral(data.referral));
        if (payload.decision === 'Accept') {
          addNotification({
            title:
              target.eConsultation.consultationMode === 'E-Consultation'
                ? `E-Consultation Confirmed · ${target.id}`
                : `Appointment Confirmed · ${target.id}`,
            message: `${target.patient.name} confirmed the ${target.eConsultation.consultationMode} on ${target.eConsultation.proposedDate} at ${target.eConsultation.proposedTime}.`,
            timestamp: 'Just now',
            type: 'success',
            referralId: target.id,
            audience: 'specialist',
          });
          showToast('E-Consultation confirmed! Added to your care schedule.');
        } else if (payload.decision === 'Reschedule') {
          addNotification({
            title: `Reschedule Requested · ${target.id}`,
            message: `${target.patient.name} suggested ${payload.suggestedDate} at ${payload.suggestedTime}${payload.message ? `: "${payload.message}"` : ''}.`,
            timestamp: 'Just now',
            type: 'action',
            referralId: target.id,
            audience: 'specialist',
          });
          showToast('Reschedule request sent to the specialist clinic.');
        } else {
          addNotification({
            title: `Patient declined consultation · ${target.id}`,
            message: `${target.patient.name} declined the proposed slot (${payload.declineReason || 'requested alternative'}).`,
            timestamp: 'Just now',
            type: 'warning',
            referralId: target.id,
            audience: 'specialist',
          });
          showToast('Decline recorded. Specialist clinic notified.');
        }
        return;
      }
    } catch {
      // fallback below
    }

    const ts = nowFormatted();
    const ec = target.eConsultation;
    if (payload.decision === 'Accept') {
      const confirmedStatus: ReferralStatus =
        ec.consultationMode === 'E-Consultation'
          ? 'E-Consultation Confirmed'
          : 'Appointment Confirmed';
      updateReferral(id, (prev) => ({
        ...prev,
        status: confirmedStatus,
        lastUpdated: todayIso(),
        confirmedAppointment: {
          date: ec.proposedDate,
          time: ec.proposedTime,
          mode: ec.consultationMode,
          location:
            ec.consultationMode === 'E-Consultation'
              ? `MediBridge Online E-Consultation (${prev.receivingClinic})`
              : prev.receivingClinic,
          instructions:
            'Consultation confirmed by patient. Use Secure Specialist-Patient Messaging below for pre-visit coordination.',
        },
        eConsultation: { ...ec, patientStatus: 'Accepted', respondedAt: ts, rescheduleRequest: undefined },
        patientNextSteps: `Your ${ec.consultationMode} with ${prev.specialistName} is confirmed for ${ec.proposedDate} at ${ec.proposedTime}.`,
      }));
      addNotification({
        title: `E-Consultation Confirmed · ${target.id}`,
        message: `${target.patient.name} confirmed ${ec.proposedDate} at ${ec.proposedTime}.`,
        timestamp: 'Just now',
        type: 'success',
        referralId: target.id,
        audience: 'specialist',
      });
      showToast('Consultation confirmed!');
    } else if (payload.decision === 'Reschedule') {
      const sDate = (payload.suggestedDate || '').trim();
      const sTime = (payload.suggestedTime || '').trim();
      const sMsg = (payload.message || '').trim();
      if (!sDate || !sTime) {
        showToast('Please select both a suggested date and time.');
        return;
      }
      updateReferral(id, (prev) => ({
        ...prev,
        status: 'Reschedule Requested',
        lastUpdated: todayIso(),
        confirmedAppointment: undefined,
        eConsultation: {
          ...ec,
          patientStatus: 'Reschedule Requested',
          respondedAt: ts,
          rescheduleRequest: {
            suggestedDate: sDate,
            suggestedTime: sTime,
            message: sMsg || undefined,
            requestedAt: ts,
          },
          messages: [
            ...ec.messages,
            {
              id: `ecmsg-${Date.now()}`,
              referralId: prev.id,
              appointmentContextLabel: `Reschedule Request · ${sDate} at ${sTime}`,
              senderRole: 'patient',
              senderDisplayName: `${prev.patient.name} (Patient)`,
              content: sMsg ? `Requested reschedule to ${sDate} at ${sTime}: ${sMsg}` : `Requested reschedule to ${sDate} at ${sTime}.`,
              timestamp: ts,
              readBySpecialist: false,
              readByPatient: true,
            },
          ],
        },
        patientNextSteps: `Reschedule requested for ${sDate} at ${sTime}. ${prev.specialistName}’s office has been notified.`,
      }));
      addNotification({
        title: `Reschedule Requested · ${target.id}`,
        message: `${target.patient.name} suggested ${sDate} at ${sTime}.`,
        timestamp: 'Just now',
        type: 'action',
        referralId: target.id,
        audience: 'specialist',
      });
      showToast('Reschedule request sent to the specialist clinic.');
    } else {
      updateReferral(id, (prev) => ({
        ...prev,
        status: 'Accepted',
        lastUpdated: todayIso(),
        confirmedAppointment: undefined,
        eConsultation: {
          ...ec,
          patientStatus: 'Declined',
          respondedAt: ts,
          declineReason: payload.declineReason,
        },
        patientNextSteps: `You declined the proposed ${ec.consultationMode}. ${prev.receivingClinic} has been notified to propose another option.`,
      }));
      showToast('Consultation proposal declined.');
    }
  };

  const respondToRescheduleRequest = async (
    id: string,
    payload: {
      action: 'AcceptSuggested' | 'CounterPropose';
      proposedDate?: string;
      proposedTime?: string;
      specialistMessage?: string;
    }
  ) => {
    const target = referrals.find((r) => r.id === id);
    if (!target || !target.eConsultation) return;
    if (!isConfidentialityUnlocked(target)) {
      showToast('Unlock patient confidentiality before managing schedule requests.');
      return;
    }

    try {
      const res = await fetch(
        `/api/referrals/${encodeURIComponent(id)}/econsult/reschedule-respond`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-medibridge-role': 'specialist',
            'x-medibridge-specialist-id': target.specialistId,
          },
          body: JSON.stringify(payload),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as { referral: Referral };
        const nextRef = normalizeReferral(data.referral);
        updateReferral(id, () => nextRef);
        if (payload.action === 'AcceptSuggested') {
          addNotification({
            title: `E-Consultation Confirmed · ${target.id}`,
            message: `${target.specialistName} confirmed your requested slot: ${nextRef.confirmedAppointment?.date} at ${nextRef.confirmedAppointment?.time}.`,
            timestamp: 'Just now',
            type: 'success',
            referralId: target.id,
            audience: 'patient',
          });
          showToast('Patient reschedule request accepted and confirmed.');
        } else {
          addNotification({
            title: `New E-Consultation Time Suggested · ${target.id}`,
            message: `${target.specialistName} suggested ${payload.proposedDate} at ${payload.proposedTime}. Please accept or request another time in your Patient Portal.`,
            timestamp: 'Just now',
            type: 'action',
            referralId: target.id,
            audience: 'patient',
          });
          showToast('New date and time proposal sent to patient.');
        }
        return;
      }
    } catch {
      // fallback below
    }

    const ts = nowFormatted();
    const ec = target.eConsultation;
    if (payload.action === 'AcceptSuggested') {
      const acceptedDate = payload.proposedDate || ec.rescheduleRequest?.suggestedDate || '';
      const acceptedTime = payload.proposedTime || ec.rescheduleRequest?.suggestedTime || '';
      if (!acceptedDate || !acceptedTime) return;
      const confirmedStatus: ReferralStatus =
        ec.consultationMode === 'E-Consultation'
          ? 'E-Consultation Confirmed'
          : 'Appointment Confirmed';
      updateReferral(id, (prev) => ({
        ...prev,
        status: confirmedStatus,
        lastUpdated: todayIso(),
        confirmedAppointment: {
          date: acceptedDate,
          time: acceptedTime,
          mode: ec.consultationMode,
          location:
            ec.consultationMode === 'E-Consultation'
              ? `MediBridge Online E-Consultation (${prev.receivingClinic})`
              : prev.receivingClinic,
          instructions: 'Your rescheduled online E-Consultation is confirmed.',
        },
        eConsultation: {
          ...ec,
          proposedDate: acceptedDate,
          proposedTime: acceptedTime,
          patientStatus: 'Accepted',
          respondedAt: ts,
          rescheduleRequest: undefined,
        },
        patientNextSteps: `Your ${ec.consultationMode} with ${prev.specialistName} is confirmed for ${acceptedDate} at ${acceptedTime}.`,
      }));
      addNotification({
        title: `E-Consultation Confirmed · ${target.id}`,
        message: `${target.specialistName} confirmed ${acceptedDate} at ${acceptedTime}.`,
        timestamp: 'Just now',
        type: 'success',
        referralId: target.id,
        audience: 'patient',
      });
      showToast('Reschedule accepted and consultation confirmed.');
    } else {
      const nextDate = (payload.proposedDate || '').trim();
      const nextTime = (payload.proposedTime || '').trim();
      if (!nextDate || !nextTime) return;
      const nextStatus: ReferralStatus =
        ec.consultationMode === 'E-Consultation'
          ? 'E-Consultation Awaiting Patient Approval'
          : 'Appointment Proposed';
      updateReferral(id, (prev) => ({
        ...prev,
        status: nextStatus,
        lastUpdated: todayIso(),
        confirmedAppointment: undefined,
        eConsultation: {
          ...ec,
          proposedDate: nextDate,
          proposedTime: nextTime,
          specialistMessage: payload.specialistMessage || ec.specialistMessage,
          proposedAt: ts,
          patientStatus: 'Pending',
          rescheduleRequest: undefined,
        },
        patientNextSteps: `${prev.specialistName} suggested ${nextDate} at ${nextTime}. Please accept or request a reschedule in your Patient Portal.`,
      }));
      addNotification({
        title: `New E-Consultation Time Suggested · ${target.id}`,
        message: `${target.specialistName} suggested ${nextDate} at ${nextTime}.`,
        timestamp: 'Just now',
        type: 'action',
        referralId: target.id,
        audience: 'patient',
      });
      showToast('New date and time proposal sent to patient.');
    }
  };

  const sendEConsultationMessage = async (
    id: string,
    senderRole: 'specialist' | 'patient',
    content: string
  ) => {
    const target = referrals.find((r) => r.id === id);
    if (!target || !content.trim()) return;

    try {
      const res = await fetch(`/api/referrals/${encodeURIComponent(id)}/econsult/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderRole, content }),
      });
      if (res.ok) {
        const data = (await res.json()) as { referral: Referral };
        updateReferral(id, () => normalizeReferral(data.referral));
        addNotification({
          title:
            senderRole === 'specialist'
              ? `Specialist message from ${target.specialistName} · ${target.id}`
              : `Patient message from ${target.patient.name} · ${target.id}`,
          message: content.trim().slice(0, 120),
          timestamp: 'Just now',
          type: 'action',
          referralId: target.id,
          audience: senderRole === 'specialist' ? 'patient' : 'specialist',
        });
        showToast('Secure message sent.');
        return;
      }
    } catch {
      // fallback below
    }

    const ts = nowFormatted();
    updateReferral(id, (prev) => {
      const ec = prev.eConsultation;
      const contextLabel = prev.confirmedAppointment
        ? `${prev.confirmedAppointment.mode ?? 'Consultation'} · ${prev.confirmedAppointment.date}`
        : `Referral ${prev.id}`;
      const newMsg = {
        id: `ecmsg-${Date.now()}`,
        referralId: prev.id,
        appointmentContextLabel: contextLabel,
        senderRole,
        senderDisplayName:
          senderRole === 'specialist'
            ? `${prev.specialistName} (${prev.receivingClinic})`
            : `${prev.patient.name} (Patient)`,
        content: content.trim(),
        timestamp: ts,
        readBySpecialist: senderRole === 'specialist',
        readByPatient: senderRole === 'patient',
      };
      return {
        ...prev,
        lastUpdated: todayIso(),
        eConsultation: ec
          ? { ...ec, messages: [...ec.messages, newMsg] }
          : {
              isOffered: false,
              consultationMode: 'In-Person',
              proposedDate: prev.confirmedAppointment?.date ?? '',
              proposedTime: prev.confirmedAppointment?.time ?? '',
              consultationReason: prev.clinicalInput.reasonForReferral,
              specialistMessage: '',
              proposedAt: ts,
              proposedBy: prev.specialistName,
              patientStatus: 'Accepted',
              messages: [newMsg],
            },
      };
    });
    showToast('Secure message sent.');
  };

  const markEConsultMessagesRead = (id: string, viewerRole: 'specialist' | 'patient') => {
    const target = referrals.find((r) => r.id === id);
    const msgs = target?.eConsultation?.messages ?? [];
    const hasUnread = msgs.some((m) =>
      viewerRole === 'specialist' ? !m.readBySpecialist : !m.readByPatient
    );
    if (!hasUnread) return;
    updateReferral(id, (prev) =>
      prev.eConsultation
        ? {
            ...prev,
            eConsultation: {
              ...prev.eConsultation,
              messages: prev.eConsultation.messages.map((m) =>
                viewerRole === 'specialist'
                  ? { ...m, readBySpecialist: true }
                  : { ...m, readByPatient: true }
              ),
            },
          }
        : prev
    );
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markDocumentsComplete = (id: string): { ok: boolean; unresolvedItems: string[] } => {
    const target = referrals.find((r) => r.id === id);
    if (!target) return { ok: false, unresolvedItems: ['Referral record not found.'] };

    const exceptions = target.checklistExceptions ?? {};
    const unresolved = target.analysis.checklist
      .filter(
        (c) =>
          (c.status === 'Missing' || c.status === 'Needs clarification') &&
          !exceptions[c.id]
      )
      .map((c) => c.requirement);

    if (unresolved.length > 0) {
      return { ok: false, unresolvedItems: unresolved };
    }

    const timestamp = nowFormatted();
    const actor = target.referringPhysicianContact.physicianName || settings.physicianName;
    const totalChecks = Math.max(target.analysis.checklist.length, 1);
    const verifiedScore = Math.max(
      target.completeness,
      Math.round(
        (target.analysis.checklist.filter(
          (c) =>
            c.status === 'Provided' ||
            c.status === 'Clinician verified' ||
            Boolean(exceptions[c.id])
        ).length /
          totalChecks) *
          100
      )
    );

    updateReferral(id, (prev) => ({
      ...prev,
      documentsComplete: true,
      documentsCompletedAt: timestamp,
      documentsCompletedBy: actor,
      lastUpdated: todayIso(),
      completeness: verifiedScore,
      analysis: {
        ...prev.analysis,
        completenessScore: verifiedScore,
        missingItems: [],
      },
      timeline: [
        ...prev.timeline,
        {
          id: `tl-docs-${Date.now()}`,
          title: 'Supporting documents marked collected',
          description:
            'All required supporting documents verified or documented as clinician-approved exceptions. Referral remains open for clinician review prior to submission.',
          timestamp,
          actor,
          stage: 'reviewed',
        },
      ],
    }));

    showToast('Supporting documents have been marked as collected.');
    return { ok: true, unresolvedItems: [] };
  };

  const recordChecklistException = (id: string, checklistItemId: string, reason: string) => {
    const target = referrals.find((r) => r.id === id);
    if (!target || !reason.trim()) return;
    const cleanReason = reason.trim();
    const timestamp = nowFormatted();
    const actor = target.referringPhysicianContact.physicianName || settings.physicianName;

    updateReferral(id, (prev) => {
      const nextExceptions = {
        ...(prev.checklistExceptions ?? {}),
        [checklistItemId]: cleanReason,
      };
      const updatedChecklist = prev.analysis.checklist.map((c) =>
        c.id === checklistItemId
          ? {
              ...c,
              status: 'Clinician verified' as const,
              details: `Not applicable / physician exception: ${cleanReason}`,
              sourceLabel: 'Physician Exception Approval',
              sourceExcerpt: cleanReason,
            }
          : c
      );
      const satisfied = updatedChecklist.filter(
        (c) => c.status === 'Provided' || c.status === 'Clinician verified'
      ).length;
      const newScore = Math.min(
        100,
        Math.max(
          prev.completeness,
          Math.round((satisfied / Math.max(updatedChecklist.length, 1)) * 100)
        )
      );
      return {
        ...prev,
        lastUpdated: todayIso(),
        completeness: newScore,
        checklistExceptions: nextExceptions,
        analysis: {
          ...prev.analysis,
          completenessScore: newScore,
          checklist: updatedChecklist,
          missingItems: updatedChecklist
            .filter((c) => c.status === 'Missing')
            .map((c) => c.requirement),
        },
        timeline: [
          ...prev.timeline,
          {
            id: `tl-exc-${Date.now()}`,
            title: 'Document exception documented by physician',
            description: cleanReason,
            timestamp,
            actor,
            stage: 'reviewed',
          },
        ],
      };
    });

    showToast('Physician exception recorded on checklist item.');
  };

  const selectReferralSpecialist = (
    id: string,
    specialistId: string,
    recommendationBundle?: SpecialistRecommendationBundle
  ) => {
    const target = referrals.find((r) => r.id === id);
    const nextSpecialist = SEED_SPECIALISTS.find((s) => s.id === specialistId);
    if (!target || !nextSpecialist) return;

    const timestamp = nowFormatted();
    const actor = target.referringPhysicianContact.physicianName || settings.physicianName;
    const reanalyzed = analyzeReferralDeterministic(
      target.patient,
      target.clinicalInput,
      nextSpecialist,
      target.documents,
      target.consultationNotes
    );

    const hasMissingAfterSwitch = reanalyzed.checklist.some(
      (c) => c.status === 'Missing' || c.status === 'Needs clarification'
    );
    const hasPendingAi = (target.consultationNotes?.aiNotes ?? []).some(
      (n) => n.reviewStatus === 'Pending physician review'
    );

    updateReferral(id, (prev) => {
      const nextStatus: ReferralStatus =
        prev.status === 'Awaiting Specialist Selection' ||
        prev.status === 'Draft' ||
        prev.status === 'Ready for submission'
          ? !hasMissingAfterSwitch && reanalyzed.completenessScore >= 90 && !hasPendingAi
            ? 'Ready for submission'
            : 'Draft'
          : prev.status;

      return {
        ...prev,
        specialistId: nextSpecialist.id,
        specialistName: nextSpecialist.name,
        specialty: nextSpecialist.specialty,
        receivingClinic: nextSpecialist.clinic,
        status: nextStatus,
        lastUpdated: todayIso(),
        completeness: reanalyzed.completenessScore,
        documentsComplete: hasMissingAfterSwitch ? false : prev.documentsComplete,
        aiSpecialistRecommendations: recommendationBundle ?? prev.aiSpecialistRecommendations,
        analysis: reanalyzed,
        patientNextSteps:
          nextStatus === 'Ready for submission' || nextStatus === 'Draft'
            ? `Your family physician selected ${nextSpecialist.name} at ${nextSpecialist.clinic} and is completing final review prior to transmission.`
            : prev.patientNextSteps,
        timeline: [
          ...prev.timeline,
          {
            id: `tl-spec-${Date.now()}`,
            title: `Receiving specialist confirmed: ${nextSpecialist.name}`,
            description: `Referral destination updated to ${nextSpecialist.clinic} (${nextSpecialist.specialty}); intake checklist re-evaluated (status: ${nextStatus}) without auto-submission.`,
            timestamp,
            actor,
            stage: 'organized',
          },
        ],
      };
    });

    showToast(
      `Confirmed ${nextSpecialist.name} (${nextSpecialist.clinic}) as receiving specialist.`
    );
  };

  const updateSettings = (partial: Partial<UserSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  const resetDemoData = () => {
    const freshReferrals = cloneSeedReferrals().map(normalizeReferral);
    const freshNotifications = cloneSeedNotifications();
    try {
      localStorage.setItem(STORAGE_KEYS.referrals, JSON.stringify(freshReferrals));
      localStorage.setItem(STORAGE_KEYS.notifications, JSON.stringify(freshNotifications));
    } catch {
      // ignore storage quota errors
    }
    void fetch('/api/referrals/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true }),
    }).catch(() => {});

    setReferrals(freshReferrals);
    setNotifications(freshNotifications);
    setSelectedReferralId(null);
    setSpecialistReviewReferralId(pickInitialSpecialistReviewId(freshReferrals));
    setEditingDraftId(null);
    setPreselectedSpecialistId(null);
    setGlobalSearchQuery('');
    setReferralFilterStatus('All');
    setPatientPortalReferralId(pickInitialPatientPortalId(freshReferrals));
    showToast('MediBridge demo restored to original demonstration state.');
  };

  return (
    <ClinBridgeContext.Provider
      value={{
        referrals,
        specialists: SEED_SPECIALISTS,
        notifications,
        settings,
        perspective,
        switchPerspective,
        activeSection,
        setActiveSection,
        selectedReferralId,
        openReferralRecord,
        closeReferralRecord,
        specialistReviewReferralId,
        openSpecialistReview,
        preselectedSpecialistId,
        editingDraftId,
        startNewReferral,
        patientPortalReferralId,
        setPatientPortalReferralId,
        globalSearchQuery,
        setGlobalSearchQuery,
        referralFilterStatus,
        setReferralFilterStatus,
        addReferral,
        updateReferral,
        simulateStatusTransition,
        markAnonymousReviewed,
        acceptConfidentialityAndUnlock,
        acceptReferral,
        requestClarification,
        respondToClarification,
        sendReferralMessage,
        markReferralMessagesRead,
        declineReferral,
        confirmReferralAppointment,
        cancelReferralAppointment,
        requestInsuranceInfo,
        updateInsuranceInfo,
        proposeEConsultation,
        respondEConsultation,
        respondToRescheduleRequest,
        sendEConsultationMessage,
        markEConsultMessagesRead,
        markNotificationRead,
        dismissNotification,
        markAllNotificationsRead,
        addNotification,
        markDocumentsComplete,
        recordChecklistException,
        selectReferralSpecialist,
        updateSettings,
        resetDemoData,
        toastMessage,
        showToast,
      }}
    >
      {children}
    </ClinBridgeContext.Provider>
  );
};

export function useClinBridge(): ClinBridgeContextValue {
  const ctx = useContext(ClinBridgeContext);
  if (!ctx) {
    throw new Error('useClinBridge must be used within ClinBridgeProvider');
  }
  return ctx;
}
