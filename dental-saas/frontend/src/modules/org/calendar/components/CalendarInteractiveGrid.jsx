import React, { useRef } from "react";
import { useCalendarStore } from "../store/calendar.store";
import { snapToGrid } from "../utils/calendarUtils";

/**
 * CalendarInteractiveGrid.jsx — Mouse interaction wrapper
 * 
 * Logic:
 * 1. Capture onMouseDown → set current start time slot (snapped to 15m)
 * 2. Capture onMouseMove → if isDragging, calculate current end time slot
 * 3. Capture onMouseUp   → end dragging, emit event for new appointment
 */
export default function CalendarInteractiveGrid({
    date,
    workStart,
    slotDuration,
    slotHeight = 52,
    branchId,
    chairId,
    practitionerId,
    children,
    onSelectionComplete
}) {
    const gridRef = useRef(null);
    const setSelectionStart = useCalendarStore((s) => s.startSelection);
    const updateSelection = useCalendarStore((s) => s.updateSelection);
    const endSelection = useCalendarStore((s) => s.endSelection);

    // ── Mouse Handlers ────────────────────────────────────────────────────────

    const handleMouseDown = (e) => {
        if (!gridRef.current) return;
        const rect = gridRef.current.getBoundingClientRect();
        const y = e.clientY - rect.top;

        // Calculate time from Y position
        const minutesOffset = Math.floor(y / slotHeight) * slotDuration;
        const totalMinutes = workStart + minutesOffset;
        
        const startTime = new Date(date);
        startTime.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
        const snappedStart = snapToGrid(startTime, 15);

        setSelectionStart({
            startTime: snappedStart,
            branchId,
            chairId,
            practitionerId
        });
    };

    const handleMouseMove = (e) => {
        const isDragging = useCalendarStore.getState().isDraggingSelection;
        const currentSelection = useCalendarStore.getState().dragSelection;
        
        // Guard: only process the column this drag started in.
        // In chair-column mode, match by chairId.
        // In practitioner-column mode, chairId is null for both — match by practitionerId.
        const isThisColumn = chairId
            ? currentSelection.chairId === chairId
            : currentSelection.practitionerId === practitionerId;
        
        if (!isDragging || !gridRef.current || !isThisColumn) return;

        const rect = gridRef.current.getBoundingClientRect();
        const y = e.clientY - rect.top;

        // Bounded by grid boundaries
        const boundedY = Math.max(0, Math.min(y, rect.height));

        const minutesOffset = Math.round(boundedY / (slotHeight / (slotDuration / 15))) * 15;
        const totalMinutes = workStart + minutesOffset;

        const endTime = new Date(date);
        endTime.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
        const snappedEnd = snapToGrid(endTime, 15);

        // Update if distinct (performance optimization)
        const currentEnd = currentSelection.endTime;
        if (!currentEnd || snappedEnd.getTime() !== currentEnd.getTime()) {
            updateSelection(snappedEnd);
        }
    };

    const handleMouseUp = () => {
        const isDragging = useCalendarStore.getState().isDraggingSelection;
        const currentSelection = useCalendarStore.getState().dragSelection;
        
        // Guard: same column-matching logic as handleMouseMove
        const isThisColumn = chairId
            ? currentSelection.chairId === chairId
            : currentSelection.practitionerId === practitionerId;
        
        if (!isDragging || !isThisColumn) return;

        const start = new Date(Math.min(new Date(currentSelection.startTime), new Date(currentSelection.endTime)));
        const end = new Date(Math.max(new Date(currentSelection.startTime), new Date(currentSelection.endTime)));

        // If selection is too short (just a click), default to 30 mins
        let finalEnd = end;
        if (start.getTime() === end.getTime()) {
            finalEnd = new Date(start.getTime() + 30 * 60000);
        }

        endSelection();

        // Finalize
        onSelectionComplete?.({
            startTime: start,
            endTime: finalEnd,
            branchId,
            chairId,
            practitionerId
        });
    };

    return (
        <div 
            ref={gridRef}
            className="relative h-full w-full select-none cursor-crosshair group"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={endSelection} // Robustness if user drags outside
        >
            {/* Grid overlay for visual guides */}
            <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-blue-50/5" />

            {children}
        </div>
    );
}
