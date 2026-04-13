/**
 * tads.api.ts — TADs Engine API Client
 *
 * Uses the shared org-plane axios instance (api).
 * All requests are org-scoped via JWT (organizationId from token context).
 */

import api from '@/services/api';

export interface TadEvent {
  _id: string;
  type: 'INSERTED' | 'FAILED' | 'REMOVED' | 'REINSERTED' | 'MARKED_FOR_REMOVAL';
  reason?: string | null;
  notes?: string | null;
  scheduledReinsertAt?: string | null;
  createdAt: string;
}

export interface Tad {
  _id: string;
  caseId: string;
  patientId: string;
  toothNumber: number;
  position: string;
  positionLabel: string;
  brand: string;
  diameter: string;
  length: string;
  status: 'ACTIVE' | 'NEEDS_REMOVAL' | 'FAILED' | 'REMOVED';
  events: TadEvent[];
  failureCount: number;
  hasActiveAlert: boolean;
  scheduledReinsertAt?: string | null;
  chartPosition?: { toothId?: number; anchorType?: string };
  createdAt: string;
  updatedAt: string;
}

export interface TadSettings {
  brands: string[];
  diameters: string[];
  lengths: string[];
  alertThresholds: {
    failureRateWarning: number;
    failureRateCritical: number;
  };
}

export interface FailureRateResult {
  rate: number;
  failed: number;
  total: number;
}

// ─── API Layer ────────────────────────────────────────────────────────────────

export const tadsApi = {
  /** Insert a new TAD */
  create: (data: {
    caseId: string;
    patientId: string;
    toothNumber: number;
    position: string;
    positionLabel?: string;
    brand: string;
    diameter: string;
    length: string;
    snapshotId?: string;
    chartPosition?: { toothId?: number; anchorType?: string };
  }) => api.post<{ success: boolean; data: Tad }>('/org/tads', data),

  /** List all TADs for a case */
  listByCase: (caseId: string) =>
    api.get<{ success: boolean; data: Tad[] }>(`/org/tads?caseId=${caseId}`),

  /** Get single TAD with full event history */
  getById: (id: string) =>
    api.get<{ success: boolean; data: Tad }>(`/org/tads/${id}`),

  /** Mark TAD as needing removal (alert trigger) */
  markForRemoval: (id: string, payload: { reason?: string; healingWeeks?: number; notes?: string }) =>
    api.post<{ success: boolean; data: Tad }>(`/org/tads/${id}/mark-removal`, payload),

  /** Confirm physical removal */
  remove: (id: string, payload: { reason?: string; healingWeeks?: number; notes?: string }) =>
    api.post<{ success: boolean; data: Tad }>(`/org/tads/${id}/remove`, payload),

  /** Record clinical failure */
  fail: (id: string, payload: { reason?: string; notes?: string }) =>
    api.post<{ success: boolean; data: Tad }>(`/org/tads/${id}/fail`, payload),

  /** Reinsert a removed/failed TAD */
  reinsert: (id: string, payload?: { position?: string; positionLabel?: string; notes?: string }) =>
    api.post<{ success: boolean; data: Tad }>(`/org/tads/${id}/reinsert`, payload ?? {}),

  /** Bulk soft-delete all ACTIVE TADs for a case */
  removeAll: (caseId: string) =>
    api.delete<{ success: boolean; data: { removedCount: number } }>(`/org/tads/bulk?caseId=${caseId}`),

  /** Get failure rate analytics for a case */
  getFailureRate: (caseId: string) =>
    api.get<{ success: boolean; data: FailureRateResult }>(`/org/tads/analytics/failure-rate?caseId=${caseId}`),

  /** Get org TAD brand/dimension settings */
  getSettings: () =>
    api.get<{ success: boolean; data: TadSettings }>('/org/tads/settings'),

  /** Update org TAD brand/dimension settings */
  updateSettings: (payload: Partial<TadSettings>) =>
    api.put<{ success: boolean; data: TadSettings }>('/org/tads/settings', payload),
};
