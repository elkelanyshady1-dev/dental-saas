/**
 * OrthoTimelineTab.tsx
 * Domain: orthodontic-chart
 * UI Design: Stitch "Clinical Flow" design system
 *
 * FULLY REBUILT — replaces appointment-based mock with useCaseTimeline.
 *
 * FIX-6: Appointment-only entries (snapshotId null) → null (skip until backend merges)
 * FIX-7: All optional fields guarded with ?. and ?? operators
 * FIX-8: console.log('[TIMELINE]', timeline) debug audit
 *
 * Layout: 7/5 asymmetric two-column grid
 *   LEFT  — Timeline Feed (visit cards on a vertical line)
 *   RIGHT — Case Summary stat cards + Recent Procedures list
 */

import React from 'react';
import {
  Calendar,
  Eye,
  Activity,
  Clock,
  Zap,
  History,
  CheckCircle2,
} from 'lucide-react';

import { useCaseTimeline } from '../../hooks/useSnapshots';
import type { TimelineEntry } from '../../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (raw: string | number | null | undefined): string => {
  if (!raw) return '—';
  const d = new Date(typeof raw === 'number' ? raw : raw);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
};

const VISIT_TYPE_LABELS: Record<string, string> = {
  bonding:    'Bonding',
  adjustment: 'Adjustment',
  wire_change: 'Wire Change',
  debonding:  'Debonding',
  treatment:  'Treatment',
  diagnostic: 'Diagnostic',
};

