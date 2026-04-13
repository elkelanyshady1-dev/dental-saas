/**
 * ClinicalTimelinePanel.tsx — Phase 5: Clinical Event Timeline
 *
 * Displays the full chronological event log for a case.
 * Supports:
 *   - Grouping events by visit session
 *   - Per-event-type icons and labels
 *   - Click-to-travel: select an event to preview chart state at that point
 *   - Snapshot checkpoint markers
 *   - Tooth-specific filtering (via toothId prop)
 *   - Read-only — no mutations in this panel
 *
 * Props:
 *   caseId         — OrthodonticCase._id
 *   onTimeTravelTo — callback with eventId when user clicks "view at this point"
 *   filterToothId  — optional FDI number to filter events to a single tooth
 *   activeEventId  — currently time-travelled event (for highlight)
 *   onClose        — close the panel
 */

import React, { useState, useMemo } from 'react';
import {
  X, Clock, GitCommit, Zap, Link2, Scissors,
  AlertCircle, Camera, CheckCircle2, Activity,
  ChevronDown, ChevronRight, Filter,
} from 'lucide-react';
import { useClinicalTimeline } from '../hooks/useClinicalTimeline';
import type { TimelineEvent } from '../api/clinicalState.api';

// ── Event type metadata ───────────────────────────────────────────────────────

interface EventMeta {
  label:  string;
  icon:   React.ReactNode;
  color:  string;
}

