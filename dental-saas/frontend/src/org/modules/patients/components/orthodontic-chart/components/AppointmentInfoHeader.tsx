/**
 * AppointmentInfoHeader.tsx — Visit Session Header (Phase 2 Refactor)
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  This component has been FULLY REFACTORED from "Appointment" to         ║
 * ║  "Visit Session" semantics.                                              ║
 * ║                                                                          ║
 * ║  ❌ REMOVED: appointment prop, appointment timer, "End Appointment"     ║
 * ║  ✅ ADDED:   activeVisit, server-authoritative timer, "End Visit"       ║
 * ║                                                                          ║
 * ║  INVARIANTS:                                                             ║
 * ║  • Timer derives from visit.startedAt — NEVER frontend mount time       ║
 * ║  • End Visit finalizes snapshot + marks visit completed                 ║
 * ║  • All session data (visitId, doctorId) comes from visit object         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * LAYOUT:
 *   [ ← ] [ VISIT BADGE | visitType ] ║ [ TIMER ] [ END VISIT ] ║ [ DATE | # | DOCTOR ]
 */

import React from 'react';
import {
  Calendar,
  User,
  ChevronLeft,
  StopCircle,
  Play,
} from 'lucide-react';
import type { SnapshotListItem } from '../api/snapshot.api';
import type { TimelineEntry } from '../types';
import type { ActiveVisit } from '../api/visitSession.api';
import SnapshotSelector from './SnapshotSelector';
import VisitTimer from './VisitTimer';

// ── Visit-type label map ───────────────────────────────────────────────────────
const VISIT_TYPE_LABELS: Record<string, string> = {
  adjustment:    'Adjustment',
  diagnostic:    'Diagnostic',
  bonding:       'Bonding',
  debonding:     'Debonding',
  retention:     'Retention',
  emergency:     'Emergency',
  records:       'Records',
  consultation:  'Consultation',
};

// ── Visit-type badge colors ────────────────────────────────────────────────────
const VISIT_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  adjustment:   { bg: '#1e40af22', text: '#60a5fa', border: '#3b82f640' },
  diagnostic:   { bg: '#064e3b22', text: '#34d399', border: '#10b98140' },
  bonding:      { bg: '#4c1d9522', text: '#a78bfa', border: '#7c3aed40' },
  debonding:    { bg: '#7f1d1d22', text: '#f87171', border: '#ef444440' },
  retention:    { bg: '#1e3a5f22', text: '#67e8f9', border: '#06b6d440' },
  emergency:    { bg: '#7c2d1222', text: '#fb923c', border: '#f9731640' },
  records:      { bg: '#312e8122', text: '#818cf8', border: '#6366f140' },
  consultation: { bg: '#052e1622', text: '#4ade80', border: '#22c55e40' },
};

const DEFAULT_COLOR = { bg: '#0f172a', text: '#94a3b8', border: '#1e293b' };

// ── Types ────────────────────────────────────────────────────────────────────

