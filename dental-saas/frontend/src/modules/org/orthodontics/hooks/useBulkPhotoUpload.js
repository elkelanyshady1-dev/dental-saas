/**
 * useBulkPhotoUpload.js — TDS-BULK-UPLOAD-v1.1 (Option B — recordset-scoped)
 * ═══════════════════════════════════════════════════════════════
 * React Query hooks for the orthodontic bulk photo upload flow.
 *
 * Every pool hook is STRICTLY scoped to one recordSetId. Callers MUST
 * supply it — queries are disabled until both caseId and recordSetId are
 * known. Query keys embed the recordSetId so PRE / MID / POST pools are
 * fully isolated in the cache.
 *
 * Exported hooks:
 *   - useStorageQuota({ pollDuringUpload })
 *   - useOptimisticQuotaUpdate()
 *   - useImagePool(caseId, recordSetId, filter)
 *   - useBulkUploadPhotos(caseId, recordSetId)
 *   - useAssignPoolImage(caseId, recordSetId)
 *   - useUnassignPoolImage(caseId, recordSetId)
 *   - useDeletePoolImage(caseId, recordSetId)
 * ═══════════════════════════════════════════════════════════════
 */

import {
    useQuery,
    useMutation,
    useQueryClient,
} from '@tanstack/react-query';
import { caseApi } from '@/org/modules/patients/components/orthodontic-chart/api/case.api';
import { getStorageQuota } from '@/modules/org/settings/api/storage.api';
import { QK } from '@/lib/query/queryKeys';
import {
    compressImages,
    buildMetaPayload,
    totalBytes,
} from '@/lib/upload/compressImages';

// ─── 1. useStorageQuota ──────────────────────────────────────────────────────

export function useStorageQuota({ pollDuringUpload = false } = {}) {
    return useQuery({
        queryKey: QK.storage.quota(),
        queryFn:  getStorageQuota,
        staleTime: 10_000,
        gcTime:    60_000,
        refetchOnWindowFocus: false,
        refetchInterval: pollDuringUpload ? 10_000 : false,
    });
}

export function useOptimisticQuotaUpdate() {
    const qc = useQueryClient();
    return (deltaBytes) => {
        qc.setQueryData(QK.storage.quota(), (prev) => {
            if (!prev || prev.isUnlimited) return prev;
            const usedBytes = Math.max(0, (prev.usedBytes || 0) + deltaBytes);
            const usedMB    = Math.round((usedBytes / (1024 * 1024)) * 100) / 100;
            const maxMB     = prev.maxStorageMB;
            return {
                ...prev,
                usedBytes,
                usedMB,
                remainingMB: Math.max(0, Math.round((maxMB - usedMB) * 100) / 100),
                percentUsed: Math.min(100, Math.round((usedMB / maxMB) * 10000) / 100),
            };
        });
    };
}

// ─── 2. useImagePool ─────────────────────────────────────────────────────────

export function useImagePool(caseId, recordSetId, filter = 'unassigned') {
    return useQuery({
        queryKey: QK.orthodontics.pool(caseId, recordSetId, filter),
        queryFn: async () => {
            const res = await caseApi.listImagePool(caseId, recordSetId, filter);
            return res.data?.data || { pool: [], total: 0, unassigned: 0 };
        },
        enabled: !!caseId && !!recordSetId,
        // §3.4 — cache must not outlive the signed-URL TTL (300s backend default).
        // staleTime 30s → gcTime 5min, and refetchOnWindowFocus brings tabs back
        // from sleep with a guaranteed fresh URL set.
        staleTime: 30_000,
        gcTime:    5 * 60_000,
        refetchOnWindowFocus: true,
    });
}

// ─── 3. useBulkUploadPhotos ──────────────────────────────────────────────────

