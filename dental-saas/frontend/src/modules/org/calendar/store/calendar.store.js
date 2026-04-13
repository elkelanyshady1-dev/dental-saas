import { create } from "zustand";

/**
 * useCalendarStore — Central UI state for the Scheduling Engine (v13.2)
 *
 * Rules:
 * - NO server state here (React Query handles appointments)
 * - UI-Only state: current date, view mode, dragging selection, filters
 */
export const useCalendarStore = create((set, get) => ({
    // ── Date & View ───────────────────────────────────────────────────────────
    currentDate: new Date(),
    viewMode: "day", // day | week | week-doctor | month

    setDate: (date) => set({ currentDate: date }),
    setViewMode: (mode) => set({ viewMode: mode }),

    // ── Filters ───────────────────────────────────────────────────────────────
    selectedBranchId: null,
    selectedPractitionerIds: [], // Multi-doctor support

    setSelectedBranchId: (id) => set({ selectedBranchId: id }),
    setSelectedPractitionerIds: (ids) => set({ selectedPractitionerIds: ids }),

    // ── Drag Selection (creating new appointment) ─────────────────────────────
    // Used to show the visual overlay while dragging across the grid
    isDraggingSelection: false,
    dragSelection: {
        startTime: null,
        endTime: null,
        branchId: null,
        chairId: null,
        practitionerId: null,
    },

    startSelection: ({ startTime, branchId, chairId, practitionerId }) => set({
        isDraggingSelection: true,
        dragSelection: {
            startTime,
            endTime: startTime, // initially same
            branchId,
            chairId,
            practitionerId,
        },
    }),

    updateSelection: (endTime) => set((state) => ({
        dragSelection: { ...state.dragSelection, endTime }
    })),

    endSelection: () => set({ isDraggingSelection: false }),
    clearSelection: () => set({
        isDraggingSelection: false,
        dragSelection: { startTime: null, endTime: null, branchId: null, chairId: null, practitionerId: null }
    }),

    // ── Appointment Mutation State ───────────────────────────────────────────
    // Tracks current dragging/resizing status of an existing appointment
    isMovingAppointment: false,
    movingAppointmentId: null,
    setMovingAppointment: (id, status) => set({
        movingAppointmentId: id,
        isMovingAppointment: status
    }),
}));
