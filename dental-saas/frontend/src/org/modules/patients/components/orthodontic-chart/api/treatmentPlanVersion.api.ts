/**
 * treatmentPlanVersion.api.ts — Orthodontic Treatment Plan Versioning API Client
 *
 * Backend routes mounted at /api/v1/org/plan-versions/:caseId/*
 */

import api from '@/services/api';

// ─── DTO Types (mirror backend DTOs) ─────────────────────────────────────────

export type PlanStage = 'DRAFT' | 'APPROVED' | 'REVISION';
export type PlanPhase = 'PRE' | 'MID';

export interface PlanAssets {
  photos: string[];
  documents: string[];
  stlFiles: string[];
  dicomFiles: string[];
}

export interface PlanAuditEntry {
  action: 'CREATED_DRAFT' | 'EDITED_DRAFT' | 'APPROVED' | 'REVISED' | 'DELETED';
  userId: string | null;
  timestamp: number | null;
  note: string;
}

export interface TreatmentPlanVersion {
  id: string;
  organizationId: string | null;
  caseId: string | null;
  recordSetId: string | null;
  recordSetType: PlanPhase | null;
  version: number;
  parentVersionId: string | null;
  stage: PlanStage | null;
  isActive: boolean;
  isApproved: boolean;
  payload: Record<string, unknown> | null;
  changeSummary: string;
  createdFrom: PlanPhase | null;
  assets: PlanAssets;
  audit: PlanAuditEntry[];
  versionLock: number;
  createdBy: string | null;
  createdAt: number | null;
  updatedAt: number | null;
}

export interface TreatmentPlanVersionListItem {
  id: string;
  caseId: string | null;
  version: number;
  stage: PlanStage | null;
  recordSetType: PlanPhase | null;
  recordSetId: string | null;
  parentVersionId: string | null;
  isActive: boolean;
  isApproved: boolean;
  changeSummary: string;
  createdFrom: PlanPhase | null;
  createdBy: string | null;
  createdAt: number | null;
}

export interface PlanCompareResult {
  from: { id: string | null; version: number | null; stage: PlanStage | null };
  to:   { id: string | null; version: number | null; stage: PlanStage | null };
  changedFields: Array<{ path: string; before: unknown; after: unknown }>;
  assets: {
    added:   { photos: string[]; documents: string[]; stlFiles: string[]; dicomFiles: string[] };
    removed: { photos: string[]; documents: string[]; stlFiles: string[]; dicomFiles: string[] };
  };
}

// ─── Request Payloads ────────────────────────────────────────────────────────

export interface CreateDraftPayload {
  recordSetId: string;
  payload: Record<string, unknown>;
  assets?: Partial<PlanAssets>;
}

export interface EditDraftPayload {
  payload?: Record<string, unknown>;
  assets?: Partial<PlanAssets>;
  expectedVersionLock: number;
}

export interface CreateRevisionPayload {
  recordSetId: string;
  payload: Record<string, unknown>;
  changeSummary: string;
  assets?: Partial<PlanAssets>;
}

// ─── API Client ──────────────────────────────────────────────────────────────

export const treatmentPlanVersionApi = {
  list: async (caseId: string): Promise<TreatmentPlanVersionListItem[]> => {
    const { data } = await api.get(`/org/plan-versions/${caseId}`);
    return data.data ?? [];
  },

  getActive: async (caseId: string): Promise<TreatmentPlanVersion | null> => {
    const { data } = await api.get(`/org/plan-versions/${caseId}/active`);
    return data.data ?? null;
  },

  getApproved: async (caseId: string): Promise<TreatmentPlanVersion | null> => {
    const { data } = await api.get(`/org/plan-versions/${caseId}/approved`);
    return data.data ?? null;
  },

  getOne: async (caseId: string, versionId: string): Promise<TreatmentPlanVersion> => {
    const { data } = await api.get(`/org/plan-versions/${caseId}/version/${versionId}`);
    return data.data;
  },

  compare: async (caseId: string, from: string, to: string): Promise<PlanCompareResult> => {
    const { data } = await api.get(`/org/plan-versions/${caseId}/compare`, { params: { from, to } });
    return data.data;
  },

  createDraft: async (caseId: string, payload: CreateDraftPayload): Promise<TreatmentPlanVersion> => {
    const { data } = await api.post(`/org/plan-versions/${caseId}/draft`, payload);
    return data.data;
  },

  editDraft: async (caseId: string, versionId: string, payload: EditDraftPayload): Promise<TreatmentPlanVersion> => {
    const { data } = await api.put(`/org/plan-versions/${caseId}/version/${versionId}`, payload);
    return data.data;
  },

  deleteDraft: async (caseId: string, versionId: string): Promise<{ deleted: boolean; versionId: string; version: number }> => {
    const { data } = await api.delete(`/org/plan-versions/${caseId}/version/${versionId}`);
    return data.data;
  },

  approve: async (caseId: string, versionId: string): Promise<TreatmentPlanVersion> => {
    const { data } = await api.post(`/org/plan-versions/${caseId}/version/${versionId}/approve`);
    return data.data;
  },

  createRevision: async (caseId: string, payload: CreateRevisionPayload): Promise<TreatmentPlanVersion> => {
    const { data } = await api.post(`/org/plan-versions/${caseId}/revision`, payload);
    return data.data;
  },
};
