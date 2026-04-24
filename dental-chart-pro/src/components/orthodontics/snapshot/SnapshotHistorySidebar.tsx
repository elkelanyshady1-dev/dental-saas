import React, { useState } from 'react';
import {
  History, Calendar, ChevronRight, Eye, FlaskConical,
  Stethoscope, ShieldCheck, Clock, Link2
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SnapshotType = 'pretreatment' | 'treatment' | 'post-treatment';

export interface SnapshotEntry {
  id: string;
  type: SnapshotType;
  version?: number;
  snapshotDate?: string | Date;
  /** Fallback for legacy records */
  createdAt?: string | Date;
  thumbnail?: string | null;
  visitNumber?: number;
  appointmentId?: string | null;
  notes?: { text?: string };
  diagnosticData?: Record<string, unknown> | null;
}

interface SnapshotHistorySidebarProps {
  snapshots: SnapshotEntry[];
  onRestoreSnapshot: (snapshot: SnapshotEntry) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<SnapshotType, {
  label:       string;
  shortLabel:  string;
  icon:        React.FC<{ className?: string }>;
  color:       string;
  badgeBg:     string;
  badgeText:   string;
  borderHover: string;
  dot:         string;
}> = {
  pretreatment: {
    label:       'Pre-Treatment',
    shortLabel:  'Pre-Tx',
    icon:        FlaskConical,
    color:       'emerald',
    badgeBg:     'bg-emerald-100',
    badgeText:   'text-emerald-700',
    borderHover: 'hover:border-emerald-300',
    dot:         'bg-emerald-500',
  },
  treatment: {
    label:       'Mid-Treatment',
    shortLabel:  'Mid-Tx',
    icon:        Stethoscope,
    color:       'blue',
    badgeBg:     'bg-blue-100',
    badgeText:   'text-blue-700',
    borderHover: 'hover:border-blue-300',
    dot:         'bg-blue-500',
  },
  'post-treatment': {
    label:       'Post-Treatment',
    shortLabel:  'Retention',
    icon:        ShieldCheck,
    color:       'purple',
    badgeBg:     'bg-purple-100',
    badgeText:   'text-purple-700',
    borderHover: 'hover:border-purple-300',
    dot:         'bg-purple-500',
  },
};

function formatDate(date?: string | Date | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  });
}

function formatTime(date?: string | Date | null): string {
  if (!date) return '';
  return new Date(date).toLocaleTimeString('en-GB', {
    hour:   '2-digit',
    minute: '2-digit',
  });
}

function getCanonicalDate(snap: SnapshotEntry): Date | undefined {
  const raw = snap.snapshotDate ?? snap.createdAt;
  return raw ? new Date(raw) : undefined;
}

// ── Tab Button ────────────────────────────────────────────────────────────────

interface TabProps {
  active:    boolean;
  onClick:   () => void;
  icon:      React.FC<{ className?: string }>;
  label:     string;
  count:     number;
  dotColor:  string;
}

const Tab: React.FC<TabProps> = ({ active, onClick, icon: Icon, label, count, dotColor }) => (
  <button
    onClick={onClick}
    className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 ${
      active
        ? 'border-slate-700 text-slate-700'
        : 'border-transparent text-slate-400 hover:text-slate-600'
    }`}
  >
    <span className="flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
    {count > 0 && (
      <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[9px] ${dotColor}`}>
        {count > 9 ? '9+' : count}
      </span>
    )}
  </button>
);

// ── Pretreatment Version Card ─────────────────────────────────────────────────

interface PretreatmentCardProps {
  snap:    SnapshotEntry;
  onClick: () => void;
}

