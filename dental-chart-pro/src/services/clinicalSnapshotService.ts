/**
 * clinicalSnapshotService.ts
 * Domain: clinical-snapshots
 * Layer: Frontend > Services
 *
 * Raw API calls to /api/v1/clinical-snapshots.
 * NEVER called directly from components — use hooks/useClinicalSnapshots.ts instead.
 *
 * Auth: passes token from sessionStorage (org plane token storage rule)
 * Response: always returns the `data` field — errors are thrown for React Query to catch.
 */

import { Snapshot } from "../types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000/api/v1";

function getAuthHeaders(): Record<string, string> {
  const token = sessionStorage.getItem("org_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  const json = await res.json();
  if (!res.ok || !json.success) {
    const err = Object.assign(
      new Error(json?.error?.message ?? `HTTP ${res.status}`),
      { code: json?.error?.code ?? "API_ERROR", statusCode: res.status }
    );
    throw err;
  }
  return json.data as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SnapshotListItem {
  id: string;
  caseId: string;
  appointmentId: string;
  phaseId: string | null;
  visitSequenceNumber: number | null;
  createdBy: string | null;
  createdAt: number;
  thumbnail: string | null;
  notesSummary: string;
  procedureCount: number;
  attachmentCount: number;
}

// ── Diagnostic data structures (Phase 3.X) ────────────────────────────────

export interface OPGDiagnosticData {
  type: "OPG";
  radiographicFindings?: {
    condyleSymmetry?:    "symmetric" | "asymmetric" | "";
    sinusStatus?:        "clear" | "opacified" | "";
    boneLevel?:          "normal" | "reduced" | "severe-reduction" | "";
    rootMorphology?:     "normal" | "dilacerated" | "short" | "";
    impactedTeeth?:      string[];
    pathologies?:        string;
  };
  notes?: string;
}

export interface OcclusalDiagnosticData {
  type: "OCCLUSAL";
  archForm?:       "ovoid" | "tapered" | "square" | "";
  gingivalHealth?: "healthy" | "inflamed" | "recession" | "";
  occlusion?: {
    anteriorOverjet?: string;
    anteriorOverbite?: string;
    midlineDeviation?: "none" | "upper" | "lower" | "both" | "";
    crossbite?:        "none" | "anterior" | "posterior" | "";
    molarRelation?:    "class-i" | "class-ii" | "class-iii" | "";
  };
}

export interface MergedDiagnosticData {
  modules: {
    opg?:      OPGDiagnosticData | null;
    occlusal?: OcclusalDiagnosticData | null;
  };
  source: "ANALYSIS_MODULE" | "DIRECT_ENTRY";
}

export interface CreateSnapshotPayload {
  caseId:            string;
  type:              "diagnostic" | "pretreatment" | "treatment" | "post-treatment";
  appointmentId?:    string | null;
  visitDateOverride?: string | null;
  expectedVersion?:  number | null;
  chartState:        Record<string, unknown>;
  phaseId?:          string | null;
  diagnosticData?:   MergedDiagnosticData | Record<string, unknown> | null;
  procedures?:       {
    id:        string;
    type:      string;
    target?:   { toothId?: number; teethIds?: number[]; arch?: "upper" | "lower" };
    details?:  unknown;
    timestamp: number;
  }[];
  notes?: {
    text?:     string;
    tags?:     string[];
    warnings?: string[];
  };
  attachments?: {
    id:            string;
    type:          "photo" | "xray" | "stl" | "document";
    url:           string;
    thumbnailUrl?: string | null;
    fileName?:     string;
    size?:         number;
    uploadedAt?:   number;
    relatedTo?:    { toothId?: number; procedureId?: string };
  }[];
  thumbnail?: string | null;
}

export interface SnapshotListResponse {
  data: SnapshotListItem[];
  meta: { total: number; page: number; limit: number; pages: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// API calls
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createSnapshot
 * POST /api/v1/clinical-snapshots
 * Saves the full dental chart state as an immutable snapshot.
 * Returns the saved snapshot with its DB-assigned ID.
 */
export async function createSnapshot(payload: CreateSnapshotPayload): Promise<Snapshot & { id: string }> {
  const res = await fetch(`${BASE_URL}/clinical-snapshots`, {
    method:  "POST",
    headers: getAuthHeaders(),
    body:    JSON.stringify(payload),
  });
  return handleResponse(res);
}

/**
 * getSnapshotsByCase
 * GET /api/v1/clinical-snapshots?caseId=<id>
 * Returns lightweight list items (no chartState) for SnapshotHistorySidebar.
 */
export async function getSnapshotsByCase(
  caseId: string,
  opts: { appointmentId?: string; page?: number; limit?: number } = {}
): Promise<SnapshotListResponse> {
  const params = new URLSearchParams({ caseId });
  if (opts.appointmentId) params.set("appointmentId", opts.appointmentId);
  if (opts.page)          params.set("page",  String(opts.page));
  if (opts.limit)         params.set("limit", String(opts.limit));

  const res = await fetch(`${BASE_URL}/clinical-snapshots?${params.toString()}`, {
    headers: getAuthHeaders(),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  }
  return { data: json.data, meta: json.meta };
}

/**
 * getPretreatmentVersions
 *
 * Phase 3.X.1 — FIX 2: Active pretreatment version control
 * Fetches the versioned list of pretreatment snapshots for a case.
 * The isActiveVersion flag identifies the canonical baseline for the case.
 *
 * GET /api/v1/clinical-snapshots/pretreatment?caseId=<id>
 */
export interface PretreatmentVersionItem {
  id:              string;
  version:         number;
  isActiveVersion: boolean;
  createdAt:       string;
  createdBy?:      string | null;
  label?:          string | null;
}

export async function getPretreatmentVersions(
  caseId: string
): Promise<PretreatmentVersionItem[]> {
  const params = new URLSearchParams({ caseId });
  const res = await fetch(`${BASE_URL}/clinical-snapshots/pretreatment?${params.toString()}`, {
    method:      "GET",
    credentials: "include",
    headers:     { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err  = Object.assign(
      new Error(body?.error?.message ?? "getPretreatmentVersions failed"),
      { code: body?.error?.code ?? "PRETREATMENT_VERSIONS_ERROR", statusCode: res.status }
    );
    throw err;
  }

  const body = await res.json();
  return body.data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * getDiagnosticSnapshot
 * GET /api/v1/clinical-snapshots/diagnostic?caseId=<id>
 * Returns the singleton diagnostic snapshot for a case (with full diagnosticData).
 * Returns null if none exists (UI shows "Start Diagnosis" mode).
 */
export async function getDiagnosticSnapshot(
  caseId: string
): Promise<{
  snapshotId:    string;
  type:          string;
  snapshotDate:  string;
  chartState?:   Record<string, unknown>;
  diagnosticData?: MergedDiagnosticData | null;
  attachments?:  { id: string; name?: string; url: string; type: string }[];
  notes?:        { text?: string; tags?: string[]; warnings?: string[] };
  thumbnail?:    string | null;
  createdAt:     string;
} | null> {
  const params = new URLSearchParams({ caseId });
  const res = await fetch(`${BASE_URL}/clinical-snapshots/diagnostic?${params.toString()}`, {
    headers: getAuthHeaders(),
  });

  if (res.status === 404) return null;
  return handleResponse(res);
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * getSnapshotById
 * GET /api/v1/clinical-snapshots/:id
 * Returns a single snapshot WITH full chartState — used for restore.
 */
export async function getSnapshotById(snapshotId: string): Promise<Snapshot & { id: string }> {
  const res = await fetch(`${BASE_URL}/clinical-snapshots/${snapshotId}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}
