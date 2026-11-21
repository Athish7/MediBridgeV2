import React from 'react';
import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Clock,
  Compass,
  Eye,
  FileCheck2,
  FileEdit,
  LockOpen,
  Scale,
  Send,
  ShieldCheck,
  Video,
  XCircle,
} from 'lucide-react';
import type {
  ChecklistStatus,
  ReferralStatus,
  ReferralUrgency,
  VerificationState,
} from '../types/clinbridge';

export const StatusIndicator: React.FC<{ status: ReferralStatus }> = ({ status }) => {
  const config: Record<
    ReferralStatus,
    { color: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    Draft: { color: 'text-slate-600', Icon: FileEdit },
    'Awaiting Specialist Selection': { color: 'text-indigo-700', Icon: Compass },
    'Ready for submission': { color: 'text-teal-700', Icon: FileCheck2 },
    Submitted: { color: 'text-sky-700', Icon: Send },
    'Awaiting Specialist Review': { color: 'text-indigo-700', Icon: Clock },
    'Awaiting specialist review': { color: 'text-indigo-700', Icon: Clock },
    'Anonymous Information Reviewed': { color: 'text-slate-700', Icon: Eye },
    'Confidentiality Agreement Accepted': { color: 'text-teal-700', Icon: ShieldCheck },
    'Full Information Unlocked': { color: 'text-teal-800', Icon: LockOpen },
    'Awaiting Specialist Decision': { color: 'text-indigo-800', Icon: Scale },
    Accepted: { color: 'text-emerald-700', Icon: CheckCircle2 },
    Declined: { color: 'text-rose-700', Icon: XCircle },
    'Additional Information Requested': { color: 'text-amber-700', Icon: AlertTriangle },
    'Clarification requested': { color: 'text-amber-700', Icon: AlertTriangle },
    'Appointment Proposed': { color: 'text-sky-800', Icon: CalendarClock },
    'E-Consultation Awaiting Patient Approval': { color: 'text-indigo-700', Icon: Video },
    'Reschedule Requested': { color: 'text-amber-700', Icon: CalendarClock },
    'E-Consultation Confirmed': { color: 'text-teal-800', Icon: Video },
    'Appointment Confirmed': { color: 'text-teal-800', Icon: CalendarCheck },
    'Appointment confirmed': { color: 'text-teal-800', Icon: CalendarCheck },
    Completed: { color: 'text-emerald-800', Icon: ShieldCheck },
  };

  const entry = config[status] ?? { color: 'text-slate-700', Icon: Clock };
  const { color, Icon } = entry;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${color}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{status}</span>
    </span>
  );
};

export const UrgencyLabel: React.FC<{ urgency?: ReferralUrgency }> = ({ urgency = 'Routine' }) => {
  const color =
    urgency === 'Urgent'
      ? 'text-rose-700'
      : urgency === 'Semi-Urgent'
        ? 'text-amber-700'
        : 'text-slate-600';
  return (
    <span className={`text-xs font-semibold whitespace-nowrap ${color}`}>
      {urgency}
    </span>
  );
};

export const ChecklistStatusIndicator: React.FC<{ status: ChecklistStatus }> = ({ status }) => {
  const config: Record<ChecklistStatus, { color: string; Icon: React.ComponentType<{ className?: string }> }> = {
    Provided: { color: 'text-teal-700', Icon: CheckCircle2 },
    'Clinician verified': { color: 'text-emerald-700', Icon: ShieldCheck },
    'Needs clarification': { color: 'text-amber-700', Icon: AlertTriangle },
    Missing: { color: 'text-rose-700', Icon: AlertTriangle },
  };

  const { color, Icon } = config[status];

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${color}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{status}</span>
    </span>
  );
};

export const VerificationLabel: React.FC<{ state: VerificationState }> = ({ state }) => {
  const styles: Record<VerificationState, string> = {
    'Extracted from provided information': 'text-sky-700',
    'Needs clinician review': 'text-amber-700',
    Missing: 'text-rose-700',
    'Clinician verified': 'text-emerald-700',
  };

  return (
    <span className={`text-xs font-medium whitespace-nowrap ${styles[state]}`}>
      {state}
    </span>
  );
};

export const CompletenessMeter: React.FC<{ value: number }> = ({ value }) => {
  const barColor =
    value >= 90 ? 'bg-emerald-600' : value >= 70 ? 'bg-teal-600' : 'bg-amber-600';

  return (
    <div className="flex items-center gap-2.5 min-w-[100px]">
      <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${Math.max(4, Math.min(100, value))}%` }}
        />
      </div>
      <span className="font-mono text-xs font-medium text-slate-700 tabular-nums">
        {value}%
      </span>
    </div>
  );
};