const EVENT_META: Record<string, EventMeta> = {
  SET_TOOTH_STATUS:      { label: 'Tooth Status',     icon: <Activity className="w-3 h-3" />,    color: 'text-blue-600 bg-blue-50 border-blue-100' },
  ARCHWIRE_PLACED:       { label: 'Archwire Placed',  icon: <GitCommit className="w-3 h-3" />,   color: 'text-violet-600 bg-violet-50 border-violet-100' },
  ARCHWIRE_REMOVED:      { label: 'Archwire Removed', icon: <GitCommit className="w-3 h-3" />,   color: 'text-slate-500 bg-slate-50 border-slate-100' },
  ELASTIC_APPLIED:       { label: 'Elastic Applied',  icon: <Link2 className="w-3 h-3" />,       color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  ELASTIC_REMOVED:       { label: 'Elastic Removed',  icon: <Link2 className="w-3 h-3" />,       color: 'text-slate-500 bg-slate-50 border-slate-100' },
  POWERCHAIN_SET:        { label: 'Power Chain',      icon: <Link2 className="w-3 h-3" />,       color: 'text-amber-600 bg-amber-50 border-amber-100' },
  IPR_MARKED:            { label: 'IPR Marked',       icon: <Scissors className="w-3 h-3" />,    color: 'text-rose-600 bg-rose-50 border-rose-100' },
  MINISCREW_PLACED:      { label: 'Miniscrew Placed', icon: <Zap className="w-3 h-3" />,         color: 'text-purple-600 bg-purple-50 border-purple-100' },
  MINISCREW_REMOVED:     { label: 'Miniscrew Removed',icon: <Zap className="w-3 h-3" />,         color: 'text-slate-500 bg-slate-50 border-slate-100' },
  BONDING_APPLIED:       { label: 'Bonding Applied',  icon: <CheckCircle2 className="w-3 h-3" />,color: 'text-teal-600 bg-teal-50 border-teal-100' },
  BONDING_REMOVED:       { label: 'Bonding Removed',  icon: <CheckCircle2 className="w-3 h-3" />,color: 'text-slate-500 bg-slate-50 border-slate-100' },
  NOTE_ADDED:            { label: 'Note Added',       icon: <AlertCircle className="w-3 h-3" />, color: 'text-sky-600 bg-sky-50 border-sky-100' },
  SNAPSHOT_CREATED:      { label: 'Snapshot',         icon: <Camera className="w-3 h-3" />,      color: 'text-green-600 bg-green-50 border-green-100' },
};

const _defaultMeta = (type: string): EventMeta => ({
  label: type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
  icon:  <Activity className="w-3 h-3" />,
  color: 'text-slate-600 bg-slate-50 border-slate-100',
});

function getEventMeta(type: string): EventMeta {
  return EVENT_META[type] ?? _defaultMeta(type);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Group events by their visitId (null events go under 'unlinked') */
function groupByVisit(events: TimelineEvent[]): Array<{ visitId: string | null; events: TimelineEvent[] }> {
  const map = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    const key = ev.visitId ?? '__unlinked__';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ev);
  }
  const groups: Array<{ visitId: string | null; events: TimelineEvent[] }> = [];
  for (const [key, evs] of map) {
    groups.push({ visitId: key === '__unlinked__' ? null : key, events: evs });
  }
  return groups;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface EventRowProps {
  event:      TimelineEvent;
  isActive:   boolean;
  onSelect:   (id: string) => void;
}

function EventRow({ event, isActive, onSelect }: EventRowProps) {
  const meta = getEventMeta(event.type);
  const isSnapshot = event.type === 'SNAPSHOT_CREATED';

  return (
    <button
      onClick={() => onSelect(event._id)}
      className={[
        'w-full text-left flex items-start gap-2 px-3 py-2 rounded-md border transition-all',
        'hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
        isActive
          ? 'border-blue-400 bg-blue-50 shadow-sm ring-1 ring-blue-300'
          : isSnapshot
          ? 'border-green-200 bg-green-50/60 hover:bg-green-50'
          : 'border-transparent hover:border-slate-200 hover:bg-slate-50',
      ].join(' ')}
      title={`View chart state at: ${event.type} #${event.sequence}`}
    >
      {/* Sequence marker + type badge */}
      <div className="flex-shrink-0 mt-0.5">
        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${meta.color}`}>
          {meta.icon}
          {isSnapshot ? '🟢 Snapshot' : `#${event.sequence}`}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-700 truncate">{meta.label}</p>
        {event.payload?.toothId != null && (
          <p className="text-[10px] text-slate-400">Tooth {String(event.payload.toothId)}</p>
        )}
        {event.payload?.arch != null && (
          <p className="text-[10px] text-slate-400 capitalize">{String(event.payload.arch)} arch</p>
        )}
      </div>

      {/* Timestamp */}
      <span className="text-[10px] text-slate-400 flex-shrink-0 mt-0.5">{formatTime(event.createdAt)}</span>
    </button>
  );
}

interface VisitGroupProps {
  visitId:      string | null;
  events:       TimelineEvent[];
  activeEventId: string | null | undefined;
  onSelect:     (id: string) => void;
  groupIndex:   number;
}

function VisitGroup({ visitId, events, activeEventId, onSelect, groupIndex }: VisitGroupProps) {
  const [expanded, setExpanded] = useState(true);
  const dateLabel = events[0] ? formatDate(events[0].createdAt) : '';
  const title = visitId ? `Visit · ${dateLabel}` : `Unlinked Events · ${dateLabel}`;

  return (
    <div className="mb-3">
      {/* Group header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-700 transition-colors"
      >
        {expanded
          ? <ChevronDown className="w-3 h-3" />
          : <ChevronRight className="w-3 h-3" />
        }
        <Clock className="w-3 h-3" />
        {title}
        <span className="ml-auto font-normal normal-case text-slate-400">{events.length} events</span>
      </button>

      {expanded && (
        <div className="ml-3 mt-1 flex flex-col gap-1 border-l border-slate-100 pl-2">
          {events.map(ev => (
            <EventRow
              key={ev._id}
              event={ev}
              isActive={ev._id === activeEventId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ClinicalTimelinePanelProps {
  caseId:         string;
  activeEventId?: string | null;
  filterToothId?: number;
  onTimeTravelTo: (eventId: string) => void;
  onExitTimeTravel?: () => void;
  onClose:        () => void;
}

export function ClinicalTimelinePanel({
  caseId,
  activeEventId,
  filterToothId,
  onTimeTravelTo,
  onExitTimeTravel,
  onClose,
}: ClinicalTimelinePanelProps) {
  const [typeFilter, setTypeFilter]  = useState<string>('');
  const [toothFilter, setToothFilter] = useState<string>(
    filterToothId != null ? String(filterToothId) : ''
  );

  const { data, isLoading, isError } = useClinicalTimeline(caseId, {
    type:    typeFilter  || undefined,
    toothId: toothFilter ? Number(toothFilter) : undefined,
  });

  const groups = useMemo(() => {
    if (!data?.events) return [];
    return groupByVisit(data.events);
  }, [data]);

  const isTimeTravelling = !!activeEventId;

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200 w-72 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">Clinical Timeline</h2>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded"
          aria-label="Close timeline"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Time travel banner */}
      {isTimeTravelling && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200">
          <p className="text-xs font-medium text-amber-700">
            Time travel mode — read only
          </p>
          {onExitTimeTravel && (
            <button
              onClick={onExitTimeTravel}
              className="text-xs font-semibold text-amber-700 underline hover:text-amber-900"
            >
              Exit
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="px-3 py-2 border-b border-slate-100 flex gap-2">
        <div className="flex items-center gap-1 flex-1">
          <Filter className="w-3 h-3 text-slate-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Event type…"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value.toUpperCase())}
            className="text-xs flex-1 min-w-0 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
        </div>
        <input
          type="number"
          placeholder="Tooth"
          value={toothFilter}
          onChange={e => setToothFilter(e.target.value)}
          className="text-xs w-16 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
        />
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {isLoading && (
          <div className="flex flex-col gap-2 pt-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 rounded-md animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-2 text-rose-600 text-xs pt-4 px-1">
            <AlertCircle className="w-4 h-4" />
            Failed to load timeline.
          </div>
        )}

        {!isLoading && !isError && groups.length === 0 && (
          <p className="text-xs text-slate-400 pt-6 text-center">No events recorded yet.</p>
        )}

        {!isLoading && !isError && groups.map((g, i) => (
          <VisitGroup
            key={g.visitId ?? `unlinked-${i}`}
            visitId={g.visitId}
            events={g.events}
            activeEventId={activeEventId}
            onSelect={onTimeTravelTo}
            groupIndex={i}
          />
        ))}
      </div>

      {/* Footer */}
      {data && (
        <div className="px-4 py-2 border-t border-slate-100 text-[10px] text-slate-400">
          {data.eventCount} total event{data.eventCount !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