export function useBulkUploadPhotos(caseId, recordSetId) {
    const qc = useQueryClient();
    const optimisticQuota = useOptimisticQuotaUpdate();

    return useMutation({
        mutationFn: async ({ files, onFileProgress, onUploadProgress }) => {
            if (!recordSetId) {
                throw new Error('recordSetId is required for bulk upload');
            }
            if (!Array.isArray(files) || files.length === 0) {
                throw new Error('No files selected');
            }
            if (files.length > 30) {
                throw new Error('Maximum 30 files per batch');
            }

            // 1. Compress on client (web worker, pLimit=3)
            const compressed = await compressImages(files, {
                onProgress: onFileProgress,
            });

            // 2. Pre-upload quota validation (advisory)
            const batchBytes = totalBytes(compressed);
            const quota = qc.getQueryData(QK.storage.quota());
            if (quota && !quota.isUnlimited && quota.remainingMB != null) {
                const remainingBytes = quota.remainingMB * 1024 * 1024;
                if (batchBytes > remainingBytes) {
                    const err = new Error(
                        `Batch size (${(batchBytes / 1024 / 1024).toFixed(1)} MB) ` +
                        `exceeds remaining storage (${quota.remainingMB} MB)`
                    );
                    err.code = 'STORAGE_QUOTA_EXCEEDED_CLIENT';
                    throw err;
                }
            }

            // 3. Upload (recordset-scoped endpoint)
            const filesToSend = compressed.map((r) => r.file);
            const meta = buildMetaPayload(compressed);
            const res = await caseApi.bulkUploadPhotos(
                caseId,
                recordSetId,
                filesToSend,
                meta,
                onUploadProgress
            );

            // 4. Optimistic quota decrement
            optimisticQuota(batchBytes);

            return res.data?.data;
        },
        onError: (err) => {
            const status = err?.response?.status;
            const code   = err?.response?.data?.error?.code || err?.code;
            if (status === 409 && (code === 'POOL_FULL' || code === 'POOL_SLOTS_EXCEEDED')) {
                err.userMessage =
                    'Image pool is full (200 items). Delete or assign unused photos before uploading more.';
            }
        },
        onSuccess: (data) => {
            if (data?.quota) {
                qc.setQueryData(QK.storage.quota(), data.quota);
            }
            qc.invalidateQueries({
                queryKey: QK.orthodontics.poolAll(caseId, recordSetId),
            });
            qc.invalidateQueries({ queryKey: QK.orthodontics.detail(caseId) });
        },
    });
}

// ─── 4. useAssignPoolImage ───────────────────────────────────────────────────

export function useAssignPoolImage(caseId, recordSetId) {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async ({ photoId, view }) => {
            if (!recordSetId) {
                throw new Error('recordSetId is required for assignment');
            }
            const res = await caseApi.assignPoolImage(caseId, recordSetId, photoId, view);
            return res.data?.data;
        },
        onSuccess: (data) => {
            if (data?.quota) {
                qc.setQueryData(QK.storage.quota(), data.quota);
            }
            qc.invalidateQueries({
                queryKey: QK.orthodontics.poolAll(caseId, recordSetId),
            });
            qc.invalidateQueries({ queryKey: QK.orthodontics.detail(caseId) });
        },
    });
}

// ─── 5. useUnassignPoolImage ─────────────────────────────────────────────────

export function useUnassignPoolImage(caseId, recordSetId) {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async ({ photoId }) => {
            if (!recordSetId) {
                throw new Error('recordSetId is required for unassign');
            }
            const res = await caseApi.unassignPoolImage(caseId, recordSetId, photoId);
            return res.data?.data;
        },
        onSuccess: () => {
            qc.invalidateQueries({
                queryKey: QK.orthodontics.poolAll(caseId, recordSetId),
            });
            qc.invalidateQueries({ queryKey: QK.orthodontics.detail(caseId) });
        },
    });
}

// ─── 6. useDeletePoolImage ───────────────────────────────────────────────────

export function useDeletePoolImage(caseId, recordSetId) {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async ({ photoId }) => {
            if (!recordSetId) {
                throw new Error('recordSetId is required for delete');
            }
            const res = await caseApi.deletePoolImage(caseId, recordSetId, photoId);
            return res.data?.data;
        },
        onSuccess: (data) => {
            if (data?.quota) {
                qc.setQueryData(QK.storage.quota(), data.quota);
            }
            qc.invalidateQueries({
                queryKey: QK.orthodontics.poolAll(caseId, recordSetId),
            });
        },
    });
}
