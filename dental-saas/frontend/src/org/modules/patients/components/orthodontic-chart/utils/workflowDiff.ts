/**
 * workflowDiff.ts
 * ═══════════════════════════════════════════════════════════════
 * Diff engine for the enterprise autosave system (Phase 3.3).
 *
 * Computes a SPARSE diff between two workflow state snapshots.
 * Only changed top-level fields are included in the output.
 * Comparison is done via JSON.stringify for deep equality.
 *
 * CONTRACT:
 *   - Input:  two full workflow payload objects
 *   - Output: { [key]: newValue } — only what changed
 *   - Empty result ({}): nothing changed → skip save
 *
 * WHY TOP-LEVEL ONLY:
 *   The backend's patchWorkflowData uses MongoDB dot-notation field
 *   writes: "workflowData.recordSets", "workflowData.treatmentGoals"
 *   etc. Each top-level key maps to one atomic DB field write.
 *   Sub-field diffs would require deeper MongoDB set paths which
 *   add complexity without benefit for this data shape.
 *
 * PERFORMANCE:
 *   JSON.stringify is O(n) per field — acceptable for a max ~8
 *   top-level fields in the workflow payload. For the typical case
 *   (step navigation with no photo changes), the diff is tiny:
 *     { currentStep: 2 }  →  single field write
 * ═══════════════════════════════════════════════════════════════
 */

export type WorkflowPayload = Record<string, unknown>;

/**
 * computeWorkflowDiff
 *
 * Returns only the keys whose values differ between prev and next.
 * For first-save (prev is null/undefined), returns a copy of next.
 *
 * @param prev  - Previously saved state (null if this is the first save)
 * @param next  - Current state to compare against prev
 * @returns     - Sparse diff object ({ changedKey: newValue })
 */
export function computeWorkflowDiff(
  prev: WorkflowPayload | null | undefined,
  next: WorkflowPayload
): WorkflowPayload {
  // First save OR no baseline — send everything
  if (!prev || Object.keys(prev).length === 0) {
    return { ...next };
  }

  const diff: WorkflowPayload = {};

  // Check for NEW or CHANGED keys (in next but not in prev, or value changed)
  for (const key in next) {
    if (Object.prototype.hasOwnProperty.call(next, key)) {
      try {
        if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
          diff[key] = next[key];
        }
      } catch {
        // If stringify fails (circular refs, etc.) — include the field to be safe
        diff[key] = next[key];
      }
    }
  }

  // NOTE: We intentionally do NOT check for DELETED keys (keys in prev but
  // not in next). The workflow payload grows monotonically — fields are never
  // removed during a session. If that changes, add deletion tracking here.

  return diff;
}

/**
 * hasWorkflowChanges
 *
 * Quick boolean check — avoids diff computation overhead when
 * the caller just needs to know if there's anything to save.
 */
export function hasWorkflowChanges(
  prev: WorkflowPayload | null | undefined,
  next: WorkflowPayload
): boolean {
  if (!prev) return true;
  return Object.keys(computeWorkflowDiff(prev, next)).length > 0;
}
