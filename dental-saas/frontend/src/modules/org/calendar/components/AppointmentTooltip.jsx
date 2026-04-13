/**
 * AppointmentTooltip.jsx — Rich hover preview
 * Phase 13.2 — Advanced Calendar UX
 *
 * Zero-dependency tooltip — no @radix-ui required.
 * Uses CSS pointer-events and a floating div anchored to the hovered element.
 *
 * USAGE:
 *   <AppointmentTooltip appointment={apt} children={<div>trigger</div>} />
 *
 * ARCHITECTURE:
 *   - Renders a fixed-position tooltip that avoids viewport edge clipping
 *   - Delays show by 400ms to avoid flicker on fast mouse movement
 *   - Reads all data from the appointment DTO — never fetches from server
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { getStatusStyle } from "../constants/appointmentStatus.ui";
import { formatTime24, formatDateLabel, formatDuration, durationMins } from "../utils/calendarUtils";

// ── Tooltip card ──────────────────────────────────────────────────────────────
function TooltipCard({ appointment, position }) {
    const s    = getStatusStyle(appointment.status);
    const apt  = appointment;

    const patientName =
        apt.patient?.nameEnglish ||
        apt.patientName ||
        `${apt.patient?.firstName || ""} ${apt.patient?.lastName || ""}`.trim() ||
        "—";

    const doctorName =
        apt.dentist?.name ||
        apt.dentistName ||
        apt.dentistId?.name ||
        "—";

    const start = apt.startTime ? formatTime24(apt.startTime) : "—";
    const end   = apt.endTime   ? formatTime24(apt.endTime)   : "—";
    const date  = apt.startTime ? formatDateLabel(apt.startTime) : "";
    const dur   = (apt.startTime && apt.endTime)
        ? formatDuration(durationMins(new Date(apt.startTime), new Date(apt.endTime)))
        : "—";

    const chairName = apt.chair?.name || apt.chairId?.name || "—";

    return (
        <div
            className="fixed z-[9999] pointer-events-none select-none"
            style={{
                left: position.x + 14,
                top:  position.y - 8,
                filter: "drop-shadow(0 8px 24px rgba(0,0,0,.15))",
            }}
        >
            {/* Arrow */}
            <div
                className="absolute left-0 top-3 -translate-x-full w-0 h-0"
                style={{
                    borderTop:    "6px solid transparent",
                    borderBottom: "6px solid transparent",
                    borderRight:  "6px solid white",
                }}
            />

            {/* Card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl w-64 overflow-hidden">
                {/* Status bar */}
                <div
                    className="h-1.5 w-full"
                    style={{ background: s.hex?.border || "#64B5F6" }}
                />

                <div className="p-4">
                    {/* Patient name */}
                    <h4 className="font-bold text-gray-900 text-sm mb-0.5 leading-tight">
                        {patientName}
                    </h4>

                    {/* Date + time */}
                    <p className="text-xs text-gray-500 mb-3">
                        {date} · {start} – {end}
                        <span className="ml-1 text-gray-400">({dur})</span>
                    </p>

                    <div className="space-y-1.5">
                        {/* Status badge */}
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] text-gray-400 font-medium">Status</span>
                            <span
                                className={`inline-flex items-center gap-1 text-[11px] font-semibold
                                    px-2 py-0.5 rounded-full border ${s.bg} ${s.text} ${s.border}`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                                {s.label}
                            </span>
                        </div>

                        {/* Doctor */}
                        {doctorName !== "—" && (
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] text-gray-400 font-medium">Doctor</span>
                                <span className="text-[11px] text-gray-700 font-medium">
                                    Dr. {doctorName}
                                </span>
                            </div>
                        )}

                        {/* Chair */}
                        {chairName !== "—" && (
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] text-gray-400 font-medium">Chair</span>
                                <span className="text-[11px] text-gray-700">{chairName}</span>
                            </div>
                        )}

                        {/* Notes snippet */}
                        {apt.notes && (
                            <p className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100
                                line-clamp-2 italic">
                                {apt.notes}
                            </p>
                        )}
                    </div>

                    {/* Footer hint */}
                    <p className="text-[10px] text-gray-300 mt-3 text-center">
                        Right-click for quick actions
                    </p>
                </div>
            </div>
        </div>
    );
}

// ── Tooltip wrapper ───────────────────────────────────────────────────────────
/**
 * Wraps children in a hover-triggered tooltip.
 * @param {{ appointment: object, children: ReactNode }} props
 */
export default function AppointmentTooltip({ appointment, children }) {
    const [visible, setVisible] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const timerRef  = useRef(null);
    const activeRef = useRef(false);

    const show = useCallback((e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = rect.right;
        // Clamp to viewport bottom
        const tooltipH = 220;
        const y = Math.min(e.clientY, window.innerHeight - tooltipH - 20);

        activeRef.current = true;
        timerRef.current = setTimeout(() => {
            if (activeRef.current) {
                setPosition({ x, y });
                setVisible(true);
            }
        }, 380);
    }, []);

    const hide = useCallback(() => {
        activeRef.current = false;
        clearTimeout(timerRef.current);
        setVisible(false);
    }, []);

    const move = useCallback((e) => {
        if (!visible) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const tooltipH = 220;
        setPosition({
            x: rect.right,
            y: Math.min(e.clientY, window.innerHeight - tooltipH - 20),
        });
    }, [visible]);

    // Cleanup on unmount
    useEffect(() => () => clearTimeout(timerRef.current), []);

    return (
        <div
            className="h-full"
            onMouseEnter={show}
            onMouseLeave={hide}
            onMouseMove={move}
        >
            {children}
            {visible && appointment && (
                <TooltipCard appointment={appointment} position={position} />
            )}
        </div>
    );
}
