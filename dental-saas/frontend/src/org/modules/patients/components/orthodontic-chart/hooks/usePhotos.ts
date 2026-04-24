/**
 * usePhotos.ts — Photo SSOT React Query hooks (Phase 1)
 *
 * Replaces the recordSet-scoped useImagePool for the new case-level
 * photo pool. The backend resolves signedUrl at read time; the client
 * NEVER touches storageKey.
 *
 * SERVER STATE LAW:
 *   ✅ useQuery / useMutation
 *   ✅ centralized query keys (QK.orthodontics.photos / .photo)
 *   ❌ useState(apiData)
 *   ❌ refetch()
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QK } from '@/lib/query/queryKeys';
import api from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

// Phase 2 — Unified Case Assets.
// `PhotoType` is the clinical/user tag. `FileType` is the rendering class
// used by the UI to pick the correct viewer (img vs iframe vs icon).
export type PhotoType =
  | 'intraoral' | 'extraoral' | 'xray' | 'scan'
  | 'document'  | 'stl'       | 'dicom';

export type FileType = 'image' | 'pdf' | '3d' | 'dicom';

export interface PhotoProvenance {
  sourceRecordSetId: string | null;
  linkedAt: string | null;
  linkedBy: string | null;
}

/**
 * Structured origin pointer for derived assets. Set by the DICOM viewer
 * when a PNG is exported back into the case pool. Replaces the old
 * free-text tag convention (`tags: ["dicom-export", "from:<id>"]`) so
 * downstream queries can join on origin without string parsing.
 */
export interface AssetSource {
  type: 'dicom' | 'stl' | 'pdf' | 'upload';
  originalPhotoId?: string;
}

/**
 * Backend async-processing view. Populated by the thumbnail / DICOM
 * workers after upload completes. Optional — legacy rows and assets
 * awaiting their turn in the queue have no values here.
 */
export type ProcessingStatus = 'pending' | 'processing' | 'done' | 'failed' | 'skipped' | null;

export interface DicomMetadata {
  modality:     string | null;
  width:        number | null;
  height:       number | null;
  windowCenter: number | null;
  windowWidth:  number | null;
}

export interface PhotoDTO {
  id: string;
  caseId: string;
  signedUrl: string | null;
  /**
   * Top-level rendering class — image / pdf / 3d / dicom.
   *
   * Nullable because the DTO deliberately does NOT default this field when
   * the underlying doc is missing it (legacy data / broken migration).
   * Consumers MUST guard against null — see `strictlyFilteredAssets` in
   * CasePhotosPanel.tsx and the missing-fileType banner in AssetCard.tsx.
   * Ops fixes the data via the backfill migration; the UI never guesses.
   */
  fileType: FileType | null;
  mimeType: string | null;
  fileName: string | null;
  metadata: {
    type: PhotoType;
    fileType?: FileType;
    orientation: string | null;
    tags: string[];
    originalName: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    source?: AssetSource;
  };
  uploadedAt: string | null;
  uploadedBy: string | null;
  linkedRecordSetIds: string[];
  linkedVisitIds: string[];
  provenance: PhotoProvenance[];
  // U-CAP §2 — async-processing fields. `thumbnailSignedUrl` is a
  // short-lived URL for the 512-px preview; the grid prefers it over
  // the full signed URL to cut bandwidth on large DICOM/STL sets.
  thumbnailSignedUrl: string | null;
  processingStatus:   ProcessingStatus;
  processingProgress: number;            // 0–100
  processingError:    string | null;
  retryCount:         number;
  dicomMetadata:      DicomMetadata | null;
}

export interface PhotoUploadInput {
  file: File;
  metadata: {
    type: PhotoType;
    fileType?: FileType;
    orientation?: string;
    tags?: string[];
    source?: AssetSource;
  };
  /** 0–100 upload progress callback. Fires on axios onUploadProgress. */
  onUploadProgress?: (pct: number) => void;
}

// ── API layer ─────────────────────────────────────────────────────────────────
// All calls flow through the project's axios instance (`@/services/api`)
// so the JWT interceptor attaches Authorization headers. Native fetch was
// the source of the 401 — it never picked up the token.

const BASE = '/org/orthodontic-cases';

async function listCasePhotos(caseId: string): Promise<PhotoDTO[]> {
  const res = await api.get(`${BASE}/${caseId}/photos`);

  // §3 — fail loud on invalid shape instead of silently coercing to [].
  // A malformed response now surfaces as a React Query error (rendering the
  // error pane in CasePhotosPanel), not an indistinguishable empty-state.
  if (!res || !Array.isArray(res.data?.data)) {
    // eslint-disable-next-line no-console
    console.error('[useCasePhotos] INVALID_RESPONSE', {
      caseId,
      responseKeys: res?.data && typeof res.data === 'object' ? Object.keys(res.data) : null,
    });
    throw new Error('Invalid photos response — server did not return { data: [] }');
  }

  const photos = res.data.data as PhotoDTO[];

  // Dev-only warnings for the "empty case" and "missing fileType" scenarios.
  // Empty is a valid state (no uploads yet), not an error — surfaced here so
  // devs don't mistake it for a broken endpoint during local debugging.
  if (process.env.NODE_ENV !== 'production') {
    if (photos.length === 0) {
      // eslint-disable-next-line no-console
      console.warn('[useCasePhotos] EMPTY_CASE', { caseId });
    }
    const missingFileType = photos.filter((p) => !p.fileType);
    if (missingFileType.length > 0) {
      // eslint-disable-next-line no-console
      console.warn('[useCasePhotos] PHOTOS_WITHOUT_FILETYPE', {
        caseId,
        count: missingFileType.length,
        ids: missingFileType.map((p) => p.id),
      });
    }
  }

  return photos;
}

