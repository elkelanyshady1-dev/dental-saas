/**
 * useWorkflowPatchQueue.ts
 * ═══════════════════════════════════════════════════════════════
 * Enterprise autosave queue hook (Phase 3.3).
 *
 * ARCHITECTURE:
 *   - Queue-backed: changes are enqueued, not fired directly.
 *   - Coalescing:   rapid enqueue calls merge into a single job
 *                   (latest-wins within a 50ms coalesce window).
 *   - Retry-safe:   API errors pause the queue and retry next cycle.
 *   - Conflict-aware: 409 triggers a fresh GET then re-enqueues with
 *                     the server's canonical version.
 *   - Offline-tolerant: saves to localStorage when offline.
 *   - Non-reentrant: only one save in-flight at a time.
 *
 * QUEUE SEMANTICS:
 *   Only the LATEST job matters — intermediate states are irrelevant.
 *   The queue holds at most 1 item: the pending delta to save.
 *   If a new delta arrives while saving, it replaces the pending item.
 *   This is "last-write-wins" coalescing — safe for a single-user context.
 *
 *   Multi-user collaboration would need a different strategy (OT/CRDT).
 *   For now, single-user with conflict recovery on 409 is sufficient.
 *
 * ERROR STRATEGY:
 *   - Network error (5xx, timeout):  → pause, retry on next enqueue
 *   - Version conflict (409):        → fetch fresh version, re-enqueue
 *   - Any other 4xx:                 → log & discard (programmer error)
 * ═══════════════════════════════════════════════════════════════
 */

