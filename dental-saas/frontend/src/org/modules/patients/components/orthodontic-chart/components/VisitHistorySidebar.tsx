/**
 * VisitHistorySidebar.tsx
 * Domain: orthodontic-chart
 * Layer: UI Component
 *
 * Replaces SnapshotHistorySidebar — now visit-aware.
 * Consumes TimelineEntry[] (from useCaseTimeline) instead of raw snapshots.
 *
 * FIX-4: Skeleton loading state.
 * FIX-6: Appointment-only entries (snapshotId null) rendered as disabled gray card.
 * FIX-7: All optional fields accessed with ?. guards.
 */

import React from 'react';
import { Eye, History, Calendar, Activity, CheckCircle2 } from 'lucide-react';
import type { TimelineEntry } from '../types';

// ── Visit type label map ─────────────────────────────────────────────────────

const VISIT_TYPE_LABELS: Record<string, string> = {
  bonding:    'Bonding',
  adjustment: 'Adjustment',
  wire_change: 'Wire Change',
  debonding:  'Debonding',
  treatment:  'Treatment',
  diagnostic: 'Diagnostic',
};

const VISIT_TYPE_COLORS: Record<string, string> = {
  bonding:    'bg-purple-100 text-purple-700 border-purple-200',
  adjustment: 'bg-blue-100 text-blue-700 border-blue-200',
  wire_change: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  debonding:  'bg-orange-100 text-orange-700 border-orange-200',
  treatment:  'bg-emerald-100 text-emerald-700 border-emerald-200',
  diagnostic: 'bg-slate-100 text-slate-600 border-slate-200',
};

const formatDate = (raw: string | number | null): string => {
  if (!raw) return '—';
  const d = new Date(typeof raw === 'number' ? raw : raw);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
};

// ── Props ────────────────────────────────────────────────────────────────────

interface VisitHistorySidebarProps {
  /** Unified visit-based timeline from useCaseTimeline */
  timeline: TimelineEntry[];
  isLoading?: boolean;
  /** Called when user clicks "Restore" on a visit with a snapshot */
  onSelectVisit: (entry: TimelineEntry) => void;
  /** Currently active snapshot id (for highlight) */
  activeSnapshotId?: string | null;
}

// ── Component ────────────────────────────────────────────────────────────────

const VisitHistorySidebar: React.FC<VisitHistorySidebarProps> = ({
  timeline,
  isLoading = false,
  onSelectVisit,
  activeSnapshotId,
}) => {
  // FIX-4: Skeleton loading state — 3 placeholder cards
  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="animate-pulse h-16 bg-slate-100 rounded-lg" />
        ))}
      </div>
    );
  }

  // Empty state
  if (timeline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
          <History className="w-6 h-6 text-slate-300" />
        </div>
        <p className="text-sm font-bold text-slate-400">No visits recorded yet</p>
        <p className="text-xs text-slate-400 leading-relaxed">
          Save your first snapshot to begin the clinical timeline.
        </p>
      </div>
    );
  }


  return (
    <div className="p-3 space-y-2">
      {/* Section header */}
      <div className="flex items-center gap-2 px-1 mb-3">
        <Activity className="w-3.5 h-3.5 text-blue-600" />
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          Visit History ({timeline.length})
        </span>
      </div>

      {timeline.map((entry) => {
        // FIX-6: appointment-only entries — render as disabled gray card (no click)
        if (!entry.snapshotId) {
          return (
            <div
              key={entry.visitId ?? `appt-${entry.visitNumber}`}
              className="rounded-xl border border-slate-200 bg-slate-50 p-3 opacity-60"
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-500">Scheduled Appointment</p>
                  {/* FIX-7 */ }
                  <p className="text-[10px] text-slate-400">{formatDate(entry.visitDate ?? null)}</p>
                </div>
                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                  SCHEDULED
                </span>
              </div>
            </div>
          );
        }

        // Visit with snapshot — clickable, restoreable
        const isActive = activeSnapshotId === entry.snapshotId;
        const typeLabel = VISIT_TYPE_LABELS[entry.type ?? ''] ?? 'Visit';
        const typeColor = VISIT_TYPE_COLORS[entry.type ?? ''] ?? VISIT_TYPE_COLORS.treatment;
        // FIX-7: defensive access on all optional fields
        const procedureCount = entry.procedures?.length ?? 0;
        const clinicalNote   = entry.notes?.clinical ?? '';
        const hasThumbnail   = !!entry.thumbnail;

        return (
          <div
            key={entry.visitId ?? entry.snapshotId}
            onClick={() => onSelectVisit(entry)}
            className={`
              group relative rounded-xl border p-3 cursor-pointer transition-all
              ${isActive
                ? 'border-blue-400 bg-blue-50/60 ring-2 ring-blue-200'
                : 'border-blue-200 bg-blue-50/20 hover:border-blue-400 hover:bg-blue-50/50'
              }
            `}
          >
            {/* Row 1: visit number + date */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-blue-700">
                  Visit #{entry.visitNumber ?? '—'}
                </span>
                {isActive && (
                  <CheckCircle2 className="w-3 h-3 text-blue-600" />
                )}
              </div>
              <span className="text-[10px] text-slate-400 shrink-0">
                {formatDate(entry.visitDate ?? null)}
              </span>
            </div>

            {/* Row 2: type badge + procedures count */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex text-[9px] font-bold px-1.5 py-0.5 rounded border ${typeColor}`}>
                {typeLabel}
              </span>
              {procedureCount > 0 && (
                <span className="text-[9px] text-slate-500">
                  {procedureCount} procedure{procedureCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Row 3: clinical note excerpt */}
            {clinicalNote && (
              <p className="text-[10px] text-slate-500 mt-1.5 italic leading-snug line-clamp-2">
                {clinicalNote}
              </p>
            )}

            {/* Hover overlay: "Restore" */}
            <div className="absolute inset-0 rounded-xl bg-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-1 bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm">
                <Eye className="w-3 h-3" />
                Preview &amp; Restore
              </div>
            </div>

            {/* Thumbnail indicator */}
            {hasThumbnail && (
              <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-400 opacity-60" title="Has thumbnail" />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default VisitHistorySidebar;
