/**
 * VisitModal.tsx — Read-Only Visit Report Modal
 * Domain: orthodontic-visits
 * Layer: UI Component
 *
 * OrthoFlow Clinical design — wide modal with glass header,
 * archwire cards, clinical actions/alerts grid, notes, attachments, recall.
 *
 * MUST NOT:
 *   - Allow editing
 *   - Trigger any mutation
 *   - Call any POST/PATCH/DELETE API
 */

import React from 'react';
import {
  X,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  AlertCircle,
  Zap,
  Calendar,
  Eye,
  BarChart3,
  Camera,
  ZoomIn,
  Mic,
  FileText,
  Clock,
} from 'lucide-react';
import { useVisitReport } from '../hooks/useVisitReport';
import type { VisitReportDTO } from '../api/visitReport.api';
import './VisitModal.css';

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(raw: string | number | null): string {
  if (!raw) return '\u2014';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '\u2014';
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatRecallDate(raw: string | number | null): string {
  if (!raw) return '\u2014';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '\u2014';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(raw: string | number | null): string {
  if (!raw) return '\u2014';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '\u2014';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function formatTime(raw: string | number | null): string {
  if (!raw) return '\u2014';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '\u2014';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const VISIT_TYPE_LABELS: Record<string, string> = {
  adjustment:   'Adjustment',
  diagnostic:   'Diagnostic',
  bonding:      'Bonding',
  debonding:    'Debonding',
  retention:    'Retention',
  emergency:    'Emergency',
  records:      'Records',
  consultation: 'Consultation',
};

// ── Action icon picker ──────────────────────────────────────────────────────

const ACTION_ICONS: [RegExp, React.ReactNode][] = [
  [/archwire|wire/i,     <Zap key="w" size={18} className="text-blue-600" />],
  [/miniscrew|tad|screw/i, <AlertCircle key="m" size={18} className="text-blue-600" />],
  [/elastic/i,           <Zap key="e" size={18} className="text-blue-600" />],
];

function getActionIcon(label: string): React.ReactNode {
  for (const [re, icon] of ACTION_ICONS) {
    if (re.test(label)) return icon;
  }
  return <Zap size={18} className="text-blue-600" />;
}

// ── Props ───────────────────────────────────────────────────────────────────

interface VisitModalProps {
  visitId: string;
  onClose: () => void;
  onViewSnapshot?: (snapshotId: string) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

const VisitModal: React.FC<VisitModalProps> = ({ visitId, onClose, onViewSnapshot }) => {
  const { data: report, isLoading, error } = useVisitReport(visitId);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  // ── Loading ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="vm-backdrop" onClick={handleBackdropClick}>
        <div className="vm-dialog--state">
          <div className="w-9 h-9 border-[3px] border-slate-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-400 font-medium">Loading visit report...</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────
  if (error || !report) {
    return (
      <div className="vm-backdrop" onClick={handleBackdropClick}>
        <div className="vm-dialog--state">
          <AlertTriangle size={32} className="text-red-400" />
          <p className="text-sm text-slate-500 font-medium">Failed to load visit report</p>
          <button
            className="px-5 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const r = report as VisitReportDTO;
  const hasAlerts = r.summary.alerts.length > 0;
  const hasActions = r.summary.keyActions.length > 0;
  const hasNotes = !!(r.snapshot?.notes?.text || r.visitNotes);
  const hasAttachments = r.snapshot?.attachments && r.snapshot.attachments.length > 0;
  const hasVoiceNotes = r.voiceNotes && r.voiceNotes.length > 0;

  return (
    <div className="vm-backdrop" onClick={handleBackdropClick}>
      <div
        className="vm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Visit #${r.visitNumber} Report`}
      >
        {/* ═══ STICKY HEADER ═══════════════════════════════════════════ */}
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 px-8 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 font-manrope">
              Visit #{r.visitNumber}
            </h1>
            <span className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold tracking-wide uppercase">
              {VISIT_TYPE_LABELS[r.visitType] ?? r.visitType}
            </span>
            <span className="text-sm font-medium text-slate-500 ml-2">
              {formatDate(r.visitDate)}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-4 text-sm font-medium text-slate-600">
              <div className="flex items-center gap-1.5">
                <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-700">
                  {r.doctorName
                    ? r.doctorName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
                    : '\u2014'}
                </span>
                <span>{r.doctorName ? `Dr. ${r.doctorName}` : '\u2014'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock size={14} className="text-slate-400" />
                <span>{r.durationMin != null ? `${r.durationMin} min` : '\u2014'}</span>
              </div>
            </div>

            {/* Next Recall chip */}
            <div className="flex items-center gap-3 pl-4 border-l border-slate-200/70">
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <Calendar size={14} />
              </div>
              <div className="flex items-center gap-4">
                <div className="leading-tight">
                  <p className="text-[9px] font-semibold text-blue-700 tracking-wider uppercase">Duration</p>
                  <p className="text-xs font-bold text-slate-900">
                    {r.recall?.interval ? r.recall.interval.replace(/_/g, ' ') : '\u2014'}
                  </p>
                </div>
                <div className="leading-tight">
                  <p className="text-[9px] font-semibold text-blue-700 tracking-wider uppercase">Date</p>
                  <p className="text-xs font-bold text-slate-900">
                    {r.recall?.suggestedDate ? formatRecallDate(r.recall.suggestedDate) : '\u2014'}
                  </p>
                </div>
              </div>
            </div>

            <button
              className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors"
              onClick={onClose}
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* ═══ AT-A-GLANCE CHIP ROW ═══════════════════════════════════ */}
        <div className="px-8 py-3 border-b border-slate-100 bg-slate-50/40 flex flex-wrap items-center gap-2">
          {(() => {
            const apptPopulated = !!r.appointment;
            const apptLabel = apptPopulated && r.appointment!.startTime
              ? formatShortDate(r.appointment!.startTime)
              : '\u2014';
            return (
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                  apptPopulated ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-400'
                }`}
              >
                <Calendar size={12} />
                Appt: {apptLabel}
              </span>
            );
          })()}

          {(() => {
            const wireParts: string[] = [];
            if (r.summary.wires.upper) wireParts.push('U');
            if (r.summary.wires.lower) wireParts.push('L');
            const populated = wireParts.length > 0;
            return (
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                  populated ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-400'
                }`}
              >
                <Zap size={12} />
                Wires: {populated ? wireParts.join('/') : '\u2014'}
              </span>
            );
          })()}

          {(() => {
            const populated = hasNotes;
            return (
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                  populated ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-400'
                }`}
              >
                <FileText size={12} />
                Notes: {populated ? '\u2713' : '\u2014'}
              </span>
            );
          })()}

          {(() => {
            const count = r.snapshot?.attachments?.length || 0;
            const populated = count > 0;
            return (
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                  populated ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-400'
                }`}
              >
                <Camera size={12} />
                Files: {populated ? count : '\u2014'}
              </span>
            );
          })()}
        </div>

        {/* ═══ SCROLLABLE BODY ═════════════════════════════════════════ */}
        <div className="overflow-y-auto p-8 space-y-10 vm-scroll">

          {/* ── Section: Active Archwires ──────────────────────────────── */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-blue-700 tracking-wider mb-1">UPPER ARCH</p>
                <p className="font-manrope font-bold text-lg text-slate-900">
                  {r.summary.wires.upper || '\u2014'}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm shrink-0">
                <ChevronUp size={20} />
              </div>
            </div>
            <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-indigo-700 tracking-wider mb-1">LOWER ARCH</p>
                <p className="font-manrope font-bold text-lg text-slate-900">
                  {r.summary.wires.lower || '\u2014'}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-indigo-500 flex items-center justify-center text-white shadow-sm shrink-0">
                <ChevronDown size={20} />
              </div>
            </div>
          </section>

          {/* ── Section: Linked Appointment ────────────────────────────── */}
          <section>
            <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-5 flex items-center gap-5">
              <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <Calendar size={22} />
              </div>
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 tracking-wider mb-0.5">STATUS</p>
                  <p className="font-medium text-slate-900">
                    {r.appointment ? 'SCHEDULED' : '\u2014'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 tracking-wider mb-0.5">DATE</p>
                  <p className="font-medium text-slate-900">
                    {r.appointment ? formatDate(r.appointment.startTime) : '\u2014'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-slate-400" />
                  <div>
                    <p className="text-[11px] font-semibold text-slate-500 tracking-wider mb-0.5">TIME</p>
                    <p className="font-medium text-slate-900">
                      {r.appointment
                        ? `${formatTime(r.appointment.startTime)} \u2013 ${formatTime(r.appointment.endTime)}`
                        : '\u2014'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Grid: Clinical Actions + Alerts ───────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Clinical Actions */}
            <section className="lg:col-span-2">
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <h3 className="font-manrope font-bold text-sm tracking-wide text-slate-900 mb-5">
                  CLINICAL ACTIONS
                </h3>
                <div className="space-y-4">
                  {hasActions ? (
                    r.summary.keyActions.map((action, i) => (
                      <div key={i} className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                          {getActionIcon(action)}
                        </div>
                        <span className="text-sm font-medium text-slate-800">{action}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                        <Zap size={16} />
                      </div>
                      <span className="text-sm font-medium text-slate-400">{'\u2014'}</span>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Clinical Alerts */}
            <section>
              <div className="flex flex-col gap-3">
                {hasAlerts ? (
                  r.summary.alerts.map((alert, i) => (
                    <div
                      key={i}
                      className={`p-4 rounded-r-xl flex items-start gap-3 border-l-4 ${
                        i === 0
                          ? 'bg-red-50/60 border-red-500'
                          : 'bg-amber-50/60 border-amber-500'
                      }`}
                    >
                      {i === 0 ? (
                        <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                      )}
                      <p className="text-sm font-medium text-slate-800 leading-snug">{alert}</p>
                    </div>
                  ))
                ) : (
                  <div className="p-4 rounded-r-xl flex items-start gap-3 border-l-4 bg-slate-50 border-slate-300">
                    <AlertCircle size={18} className="text-slate-400 shrink-0 mt-0.5" />
                    <p className="text-sm font-medium text-slate-400 leading-snug">{'\u2014'}</p>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* ── Section: Clinical Notes ────────────────────────────────── */}
          <section className="bg-slate-50 border border-slate-200 rounded-xl p-6 relative">
            <span className="absolute top-6 right-6 px-2 py-1 bg-slate-200 text-slate-500 text-[10px] font-bold rounded uppercase tracking-widest">
              Read Only
            </span>
            <h3 className="font-manrope font-bold text-sm tracking-wide text-slate-900 mb-4">
              CLINICAL NOTES
            </h3>
            <div className="text-sm font-medium text-slate-600 leading-relaxed space-y-3">
              {hasNotes ? (
                <>
                  {r.snapshot?.notes?.text && (
                    <p className="whitespace-pre-wrap">{r.snapshot.notes.text}</p>
                  )}
                  {r.visitNotes && r.snapshot?.notes?.text && (
                    <hr className="border-slate-200" />
                  )}
                  {r.visitNotes && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                        Visit Notes
                      </p>
                      <p className="whitespace-pre-wrap">{r.visitNotes}</p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-slate-400">{'\u2014'}</p>
              )}
            </div>
          </section>

          {/* ── Section: Voice Notes ───────────────────────────────────── */}
          <section>
            <h3 className="font-manrope font-bold text-sm tracking-wide text-slate-900 mb-4">
              VOICE NOTES {hasVoiceNotes ? `(${r.voiceNotes.length})` : ''}
            </h3>
            <div className="flex flex-wrap gap-2">
              {hasVoiceNotes ? (
                r.voiceNotes.map((vn: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg text-xs text-slate-600 font-medium">
                    <Mic size={12} className="text-slate-400" />
                    <span>{vn.duration ? `${Math.round(vn.duration)}s` : 'Recording'}</span>
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg text-xs text-slate-400 font-medium">
                  <Mic size={12} className="text-slate-300" />
                  <span>{'\u2014'}</span>
                </div>
              )}
            </div>
          </section>

          {/* ── Section: Attachments ───────────────────────────────────── */}
          <section>
            <h3 className="font-manrope font-bold text-sm tracking-wide text-slate-900 mb-4">
              ATTACHMENTS
            </h3>
            <div className="flex gap-4 overflow-x-auto pb-2 vm-scroll">
              {hasAttachments ? (
                r.snapshot!.attachments.map((att: any, i: number) => (
                  <div
                    key={att.id || i}
                    className="group w-32 h-32 rounded-xl bg-slate-100 overflow-hidden relative shrink-0 cursor-pointer"
                  >
                    {att.signedUrl ? (
                      <img
                        src={att.signedUrl || "/placeholder.png"}
                        alt={att.fileName || `Attachment ${i + 1}`}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/placeholder.png"; }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Camera size={24} className="text-slate-300" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <ZoomIn size={20} className="text-white" />
                    </div>
                    {att.type && (
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent flex items-end p-3 pointer-events-none">
                        <span className="text-[10px] font-bold text-white tracking-wider uppercase">
                          {att.type}
                        </span>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="w-32 h-32 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 shrink-0">
                  <Camera size={24} className="text-slate-300" />
                  <span className="text-xs font-medium text-slate-400">{'\u2014'}</span>
                </div>
              )}
            </div>
          </section>

        </div>

        {/* ═══ FOOTER ═════════════════════════════════════════════════ */}
        <footer className="sticky bottom-0 z-10 bg-white border-t border-slate-200/60 px-8 py-4 flex items-center justify-between gap-4 shrink-0">
          {r.snapshot && onViewSnapshot ? (
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
              onClick={() => onViewSnapshot(r.snapshot!.id)}
            >
              <BarChart3 size={16} />
              View Clinical Snapshot
            </button>
          ) : (
            <div />
          )}
          <button
            className="px-6 py-2.5 rounded-full text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 shadow-[0_4px_12px_-2px_rgba(37,99,235,0.3)] hover:opacity-90 transition-opacity active:scale-95"
            onClick={onClose}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
};

export default VisitModal;