async function uploadPhoto(
  caseId: string,
  input: PhotoUploadInput,
  onUploadProgress?: (pct: number) => void,
): Promise<PhotoDTO> {
  const fd = new FormData();
  fd.append('file', input.file);
  fd.append('metadata', JSON.stringify(input.metadata));
  const res = await api.post(`${BASE}/${caseId}/photos`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e: ProgressEvent) => {
      if (!onUploadProgress || !e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      onUploadProgress(Math.max(0, Math.min(100, pct)));
    },
  });
  return res.data?.data as PhotoDTO;
}

async function linkPhotoToRecordSet(caseId: string, photoId: string, recordSetId: string) {
  const res = await api.post(`${BASE}/${caseId}/photos/${photoId}/link-recordset`, {
    recordSetId,
  });
  return res.data?.data as PhotoDTO;
}

async function linkPhotoToVisit(caseId: string, photoId: string, visitId: string) {
  const res = await api.post(`${BASE}/${caseId}/photos/${photoId}/link-visit`, {
    visitId,
  });
  return res.data?.data as PhotoDTO;
}

async function deletePhoto(caseId: string, photoId: string) {
  const res = await api.delete(`${BASE}/${caseId}/photos/${photoId}`);
  return res.data?.data as { id: string; deletedAt: string };
}

async function retryProcessing(caseId: string, photoId: string) {
  const res = await api.post(`${BASE}/${caseId}/photos/${photoId}/retry-processing`, {});
  return res.data?.data as { id: string; queued: boolean };
}

// ── Query ─────────────────────────────────────────────────────────────────────

/**
 * useCasePhotos — the logical Case Pool.
 * Returns ALL non-deleted photos for a case. The caller filters client-side
 * by linkedRecordSetIds / linkedVisitIds to derive recordSet/visit pools.
 */
export function useCasePhotos(caseId: string | undefined) {
  return useQuery<PhotoDTO[]>({
    queryKey: caseId ? QK.orthodontics.photos(caseId) : ['photos', 'noop'],
    queryFn:  () => listCasePhotos(caseId as string),
    enabled:  !!caseId && /^[a-f\d]{24}$/i.test(caseId),
    // signedUrl cache on backend ~55s. Stay under it.
    staleTime: 50_000,
    // Background refresh keeps signed URLs valid during long sessions.
    // Without this, an idle tab would render expired URLs after the
    // backend signed-URL TTL elapses.
    refetchInterval: 50_000,
    // Don't poll while the tab is hidden — saves bandwidth and respects
    // browser throttling. Resumes on visibility.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useUploadPhoto(caseId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PhotoUploadInput) =>
      uploadPhoto(caseId as string, input, input.onUploadProgress),
    onSuccess: () => {
      if (!caseId) return;
      qc.invalidateQueries({ queryKey: QK.orthodontics.photos(caseId) });
    },
  });
}

export function useLinkPhotoToRecordSet(caseId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { photoId: string; recordSetId: string }) =>
      linkPhotoToRecordSet(caseId as string, vars.photoId, vars.recordSetId),
    onSuccess: (_data, vars) => {
      if (!caseId) return;
      qc.invalidateQueries({ queryKey: QK.orthodontics.photos(caseId) });
      qc.invalidateQueries({ queryKey: QK.orthodontics.recordSet(caseId, vars.recordSetId) });
    },
  });
}

export function useLinkPhotoToVisit(caseId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { photoId: string; visitId: string }) =>
      linkPhotoToVisit(caseId as string, vars.photoId, vars.visitId),
    onSuccess: () => {
      if (!caseId) return;
      qc.invalidateQueries({ queryKey: QK.orthodontics.photos(caseId) });
    },
  });
}

export function useDeletePhoto(caseId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) => deletePhoto(caseId as string, photoId),
    onSuccess: () => {
      if (!caseId) return;
      qc.invalidateQueries({ queryKey: QK.orthodontics.photos(caseId) });
    },
  });
}

/**
 * useRetryAssetProcessing — user-triggered retry for a failed thumbnail /
 * DICOM job. The backend resets retryCount + status + re-enqueues via
 * the self-worker. We invalidate the photos list immediately so the
 * pending skeleton shows up until the worker finishes.
 */
export function useRetryAssetProcessing(caseId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) => retryProcessing(caseId as string, photoId),
    onSuccess: () => {
      if (!caseId) return;
      qc.invalidateQueries({ queryKey: QK.orthodontics.photos(caseId) });
    },
  });
}

