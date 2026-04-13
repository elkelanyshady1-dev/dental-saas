/**
 * useAuthAnalytics.js — React Query Hooks for Auth Analytics Dashboard
 *
 * TanStack Query hooks for all split analytics endpoints.
 * Includes auto-polling (TASK-AUTH-SCALE-006) for real-time dashboard updates.
 *
 * Pattern: follows useSecurity.js conventions.
 *
 * MODULE: frontend/src/modules/org/security/analytics
 * PLANE: Org only.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authAnalyticsApi } from "../api/authAnalytics.api";

// ─── Cache Keys ─────────────────────────────────────────────────────────────

export const AUTH_ANALYTICS_KEYS = {
    all: ["auth-analytics"],
    summary: (params) => ["auth-analytics", "summary", params],
    timeline: (params) => ["auth-analytics", "timeline", params],
    distribution: (params) => ["auth-analytics", "distribution", params],
    deniedPermissions: (params) => ["auth-analytics", "denied-permissions", params],
    recentDenials: (params) => ["auth-analytics", "recent-denials", params],
    riskUsers: (params) => ["auth-analytics", "risk-users", params],
    layerPerformance: (params) => ["auth-analytics", "layer-performance", params],
    fieldViolations: (params) => ["auth-analytics", "field-violations", params],
    queueHealth: ["auth-analytics", "queue-health"],
    trace: (traceId) => ["auth-analytics", "trace", traceId],
};

// ─── Default poll interval ──────────────────────────────────────────────────

const POLL_FAST = 15_000;  // 15s — KPI cards, denials, risk users
const POLL_MEDIUM = 30_000; // 30s — charts, layer perf
const POLL_SLOW = 60_000;  // 60s — field violations, distribution

// ─── Summary KPI Cards ─────────────────────────────────────────────────────

export function useAuthSummary(params = {}, options = {}) {
    return useQuery({
        queryKey: AUTH_ANALYTICS_KEYS.summary(params),
        queryFn: () =>
            authAnalyticsApi.getSummary(params).then((r) => r.data.data),
        staleTime: 10_000,
        refetchInterval: options.polling !== false ? POLL_FAST : false,
        keepPreviousData: true,
        ...options,
    });
}

// ─── Timeline Chart ─────────────────────────────────────────────────────────

export function useAuthTimeline(params = {}, options = {}) {
    return useQuery({
        queryKey: AUTH_ANALYTICS_KEYS.timeline(params),
        queryFn: () =>
            authAnalyticsApi.getTimeline(params).then((r) => r.data.data),
        staleTime: 15_000,
        refetchInterval: options.polling !== false ? POLL_MEDIUM : false,
        keepPreviousData: true,
        ...options,
    });
}

// ─── Distribution Donut ─────────────────────────────────────────────────────

export function useAuthDistribution(params = {}, options = {}) {
    return useQuery({
        queryKey: AUTH_ANALYTICS_KEYS.distribution(params),
        queryFn: () =>
            authAnalyticsApi.getDistribution(params).then((r) => r.data.data),
        staleTime: 20_000,
        refetchInterval: options.polling !== false ? POLL_SLOW : false,
        keepPreviousData: true,
        ...options,
    });
}

// ─── Top Denied Permissions ─────────────────────────────────────────────────

export function useAuthDeniedPermissions(params = {}, options = {}) {
    return useQuery({
        queryKey: AUTH_ANALYTICS_KEYS.deniedPermissions(params),
        queryFn: () =>
            authAnalyticsApi.getDeniedPermissions(params).then((r) => r.data.data),
        staleTime: 15_000,
        refetchInterval: options.polling !== false ? POLL_MEDIUM : false,
        keepPreviousData: true,
        ...options,
    });
}

// ─── Recent Denials Table ───────────────────────────────────────────────────

export function useAuthRecentDenials(params = {}, options = {}) {
    return useQuery({
        queryKey: AUTH_ANALYTICS_KEYS.recentDenials(params),
        queryFn: () =>
            authAnalyticsApi.getRecentDenials(params).then((r) => r.data.data),
        staleTime: 10_000,
        refetchInterval: options.polling !== false ? POLL_FAST : false,
        keepPreviousData: true,
        ...options,
    });
}

// ─── Risk Users ─────────────────────────────────────────────────────────────

export function useAuthRiskUsers(params = {}, options = {}) {
    return useQuery({
        queryKey: AUTH_ANALYTICS_KEYS.riskUsers(params),
        queryFn: () =>
            authAnalyticsApi.getRiskUsers(params).then((r) => r.data.data),
        staleTime: 15_000,
        refetchInterval: options.polling !== false ? POLL_FAST : false,
        keepPreviousData: true,
        ...options,
    });
}

// ─── Layer Performance ──────────────────────────────────────────────────────

export function useAuthLayerPerformance(params = {}, options = {}) {
    return useQuery({
        queryKey: AUTH_ANALYTICS_KEYS.layerPerformance(params),
        queryFn: () =>
            authAnalyticsApi.getLayerPerformance(params).then((r) => r.data.data),
        staleTime: 20_000,
        refetchInterval: options.polling !== false ? POLL_MEDIUM : false,
        keepPreviousData: true,
        ...options,
    });
}

// ─── Field Violations ───────────────────────────────────────────────────────

export function useAuthFieldViolations(params = {}, options = {}) {
    return useQuery({
        queryKey: AUTH_ANALYTICS_KEYS.fieldViolations(params),
        queryFn: () =>
            authAnalyticsApi.getFieldViolations(params).then((r) => r.data.data),
        staleTime: 20_000,
        refetchInterval: options.polling !== false ? POLL_SLOW : false,
        keepPreviousData: true,
        ...options,
    });
}

// ─── Queue Health ───────────────────────────────────────────────────────────

export function useAuthQueueHealth(options = {}) {
    return useQuery({
        queryKey: AUTH_ANALYTICS_KEYS.queueHealth,
        queryFn: () =>
            authAnalyticsApi.getQueueHealth().then((r) => r.data.data),
        staleTime: 15_000,
        refetchInterval: options.polling !== false ? POLL_MEDIUM : false,
        ...options,
    });
}

// ─── Trace Inspection ───────────────────────────────────────────────────────

export function useAuthTraceInspection(traceId, options = {}) {
    return useQuery({
        queryKey: AUTH_ANALYTICS_KEYS.trace(traceId),
        queryFn: () =>
            authAnalyticsApi.getTraceInspection(traceId).then((r) => r.data.data),
        staleTime: 60_000, // traces are immutable
        enabled: !!traceId,
        ...options,
    });
}

// ─── Refresh All ────────────────────────────────────────────────────────────

/**
 * Hook that returns a function to invalidate all analytics caches.
 * Used by the Refresh button on the dashboard.
 */
