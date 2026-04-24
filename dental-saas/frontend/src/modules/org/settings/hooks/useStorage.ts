/**
 * useStorage.ts — Storage Settings React Query hooks
 *
 * DOMAIN: Settings (Org)
 * PLANE: Organization
 *
 * All server state is managed via React Query (§13 — no useState for server data).
 * Query keys use the centralized registry (§13.2).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QK } from "@/lib/query/queryKeys";
import {
    getStorageQuota,
    listExportJobs,
    getExportJobStatus,
    getExportDownloadUrl,
    requestExport,
    getBackupPolicy,
    setBackupPolicy,
} from "../api/storage.api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StorageBreakdown {
    photos: number;
    stl: number;
    audio: number;
    documents: number;
    other: number;
}

export interface StorageQuota {
    usedBytes: number;
    usedMB: number;
    maxStorageMB: number;
    percentUsed: number;
    isUnlimited: boolean;
    remainingMB: number | null;
    totalFiles: number;
    breakdown: StorageBreakdown;
    fileCount: StorageBreakdown;
    lastUploadAt: string | null;
}

export interface ExportJob {
    _id: string;
    status: "pending" | "processing" | "completed" | "failed" | "expired";
    modules: string[];
    format: string;
    archiveSizeBytes: number | null;
    errorMessage: string | null;
    summary: { totalRecords: number; modules: Record<string, number> };
    createdAt: string;
    completedAt: string | null;
    expiresAt: string | null;
}

export interface ExportJobList {
    jobs: ExportJob[];
    total: number;
    page: number;
    limit: number;
}

export interface BackupPolicy {
    _id: string;
    organizationId: string;
    enabled: boolean;
    frequency: "daily" | "weekly";
    timeOfDay: string;        // "HH:MM" UTC
    dayOfWeek: number;        // 0=Sunday
    retentionDays: number;
    lastRunAt: string | null;
    updatedAt: string;
}

export interface PlanLimits {
    maxBackupFrequency: "daily" | "weekly";
    maxRetentionDays: number;
}

export interface BackupPolicyData {
    policy: BackupPolicy | null;
    planLimits: PlanLimits;
}

// ─── useStorageQuota ──────────────────────────────────────────────────────────

/**
 * React Query hook for storage quota status.
 * Used by StorageUsageCard on the Storage Settings page.
 */
export function useStorageQuota() {
    return useQuery({
        queryKey:   QK.storage.quota(),
        queryFn:    getStorageQuota,
        staleTime:  30_000,    // 30s — quota is relatively stable
        gcTime:     5 * 60_000, // 5 min
        refetchOnWindowFocus: false,
    });
}

// ─── useExportJobs ────────────────────────────────────────────────────────────

/**
 * React Query hook for listing export jobs.
 */
export function useExportJobs(params: { page?: number; limit?: number } = {}) {
    return useQuery<ExportJobList>({
        queryKey:   QK.backup.list(params),
        queryFn:    () => listExportJobs(params),
        staleTime:  15_000,     // 15s — job status changes frequently while processing
        gcTime:     2 * 60_000, // 2 min
        refetchOnWindowFocus: false,
        // Auto-refresh while jobs are pending/processing
        refetchInterval: (query) => {
            const jobs = query.state.data?.jobs ?? [];
            const hasActive = jobs.some(
                (j: ExportJob) => j.status === "pending" || j.status === "processing"
            );
            return hasActive ? 5_000 : false; // poll every 5s if any job is in-progress
        },
    });
}

// ─── useExportJob ─────────────────────────────────────────────────────────────

/**
 * React Query hook for a single export job's status.
 */
export function useExportJob(jobId: string | null) {
    return useQuery<{ job: ExportJob }>({
        queryKey:  QK.backup.detail(jobId ?? ""),
        queryFn:   () => getExportJobStatus(jobId!),
        enabled:   !!jobId,
        staleTime: 10_000,
        gcTime:    2 * 60_000,
        refetchOnWindowFocus: false,
        refetchInterval: (query) => {
            const status = query.state.data?.job?.status;
            return (status === "pending" || status === "processing") ? 3_000 : false;
        },
    });
}

// ─── useRequestExport ─────────────────────────────────────────────────────────

/**
 * Mutation hook to request a new export job.
 * Invalidates the jobs list on success.
 */
export function useRequestExport() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (options: { modules?: string[]; format?: "json" }) =>
            requestExport(options),

        onSuccess: () => {
            // Invalidate the jobs list so the new job appears immediately
            queryClient.invalidateQueries({ queryKey: QK.backup.lists() });
        },
    });
}

// ─── useExportDownloadUrl ─────────────────────────────────────────────────────

/**
 * Lazily-fetched signed download URL for a completed export.
 * Only fetches when `enabled` is true (i.e. user clicks "Download").
 *
 * IMPORTANT: URLs expire (typically 1 hour). Do NOT cache or store them.
 * Re-fetch on every download click.
 */
export function useExportDownloadUrl(jobId: string | null, enabled: boolean) {
    return useQuery<{ url: string; expiresIn: number }>({
        queryKey:  QK.backup.url(jobId ?? ""),
        queryFn:   () => getExportDownloadUrl(jobId!),
        enabled:   !!jobId && enabled,
        staleTime: 0,       // Always re-fetch — signed URLs have short TTL
        gcTime:    60_000,  // 1 min cache (URL is valid for ~1h but we don't cache longer)
        refetchOnWindowFocus: false,
    });
}

// ─── useBackupPolicy ──────────────────────────────────────────────────────────

/**
 * React Query hook for reading the backup policy + plan limits.
 */
export function useBackupPolicy() {
    return useQuery<BackupPolicyData>({
        queryKey:   QK.backup.policy(),
        queryFn:    getBackupPolicy,
        staleTime:  60_000,     // 1 min — policy is stable
        gcTime:     5 * 60_000,
        refetchOnWindowFocus: false,
    });
}

// ─── useSetBackupPolicy ───────────────────────────────────────────────────────

/**
 * Mutation hook to create/update the backup policy.
 * Invalidates the policy query on success.
 */
export function useSetBackupPolicy() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (policy: Partial<BackupPolicy>) => setBackupPolicy(policy),

        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QK.backup.policy() });
        },
    });
}
