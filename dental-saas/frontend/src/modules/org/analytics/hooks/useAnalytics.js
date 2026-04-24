/**
 * useAnalytics.js — React Query hooks for the Org Insights surface.
 *
 * HR-8 compliance: query keys use normalized string params via QK.analytics.*.
 * HR-9 compliance: no manual refetch() — refresh flows through
 * queryClient.invalidateQueries({ queryKey: QK.analytics.all }).
 *
 * All hooks accept a single `filters` object shaped:
 *   { from: ISOString, to: ISOString, branchId?: string, granularity?: "day"|"week"|"month", timezone?: string }
 *
 * Callers MUST pass ISO strings — never raw Date objects (prevents cache
 * fragmentation from reference-identity changes).
 */
import { useQuery } from "@tanstack/react-query";
import { QK } from "@/lib/query/queryKeys";
import { analyticsApi } from "../api/analytics.api";

const DEFAULT_STALE_MS = 60_000;
const DEFAULT_GC_MS = 5 * 60_000;

function baseOptions(extra = {}) {
    return {
        staleTime: DEFAULT_STALE_MS,
        gcTime: DEFAULT_GC_MS,
        refetchOnWindowFocus: false,
        ...extra,
    };
}

function dataOnly(resp) {
    return resp?.data ?? resp;
}

export function useAnalyticsOverview(filters, options = {}) {
    return useQuery({
        queryKey: QK.analytics.overview(filters),
        queryFn: () => analyticsApi.getOverview(filters).then(dataOnly),
        enabled: Boolean(filters?.from && filters?.to),
        ...baseOptions(options),
    });
}

export function useRevenueSeries(filters, options = {}) {
    return useQuery({
        queryKey: QK.analytics.revenue(filters),
        queryFn: () => analyticsApi.getRevenue(filters).then(dataOnly),
        enabled: Boolean(filters?.from && filters?.to),
        ...baseOptions(options),
    });
}

export function useAppointmentsFunnel(filters, options = {}) {
    return useQuery({
        queryKey: QK.analytics.appointments(filters),
        queryFn: () => analyticsApi.getAppointments(filters).then(dataOnly),
        enabled: Boolean(filters?.from && filters?.to),
        ...baseOptions(options),
    });
}

export function usePatientGrowth(filters, options = {}) {
    return useQuery({
        queryKey: QK.analytics.patients(filters),
        queryFn: () => analyticsApi.getPatients(filters).then(dataOnly),
        enabled: Boolean(filters?.from && filters?.to),
        ...baseOptions(options),
    });
}

export function useProcedureMix(filters, options = {}) {
    return useQuery({
        queryKey: QK.analytics.procedures(filters),
        queryFn: () => analyticsApi.getProcedures(filters).then(dataOnly),
        enabled: Boolean(filters?.from && filters?.to),
        ...baseOptions(options),
    });
}

export function useDoctorLeaderboard(filters, options = {}) {
    return useQuery({
        queryKey: QK.analytics.doctors(filters),
        queryFn: () => analyticsApi.getDoctors(filters).then(dataOnly),
        enabled: Boolean(filters?.from && filters?.to),
        ...baseOptions(options),
    });
}

export function useChairUtilization(filters, options = {}) {
    return useQuery({
        queryKey: QK.analytics.chair(filters),
        queryFn: () => analyticsApi.getChair(filters).then(dataOnly),
        enabled: Boolean(filters?.from && filters?.to),
        ...baseOptions(options),
    });
}

export function useBranchComparison(filters, options = {}) {
    return useQuery({
        queryKey: QK.analytics.branchesCmp(filters),
        queryFn: () => analyticsApi.getBranches(filters).then(dataOnly),
        enabled: Boolean(filters?.from && filters?.to),
        ...baseOptions(options),
    });
}

export function useLabSLA(filters, options = {}) {
    return useQuery({
        queryKey: QK.analytics.lab(filters),
        queryFn: () => analyticsApi.getLab(filters).then(dataOnly),
        enabled: Boolean(filters?.from && filters?.to),
        ...baseOptions(options),
    });
}

export function useInventoryAlerts(filters, options = {}) {
    return useQuery({
        queryKey: QK.analytics.inventory(filters),
        queryFn: () => analyticsApi.getInventory(filters).then(dataOnly),
        enabled: Boolean(filters?.from && filters?.to),
        ...baseOptions(options),
    });
}