export interface VisitSessionHeaderProps {
  /** Active visit session — SSOT for all session data */
  activeVisit: ActiveVisit | null;
  /** Called when the ← button is pressed */
  onBack: () => void;
  /** Called when "Start Visit" is clicked — only shown when activeVisit is null */
  onStartVisit?: () => void;
  /** Whether the Start Visit mutation is in flight */
  isStartingVisit?: boolean;
  /** Called when "End Visit" is confirmed — parent owns the mutation */
  onEndVisit: () => void;
  /** Whether the End Visit mutation is in flight */
  isEndingVisit?: boolean;
  // ── Snapshot Selector passthrough ──────────────────────────────────────
  snapshots?:          SnapshotListItem[];
  snapshotsLoading?:   boolean;
  activeSnapshotId?:   string | null;
  canDeleteSnapshots?: boolean;
  onRestoreSnapshot?:  (snapshot: SnapshotListItem) => void;
  onCreateSnapshot?:   () => void;
  onEditSnapshot?:     (snapshot: SnapshotListItem) => void;
  onDeleteSnapshot?:   (snapshot: SnapshotListItem) => void;
  // ── Timeline passthrough ────────────────────────────────────────────────
  timeline?:        TimelineEntry[];
  timelineLoading?: boolean;
  onSelectVisit?:   (entry: TimelineEntry) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

const AppointmentInfoHeader: React.FC<VisitSessionHeaderProps> = ({
  activeVisit,
  onBack,
  onStartVisit,
  isStartingVisit = false,
  onEndVisit,
  isEndingVisit = false,
  snapshots = [],
  snapshotsLoading = false,
  activeSnapshotId = null,
  canDeleteSnapshots = false,
  onRestoreSnapshot,
  onCreateSnapshot,
  onEditSnapshot,
  onDeleteSnapshot,
  timeline = [],
  timelineLoading = false,
  onSelectVisit,
}) => {
  // Resolve visit type label & badge color — only when a visit exists
  const rawType   = activeVisit?.visitType ?? null;
  const typeLabel = rawType ? (VISIT_TYPE_LABELS[rawType] ?? rawType.replace(/_/g, ' ')) : null;
  const typeColor = rawType ? (VISIT_TYPE_COLORS[rawType] ?? DEFAULT_COLOR) : DEFAULT_COLOR;

  // Resolve doctor display name — derive from visit DTO only; never hardcode
  const doctorDisplay = (activeVisit as any)?.doctorName
    ?? (activeVisit as any)?.doctor
    ?? '—';

  // Today's date (display only)
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month:   'short',
    day:     'numeric',
  });

  return (
    <header
      className="h-16 bg-[#0f1724] flex items-center justify-between px-6 z-[60] shadow-xl"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >

      {/* ── LEFT: Back + Visit identity ───────────────────────────────────── */}
      <div className="flex items-center gap-5 min-w-0">
        <button
          id="btn-back-from-visit"
          onClick={onBack}
          aria-label="Back"
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="h-6 w-px bg-white/8 flex-shrink-0" />

        <div className="flex flex-col min-w-0">
          <h2 className="text-xs font-bold text-white tracking-tight leading-none mb-0.5">
            Clinical Chart
          </h2>
          <div className="flex items-center gap-2">
            {/* Visit-type badge — only shown when a visit is active */}
            {typeLabel && (
              <span
                className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md"
                style={{
                  background: typeColor.bg,
                  color:      typeColor.text,
                  border:     `1px solid ${typeColor.border}`,
                }}
              >
                {typeLabel}
              </span>
            )}

            {/* Visit number — only shown when a visit is active */}
            {activeVisit?.visitNumber != null && (
              <>
                <div className="w-1 h-1 rounded-full bg-slate-600" />
                <span className="text-[10px] font-medium text-slate-500">
                  Visit #{activeVisit.visitNumber}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── CENTER: State-driven visit controls ───────────────────────────── */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3">
        {activeVisit ? (
          <>
            {/* Snapshot version selector — only shown during an active visit */}
            <SnapshotSelector
              snapshots={snapshots}
              timeline={timeline}
              timelineLoading={timelineLoading}
              activeId={activeSnapshotId}
              isLoading={snapshotsLoading}
              canDelete={canDeleteSnapshots}
              onSelectVisit={onSelectVisit}
              onSelect={(s) => onRestoreSnapshot?.(s)}
              onCreate={() => onCreateSnapshot?.()}
              onEdit={(s) => onEditSnapshot?.(s)}
              onDelete={(s) => onDeleteSnapshot?.(s)}
            />

            {/* Live timer — derives from server-authoritative startedAt */}
            <VisitTimer startedAt={activeVisit.startedAt} />

            {/* End Visit button */}
            <button
              id="btn-end-visit"
              onClick={onEndVisit}
              disabled={isEndingVisit}
              aria-label="End clinical visit session"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-[11px] uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: isEndingVisit
                  ? 'rgba(239,68,68,0.2)'
                  : 'linear-gradient(135deg, #dc2626, #b91c1c)',
                color:      '#fff',
                boxShadow:  isEndingVisit ? 'none' : '0 4px 14px rgba(220,38,38,0.35)',
              }}
            >
              {isEndingVisit ? (
                <>
                  <div
                    className="w-3 h-3 border-2 rounded-full animate-spin"
                    style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }}
                  />
                  Ending…
                </>
              ) : (
                <>
                  <StopCircle className="w-3.5 h-3.5" />
                  End Visit
                </>
              )}
            </button>
          </>
        ) : (
          /* No active visit — show Start Visit CTA */
          <button
            id="btn-start-visit"
            onClick={onStartVisit}
            disabled={isStartingVisit || !onStartVisit}
            aria-label="Start a new clinical visit session"
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl font-bold text-[11px] uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: isStartingVisit
                ? 'rgba(37,99,235,0.3)'
                : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color:     '#fff',
              boxShadow: isStartingVisit ? 'none' : '0 4px 14px rgba(37,99,235,0.35)',
            }}
          >
            {isStartingVisit ? (
              <>
                <div
                  className="w-3 h-3 border-2 rounded-full animate-spin"
                  style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }}
                />
                Starting…
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Start Visit
              </>
            )}
          </button>
        )}
      </div>

      {/* ── RIGHT: Date + Doctor ─────────────────────────────────────────── */}
      <div className="flex items-center gap-6">
        {/* Today's date */}
        <div className="flex flex-col items-end">
          <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Date</span>
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
            <Calendar className="w-3 h-3 text-blue-400" />
            {today}
          </div>
        </div>

        <div className="w-px h-7 bg-white/6" />

        {/* Doctor */}
        <div className="flex flex-col items-end">
          <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Doctor</span>
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
            <User className="w-3 h-3 text-blue-400" />
            {doctorDisplay}
          </div>
        </div>
      </div>
    </header>
  );
};

export default AppointmentInfoHeader;
