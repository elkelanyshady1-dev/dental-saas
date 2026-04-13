/**
 * TodoSuggestionModal.tsx
 * Domain: ortho-todos
 * Layer: Frontend > Components
 *
 * Non-blocking floating modal shown after an alignment action on a bracketed tooth.
 * Clinician selects which suggested TODOs to create, then confirms or ignores.
 *
 * UX rules:
 *   - Appears bottom-right, never blocks the chart
 *   - All suggestions pre-selected by default
 *   - Auto-dismisses on confirm or ignore
 *   - Multi-select checkboxes
 */

import React, { useState } from "react";
import { motion } from "motion/react";
import { Zap, Check, X } from "lucide-react";
import type { TodoSuggestionItem } from "../utils/actionTodoMap";
import { ALIGNMENT_LABELS } from "../utils/actionTodoMap";
import type { AlignmentValue } from "../types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface TodoSuggestionModalProps {
  toothId:    number;
  alignment:  AlignmentValue;
  suggestions: TodoSuggestionItem[];
  /** Called with the user-selected subset; always non-empty when called. */
  onConfirm:  (selected: TodoSuggestionItem[]) => void;
  onIgnore:   () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const PRIORITY_DOT: Record<string, string> = {
  high:   "bg-red-500",
  medium: "bg-amber-400",
  low:    "bg-slate-300",
};

export default function TodoSuggestionModal({
  toothId,
  alignment,
  suggestions,
  onConfirm,
  onIgnore,
}: TodoSuggestionModalProps) {
  // All suggestions pre-selected
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(suggestions.map((_, i) => i)),
  );

  const toggle = (i: number) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const handleConfirm = () => {
    const chosen = suggestions.filter((_, i) => selected.has(i));
    if (chosen.length > 0) onConfirm(chosen);
    else onIgnore();
  };

  const label = ALIGNMENT_LABELS[alignment] ?? alignment;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0,  scale: 1     }}
      exit={{   opacity: 0, y: 12, scale: 0.96   }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="fixed bottom-24 right-6 z-[500] w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
    >
      {/* ── Header ── */}
      <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-start gap-2.5">
        <Zap className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-widest text-amber-600 mb-0.5">
            TODO Suggestion
          </p>
          <p className="text-xs font-semibold text-slate-700 truncate">
            Tooth {toothId} — {label} detected
          </p>
        </div>
        <button
          onClick={onIgnore}
          className="shrink-0 text-slate-300 hover:text-slate-500 transition-colors mt-0.5"
          title="Ignore"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Suggestions list ── */}
      <div className="px-4 py-3 space-y-2">
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">
          Suggested Actions
        </p>
        {suggestions.map((s, i) => {
          const isSelected = selected.has(i);
          return (
            <button
              key={i}
              onClick={() => toggle(i)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-all ${
                isSelected
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : "bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-200"
              }`}
            >
              {/* Checkbox */}
              <div
                className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  isSelected ? "bg-blue-600 border-blue-600" : "border-slate-300"
                }`}
              >
                {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              {/* Priority dot */}
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[s.priority]}`} />
              {/* Description */}
              <span className="flex-1 text-[11px] font-semibold leading-snug">
                {s.description}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Actions ── */}
      <div className="px-4 pb-3 pt-1 flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={selected.size === 0}
          className="flex-1 py-2 bg-blue-600 text-white text-[10px] font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          Add to TODO{selected.size > 0 ? ` (${selected.size})` : ""}
        </button>
        <button
          onClick={onIgnore}
          className="px-3 py-2 text-slate-400 text-[10px] font-semibold rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors"
        >
          Ignore
        </button>
      </div>
    </motion.div>
  );
}
