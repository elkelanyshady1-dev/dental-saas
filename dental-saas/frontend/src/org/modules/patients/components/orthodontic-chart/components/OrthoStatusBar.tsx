/**
 * OrthoStatusBar.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Orthodontic Findings Summary Bar — displayed below the GlobalStatusBar.
 *
 * Aggregates all mechanical/appliance state across the chart:
 *   • Bracket / Band / Molar-Tube counts
 *   • Archwire presence (upper / lower)
 *   • Power chains, Elastics, Appliances
 *   • Miniscrews, IPR Markers, Repositioning teeth
 *
 * Same interaction model as StatusSummaryBar:
 *   Hover  → transient tooth highlight preview
 *   Click  → persistent locked filter + dimming
 */

import React, { useMemo } from 'react';
import {
  Braces,
  Waves,
  Link2,
  Zap,
  Layers,
  Scissors,
  RotateCcw,
  X,
  Activity,
  AlertTriangle,
  Heart,
} from 'lucide-react';
import type {
  ToothData,
  ArchwireConfig,
  PowerChainConfig,
  ElasticConnection,
  Appliance,
  Miniscrew,
  IPRMarker,
} from '../types';

// ── Orthodontic TAD (Temporary Anchorage Device) SVG Icon ──────────────────

const TadIcon = ({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg
    width={size}
    height={size * 1.6}
    viewBox="0 0 10 16"
    fill="none"
    stroke={color}
    strokeWidth="0.9"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* ── Head (flat disc) */}
    <ellipse cx="5" cy="1.2" rx="3.5" ry="0.8" />
    {/* ── Cross slot on head */}
    <line x1="5" y1="0.5" x2="5" y2="1.9" />
    <line x1="3.2" y1="1.2" x2="6.8" y2="1.2" />
    {/* ── Neck/collar */}
    <line x1="3.8" y1="2" x2="3.8" y2="3.2" />
    <line x1="6.2" y1="2" x2="6.2" y2="3.2" />
    <line x1="3.8" y1="3.2" x2="6.2" y2="3.2" />
    {/* ── Threaded body (tapered) */}
    <path d="M3.8 3.2 L2.8 15 L5 15.6 L7.2 15 L6.2 3.2" />
    {/* ── Thread helix lines */}
    <line x1="2.9" y1="5.5" x2="7.1" y2="5.5" />
    <line x1="2.85" y1="7.8" x2="7.15" y2="7.8" />
    <line x1="3" y1="10" x2="7" y2="10" />
    <line x1="3.4" y1="12.2" x2="6.6" y2="12.2" />
    {/* ── Sharp tip */}
    <path d="M4.2 14.5 L5 15.8 L5.8 14.5" />
  </svg>
);


// ── Ortho filter key type ──────────────────────────────────────────────────

export type OrthoFilterKey =
  | 'bracket'
  | 'molar-tube'
  | 'band'
  | 'repositioning'
  | 'upper-wire'
  | 'lower-wire'
  | 'power-chain'
  | 'elastic'
  | 'appliance'
  | 'miniscrew'
  | 'ipr'
  | 'root_resorption'
  | 'anchorage_loss';

// ── Finding descriptor ─────────────────────────────────────────────────────

interface OrthoFinding {
  key: OrthoFilterKey;
  label: string;
  count: number;
  /** Tooth IDs affected (for chart dimming) */
  toothIds: number[];
  icon: React.ReactNode;
  color: string;
  bg: string;
  animation?: string;
  ping?: boolean;
}

// ── Props ─────────────────────────────────────────────────────────────────

export interface OrthoStatusBarProps {
  upperTeeth: ToothData[];
  lowerTeeth: ToothData[];
  upperArchwire?: ArchwireConfig;
  lowerArchwire?: ArchwireConfig;
  powerChains: PowerChainConfig[];
  elastics: ElasticConnection[];
  appliances: Appliance[];
  miniscrews: Miniscrew[];
  iprMarkers: IPRMarker[];
  /** Locked filter */
  activeFilter: OrthoFilterKey | null;
  /** Transient hover preview */
  hoverFilter: OrthoFilterKey | null;
  onFilterChange: (key: OrthoFilterKey | null) => void;
  onHoverChange:  (key: OrthoFilterKey | null) => void;
}

// ── Component ─────────────────────────────────────────────────────────────