export function useRefreshAuthAnalytics() {
    const queryClient = useQueryClient();

    return {
        refresh: () =>
            queryClient.invalidateQueries({
                queryKey: AUTH_ANALYTICS_KEYS.all,
            }),
        isRefreshing: queryClient.isFetching({
            queryKey: AUTH_ANALYTICS_KEYS.all,
        }) > 0,
    };
}

// ─── Security Alerts ────────────────────────────────────────────────────────

export function useAuthAlerts(params = {}, options = {}) {
    return useQuery({
        queryKey: [...AUTH_ANALYTICS_KEYS.all, "alerts", params],
        queryFn: () =>
            authAnalyticsApi.getAlerts(params).then((r) => r.data.data),
        staleTime: 10_000,
        refetchInterval: options.polling !== false ? POLL_FAST : false,
        keepPreviousData: true,
        ...options,
    });
}

// ─── Drill-Down: User Denials ───────────────────────────────────────────────

export function useUserDenials(userId, params = {}, options = {}) {
    return useQuery({
        queryKey: [...AUTH_ANALYTICS_KEYS.all, "user-denials", userId, params],
        queryFn: () =>
            authAnalyticsApi.getUserDenials(userId, params).then((r) => r.data.data),
        staleTime: 15_000,
        enabled: !!userId,
        keepPreviousData: true,
        ...options,
    });
}

// ─── Drill-Down: Permission Breakdown ───────────────────────────────────────

export function usePermissionBreakdown(permission, params = {}, options = {}) {
    return useQuery({
        queryKey: [...AUTH_ANALYTICS_KEYS.all, "permission-breakdown", permission, params],
        queryFn: () =>
            authAnalyticsApi.getPermissionBreakdown(permission, params).then((r) => r.data.data),
        staleTime: 15_000,
        enabled: !!permission,
        keepPreviousData: true,
        ...options,
    });
}

// ─── Prefetch Utility ───────────────────────────────────────────────────────

/**
 * Returns a prefetch function for hover-triggered data loading.
 * Use on table rows and chart elements to preload drill-down data.
 */
export function useAuthPrefetch() {
    const queryClient = useQueryClient();

    return {
        prefetchUser: (userId, params = {}) =>
            queryClient.prefetchQuery({
                queryKey: [...AUTH_ANALYTICS_KEYS.all, "user-denials", userId, params],
                queryFn: () =>
                    authAnalyticsApi.getUserDenials(userId, params).then((r) => r.data.data),
                staleTime: 30_000,
            }),
        prefetchPermission: (permission, params = {}) =>
            queryClient.prefetchQuery({
                queryKey: [...AUTH_ANALYTICS_KEYS.all, "permission-breakdown", permission, params],
                queryFn: () =>
                    authAnalyticsApi.getPermissionBreakdown(permission, params).then((r) => r.data.data),
                staleTime: 30_000,
            }),
        prefetchTrace: (traceId) =>
            queryClient.prefetchQuery({
                queryKey: AUTH_ANALYTICS_KEYS.trace(traceId),
                queryFn: () =>
                    authAnalyticsApi.getTraceInspection(traceId).then((r) => r.data.data),
                staleTime: 60_000,
            }),
    };
}

