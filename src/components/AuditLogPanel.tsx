import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import type { AuditLogEntry } from '../types/clinbridge';

interface AuditLogPanelProps {
  entries?: AuditLogEntry[];
  title?: string;
}

export const AuditLogPanel: React.FC<AuditLogPanelProps> = ({
  entries = [],
  title = 'Privacy, Confidentiality & Access Audit Log',
}) => {
  const [open, setOpen] = useState(false);

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-3.5 bg-slate-50/70 flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#0F2942] shrink-0" />
          <span className="font-display text-sm font-semibold text-slate-900">
            {title} ({entries.length})
          </span>
        </div>
        <span className="text-xs text-slate-500 inline-flex items-center gap-1">
          <span>{open ? 'Hide audit trail' : 'View audit trail'}</span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-100">
          {entries.length === 0 ? (
            <div className="p-5 text-xs text-slate-500">
              No privacy or clinical access audit events recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-[#0F2942]">
                        {entry.action}
                      </span>
                      <span className="text-slate-700 font-medium">
                        {entry.actorName} ({entry.actorId})
                      </span>
                    </div>
                    <div className="text-slate-600">{entry.details}</div>
                  </div>
                  <div className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                    {entry.timestamp}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500">
            Prototype audit simulation demonstrating server-enforced Stage 1 de-identification and Stage 2 confidentiality logging (not a certified PHIPA/HIPAA production ledger).
          </div>
        </div>
      )}
    </section>
  );
};
