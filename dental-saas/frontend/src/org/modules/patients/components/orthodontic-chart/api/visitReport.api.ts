/**
 * visitReport.api.ts — Visit Report Frontend API
 * Domain: orthodontic-visits
 * Layer: Frontend > API
 *
 * Communicates with:
 *   GET  /api/v1/org/visit-reports/:visitId       → full visit report
 *   GET  /api/v1/org/visit-reports/case/:caseId   → visit timeline cards
 *   POST /api/v1/org/recalls                      → create recall
 *   GET  /api/v1/org/recalls/visit/:visitId       → get recall by visit
 */

import api from '@/services/api';

const REPORT_BASE = '/org/visit-reports';
const RECALL_BASE = '/org/recalls';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VisitWires {
  upper: string | null;
  lower: string | null;
}

export interface VisitSummary {
  wires: VisitWires;
  alerts: string[];
  keyActions: string[];
  stage: string | null;
}

export interface VisitRecallInfo {
  id?: string;
  interval: string | null;
  suggestedDate: string | null;
  status?: string;
}

export interface VisitAppointmentInfo {
  id: string;
  startTime: string | null;
  endTime: string | null;
}

export interface VisitSnapshotData {
  id: string;
  snapshotDate: string;
  type: string;
  chartState: any;
  notes: { text: string; tags: string[]; warnings: string[] };
  attachments: any[];
  procedures: any[];
  bondingSnapshot: any[];
  tadSnapshot: any[];
  thumbnail: string | null;
}

export interface VisitCardDTO {
  visitId: string;
  caseId: string;
  visitNumber: number;
  visitDate: string;
  status: string;
  visitType: string;
  doctorName: string | null;
  snapshotId: string | null;
  wires: VisitWires;
  alerts: string[];
  keyActions: string[];
  stage: string | null;
  recall: { interval: string | null; suggestedDate: string | null } | null;
  thumbnail: string | null;
}

export interface VisitReportDTO {
  visitId: string;
  caseId: string;
  visitNumber: number;
  visitDate: string;
  status: string;
  visitType: string;
  doctorName: string | null;
  durationMin: number | null;
  clinicalPhase: string | null;
  clinicalTags: string[];
  summary: VisitSummary;
  snapshot: VisitSnapshotData | null;
  visitNotes: string;
  voiceNotes: any[];
  recall: VisitRecallInfo | null;
  appointment: VisitAppointmentInfo | null;
}

export type RecallInterval = '2_weeks' | '3_weeks' | '1_month' | '6_weeks' | '3_months' | '6_months' | 'custom';

export interface CreateRecallPayload {
  visitId: string;
  patientId: string;
  branchId?: string;
  interval: RecallInterval;
  customDate?: string | null;
  reason?: string;
}

export interface RecallDTO {
  _id: string;
  organizationId: string;
  branchId: string;
  patientId: string;
  dueDate: string;
  reason: string;
  status: string;
}

// ── API Functions ─────────────────────────────────────────────────────────────

/** GET /visit-reports/:visitId — full read-only visit report */
export async function getVisitReport(visitId: string): Promise<VisitReportDTO> {
  const res = await api.get<{ success: boolean; data: VisitReportDTO }>(
    `${REPORT_BASE}/${visitId}`,
    { silent: true } as any
  );
  return res.data.data;
}

/** GET /visit-reports/case/:caseId — visit timeline cards */
export async function getVisitTimeline(
  caseId: string,
  opts?: { page?: number; limit?: number }
): Promise<{ visits: VisitCardDTO[]; meta: { total: number; page: number; limit: number; pages: number } }> {
  const params = new URLSearchParams();
  if (opts?.page)  params.set('page',  String(opts.page));
  if (opts?.limit) params.set('limit', String(opts.limit));

  const qs = params.toString();
  const url = `${REPORT_BASE}/case/${caseId}${qs ? `?${qs}` : ''}`;
  const res = await api.get<{ success: boolean; data: VisitCardDTO[]; meta: any }>(url, { silent: true } as any);
  return { visits: res.data.data, meta: res.data.meta };
}

/** POST /recalls — create recall draft */
export async function createRecall(payload: CreateRecallPayload): Promise<RecallDTO> {
  const res = await api.post<{ success: boolean; data: { recall: RecallDTO } }>(
    RECALL_BASE,
    payload
  );
  return res.data.data.recall;
}

/** GET /recalls/visit/:visitId — get recall by visit */
export async function getRecallByVisit(visitId: string): Promise<RecallDTO | null> {
  try {
    const res = await api.get<{ success: boolean; data: { recall: RecallDTO | null } }>(
      `${RECALL_BASE}/visit/${visitId}`,
      { silent: true } as any
    );
    return res.data.data.recall;
  } catch {
    return null;
  }
}
