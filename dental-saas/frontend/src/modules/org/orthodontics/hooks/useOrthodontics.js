/**
 * useOrthodontics.js — React Query hooks for Orthodontic Case Domain
 *
 * Provides:
 *   - Case list with filters (patientId, status, doctorId)
 *   - Single case detail with scans
 *   - Optimistic create/update mutations
 *   - Scan upload + AI analysis mutations
 *   - Aligner plan mutations
 *   - Automatic cache invalidation + rollback
 *
 * API layer: modules/org/orthodontics/api/orthodontics.api.js
 * Query keys: @/lib/query/queryKeys (QK.orthodontics)
 * Architecture: org-plane only, organizationId derived from JWT.
 */
import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orthodonticsApi } from '../api/orthodontics.api';
import { QK, useOptimisticMutation } from '@/lib/query';
import { useSocket } from '@/context/SocketContext';

// Re-export keys for backward compatibility
export const orthoKeys = QK.orthodontics;

// ── Case List ─────────────────────────────────────────────────────────────

/**
 * @param {{ patientId?: string, status?: string, doctorId?: string, page?: number, limit?: number }} params
 */
export function useOrthoCases(params = {}) {
    return useQuery({
        queryKey: QK.orthodontics.list(params),
        queryFn: async () => {
            const res = await orthodonticsApi.list(params);
            const body = res.data;
            return {
                cases: body?.data || body?.cases || [],
                pagination: body?.pagination || { total: 0, page: 1, limit: 20, totalPages: 0 },
            };
        },
        staleTime: 5 * 60_000,
        placeholderData: (prev) => prev,
    });
}

// ── Single Case ───────────────────────────────────────────────────────────

export function useOrthoCase(caseId) {
    return useQuery({
        queryKey: QK.orthodontics.detail(caseId),
        queryFn: async () => {
            const res = await orthodonticsApi.get(caseId);
            return res.data?.case || res.data?.data || res.data;
        },
        enabled: !!caseId,
        staleTime: 60_000,
    });
}

// ── Case Scans ────────────────────────────────────────────────────────────

export function useOrthoScans(caseId) {
    return useQuery({
        queryKey: QK.orthodontics.scans(caseId),
        queryFn: async () => {
            const res = await orthodonticsApi.getScans(caseId);
            return res.data?.scans || res.data?.data || res.data || [];
        },
        enabled: !!caseId,
        staleTime: 60_000,
    });
}

// ── Create Case (Optimistic) ──────────────────────────────────────────────

export function useCreateOrthoCase() {
    return useOptimisticMutation({
        mutationFn: async (data) => {
            const res = await orthodonticsApi.create(data);
            return res.data?.data || res.data;
        },
        queryKey: QK.orthodontics.lists(),
        updateFn: (old, newItem) => {
            if (!old) return old;
            return {
                ...old,
                cases: [{ ...newItem, _id: `temp-${Date.now()}`, _optimistic: true, status: 'draft' }, ...(old.cases || [])],
            };
        },
    });
}

// ── Update Case (Optimistic) ──────────────────────────────────────────────

export function useUpdateOrthoCase() {
    return useOptimisticMutation({
        mutationFn: async ({ caseId, data }) => {
            const res = await orthodonticsApi.update(caseId, data);
            return res.data?.data || res.data;
        },
        queryKey: QK.orthodontics.lists(),
        updateFn: (old, { caseId, data }) => {
            if (!old?.cases) return old;
            return {
                ...old,
                cases: old.cases.map((c) =>
                    c._id === caseId ? { ...c, ...data } : c
                ),
            };
        },
    });
}

// ── Upload Scan ───────────────────────────────────────────────────────────
// Not optimistic: file upload progress + server-side processing

export function useUploadScan() {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async ({ caseId, formData, onUploadProgress }) => {
            const res = await orthodonticsApi.uploadScan(caseId, formData, onUploadProgress);
            return res.data?.data || res.data;
        },
        onSuccess: (_, variables) => {
            qc.invalidateQueries({ queryKey: QK.orthodontics.scans(variables.caseId) });
            qc.invalidateQueries({ queryKey: QK.orthodontics.detail(variables.caseId) });
        },
    });
}

// ── Request AI Analysis ───────────────────────────────────────────────────
// Not optimistic: server-side async processing (BullMQ job)

export function useRequestAnalysis() {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async ({ caseId, scanId }) => {
            const res = await orthodonticsApi.requestAnalysis(caseId, scanId);
            return res.data?.data || res.data;
        },
        onSuccess: (_, variables) => {
            qc.invalidateQueries({ queryKey: QK.orthodontics.scans(variables.caseId) });
        },
    });
}

// ── Update Aligner Plan ───────────────────────────────────────────────────

export function useUpdateAlignerPlan() {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async ({ caseId, planId, data }) => {
            const res = await orthodonticsApi.updateAlignerPlan(caseId, planId, data);
            return res.data?.data || res.data;
        },
        onSuccess: (_, variables) => {
            qc.invalidateQueries({ queryKey: QK.orthodontics.detail(variables.caseId) });
        },
    });
}

// ── Situation Room Dashboard ──────────────────────────────────────────────
// Single aggregation endpoint. Scope is derived from JWT (owner vs organization).
// Realtime invalidation is debounced 3s (inside the 2–5s TDS window) and
// gated to an allow-list of event types to avoid spam refetches.

const DASHBOARD_INVALIDATE_EVENTS = [
    'clinical.event.created',
    'clinical.event.critical',
    'ortho.stage.changed',
    'ortho.visit.recorded',
    'ortho.aligner.progress',
];
const DASHBOARD_INVALIDATE_DEBOUNCE_MS = 3000;

export function useOrthoDashboard() {
    const qc = useQueryClient();
    const socket = useSocket?.();

    const query = useQuery({
        queryKey: QK.orthodontics.dashboard(),
        queryFn: async () => {
            const res = await orthodonticsApi.getDashboard();
            return res.data?.data || res.data;
        },
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        placeholderData: (prev) => prev,
    });

    // Debounced WS invalidation — one refetch per burst instead of per event.
    const timerRef = useRef(null);
    useEffect(() => {
        if (!socket || typeof socket.on !== 'function') return;
        const schedule = () => {
            if (timerRef.current) return;
            timerRef.current = setTimeout(() => {
                timerRef.current = null;
                qc.invalidateQueries({ queryKey: QK.orthodontics.dashboard() });
            }, DASHBOARD_INVALIDATE_DEBOUNCE_MS);
        };
        DASHBOARD_INVALIDATE_EVENTS.forEach((evt) => socket.on(evt, schedule));
        return () => {
            DASHBOARD_INVALIDATE_EVENTS.forEach((evt) => socket.off?.(evt, schedule));
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [socket, qc]);

    return query;
}

// ── Add Case Note ─────────────────────────────────────────────────────────
// Notes are stored on the case document — invalidate the case detail cache.

export function useAddCaseNote() {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async ({ caseId, content }) => {
            const res = await orthodonticsApi.addNote(caseId, content);
            return res.data?.data || res.data;
        },
        onSuccess: (_, variables) => {
            qc.invalidateQueries({ queryKey: QK.orthodontics.detail(variables.caseId) });
        },
    });
}
