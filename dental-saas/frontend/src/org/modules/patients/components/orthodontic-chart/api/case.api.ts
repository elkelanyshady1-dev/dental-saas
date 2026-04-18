/**
 * case.api.ts — Orthodontic Case Domain API (Unified)
 *
 * DOMAIN: Orthodontics (Org Plane)
 * OWNERSHIP: orthodontic-chart/api/ (canonical location)
 *
 * This file supersedes: src/modules/org/orthodontics/api/orthodontics.api.js
 *
 * All functions are preserved with identical signatures for zero-regression migration.
 * organizationId is NEVER sent — derived from JWT on backend.
 *
 * API base: /api/v1/org/orthodontic-cases (featureRegistry: "orthodontic-cases")
 */

import api from '@/services/api';

const BASE = '/org/orthodontic-cases';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrthoCase {
  id: string;
  patientId: string;
  status: 'draft' | 'diagnosis' | 'treatment_planning' | 'active' | 'completed' | 'cancelled';
  caseType?: string;
  startedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaseListParams {
  patientId?: string;
  status?: string;
  doctorId?: string;
  page?: number;
  limit?: number;
}

export interface WorkflowSaveOptions {
  trigger?: string;
  label?: string;
}

export interface WorkflowPatchOptions {
  trigger?: string;
}

// ─── Case CRUD ────────────────────────────────────────────────────────────────

/** List cases with filters (patientId, status, doctorId, page, limit) */
export const listCases = (params: CaseListParams = {}) =>
  api.get(BASE, { params });

/** List cases for a specific patient */
export const listByPatient = (patientId: string) =>
  api.get(BASE, { params: { patientId } });

/** Get single case (includes phases, scans, aligner plans) */
export const getCase = (id: string) =>
  api.get(`${BASE}/${id}`);

/** Create new orthodontic case */
export const createCase = (data: Partial<OrthoCase>) =>
  api.post(BASE, data);

/** Update case  */
export const updateCase = (id: string, data: Partial<OrthoCase>) =>
  api.patch(`${BASE}/${id}`, data);

/** Update case status (FSM transition) */
export const updateCaseStatus = (id: string, status: OrthoCase['status']) =>
  api.patch(`${BASE}/${id}/status`, { status });

/** Soft delete a case (owner/admin only) */
export const deleteCase = (id: string) =>
  api.delete(`${BASE}/${id}`);

// ─── Phases ───────────────────────────────────────────────────────────────────

/** GET /orthodontic-cases/:id/phases — Phase list + active phase */
export const getPhases = (id: string) =>
  api.get(`${BASE}/${id}/phases`);

/** POST /orthodontic-cases/:id/advance-phase — FSM phase advance */
export const advancePhase = (id: string) =>
  api.post(`${BASE}/${id}/advance-phase`);

// ─── Timeline ─────────────────────────────────────────────────────────────────

/** GET /orthodontic-cases/:id/timeline — Unified visit timeline */
export const getTimeline = (id: string) =>
  api.get(`${BASE}/${id}/timeline`);

/** GET /orthodontic-cases/:id/timeline/:visitId — Full visit detail */
export const getVisitDetail = (caseId: string, visitId: string) =>
  api.get(`${BASE}/${caseId}/timeline/${visitId}`);

// ─── Workflow ─────────────────────────────────────────────────────────────────

/** GET /orthodontic-cases/:id/workflow — Saved workflow data for 6-step wizard */
export const getWorkflow = (caseId: string) =>
  api.get(`${BASE}/${caseId}/workflow`);

/**
 * PUT /orthodontic-cases/:id/workflow — Full save (manual save / reliability path).
 * Supports optimistic concurrency via expectedVersion.
 */
export const saveWorkflow = (
  caseId: string,
  workflowData: Record<string, unknown>,
  expectedVersion?: number,
  { trigger, label }: WorkflowSaveOptions = {}
) =>
  api.put(`${BASE}/${caseId}/workflow`, {
    workflowData,
    ...(typeof expectedVersion === 'number' ? { expectedVersion } : {}),
    ...(trigger ? { trigger } : {}),
    ...(label ? { label } : {}),
  });

/**
 * PATCH /orthodontic-cases/:id/workflow — Enterprise autosave (sparse diff).
 * Sends ONLY changed fields — preferred for autosave.
 */
export const patchWorkflow = (
  caseId: string,
  changes: Record<string, unknown>,
  expectedVersion: number,
  { trigger = 'AUTO' }: WorkflowPatchOptions = {}
) =>
  api.patch(`${BASE}/${caseId}/workflow`, {
    changes,
    expectedVersion,
    trigger,
  });

// ─── Scans ────────────────────────────────────────────────────────────────────

/** GET /orthodontic-cases/:id/scans */
export const getScans = (id: string) =>
  api.get(`${BASE}/${id}/scans`);

/** POST /orthodontic-cases/:id/scans — Upload STL/PLY scan */
export const uploadScan = (
  id: string,
  formData: FormData,
  onUploadProgress?: (e: ProgressEvent) => void
) =>
  api.post(`${BASE}/${id}/scans`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress,
  });

