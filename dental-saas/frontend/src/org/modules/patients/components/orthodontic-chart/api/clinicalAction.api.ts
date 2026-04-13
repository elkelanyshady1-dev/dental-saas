/**
 * clinicalAction.api.ts — Phase 3 Clinical Appliance API Client
 *
 * Typed API wrapper for all clinical appliance endpoints served at:
 * /api/v1/org/clinical-actions
 *
 * Used as the `onCommit` target inside dispatchClinicalAction():
 *
 *   dispatchClinicalAction({
 *     action: { type: 'ARCHWIRE_SET', ... },
 *     onApply: () => dispatch({ type: 'SET_ARCHWIRE', payload: wire }),
 *     onCommit: async () => {
 *       await clinicalActionApi.applyArchwire({ caseId, patientId, arch, material, size });
 *     },
 *   });
 */

import api from "@/services/api";

const BASE = "/api/v1/org/clinical-actions";

// ── Shared types ──────────────────────────────────────────────────────────────

export interface ClinicalActionDoc {
  _id: string;
  domain: "archwire" | "elastic" | "powerchain" | "accessory" | "ligature" | "ipr" | "space";
  actionType: string;
  status: "ACTIVE" | "REMOVED";
  payload: Record<string, unknown>;
  caseId: string;
  patientId: string;
  snapshotId?: string;
  createdBy: string;
  createdAt: string;
}

export interface RemovePayload {
  reason?: string;
}

// ── List ──────────────────────────────────────────────────────────────────────

export interface ListActiveParams {
  caseId: string;
  domain?: "archwire" | "elastic" | "powerchain" | "accessory" | "ligature" | "ipr" | "space";
}

export function listActiveClinicalActions(params: ListActiveParams): Promise<{ data: ClinicalActionDoc[] }> {
  return api.get(`${BASE}/list`, { params }).then(r => r.data);
}

// ── Archwire ──────────────────────────────────────────────────────────────────

export interface ApplyArchwirePayload {
  caseId: string;
  patientId: string;
  arch: "upper" | "lower";
  material: string;
  size: string;
  brand?: string;
  snapshotId?: string;
}

export function applyArchwire(payload: ApplyArchwirePayload): Promise<{ data: ClinicalActionDoc }> {
  return api.post(`${BASE}/archwire/apply`, payload).then(r => r.data);
}

export function removeArchwire(id: string, body?: RemovePayload): Promise<{ data: ClinicalActionDoc }> {
  return api.post(`${BASE}/archwire/remove/${id}`, body ?? {}).then(r => r.data);
}

// ── Elastic ───────────────────────────────────────────────────────────────────

export interface ApplyElasticPayload {
  caseId: string;
  patientId: string;
  fromTooth: number;
  toTooth: number;
  type: string;
  size?: string;
  snapshotId?: string;
}

export function applyElastic(payload: ApplyElasticPayload): Promise<{ data: ClinicalActionDoc }> {
  return api.post(`${BASE}/elastic/apply`, payload).then(r => r.data);
}

export function removeElastic(id: string, body?: RemovePayload): Promise<{ data: ClinicalActionDoc }> {
  return api.post(`${BASE}/elastic/remove/${id}`, body ?? {}).then(r => r.data);
}

// ── PowerChain ────────────────────────────────────────────────────────────────

export interface ApplyPowerchainPayload {
  caseId: string;
  patientId: string;
  arch: "upper" | "lower";
  segments?: Array<{ from: number; to: number }>;
  type?: string;
  snapshotId?: string;
}

export function applyPowerchain(payload: ApplyPowerchainPayload): Promise<{ data: ClinicalActionDoc }> {
  return api.post(`${BASE}/powerchain/apply`, payload).then(r => r.data);
}

export function removePowerchain(id: string, body?: RemovePayload): Promise<{ data: ClinicalActionDoc }> {
  return api.post(`${BASE}/powerchain/remove/${id}`, body ?? {}).then(r => r.data);
}

// ── Accessory ────────────────────────────────────────────────────────────────

export interface AddAccessoryPayload {
  caseId: string;
  patientId: string;
  toothId: number;
  type: string;
  notes?: string;
  snapshotId?: string;
}

export function addAccessory(payload: AddAccessoryPayload): Promise<{ data: ClinicalActionDoc }> {
  return api.post(`${BASE}/accessory/add`, payload).then(r => r.data);
}

export function removeAccessory(id: string, body?: RemovePayload): Promise<{ data: ClinicalActionDoc }> {
  return api.post(`${BASE}/accessory/remove/${id}`, body ?? {}).then(r => r.data);
}

// ── Ligature ─────────────────────────────────────────────────────────────────

export interface AddLigaturePayload {
  caseId: string;
  patientId: string;
  toothId: number;
  type: string;
  notes?: string;
  snapshotId?: string;
}

export function addLigature(payload: AddLigaturePayload): Promise<{ data: ClinicalActionDoc }> {
  return api.post(`${BASE}/ligature/add`, payload).then(r => r.data);
}

export function removeLigature(id: string, body?: RemovePayload): Promise<{ data: ClinicalActionDoc }> {
  return api.post(`${BASE}/ligature/remove/${id}`, body ?? {}).then(r => r.data);
}

// ── IPR ───────────────────────────────────────────────────────────────────────

export interface AddIPRPayload {
  caseId: string;
  patientId: string;
  betweenTeeth: [number, number];
  amount: number;
  notes?: string;
  snapshotId?: string;
}

export function addIPR(payload: AddIPRPayload): Promise<{ data: ClinicalActionDoc }> {
  return api.post(`${BASE}/ipr/add`, payload).then(r => r.data);
}

export function removeIPR(id: string, body?: RemovePayload): Promise<{ data: ClinicalActionDoc }> {
  return api.post(`${BASE}/ipr/remove/${id}`, body ?? {}).then(r => r.data);
}

// ── Space Marker ──────────────────────────────────────────────────────────────

export interface AddSpaceMarkerPayload {
  caseId: string;
  patientId: string;
  toothId: number;
  type: string;
  notes?: string;
  snapshotId?: string;
}

export function addSpaceMarker(payload: AddSpaceMarkerPayload): Promise<{ data: ClinicalActionDoc }> {
  return api.post(`${BASE}/space/add`, payload).then(r => r.data);
}

export function removeSpaceMarker(id: string, body?: RemovePayload): Promise<{ data: ClinicalActionDoc }> {
  return api.post(`${BASE}/space/remove/${id}`, body ?? {}).then(r => r.data);
}
