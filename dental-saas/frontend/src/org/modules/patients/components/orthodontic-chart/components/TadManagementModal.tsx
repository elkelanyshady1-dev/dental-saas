/**
 * TadManagementModal.tsx — Miniscrew (TADs) Lifecycle Management Modal
 *
 * Design: Split-panel clinical modal designed via Stitch MCP
 * - LEFT:  TAD list with color-coded status badges + TAD icon
 * - RIGHT: Selected TAD details, event timeline, action buttons
 * - FOOTER:Failure rate KPI with threshold alerts
 */

import React, { useState } from 'react';
import {
  X, TriangleAlert, CheckCircle2, Clock, RefreshCw,
  Trash2, AlertCircle, Activity, ChevronDown,
  ChevronUp, RotateCcw
} from 'lucide-react';
import {
  useTadsByCase,
  useTadFailureRate,
  useMarkTadForRemoval,
  useRemoveTad,
  useFailTad,
  useReinsertTad,
} from '../hooks/useTads';
import type { Tad, TadEvent } from '../api/tads.api';

// ─── Clinical TAD SVG Icon (inline, matches chart canvas) ────────────────────
const TadIconSmall = ({ color = '#64748b' }: { color?: string }) => (
  <svg width="10" height="24" viewBox="0 0 10 24" fill="none" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.8 2 L5 0 L5.2 2" fill={color} stroke="none" />
    <path d="M4 2 L3 18 L5 19.5 L7 18 L6 2 Z" fill="none" />
    {[0.2, 0.4, 0.6, 0.8].map((t, i) => {
      const ty = 2 + t * 16;
      const hw = 1.5 + t * 1.5;
      return <line key={i} x1={5 - hw} y1={ty} x2={5 + hw} y2={ty} />;
    })}
    <rect x="2.5" y="18" width="5" height="2" rx="0.5" />
    <ellipse cx="5" cy="21" rx="4" ry="1.2" />
  </svg>
);

// ─── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }: { status: Tad['status'] }) => {
  const configs = {
    ACTIVE:        { label: 'Active',        color: '#10b981', bg: '#d1fae5', border: '#6ee7b7' },
    NEEDS_REMOVAL: { label: 'Needs Removal', color: '#d97706', bg: '#fef3c7', border: '#fbbf24' },
    FAILED:        { label: 'Failed',        color: '#ef4444', bg: '#fee2e2', border: '#fca5a5' },
    REMOVED:       { label: 'Removed',       color: '#64748b', bg: '#f1f5f9', border: '#cbd5e1' },
  };
  const cfg = configs[status];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      {status === 'ACTIVE' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
      {status === 'NEEDS_REMOVAL' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
      {status === 'FAILED' && <X size={9} />}
      {status === 'REMOVED' && <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />}
      {cfg.label}
    </span>
  );
};

