/**
 * sequence.api.ts — Treatment Sequence Engine API Client
 */

import api from '@/services/api';

// ─── DTO Types ────────────────────────────────────────────────────────────────

export type SequenceActionType = 'BONDING' | 'WIRE' | 'EXTRACTION' | 'TAD' | 'ELASTICS' | 'OTHER';

export interface SequenceAction {
  type: SequenceActionType;
  /** V2 hook — payload is stored but not executed in V1.5 */
  payload: Record<string, unknown> | null;
}

export interface SequenceStep {
  order: number;
  title: string;
  description: string | null;
  actions: SequenceAction[];
}

export interface SequencePlan {
  _id: string;
  organizationId: string;
  caseId: string;
  name: string;
  steps: SequenceStep[];
  createdAt: string;
  updatedAt: string;
}

export interface SequenceProgress {
  currentStep: number;
  lastUpdated: string | null;
}

// ─── Request Payloads ─────────────────────────────────────────────────────────

export interface UpsertSequencePayload {
  name?: string;
  steps: Omit<SequenceStep, never>[];
}

export interface UpdateProgressPayload {
  snapshotId: string;
  stepIndex: number;
}

// ─── API Client ───────────────────────────────────────────────────────────────

export const sequenceApi = {
  /**
   * Get the sequence plan for a case.
   * Returns null data if no plan exists yet (not a 404).
   */
  getByCase: async (caseId: string): Promise<SequencePlan | null> => {
    const { data } = await api.get(`/org/sequence/${caseId}`);
    return data.data;
  },

  /**
   * Create or replace a sequence plan for a case (upsert).
   */
  upsert: async (caseId: string, payload: UpsertSequencePayload): Promise<SequencePlan> => {
    const { data } = await api.post(`/org/sequence/${caseId}`, payload);
    return data.data;
  },

  /**
   * Delete the sequence plan for a case.
   */
  delete: async (caseId: string): Promise<void> => {
    await api.delete(`/org/sequence/${caseId}`);
  },

  /**
   * Update the step progress index on a WorkflowSnapshot.
   * Uses atomic $set — does NOT touch chart state.
   */
  updateProgress: async (payload: UpdateProgressPayload): Promise<{ snapshotId: string; stepIndex: number; updatedAt: string }> => {
    const { data } = await api.post('/org/sequence/progress', payload);
    return data.data;
  },
};

