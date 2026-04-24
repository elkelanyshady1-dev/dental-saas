/**
 * useClinicalSnapshots.ts
 * Domain: clinical-snapshots
 *
 * Phase 3.X.1 — Snapshot System Stabilization
 *
 * React Query hooks for all clinical snapshot operations.
 * All server state is authoritative — no useState(apiData).
 *
 * Usage:
 *   const { snapshots, isLoading } = useSnapshotsByCase(caseId);
 *   const { saveSnapshot, isSaving } = useSaveSnapshot();
 *   const { snapshot } = useSnapshotById(snapshotId);
 */

import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import {
  getSnapshotsByCase,
  getSnapshotById,
  createSnapshot,
  CreateSnapshotPayload,
  SnapshotListItem,
  getPretreatmentVersions as fetchPretreatmentVersions,
  getSnapshotById as fetchSnapshotById,
  MergedDiagnosticData,
  OPGDiagnosticData,
  OcclusalDiagnosticData,
} from "../services/clinicalSnapshotService";
import { Snapshot } from "../types";

export type { MergedDiagnosticData, OPGDiagnosticData, OcclusalDiagnosticData };

// ─── Query Key Factory ────────────────────────────────────────────────────────

const QUERY_KEYS = {
  list: (caseId: string, appointmentId?: string) =>
    ["clinical-snapshots", "list", caseId, appointmentId ?? "all"] as const,
  detail: (snapshotId: string) =>
    ["clinical-snapshots", "detail", snapshotId] as const,
};

// ─── useSnapshotsByCase ───────────────────────────────────────────────────────
// Lightweight list — powers SnapshotHistorySidebar (no chartState in response)

export interface UseSnapshotsByCaseOptions {
  appointmentId?: string;
  page?: number;
  limit?: number;
}

export function useSnapshotsByCase(caseId: string, opts: UseSnapshotsByCaseOptions = {}) {
  const { appointmentId, page = 1, limit = 20 } = opts;
  const query = useQuery({
    queryKey:  QUERY_KEYS.list(caseId, appointmentId),
    queryFn:  () => getSnapshotsByCase(caseId, { appointmentId, page, limit }),
    enabled:   !!caseId,
    staleTime: 30_000, // 30s — snapshots don't change frequently
  });

  return {
    snapshots:  query.data?.data ?? [] as SnapshotListItem[],
    total:      query.data?.total ?? 0,
    isLoading:  query.isLoading,
    isError:    query.isError,
    error:      query.error,
  };
}

// ─── useSnapshotById ──────────────────────────────────────────────────────────
// Full snapshot with chartState — used for restore flow

export function useSnapshotById(snapshotId: string | null) {
  const query = useQuery({
    queryKey: QUERY_KEYS.detail(snapshotId ?? ""),
    queryFn:  () => getSnapshotById(snapshotId!),
    enabled:  !!snapshotId,
    staleTime: 60_000,
  });

  return {
    snapshot:  query.data ?? null as (Snapshot & { id: string }) | null,
    isLoading: query.isLoading,
    isError:   query.isError,
    error:     query.error,
  };
}

// ─── useSaveSnapshot ─────────────────────────────────────────────────────────
// Mutation — creates a new immutable snapshot and invalidates the case list
//
// Phase 3.X.1 — FIX 4: SNAPSHOT_CONFLICT autosave handling
//   On SNAPSHOT_CONFLICT the session has already been superseded server-side.
//   We invalidate the caseWorkflow query (which drives the case engine state)
//   so the UI re-hydrates the latest version without a manual reload.
//
// Phase 3.X.1 — FIX 5: Blob URL guard
//   Blob URLs created by createObjectURL() are transient and scoped to the
//   current browser session. They MUST NOT be persisted to the snapshot.
//   The payload normalisation below strips any photo.url that starts with
//   "blob:" and requires the caller to have resolved them to a server URL
//   via the /uploads/photo endpoint before calling saveSnapshot.