// ── Case Bundle Export (U-CAP §5) ─────────────────────────────────────────────

export interface CaseExportInput {
  /** Optional subset — omit / empty array → full case export. */
  assetIds?: string[];
  /** Toggle manifest.json inside the zip (default true). */
  includeManifest?: boolean;
}

/**
 * useCaseExport — POST /org/orthodontic-cases/:caseId/export.
 * The server streams an application/zip response; we pull the Blob
 * and trigger a browser download without holding the file in memory
 * longer than necessary.
 *
 * NOT a server-state query — nothing to invalidate. The mutation just
 * wraps the network call + download dance so callers can disable their
 * "Export" button while `isPending` is true.
 */
export function useCaseExport(caseId: string | undefined) {
  return useMutation({
    mutationFn: async (input: CaseExportInput = {}) => {
      if (!caseId) throw new Error("caseId is required");
      const res = await api.post(
        `${BASE}/${caseId}/export`,
        {
          assetIds:        input.assetIds ?? [],
          includeManifest: input.includeManifest !== false,
        },
        { responseType: "blob" },
      );

      const blob: Blob = res.data instanceof Blob
        ? res.data
        : new Blob([res.data], { type: "application/zip" });

      const url = URL.createObjectURL(blob);
      try {
        const filename = _filenameFrom(res.headers?.["content-disposition"]) ??
          `case-${caseId}-${new Date().toISOString().slice(0, 10)}.zip`;
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        // Revoke asynchronously so the browser has time to start the download.
        setTimeout(() => URL.revokeObjectURL(url), 2_000);
      }

      return { bytes: blob.size };
    },
  });
}

function _filenameFrom(disposition: unknown): string | null {
  if (typeof disposition !== "string") return null;
  const m = /filename="?([^";]+)"?/i.exec(disposition);
  return m?.[1] ?? null;
}

// ── Retry Dashboard (Part 3) ──────────────────────────────────────────────────

export interface FailedAssetRow {
  id:                 string;
  caseId:             string | null;
  fileType:           FileType | null;
  mimeType:           string | null;
  fileName:           string | null;
  processingStatus:   ProcessingStatus;
  processingProgress: number;
  processingError:    string | null;
  retryCount:         number;
  uploadedAt:         string | null;
}

export type RetryDashboardFilter = Array<'pending' | 'processing' | 'failed'>;

/**
 * useFailedAssets — org-wide feed for the Retry Dashboard. Defaults to
 * the stuck-bucket (pending + processing + failed). Short staleTime so
 * admins see freshly-failed rows; the list caps at 500 server-side.
 */
export function useFailedAssets(statuses?: RetryDashboardFilter) {
  return useQuery<FailedAssetRow[]>({
    queryKey: ["asset-recovery", "list", statuses?.join(",") ?? "all"],
    queryFn: async () => {
      const params = statuses?.length ? { status: statuses.join(",") } : undefined;
      const res = await api.get("/org/orthodontic-cases/failed-assets", { params });
      return (res.data?.data ?? []) as FailedAssetRow[];
    },
    staleTime: 5_000,
    refetchInterval: 15_000,      // refresh while the dashboard is open
    refetchOnWindowFocus: true,
  });
}

/**
 * useRetryAllFailed — org-wide batch retry. Backend resets state +
 * re-enqueues via assetJob.service.enqueueAssetJobs.
 */
export function useRetryAllFailed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post("/org/orthodontic-cases/retry-all-failed");
      return res.data?.data as {
        requeued: number;
        skipped:  number;
        failed:   number;
        total:    number;
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asset-recovery"] });
    },
  });
}

/**
 * useRetrySingleAsset — same as the case-scoped retry hook, but for the
 * dashboard where we have the caseId embedded in each row.
 */
export function useRetrySingleAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { caseId: string; photoId: string }) =>
      retryProcessing(vars.caseId, vars.photoId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asset-recovery"] });
    },
  });
}

// ── Observability metrics ────────────────────────────────────────────────────

export interface AssetMetricsActivity {
  at:        string;
  type:      string;
  caseId?:   string | null;
  photoId?:  string | null;
  jobType?:  string | null;
  bytes?:    number | null;
  count?:    number | null;
  durationMs?: number | null;
  error?:    string | null;
}

export interface AssetMetricsSnapshot {
  bootAt:   string;
  counters: Record<string, number>;
  computed: {
    active_jobs:         number;
    avg_processing_time: number | null;
  };
  activity: AssetMetricsActivity[];
}

/**
 * useAssetMetrics — polls the /asset-metrics snapshot for the admin
 * observability dashboard. Shorter interval (5 s) than the panel's
 * asset list since the dashboard is explicitly about freshness.
 */
export function useAssetMetrics() {
  return useQuery<AssetMetricsSnapshot>({
    queryKey: ["asset-metrics"],
    queryFn: async () => {
      const res = await api.get("/org/orthodontic-cases/asset-metrics");
      return res.data?.data as AssetMetricsSnapshot;
    },
    staleTime: 2_000,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });
}
