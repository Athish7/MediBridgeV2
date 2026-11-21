import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export type AccordionStatusKind = 'complete' | 'missing' | 'partial' | 'warning' | 'info';

interface AccordionSectionProps {
  id: string;
  title: string;
  subtitle?: string;
  isOpen: boolean;
  onToggle: () => void;
  statusKind?: AccordionStatusKind;
  statusLabel?: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}

export const AccordionSection: React.FC<AccordionSectionProps> = ({
  id,
  title,
  subtitle,
  isOpen,
  onToggle,
  statusKind = 'info',
  statusLabel,
  headerExtra,
  children,
}) => {
  const statusStyles: Record<
    AccordionStatusKind,
    { text: string; Icon: React.FC<{ className?: string }> | null }
  > = {
    complete: { text: 'text-emerald-700', Icon: CheckCircle2 },
    missing: { text: 'text-red-700', Icon: AlertTriangle },
    warning: { text: 'text-amber-700', Icon: AlertTriangle },
    partial: { text: 'text-amber-700', Icon: AlertCircle },
    info: { text: 'text-slate-500', Icon: null },
  };

  const { text: statusTextClass, Icon: StatusIcon } = statusStyles[statusKind];

  return (
    <section
      id={id}
      className={`border rounded-xl bg-white transition-colors ${
        statusKind === 'missing'
          ? 'border-amber-300'
          : isOpen
            ? 'border-slate-300'
            : 'border-slate-200'
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={`${id}-content`}
          className="flex-1 min-w-0 flex items-center justify-between gap-4 text-left group focus:outline-none"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900 group-hover:text-[#0F2942] transition-colors">
                {title}
              </h2>
              {statusLabel && (
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium tabular-nums ${statusTextClass}`}
                >
                  {StatusIcon && <StatusIcon className="w-3.5 h-3.5 shrink-0" />}
                  <span>{statusLabel}</span>
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed truncate sm:whitespace-normal">
                {subtitle}
              </p>
            )}
          </div>

          <span className="shrink-0 w-8 h-8 rounded-lg border border-slate-200 bg-slate-50 group-hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-colors">
            {isOpen ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </span>
        </button>

        {headerExtra && <div className="shrink-0">{headerExtra}</div>}
      </div>

      {isOpen && (
        <div
          id={`${id}-content`}
          className="border-t border-slate-100 px-4 py-4 sm:px-5 sm:py-5 space-y-4"
        >
          {children}
        </div>
      )}
    </section>
  );
};