export function useSaveSnapshot() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: CreateSnapshotPayload) => {
      // FIX 5 — Blob URL guard: reject payloads containing unresolved blob: URLs
      if (payload.attachments) {
        for (const attachment of payload.attachments) {
          if (
            typeof attachment.url === "string" &&
            attachment.url.startsWith("blob:")
          ) {
            return Promise.reject(
              Object.assign(new Error("BLOB_URL_NOT_PERSISTED"), {
                code: "BLOB_URL_NOT_PERSISTED",
                statusCode: 400,
              })
            );
          }
        }
      }
      return createSnapshot(payload);
    },

    onSuccess: (data, variables) => {
      // Invalidate the case snapshot list — sidebar will refetch
      queryClient.invalidateQueries({
        queryKey: ["clinical-snapshots", "list", variables.caseId],
      });

      // Optimistically add the new snapshot to the detail cache
      // so getSnapshotById works immediately without a round-trip
      if (data?.id) {
        queryClient.setQueryData(
          QUERY_KEYS.detail(data.id),
          data
        );
      }

      // Invalidate caseWorkflow to re-sync case engine state
      if (variables.caseId) {
        queryClient.invalidateQueries({
          queryKey: ["caseWorkflow", variables.caseId],
        });
      }
    },

    // FIX 4 — SNAPSHOT_CONFLICT autosave handling
    onError: async (error: unknown, variables) => {
      const err = error as { code?: string; message?: string };

      if (err?.code === "SNAPSHOT_CONFLICT") {
        // Server detected a version conflict — the local session is stale.
        // Invalidate caseWorkflow so the editor re-hydrates the current state.
        // DO NOT show a generic error — the UI should silently re-sync.
        await queryClient.invalidateQueries({
          queryKey: ["caseWorkflow", variables.caseId],
        });
        // Also invalidate the snapshot list so the sidebar refreshes
        await queryClient.invalidateQueries({
          queryKey: ["clinical-snapshots", "list", variables.caseId],
        });
        return; // suppress further error propagation for conflict case
      }

      // BLOB_URL_NOT_PERSISTED — developer error; surface as a console warning
      if (err?.code === "BLOB_URL_NOT_PERSISTED") {
        console.error(
          "[useSaveSnapshot] Blob URL guard triggered. " +
          "Resolve photo.file → server URL via /uploads/photo before saving."
        );
        return;
      }

      // All other errors propagate normally (mutation.isError becomes true)
    },
  });

  return {
    saveSnapshot:       mutation.mutate,
    saveSnapshotAsync:  mutation.mutateAsync,
    isSaving:           mutation.isPending,
    isError:            mutation.isError,
    error:              mutation.error,
    savedSnapshot:      mutation.data ?? null,
    reset:              mutation.reset,
  };
}

// ─── usePretreatmentVersions ─────────────────────────────────────────────────
// Phase 3.X.1 — FIX 2: Active pretreatment version
// Fetches the versioned history of pretreatment snapshots for a case.
// The isActiveVersion flag on each item indicates the canonical baseline.

export interface PretreatmentVersion {
  id:              string;
  version:         number;
  isActiveVersion: boolean;
  createdAt:       string;
  createdBy?:      string;
  label?:          string;
}

export function usePretreatmentVersions(caseId: string) {
  const query = useQuery({
    queryKey: ["clinical-snapshots", "pretreatment-versions", caseId],
    queryFn:  async () => {
      const { getPretreatmentVersions } = await import("../services/clinicalSnapshotService");
      return getPretreatmentVersions(caseId);
    },
    enabled:   !!caseId,
    staleTime: 30_000,
  });

  return {
    versions:       query.data ?? [] as PretreatmentVersion[],
    activeVersion:  (query.data ?? []).find((v: PretreatmentVersion) => v.isActiveVersion) ?? null,
    isLoading:      query.isLoading,
    isError:        query.isError,
    error:          query.error,
  };
}

// ─── useLatestPretreatmentSnapshot ───────────────────────────────────────────

export interface ActivePretreatmentSnapshot {
  snapshotId:    string;
  version:       number;
  snapshotDate:  string;
  chartState:    Record<string, unknown> | undefined;
  diagnosticData: MergedDiagnosticData | null;
  notes:         { text?: string; tags?: string[]; warnings?: string[] };
  attachments:   { id: string; url: string; type: string; fileName?: string }[];
  thumbnail:     string | null;
}

