/**
 * DnDCalendarView.jsx — Google Calendar–Level UX
 * Phase 13.2 — Advanced Calendar UX (Pro Level)
 *
 * FEATURES:
 *   ✅ Multi-day drag & resize (cross-day scheduling)
 *   ✅ 15-minute snap grid (step=15, timeslots=1)
 *   ✅ Smooth framer-motion animations on every event
 *   ✅ Rich hover tooltip (patient, doctor, duration, status)
 *   ✅ Right-click context menu (FSM-aware quick actions)
 *   ✅ Optimistic status updates with rollback
 *   ✅ Optimistic reschedule/resize with conflict overlay
 *   ✅ Color-coded events + priority lane sort
 *   ✅ Real-time sync via Phase 13 socket invalidation
 *
 * ARCHITECTURE COMPLIANCE:
 *   ✅ useMutation onMutate/onError/onSettled at top level (Rules of Hooks)
 *   ✅ No setState from socket events — React Query invalidation only
 *   ✅ authorize() enforced in every backend controller
 *   ✅ All status strings normalized via calendarUtils.toBackendStatus()
 *
 * DEPENDENCIES: react-big-calendar (already in package.json)
 *               framer-motion (already in package.json)
 */

import { useState, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QK } from "@/lib/query";
import { appointmentsApi } from "../api/appointments.api";
import { getStatusStyle, rbcEventStyle, LANE_UI } from "../constants/appointmentStatus.ui";
import { getLane, sortByLanePriority } from "../constants/appointmentStatus.constants";
import {
    snapTo15,
    durationMins,
    formatTime24,
    formatDateLabel,
    formatDuration,
} from "../utils/calendarUtils";
import AppointmentTooltip  from "./AppointmentTooltip";
import AppointmentContextMenu from "./AppointmentContextMenu";
import toast from "react-hot-toast";

// ── Install prompt ────────────────────────────────────────────────────────────
function InstallPrompt() {
    return (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">📦</span>
            </div>
            <p className="font-semibold text-amber-800 mb-1">Package Required</p>
            <p className="text-sm text-amber-700 mb-4">
                The schedule view requires{" "}
                <code className="bg-amber-100 px-1 rounded font-mono">react-big-calendar</code>
            </p>
            <code className="block bg-amber-900/10 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-900 font-mono text-left">
                npm install react-big-calendar
            </code>
        </div>
    );
}

// ── Conflict overlay ──────────────────────────────────────────────────────────
function ConflictToast({ conflict, onForce, onClose }) {
    return (
        <motion.div
            className="bg-white border border-amber-200 rounded-xl shadow-xl p-4 w-80 text-sm"
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0,   scale: 1 }}
            exit={{    opacity: 0, y: -8,   scale: 0.96 }}
            transition={{ duration: 0.2 }}
        >
            <div className="flex items-start gap-3">
                <span className="text-xl shrink-0">⚠️</span>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800">
                        {conflict.message || "Scheduling conflict detected"}
                    </p>
                    {conflict.conflicts?.dentist && (
                        <p className="text-xs text-gray-500 mt-1">• Doctor is booked at this time</p>
                    )}
                    {conflict.conflicts?.chair && (
                        <p className="text-xs text-gray-500 mt-0.5">• Chair is occupied</p>
                    )}
                    <div className="flex gap-2 mt-3">
                        <button
                            onClick={onForce}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold
                                bg-amber-500 text-white hover:bg-amber-600 active:scale-95 transition-all"
                        >
                            Force Move
                        </button>
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold
                                bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95 transition-all"
                        >
                            Undo
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

// ── Animated event card (framer-motion) ──────────────────────────────────────
function AnimatedEventCard({ event }) {
    const s        = getStatusStyle(event.status);
    const lane     = getLane(event.status);
    const isUrgent = lane === "urgent";
    const isActive = lane === "active";

    return (
        <AppointmentTooltip appointment={event._raw || event}>
            <motion.div
                className="h-full overflow-hidden flex flex-col px-1.5 py-1 gap-0.5 rounded-md"
                style={{ borderLeft: `3px solid ${s.hex?.border || "#64B5F6"}` }}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1    }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                whileHover={{ scale: 1.02 }}
            >
                {/* Patient name row */}
                <div className="flex items-center gap-1 min-w-0">
                    {(isUrgent || isActive) && (
                        <span className="text-[9px] shrink-0 leading-none">
                            {isUrgent ? "🔴" : "🟠"}
                        </span>
                    )}
                    <span
                        className="text-[11px] font-bold truncate leading-tight"
                        style={{ color: s.hex?.text || "#1565C0" }}
                    >
                        {event.patientName}
                    </span>
                </div>

                {/* Doctor row */}
                {event.dentistName && event.dentistName !== "—" && (
                    <span
                        className="text-[10px] truncate leading-tight opacity-70"
                        style={{ color: s.hex?.text || "#1565C0" }}
                    >
                        {event.dentistName}
                    </span>
                )}

                {/* Saving indicator */}
                {event._optimistic && (
                    <span className="text-[9px] opacity-50 italic text-gray-500">saving…</span>
                )}
            </motion.div>
        </AppointmentTooltip>
    );
}

