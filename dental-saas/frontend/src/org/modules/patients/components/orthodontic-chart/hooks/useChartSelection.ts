/**
 * useChartSelection.ts — Extracted from SnapshotEditor.tsx (P2-12)
 *
 * Manages tooth selection state and UI panel visibility.
 * Provides a clean interface for controlling:
 *   - Which teeth are selected (for bulk actions)
 *   - Which clinical category is active (status, diagnosis, alignment, etc.)
 *   - Which side panels are visible (timeline, todos)
 *   - Time travel mode state
 *
 * INVARIANTS:
 *   - Single-select and multi-select use same state
 *   - Clearing selection returns to zero state
 *   - Panel toggles are independent (can open multiple)
 *   - Time travel mode is a separate flag (does not affect selection)
 */

import { useState, useCallback, useMemo } from 'react';

export interface ChartSelectionState {
  selectedToothIds: number[];
  activeCategory: string | null;
  showTimelinePanel: boolean;
  showTodoSidebar: boolean;
  timeTravelMode: boolean;
}

export interface ChartSelectionActions {
  // Selection management
  selectTooth: (toothId: number, multi?: boolean) => void;
  clearSelection: () => void;
  selectAll: (arch: 'upper' | 'lower', toothIds: number[]) => void;
  isToothSelected: (toothId: number) => boolean;

  // Category management
  setActiveCategory: (category: string | null) => void;

  // Panel management
  toggleTimeline: () => void;
  toggleTodoSidebar: () => void;
  setShowTimelinePanel: (show: boolean) => void;
  setShowTodoSidebar: (show: boolean) => void;

  // Time travel management
  setTimeTravelMode: (enabled: boolean) => void;

  // Batch operations
  selectArchitectureRange: (arch: 'upper' | 'lower', fromIndex: number, toIndex: number, toothIds: number[]) => void;
  selectMultipleTooth: (toothIds: number[]) => void;
}

/**
 * useChartSelection — Manages UI selection state for the orthodontic chart.
 *
 * USAGE:
 *   const selection = useChartSelection();
 *   // Single select
 *   selection.selectTooth(18);
 *   // Multi-select
 *   selection.selectTooth(18, true);
 *   selection.selectTooth(17, true);
 *   // Bulk operations
 *   selection.selectAll('upper', [18, 17, 16, ...])
 *   // Panel control
 *   selection.toggleTimeline();
 */
