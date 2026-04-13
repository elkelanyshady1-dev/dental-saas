/**
 * ToothInfoPopup.tsx
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * DOUBLE CLICK → INFO popup for the orthodontic chart.
 *
 * Read-only clinical summary for a single tooth:
 *   • Current bracket / appliance status
 *   • Structured clinical tags (diagnosis, alignment, condition)
 *   • Active risk alerts with severity color coding
 *   • Action history log for this tooth (most recent first)
 *
 * Design: light frosted glass card, clinical badge grid, timeline log.
 */

import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { X, ClipboardList, Info } from 'lucide-react';
import { ToothData, Action } from '../types';
import { ToothBadge } from './ToothBadge';

// ── Label maps ───────────────────────────────────────────────────────────────

const DIAGNOSIS_LABELS: Record<string, { label: string; color: string }> = {
  caries:        { label: 'Caries',        color: '#ef4444' },
  root_canal:    { label: 'Root Canal',    color: '#f97316' },
  badly_decayed: { label: 'Badly Decayed', color: '#dc2626' },
  missing:       { label: 'Missing',       color: '#94a3b8' },
  extracted:     { label: 'Extracted',     color: '#64748b' },
};

const ALIGNMENT_LABELS: Record<string, { label: string; color: string }> = {
  rotated:           { label: 'Rotated',     color: '#a855f7' },
  displaced_buccal:  { label: 'Buccal',      color: '#2dd4bf' },
  displaced_lingual: { label: 'Lingual',     color: '#06b6d4' },
  impacted:          { label: 'Impacted',     color: '#f59e0b' },
  mesial_out:        { label: 'Mesial Out',   color: '#f97316' },
  distal_out:        { label: 'Distal Out',   color: '#f97316' },
  mesial_in:         { label: 'Mesial In',    color: '#0ea5e9' },
  distal_in:         { label: 'Distal In',    color: '#0ea5e9' },
};