import { useRef, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PatchJob {
  /** Sparse changes to apply (only changed fields) */
  changes: Record<string, unknown>;
  /** Client's last-known server version for optimistic concurrency */
  expectedVersion: number;
}

export interface SaveResult {
  /** New server version after successful save */
  version: number;
  /** ID of the snapshot created (if any) */
  snapshotId?: string | null;
}

export interface QueueHookOptions {
  /**
   * Called when a save succeeds.
   * Use this to sync workflowVersionRef and saveStatus UI.
   */
  onSuccess?: (result: SaveResult) => void;

  /**
   * Called when a save fails with a non-retryable error.
   */
  onError?: (err: unknown) => void;

  /**
   * Called when a 409 conflict is detected.
   * The hook will auto-recover, but you can use this for analytics.
   */
  onConflict?: (serverVersion: number) => void;

  /**
   * Called to fetch the latest workflow state from server.
   * Required for conflict recovery.
   * Return: { workflowVersion, workflowData }
   */
  fetchFresh?: () => Promise<{ workflowVersion: number; workflowData: Record<string, unknown> }>;

  /**
   * localStorage key for offline queue persistence.
   * Default: 'wf_queue_pending'
   */
  offlineStorageKey?: string;
}

/**
 * PatchFn — the actual PATCH API call.
 * Receives a job, must resolve with SaveResult on success,
 * or reject with an error (including err.response.status for HTTP errors).
 */
export type PatchFn = (job: PatchJob) => Promise<SaveResult>;

// ── Constants ─────────────────────────────────────────────────────────────────

/** Coalesce window: multiple enqueues within this period → single job */
const COALESCE_MS = 50;

/** Max retries for retryable errors before giving up */
const MAX_RETRIES = 3;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWorkflowPatchQueue(
  patchFn: PatchFn,
  options: QueueHookOptions = {}
) {
  const {
    onSuccess,
    onError,
    onConflict,
    fetchFresh,
    offlineStorageKey = 'wf_queue_pending',
  } = options;

  // ── Internal state (all refs — no re-renders inside this hook) ──
  /** The job currently pending to be sent */
  const pendingJobRef = useRef<PatchJob | null>(null);
  /** Whether a save is currently in-flight */
  const processingRef = useRef(false);
  /** Retry counter for the current job */
  const retryCountRef = useRef(0);
  /** Coalesce timer */
  const coalesceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Core: process the pending job ─────────────────────────────────────────

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;      // already running
    if (!pendingJobRef.current) return;     // nothing to do

    // ── Offline check ───────────────────────────────────────────────────────
    if (!navigator.onLine) {
      try {
        localStorage.setItem(offlineStorageKey, JSON.stringify(pendingJobRef.current));
      } catch {
        // localStorage may be full or unavailable — ignore
      }
      return; // will retry when back online
    }

    processingRef.current = true;
    const job = pendingJobRef.current;

    try {
      const result = await patchFn(job);

      // ── SUCCESS ────────────────────────────────────────────────────────────
      pendingJobRef.current = null; // clear only on success
      retryCountRef.current = 0;

      // Clear any offline-persisted queue (successfully saved)
      try { localStorage.removeItem(offlineStorageKey); } catch { /* ignore */ }

      onSuccess?.(result);

    } catch (err: any) {
      const status = err?.response?.status;
      const errCode = err?.response?.data?.error?.code;

      if (status === 403 || errCode === 'PERMISSION_DENIED') {
        // ── RBAC DENY ────────────────────────────────────────────────
        // Not retryable — user lacks permission. Discard and surface.
        console.warn('[PatchQueue] 403 Permission Denied — autosave blocked by RBAC');
        pendingJobRef.current = null;
        retryCountRef.current = 0;
        onError?.(err);
        // Import toast dynamically to avoid circular deps — show user-friendly message
        import('sonner').then(({ toast }) => {
          toast.error("You don't have permission to save changes. Contact your organization admin.", { duration: 10000 });
        });

      } else if (status === 409) {
        // ── VERSION CONFLICT ────────────────────────────────────────────────
        const serverVersion = err?.response?.data?.error?.currentVersion
          ?? err?.response?.data?.currentVersion;

        onConflict?.(serverVersion);

        // Auto-recovery: fetch fresh state, re-enqueue with server's version
        if (fetchFresh && typeof serverVersion === 'number') {
          try {
            const { workflowVersion } = await fetchFresh();
            // Merge server version into pending job and retry
            pendingJobRef.current = {
              ...job,
              expectedVersion: workflowVersion,
            };
            retryCountRef.current = 0; // fresh start after conflict resolution
          } catch (fetchErr) {
            // If we can't even fetch fresh data, discard and report error
            pendingJobRef.current = null;
            onError?.(fetchErr);
          }
        } else {
          // No fetchFresh provided — discard job, report conflict
          pendingJobRef.current = null;
          onError?.(err);
        }

      } else if (status && status >= 400 && status < 500) {
        // ── CLIENT ERROR (4xx except 409) ───────────────────────────────────
        // Not retryable — programmer error. Discard and report.
        console.error(`[PatchQueue] Non-retryable ${status} error:`, err?.response?.data);
        pendingJobRef.current = null;
        retryCountRef.current = 0;
        onError?.(err);

      } else {
        // ── NETWORK / SERVER ERROR (5xx, timeout, etc.) ─────────────────────
        // Retryable — increment counter. Job stays in queue.
        retryCountRef.current += 1;
        if (retryCountRef.current >= MAX_RETRIES) {
          console.error(`[PatchQueue] Max retries (${MAX_RETRIES}) exceeded. Discarding job.`);
          pendingJobRef.current = null;
          retryCountRef.current = 0;
          onError?.(err);
        } else {
          console.warn(`[PatchQueue] Retry ${retryCountRef.current}/${MAX_RETRIES} after error:`, err?.message);
          // Job stays in pendingJobRef — will retry on next enqueue
        }
      }
    } finally {
      processingRef.current = false;

      // If new items arrived while processing (or conflict recovery added one),
      // schedule another processing cycle
      if (pendingJobRef.current) {
        setTimeout(processQueue, 200); // small delay to avoid tight loop on retries
      }
    }
  }, [patchFn, onSuccess, onError, onConflict, fetchFresh, offlineStorageKey]);

  // ── Public: enqueue a job ──────────────────────────────────────────────────

  const enqueue = useCallback((job: PatchJob) => {
    // COALESCING: if a new job arrives within COALESCE_MS of the last,
    // merge (latest-wins) into a single pending job.
    // This handles the "rapid state changes" case without firing N saves.
    if (coalesceTimerRef.current) {
      clearTimeout(coalesceTimerRef.current);
    }

    // Merge: newer call's changes take priority (latest-wins)
    pendingJobRef.current = {
      changes: {
        ...(pendingJobRef.current?.changes ?? {}),
        ...job.changes,
      },
      expectedVersion: job.expectedVersion, // always use latest known version
    };

    coalesceTimerRef.current = setTimeout(() => {
      processQueue();
    }, COALESCE_MS);
  }, [processQueue]);

  // ── Public: flush immediately (for unmount / manual save) ─────────────────

  const flush = useCallback(async () => {
    if (coalesceTimerRef.current) {
      clearTimeout(coalesceTimerRef.current);
      coalesceTimerRef.current = null;
    }
    if (pendingJobRef.current) {
      await processQueue();
    }
  }, [processQueue]);

  // ── Restore offline queue (call on mount if needed) ────────────────────────

  const restoreOfflineQueue = useCallback(() => {
    try {
      const stored = localStorage.getItem(offlineStorageKey);
      if (stored) {
        const job = JSON.parse(stored) as PatchJob;
        pendingJobRef.current = job;
        localStorage.removeItem(offlineStorageKey);
        processQueue();
      }
    } catch {
      // Corrupted storage — ignore
    }
  }, [offlineStorageKey, processQueue]);

  return {
    /** Enqueue a patch job (coalesced within 50ms window) */
    enqueue,
    /** Flush pending job immediately (use on unmount or manual save) */
    flush,
    /** Restore any offline-persisted job (call on mount if offline support needed) */
    restoreOfflineQueue,
    /** True if a save is currently in-flight */
    get isProcessing() { return processingRef.current; },
    /** True if there's a pending job waiting to be sent */
    get hasPending() { return !!pendingJobRef.current; },
  };
}
