import React, { useState, useEffect } from "react";
import { useCalendarStore } from "../store/calendar.store";
import CalendarInteractiveGrid from "./CalendarInteractiveGrid";
import SelectionOverlay from "./SelectionOverlay";
import AppointmentCard from "./AppointmentCard";
import { formatTime24, snapToGrid } from "../utils/calendarUtils";

const SLOT_HEIGHT = 52;

/**
 * CalendarView.jsx — Upgraded Scheduling Engine (v13.2)
 *
 * Capabilities:
 * 1. Interactive Grid (Drag Selection)
 * 2. Practitioner Parallel Columns
 * 3. Real-time Now Indicator
 * 4. Animated Interactions (Framer Motion)
 * 5. Branch/Doctor Filtering
 */
export default function CalendarView({
    data,
    onAppointmentClick,
    onSelectionComplete,
    onMoveAppointment,
    onResizeAppointment
}) {
    const [currentTime, setCurrentTime] = useState(new Date());

    // Sync now indicator every minute
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    if (!data) return null;

    const { slotDuration, workingHours, branches, appointments, practitioners } = data;
    const workStart = parseTime(workingHours.start);
    const workEnd = parseTime(workingHours.end);
    const totalSlots = (workEnd - workStart) / slotDuration;

    // Time labels for left axis
    const timeLabels = [];
    for (let i = 0; i <= totalSlots; i++) {
        timeLabels.push(formatTime(workStart + i * slotDuration));
    }

    // Determine the columns to show (Practitioners or Chairs)
    // For Phase 13.2, we prioritize Practitioner parallel columns in Day View
    const columns = practitioners || [];

    // Group appointments by practitionerId
    const groupedByDoc = {};
    for (const doc of columns) groupedByDoc[doc._id] = [];
    for (const appt of appointments) {
        const docId = appt.dentistId?._id || appt.dentistId;
        if (groupedByDoc[docId]) {
            groupedByDoc[docId].push(appt);
        }
    }

    return (
        <div className="flex flex-col h-full bg-surface rounded-[2.4rem] overflow-hidden">
            {/* Calendar Grid Header — Clinical Curator Polish */}
            <div className="flex sticky top-0 bg-surface-lowest/90 backdrop-blur-xl z-30 shadow-sm border-b border-black/[0.02]">
                <div className="w-24 shrink-0 flex items-center justify-center bg-surface-low/30">
                    <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] opacity-40">Timeline</span>
                </div>
                {columns.map((doc) => (
                    <div key={doc._id} className="flex-1 min-w-[240px] py-6 px-8 flex items-center justify-start gap-4 hover:bg-surface-low/30 transition-colors duration-300">
                        <div className="w-12 h-12 rounded-[1.25rem] bg-surface-low p-0.5 shadow-sm border border-black/[0.03]">
                            <div className="w-full h-full rounded-[1.1rem] overflow-hidden bg-brand-primary/5 flex items-center justify-center">
                                {doc.avatarUrl ? <img src={doc.avatarUrl} alt={doc.name} className="w-full h-full object-cover" /> : <span className="text-sm font-bold text-brand-primary uppercase">{doc.name[0]}</span>}
                            </div>
                        </div>
                        <div className="text-left">
                            <h3 className="text-base font-bold tracking-tight text-text-primary font-manrope">Dr. {doc.name}</h3>
                            <p className="text-[10px] font-bold text-text-secondary mt-1 uppercase tracking-wider opacity-60 italic">{doc.specialty || "Chief Practitioner"}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Scrollable Area — Tonal Depth */}
            <div className="flex-1 overflow-y-auto relative no-scrollbar bg-surface-low/10">
                <div className="flex min-w-max h-full">
                    {/* Time Axis */}
                    <div className="w-24 shrink-0 bg-surface-low/40">
                        {timeLabels.map((label, i) => (
                            <div
                                key={label}
                                className="text-[11px] text-text-secondary font-black pr-6 text-right flex items-start justify-end opacity-40 hover:opacity-100 transition-opacity"
                                style={{
                                    height: i < timeLabels.length - 1 ? `${SLOT_HEIGHT}px` : "auto",
                                    paddingTop: "4px",
                                }}
                            >
                                {label}
                            </div>
                        ))}
                    </div>

                    {/* Columns — Alternating Tones for Visual Separation without Lines */}
                    {columns.map((doc, idx) => {
                        const docAppts = groupedByDoc[doc._id] || [];
                        
                        return (
                            <div key={doc._id} className={`flex-1 min-w-[240px] relative ${idx % 2 === 1 ? "bg-surface-low/10" : "bg-transparent"}`}>
                                <CalendarInteractiveGrid
                                    date={data.date || new Date()}
                                    workStart={workStart}
                                    slotDuration={slotDuration}
                                    slotHeight={SLOT_HEIGHT}
                                    branchId={data.branchId}
                                    chairId={null} 
                                    practitionerId={doc._id}
                                    onSelectionComplete={onSelectionComplete}
                                >
                                    {/* Ghost Grid Visual Markers (Subtle shifts, not lines) */}
                                    {Array.from({ length: totalSlots }).map((_, i) => (
                                        <div
                                            key={i}
                                            className={`absolute left-0 right-0 ${i % 4 === 3 ? "bg-black/[0.015]" : "transparent"}`}
                                            style={{
                                                top: `${i * SLOT_HEIGHT}px`,
                                                height: `${SLOT_HEIGHT}px`,
                                            }}
                                        />
                                    ))}

                                    {/* Real-time Indicator */}
                                    {isToday(data.date) && (
                                        <NowIndicator
                                            currentTime={currentTime}
                                            workStart={workStart}
                                            slotDuration={slotDuration}
                                            slotHeight={SLOT_HEIGHT}
                                        />
                                    )}

                                    {/* Selection Overlay */}
                                    <SelectionOverlay
                                        workStart={workStart}
                                        slotDuration={slotDuration}
                                        slotHeight={SLOT_HEIGHT}
                                        activePractitionerId={doc._id}
                                    />

                                    {/* Appointment Cards */}
                                    {docAppts.map((appt) => (
                                        <AppointmentCard
                                            key={appt._id}
                                            appointment={appt}
                                            slotDuration={slotDuration}
                                            workStart={workStart}
                                            slotHeight={SLOT_HEIGHT}
                                            onClick={onAppointmentClick}
                                            onMove={onMoveAppointment}
                                            onResize={onResizeAppointment}
                                        />
                                    ))}
                                </CalendarInteractiveGrid>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function NowIndicator({ currentTime, workStart, slotDuration, slotHeight }) {
    const nowMins = currentTime.getHours() * 60 + currentTime.getMinutes();
    if (nowMins < workStart) return null;

    const top = ((nowMins - workStart) / slotDuration) * slotHeight;

    return (
        <div 
            className="absolute left-0 right-0 z-40 pointer-events-none group/now h-0"
            style={{ top: `${top}px` }}
        >
            <div className="h-[2px] bg-danger relative flex items-center">
                <div className="absolute -left-1 w-2.5 h-2.5 rounded-full bg-danger border-2 border-surface-lowest shadow-highlight animate-pulse" />
                <div className="absolute left-4 bg-danger text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-lg opacity-0 group-hover/now:opacity-100 transition-opacity duration-300 uppercase tracking-widest">
                    Live: {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
                {/* Horizontal Glow */}
                <div className="absolute inset-0 bg-gradient-to-r from-danger/20 to-transparent h-4 -top-2 blur-md" />
            </div>
        </div>
    );
}

const parseTime = (str) => {
    const [h, m] = str.split(":").map(Number);
    return h * 60 + m;
};

const formatTime = (mins) => {
    const h = String(Math.floor(mins / 60)).padStart(2, "0");
    const m = String(mins % 60).padStart(2, "0");
    return `${h}:${m}`;
};

const isToday = (date) => {
    const d = new Date(date);
    const today = new Date();
    return d.toDateString() === today.toDateString();
};
