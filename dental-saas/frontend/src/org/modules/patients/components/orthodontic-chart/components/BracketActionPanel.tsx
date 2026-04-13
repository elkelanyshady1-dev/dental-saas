/**
 * BracketActionPanel.tsx
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * SINGLE SOURCE OF TRUTH for all bracket-related actions.
 *
 * Used in:
 *   1. Toolbar brackets dropdown  (SnapshotEditor ActionBarCategory)
 *   2. ToothActionPopup right-click panel
 *
 * Props
 * ─────
 *   isMolar        — adjusts the bond button labels (Band / Tube vs Bracket)
 *   isNonMolar     — shows plain Bracket button
 *   initialConfig  — pre-fill from parent state (keeps toolbar selection sticky)
 *   brands         — brand list from ChartSettings
 *   onApply        — called with (action, config) when user clicks Bond/Band/Tube
 *
 * Internal state owns only the **local draft** so changes in the panel don't
 * mutate parent state until the user explicitly clicks Apply.
 * The parent reads the resolved config via the onApply callback.
 */

import React, { useState } from 'react';
import { Square } from 'lucide-react';

// ── Constants (mirrored from SnapshotEditor — no imports to avoid circular deps) ─

const BRACKET_PRESCRIPTIONS = ['MBT', 'Roth', 'Bidimensional', 'Standard Edgewise', 'Ricketts'] as const;
const BRACKET_SLOT_SIZES    = ['0.022', '0.018'] as const;
const BRACKET_ACTIONS       = ['Bonding', 'Rebonding', 'Repositioning'] as const;

/**
 * Standard chairside bonding-height presets (mm).
 * Ordered intentionally: 2.5 → 5.5 in 4-column rows.
 */
const BONDING_HEIGHT_PRESETS = [2.5, 3, 3.5, 4, 4.5, 4.75, 5, 5.5];

/**
 * Smart default height by FDI tooth number.
 * Returns the most clinically common bonding height for that tooth type.
 * Covers upper arch explicitly; mirrors for lower arch automatically.
 */
function getDefaultHeight(toothId?: number): string {
  if (!toothId) return '';
  // Normalise to upper-arch equivalent (11–18 / 21–28)
  const n = toothId % 10 || 8; // last digit = position 1–8
  if (n === 1) return '5';     // Central incisors
  if (n === 2) return '4.5';   // Lateral incisors
  if (n === 3) return '5';     // Canines
  if (n === 4) return '4.5';   // First premolars
  if (n === 5) return '4';     // Second premolars
  if (n === 6) return '3.5';   // First molars
  if (n === 7) return '3';     // Second molars
  return '3';                  // Third molars / fallback
}

export type BracketAction     = typeof BRACKET_ACTIONS[number];
export type BracketPrescForm  = typeof BRACKET_PRESCRIPTIONS[number];
export type BracketSlotForm   = typeof BRACKET_SLOT_SIZES[number];

export interface BracketConfig {
  action:        BracketAction;
  prescription:  BracketPrescForm;
  slotSize:      BracketSlotForm;
  bondingOption: 'marginal-ridges-level' | 'middle-middle' | 'custom';
  bondingHeight: string;
  brand:         string;
}

export type AppliedBracketType = 'bracket' | 'band' | 'molar-tube';

export interface BracketActionPanelProps {
  /** Is at least one targeted tooth a molar? */
  isMolar:     boolean;
  /** Is at least one targeted tooth a non-molar? */
  isNonMolar:  boolean;
  /** Seed values from parent toolbar state so the panel opens pre-filled */
  initialConfig: BracketConfig;
  /** Available brand list (from ChartSettings) */
  brands: string[];
  /**
   * Optional FDI tooth ID — when provided, seeds the bonding height with
   * a clinically appropriate smart default (used by ToothActionPopup).
   */
  toothId?: number;
  /**
   * Called when the user commits a bond action.
   * `bracketType` = 'bracket' | 'band' | 'molar-tube'
   * `config`      = the resolved panel state at time of click
   */
  onApply: (bracketType: AppliedBracketType, config: BracketConfig) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</div>
      {children}
    </div>
  );
}