// ─── Event Timeline ───────────────────────────────────────────────────────────
const EventTimeline = ({ events }: { events: TadEvent[] }) => {
  const eventConfig = {
    INSERTED:          { label: 'Inserted',          color: '#3b82f6', bg: '#dbeafe', icon: <CheckCircle2 size={12} /> },
    FAILED:            { label: 'Failed',             color: '#ef4444', bg: '#fee2e2', icon: <TriangleAlert size={12} /> },
    REMOVED:           { label: 'Removed',            color: '#64748b', bg: '#f1f5f9', icon: <Trash2 size={12} /> },
    REINSERTED:        { label: 'Reinserted',         color: '#10b981', bg: '#d1fae5', icon: <RotateCcw size={12} /> },
    MARKED_FOR_REMOVAL:{ label: 'Marked for Removal', color: '#d97706', bg: '#fef3c7', icon: <Clock size={12} /> },
  };

  return (
    <div className="relative">
      {/* Timeline connector */}
      <div className="absolute left-[15px] top-4 bottom-4 w-px bg-slate-200" />

      <div className="space-y-4">
        {[...events].reverse().map((evt, i) => {
          const cfg = eventConfig[evt.type] ?? { label: evt.type, color: '#64748b', bg: '#f1f5f9', icon: <Activity size={12} /> };
          return (
            <div key={evt._id ?? i} className="flex items-start gap-3">
              {/* Node */}
              <div
                className="relative z-10 flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0"
                style={{ background: cfg.bg, border: `1.5px solid ${cfg.color}`, color: cfg.color }}
              >
                {cfg.icon}
              </div>
              {/* Content */}
              <div className="pt-0.5 min-w-0">
                <p className="text-xs font-semibold text-slate-700">{cfg.label}</p>
                {evt.reason && (
                  <p className="text-[10px] text-slate-500 capitalize mt-0.5">Reason: {evt.reason.replace(/_/g, ' ')}</p>
                )}
                {evt.notes && (
                  <p className="text-[10px] text-slate-400 italic mt-0.5">"{evt.notes}"</p>
                )}
                {evt.scheduledReinsertAt && (
                  <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
                    <Clock size={9} /> Scheduled: {new Date(evt.scheduledReinsertAt).toLocaleDateString()}
                  </p>
                )}
                <p className="text-[9px] text-slate-300 mt-1">{new Date(evt.createdAt).toLocaleString()}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Mark for Removal Panel ───────────────────────────────────────────────────
const REMOVAL_REASONS = [
  { value: 'loose',     label: 'Loose',          icon: '⚡' },
  { value: 'pain',      label: 'Pain',            icon: '😣' },
  { value: 'migration', label: 'Migration',       icon: '📍' },
  { value: 'infection', label: 'Infection',       icon: '🦠' },
];

interface RemovalPanelProps {
  tadId: string;
  caseId: string;
  onDone: () => void;
}
const RemovalPanel = ({ tadId, caseId, onDone }: RemovalPanelProps) => {
  const [reason, setReason] = useState<string>('');
  const [weeks, setWeeks] = useState<number>(4);
  const [notes, setNotes] = useState('');
  const markMutation = useMarkTadForRemoval(caseId);

  const handleSubmit = () => {
    markMutation.mutate({ id: tadId, payload: { reason, healingWeeks: weeks, notes } }, { onSuccess: onDone });
  };

  return (
    <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
      <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Mark for Removal</p>

      <div className="grid grid-cols-2 gap-2">
        {REMOVAL_REASONS.map(r => (
          <button
            key={r.value}
            onClick={() => setReason(reason === r.value ? '' : r.value)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all"
            style={{
              background: reason === r.value ? '#fef3c7' : '#ffffff',
              borderColor: reason === r.value ? '#f59e0b' : '#e2e8f0',
              color: reason === r.value ? '#92400e' : '#475569',
            }}
          >
            <span>{r.icon}</span> {r.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wider whitespace-nowrap">Healing Period</label>
        <input
          type="number"
          min={1} max={52}
          value={weeks}
          onChange={e => setWeeks(Number(e.target.value))}
          className="w-16 text-center text-xs border border-slate-200 rounded-lg p-1.5 focus:outline-none focus:border-amber-400"
        />
        <span className="text-xs text-slate-400">weeks</span>
      </div>

      <textarea
        placeholder="Clinical notes (optional)..."
        value={notes}
        onChange={e => setNotes(e.target.value)}
        className="w-full text-xs border border-slate-200 rounded-lg p-2 resize-none focus:outline-none focus:border-amber-400 placeholder:text-slate-300"
        rows={2}
      />

      <button
        onClick={handleSubmit}
        disabled={markMutation.isPending}
        className="w-full py-2 rounded-xl text-xs font-semibold text-white transition-opacity disabled:opacity-60"
        style={{ background: '#d97706' }}
      >
        {markMutation.isPending ? 'Flagging...' : 'Flag for Removal'}
      </button>
    </div>
  );
};

// ─── Main Modal Component ─────────────────────────────────────────────────────

interface TadManagementModalProps {
  caseId: string;
  patientId?: string;
  onClose: () => void;
}

export const TadManagementModal: React.FC<TadManagementModalProps> = ({ caseId, onClose }) => {
  const [selectedTadId, setSelectedTadId] = useState<string | null>(null);
  const [showRemovalPanel, setShowRemovalPanel] = useState(false);

  const { data: tads = [], isLoading } = useTadsByCase(caseId);
  const { data: failureRate } = useTadFailureRate(caseId);
  const removeMutation = useRemoveTad(caseId);
  const reinsertMutation = useReinsertTad(caseId);

  const selectedTad = tads.find(t => t._id === selectedTadId) ?? null;
  const alertRate = failureRate && failureRate.rate >= 20;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,52,91,0.25)', backdropFilter: 'blur(4px)' }}>
      <div
        className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        style={{ boxShadow: '0 4px 20px rgba(0,52,91,0.08), 0 12px 40px rgba(0,52,91,0.12)' }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800 tracking-tight">Miniscrew Management</h2>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">TADs Engine — Clinical Lifecycle</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT — TAD List */}
          <div className="w-72 flex-shrink-0 border-r border-slate-100 overflow-y-auto p-4 space-y-2" style={{ background: '#eef4ff' }}>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Placed TADs ({tads.length})</p>

            {isLoading && (
              <div className="text-xs text-slate-400 text-center py-6">Loading...</div>
            )}

            {!isLoading && tads.length === 0 && (
              <div className="text-xs text-slate-400 text-center py-8">
                No TADs placed for this case.
              </div>
            )}

            {tads.map(tad => (
              <button
                key={tad._id}
                onClick={() => { setSelectedTadId(tad._id); setShowRemovalPanel(false); }}
                className="w-full text-left rounded-xl p-3 transition-all flex items-start gap-3"
                style={{
                  background: selectedTadId === tad._id ? '#ffffff' : 'transparent',
                  boxShadow: selectedTadId === tad._id ? '0 1px 6px rgba(0,52,91,0.08)' : 'none',
                  border: selectedTadId === tad._id ? '1px solid #dbeafe' : '1px solid transparent',
                }}
              >
                <div className="flex-shrink-0 mt-1">
                  <TadIconSmall color={tad.status === 'ACTIVE' ? '#10b981' : tad.status === 'FAILED' ? '#ef4444' : tad.status === 'NEEDS_REMOVAL' ? '#d97706' : '#94a3b8'} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-slate-700 leading-tight truncate">{tad.positionLabel}</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">{tad.brand} · {tad.diameter}×{tad.length}mm</p>
                  <div className="mt-2">
                    <StatusBadge status={tad.status} />
                  </div>
                  {tad.hasActiveAlert && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <TriangleAlert size={9} className="text-amber-500" />
                      <span className="text-[9px] text-amber-600 font-medium">Action Required</span>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* RIGHT — Detail Panel */}
          <div className="flex-1 overflow-y-auto p-6">
            {!selectedTad ? (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
                <div className="opacity-30">
                  <TadIconSmall color="#94a3b8" />
                </div>
                <p className="text-sm text-slate-400">Select a TAD from the list to view details and perform clinical actions.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* TAD Header */}
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">{selectedTad.positionLabel}</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">{selectedTad.brand} · {selectedTad.diameter} × {selectedTad.length}mm · Tooth {selectedTad.toothNumber}</p>
                    </div>
                    <StatusBadge status={selectedTad.status} />
                  </div>
                  <p className="text-[9px] text-slate-300 mt-2">
                    Inserted: {new Date(selectedTad.createdAt).toLocaleDateString()} ·
                    {selectedTad.failureCount > 0 && <span className="text-red-400 ml-1">Failures: {selectedTad.failureCount}</span>}
                  </p>
                </div>

                <hr className="border-slate-100" />

                {/* Event Timeline */}
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-4">Clinical Event Timeline</p>
                  {selectedTad.events.length > 0 ? (
                    <EventTimeline events={selectedTad.events} />
                  ) : (
                    <p className="text-xs text-slate-400">No events recorded.</p>
                  )}
                </div>

                <hr className="border-slate-100" />

                {/* Action Buttons */}
                <div className="space-y-2">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Clinical Actions</p>

                  <div className="flex gap-2 flex-wrap">
                    {/* Mark for Removal */}
                    {(selectedTad.status === 'ACTIVE') && (
                      <button
                        onClick={() => setShowRemovalPanel(p => !p)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-all"
                        style={{ borderColor: '#fbbf24', color: '#d97706', background: '#fffbeb' }}
                      >
                        <Clock size={12} />
                        Mark for Removal
                        {showRemovalPanel ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    )}

                    {/* Confirm Removal */}
                    {(selectedTad.status === 'ACTIVE' || selectedTad.status === 'NEEDS_REMOVAL' || selectedTad.status === 'FAILED') && (
                      <button
                        onClick={() => removeMutation.mutate({ id: selectedTad._id, payload: {} })}
                        disabled={removeMutation.isPending}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-60"
                        style={{ background: '#ef4444' }}
                      >
                        <Trash2 size={12} />
                        {removeMutation.isPending ? 'Removing...' : 'Confirm Removal'}
                      </button>
                    )}

                    {/* Reinsert */}
                    {(selectedTad.status === 'REMOVED' || selectedTad.status === 'FAILED') && (
                      <button
                        onClick={() => reinsertMutation.mutate({ id: selectedTad._id })}
                        disabled={reinsertMutation.isPending}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-60"
                        style={{ background: '#10b981' }}
                      >
                        <RefreshCw size={12} />
                        {reinsertMutation.isPending ? 'Reinserting...' : 'Reinsert'}
                      </button>
                    )}
                  </div>

                  {/* Expandable removal panel */}
                  {showRemovalPanel && selectedTad.status === 'ACTIVE' && (
                    <RemovalPanel
                      tadId={selectedTad._id}
                      caseId={caseId}
                      onDone={() => setShowRemovalPanel(false)}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer: Failure Rate KPI ── */}
        <div
          className="px-6 py-3 border-t flex items-center gap-3"
          style={{
            borderColor: alertRate ? '#fbbf24' : '#e2e8f0',
            background: alertRate ? '#fffbeb' : '#f8fafc',
          }}
        >
          <Activity size={14} className={alertRate ? 'text-amber-500' : 'text-slate-400'} />
          <span className="text-xs text-slate-500 font-medium">Failure Rate:</span>
          <span
            className="text-xs font-bold"
            style={{ color: alertRate ? '#d97706' : '#10b981' }}
          >
            {failureRate ? `${failureRate.rate}% (${failureRate.failed}/${failureRate.total} TADs)` : '—'}
          </span>
          {alertRate && (
            <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-amber-700">
              <TriangleAlert size={11} />
              Failure rate exceeds clinical threshold (20%)
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
