import React, { useEffect, useState } from 'react';
import { Lock, MessageSquare, Send } from 'lucide-react';
import type { Referral } from '../types/clinbridge';

interface SecurePatientMessagingPanelProps {
  referral: Referral;
  viewerRole: 'specialist' | 'patient';
  onSendMessage: (content: string) => Promise<void> | void;
  onMarkRead?: () => void;
}

export const SecurePatientMessagingPanel: React.FC<SecurePatientMessagingPanelProps> = ({
  referral,
  viewerRole,
  onSendMessage,
  onMarkRead,
}) => {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const messages = referral.eConsultation?.messages ?? [];
  const unreadCount = messages.filter((m) =>
    viewerRole === 'specialist' ? !m.readBySpecialist : !m.readByPatient
  ).length;

  useEffect(() => {
    if (unreadCount > 0 && onMarkRead) {
      onMarkRead();
    }
  }, [unreadCount, onMarkRead]);

  const contextLabel = referral.confirmedAppointment
    ? `${referral.confirmedAppointment.mode ?? 'Consultation'} · ${referral.confirmedAppointment.date} at ${referral.confirmedAppointment.time}`
    : referral.eConsultation
      ? `${referral.eConsultation.consultationMode} · ${referral.eConsultation.proposedDate} at ${referral.eConsultation.proposedTime}`
      : `Referral ${referral.id}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    try {
      await onSendMessage(draft.trim());
      setDraft('');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <MessageSquare className="w-4 h-4 text-[#0F2942]" />
            <span>Secure Specialist–Patient Messaging</span>
            {unreadCount > 0 && (
              <span className="text-xs font-semibold text-teal-700">
                · {unreadCount} unread
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{contextLabel}</div>
        </div>

        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
          <Lock className="w-3 h-3" />
          In-platform only · Contact PII protected
        </span>
      </div>

      <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No secure messages yet. Send pre-consultation coordination or preparation questions here.
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderRole === viewerRole;
            return (
              <div
                key={msg.id}
                className={`p-4 space-y-1 ${isMine ? 'bg-teal-50/35' : 'bg-white'}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-900">
                    {msg.senderRole === 'specialist'
                      ? `${referral.specialistName} (${referral.receivingClinic})`
                      : `${referral.patient.name} (Patient)`}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                    {msg.timestamp}
                  </span>
                </div>
                <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </p>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-2.5">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              viewerRole === 'specialist'
                ? 'Send pre-consultation instructions or message to patient...'
                : 'Send a secure message or preparation question to your specialist clinic...'
            }
            aria-label="Secure consultation message"
            className="flex-1 px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2942]"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0F2942] hover:bg-[#173A5C] disabled:opacity-45 rounded-lg inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send Message</span>
          </button>
        </div>
        <div className="text-[11px] text-slate-500">
          Direct patient phone, street address, and email remain withheld from casual messaging threads.
        </div>
      </form>
    </section>
  );
};