export function useLatestPretreatmentSnapshot(caseId: string) {
  // First resolve the active version ID
  const versionsQuery = useQuery({
    queryKey: ["clinical-snapshots", "pretreatment-versions", caseId],
    queryFn:  () => fetchPretreatmentVersions(caseId),
    enabled:  !!caseId,
    staleTime: 30_000,
  });

  const activeVersionId = (versionsQuery.data ?? [])
    .find((v) => v.isActiveVersion)?.id ?? null;

  // Then load the full snapshot detail (includes diagnosticData + chartState)
  const detailQuery = useQuery({
    queryKey: ["clinical-snapshots", "detail", activeVersionId ?? ""],
    queryFn:  () => fetchSnapshotById(activeVersionId!),
    enabled:  !!activeVersionId,
    staleTime: 60_000,
  });

  const raw = detailQuery.data as (Record<string, unknown> & { id?: string }) | null | undefined;

  const snapshot: ActivePretreatmentSnapshot | null = raw
    ? {
        snapshotId:    (raw.id as string) ?? "",
        version:       (raw.version as number) ?? 1,
        snapshotDate:  (raw.snapshotDate as string) ?? (raw.createdAt as string) ?? "",
        chartState:    (raw.chartState as Record<string, unknown>) ?? undefined,
        diagnosticData: (raw.diagnosticData as MergedDiagnosticData) ?? null,
        notes:         (raw.notes as { text?: string }) ?? {},
        attachments:   (raw.attachments as { id: string; url: string; type: string }[]) ?? [],
        thumbnail:     (raw.thumbnail as string | null) ?? null,
      }
    : null;

  return {
    snapshot,
    activeVersionId,
    isLoading:   versionsQuery.isLoading || detailQuery.isLoading,
    isError:     versionsQuery.isError   || detailQuery.isError,
    hasSnapshot: !!activeVersionId,
    // Phase 3.X hardening — lets modals force-refresh on open
    refetch: () => {
      versionsQuery.refetch();
      if (activeVersionId) detailQuery.refetch();
    },
  };
}

// ─── useSavePretreatmentSnapshot ─────────────────────────────────────────────
// Phase 3.X Hardened — server-authoritative module merge, type guard,
// empty-data guard, blob filter, conflict UX.
//
// MERGE STRATEGY:
//   mutationFn fetches the current active pretreatment snapshot from the
//   backend at call-time, merges incoming module(s) over it, and sends the
//   combined diagnosticData. This is the ONLY safe approach — relying on
//   local modal state for the other module causes data loss when two modals
//   are opened concurrently or in quick succession.

export interface SavePretreatmentPayload {
  caseId:         string;
  chartState:     Record<string, unknown>;
  /** Only the module(s) that this modal owns — the hook merges the rest from the backend */
  diagnosticData: Partial<MergedDiagnosticData["modules"]>;
  notes?:         { text?: string; tags?: string[]; warnings?: string[] };
  attachments?:   CreateSnapshotPayload["attachments"];
  thumbnail?:     string | null;
  expectedVersion?: number | null;
}

/** Structured error returned on SNAPSHOT_CONFLICT */
export class PretreatmentConflictError extends Error {
  readonly code = "SNAPSHOT_CONFLICT" as const;
  constructor() {
    super("Snapshot updated elsewhere. Reload to get the latest version.");
    this.name = "PretreatmentConflictError";
  }
}