const ALERT_LABELS: Record<string, { label: string; color: string }> = {
  medical_alert:   { label: 'Medical Alert',   color: '#f43f5e' },
  root_resorption: { label: 'Root Resorption', color: '#fbbf24' },
  poor_hygiene:    { label: 'Poor Hygiene',     color: '#84cc16' },
  anchorage_loss:  { label: 'Anchorage Loss',   color: '#8b5cf6' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function bracketLabel(tooth: ToothData): string {
  if (tooth.status === 'bracket')    return `Bracket${tooth.prescription ? ` · ${tooth.prescription}` : ''}`;
  if (tooth.status === 'band')       return `Band`;
  if (tooth.status === 'molar-tube') return `Molar Tube`;
  return 'None';
}

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold"
      style={{ background: `${color}18`, border: `1px solid ${color}40`, color }}
    >
      {label}
    </span>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface ToothInfoPopupProps {
  tooth: ToothData;
  position: { x: number; y: number };
  onClose: () => void;
  /** Full action log — we filter to this tooth's history */
  actions: Action[];
}

// ── Main Component ───────────────────────────────────────────────────────────

const ToothInfoPopup: React.FC<ToothInfoPopupProps> = ({ tooth, position, onClose, actions }) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const cs = tooth.clinicalStatus;
  const alerts = tooth.clinicalAlerts ?? [];

  // Tooth's personal history (most recent first, max 8)
  const toothHistory = actions
    .filter(a => a.tooth === tooth.id.toString())
    .slice(0, 8);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 120);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const hasAnyTag = cs?.diagnosis || cs?.alignment || cs?.condition || alerts.length > 0;

  return (
    <motion.div
      ref={popupRef}
      initial={{ opacity: 0, scale: 0.93, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.93, y: 8 }}
      transition={{ type: 'spring', stiffness: 460, damping: 32 }}
      className="fixed z-[301] select-none"
      style={{ left: position.x, top: position.y }}
    >
      <div
        className="w-72 bg-white/97 backdrop-blur-xl border border-slate-200 rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 20px 40px -8px rgba(0,0,0,0.18), 0 4px 12px -2px rgba(0,0,0,0.08)' }}
      >
        {/* ── HEADER ── */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 border-b border-indigo-500">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center">
              <Info className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-white font-black text-[13px] leading-none">Tooth {tooth.id}</div>
              <div className="text-indigo-200 text-[9px] font-semibold uppercase tracking-widest mt-0.5">
                {tooth.type.charAt(0).toUpperCase() + tooth.type.slice(1)}
                {tooth.isUpper ? ' · Upper' : ' · Lower'}
                {` · Position ${tooth.position}`}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
          >
            <X className="w-3.5 h-3.5 text-white/80" />
          </button>
        </div>

        <div className="p-3 flex flex-col gap-3 max-h-[480px] overflow-y-auto">

          {/* ── BRACKET / APPLIANCE STATUS ── */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Appliance</p>
            <div className="flex items-center gap-2 flex-wrap">
              {(() => {
                const hasBracket =
                  tooth.status === 'bracket' ||
                  tooth.status === 'band' ||
                  tooth.status === 'molar-tube';
                return (
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                    !hasBracket
                      ? 'bg-slate-100 text-slate-500'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}>
                    {!hasBracket ? '⬜' : '🔵'} {bracketLabel(tooth)}
                  </span>
                );
              })()}
              {tooth.prescription && (
                <StatusPill label={tooth.prescription} color="#6366f1" />
              )}
              {tooth.slotSize && (
                <StatusPill label={`${tooth.slotSize}"`} color="#64748b" />
              )}
              {tooth.brand && (
                <StatusPill label={tooth.brand} color="#0ea5e9" />
              )}
            </div>
            {tooth.bondingHeight && (
              <p className="text-[9px] text-slate-400 mt-1.5 font-medium">
                Bonding: {tooth.bondingOption === 'custom' ? `${tooth.bondingHeight}mm` : tooth.bondingOption}
              </p>
            )}
            {tooth.prescriptionValues && (
              <p className="text-[9px] text-slate-400 mt-0.5 font-medium">
                Tip: {tooth.prescriptionValues.tip}° · Torque: {tooth.prescriptionValues.torque}°
                {tooth.prescriptionValues.rotation != null ? ` · Rot: ${tooth.prescriptionValues.rotation}°` : ''}
              </p>
            )}
          </div>

          {/* ── CLINICAL TAGS ── */}
          {hasAnyTag ? (
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Clinical Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {cs?.diagnosis && DIAGNOSIS_LABELS[cs.diagnosis] && (
                  <span
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold"
                    style={{
                      background: `${DIAGNOSIS_LABELS[cs.diagnosis].color}18`,
                      border: `1.5px solid ${DIAGNOSIS_LABELS[cs.diagnosis].color}50`,
                      color: DIAGNOSIS_LABELS[cs.diagnosis].color,
                    }}
                  >
                    <ToothBadge status={cs.diagnosis} size="sm" />
                    <span>{DIAGNOSIS_LABELS[cs.diagnosis].label}</span>
                  </span>
                )}
                {cs?.alignment && ALIGNMENT_LABELS[cs.alignment] && (
                  <span
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold"
                    style={{
                      background: `${ALIGNMENT_LABELS[cs.alignment].color}18`,
                      border: `1.5px solid ${ALIGNMENT_LABELS[cs.alignment].color}50`,
                      color: ALIGNMENT_LABELS[cs.alignment].color,
                    }}
                  >
                    <ToothBadge status={cs.alignment} size="sm" />
                    <span>{ALIGNMENT_LABELS[cs.alignment].label}</span>
                  </span>
                )}
                {cs?.condition && cs.condition !== 'normal' && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                    ⚙️ {cs.condition === 'molar_tube' ? 'Molar Tube' : cs.condition.charAt(0).toUpperCase() + cs.condition.slice(1)}
                  </span>
                )}
              </div>
              {/* Alerts */}
              {alerts.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  {alerts.map(a => ALERT_LABELS[a] && (
                    <div
                      key={a}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] font-bold"
                      style={{
                        background: `${ALERT_LABELS[a].color}12`,
                        border: `1px solid ${ALERT_LABELS[a].color}35`,
                        color: ALERT_LABELS[a].color,
                      }}
                    >
                      <ToothBadge status={a} size="sm" isCritical />
                      <span>{ALERT_LABELS[a].label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Clinical Tags</p>
              <p className="text-[10px] text-slate-400 italic">No clinical tags assigned</p>
            </div>
          )}

          {/* ── ACTION HISTORY ── */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
              Session History {toothHistory.length > 0 && `(${toothHistory.length})`}
            </p>
            {toothHistory.length === 0 ? (
              <p className="text-[10px] text-slate-400 italic">No actions recorded this session</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {toothHistory.map(a => (
                  <div key={a.id} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-slate-700 truncate">{a.description}</p>
                      <p className="text-[9px] text-slate-400">{formatTime(a.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* ── FOOTER ── */}
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/60">
          <p className="text-[9px] text-slate-400 text-center font-medium">
            Double-click: read-only · Right-click: actions
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default ToothInfoPopup;