const OrthoStatusBar: React.FC<OrthoStatusBarProps> = ({
  upperTeeth,
  lowerTeeth,
  upperArchwire,
  lowerArchwire,
  powerChains,
  elastics,
  appliances,
  miniscrews,
  iprMarkers,
  activeFilter,
  hoverFilter,
  onFilterChange,
  onHoverChange,
}) => {
  const allTeeth = useMemo(() => [...upperTeeth, ...lowerTeeth], [upperTeeth, lowerTeeth]);

  // ── Aggregate all ortho findings ────────────────────────────────────────

  const findings = useMemo<OrthoFinding[]>(() => {
    const result: OrthoFinding[] = [];

    // Brackets
    const bracketTeeth = allTeeth.filter(t => t.status === 'bracket');
    if (bracketTeeth.length > 0) result.push({
      key: 'bracket',
      label: 'Brackets',
      count: bracketTeeth.length,
      toothIds: bracketTeeth.map(t => t.id),
      icon: <Braces size={14} />,
      color: '#3b82f6',
      bg: 'bg-blue-50',
    });

    // Molar Tubes
    const tubeTeeth = allTeeth.filter(t => t.status === 'molar-tube');
    if (tubeTeeth.length > 0) result.push({
      key: 'molar-tube',
      label: 'Molar Tubes',
      count: tubeTeeth.length,
      toothIds: tubeTeeth.map(t => t.id),
      icon: <Layers size={14} />,
      color: '#a855f7',
      bg: 'bg-purple-50',
    });

    // Bands
    const bandTeeth = allTeeth.filter(t => t.status === 'band');
    if (bandTeeth.length > 0) result.push({
      key: 'band',
      label: 'Bands',
      count: bandTeeth.length,
      toothIds: bandTeeth.map(t => t.id),
      icon: <Link2 size={14} />,
      color: '#64748b',
      bg: 'bg-slate-100',
    });

    // Repositioning
    const repoTeeth = allTeeth.filter(t => t.status === 'repositioning');
    if (repoTeeth.length > 0) result.push({
      key: 'repositioning',
      label: 'Repositioning',
      count: repoTeeth.length,
      toothIds: repoTeeth.map(t => t.id),
      icon: <RotateCcw size={14} />,
      color: '#f97316',
      bg: 'bg-orange-50',
    });

    // Upper Archwire
    if (upperArchwire && upperArchwire.material !== 'None' && upperArchwire.size !== 'None') {
      result.push({
        key: 'upper-wire',
        label: `U: ${upperArchwire.material} ${upperArchwire.size}`,
        count: 1,
        toothIds: upperTeeth.map(t => t.id),
        icon: <Waves size={14} />,
        color: '#0ea5e9',
        bg: 'bg-sky-50',
      });
    }

    // Lower Archwire
    if (lowerArchwire && lowerArchwire.material !== 'None' && lowerArchwire.size !== 'None') {
      result.push({
        key: 'lower-wire',
        label: `L: ${lowerArchwire.material} ${lowerArchwire.size}`,
        count: 1,
        toothIds: lowerTeeth.map(t => t.id),
        icon: <Waves size={14} />,
        color: '#06b6d4',
        bg: 'bg-cyan-50',
      });
    }

    // Power Chains
    if (powerChains.length > 0) {
      const pcTeeth = [...new Set(powerChains.flatMap(p => p.activeTeeth))];
      result.push({
        key: 'power-chain',
        label: 'Power Chains',
        count: powerChains.length,
        toothIds: pcTeeth,
        icon: <Zap size={14} />,
        color: '#f59e0b',
        bg: 'bg-amber-50',
      });
    }

    // Elastics
    if (elastics.length > 0) {
      const elTeeth = [...new Set(elastics.flatMap(e => e.toothIds))];
      result.push({
        key: 'elastic',
        label: 'Elastics',
        count: elastics.length,
        toothIds: elTeeth,
        icon: <Activity size={14} />,
        color: '#10b981',
        bg: 'bg-emerald-50',
      });
    }

    // Appliances
    if (appliances.length > 0) {
      const appTeeth = [...new Set(appliances.flatMap(a => a.toothIds))];
      result.push({
        key: 'appliance',
        label: 'Appliances',
        count: appliances.length,
        toothIds: appTeeth,
        icon: <Layers size={14} />,
        color: '#8b5cf6',
        bg: 'bg-violet-50',
      });
    }

    // Miniscrews / TADs
    if (miniscrews.length > 0) {
      result.push({
        key: 'miniscrew',
        label: 'Miniscrews',
        count: miniscrews.length,
        toothIds: miniscrews.map(m => m.toothId),
        icon: <TadIcon size={14} />,
        color: '#64748b',
        bg: 'bg-slate-50',
      });
    }

    // IPR Markers
    if (iprMarkers.length > 0) {
      const iprTeeth = [...new Set(iprMarkers.map(m => m.toothId))];
      result.push({
        key: 'ipr',
        label: 'IPR',
        count: iprMarkers.length,
        toothIds: iprTeeth,
        icon: <Scissors size={14} />,
        color: '#f43f5e',
        bg: 'bg-rose-50',
      });
    }

    // Root Resorption (per-tooth clinical alert)
    const rootTeeth = allTeeth.filter(t => t.clinicalAlerts?.includes('root_resorption'));
    if (rootTeeth.length > 0) result.push({
      key: 'root_resorption',
      label: 'Root Resorption',
      count: rootTeeth.length,
      toothIds: rootTeeth.map(t => t.id),
      icon: <AlertTriangle size={14} strokeWidth={3} />,
      color: '#ef4444',
      bg: 'bg-red-50',
      animation: 'animate-pulse',
    });

    // Anchorage Loss (per-tooth clinical alert)
    const anchTeeth = allTeeth.filter(t => t.clinicalAlerts?.includes('anchorage_loss'));
    if (anchTeeth.length > 0) result.push({
      key: 'anchorage_loss',
      label: 'Anchorage Loss',
      count: anchTeeth.length,
      toothIds: anchTeeth.map(t => t.id),
      icon: <AlertTriangle size={14} strokeWidth={3} />,
      color: '#ef4444',
      bg: 'bg-red-50',
      animation: 'animate-pulse',
    });

    return result;
  }, [allTeeth, upperTeeth, lowerTeeth, upperArchwire, lowerArchwire, powerChains, elastics, appliances, miniscrews, iprMarkers]);

  // Don't render if no ortho activity
  if (findings.length === 0) return null;

  const effectiveFilter = activeFilter ?? hoverFilter;

  return (
    <div className="flex items-center gap-5 px-6 py-2.5 mx-8 mb-2 bg-gradient-to-r from-indigo-950/[0.03] via-blue-950/[0.02] to-slate-50 backdrop-blur-md border border-indigo-200/60 rounded-2xl shadow-sm flex-wrap relative overflow-hidden group">

      {/* ── Accent gradient line ── */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-indigo-500 via-blue-400 to-cyan-400 rounded-t-2xl opacity-60" />

      {/* ── Header ── */}
      <div className="flex flex-col flex-shrink-0">
        <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.25em] mb-0.5">
          Ortho Status
        </div>
        <div className="text-[13px] font-extrabold text-slate-800 tracking-tight">
          Appliances
        </div>
      </div>

      {/* Vertical divider */}
      <div className="w-px h-8 bg-indigo-200/60 mx-1 flex-shrink-0" />

      {/* ── Finding chips ── */}
      <div className="flex items-center gap-4 flex-wrap flex-1 min-w-[300px]">
        {findings.map(f => {
          const isLocked = activeFilter === f.key;
          const isHover  = hoverFilter === f.key && !isLocked;
          const isDimmed = effectiveFilter !== null && effectiveFilter !== f.key;

          return (
            <div
              key={f.key}
              className={`flex items-center gap-2.5 cursor-pointer select-none transition-all duration-200 group/chip ${
                isDimmed ? 'opacity-25 grayscale-[0.4]' : 'hover:-translate-y-0.5'
              }`}
              onMouseEnter={() => onHoverChange(f.key)}
              onMouseLeave={() => onHoverChange(null)}
              onClick={() => onFilterChange(isLocked ? null : f.key)}
              role="button"
              title={`Click to highlight ${f.label} on chart`}
            >
              {/* Icon badge */}
              <div
                className={`relative flex items-center justify-center w-7 h-7 rounded-xl border transition-all duration-200 ${f.bg} ${f.animation || ''} ${
                  isLocked || isHover ? 'shadow-md scale-105' : 'shadow-sm'
                }`}
                style={{
                  borderColor: `${f.color}${isLocked || isHover || f.ping ? '70' : '35'}`,
                  color: f.color,
                  boxShadow: (isLocked || f.ping) ? `0 0 10px ${f.color}40` : undefined,
                  animationDuration: f.animation === 'animate-pulse' ? '3s' : undefined
                }}
              >
                {/* Pulse for locked OR high-priority alert ping */}
                {(isLocked || f.ping) && (
                  <span
                    className="absolute inset-0 rounded-xl animate-ping opacity-25"
                    style={{ backgroundColor: f.color }}
                  />
                )}
                {f.icon}
              </div>

              {/* Label + count */}
              <div className="flex flex-col leading-tight">
                <span
                  className={`text-[11px] font-bold leading-tight transition-all ${
                    isLocked  ? 'text-slate-900' :
                    isHover   ? 'text-slate-800' : 'text-slate-600'
                  }`}
                >
                  {f.label}
                  {isLocked && (
                    <span className="ml-1 text-[8px] text-indigo-400 font-semibold">Locked</span>
                  )}
                </span>
                <span className="text-[9.5px] font-semibold leading-tight" style={{ color: `${f.color}cc` }}>
                  {f.key === 'upper-wire' || f.key === 'lower-wire'
                    ? 'archwire'
                    : f.count === 1
                    ? '1 unit'
                    : `${f.count} units`}
                </span>
              </div>
            </div>
          );
        })}

        {/* Clear filter button */}
        {activeFilter && (
          <button
            onClick={() => onFilterChange(null)}
            className="ml-auto flex items-center gap-1.5 text-[10px] font-bold text-indigo-500 hover:text-indigo-700 px-3 py-1.5 rounded-xl hover:bg-indigo-50 transition-all border border-indigo-100 hover:border-indigo-200 shadow-sm"
          >
            <X size={11} strokeWidth={3} />
            Clear Filter
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Computes the set of tooth IDs that should be DIMMED when an ortho filter is active.
 * Returns all tooth IDs NOT in the active finding's toothIds list.
 */
export function computeOrthoDimmedIds(
  upperTeeth: ToothData[],
  lowerTeeth: ToothData[],
  upperArchwire: ArchwireConfig | undefined,
  lowerArchwire: ArchwireConfig | undefined,
  powerChains: PowerChainConfig[],
  elastics: ElasticConnection[],
  appliances: Appliance[],
  miniscrews: Miniscrew[],
  iprMarkers: IPRMarker[],
  filter: OrthoFilterKey | null,
): number[] {
  if (!filter) return [];

  const allTeeth = [...upperTeeth, ...lowerTeeth];
  let highlightIds: number[] = [];

  switch (filter) {
    case 'bracket':
      highlightIds = allTeeth.filter(t => t.status === 'bracket').map(t => t.id);
      break;
    case 'molar-tube':
      highlightIds = allTeeth.filter(t => t.status === 'molar-tube').map(t => t.id);
      break;
    case 'band':
      highlightIds = allTeeth.filter(t => t.status === 'band').map(t => t.id);
      break;
    case 'repositioning':
      highlightIds = allTeeth.filter(t => t.status === 'repositioning').map(t => t.id);
      break;
    case 'upper-wire':
      highlightIds = upperTeeth.map(t => t.id);
      break;
    case 'lower-wire':
      highlightIds = lowerTeeth.map(t => t.id);
      break;
    case 'power-chain':
      highlightIds = [...new Set(powerChains.flatMap(p => p.activeTeeth))];
      break;
    case 'elastic':
      highlightIds = [...new Set(elastics.flatMap(e => e.toothIds))];
      break;
    case 'appliance':
      highlightIds = [...new Set(appliances.flatMap(a => a.toothIds))];
      break;
    case 'miniscrew':
      highlightIds = miniscrews.map(m => m.toothId);
      break;
    case 'ipr':
      highlightIds = [...new Set(iprMarkers.map(m => m.toothId))];
      break;
    case 'root_resorption':
      highlightIds = allTeeth.filter(t => t.clinicalAlerts?.includes('root_resorption')).map(t => t.id);
      break;
    case 'anchorage_loss':
      highlightIds = allTeeth.filter(t => t.clinicalAlerts?.includes('anchorage_loss')).map(t => t.id);
      break;
    default:
      return [];
  }

  if (highlightIds.length === 0) return [];
  return allTeeth.filter(t => !highlightIds.includes(t.id)).map(t => t.id);
}

export default OrthoStatusBar;
