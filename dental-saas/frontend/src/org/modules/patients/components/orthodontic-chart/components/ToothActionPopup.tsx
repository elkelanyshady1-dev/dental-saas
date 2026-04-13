/**
 * ToothActionPopup.tsx
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * RIGHT-CLICK → ACTION popup for the orthodontic chart.
 *
 * Bracket section = <BracketActionPanel> (SSOT — NO duplicate UI here)
 * Clinical sections (Diagnosis / Alignment / Alerts) remain in this file.
 *
 * Design: glassmorphism card, color-coded sections, smooth spring animation.
 */

import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Stethoscope, Move, ShieldAlert, X, Trash2, Square,
} from 'lucide-react';
import {
  ToothData,
  DiagnosisValue,
  AlignmentValue,
  AlertValue,
} from '../types';
import BracketActionPanel, {
  BracketConfig,
  AppliedBracketType,
} from './BracketActionPanel';
import { ToothBadge } from './ToothBadge';
import { Portal } from '@/components/ui/Portal';


// ── Option maps ──────────────────────────────────────────────────────────────

const DIAGNOSES: { label: string; value: DiagnosisValue & string; color: string }[] = [
  { label: 'Caries',        value: 'caries',        color: '#ef4444' },
  { label: 'Root Canal',    value: 'root_canal',    color: '#f97316' },
  { label: 'Badly Decayed', value: 'badly_decayed', color: '#dc2626' },
  { label: 'Missing',       value: 'missing',       color: '#94a3b8' },
  { label: 'Extracted',     value: 'extracted',     color: '#64748b' },
];

const ALIGNMENTS: { label: string; value: AlignmentValue & string; color: string }[] = [
  { label: 'Rotated',     value: 'rotated',          color: '#a855f7' },
  { label: 'Buccal',      value: 'displaced_buccal', color: '#2dd4bf' },
  { label: 'Lingual',     value: 'displaced_lingual',color: '#06b6d4' },
  { label: 'Impacted',    value: 'impacted',          color: '#f59e0b' },
  { label: 'Mesial Out',  value: 'mesial_out',        color: '#f97316' },
  { label: 'Distal Out',  value: 'distal_out',        color: '#f97316' },
  { label: 'Mesial In',   value: 'mesial_in',         color: '#0ea5e9' },
  { label: 'Distal In',   value: 'distal_in',         color: '#0ea5e9' },
];

const ALERTS: { label: string; value: AlertValue; color: string }[] = [
  { label: 'Medical Alert',   value: 'medical_alert',   color: '#f43f5e' },
  { label: 'Root Resorption', value: 'root_resorption', color: '#fbbf24' },
  { label: 'Poor Hygiene',    value: 'poor_hygiene',    color: '#84cc16' },
  { label: 'Anchorage Loss',  value: 'anchorage_loss',  color: '#8b5cf6' },
];

// ── Props ────────────────────────────────────────────────────────────────────

export interface ToothActionPopupProps {
  tooth: ToothData;
  position: { x: number; y: number };
  onClose: () => void;

  // ── Bracket (delegated to BracketActionPanel) ──────────────────────────────
  /** Current toolbar config — seeds the panel so selections are sticky */
  defaultBracketConfig: BracketConfig;
  /** Brand list from ChartSettings */
  bracketBrands: string[];
  /**
   * Called when the user commits a bond action via BracketActionPanel.
   * Parent (SnapshotEditor) owns the actual mutation.
   */
  onBracketApply: (toothId: number, bracketType: AppliedBracketType, config: BracketConfig) => void;
  /** Remove the current appliance from this tooth */
  onRemoveBracket: (toothId: number) => void;
  /**
   * Optional — marks this tooth as debonded (bracket physically fell off).
   * Only rendered when tooth has an active bracket/tube/band.
   * Parent opens DebondModal with Rebond Now / Add TODO options.
   */
  onDebond?: (toothId: number) => void;

  // ── Clinical (single-tooth variants) ──────────────────────────────────────
  onDiagnosis:    (toothId: number, value: DiagnosisValue & string) => void;
  onAlignment:    (toothId: number, value: AlignmentValue & string) => void;
  onToggleAlert:  (toothId: number, value: AlertValue)             => void;
  onClearClinical:(toothId: number)                                => void;
}

// ── Sub-section header ───────────────────────────────────────────────────────

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-slate-400">{icon}</span>
      <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.12em]">{label}</span>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

