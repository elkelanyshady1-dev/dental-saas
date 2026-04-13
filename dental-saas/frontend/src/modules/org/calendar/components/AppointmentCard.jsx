import React, { useState } from "react";
import { motion, useDragControls } from "framer-motion";
import { useCalendarStore } from "../store/calendar.store";
import { getStatusStyle } from "../constants/appointmentStatus.ui";
import { getLane, LANE_PRIORITY } from "../constants/appointmentStatus.constants";
import { formatTime24, durationMins, snapToGrid } from "../utils/calendarUtils";

/**
 * AppointmentCard.jsx — Interactive Scheduling Engine
 * v13.2 Feature Set:
 * 1. Drag & Move (Framer Motion)
 * 2. Resize Handle (Bottom)
 * 3. Priority Lane Visuals
 * 4. Rich Tooltips (Hover)
 * 5. Context Menu (Right Click)
 */
export default function AppointmentCard({
    appointment,
    slotDuration,
    workStart,
    slotHeight = 52,
    onMove,
    onResize,
    onClick,
    onContextMenu
}) {
    const [isHovered, setIsHovered] = useState(false);
    const dragControls = useDragControls();

    const startDate = new Date(appointment.startTime);
    const endDate   = new Date(appointment.endTime);

    const startMins = startDate.getHours() * 60 + startDate.getMinutes();
    const endMins   = endDate.getHours()   * 60 + endDate.getMinutes();
    const duration  = durationMins(startDate, endDate);

    const top    = ((startMins - workStart) / slotDuration) * slotHeight;
    const height = Math.max((duration / slotDuration) * slotHeight - 2, 28);

    const s = getStatusStyle(appointment.status);
    const lane = getLane(appointment.status);
    const isUrgent = lane === "urgent";

    // ── Patient Name DTO Resolution ─────────────────────────────────────────
    // Reads from projection DTO shape: appointment.patient (nested) or appointment.patientName (flat)
    // Projection returns: { patient: { nameEnglish, nameArabic, firstName, lastName }, patientName: string }
    const patientName = 
        appointment.patient?.nameEnglish ||
        `${appointment.patient?.firstName || ""} ${appointment.patient?.lastName || ""}`.trim() ||
        appointment.patient?.nameArabic ||
        appointment.patientName || // flat field from buildCalendarView legacy
        "Unknown Patient";

    // ── DRAG CALCULATION ────────────────────────────────

    const handleDragEnd = (_, info) => {
        // Calculate new time based on offset
        const yOffset = info.offset.y;
        const minutesDelta = Math.round(yOffset / slotHeight) * slotDuration;
        
        const newStart = new Date(startDate.getTime() + minutesDelta * 60000);
        const newEnd   = new Date(endDate.getTime() + minutesDelta * 60000);
        
        onMove?.(appointment._id, {
            startTime: snapToGrid(newStart, 15),
            endTime: snapToGrid(newEnd, 15),
            duration
        });
    };

    // ── RESIZE CALCULATION ───────────────────────────────
    // This is handled via a simple drag-handle at the bottom
    const handleResizeEnd = (e, info) => {
        e.stopPropagation();
        const yOffset = info.offset.y;
        const minutesDelta = Math.round(yOffset / slotHeight) * slotDuration;
        
        const newEnd = new Date(endDate.getTime() + minutesDelta * 60000);
        const newDuration = durationMins(startDate, newEnd);
        
        if (newDuration >= 15) {
            onResize?.(appointment._id, {
                endTime: snapToGrid(newEnd, 15),
                duration: newDuration
            });
        }
    };

    return (
        <motion.div
            layoutId={appointment._id}
            initial={false}
            animate={{ top, height }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: -top, bottom: 4000 }} 
            onDragEnd={handleDragEnd}
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
            onContextMenu={(e) => {
                e.preventDefault();
                onContextMenu?.(e, appointment);
            }}
            onClick={(e) => {
                e.stopPropagation();
                onClick?.(appointment);
            }}
            className={`absolute left-2 right-2 rounded-2xl overflow-hidden cursor-pointer
                transition-all duration-300 z-10 group
                ${s.bg} border border-black/[0.03] backdrop-blur-md shadow-sm
                ${isUrgent ? "ring-2 ring-danger animate-pulse" : ""}
                ${isHovered ? "shadow-ambient z-30 scale-[1.015]" : "hover:shadow-md"}`}
        >
            {/* DRAG HANDLE — Tactical Zone */}
            <div 
                className="absolute inset-x-0 top-0 h-10 cursor-grab active:cursor-grabbing z-20"
                onPointerDown={(e) => dragControls.start(e)}
            />

            {/* Left Status Accent — Subtle Tonal Layer */}
            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${s.accent} opacity-80`} />

            <div className="px-4 py-3 flex flex-col h-full pointer-events-none select-none relative z-10">
                <div className="flex justify-between items-start min-w-0">
                    <p className={`text-[11px] font-bold truncate tracking-tight text-text-primary uppercase`}>
                        {patientName}
                    </p>
                    <div className="flex items-center gap-1.5">
                        {isUrgent && <span className="text-[10px] filter grayscale group-hover:grayscale-0 transition-all duration-300">🚨</span>}
                        {appointment.status === "completed" && <span className="text-[10px]">✅</span>}
                    </div>
                </div>
                
                {height > 40 && (
                    <div className="flex items-center gap-2 mt-1.5 opacity-60">
                        <span className="text-[9px] font-black text-text-secondary uppercase tracking-widest">{formatTime24(startDate)}</span>
                        <div className="w-1 h-1 rounded-full bg-text-disabled" />
                        <span className="text-[9px] font-bold text-text-secondary">{duration}m</span>
                    </div>
                )}

                {height > 70 && appointment.type && (
                    <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                        <span className="px-2 py-1 rounded-lg bg-white/20 text-[8px] font-black uppercase tracking-[0.1em] text-text-primary border border-white/30 backdrop-blur-sm">
                            {appointment.type}
                        </span>
                        {appointment.chairId && (
                            <span className="text-[8px] font-bold text-brand-primary uppercase opacity-60">Unit {appointment.chairId.slice(-1)}</span>
                        )}
                    </div>
                )}
            </div>

            {/* RESIZE HANDLE — No-Line Visual Polish */}
            <motion.div 
                drag="y"
                dragMomentum={false}
                onDragEnd={handleResizeEnd}
                className="absolute inset-x-0 bottom-0 h-3 cursor-ns-resize hover:bg-black/[0.05] flex items-center justify-center p-0.5 z-40 transition-colors"
            >
                <div className="w-6 h-1 bg-black/10 rounded-full group-hover:bg-black/20 transition-colors" />
            </motion.div>

            {/* Quick Status Ripple Effect on Hover */}
            {isHovered && (
                <div className="absolute inset-0 bg-white/5 pointer-events-none" />
            )}
        </motion.div>
    );
}