const PretreatmentCard: React.FC<PretreatmentCardProps> = ({ snap, onClick }) => {
  const canonicalDate = getCanonicalDate(snap);
  const cfg = TYPE_CONFIG.pretreatment;

  return (
    <div
      onClick={onClick}
      className={`group bg-white border border-slate-200 rounded-2xl overflow-hidden ${cfg.borderHover} hover:shadow-md transition-all cursor-pointer`}
    >
      {/* Thumbnail */}
      <div className="h-20 bg-slate-100 relative overflow-hidden">
        <img
          src={snap.thumbnail ?? `https://picsum.photos/seed/pretx-${snap.id}/200/80`}
          alt="Pre-treatment thumbnail"
          className="w-full h-full object-cover opacity-75 group-hover:scale-105 transition-transform duration-500"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="bg-white/90 p-2 rounded-full text-emerald-600 shadow-lg">
            <Eye className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="flex justify-between items-start">
          <div className="flex flex-col gap-1">
            {/* Version badge */}
            <div className="flex items-center gap-1.5">
              <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full ${cfg.badgeBg} ${cfg.badgeText}`}>
                v{snap.version ?? 1}
              </span>
              {snap.version === 1 && (
                <span className="text-[9px] text-slate-400 font-medium">First record</span>
              )}
            </div>
            {/* Date */}
            <span className="text-xs font-bold text-slate-700">
              {formatDate(canonicalDate)}
            </span>
            {/* Diagnostic data indicator */}
            {snap.diagnosticData && Object.keys(snap.diagnosticData).length > 0 && (
              <span className="text-[9px] text-emerald-600 font-medium flex items-center gap-1">
                <FlaskConical className="w-2.5 h-2.5" />
                Diagnostic data
              </span>
            )}
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all mt-1" />
        </div>
        {snap.notes?.text && (
          <p className="mt-1.5 text-[10px] text-slate-400 line-clamp-1">{snap.notes.text}</p>
        )}
      </div>
    </div>
  );
};

// ── Timeline Visit Card ───────────────────────────────────────────────────────

interface TimelineCardProps {
  snap:    SnapshotEntry;
  onClick: () => void;
}

const TimelineCard: React.FC<TimelineCardProps> = ({ snap, onClick }) => {
  const cfg  = TYPE_CONFIG[snap.type];
  const Icon = cfg.icon;
  const canonicalDate = getCanonicalDate(snap);

  return (
    <div
      onClick={onClick}
      className={`group bg-white border border-slate-200 rounded-2xl overflow-hidden ${cfg.borderHover} hover:shadow-md transition-all cursor-pointer`}
    >
      {/* Thumbnail */}
      <div className="h-24 bg-slate-100 relative overflow-hidden">
        <img
          src={snap.thumbnail ?? `https://picsum.photos/seed/${snap.type}-${snap.id}/200/100`}
          alt={`${cfg.label} thumbnail`}
          className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-500"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="bg-white/90 p-2 rounded-full shadow-lg" style={{ color: `var(--${cfg.color}-600, #6366f1)` }}>
            <Eye className="w-4 h-4" />
          </div>
        </div>
        {/* Visit number badge */}
        {snap.visitNumber != null && (
          <div className={`absolute top-2 left-2 ${cfg.badgeBg} ${cfg.badgeText} text-[9px] font-bold px-2 py-0.5 rounded-full`}>
            Visit #{snap.visitNumber}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="flex justify-between items-start">
          <div className="flex flex-col gap-1">
            {/* Type badge */}
            <span className={`text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 ${cfg.badgeText}`}>
              <Icon className="w-2.5 h-2.5" />
              {cfg.label}
            </span>
            {/* Canonical date (snapshotDate) */}
            <span className="text-xs font-bold text-slate-700">
              {formatDate(canonicalDate)}
              {canonicalDate && (
                <span className="text-slate-400 font-normal"> · {formatTime(canonicalDate)}</span>
              )}
            </span>
            {/* Appointment reference */}
            {snap.appointmentId && (
              <span className="text-[9px] text-slate-400 flex items-center gap-1">
                <Link2 className="w-2.5 h-2.5" />
                Appointment linked
              </span>
            )}
          </div>
          <ChevronRight className={`w-3.5 h-3.5 text-slate-300 group-hover:${cfg.badgeText.replace('text-', 'text-')} group-hover:translate-x-0.5 transition-all mt-1`} />
        </div>
        {snap.notes?.text && (
          <p className="mt-1.5 text-[10px] text-slate-400 line-clamp-1">{snap.notes.text}</p>
        )}
      </div>
    </div>
  );
};

// ── Empty State ───────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ type: 'pretreatment' | 'timeline' }> = ({ type }) => (
  <div className="h-full flex flex-col items-center justify-center text-center p-6 min-h-[200px]">
    <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-3">
      {type === 'pretreatment'
        ? <FlaskConical className="w-6 h-6" />
        : <Clock className="w-6 h-6" />}
    </div>
    <p className="text-xs font-medium text-slate-400">
      {type === 'pretreatment'
        ? 'No pre-treatment records yet.'
        : 'No visit records in the timeline yet.'}
    </p>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

type ActiveTab = 'pretreatment' | 'timeline';

const SnapshotHistorySidebar: React.FC<SnapshotHistorySidebarProps> = ({
  snapshots,
  onRestoreSnapshot,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('timeline');

  const pretreatmentSnaps = snapshots
    .filter((s) => s.type === 'pretreatment')
    .sort((a, b) => (b.version ?? 1) - (a.version ?? 1)); // newest version first

  const timelineSnaps = snapshots
    .filter((s) => s.type === 'treatment' || s.type === 'post-treatment')
    .sort((a, b) => (a.visitNumber ?? 0) - (b.visitNumber ?? 0)); // oldest visit first

  return (
    <div className="w-72 bg-white border-l border-slate-200 flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/50">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <History className="w-3.5 h-3.5" />
          Clinical History
        </h3>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 bg-white">
        <Tab
          active={activeTab === 'pretreatment'}
          onClick={() => setActiveTab('pretreatment')}
          icon={FlaskConical}
          label="Pre-Tx"
          count={pretreatmentSnaps.length}
          dotColor="bg-emerald-500"
        />
        <Tab
          active={activeTab === 'timeline'}
          onClick={() => setActiveTab('timeline')}
          icon={Calendar}
          label="Visits"
          count={timelineSnaps.length}
          dotColor="bg-blue-500"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">

        {/* ── Pretreatment Section ──────────────────────────── */}
        {activeTab === 'pretreatment' && (
          pretreatmentSnaps.length === 0
            ? <EmptyState type="pretreatment" />
            : (
              <div className="space-y-3">
                <p className="text-[9px] text-slate-400 uppercase tracking-widest font-semibold mb-2">
                  {pretreatmentSnaps.length} version{pretreatmentSnaps.length > 1 ? 's' : ''}
                </p>
                {pretreatmentSnaps.map((snap) => (
                  <PretreatmentCard
                    key={snap.id}
                    snap={snap}
                    onClick={() => onRestoreSnapshot(snap)}
                  />
                ))}
              </div>
            )
        )}

        {/* ── Timeline Section ──────────────────────────────── */}
        {activeTab === 'timeline' && (
          timelineSnaps.length === 0
            ? <EmptyState type="timeline" />
            : (
              <div className="space-y-3">
                <p className="text-[9px] text-slate-400 uppercase tracking-widest font-semibold mb-2">
                  {timelineSnaps.length} visit{timelineSnaps.length > 1 ? 's' : ''}
                </p>
                {timelineSnaps.map((snap) => (
                  <TimelineCard
                    key={snap.id}
                    snap={snap}
                    onClick={() => onRestoreSnapshot(snap)}
                  />
                ))}
              </div>
            )
        )}
      </div>

    </div>
  );
};

export default SnapshotHistorySidebar;