// ── Optimistic cache patcher ──────────────────────────────────────────────────
function applyOptimisticReschedule(queryClient, eventId, start, end) {
    const prevData = queryClient.getQueryData(QK.appointments.all);
    queryClient.setQueryData(QK.appointments.all, (old) => {
        if (!old?.appointments) return old;
        return {
            ...old,
            appointments: old.appointments.map((a) =>
                a._id === eventId
                    ? { ...a, startTime: start.toISOString(), endTime: end.toISOString(), _optimistic: true }
                    : a
            ),
        };
    });
    return prevData;
}

// ── Main Component ────────────────────────────────────────────────────────────
/**
 * @param {object}   props
 * @param {object}   props.data                — calendarData from useCalendarDay
 * @param {string}   props.date                — selected date YYYY-MM-DD
 * @param {Function} [props.onAppointmentClick] — opens EditDrawer
 */
export default function DnDCalendarView({ data, date, onAppointmentClick }) {
    const queryClient = useQueryClient();

    // ── State ─────────────────────────────────────────────────────────────────
    const [pendingConflict,  setPendingConflict]  = useState(null);
    const [contextMenu,      setContextMenu]      = useState(null);
    const [CalendarComps,    setCalendarComps]    = useState(null);
    const [loadError,        setLoadError]        = useState(false);

    // ── Lazy load react-big-calendar ─────────────────────────────────────────
    useMemo(() => {
        if (CalendarComps || loadError) return;

        Promise.all([
            import("react-big-calendar").catch(() => null),
            import("react-big-calendar/lib/addons/dragAndDrop").catch(() => null),
            import("react-big-calendar/lib/css/react-big-calendar.css").catch(() => null),
            import("react-big-calendar/lib/addons/dragAndDrop/styles.css").catch(() => null),
            import("date-fns").catch(() => null),
            import("date-fns/locale/en-US").catch(() => null),
        ]).then(([rbc, dndAddon, , , dateFns, enUS]) => {
            if (!rbc || !dndAddon || !dateFns) { setLoadError(true); return; }

            const { Calendar, dateFnsLocalizer } = rbc;
            const withDnD  = dndAddon.default || dndAddon;
            const { format, parse, startOfWeek, getDay } = dateFns;
            const locale   = enUS?.enUS || enUS?.default || enUS;

            const localizer = dateFnsLocalizer({
                format, parse, startOfWeek, getDay,
                locales: { "en-US": locale },
            });

            setCalendarComps({ DnDCal: withDnD(Calendar), localizer });
        }).catch(() => setLoadError(true));
    }, [CalendarComps, loadError]);

    // ── Build sorted RBC events ───────────────────────────────────────────────
    const events = useMemo(() => {
        if (!data?.appointments) return [];

        return sortByLanePriority(data.appointments).map((apt) => {
            const patientName =
                apt.patient?.nameEnglish ||
                `${apt.patient?.firstName || ""} ${apt.patient?.lastName || ""}`.trim() ||
                "Patient";

            return {
                id:          apt._id,
                title:       patientName,
                patientName,
                dentistName: apt.dentist?.name || apt.dentistId?.name || "—",
                start:       new Date(apt.startTime),
                end:         new Date(apt.endTime),
                status:      apt.status,
                branchId:    apt.branchId,
                chairId:     apt.chairId,
                dentistId:   apt.dentistId,
                _raw:        apt,
                _optimistic: !!apt._optimistic,
            };
        });
    }, [data]);

    // ── Reschedule mutation configs ───────────────────────────────────────────
    const makeMoveConfig = (force) => ({
        mutationFn: ({ eventId, start, end }) =>
            appointmentsApi.update(eventId, {
                startTime: start.toISOString(),
                endTime:   end.toISOString(),
                duration:  durationMins(start, end),
                force,
            }),

        onMutate: async ({ eventId, start, end }) => {
            await queryClient.cancelQueries({ queryKey: QK.appointments.all });
            const prevData = applyOptimisticReschedule(queryClient, eventId, start, end);
            return { prevData };
        },

        onError: (err, vars, ctx) => {
            const serverData = err?.response?.data;
            if (serverData?.warning && !force) {
                setPendingConflict({
                    ...serverData,
                    eventId: vars.eventId,
                    start:   vars.start,
                    end:     vars.end,
                    prevData: ctx?.prevData,
                });
            } else {
                if (ctx?.prevData) queryClient.setQueryData(QK.appointments.all, ctx.prevData);
                toast.error(serverData?.message || "Failed to update appointment");
            }
        },

        onSettled: (_data, err) => {
            if (!err?.response?.data?.warning) {
                queryClient.invalidateQueries({ queryKey: QK.appointments.all });
                if (!err) toast.success(force ? "Appointment force-moved" : "Appointment updated");
            }
        },
    });

    // ✅ Rules of Hooks: unconditional top-level calls
    const moveMutation  = useMutation(makeMoveConfig(false));
    const forceMutation = useMutation(makeMoveConfig(true));

    // ── Handlers: drag ────────────────────────────────────────────────────────
    const handleEventDrop = useCallback(({ event, start: rawStart, end: rawEnd, isAllDay }) => {
        if (isAllDay) return;

        // Snap to 15-min grid
        const start = snapTo15(rawStart);
        const end   = snapTo15(rawEnd);

        if (end <= start) { toast.error("Invalid time range"); return; }
        moveMutation.mutate({ eventId: event.id, start, end });
    }, [moveMutation]);

    // ── Handlers: resize ─────────────────────────────────────────────────────
    const handleEventResize = useCallback(({ event, start: rawStart, end: rawEnd }) => {
        const start = snapTo15(rawStart);
        const end   = snapTo15(rawEnd);

        if (end <= start) { toast.error("Duration cannot be zero or negative"); return; }
        const dur = durationMins(start, end);
        if (dur > 1440)  { toast.error("Appointment cannot exceed 24 hours"); return; }

        moveMutation.mutate({ eventId: event.id, start, end });
    }, [moveMutation]);

    // ── Handlers: force move ──────────────────────────────────────────────────
    const handleForceMove = useCallback(() => {
        if (!pendingConflict) return;
        const { eventId, start, end } = pendingConflict;
        setPendingConflict(null);
        forceMutation.mutate({ eventId, start, end });
    }, [pendingConflict, forceMutation]);

    const handleConflictUndo = useCallback(() => {
        if (!pendingConflict?.prevData) return;
        queryClient.setQueryData(QK.appointments.all, pendingConflict.prevData);
        setPendingConflict(null);
        toast("Move cancelled", { icon: "↩️" });
    }, [pendingConflict, queryClient]);

    // ── Handlers: right-click ─────────────────────────────────────────────────
    const handleContextMenu = useCallback((event, domEvent) => {
        domEvent.preventDefault();
        domEvent.stopPropagation();
        setContextMenu({ x: domEvent.clientX, y: domEvent.clientY, event });
    }, []);

    // ── Style getters ─────────────────────────────────────────────────────────
    const eventPropGetter = useCallback((event) => rbcEventStyle(event), []);

    const slotDuration = data?.workingHours?.slotDuration || 15;
    const workStart    = data?.workingHours?.start || "08:00";
    const workEnd      = data?.workingHours?.end   || "20:00";
    const minTime      = useMemo(() => new Date(`${date}T${workStart}:00`), [date, workStart]);
    const maxTime      = useMemo(() => new Date(`${date}T${workEnd}:00`),   [date, workEnd]);

    const slotPropGetter = useCallback((slotDate) => {
        const hour = slotDate.getHours();
        const wS   = parseInt(workStart.split(":")[0], 10);
        const wE   = parseInt(workEnd.split(":")[0],   10);
        if (hour < wS || hour >= wE) return { style: { background: "#f9fafb" } };
        return {};
    }, [workStart, workEnd]);

    // ── Event wrapper — injects right-click ──────────────────────────────────
    // Built via useCallback to maintain stable ref (avoids re-registering handlers)
    const EventWrapper = useCallback(
        ({ event, children }) => (
            <div
                className="h-full"
                onContextMenu={(e) => handleContextMenu(event, e)}
            >
                {children}
            </div>
        ),
        [handleContextMenu]
    );

    // ── Loading states ────────────────────────────────────────────────────────
    if (loadError) return <InstallPrompt />;

    if (!CalendarComps) {
        return (
            <div
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden
                    flex items-center justify-center"
                style={{ minHeight: 400 }}
            >
                <div className="text-center">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent
                        rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-gray-500">Loading schedule view…</p>
                </div>
            </div>
        );
    }

    const { DnDCal, localizer } = CalendarComps;

    return (
        <>
            {/* Context menu — renders outside the calendar container to avoid z-index issues */}
            <AppointmentContextMenu
                contextMenu={contextMenu}
                onClose={() => setContextMenu(null)}
                onEdit={onAppointmentClick}
            />

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden relative">
                {/* Conflict overlay */}
                <AnimatePresence>
                    {pendingConflict && (
                        <div className="absolute top-4 right-4 z-50">
                            <ConflictToast
                                conflict={pendingConflict}
                                onForce={handleForceMove}
                                onClose={handleConflictUndo}
                            />
                        </div>
                    )}
                </AnimatePresence>

                <DnDCal
                    localizer={localizer}
                    events={events}
                    defaultView="day"
                    views={["day", "week"]}
                    date={new Date(`${date}T12:00:00`)}
                    onNavigate={() => {}}
                    min={minTime}
                    max={maxTime}

                    /* ── 15-min snap grid ── */
                    step={15}
                    timeslots={1}

                    style={{ height: "calc(100vh - 220px)", minHeight: 500 }}

                    /* ── Drag & Drop ── */
                    onEventDrop={handleEventDrop}
                    draggableAccessor={() => true}

                    /* ── Resize (drag bottom edge) ── */
                    resizable
                    onEventResize={handleEventResize}

                    /* ── Style ── */
                    eventPropGetter={eventPropGetter}
                    slotPropGetter={slotPropGetter}

                    /* ── Interaction ── */
                    selectable={false}
                    popup

                    /* ── Click → Edit ── */
                    onSelectEvent={(event) => onAppointmentClick?.(event._raw)}

                    /* ── Custom components ── */
                    components={{
                        event:        AnimatedEventCard,
                        eventWrapper: EventWrapper,
                    }}

                    /* ── Formatting ── */
                    formats={{
                        timeGutterFormat: "HH:mm",
                        eventTimeRangeFormat: ({ start, end }, culture, loc) =>
                            `${loc.format(start, "HH:mm", culture)} – ${loc.format(end, "HH:mm", culture)}`,
                    }}
                />

                {/* RBC style overrides */}
                <style>{`
                    .rbc-calendar  { font-family: inherit; }
                    .rbc-toolbar   { display: none; }
                    .rbc-header    { font-size: 12px; font-weight: 600; color: #6b7280; padding: 8px 0; }

                    /* Grid lines */
                    .rbc-time-slot        { border-color: #f3f4f6 !important; }
                    .rbc-timeslot-group   { border-color: #e5e7eb !important; min-height: 40px; }

                    /* Events */
                    .rbc-event, .rbc-background-event {
                        padding: 0 !important;
                        border-radius: 6px !important;
                        overflow: hidden;
                        cursor: grab !important;
                        transition: box-shadow .15s ease;
                    }
                    .rbc-event:hover { box-shadow: 0 4px 12px rgba(0,0,0,.12); }
                    .rbc-event:focus { outline: 2px solid #3b82f6; }
                    .rbc-event:active { cursor: grabbing !important; }

                    /* Now indicator */
                    .rbc-current-time-indicator { background: #ef4444; height: 2px; }
                    .rbc-current-time-indicator::before {
                        content: "";
                        position: absolute;
                        width: 8px; height: 8px;
                        background: #ef4444;
                        border-radius: 50%;
                        top: -3px; left: -1px;
                    }

                    /* DnD drag preview */
                    .rbc-addons-dnd-drag-preview {
                        opacity: 0.85;
                        transform: rotate(1.5deg) scale(1.01);
                        box-shadow: 0 8px 24px rgba(0,0,0,.2);
                    }

                    /* Resize handle — bottom strip */
                    .rbc-addons-dnd-resize-s-anchor {
                        height: 6px;
                        background: rgba(0,0,0,.08);
                        cursor: s-resize !important;
                        border-bottom-left-radius: 6px;
                        border-bottom-right-radius: 6px;
                        transition: background .15s;
                    }
                    .rbc-addons-dnd-resize-s-anchor:hover {
                        background: rgba(0,0,0,.18);
                    }

                    /* Week view columns */
                    .rbc-day-column { border-left: 1px solid #f3f4f6; }

                    /* Allotted time gutter */
                    .rbc-time-gutter .rbc-label  { font-size: 10px; color: #9ca3af; }

                    /* Selected slot */
                    .rbc-slot-selecting { background: rgba(59,130,246,.04); }
                `}</style>
            </div>
        </>
    );
}
