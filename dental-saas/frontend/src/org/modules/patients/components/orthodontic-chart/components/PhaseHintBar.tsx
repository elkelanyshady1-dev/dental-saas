/**
 * PhaseHintBar.tsx
 * Domain: ortho-todos / clinical phases
 * Layer: Frontend > Components
 *
 * Displays clinical phase context hints inside the Snapshot Editor.
 * Non-enforcing — for guidance only.
 * Shown below the action toolbar when a clinicalPhase is active.
 */

import React from "react";
import { Info, Layers, Ruler, Sparkles } from "lucide-react";
import type { TodoClinicalPhase } from "../api/orthoTodo.api";

interface PhaseConfig {
  icon:  React.ReactNode;
  label: string;
  hint:  string;
  color: { bg: string; border: string; text: string; badge: string };
}

const PHASE_CONFIG: Record<TodoClinicalPhase, PhaseConfig> = {
  LEVEL_ALIGNMENT: {
    icon:  <Layers className="w-3.5 h-3.5" />,
    label: "Level & Alignment",
    hint:  "Focus on rotations, crowding, and axial inclinations. Check bracket positions.",
    color: {
      bg:     "bg-blue-50",
      border: "border-blue-100",
      text:   "text-blue-700",
      badge:  "bg-blue-600 text-white",
    },
  },
  SPACE_MANAGEMENT: {
    icon:  <Ruler className="w-3.5 h-3.5" />,
    label: "Space Management",
    hint:  "Monitor extraction space closure. Verify anchorage and retraction mechanics.",
    color: {
      bg:     "bg-emerald-50",
      border: "border-emerald-100",
      text:   "text-emerald-700",
      badge:  "bg-emerald-600 text-white",
    },
  },
  FINISHING: {
    icon:  <Sparkles className="w-3.5 h-3.5" />,
    label: "Finishing",
    hint:  "Detailing bends, occlusal refinement, and interdigitation check before debonding.",
    color: {
      bg:     "bg-purple-50",
      border: "border-purple-100",
      text:   "text-purple-700",
      badge:  "bg-purple-600 text-white",
    },
  },
};

interface PhaseHintBarProps {
  clinicalPhase: TodoClinicalPhase | null;
  suggestedPhase?: TodoClinicalPhase | null;
  onAcceptSuggestion?: (phase: TodoClinicalPhase) => void;
  onDismiss?: () => void;
}

export default function PhaseHintBar({
  clinicalPhase,
  suggestedPhase,
  onAcceptSuggestion,
  onDismiss,
}: PhaseHintBarProps) {
  const activePhase = clinicalPhase ?? suggestedPhase;
  if (!activePhase) return null;

  const cfg       = PHASE_CONFIG[activePhase];
  const isSuggestion = !clinicalPhase && !!suggestedPhase;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 border-b text-xs ${cfg.color.bg} ${cfg.color.border}`}
    >
      {/* Phase badge */}
      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.color.badge}`}>
        {cfg.icon}
        {cfg.label}
        {isSuggestion && <span className="ml-0.5 opacity-70">(suggested)</span>}
      </span>

      {/* Hint text */}
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <Info className={`w-3 h-3 shrink-0 ${cfg.color.text} opacity-60`} />
        <span className={`truncate ${cfg.color.text} opacity-80`}>{cfg.hint}</span>
      </div>

      {/* Suggestion controls */}
      {isSuggestion && onAcceptSuggestion && (
        <button
          onClick={() => onAcceptSuggestion(suggestedPhase!)}
          className={`shrink-0 px-2 py-0.5 rounded text-[9px] font-bold border ${cfg.color.text} ${cfg.color.border} hover:opacity-80 transition-opacity`}
        >
          Set Phase
        </button>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={`shrink-0 text-[10px] ${cfg.color.text} opacity-40 hover:opacity-70 transition-opacity`}
          title="Dismiss hint"
        >
          ✕
        </button>
      )}
    </div>
  );
}