const VISIT_TYPE_BADGE: Record<string, { bg: string; text: string; border: string }> = {
  bonding:     { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200' },
  adjustment:  { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200'   },
  wire_change: { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200'   },
  debonding:   { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200' },
  treatment:   { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200'},
  diagnostic:  { bg: 'bg-slate-50',   text: 'text-slate-600',   border: 'border-slate-200'  },
};

const DOT_COLORS: Record<string, string> = {
  bonding:    'bg-purple-500',
  adjustment: 'bg-blue-500',
  wire_change:'bg-cyan-500',
  debonding:  'bg-orange-500',
  treatment:  'bg-emerald-500',
  diagnostic: 'bg-slate-400',
};

// ── Props ────────────────────────────────────────────────────────────────────

interface OrthoTimelineTabProps {
  /** Valid MongoDB 24-char ObjectId for the active case */
  caseId?: string;
  /** Called when the user wants to open a visit (active or completed) */
  onOpenSnapshotEditor?: (visitId: string) => void;
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="relative animate-pulse">
      <div className="absolute -left-[29px] top-2 w-5 h-5 rounded-full bg-slate-200 border-4 border-white shadow-sm z-10" />
      <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3"
        style={{ boxShadow: '0 20px 40px rgba(11,28,48,0.06)' }}>
        <div className="flex justify-between">
          <div className="h-4 w-24 bg-slate-100 rounded" />
          <div className="h-4 w-20 bg-slate-100 rounded" />
        </div>
        <div className="h-3 w-20 bg-slate-100 rounded" />
        <div className="space-y-2">
          <div className="h-3 w-full bg-slate-100 rounded" />
          <div className="h-3 w-3/4 bg-slate-100 rounded" />
        </div>
      </div>
    </div>
  );
}

// ── Visit Card ────────────────────────────────────────────────────────────────

function VisitCard({
  entry,
  isLatest,
  onView,
}: {
  entry: TimelineEntry;
  isLatest: boolean;
  onView?: (visitId: string) => void;
}) {
  const typeKey   = entry.type ?? 'treatment';
  const badge     = VISIT_TYPE_BADGE[typeKey] ?? VISIT_TYPE_BADGE.treatment;
  const dotColor  = DOT_COLORS[typeKey]       ?? DOT_COLORS.treatment;
  const typeLabel = VISIT_TYPE_LABELS[typeKey] ?? 'Visit';
  const isActive  = entry.status === 'active';
  // FIX-7: defensive access
  const procs        = entry.procedures ?? [];
  const clinicalNote = entry.notes?.clinical ?? '';
  const hasThumbnail = !!entry.thumbnail;

  return (
    <div className="relative group">
      {/* Timeline dot — pulses green when active */}
      <div className={`absolute -left-[29px] top-2 w-5 h-5 rounded-full border-4 border-white shadow-sm z-10 transition-all ${
        isActive
          ? 'bg-emerald-500 ring-4 ring-emerald-100 animate-pulse'
          : isLatest
            ? `${dotColor} ring-4 ring-blue-100`
            : 'bg-slate-300'
      }`} />

      {/* Card */}
      <div
        className={`bg-white rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 ${
          isActive ? 'border-2 border-emerald-200' : 'border border-slate-100'
        }`}
        style={{ boxShadow: isActive ? '0 4px 24px rgba(16,185,129,0.12)' : '0 4px 24px rgba(11,28,48,0.06)' }}
      >
        {/* Active visit ribbon */}
        {isActive && (
          <div className="bg-emerald-500 px-5 py-1.5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-[9px] font-bold text-white uppercase tracking-widest">Visit In Progress</span>
          </div>
        )}

        <div className="p-5">
          {/* Header row */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-slate-900">
                Visit #{entry.visitNumber ?? '—'}
              </span>
              {isActive && (
                <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                  <Activity className="w-2.5 h-2.5" />
                  Active
                </span>
              )}
              {isLatest && !isActive && (
                <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Latest
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium text-slate-400 shrink-0">
              {formatDate(entry.visitDate)}
            </span>
          </div>

          {/* Type badge */}
          <div className="mb-3">
            <span className={`inline-flex text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}>
              {typeLabel}
            </span>
          </div>

          {/* Procedures */}
          {procs.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {procs.slice(0, 3).map((p: any, i: number) => (
                <div key={i} className="flex items-start gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${dotColor}`} />
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {typeof p === 'string' ? p : (p?.type ?? JSON.stringify(p))}
                  </p>
                </div>
              ))}
              {procs.length > 3 && (
                <p className="text-[10px] text-slate-400 pl-3.5">+{procs.length - 3} more procedures</p>
              )}
            </div>
          )}

          {/* Clinical note */}
          {clinicalNote && (
            <p className="text-[11px] text-slate-500 italic leading-relaxed line-clamp-2 mb-3">
              {clinicalNote}
            </p>
          )}

          {/* Action row — "Continue Visit" for active, "Preview & Restore" for completed w/ snapshot */}
          {isActive ? (
            <div
              className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all
                bg-emerald-50 hover:bg-emerald-100 border border-emerald-200"
              onClick={() => onView?.(entry.visitId)}
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Active Session</p>
                <p className="text-xs font-bold text-emerald-700 mt-0.5">Continue Visit →</p>
              </div>
            </div>
          ) : entry.snapshotId ? (
            <div
              className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all
                bg-slate-50 hover:bg-blue-50 border border-transparent hover:border-blue-200"
              onClick={() => onView?.(entry.visitId)}
            >
              {/* Thumbnail */}
              <div className="w-16 h-12 rounded-lg overflow-hidden border border-slate-200 shrink-0 bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center">
                {hasThumbnail ? (
                  <img src={entry.thumbnail!} className="w-full h-full object-cover" alt="snapshot thumbnail" />
                ) : (
                  <Eye className="w-4 h-4 text-blue-400 opacity-60" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Snapshot</p>
                <div className="flex items-center gap-1 text-blue-600 text-[10px] font-bold mt-0.5">
                  <Eye className="w-3 h-3 shrink-0" />
                  Preview &amp; Restore
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Summary Stat Card ─────────────────────────────────────────────────────────

function SummaryCard({
  icon,
  iconBg,
  label,
  value,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex items-center gap-3"
      style={{ boxShadow: '0 4px 16px rgba(11,28,48,0.04)' }}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">{label}</p>
        <p className="text-sm font-bold text-slate-900 mt-0.5 truncate">{value}</p>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const OrthoTimelineTab: React.FC<OrthoTimelineTabProps> = ({
  caseId,
  onOpenSnapshotEditor,
}) => {
  const { data: timeline = [], isLoading } = useCaseTimeline(caseId);

  // Show all visits — including active ones without a snapshot yet
  const visitEntries = timeline;

  // Derived aggregates for right panel
  const totalVisits   = visitEntries.length;
  const lastVisit     = visitEntries.filter(e => e.status !== 'active').at(-1);
  const recentProcs   = visitEntries
    .flatMap((e) => (e.procedures ?? []).map((p: any) => ({ proc: p, visit: e.visitNumber })))
    .slice(-5)
    .reverse();

  // Active archwire — look for the most recent procedure mentioning "archwire"
  const archwireEntry = recentProcs.find(({ proc }) => {
    const label = typeof proc === 'string' ? proc : (proc?.type ?? '');
    return label.toLowerCase().includes('archwire') || label.toLowerCase().includes('wire');
  });
  const activeArchwire = archwireEntry
    ? (typeof archwireEntry.proc === 'string' ? archwireEntry.proc : archwireEntry.proc?.type ?? '—')
    : '—';

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="grid grid-cols-12 gap-6">

      {/* ════════════════════════════════════════════════════════════════
          LEFT PANEL — Timeline Feed (7 cols)
          ════════════════════════════════════════════════════════════════ */}
      <div className="col-span-12 lg:col-span-7 space-y-6">
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
          Timeline Feed
        </h3>

        {/* ── Loading state ── */}
        {isLoading && (
          <div className="relative pl-8 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* ── Empty state ── */}
        {!isLoading && visitEntries.length === 0 && (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center"
            style={{ boxShadow: '0 4px 24px rgba(11,28,48,0.04)' }}>
            <div className="flex justify-center mb-4">
              <Calendar className="w-10 h-10 text-slate-300" />
            </div>
            <p className="text-sm font-bold text-slate-400">No clinical visits recorded yet</p>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-xs mx-auto">
              Start a visit from the overview to begin the clinical timeline.
            </p>
          </div>
        )}

        {/* ── Visit cards on vertical timeline ── */}
        {!isLoading && visitEntries.length > 0 && (
          <div className="relative pl-8 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-blue-100">
            {[...visitEntries].reverse().map((entry, i) => (
              <VisitCard
                key={entry.visitId ?? entry.snapshotId ?? i}
                entry={entry}
                isLatest={i === 0}
                onView={(visitId) => onOpenSnapshotEditor?.(visitId)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════
          RIGHT PANEL — Case Summary + Recent Procedures (5 cols)
          ════════════════════════════════════════════════════════════════ */}
      <div className="col-span-12 lg:col-span-5 space-y-6">

        {/* Case Summary heading */}
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
          Case Summary
        </h3>

        {/* Stat cards */}
        <div className="space-y-3">
          <SummaryCard
            icon={<Activity className="w-4 h-4 text-blue-600" />}
            iconBg="bg-blue-50"
            label="Total Visits"
            value={isLoading ? '—' : totalVisits.toString()}
          />
          <SummaryCard
            icon={<Calendar className="w-4 h-4 text-emerald-600" />}
            iconBg="bg-emerald-50"
            label="Last Visit"
            value={isLoading ? '—' : formatDate(lastVisit?.visitDate)}
          />
          <SummaryCard
            icon={<Clock className="w-4 h-4 text-amber-600" />}
            iconBg="bg-amber-50"
            label="Next Scheduled"
            value="—"
          />
          <SummaryCard
            icon={<Zap className="w-4 h-4 text-purple-600" />}
            iconBg="bg-purple-50"
            label="Active Archwire"
            value={isLoading ? '—' : activeArchwire.slice(0, 24)}
          />
        </div>

        {/* Recent Procedures */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden"
          style={{ boxShadow: '0 4px 24px rgba(11,28,48,0.04)' }}>
          <div className="px-5 py-3 border-b border-slate-50 flex items-center gap-2">
            <History className="w-3.5 h-3.5 text-blue-600" />
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Recent Procedures
            </h4>
          </div>

          {recentProcs.length === 0 && !isLoading && (
            <div className="px-5 py-8 text-center">
              <p className="text-xs text-slate-400">No procedures recorded yet.</p>
            </div>
          )}

          {isLoading && (
            <div className="px-5 py-4 space-y-3 animate-pulse">
              {[0,1,2].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-slate-200 shrink-0" />
                  <div className="h-3 w-full bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          )}

          {!isLoading && recentProcs.length > 0 && (
            <div className="divide-y divide-slate-50/80">
              {recentProcs.map(({ proc, visit }, i) => {
                const label = typeof proc === 'string' ? proc : (proc?.type ?? 'Procedure');
                const typeKey = typeof proc === 'string' ? 'treatment' : (proc?.type ?? 'treatment');
                const dotCls = DOT_COLORS[typeKey] ?? DOT_COLORS.treatment;
                return (
                  <div key={i} className="px-5 py-3 flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
                    <p className="text-xs text-slate-700 flex-1 truncate">{label}</p>
                    <span className="text-[10px] text-slate-400 shrink-0">Visit #{visit ?? '?'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrthoTimelineTab;
