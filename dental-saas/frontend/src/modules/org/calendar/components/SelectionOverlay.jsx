import React from "react";
import { useCalendarStore } from "../store/calendar.store";
import { formatTime24, durationMins } from "../utils/calendarUtils";

/**
 * SelectionOverlay.jsx — Visual feedback for drag-to-select
 * 
 * Renders the blue creation box when user clicks and drags across the calendar grid.
 * Only shown if isDraggingSelection is true.
 */
export default function SelectionOverlay({ 
    workStart, 
    slotDuration, 
    slotHeight = 52,
    activeChairId,
    activePractitionerId
}) {
    const isDragging = useCalendarStore((s) => s.isDraggingSelection);
    const selection = useCalendarStore((s) => s.dragSelection);

    if (!isDragging || !selection.startTime || !selection.endTime) return null;

    // Must match column context
    if (activeChairId && selection.chairId !== activeChairId) return null;
    if (activePractitionerId && selection.practitionerId !== activePractitionerId) return null;

    const start = new Date(Math.min(new Date(selection.startTime), new Date(selection.endTime)));
    const end = new Date(Math.max(new Date(selection.startTime), new Date(selection.endTime)));

    // Calculate position
    const startMins = start.getHours() * 60 + start.getMinutes();
    const endMins = end.getHours() * 60 + end.getMinutes();
    const duration = endMins - startMins;

    const top = ((startMins - workStart) / slotDuration) * slotHeight;
    const height = Math.max((duration / slotDuration) * slotHeight, 10);

    return (
        <div 
            className="absolute left-1 right-1 bg-brand-primary/10 backdrop-blur-md border-[1.5px] border-brand-primary rounded-2xl z-30 pointer-events-none flex flex-col items-center justify-center overflow-hidden shadow-brand/20 shadow-lg"
            style={{ top: `${top}px`, height: `${height}px` }}
        >
            <div className="flex flex-col items-center gap-1">
                <span className="text-[9px] font-black text-white bg-brand-primary px-3 py-1 rounded-full shadow-sm uppercase tracking-[0.1em]">
                    New Slot: {formatTime24(start)}
                </span>
                {duration >= 15 && (
                    <span className="text-[10px] font-black text-brand-primary drop-shadow-sm uppercase tracking-widest bg-white/40 px-2 py-0.5 rounded-lg border border-brand-primary/10">
                        {duration} MIN
                    </span>
                )}
            </div>
            
            {/* Visual Pulse for active creation */}
            <div className="absolute inset-x-0 top-0 h-1 bg-brand-primary animate-pulse" />
        </div>
    );
}
