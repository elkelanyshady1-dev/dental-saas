/**
 * bonding.api.ts — Bonding Engine API Client
 *
 * All requests are org-scoped via JWT (organizationId from token context).
 * Uses the established @/services/api pattern from this module.
 */

import api from '@/services/api';

// ─── DTO Types ────────────────────────────────────────────────────────────────

export type BondingType = 'BRACKET' | 'BAND' | 'TUBE';
export type BondingStatus = 'ACTIVE' | 'DEBONDED';
export type BondingAction = 'BONDED' | 'DEBONDED' | 'REBONDED' | 'REPOSITIONED';
export type BondingPosition = 'marginal-ridges-level' | 'middle-middle' | 'custom';
export type BondingSourceType = 'manual' | 'opg_reference';

export interface BondingEvent {
  _id: string;
  action: BondingAction;
  value: Record<string, unknown> | null;
  performedBy: string | null;
  notes: string | null;
  createdAt: string;
}

export interface BondingSource {
  type: BondingSourceType;
  referenceGroup: string | null; // e.g. "U1", "L6"
}

export interface Bonding {
  _id: string;
  organizationId: string;
  caseId: string;
  patientId: string;
  snapshotId: string | null;
  tooth: number;
  type: BondingType;
  prescription: string | null;
  slot: string | null;
  bondingHeight: number | null;
  bondingPosition: BondingPosition | null;
  brand: string | null;
  source: BondingSource;
  linkedTadIds: string[];
  status: BondingStatus;
  history: BondingEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface BondingSettings {
  organizationId?: string;
  brands: string[];
  slotSizes: string[];
  defaultPrescription: string;
  defaultSlot: string;
  debondAlertThreshold: number;
}

export interface DebondRate {
  rate: number;
  debonded: number;
  total: number;
}

// ─── Request Payloads ─────────────────────────────────────────────────────────

export interface ApplyBondingPayload {
  caseId: string;
  patientId: string;
  teeth: number[];
  type: BondingType;
  prescription?: string;
  slot?: string;
  bondingHeight?: number;
  bondingPosition?: BondingPosition;
  brand?: string;
  source?: BondingSource;
  snapshotId?: string;
  linkedTadIds?: string[];
  notes?: string;
}

export interface DebondPayload {
  reason?: string;
}

export interface RepositionPayload {
  bondingHeight?: number;
  bondingPosition?: BondingPosition;
  notes?: string;
}

// ─── API Client ───────────────────────────────────────────────────────────────

export const bondingApi = {
  /**
   * Apply bonding to one or more teeth (bulk upsert).
   * Creates BONDED event for new teeth, REBONDED for existing.
   */
  apply: async (payload: ApplyBondingPayload): Promise<Bonding[]> => {
    const { data } = await api.post('/org/bonding', payload);
    return data.data;
  },


  /**
   * Get all bondings for a case.
   */
  getByCase: async (caseId: string): Promise<Bonding[]> => {
    const { data } = await api.get('/org/bonding', { params: { caseId } });
    return data.data;
  },


  /**
   * Mark a tooth as debonded.
   */
  debond: async (bondingId: string, payload: DebondPayload = {}): Promise<Bonding> => {
    const { data } = await api.post(`/org/bonding/${bondingId}/debond`, payload);
    return data.data;
  },


  /**
   * Reposition a bracket (update height/position).
   */
  reposition: async (bondingId: string, payload: RepositionPayload): Promise<Bonding> => {
    const { data } = await api.post(`/org/bonding/${bondingId}/reposition`, payload);
    return data.data;
  },


  /**
   * Get the debond rate analytics for a case.
   */
  getDebondRate: async (caseId: string): Promise<DebondRate> => {
    const { data } = await api.get('/org/bonding/analytics', { params: { caseId } });
    return data.data;
  },


  /**
   * Get the org's bonding settings (brands, slots, defaults).
   */
  getSettings: async (): Promise<BondingSettings> => {
    const { data } = await api.get('/org/bonding/settings');
    return data.data;
  },


  /**
   * Update the org's bonding settings.
   */
  updateSettings: async (updates: Partial<BondingSettings>): Promise<BondingSettings> => {
    const { data } = await api.put('/org/bonding/settings', updates);
    return data.data;
  },

};
