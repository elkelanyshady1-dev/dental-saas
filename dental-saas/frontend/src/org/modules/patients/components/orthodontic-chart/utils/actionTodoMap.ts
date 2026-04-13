/**
 * actionTodoMap.ts
 * Domain: ortho-todos / clinical rule engine
 * Layer: Frontend > Utils
 *
 * Centralized mapping: alignment action → TODO suggestion list.
 * Trigger guard: only fires when tooth.hasBracket === true.
 * Never enforces clinical decisions — always suggestion-only.
 */

import type { TodoType, TodoPriority } from "../api/orthoTodo.api";
import type { ToothData, AlignmentValue } from "../types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TodoSuggestionItem {
  type:        TodoType;
  description: string;
  priority:    TodoPriority;
}

// ── Rule Engine ───────────────────────────────────────────────────────────────

/**
 * Maps alignment values → suggested TODO actions.
 * Only populated for clinically actionable alignments.
 * Values not in this map (e.g. mesial_in, distal_in) produce no suggestions.
 */
export const ACTION_TODO_MAP: Partial<Record<AlignmentValue, TodoSuggestionItem[]>> = {
  mesial_out: [
    { type: "WIRE_BEND",          description: "Apply mesial-in bend on tooth",          priority: "medium" },
    { type: "BRACKET_REPOSITION", description: "Consider bracket repositioning",          priority: "low"    },
  ],
  distal_out: [
    { type: "WIRE_BEND",          description: "Apply distal-in bend on tooth",           priority: "medium" },
  ],
  rotated: [
    { type: "BRACKET_REPOSITION", description: "Correct rotation via bracket reposition", priority: "high"   },
  ],
  displaced_buccal: [
    { type: "BRACKET_REPOSITION", description: "Reposition buccally displaced bracket",   priority: "high"   },
  ],
  displaced_lingual: [
    { type: "BRACKET_REPOSITION", description: "Reposition lingually displaced bracket",  priority: "high"   },
  ],
  impacted: [
    { type: "OCCLUSAL_ADJUSTMENT", description: "Monitor impacted tooth — plan exposure", priority: "medium" },
  ],
  mesial_in: [
    { type: "WIRE_BEND",          description: "Check mesial-in overcorrection",          priority: "low"    },
  ],
  distal_in: [
    { type: "WIRE_BEND",          description: "Check distal-in overcorrection",          priority: "low"    },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true when the tooth currently has any bracket/tube/band bonded. */
export function hasBracket(tooth: ToothData): boolean {
  return (
    tooth.status === "bracket" ||
    tooth.status === "molar-tube" ||
    tooth.status === "band"
  );
}

/**
 * Returns TODO suggestions for a given tooth + alignment value.
 * Returns empty array when:
 *   - tooth has no bracket (guard enforced here, not at call site)
 *   - alignment has no rule entries
 */
export function getAlignmentSuggestions(
  tooth: ToothData,
  alignment: AlignmentValue,
): TodoSuggestionItem[] {
  if (!hasBracket(tooth)) return [];
  return ACTION_TODO_MAP[alignment] ?? [];
}

/**
 * Human-readable labels for alignment values (used in suggestion modal header).
 */
export const ALIGNMENT_LABELS: Partial<Record<AlignmentValue, string>> = {
  mesial_out:        "Mesial Out",
  distal_out:        "Distal Out",
  mesial_in:         "Mesial In",
  distal_in:         "Distal In",
  rotated:           "Rotation",
  displaced_buccal:  "Buccal Displacement",
  displaced_lingual: "Lingual Displacement",
  impacted:          "Impacted",
};
