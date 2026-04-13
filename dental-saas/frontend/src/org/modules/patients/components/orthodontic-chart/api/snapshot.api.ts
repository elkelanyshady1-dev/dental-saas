/**
 * snapshot.api.ts
 * Domain: clinical-snapshots
 * Layer: Frontend > API
 *
 * All snapshot API calls go through this module.
 * Follows the same pattern as bonding.api.ts (see useBonding.ts).
 *
 * BASE URL: /api/v1/clinical-snapshots (mounted via featureRegistry)
 */

import api from '@/services/api';
import type { Snapshot } from '../types';

// ── Response shape from backend DTO ──────────────────────────────────────────

export type VisitType = 'bonding' | 'adjustment' | 'wire_change' | 'debonding';

export interface SnapshotListItem {
  id: string;
  caseId: string;
  name: string;
  type: Snapshot['type'];
  visitType: VisitType;
  snapshotDate: string;
  version: number;
  isDeleted: boolean;
  appointmentId: string | null;
  phaseId: string | null;
  visitSequenceNumber: number | null;
  createdBy: string | null;
  createdAt: number;
  thumbnail: string | null;
  notesSummary: string;
  procedureCount: number;
  attachmentCount: number;
}

export interface SnapshotListResponse {
  success: boolean;
  data: SnapshotListItem[];
  meta: { total: number; page: number; limit: number; pages: number };
}

export interface SnapshotFullResponse {
  success: boolean;
  data: SnapshotDTO;
}

/** Full snapshot DTO — includes chartState */
export interface SnapshotDTO {
  id: string;
  caseId: string;
  organizationId: string;
  name: string;
  type: Snapshot['type'];
  visitType: VisitType;
  snapshotDate: string;
  version: number;
  isDeleted: boolean;
  appointmentId: string | null;
  phaseId: string | null;
  visitSequenceNumber: number | null;
  createdBy: string | null;
  createdAt: number;
  chartState: Snapshot['chartState'];
  procedures: unknown[];
  notes: { text: string; tags: string[]; warnings: string[] };
  attachments: unknown[];
  thumbnail: string | null;
  diagnosticData: unknown | null;
}

export interface CreateSnapshotPayload {
  caseId: string;
  type: NonNullable<Snapshot['type']>;
  chartState: Snapshot['chartState'];
  name?: string;
  visitType?: VisitType;
  /** Phase 6C: active visit session — required for treatment/post-treatment types */
  visitId?: string | null;
  appointmentId?: string | null;
  visitDateOverride?: string | null;
  notes?: { text?: string; tags?: string[]; warnings?: string[] };
  thumbnail?: string | null;
  expectedVersion?: number | null;
}

export interface UpdateSnapshotPayload {
  name?: string;
  appointmentId?: string | null;
  visitType?: VisitType;
}

// ── API functions ─────────────────────────────────────────────────────────────

const BASE = '/org/clinical-snapshots';

/** GET /clinical-snapshots?caseId= — list without chartState */
export async function listSnapshotsByCase(
  caseId: string,
  opts?: { type?: string; page?: number; limit?: number }
): Promise<SnapshotListResponse['data']> {
  const params = new URLSearchParams({ caseId });
  if (opts?.type)  params.set('type',  opts.type);
  if (opts?.page)  params.set('page',  String(opts.page));
  if (opts?.limit) params.set('limit', String(opts.limit));
  // silent: true — suppresses the global "Resource not found." toast.
  // A 404 here means no snapshots exist yet (new case) — that is expected.
  const res = await api.get<SnapshotListResponse>(`${BASE}?${params.toString()}`, { silent: true } as any);
  return res.data.data;
}

/** GET /clinical-snapshots/latest?caseId= — full DTO with chartState */
export async function getLatestSnapshot(
  caseId: string,
  type?: string
): Promise<SnapshotDTO> {
  const params = new URLSearchParams({ caseId });
  if (type) params.set('type', type);
  // silent: true — 404 = no snapshots for this case yet. Expected on new cases.
  const res = await api.get<SnapshotFullResponse>(`${BASE}/latest?${params.toString()}`, { silent: true } as any);
  return res.data.data;
}

/** GET /clinical-snapshots/:id — full DTO with chartState */
export async function getSnapshotById(id: string): Promise<SnapshotDTO> {
  // silent: true — caller handles 404 gracefully
  const res = await api.get<SnapshotFullResponse>(`${BASE}/${id}`, { silent: true } as any);
  return res.data.data;
}

/** POST /clinical-snapshots — create new snapshot */
export async function createSnapshot(
  payload: CreateSnapshotPayload
): Promise<{ snapshot: SnapshotDTO; visitRecord: unknown | null }> {
  // 🛡️ Guard against payload bloat: sanitize chartState to strip any embedded base64 data URIs.
  // Large images should be handled by attachments/uploads, not as JSON strings in chartState.
  const sanitizedPayload = {
    ...payload,
    chartState: sanitizeChartState(payload.chartState),
  };

  try {
    const res = await api.post<{ success: boolean; data: { snapshot: SnapshotDTO; visitRecord: unknown } }>(
      BASE,
      sanitizedPayload
    );
    return res.data.data;
  } catch (err: any) {
    console.error("[API ERROR] createSnapshot:", err?.response?.data || err.message);
    throw new Error(err?.response?.data?.error?.message || err?.response?.data?.error || "SNAPSHOT_API_ERROR");
  }
}

/** 
 * sanitizeChartState
 * Recursively scans chartState and removes any large base64 data URIs.
 * This keeps the clinical snapshot payload lean and prevents 413 Payload Too Large errors.
 */
function sanitizeChartState(chartState: any): any {
  if (!chartState) return chartState;
  
  // JSON.stringify approach is fast and handles deep objects
  return JSON.parse(
    JSON.stringify(chartState, (_key, value) => {
      if (typeof value === 'string' && value.startsWith('data:')) {
        // Drop embedded images/blobs from JSON state
        return undefined;
      }
      return value;
    })
  );
}

/** PATCH /clinical-snapshots/:id — metadata only (name, appointmentId) */
export async function updateSnapshotMetadata(
  id: string,
  patch: UpdateSnapshotPayload
): Promise<SnapshotListItem> {
  const res = await api.patch<{ success: boolean; data: SnapshotListItem }>(
    `${BASE}/${id}`,
    patch
  );
  return res.data.data;
}

/** DELETE /clinical-snapshots/:id — admin soft delete */
export async function deleteSnapshot(id: string): Promise<void> {
  await api.delete(`${BASE}/${id}`);
}
