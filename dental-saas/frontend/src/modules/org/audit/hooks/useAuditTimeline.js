/**
 * useAuditTimeline.js — React Query hooks for audit timeline
 *
 * Provides cached, auto-refreshing audit timeline data.
 * Uses TanStack Query (React Query) per project convention.
 *
 * PLANE: Org only.
 *
 * @module hooks/useAuditTimeline
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
    getEntityTimeline,
    getUserActivity,
    getOrgTimeline,
    getAuditStats,
    getAuditAlerts,
    getGovernanceStatus,
} from "../api/audit.api";

const AUDIT_STALE_TIME = 30 * 1000; // 30 seconds

/**
 * Hook for entity-scoped audit timeline.
 * @param {string} entityId
 * @param {Object} [params]
 */
export function useEntityAuditTimeline(entityId, params = {}) {
    return useQuery({
        queryKey: ["audit", "entity", entityId, params],
        queryFn: () => getEntityTimeline(entityId, params),
        enabled: !!entityId,
        staleTime: AUDIT_STALE_TIME,
    });
}

/**
 * Hook for user activity timeline.
 * @param {string} userId
 * @param {Object} [params]
 */
export function useUserAuditTimeline(userId, params = {}) {
    return useQuery({
        queryKey: ["audit", "user", userId, params],
        queryFn: () => getUserActivity(userId, params),
        enabled: !!userId,
        staleTime: AUDIT_STALE_TIME,
    });
}

/**
 * Hook for org-wide audit timeline.
 * @param {Object} [params]
 */
export function useOrgAuditTimeline(params = {}) {
    return useQuery({
        queryKey: ["audit", "org", params],
        queryFn: () => getOrgTimeline(params),
        staleTime: AUDIT_STALE_TIME,
    });
}

/**
 * Hook for audit statistics.
 * @param {Object} [params]
 */
export function useAuditStats(params = {}) {
    return useQuery({
        queryKey: ["audit", "stats", params],
        queryFn: () => getAuditStats(params),
        staleTime: 60 * 1000, // Stats can be stale longer
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 14 — Audit Intelligence + Governance + Real-time
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for audit security alerts (anomaly detection).
 * @param {Object} [params] - { hours: 24 }
 */
export function useAuditAlerts(params = {}) {
    return useQuery({
        queryKey: ["audit", "alerts", params],
        queryFn: () => getAuditAlerts(params),
        staleTime: 2 * 60 * 1000, // 2 minutes — intelligence data refreshes less often
    });
}

/**
 * Hook for governance violation status.
 * @param {Object} [params] - { rule?, severity?, limit? }
 */
export function useGovernanceStatus(params = {}) {
    return useQuery({
        queryKey: ["audit", "governance", params],
        queryFn: () => getGovernanceStatus(params),
        staleTime: 60 * 1000,
    });
}

/**
 * useAuditStream — Real-time audit event listener via Socket.IO.
 *
 * Listens for "audit:event" and "governance:violation" socket events
 * and invalidates the relevant React Query caches automatically.
 *
 * @param {Object} [socket] — Socket.IO client instance
 */
export function useAuditStream(socket) {
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!socket) return;

        const handleAuditEvent = () => {
            // Invalidate all audit-related queries
            queryClient.invalidateQueries({ queryKey: ["audit"] });
        };

        const handleGovernanceViolation = () => {
            queryClient.invalidateQueries({ queryKey: ["audit", "governance"] });
            queryClient.invalidateQueries({ queryKey: ["audit", "alerts"] });
        };

        socket.on("audit:event", handleAuditEvent);
        socket.on("governance:violation", handleGovernanceViolation);

        return () => {
            socket.off("audit:event", handleAuditEvent);
            socket.off("governance:violation", handleGovernanceViolation);
        };
    }, [socket, queryClient]);
}