/** POST /orthodontic-cases/:caseId/scans/:scanId/analyze — AI segmentation */
export const requestAnalysis = (caseId: string, scanId: string) =>
  api.post(`${BASE}/${caseId}/scans/${scanId}/analyze`);

// ─── Aligner Plans ────────────────────────────────────────────────────────────

/** GET /orthodontic-cases/:id/aligner-plans */
export const getAlignerPlans = (id: string) =>
  api.get(`${BASE}/${id}/aligner-plans`);

/** POST /orthodontic-cases/:id/aligner-plans */
export const createAlignerPlan = (id: string, data: Record<string, unknown>) =>
  api.post(`${BASE}/${id}/aligner-plans`, data);

/** PATCH /orthodontic-cases/:caseId/aligner-plans/:planId */
export const updateAlignerPlan = (
  caseId: string,
  planId: string,
  data: Record<string, unknown>
) =>
  api.patch(`${BASE}/${caseId}/aligner-plans/${planId}`, data);

// ─── Notes ────────────────────────────────────────────────────────────────────

/** PATCH /orthodontic-cases/:id — Add case note */
export const addNote = (id: string, content: string) =>
  api.patch(`${BASE}/${id}`, { note: { content } });

// ─── Situation Room Dashboard ────────────────────────────────────────────────

export interface DashboardKpis {
  activeCount: number;
  inTreatmentCount: number;
  overdueAdjustments: number;
  avgAlignerProgress: number;
  criticalEventsToday: number;
  todayVisits: number;
}

export interface DashboardDTO {
  kpis: DashboardKpis;
  stageDistribution: Array<{ stage: string; count: number }>;
  durationVariance: Array<{ bucket: string; count: number }>;
  doctorWorkload: Array<{
    doctorId: string;
    doctorName: string;
    activeCases: number;
    visitsThisWeek: number;
  }>;
  applianceInventory: {
    activeBrackets: number;
    activeTads: number;
    bracketsDebondedThisMonth: number;
  };
  photoCoverage: {
    casesWithBaseline: number;
    casesWithProgress: number;
    totalActive: number;
  };
  overdueCases: Array<{
    caseId: string;
    patientName: string;
    daysSinceLastVisit: number;
    lastVisitAt: string | null;
  }>;
  criticalAlerts: Array<{
    eventId: string;
    caseId: string | null;
    patientName: string;
    severity: string;
    type: string;
    at: string | null;
  }>;
  generatedAt: string;
  scope: 'organization' | 'owner';
}

/** GET /orthodontic-cases/dashboard — Situation Room aggregated payload */
export const getDashboard = () =>
  api.get<{ success: boolean; data: DashboardDTO }>(`${BASE}/dashboard`);

// ─── File Uploads ─────────────────────────────────────────────────────────────

/** POST /orthodontic-cases/uploads/photo */
export const uploadPhoto = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`${BASE}/uploads/photo`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

/** POST /orthodontic-cases/uploads/stl */
export const uploadStl = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`${BASE}/uploads/stl`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