function ChipButton({
  active,
  onClick,
  children,
  compact = false,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
        compact ? 'flex-1' : ''
      } ${
        active
          ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-sm'
          : 'border-slate-100 text-slate-500 hover:border-slate-200 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

const BracketActionPanel: React.FC<BracketActionPanelProps> = ({
  isMolar,
  isNonMolar,
  initialConfig,
  brands,
  toothId,
  onApply,
}) => {
  // When a toothId is given (popup context) and the bonding option is already
  // 'custom', seed the height with a smart clinical default if the parent
  // hasn't supplied one yet.
  const smartDefault =
    initialConfig.bondingOption === 'custom' && !initialConfig.bondingHeight && toothId
      ? getDefaultHeight(toothId)
      : initialConfig.bondingHeight;

  const [cfg, setCfg] = React.useState<BracketConfig>({
    ...initialConfig,
    bondingHeight: smartDefault,
  });

  const set = <K extends keyof BracketConfig>(key: K, val: BracketConfig[K]) =>
    setCfg(prev => ({ ...prev, [key]: val }));

  /** Active preset = exact string match (handles '3' vs 3 coercion cleanly) */
  const activePreset = BONDING_HEIGHT_PRESETS.find(
    v => String(v) === cfg.bondingHeight || Number(cfg.bondingHeight) === v,
  ) ?? null;

  return (
    <div className="flex flex-col gap-3">

      {/* ── ACTION ── */}
      <Row label="Action">
        <div className="grid grid-cols-3 gap-1">
          {BRACKET_ACTIONS.map(a => (
            <ChipButton key={a} active={cfg.action === a} onClick={() => set('action', a)}>
              {a}
            </ChipButton>
          ))}
        </div>
      </Row>

      {/* ── PRESCRIPTION ── */}
      <Row label="Prescription">
        <div className="grid grid-cols-2 gap-1">
          {BRACKET_PRESCRIPTIONS.map(p => (
            <ChipButton key={p} active={cfg.prescription === p} onClick={() => set('prescription', p)}>
              {p}
            </ChipButton>
          ))}
        </div>
      </Row>

      {/* ── SLOT SIZE ── */}
      <Row label="Slot Size">
        <div className="flex gap-1">
          {BRACKET_SLOT_SIZES.map(s => (
            <ChipButton key={s} compact active={cfg.slotSize === s} onClick={() => set('slotSize', s)}>
              {s}
            </ChipButton>
          ))}
        </div>
      </Row>

      {/* ── BONDING POSITION ── */}
      <Row label="Bonding Position">
        <select
          value={cfg.bondingOption}
          onChange={e => {
            const val = e.target.value as BracketConfig['bondingOption'];
            // When switching to 'custom', seed height from smart default if empty
            if (val === 'custom' && !cfg.bondingHeight && toothId) {
              setCfg(prev => ({ ...prev, bondingOption: val, bondingHeight: getDefaultHeight(toothId) }));
            } else {
              set('bondingOption', val);
            }
          }}
          className="w-full px-2 py-1.5 rounded-lg text-[10px] font-bold border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="marginal-ridges-level">Marginal Ridges Level</option>
          <option value="middle-middle">Middle-Middle</option>
          <option value="custom">Custom (mm)</option>
        </select>
      </Row>

      {/* ── BONDING HEIGHT — preset cards + precision input ── */}
      {cfg.bondingOption === 'custom' && (
        <Row label="Bonding Height (mm)">
          {/* Preset cards 4-column grid */}
          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {BONDING_HEIGHT_PRESETS.map(v => {
              const isActive = activePreset === v;
              return (
                <button
                  key={v}
                  onClick={() => set('bondingHeight', String(v))}
                  className={`py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                    isActive
                      ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-200'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  {v}
                </button>
              );
            })}
          </div>
          {/* Precision free-entry input */}
          <input
            type="number"
            step="0.25"
            min="1"
            max="8"
            value={cfg.bondingHeight}
            onChange={e => set('bondingHeight', e.target.value)}
            placeholder="Custom height…"
            className="w-full px-2 py-1.5 rounded-lg text-[10px] font-bold border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 placeholder:text-slate-300"
          />
        </Row>
      )}

      {/* ── BRAND ── */}
      <Row label="Brand">
        <select
          value={cfg.brand}
          onChange={e => set('brand', e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg text-[10px] font-bold border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          {brands.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </Row>

      {/* ── APPLY BUTTONS ── */}
      {isNonMolar && (
        <button
          onClick={() => onApply('bracket', cfg)}
          className="w-full py-2 bg-blue-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider hover:bg-blue-700 active:scale-[0.98] transition-all shadow-sm flex items-center justify-center gap-2"
        >
          <Square className="w-3.5 h-3.5" />
          {cfg.action} Bracket{cfg.action === 'Bonding' ? 's' : ''}
        </button>
      )}

      {isMolar && (
        <div className="flex gap-2">
          <button
            onClick={() => onApply('band', cfg)}
            className="flex-1 py-2 bg-indigo-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-sm"
          >
            {cfg.action} Band
          </button>
          <button
            onClick={() => onApply('molar-tube', cfg)}
            className="flex-1 py-2 bg-purple-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider hover:bg-purple-700 active:scale-[0.98] transition-all shadow-sm"
          >
            {cfg.action} Tube
          </button>
        </div>
      )}

    </div>
  );
};

export default BracketActionPanel;