export function useChartSelection(): ChartSelectionState & ChartSelectionActions {
  // ── Selection State ──────────────────────────────────────────────────

  /**
   * Array of selected tooth IDs.
   * Empty array = no selection.
   * Multiple IDs = multi-select enabled.
   */
  const [selectedToothIds, setSelectedToothIds] = useState<number[]>([]);

  /**
   * Active clinical category for tagging.
   * null = no category selected (chart awaiting user input)
   * Examples: 'status', 'diagnosis', 'alignment', 'condition', etc.
   */
  const [activeCategory, setActiveCategory] = useState<string | null>('status');

  // ── Panel Visibility State ───────────────────────────────────────────

  /**
   * Timeline panel: shows visit history and time travel controls.
   * Toggled via toggleTimeline() or keyboard shortcut.
   */
  const [showTimelinePanel, setShowTimelinePanel] = useState(false);

  /**
   * Todo sidebar: shows clinical tasks and suggestions.
   * Toggled via toggleTodoSidebar() or action confirmation.
   */
  const [showTodoSidebar, setShowTodoSidebar] = useState(false);

  // ── Time Travel State ────────────────────────────────────────────────

  /**
   * Time travel mode: when true, chart displays state at a specific event.
   * Mutations are blocked; saving is disabled.
   * Set via setTimeTravelMode() and cleared on exit.
   */
  const [timeTravelMode, setTimeTravelMode] = useState(false);

  // ── Tooth Selection Actions ──────────────────────────────────────────

  /**
   * Select or deselect a single tooth.
   *
   * @param toothId - FDI tooth number to select
   * @param multi - If true: toggle in multi-select mode
   *              - If false: single-select (replace current selection)
   *
   * BEHAVIOR:
   *   Single-select (multi=false):
   *     - Clicking unselected tooth → select it (clear previous)
   *     - Clicking selected tooth → deselect it
   *   Multi-select (multi=true):
   *     - Clicking unselected tooth → add to selection
   *     - Clicking selected tooth → remove from selection
   */
  const selectTooth = useCallback((toothId: number, multi = false) => {
    setSelectedToothIds((prev) => {
      if (multi) {
        // Toggle in multi-select mode
        return prev.includes(toothId) ? prev.filter((id) => id !== toothId) : [...prev, toothId];
      } else {
        // Single-select mode
        if (prev.length === 1 && prev.includes(toothId)) {
          // Deselect if clicking same tooth
          return [];
        } else {
          // Select single tooth
          return [toothId];
        }
      }
    });
  }, []);

  /**
   * Clear all tooth selection.
   * Used after bulk actions complete or when user clicks neutral area.
   */
  const clearSelection = useCallback(() => {
    setSelectedToothIds([]);
  }, []);

  /**
   * Select all teeth in an arch.
   *
   * @param arch - 'upper' or 'lower'
   * @param toothIds - Pre-sorted list of tooth IDs for this arch
   *
   * USAGE:
   *   selection.selectAll('upper', [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28])
   */
  const selectAll = useCallback((arch: 'upper' | 'lower', toothIds: number[]) => {
    setSelectedToothIds(toothIds);
  }, []);

  /**
   * Check if a specific tooth is currently selected.
   * Convenience method for conditional rendering.
   */
  const isToothSelected = useCallback(
    (toothId: number) => {
      return selectedToothIds.includes(toothId);
    },
    [selectedToothIds]
  );

  /**
   * Select a contiguous range of teeth in an arch.
   *
   * @param arch - 'upper' or 'lower'
   * @param fromIndex - Start index in the arch array
   * @param toIndex - End index in the arch array
   * @param toothIds - All tooth IDs for this arch (used to extract range)
   *
   * EXAMPLE: select teeth from index 2 to 6 in upper arch
   *   selectArchitectureRange('upper', 2, 6, [18, 17, 16, 15, 14, 13, 12, 11, ...])
   *   // Result: [16, 15, 14, 13, 12]
   */
  const selectArchitectureRange = useCallback(
    (arch: 'upper' | 'lower', fromIndex: number, toIndex: number, toothIds: number[]) => {
      const start = Math.min(fromIndex, toIndex);
      const end = Math.max(fromIndex, toIndex) + 1;
      const selected = toothIds.slice(start, end);
      setSelectedToothIds(selected);
    },
    []
  );

  /**
   * Select multiple specific teeth.
   * Replaces current selection with provided IDs.
   *
   * @param toothIds - Array of tooth IDs to select
   */
  const selectMultipleTooth = useCallback((toothIds: number[]) => {
    setSelectedToothIds(toothIds);
  }, []);

  // ── Panel Actions ────────────────────────────────────────────────────

  /**
   * Toggle timeline panel visibility.
   * Typical for showing visit history or switching to time travel mode.
   */
  const toggleTimeline = useCallback(() => {
    setShowTimelinePanel((prev) => !prev);
  }, []);

  /**
   * Toggle todo sidebar visibility.
   * Typical for showing pending clinical tasks or action suggestions.
   */
  const toggleTodoSidebar = useCallback(() => {
    setShowTodoSidebar((prev) => !prev);
  }, []);

  // ── Memoized Return Object ───────────────────────────────────────────

  return useMemo(
    () => ({
      // State
      selectedToothIds,
      activeCategory,
      showTimelinePanel,
      showTodoSidebar,
      timeTravelMode,

      // Actions
      selectTooth,
      clearSelection,
      selectAll,
      isToothSelected,
      setActiveCategory,
      toggleTimeline,
      toggleTodoSidebar,
      setShowTimelinePanel,
      setShowTodoSidebar,
      setTimeTravelMode,
      selectArchitectureRange,
      selectMultipleTooth,
    }),
    [
      selectedToothIds,
      activeCategory,
      showTimelinePanel,
      showTodoSidebar,
      timeTravelMode,
      selectTooth,
      clearSelection,
      selectAll,
      isToothSelected,
      toggleTimeline,
      toggleTodoSidebar,
      selectArchitectureRange,
      selectMultipleTooth,
    ]
  );
}