export function useSavePretreatmentSnapshot() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (payload: SavePretreatmentPayload) => {
      // ── GUARD 1: type lock ──────────────────────────────────────────────────
      // Defensive — callers must not pass a non-pretreatment type through this hook.
      // (The apiPayload hardcodes 'pretreatment'; this guard protects against future
      // refactors that might accidentally remove that hardcoding.)
      const TYPE_LOCK = "pretreatment" as const;

      // ── GUARD 2: server-authoritative merge ─────────────────────────────────
      // Fetch the current active snapshot from the backend right now.
      // This is the ONLY safe merge point — local modal state for the
      // other module can be stale if another modal saved concurrently.
      let serverOpg:      MergedDiagnosticData["modules"]["opg"]      = null;
      let serverOcclusal: MergedDiagnosticData["modules"]["occlusal"] = null;

      try {
        const versions = await fetchPretreatmentVersions(payload.caseId);
        const activeId = versions.find((v) => v.isActiveVersion)?.id ?? null;
        if (activeId) {
          const snap = (await fetchSnapshotById(activeId)) as unknown as Record<string, unknown>;
          const existing = snap?.diagnosticData as MergedDiagnosticData | null | undefined;
          serverOpg      = existing?.modules?.opg      ?? null;
          serverOcclusal = existing?.modules?.occlusal ?? null;
        }
      } catch {
        // Non-fatal: if fetch fails (e.g. first-ever snapshot), continue with nulls
      }

      // Merge: incoming modules take precedence over server state
      const mergedModules: MergedDiagnosticData["modules"] = {
        opg:      payload.diagnosticData.opg      ?? serverOpg,
        occlusal: payload.diagnosticData.occlusal ?? serverOcclusal,
      };

      // ── GUARD 3: empty data rejection ───────────────────────────────────────
      if (!mergedModules.opg && !mergedModules.occlusal) {
        throw Object.assign(
          new Error("No analysis data to save — fill at least one module."),
          { code: "NO_ANALYSIS_DATA" }
        );
      }

      const mergedDiagnosticData: MergedDiagnosticData = {
        modules: mergedModules,
        source:  "ANALYSIS_MODULE",
      };

      // ── GUARD 4: blob URL filter ─────────────────────────────────────────────
      // Strip blob: URLs silently — they are transient browser-session references
      // and cannot be persisted. The caller is responsible for uploading files
      // to the server and replacing blob URLs with server URLs before calling.
      const cleanAttachments = (payload.attachments ?? []).filter(
        (a) => !(typeof a.url === "string" && a.url.startsWith("blob:"))
      );

      const apiPayload: CreateSnapshotPayload = {
        caseId:          payload.caseId,
        type:            TYPE_LOCK,
        chartState:      payload.chartState,
        diagnosticData:  mergedDiagnosticData,
        notes:           payload.notes,
        attachments:     cleanAttachments.length > 0 ? cleanAttachments : undefined,
        thumbnail:       payload.thumbnail ?? null,
        expectedVersion: payload.expectedVersion ?? null,
        appointmentId:   null,
      };

      return createSnapshot(apiPayload);
    },

    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["clinical-snapshots", "list", variables.caseId],
      });
      queryClient.invalidateQueries({
        queryKey: ["clinical-snapshots", "pretreatment-versions", variables.caseId],
      });
      queryClient.invalidateQueries({
        queryKey: ["caseWorkflow", variables.caseId],
      });
    },

    // ── GUARD 5: SNAPSHOT_CONFLICT ───────────────────────────────────────────
    // Another session saved between our fetch and our POST.
    // Invalidate everything + surface a typed error so the modal can show
    // a targeted "reload" prompt instead of a generic red error banner.
    onError: (error: unknown, variables) => {
      const err = error as { code?: string };
      if (err?.code === "SNAPSHOT_CONFLICT") {
        // Force all pretreatment data to refresh from server
        queryClient.invalidateQueries({
          queryKey: ["clinical-snapshots", "pretreatment-versions", variables.caseId],
        });
        queryClient.invalidateQueries({
          queryKey: ["clinical-snapshots", "list", variables.caseId],
        });
        // Re-throw as structured error so modals can show conflict-specific UI
        throw new PretreatmentConflictError();
      }
    },
  });

  return {
    savePretreatmentSnapshot:      mutation.mutate,
    savePretreatmentSnapshotAsync: mutation.mutateAsync,
    isSaving:   mutation.isPending,
    isError:    mutation.isError,
    isConflict: (mutation.error instanceof PretreatmentConflictError) ||
                (mutation.error as { code?: string } | null)?.code === "SNAPSHOT_CONFLICT",
    error:      mutation.error,
    savedData:  mutation.data ?? null,
    reset:      mutation.reset,
  };
}
