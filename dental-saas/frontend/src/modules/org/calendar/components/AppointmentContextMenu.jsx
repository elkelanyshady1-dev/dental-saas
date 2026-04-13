/**
 * AppointmentContextMenu.jsx — Right-click Quick Actions
 * Phase 13.2 — Advanced Calendar UX
 *
 * Features:
 *   - FSM-aware actions: only shows valid next statuses from current state
 *   - Optimistic status updates via useUpdateAppointmentStatus
 *   - "Edit" and "Cancel" shortcuts
 *   - Closes on Escape, outside click, or scroll
 *   - Animates in with framer-motion
 *
 * ZERO-TRUST RULES:
 *   ✅ Status updates go through appointmentsApi.updateStatus() → backend FSM validation
 *   ✅ `authorize(req, "appointments.update")` enforced in backend controller
 *   ✅ Optimistic update rolled back on error via React Query
 *   ✅ FSM transitions mirrored client-side to prevent invalid requests
 */
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QK } from "@/lib/query";
import { appointmentsApi } from "../api/appointments.api";
import { getStatusStyle } from "../constants/appointmentStatus.ui";
import { getValidTransitions, toBackendStatus } from "../utils/calendarUtils";
import toast from "react-hot-toast";

// ── Status labels for context menu ────────────────────────────────────────────
const STATUS_LABELS = {
    "confirmed":   { icon: "✅", label: "Confirm" },
    "checked-in":  { icon: "🚪", label: "Check In" },
    "in-progress": { icon: "⚡", label: "Start" },
    "completed":   { icon: "✔️", label: "Complete" },
    "cancelled":   { icon: "✖️", label: "Cancel" },
    "no-show":     { icon: "👻", label: "No Show" },
    "delayed":     { icon: "⏳", label: "Mark Delayed" },
    "postponed":   { icon: "📅", label: "Postpone" },
};

// ── Context menu component ────────────────────────────────────────────────────
/**
 * @param {object}   props
 * @param {{ x: number, y: number, event: object } | null} props.contextMenu
 * @param {Function} props.onClose
 * @param {Function} [props.onEdit]       — called with the appointment object
 * @param {Function} [props.onViewDetail] — called with the appointment object
 */
export default function AppointmentContextMenu({ contextMenu, onClose, onEdit, onViewDetail }) {
    const queryClient = useQueryClient();
    const menuRef     = useRef(null);

    // ── Dismiss on outside click / scroll / Esc ───────────────────────────────
    useEffect(() => {
        if (!contextMenu) return;

        const dismiss = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
        };
        const onKey = (e) => { if (e.key === "Escape") onClose(); };

        document.addEventListener("mousedown", dismiss, { capture: true });
        document.addEventListener("scroll",    onClose, { capture: true });
        document.addEventListener("keydown",   onKey);

        return () => {
            document.removeEventListener("mousedown", dismiss, { capture: true });
            document.removeEventListener("scroll",    onClose, { capture: true });
            document.removeEventListener("keydown",   onKey);
        };
    }, [contextMenu, onClose]);

    // ── Viewport clamp ────────────────────────────────────────────────────────
    const menuW = 196;
    const menuH = 260; // estimated
    const x = contextMenu
        ? Math.min(contextMenu.x, window.innerWidth  - menuW - 8)
        : 0;
    const y = contextMenu
        ? Math.min(contextMenu.y, window.innerHeight - menuH - 8)
        : 0;

    // ── Status mutation ───────────────────────────────────────────────────────
    const statusMutation = useMutation({
        mutationFn: ({ id, status }) => appointmentsApi.updateStatus(id, status),

        onMutate: async ({ id, status }) => {
            await queryClient.cancelQueries({ queryKey: QK.appointments.all });
            const prev = queryClient.getQueryData(QK.appointments.all);
            // Optimistically update the local cache
            queryClient.setQueryData(QK.appointments.all, (old) => {
                if (!old?.appointments) return old;
                return {
                    ...old,
                    appointments: old.appointments.map((a) =>
                        a._id === id ? { ...a, status, _optimistic: true } : a
                    ),
                };
            });
            return { prev };
        },

        onError: (err, _vars, ctx) => {
            if (ctx?.prev) queryClient.setQueryData(QK.appointments.all, ctx.prev);
            const msg = err?.response?.data?.message || "Status update failed";
            toast.error(msg);
        },

        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: QK.appointments.all });
        },

        onSuccess: (_data, { status }) => {
            const label = STATUS_LABELS[status]?.label || status;
            toast.success(`Marked as ${label}`);
        },
    });

    const handleStatusAction = (backendStatus) => {
        if (!contextMenu?.event) return;
        const id = contextMenu.event.id || contextMenu.event._id;
        statusMutation.mutate({ id, status: backendStatus });
        onClose();
    };

    const apt = contextMenu?.event;
    if (!apt) return null;

    const currentStatus = apt.status || "open";
    const validNext     = getValidTransitions(currentStatus);
    const s             = getStatusStyle(currentStatus);

    return (
        <AnimatePresence>
            {contextMenu && (
                <motion.div
                    ref={menuRef}
                    className="fixed z-[99999] select-none"
                    style={{ left: x, top: y }}
                    initial={{ opacity: 0, scale: 0.92, y: -6 }}
                    animate={{ opacity: 1, scale: 1,    y: 0   }}
                    exit={{    opacity: 0, scale: 0.92, y: -6   }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                >
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl overflow-hidden w-48">
                        {/* Header — patient info */}
                        <div className="px-3.5 py-2.5 border-b border-gray-100 bg-gray-50/50">
                            <p className="text-xs font-bold text-gray-800 truncate">
                                {apt.patientName || apt.title || "Patient"}
                            </p>
                            <span
                                className={`inline-flex items-center gap-1 mt-0.5
                                    text-[10px] font-semibold px-1.5 py-0.5 rounded-full
                                    ${s.bg} ${s.text} border ${s.border}`}
                            >
                                <span className={`w-1 h-1 rounded-full ${s.dot}`} />
                                {s.label}
                            </span>
                        </div>

                        {/* Status actions */}
                        {validNext.length > 0 && (
                            <div className="p-1.5">
                                <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider px-2 py-1">
                                    Quick Actions
                                </p>
                                {validNext.map((status) => {
                                    const meta = STATUS_LABELS[status] || { icon: "•", label: status };
                                    return (
                                        <button
                                            key={status}
                                            onClick={() => handleStatusAction(status)}
                                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg
                                                text-xs font-medium text-gray-700 text-left
                                                hover:bg-gray-50 active:bg-gray-100 transition-colors"
                                            disabled={statusMutation.isPending}
                                        >
                                            <span className="text-sm w-4 text-center leading-none">
                                                {meta.icon}
                                            </span>
                                            {meta.label}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Divider + secondary actions */}
                        <div className="border-t border-gray-100 p-1.5">
                            {onEdit && (
                                <button
                                    onClick={() => { onEdit(apt._raw || apt); onClose(); }}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg
                                        text-xs font-medium text-blue-600 text-left
                                        hover:bg-blue-50 active:bg-blue-100 transition-colors"
                                >
                                    <span className="text-sm w-4 text-center">✏️</span>
                                    Edit Details
                                </button>
                            )}

                            {validNext.length === 0 && (
                                <p className="text-[10px] text-gray-400 px-2 py-1 italic text-center">
                                    Terminal status — no actions
                                </p>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
