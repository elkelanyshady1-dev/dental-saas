/**
 * useSecurity.js — React Query Hooks for Security Control Center
 *
 * All server state for the security module managed through TanStack Query.
 *
 * PLANE: Org only.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { securityApi } from "../api/security.api";

// ─── Cache Keys ─────────────────────────────────────────────────────────────

const KEYS = {
    overview: ["security", "overview"],
    permissions: ["security", "permissions"],
    matrix: ["security", "matrix"],
    policies: ["security", "policies"],
    fields: ["security", "fields"],
    coverage: ["security", "coverage"],
    logs: (params) => ["security", "logs", params],
};

// ─── Overview ───────────────────────────────────────────────────────────────

export function useSecurityOverview() {
    return useQuery({
        queryKey: KEYS.overview,
        queryFn: () => securityApi.getOverview().then((r) => r.data.data),
        staleTime: 30_000, // 30s — dashboard data
    });
}

// ─── Permissions ────────────────────────────────────────────────────────────

export function usePermissions() {
    return useQuery({
        queryKey: KEYS.permissions,
        queryFn: () => securityApi.getPermissions().then((r) => r.data.data),
        staleTime: 5 * 60_000, // 5min — rarely changes
    });
}

// ─── Route → Permission Matrix ──────────────────────────────────────────────

export function useSecurityMatrix() {
    return useQuery({
        queryKey: KEYS.matrix,
        queryFn: () => securityApi.getMatrix().then((r) => r.data.data),
        staleTime: 5 * 60_000, // 5min — static
    });
}

// ─── Policies ───────────────────────────────────────────────────────────────

export function usePolicies() {
    return useQuery({
        queryKey: KEYS.policies,
        queryFn: () => securityApi.getPolicies().then((r) => r.data.data),
        staleTime: 5 * 60_000,
    });
}

// ─── Field Access ───────────────────────────────────────────────────────────

export function useFieldAccess() {
    return useQuery({
        queryKey: KEYS.fields,
        queryFn: () => securityApi.getFieldAccess().then((r) => r.data.data),
        staleTime: 5 * 60_000,
    });
}

// ─── Coverage ───────────────────────────────────────────────────────────────

export function useCoverage() {
    return useQuery({
        queryKey: KEYS.coverage,
        queryFn: () => securityApi.getCoverage().then((r) => r.data.data),
        staleTime: 5 * 60_000,
    });
}

// ─── Access Logs ────────────────────────────────────────────────────────────

export function useAccessLogs(params = {}) {
    return useQuery({
        queryKey: KEYS.logs(params),
        queryFn: () => securityApi.getLogs(params).then((r) => r.data.data),
        staleTime: 10_000, // 10s — logs change frequently
        keepPreviousData: true, // smooth pagination
    });
}

// ─── Simulation ─────────────────────────────────────────────────────────────

export function useSimulateAccess() {
    return useMutation({
        mutationFn: (data) => securityApi.simulate(data).then((r) => r.data.data),
    });
}

// ─── Phase 1+2: Security Alerts ─────────────────────────────────────────

export function useSecurityAlerts(params = {}) {
    return useQuery({
        queryKey: ["security", "alerts", params],
        queryFn: () => securityApi.getAlerts(params).then((r) => r.data.data),
        staleTime: 15_000, // 15s — alerts can appear frequently
    });
}

export function useAlertSummary() {
    return useQuery({
        queryKey: ["security", "alerts", "summary"],
        queryFn: () => securityApi.getAlertSummary().then((r) => r.data.data),
        staleTime: 15_000,
        refetchInterval: 30_000, // Auto-poll every 30s for live badge counts
    });
}

export function useAcknowledgeAlert() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id) => securityApi.acknowledgeAlert(id).then((r) => r.data.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["security", "alerts"] });
        },
    });
}

export function useResolveAlert() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id) => securityApi.resolveAlert(id).then((r) => r.data.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["security", "alerts"] });
        },
    });
}

// ─── Phase 4: Policy History ────────────────────────────────────────────

export function usePolicyHistory(params = {}) {
    return useQuery({
        queryKey: ["security", "policies", "history", params],
        queryFn: () => securityApi.getPolicyHistory(params).then((r) => r.data.data),
        staleTime: 60_000, // 1 min — history rarely changes
    });
}

// ─── Phase 5: Security Metrics ──────────────────────────────────────────

export function useSecurityMetrics() {
    return useQuery({
        queryKey: ["security", "metrics"],
        queryFn: () => securityApi.getMetrics().then((r) => r.data.data),
        staleTime: 15_000,
        refetchInterval: 30_000, // Auto-poll for live metrics
    });
}
