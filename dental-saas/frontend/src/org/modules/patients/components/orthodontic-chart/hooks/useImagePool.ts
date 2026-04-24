/**
 * useImagePool.ts — React Query hooks for the Image Pool + bulk upload.
 *
 * SERVER STATE LAW: all server data flows through React Query.
 * All mutations invalidate the owning recordSet key on settle so the pool,
 * the case detail, and any workflow view stay consistent.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QK } from '@/lib/query/queryKeys';
import {
  bulkUploadPhotos,
  listPool,
  assignPoolPhoto,
  unassignPoolPhoto,
  deletePoolPhoto,
  type BulkUploadResponse,
  type PoolImageDTO,
} from '../api/case.api';

export interface PoolListResponse {
  pool: PoolImageDTO[];
  recordSetId: string;
  count: number;
}

// ─── Query: list pool ────────────────────────────────────────────────────────

export function useImagePool(
  caseId: string | undefined,
  recordSetId: string | undefined,
  enabled: boolean = true
) {
  return useQuery<PoolListResponse>({
    queryKey:
      caseId && recordSetId
        ? QK.orthodontics.imagePool(caseId, recordSetId)
        : ['orthodontic-cases', 'detail', 'unknown', 'recordSet', 'unknown', 'pool'],
    queryFn: async () => {
      const res = await listPool(caseId!, recordSetId!);
      return (res.data?.data ?? { pool: [], recordSetId: recordSetId!, count: 0 }) as PoolListResponse;
    },
    enabled: Boolean(enabled && caseId && recordSetId),
    staleTime: 30_000,
  });
}

// ─── Mutation: bulk upload ───────────────────────────────────────────────────

interface BulkUploadVars {
  files: File[];
  compressed?: boolean;
  onUploadProgress?: (e: ProgressEvent) => void;
  /**
   * UUID v4 locked for the lifetime of one batch submit. A retry of a partially-
   * completed upload MUST reuse the same key so:
   *   (a) the backend replays the cached response if the server-side batch already
   *       completed but the client never got the response (network partition), and
   *   (b) the fingerprint-dedup layer skips re-uploading files that landed first time.
   * Generated ONCE by BulkPhotoUploadModal in a useRef and never regenerated.
   */
  idempotencyKey?: string;
}

export function useBulkUploadPhotos(caseId: string, recordSetId: string) {
  const qc = useQueryClient();
  return useMutation<BulkUploadResponse, unknown, BulkUploadVars>({
    mutationFn: async ({ files, compressed, onUploadProgress, idempotencyKey }) => {
      const res = await bulkUploadPhotos(caseId, recordSetId, files, {
        compressed,
        onUploadProgress,
        idempotencyKey,
      });
      return res.data?.data as BulkUploadResponse;
    },
    // retry=0 so a failed batch never silently re-fires without our locked key.
    // Retries are user-initiated via the "Retry failed" button, which reuses
    // the same idempotencyKey — safe by construction.
    retry: 0,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK.orthodontics.recordSet(caseId, recordSetId) });
      qc.invalidateQueries({ queryKey: QK.orthodontics.detail(caseId) });
    },
  });
}

// ─── Mutation: assign ────────────────────────────────────────────────────────

export function useAssignPoolPhoto(caseId: string, recordSetId: string) {
  const qc = useQueryClient();
  return useMutation<unknown, unknown, { photoId: string; view: string }>({
    mutationFn: async ({ photoId, view }) => {
      const res = await assignPoolPhoto(caseId, recordSetId, photoId, view);
      return res.data?.data;
    },
    onMutate: async ({ photoId }) => {
      const key = QK.orthodontics.imagePool(caseId, recordSetId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PoolListResponse>(key);
      if (prev) {
        qc.setQueryData<PoolListResponse>(key, {
          ...prev,
          pool: prev.pool.filter((p) => p.id !== photoId),
          count: Math.max(0, prev.count - 1),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      const key = QK.orthodontics.imagePool(caseId, recordSetId);
      const prev = (ctx as { prev?: PoolListResponse } | undefined)?.prev;
      if (prev) qc.setQueryData(key, prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK.orthodontics.recordSet(caseId, recordSetId) });
      qc.invalidateQueries({ queryKey: QK.orthodontics.detail(caseId) });
    },
  });
}

// ─── Mutation: unassign ──────────────────────────────────────────────────────

export function useUnassignPoolPhoto(caseId: string, recordSetId: string) {
  const qc = useQueryClient();
  return useMutation<unknown, unknown, { photoId: string }>({
    mutationFn: async ({ photoId }) => {
      const res = await unassignPoolPhoto(caseId, recordSetId, photoId);
      return res.data?.data;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK.orthodontics.recordSet(caseId, recordSetId) });
      qc.invalidateQueries({ queryKey: QK.orthodontics.detail(caseId) });
    },
  });
}

// ─── Mutation: delete ────────────────────────────────────────────────────────

export function useDeletePoolPhoto(caseId: string, recordSetId: string) {
  const qc = useQueryClient();
  return useMutation<unknown, unknown, { photoId: string }>({
    mutationFn: async ({ photoId }) => {
      const res = await deletePoolPhoto(caseId, recordSetId, photoId);
      return res.data?.data;
    },
    onMutate: async ({ photoId }) => {
      const key = QK.orthodontics.imagePool(caseId, recordSetId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PoolListResponse>(key);
      if (prev) {
        qc.setQueryData<PoolListResponse>(key, {
          ...prev,
          pool: prev.pool.filter((p) => p.id !== photoId),
          count: Math.max(0, prev.count - 1),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      const key = QK.orthodontics.imagePool(caseId, recordSetId);
      const prev = (ctx as { prev?: PoolListResponse } | undefined)?.prev;
      if (prev) qc.setQueryData(key, prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK.orthodontics.recordSet(caseId, recordSetId) });
      qc.invalidateQueries({ queryKey: QK.orthodontics.detail(caseId) });
    },
  });
}
