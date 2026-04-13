/**
 * SequenceGuidanceCard.tsx — Treatment Sequence Engine V1.5 UI
 *
 * Renders the floating clinical guidance panel inside SnapshotEditor.
 * Position: fixed, top-center, z-[1200] (above OPG panel and bracket panel).
 *
 * Architecture constraints:
 *   ✅ Display-only — does NOT mutate bonding/TAD/chart state
 *   ✅ onNext / onPrev are async — persists progress to WorkflowSnapshot
 *   ✅ Can be collapsed by clinician (persisted to local UI state only)
 *   ❌ Does NOT block chart interaction
 *   ❌ Does NOT autocomplete clinical steps
 */

import React, { useState } from 'react';
import type { SequenceStep } from '../api/sequence.api';

// ─── Action color mapping ─────────────────────────────────────────────────────

const ACTION_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  BONDING:    { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Bonding'    },
  WIRE:       { bg: 'bg-violet-100', text: 'text-violet-700', label: 'Wire'       },
  EXTRACTION: { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Extraction' },
  TAD:        { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'TAD'        },
  ELASTICS:   { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Elastics'   },
  OTHER:      { bg: 'bg-slate-100',  text: 'text-slate-600',  label: 'Other'      },
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SequenceGuidanceCardProps {
  currentStep: SequenceStep | null;
  nextStep: SequenceStep | null;
  prevStep: SequenceStep | null;
  currentStepIndex: number;
  totalSteps: number;
  progress: number; // 0-100
  isFirst: boolean;
  isLast: boolean;
  isUpdating: boolean;
  onNext: () => void | Promise<void>;
  onPrev: () => void | Promise<void>;
  onClose?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const SequenceGuidanceCard: React.FC<SequenceGuidanceCardProps> = ({
  currentStep,
  nextStep,
  prevStep,
  currentStepIndex,
  totalSteps,
  progress,
  isFirst,
  isLast,
  isUpdating,
  onNext,
  onPrev,
  onClose,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!currentStep) return null;

  return (
    <div
      className="absolute top-4 left-1/2 -translate-x-1/2 z-[1200]"
      style={{ pointerEvents: 'auto' }}
      // Prevent outside-click handlers from closing the card
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="bg-white/95 backdrop-blur-sm border border-slate-200/80 shadow-2xl rounded-2xl overflow-hidden"
        style={{ width: 380, minWidth: 320 }}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            {/* Sequence icon */}
            <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <svg
                className="w-3.5 h-3.5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider leading-none">
                Treatment Sequence
              </div>
              <div className="text-[10px] text-slate-500 leading-none mt-0.5">
                Step {currentStepIndex + 1} of {totalSteps}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Collapse toggle */}
            <button
              onClick={() => setIsCollapsed((c) => !c)}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title={isCollapsed ? 'Expand' : 'Collapse'}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {isCollapsed
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />}
              </svg>
            </button>

            {/* Close */}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                title="Close guidance panel"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* ── Progress Bar ─────────────────────────────────────────────── */}
        <div className="h-1 bg-slate-100">
          <div
            className="h-1 bg-indigo-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* ── Body (collapsible) ────────────────────────────────────────── */}
        {!isCollapsed && (
          <div className="px-4 py-3">
            {/* Current step title */}
            <div className="font-semibold text-slate-900 text-sm leading-snug">
              {currentStep.title}
            </div>

            {/* Description */}
            {currentStep.description && (
              <div className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                {currentStep.description}
              </div>
            )}

            {/* Action type badges (V2 data hints) */}
            {currentStep.actions.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {currentStep.actions.map((action, idx) => {
                  const style = ACTION_COLORS[action.type] ?? ACTION_COLORS.OTHER;
                  return (
                    <span
                      key={idx}
                      className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}
                    >
                      {style.label}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Prev / Next step context */}
            <div className="mt-3 space-y-0.5">
              {prevStep && (
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Prev: {prevStep.title}</span>
                </div>
              )}
              {nextStep && (
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <span>Next: {nextStep.title}</span>
                </div>
              )}
              {isLast && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                  <span>🎉</span>
                  <span>Final step — treatment complete</span>
                </div>
              )}
            </div>

            {/* ── Action Buttons ──────────────────────────────────────────── */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={onPrev}
                disabled={isFirst || isUpdating}
                className="flex-1 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Back
              </button>

              <button
                onClick={onNext}
                disabled={isUpdating}
                className="flex-[2] px-3 py-1.5 text-xs font-semibold rounded-lg text-white transition-all
                  bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed
                  flex items-center justify-center gap-1.5"
              >
                {isUpdating ? (
                  <>
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving…
                  </>
                ) : isLast ? (
                  '🎉 Complete'
                ) : (
                  'Mark as Done →'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SequenceGuidanceCard;