/** POST /orthodontic-cases/uploads/audio */
export const uploadAudio = (blob: Blob, filename = 'voice-note.webm') => {
  const formData = new FormData();
  formData.append('file', blob, filename);
  return api.post(`${BASE}/uploads/audio`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// ─── Image Pool (Bulk upload + per-recordSet assignment) ─────────────────────

export interface PoolImageDTO {
  id: string;
  recordSetId: string | null;
  url: string | null;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number;
  assignedView: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface BulkUploadResponse {
  uploaded: PoolImageDTO[];
  rejected: Array<{ originalName: string; reason: string }>;
  recordSetId: string;
}

export interface BulkUploadOptions {
  compressed?: boolean;
  onUploadProgress?: (e: ProgressEvent) => void;
  /**
   * UUID v4 generated ONCE per user-initiated batch (see BulkPhotoUploadModal's
   * idempotencyKeyRef). Retries of a partially-completed batch MUST reuse the
   * same key so the backend replays the cached response and the fingerprint-dedup
   * layer de-duplicates any already-uploaded files.
   */
  idempotencyKey?: string;
}

/** POST /:caseId/record-sets/:recordSetId/photos/batch — bulk upload into pool (max 30). */
export const bulkUploadPhotos = (
  caseId: string,
  recordSetId: string,
  files: File[],
  { compressed, onUploadProgress, idempotencyKey }: BulkUploadOptions = {}
) => {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f, f.name));
  if (typeof compressed === 'boolean') formData.append('compressed', String(compressed));
  const headers: Record<string, string> = { 'Content-Type': 'multipart/form-data' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  return api.post(
    `${BASE}/${caseId}/record-sets/${recordSetId}/photos/batch`,
    formData,
    {
      headers,
      onUploadProgress,
    }
  );
};

/** GET /:caseId/record-sets/:recordSetId/photos/pool */
export const listPool = (caseId: string, recordSetId: string) =>
  api.get(`${BASE}/${caseId}/record-sets/${recordSetId}/photos/pool`);

/** POST /:caseId/record-sets/:recordSetId/photos/:photoId/assign */
export const assignPoolPhoto = (
  caseId: string,
  recordSetId: string,
  photoId: string,
  view: string
) =>
  api.post(
    `${BASE}/${caseId}/record-sets/${recordSetId}/photos/${photoId}/assign`,
    { view }
  );

/** POST /:caseId/record-sets/:recordSetId/photos/:photoId/unassign */
export const unassignPoolPhoto = (
  caseId: string,
  recordSetId: string,
  photoId: string
) =>
  api.post(
    `${BASE}/${caseId}/record-sets/${recordSetId}/photos/${photoId}/unassign`
  );

/** DELETE /:caseId/record-sets/:recordSetId/photos/:photoId */
export const deletePoolPhoto = (
  caseId: string,
  recordSetId: string,
  photoId: string
) =>
  api.delete(`${BASE}/${caseId}/record-sets/${recordSetId}/photos/${photoId}`);

// ─── Unified export (namespace) ───────────────────────────────────────────────

/**
 * caseApi — Canonical orthodontic case API.
 * Import this everywhere. The orthodonticsApi compatibility shim re-exports this.
 */
export const caseApi = {
  // Case CRUD
  list:               listCases,
  listByPatient,
  get:                getCase,
  create:             createCase,
  update:             updateCase,
  updateCaseStatus,
  deleteCase,
  // Phases
  getPhases,
  advancePhase,
  // Timeline
  getTimeline,
  getVisitDetail,
  // Workflow
  getWorkflow,
  saveWorkflow,
  patchWorkflow,
  // Scans
  getScans,
  uploadScan,
  requestAnalysis,
  // Aligner Plans
  getAlignerPlans,
  createAlignerPlan,
  updateAlignerPlan,
  // Notes
  addNote,
  // Uploads
  uploadPhoto,
  uploadStl,
  uploadAudio,
  // Image Pool
  bulkUploadPhotos,
  listPool,
  assignPoolPhoto,
  unassignPoolPhoto,
  deletePoolPhoto,
  // Situation Room
  getDashboard,
};
