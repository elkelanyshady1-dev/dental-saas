import React, { useMemo } from 'react';
import type { ToothData, DiagnosisValue, AlignmentValue, AlertValue } from '../types';
import { ToothBadge } from './ToothBadge';
import { Sparkles, X, Stethoscope, Waves } from 'lucide-react';

// ── Collect all active clinical tags from a tooth ─────────────────────────────

function getToothTags(tooth: ToothData): string[] {
  const tags: string[] = [];
  const cs = tooth.clinicalStatus;
  if (cs?.diagnosis)  tags.push(cs.diagnosis);
  if (cs?.alignment)  tags.push(cs.alignment);
  
  // Only include general clinical alerts, exclude ortho-specific alerts 
  // (Resorption and Anchorage are handled in the Ortho Status Bar)
  if (tooth.clinicalAlerts?.length) {
    const alerts = tooth.clinicalAlerts.filter(a => a !== 'root_resorption' && a !== 'anchorage_loss');
    tags.push(...alerts);
  }
  return tags;
}

// ── Component ────────────────────────────────────────────────────────────────

const HalitosisIcon = ({ size = 14, color = 'currentColor' }: { size?: number, color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 4c0 0-2 1-2 4s2 4 2 7-2 5-2 5" /> {/* mouth/face profile */}
    <path d="M11 8c1.5 0 2.5 1 2.5 2s-1 2-2.5 2" /> {/* odor wave 1 */}
    <path d="M14 11.5c1.5 0 2.5 1 2.5 2s-1 2-2.5 2" /> {/* odor wave 2 */}
    <path d="M11 15c1.5 0 2.5 1 2.5 2s-1 2-2.5 2" /> {/* odor wave 3 */}
  </svg>
);

export interface StatusSummaryBarProps {
  upperTeeth: ToothData[];
  lowerTeeth: ToothData[];
  /** Active global (patient-level) alerts — Medical Condition, Poor Hygiene */
  globalAlerts?: Set<AlertValue>;
  /** Locked filter (persisted via click). null = no filter */
  activeFilter:    string | null;
  /** Transient hover preview filter. null = no preview */
  hoverFilter:     string | null;
  onFilterChange:  (status: string | null) => void;
  onHoverChange:   (status: string | null) => void;
}

const StatusSummaryBar: React.FC<StatusSummaryBarProps> = ({
  upperTeeth,
  lowerTeeth,
  globalAlerts,
  activeFilter,
  hoverFilter,
  onFilterChange,
  onHoverChange,
}) => {
  // Aggregate tag counts across all teeth (memoised)
  const counts = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    [...upperTeeth, ...lowerTeeth].forEach(tooth => {
      getToothTags(tooth).forEach(tag => {
        map[tag] = (map[tag] ?? 0) + 1;
      });
    });
    return map;
  }, [upperTeeth, lowerTeeth]);

  const activeStatuses = useMemo(() => Object.keys(counts).sort(), [counts]);

  const globalAlertItems: { value: AlertValue; label: string; color: string; icon: React.ReactNode }[] = (
    [
      { 
        value: 'medical_alert' as AlertValue, 
        label: 'Medical Condition', 
        color: '#f43f5e', 
        icon: <Stethoscope size={14} /> 
      },
      { 
        value: 'poor_hygiene'  as AlertValue, 
        label: 'Poor Oral Hygiene', 
        color: '#ec4899', 
        icon: <HalitosisIcon size={14} /> 
      },
    ] as { value: AlertValue; label: string; color: string; icon: React.ReactNode }[]
  ).filter(a => globalAlerts?.has(a.value));

  // Don't render when chart is entirely clean AND no global alerts
  if (activeStatuses.length === 0 && globalAlertItems.length === 0) return null;

  const effectiveFilter = activeFilter ?? hoverFilter;

  return (
    <div className="flex items-center gap-6 px-6 py-3 mx-8 mb-2 bg-white/80 backdrop-blur-md border border-slate-200 border-dashed rounded-2xl shadow-xl shadow-slate-200/40 flex-wrap relative overflow-hidden group">
      
      {/* ── Subtile background treatment ── */}
      <div className="absolute top-0 right-0 p-1 opacity-10 group-hover:opacity-20 transition-all pointer-events-none">
        <Sparkles size={48} className="text-slate-300" />
      </div>

      {/* ── Header ── */}
      <div className="flex flex-col flex-shrink-0">
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-0.5">
          Global Overview
        </div>
        <div className="text-[13px] font-extrabold text-slate-900 tracking-tight">
          Teeth Summary
        </div>
      </div>

      {/* Vertical divider */}
      <div className="w-px h-8 bg-slate-200/80 mx-2 flex-shrink-0" />

      {/* ── Status items ── */}
      <div className="flex items-center gap-6 flex-wrap flex-1 min-w-[300px]">
        {activeStatuses.map(tag => {
          const isLocked = activeFilter === tag;
          const isHover  = hoverFilter  === tag && !isLocked;
          const isDimmed = effectiveFilter !== null && effectiveFilter !== tag;

          return (
            <div
              key={tag}
              className={`flex items-center gap-3 transition-all duration-300 select-none group/item ${
                isDimmed
                  ? 'opacity-25 grayscale-[0.5]'
                  : 'hover:-translate-y-0.5 cursor-help'
              }`}
              onMouseEnter={() => onHoverChange(tag)}
              onMouseLeave={() => onHoverChange(null)}
              onClick={() => onFilterChange(isLocked ? null : tag)}
              role="button"
            >
              <ToothBadge 
                status={tag} 
                isCritical={isLocked || isHover}
                className={isLocked || isHover ? 'shadow-md border-opacity-100' : 'border-opacity-40'}
              />

              <div className="flex flex-col leading-tight min-w-[70px]">
                <span className={`text-[11px] font-bold capitalize leading-tight transition-all ${isLocked || isHover ? 'scale-[1.02]' : ''}`}>
                  {tag.replace(/_/g, ' ')}
                  {isLocked && <span className="ml-1 text-[8px] text-slate-400">Locked</span>}
                </span>
                <span className="text-[10px] font-semibold text-slate-400 leading-tight">
                  {counts[tag]} {counts[tag] === 1 ? 'tooth' : 'teeth'}
                </span>
              </div>
            </div>
          );
        })}

        {/* ── Patient-level global alert badges ── */}
        {globalAlertItems.map(a => (
          <div
            key={a.value}
            className="flex items-center gap-3 select-none"
            title={a.label}
          >
            {/* Icon pill */}
            <div
              className="flex items-center justify-center w-7 h-7 rounded-xl border shadow-sm relative transition-all duration-300"
              style={{ 
                background: `${a.color}08`, 
                borderColor: a.value === 'poor_hygiene' ? '#a855f740' : `${a.color}35`, 
                color: a.color 
              }}
            >
              {a.icon}
            </div>
            <div className="flex flex-col leading-tight min-w-[70px]">
              <span className="text-[11px] font-bold leading-tight" style={{ color: a.color }}>
                {a.label}
              </span>
              <span className="text-[10px] font-semibold text-slate-400 leading-tight">Patient</span>
            </div>
          </div>
        ))}

        {/* Clear locked filter */}
        {activeFilter && (
          <button
            onClick={() => onFilterChange(null)}
            className="ml-auto flex items-center gap-1.5 text-[10px] font-bold text-rose-500 hover:text-rose-600 px-3 py-1.5 rounded-xl hover:bg-rose-50 transition-all border border-rose-100 hover:border-rose-200 shadow-sm"
          >
            <X size={12} strokeWidth={3} />
            Clear Filter
          </button>
        )}
      </div>
    </div>
  );
};

/** Pure helper: given a tag and a ToothData set, return IDs that do NOT have the tag (= should be dimmed) */
export function computeDimmedIds(
  upperTeeth: ToothData[],
  lowerTeeth: ToothData[],
  filter: string | null,
): number[] {
  if (!filter) return [];
  return [...upperTeeth, ...lowerTeeth]
    .filter(t => !getToothTags(t).includes(filter))
    .map(t => t.id);
}

export default StatusSummaryBar;
