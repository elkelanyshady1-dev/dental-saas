/**
 * visitSession.api.ts — Phase 2: Visit Session Frontend API
 *
 * Communicates with:
 *   POST   /api/v1/org/visit-sessions/:caseId/start
 *   PATCH  /api/v1/org/visit-sessions/:visitId/end
 *   DELETE /api/v1/org/visit-sessions/:visitId/cancel
 *   GET    /api/v1/org/visit-sessions/:caseId/active
 */

import api from '@/services/api';

const BASE = '/org/visit-sessions';

export type VisitStatus = 'active' | 'completed' | 'cancelled';

export interface VoiceNote {
  url:       string;
  duration:  number | null;  // seconds
  createdAt: string;         // ISO date
}

export interface ActiveVisit {
  _id: string;
  id: string;         // alias — same as _id
  caseId: string;
  organizationId: string;
  status: VisitStatus;
  visitNumber: number;
  visitType: string;  // 'adjustment' | 'diagnostic' | 'bonding' | etc.
  startedAt: number;  // epoch ms
  endedAt: number | null;
  appointmentId: string | null;
  phaseId: string | null;
  snapshotId: string | null;
  notes: string;
  voiceNotes: VoiceNote[];
  // Phase 4: soft lock fields
  lockedBy: string | null;         // userId holding the lock
  lockedAt: string | null;         // ISO date when lock was acquired
  lastHeartbeatAt: string | null;  // ISO date of last heartbeat
  // Doctor identity — populated from context or JWT
  doctorName?: string | null;
  doctorId?: string | null;
}

interface VisitResponse {
  success: boolean;
  data: { visit: ActiveVisit | null };
}

// ── GET /visit-sessions/:caseId/active ────────────────────────────────────────

export async function getActiveVisit(caseId: string): Promise<ActiveVisit | null> {
  try {
    const res = await api.get<VisitResponse>(
      `${BASE}/${caseId}/active`,
      { silent: true } as any
    );
    return res.data.data.visit ?? null;
  } catch (err: any) {
    // 404 → no active visit (expected for new cases or after end visit)
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

// ── POST /visit-sessions/:caseId/start ────────────────────────────────────────

export async function startVisit(
  caseId: string,
  opts?: { appointmentId?: string | null; phaseId?: string | null; visitType?: string }
): Promise<ActiveVisit> {
  const res = await api.post<VisitResponse>(
    `${BASE}/${caseId}/start`,
    {
      appointmentId: opts?.appointmentId ?? null,
      phaseId:       opts?.phaseId       ?? null,
      visitType:     opts?.visitType     ?? 'adjustment',
    }
  );
  return res.data.data.visit!;
}

// ── PATCH /visit-sessions/:visitId/end ───────────────────────────────────────

export async function endVisit(
  visitId: string,
  opts?: { snapshotId?: string | null; visitDate?: string | null }
): Promise<ActiveVisit> {
  const res = await api.patch<VisitResponse>(
    `${BASE}/${visitId}/end`,
    {
      snapshotId: opts?.snapshotId ?? null,
      visitDate:  opts?.visitDate  ?? null,
    }
  );
  return res.data.data.visit!;
}

// ── DELETE /visit-sessions/:visitId/cancel ────────────────────────────────────

export async function cancelVisit(visitId: string): Promise<ActiveVisit> {
  const res = await api.delete<VisitResponse>(`${BASE}/${visitId}/cancel`);
  return res.data.data.visit!;
}

// ── PATCH /visit-sessions/:visitId/notes ─────────────────────────────────────
// Called by debounced autosave. Full overwrite (not append).

export async function updateVisitNotes(visitId: string, notes: string): Promise<ActiveVisit> {
  const res = await api.patch<VisitResponse>(`${BASE}/${visitId}/notes`, { notes });
  return res.data.data.visit!;
}

// ── POST /visit-sessions/:visitId/voice ──────────────────────────────────────

export interface AddVoiceNotePayload {
  url:      string;
  duration?: number | null;
}

export async function addVoiceNote(
  visitId: string,
  payload: AddVoiceNotePayload
): Promise<ActiveVisit> {
  const res = await api.post<VisitResponse>(`${BASE}/${visitId}/voice`, payload);
  return res.data.data.visit!;
}

// ── PATCH /visit-sessions/:visitId/heartbeat ──────────────────────────────────
// Fire-and-forget — always resolves (errors are swallowed).

export async function sendHeartbeat(visitId: string): Promise<void> {
  try {
    await api.patch(`${BASE}/${visitId}/heartbeat`);
  } catch {
    // Non-fatal — heartbeat failure does not block the UI
  }
}

// ── PATCH /visit-sessions/:visitId/takeover ───────────────────────────────────

export async function takeoverVisit(visitId: string): Promise<ActiveVisit> {
  const res = await api.patch<VisitResponse>(`${BASE}/${visitId}/takeover`);
  return res.data.data.visit!;
}
