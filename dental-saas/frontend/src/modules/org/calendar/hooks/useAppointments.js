/**
 * useAppointments.js — React Query hooks for Appointment Domain
 *
 * Provides:
 *   - Calendar day view query
 *   - Appointment list with date range filters
 *   - Availability slot queries
 *   - Optimistic create/update/delete/status mutations
 *   - Automatic cache invalidation + rollback
 *
 * API layer: modules/org/calendar/api/appointments.api.js
 * Query keys: @/lib/query/queryKeys (QK.appointments)
 * Architecture: org-plane only, organizationId derived from JWT.
 */
import { useQuery } from '@tanstack/react-query';
import { appointmentsApi } from '../api/appointments.api';
import { QK, useOptimisticMutation, useSimpleMutation } from '@/lib/query';

// Re-export keys for backward compatibility
export const appointmentKeys = QK.appointments;

// ── Calendar Day View ─────────────────────────────────────────────────────

/**
 * @param {{ date: string, branchIds?: string[], doctorId?: string }} params
 */
export function useCalendarDay(params = {}) {
    const { date, branchIds, doctorId } = params;

    return useQuery({
        queryKey: QK.appointments.calendar({ date, branchIds, doctorId }),
        queryFn: async () => {
            const res = await appointmentsApi.getCalendar(date, branchIds, doctorId);
            return res.data?.data || res.data;
        },
        enabled: !!date,
        staleTime: 30_000,
    });
}

// ── Appointment List ──────────────────────────────────────────────────────

/**
 * @param {{ startDate: string, endDate: string, branchId?: string, dentistId?: string, status?: string, page?: number, limit?: number }} params
 */
export function useAppointments(params = {}) {
    return useQuery({
        queryKey: QK.appointments.list(params),
        queryFn: async () => {
            const res = await appointmentsApi.list(params);
            const body = res.data;
            return {
                appointments: body?.data || body?.appointments || [],
                pagination: body?.pagination || { total: 0, page: 1, limit: 50, totalPages: 0 },
            };
        },
        enabled: !!(params.startDate && params.endDate),
        staleTime: 30_000,
        placeholderData: (prev) => prev,
    });
}

// ── Availability Slots ────────────────────────────────────────────────────

export function useAvailability({ branchId, chairId, dentistId, date }) {
    return useQuery({
        queryKey: QK.appointments.availability({ branchId, chairId, dentistId, date }),
        queryFn: async () => {
            const res = await appointmentsApi.getAvailability(branchId, chairId, dentistId, date);
            return res.data?.data || res.data;
        },
        enabled: !!(branchId && date),
        staleTime: 15_000,
    });
}

// ── Single Appointment ────────────────────────────────────────────────────

export function useAppointment(id) {
    return useQuery({
        queryKey: QK.appointments.detail(id),
        queryFn: async () => {
            const res = await appointmentsApi.get(id);
            return res.data?.data || res.data;
        },
        enabled: !!id,
        staleTime: 60_000,
    });
}

// ── Create Appointment (Optimistic) ───────────────────────────────────────

export function useCreateAppointment() {
    return useOptimisticMutation({
        mutationFn: async (data) => {
            const res = await appointmentsApi.create(data);
            return res.data?.data || res.data;
        },
        queryKey: QK.appointments.lists(),
        updateFn: (old, newItem) => {
            if (!old) return old;
            return {
                ...old,
                appointments: [{ ...newItem, _id: `temp-${Date.now()}`, _optimistic: true }, ...(old.appointments || [])],
            };
        },
        invalidateKeys: [QK.appointments.all],
    });
}

// ── Update Appointment (Optimistic) ───────────────────────────────────────

export function useUpdateAppointment() {
    return useSimpleMutation({
        mutationFn: async ({ id, data }) => {
            const res = await appointmentsApi.update(id, data);
            return res.data?.data || res.data;
        },
        invalidateKeys: [
            QK.appointments.all,
        ],
    });
}

// ── Update Status (Optimistic) ────────────────────────────────────────────

export function useUpdateAppointmentStatus() {
    return useOptimisticMutation({
        mutationFn: async ({ id, status }) => {
            const res = await appointmentsApi.updateStatus(id, status);
            return res.data?.data || res.data;
        },
        queryKey: QK.appointments.lists(),
        updateFn: (old, { id, status }) => {
            if (!old?.appointments) return old;
            return {
                ...old,
                appointments: old.appointments.map((a) =>
                    a._id === id ? { ...a, status } : a
                ),
            };
        },
        invalidateKeys: [QK.appointments.all],
    });
}

// ── Delete Appointment (Optimistic) ───────────────────────────────────────

export function useDeleteAppointment() {
    return useOptimisticMutation({
        mutationFn: (id) => appointmentsApi.delete(id),
        queryKey: QK.appointments.lists(),
        updateFn: (old, id) => {
            if (!old?.appointments) return old;
            return {
                ...old,
                appointments: old.appointments.filter((a) => a._id !== id),
            };
        },
        invalidateKeys: [QK.appointments.all],
    });
}