const ToothActionPopup: React.FC<ToothActionPopupProps> = ({
  tooth,
  position,
  onClose,
  defaultBracketConfig,
  bracketBrands,
  onBracketApply,
  onRemoveBracket,
  onDebond,
  onDiagnosis,
  onAlignment,
  onToggleAlert,
  onClearClinical,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const cs     = tooth.clinicalStatus;
  const alerts = tooth.clinicalAlerts ?? [];

  const hasBracket = tooth.status === 'bracket' || tooth.status === 'band' || tooth.status === 'molar-tube';
  const isMolar    = tooth.type === 'molar';
  const isBlocked  = cs?.diagnosis === 'missing' || cs?.diagnosis === 'extracted';

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  // Keyboard close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <Portal>
    <motion.div
      ref={popupRef}
      initial={{ opacity: 0, scale: 0.92, y: -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: -6 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      className="fixed z-[9999] select-none"
      style={{ left: position.x, top: position.y }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Card */}
      <div
        className="w-72 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-2xl shadow-2xl overflow-hidden"
        style={{ boxShadow: '0 24px 48px -8px rgba(0,0,0,0.22), 0 4px 16px -4px rgba(0,0,0,0.10)' }}
      >
        {/* ── HEADER ── */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-800 to-slate-700 border-b border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
              <span className="text-[13px]">🦷</span>
            </div>
            <div>
              <div className="text-white font-black text-[13px] leading-none">Tooth {tooth.id}</div>
              <div className="text-slate-400 text-[9px] font-semibold uppercase tracking-widest mt-0.5">
                {tooth.type.charAt(0).toUpperCase() + tooth.type.slice(1)}
                {tooth.isUpper ? ' · Upper' : ' · Lower'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X className="w-3.5 h-3.5 text-slate-300" />
          </button>
        </div>

        <div className="p-3 flex flex-col gap-4 max-h-[560px] overflow-y-auto">

          {/* ── BRACKETS — delegated to BracketActionPanel (SSOT) ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <SectionHeader icon={<Square className="w-3 h-3" />} label={isMolar ? 'Molar Appliance' : 'Bracket'} />
              {hasBracket && (
                <div className="flex items-center gap-1">
                  {/* Debonded — bracket physically fell off */}
                  {onDebond && (
                    <button
                      onClick={() => { onDebond(tooth.id); onClose(); }}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold text-amber-600 border border-amber-100 hover:bg-amber-50 hover:border-amber-300 transition-all"
                      title="Mark as debonded"
                    >
                      ✕ Debonded
                    </button>
                  )}
                  <button
                    onClick={() => { onRemoveBracket(tooth.id); onClose(); }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold text-red-500 border border-red-100 hover:bg-red-50 hover:border-red-300 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove {tooth.status === 'band' ? 'Band' : tooth.status === 'molar-tube' ? 'Tube' : 'Bracket'}
                  </button>
                </div>
              )}
            </div>

            {isBlocked ? (
              <p className="text-[9px] text-slate-400 italic">
                Blocked — tooth is {cs?.diagnosis}
              </p>
            ) : (
              <BracketActionPanel
                isMolar={isMolar}
                isNonMolar={!isMolar}
                initialConfig={defaultBracketConfig}
                brands={bracketBrands}
                toothId={tooth.id}
                onApply={(bracketType, cfg) => {
                  onBracketApply(tooth.id, bracketType, cfg);
                  onClose();
                }}
              />
            )}
          </div>

          {/* ── DIAGNOSIS ── */}
          <div>
            <SectionHeader icon={<Stethoscope className="w-3 h-3" />} label="Diagnosis" />
            <div className="grid grid-cols-2 gap-1">
              {DIAGNOSES.map(opt => {
                const isActive = cs?.diagnosis === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => { onDiagnosis(tooth.id, opt.value); onClose(); }}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-bold text-left transition-all"
                    style={{
                      background: isActive ? `${opt.color}28` : `${opt.color}0d`,
                      border: `1.5px solid ${isActive ? opt.color : `${opt.color}30`}`,
                      color: opt.color,
                      boxShadow: isActive ? `0 0 0 2px ${opt.color}25` : undefined,
                    }}
                  >
                    <ToothBadge status={opt.value} size="sm" isCritical={isActive} />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── ALIGNMENT ── */}
          <div>
            <SectionHeader icon={<Move className="w-3 h-3" />} label="Alignment" />
            {isBlocked && (
              <p className="text-[9px] text-slate-400 italic mb-1.5">Blocked — tooth is missing/extracted</p>
            )}
            <div className="grid grid-cols-2 gap-1">
              {ALIGNMENTS.map(opt => {
                const isActive = cs?.alignment === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => { if (!isBlocked) { onAlignment(tooth.id, opt.value); onClose(); } }}
                    disabled={isBlocked}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-bold text-left transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{
                      background: isActive ? `${opt.color}28` : `${opt.color}0d`,
                      border: `1.5px solid ${isActive ? opt.color : `${opt.color}30`}`,
                      color: opt.color,
                      boxShadow: isActive ? `0 0 0 2px ${opt.color}25` : undefined,
                    }}
                  >
                    <ToothBadge status={opt.value} size="sm" isCritical={isActive} />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── ALERTS ── */}
          <div>
            <SectionHeader icon={<ShieldAlert className="w-3 h-3" />} label="Risk Flags" />
            {isBlocked && (
              <p className="text-[9px] text-slate-400 italic mb-1.5">Blocked — tooth is missing/extracted</p>
            )}
            <div className="flex flex-col gap-1">
              {ALERTS.map(opt => {
                const isActive = alerts.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => { if (!isBlocked) onToggleAlert(tooth.id, opt.value); }}
                    disabled={isBlocked}
                    className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-left transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{
                      background: isActive ? `${opt.color}22` : `${opt.color}08`,
                      border: `1.5px solid ${isActive ? opt.color : `${opt.color}28`}`,
                      color: opt.color,
                    }}
                  >
                    <ToothBadge status={opt.value} size="sm" isCritical={isActive} />
                    <span className="flex-1">{opt.label}</span>
                    {isActive && (
                      <span
                        className="text-[8px] px-1.5 py-0.5 rounded-full font-black"
                        style={{ background: opt.color, color: '#fff' }}
                      >
                        ON
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── FOOTER ── */}
          <button
            onClick={() => { onClearClinical(tooth.id); onClose(); }}
            className="w-full py-2 rounded-xl text-[10px] font-bold text-slate-400 border border-slate-100 hover:border-slate-300 hover:text-slate-600 transition-all"
          >
            🗑 Clear All Clinical Tags
          </button>
        </div>
      </div>
    </motion.div>
    </Portal>
  );
};


export default ToothActionPopup;
