/**
 * SnapshotSelector.tsx
 * Domain: clinical-snapshots
 * Layer: Frontend > Components
 *
 * Header dropdown — now shows VISIT HISTORY (timeline entries) as the primary list,
 * since every snapshot is bound 1:1 to a visit.
 *
 * Each row = one Visit (Visit #N, type badge, date, procedure count).
 * Clicking a row triggers onSelectVisit (fetches full snapshot and restores).
 *
 * The "+" footer still calls onCreate() to save a new snapshot / create a new visit.
 *
 * RULES:
 *   ✅ Receives timeline from parent (useCaseTimeline in SnapshotEditor)
 *   ✅ Falls back to snapshots list when timeline is empty (backward compat)
 *   ✅ Calls onSelectVisit / onCreate / onEdit / onDelete via callbacks
 *   ❌ Does NOT own any server state
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Plus, Edit2, Trash2, Camera, Clock, History, CheckCircle2 } from 'lucide-react';
import type { SnapshotListItem } from '../api/snapshot.api';
import type { TimelineEntry } from '../types';

// ── Visit-type badge colors (dark theme) ─────────────────────────────────────
const VISIT_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  bonding:    { bg: 'rgba(168,85,247,0.18)',  color: '#c084fc', label: 'Bonding'     },
  adjustment: { bg: 'rgba(99,102,241,0.18)', color: '#a5b4fc',  label: 'Adjustment'  },
  wire_change:{ bg: 'rgba(6,182,212,0.18)',  color: '#67e8f9',  label: 'Wire Change' },
  debonding:  { bg: 'rgba(249,115,22,0.18)', color: '#fb923c',  label: 'Debonding'   },
  treatment:  { bg: 'rgba(16,185,129,0.18)', color: '#6ee7b7',  label: 'Treatment'   },
  diagnostic: { bg: 'rgba(100,116,139,0.18)',color: '#94a3b8',  label: 'Diagnostic'  },
};

const formatVisitDate = (raw: string | number | null | undefined): string => {
  if (!raw) return '—';
  const d = new Date(typeof raw === 'number' ? raw : raw);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
         ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface SnapshotSelectorProps {
  // Legacy snapshot list (fallback + headcount)
  snapshots: SnapshotListItem[];
  // Visit timeline — preferred data source
  timeline?: TimelineEntry[];
  timelineLoading?: boolean;
  activeId: string | null;
  isLoading?: boolean;
  canDelete?: boolean;
  // Row click: visit entry (primary when timeline available)
  onSelectVisit?: (entry: TimelineEntry) => void;
  // Row click: snapshot (fallback)
  onSelect: (snapshot: SnapshotListItem) => void;
  onCreate: () => void;
  onEdit:   (snapshot: SnapshotListItem) => void;
  onDelete: (snapshot: SnapshotListItem) => void;
}

export default function SnapshotSelector({
  snapshots,
  timeline = [],
  timelineLoading = false,
  activeId,
  isLoading = false,
  canDelete = false,
  onSelectVisit,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
}: SnapshotSelectorProps) {
  const [open, setOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmDeleteId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Use timeline when available; fall back to snapshots
  const useTimeline = timeline.length > 0;
  const activeSnapshot = snapshots.find((s) => s.id === activeId);

  // Trigger label: active selection → name; nothing selected → neutral label
  const activeEntry = useTimeline
    ? timeline.find((e) => e.snapshotId === activeId)
    : null;
  const triggerLabel = isLoading || timelineLoading
    ? 'Loading…'
    : activeEntry
    ? `Visit #${activeEntry.visitNumber}`
    : activeSnapshot
    ? activeSnapshot.name
    : 'Visit History';  // neutral — never show a stale count like "7 Visits"

  // Count for header
  const headerCount = useTimeline ? timeline.length : snapshots.length;
  const headerLabel = useTimeline ? 'Visit History' : 'Clinical Snapshots';
  const headerSub   = useTimeline
    ? `${headerCount} visit${headerCount !== 1 ? 's' : ''}`
    : `${headerCount} version${headerCount !== 1 ? 's' : ''}`;

  return (
    <div ref={ref} className="snapshot-selector" style={{ position: 'relative', display: 'inline-block' }}>
      {/* ── Trigger Button ── */}
      <button
        id="snapshot-selector-btn"
        onClick={() => setOpen((v) => !v)}
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          6,
          padding:      '6px 12px',
          background:   'rgba(255,255,255,0.1)',
          border:       '1px solid rgba(255,255,255,0.2)',
          borderRadius: 10,
          color:        '#fff',
          fontSize:     13,
          fontWeight:   500,
          cursor:       'pointer',
          backdropFilter: 'blur(8px)',
          transition:   'background 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
      >
        {useTimeline ? <History size={14} /> : <Camera size={14} />}
        <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {triggerLabel}
        </span>
        <ChevronDown size={12} style={{ marginLeft: 2, opacity: 0.7, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {/* ── Dropdown ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{   opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            style={{
              position:    'absolute',
              top:         'calc(100% + 6px)',
              right:       0,
              minWidth:    320,
              maxWidth:    360,
              background:  '#1a1f2e',
              border:      '1px solid rgba(255,255,255,0.12)',
              borderRadius: 14,
              boxShadow:   '0 20px 60px rgba(0,0,0,0.5)',
              zIndex:      9999,
              overflow:    'hidden',
            }}
          >
            {/* Header */}
            <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                {useTimeline ? <History size={10} /> : <Camera size={10} />}
                {headerLabel}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                {headerSub}
              </div>
            </div>

            {/* ── TIMELINE-BASED LIST (primary) ── */}
            {useTimeline ? (
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {timelineLoading ? (
                  <div style={{ padding: '16px 14px', color: 'rgba(255,255,255,0.3)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#a5b4fc', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    Loading visits…
                  </div>
                ) : timeline.length === 0 ? (
                  <div style={{ padding: '20px 14px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
                    No visits recorded yet.
                  </div>
                ) : (
                  // Newest first
                  [...timeline].reverse().map((entry) => {
                    const isActive    = entry.snapshotId === activeId;
                    const badge       = VISIT_BADGE[entry.type ?? ''] ?? VISIT_BADGE.treatment;
                    const procCount   = entry.procedures?.length ?? 0;
                    const hasSnapshot = !!entry.snapshotId;

                    return (
                      <div
                        key={entry.visitId ?? entry.snapshotId}
                        onClick={() => {
                          if (!hasSnapshot) return;
                          if (onSelectVisit) {
                            onSelectVisit(entry);
                          } else {
                            // Fallback: find matching snapshot by id
                            const snap = snapshots.find((s) => s.id === entry.snapshotId);
                            if (snap) onSelect(snap);
                          }
                          setOpen(false);
                        }}
                        style={{
                          display:     'flex',
                          alignItems:  'center',
                          padding:     '9px 14px',
                          gap:         10,
                          background:  isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
                          borderLeft:  isActive ? '3px solid #6366f1' : '3px solid transparent',
                          cursor:      hasSnapshot ? 'pointer' : 'default',
                          opacity:     hasSnapshot ? 1 : 0.5,
                          transition:  'background 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive && hasSnapshot) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) e.currentTarget.style.background = isActive ? 'rgba(99,102,241,0.15)' : 'transparent';
                        }}
                      >
                        {/* Left: visit number dot */}
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                          background: isActive ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: isActive ? '#a5b4fc' : 'rgba(255,255,255,0.5)',
                        }}>
                          {entry.visitNumber ?? '?'}
                        </div>

                        {/* Main content */}
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          {/* Row 1: Visit label + active indicator */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: isActive ? '#a5b4fc' : '#e2e8f0' }}>
                              {isActive && <CheckCircle2 size={10} style={{ display: 'inline', marginRight: 4, color: '#818cf8' }} />}
                              Visit #{entry.visitNumber ?? '—'}
                            </span>
                            {/* Type badge */}
                            {entry.type && (
                              <span style={{
                                padding:      '1px 6px',
                                borderRadius: 4,
                                background:   badge.bg,
                                color:        badge.color,
                                fontSize:     10,
                                fontWeight:   700,
                                letterSpacing: '0.04em',
                              }}>
                                {badge.label}
                              </span>
                            )}
                            {/* No snapshot indicator */}
                            {!hasSnapshot && (
                              <span style={{
                                padding: '1px 6px', borderRadius: 4,
                                background: 'rgba(100,116,139,0.15)', color: '#64748b',
                                fontSize: 10, fontWeight: 600,
                              }}>
                                Scheduled
                              </span>
                            )}
                          </div>

                          {/* Row 2: date + procedure count */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.32)', fontSize: 11 }}>
                            <Clock size={9} />
                            <span>{formatVisitDate(entry.visitDate)}</span>
                            {procCount > 0 && (
                              <span style={{
                                padding: '1px 5px', borderRadius: 4,
                                background: 'rgba(255,255,255,0.06)',
                                color: 'rgba(255,255,255,0.4)',
                                fontSize: 10,
                              }}>
                                {procCount} proc.
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Edit / Delete (only for snapshot-backed entries) */}
                        {hasSnapshot && (
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            {/* Find matching snapshot for edit/delete callbacks */}
                            {(() => {
                              const snap = snapshots.find((s) => s.id === entry.snapshotId);
                              if (!snap) return null;
                              const confirmingDelete = confirmDeleteId === snap.id;
                              return (
                                <>
                                  <button
                                    id={`snapshot-edit-${snap.id}`}
                                    title="Rename"
                                    onClick={(e) => { e.stopPropagation(); onEdit(snap); setOpen(false); }}
                                    style={{ padding: 4, background: 'transparent', border: 'none', borderRadius: 6, color: 'rgba(255,255,255,0.35)', cursor: 'pointer' }}
                                    onMouseEnter={(e) => (e.currentTarget.style.color = '#a5b4fc')}
                                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
                                  >
                                    <Edit2 size={12} />
                                  </button>

                                  {canDelete && (
                                    confirmingDelete ? (
                                      <div style={{ display: 'flex', gap: 3 }} onClick={(e) => e.stopPropagation()}>
                                        <button
                                          id={`snapshot-delete-confirm-${snap.id}`}
                                          onClick={() => { onDelete(snap); setConfirmDeleteId(null); setOpen(false); }}
                                          style={{ padding: '2px 6px', background: '#ef4444', border: 'none', borderRadius: 5, color: '#fff', fontSize: 11, cursor: 'pointer' }}
                                        >
                                          Delete
                                        </button>
                                        <button
                                          onClick={() => setConfirmDeleteId(null)}
                                          style={{ padding: '2px 6px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 11, cursor: 'pointer' }}
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        id={`snapshot-delete-${snap.id}`}
                                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(snap.id); }}
                                        style={{ padding: 4, background: 'transparent', border: 'none', borderRadius: 6, color: 'rgba(255,255,255,0.25)', cursor: 'pointer' }}
                                        onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
                                        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    )
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              // ── FALLBACK: raw snapshot list (backward compat) ──
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {snapshots.length === 0 ? (
                  <div style={{ padding: '20px 14px', textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
                    No snapshots yet. Save the current state to create the first version.
                  </div>
                ) : (
                  snapshots.map((s) => {
                    const isActive = s.id === activeId;
                    const confirmingDelete = confirmDeleteId === s.id;
                    return (
                      <div
                        key={s.id}
                        style={{
                          display: 'flex', alignItems: 'center', padding: '8px 14px', gap: 10,
                          background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
                          borderLeft: isActive ? '3px solid #6366f1' : '3px solid transparent',
                          transition: 'background 0.15s', cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{ flex: 1, overflow: 'hidden' }} onClick={() => { onSelect(s); setOpen(false); setConfirmDeleteId(null); }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: isActive ? '#a5b4fc' : '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {isActive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#818cf8', display: 'inline-block', marginRight: 6 }} />}
                            {s.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                            <Clock size={9} />
                            {new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button id={`snapshot-edit-${s.id}`} title="Rename" onClick={(e) => { e.stopPropagation(); onEdit(s); setOpen(false); }}
                            style={{ padding: 4, background: 'transparent', border: 'none', borderRadius: 6, color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = '#a5b4fc')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}>
                            <Edit2 size={12} />
                          </button>
                          {canDelete && (confirmingDelete ? (
                            <div style={{ display: 'flex', gap: 3 }} onClick={(e) => e.stopPropagation()}>
                              <button id={`snapshot-delete-confirm-${s.id}`} onClick={() => { onDelete(s); setConfirmDeleteId(null); setOpen(false); }}
                                style={{ padding: '2px 6px', background: '#ef4444', border: 'none', borderRadius: 5, color: '#fff', fontSize: 11, cursor: 'pointer' }}>Delete</button>
                              <button onClick={() => setConfirmDeleteId(null)}
                                style={{ padding: '2px 6px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 11, cursor: 'pointer' }}>✕</button>
                            </div>
                          ) : (
                            <button id={`snapshot-delete-${s.id}`} onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(s.id); }}
                              style={{ padding: 4, background: 'transparent', border: 'none', borderRadius: 6, color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}>
                              <Trash2 size={12} />
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Footer — New Snapshot/Visit */}
            <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                id="snapshot-create-btn"
                onClick={() => { onCreate(); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                  padding: '7px 10px',
                  background: 'rgba(99,102,241,0.15)',
                  border: '1px solid rgba(99,102,241,0.3)',
                  borderRadius: 8, color: '#a5b4fc', fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99,102,241,0.25)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(99,102,241,0.15)')}
              >
                <Plus size={14} />
                Save Current State as New Snapshot
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
