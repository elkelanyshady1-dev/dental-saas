/**
 * useRealtimeCalendar.js — Calendar Real-Time Sync Hook
 * Phase 13.3 — System-Wide Contract Alignment
 *
 * Listens to all appointment lifecycle events and invalidates the
 * calendar React Query cache, triggering a background refetch.
 *
 * ARCHITECTURAL RULES:
 *   ✅ Event → invalidateQueries → refetch → render (NO setState from socket)
 *   ✅ Uses existing SocketContext singleton (lib/socket.js → SocketContext.jsx)
 *   ✅ Cleans up all listeners on unmount
 *   ✅ Calls useOrgSocket() with individual subscriptions (correct signature)
 *
 * v13.3 Change: Added onDeleted param + appointment.deleted.v1 subscription.
 *
 * @param {object} [options]
 * @param {boolean} [options.enabled=true]
 * @param {Function} [options.onCreated]  — optional (data) => void
 * @param {Function} [options.onUpdated]  — optional (data) => void
 * @param {Function} [options.onDeleted]  — optional (data) => void
 */

import { useOrgSocket } from "@/hooks/useOrgSocket";
import { QK } from "@/lib/query";

export function useRealtimeCalendar({ enabled = true, onCreated, onUpdated, onDeleted } = {}) {
    // useOrgSocket signature: (event, queryKey, onEvent?)
    // Socket events arrive → invalidateQueries([...queryKey]) → React Query refetch

    // appointment.created.v1 — new booking from any client
    useOrgSocket("appointment.created.v1", QK.appointments.all, onCreated);

    // appointment.updated.v1 — reschedule / edit / drag-drop
    useOrgSocket("appointment.updated.v1", QK.appointments.all, onUpdated);

    // appointment.status_changed.v1 — FSM transition (check-in, in-progress, etc.)
    useOrgSocket("appointment.status_changed.v1", QK.appointments.all);

    // appointment.deleted.v1 — cancellation / removal
    useOrgSocket("appointment.deleted.v1", QK.appointments.all, onDeleted);

    // booking.update.v1 — legacy patient portal booking events
    useOrgSocket("booking.update.v1", QK.appointments.all);
}
