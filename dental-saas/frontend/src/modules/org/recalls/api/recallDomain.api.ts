/**
 * recallDomain.api.ts — Recall Domain Frontend API
 * Domain: recalls
 * Layer: Frontend > API
 *
 * Communicates with:
 *   GET    /api/v1/org/recalls           → list recalls
 *   GET    /api/v1/org/recalls/stats     → dashboard stats
 *   PATCH  /api/v1/org/recalls/:id/status→ update status
 *   DELETE /api/v1/org/recalls/:id       → cancel recall
 */

import api from '@/services/api';

const BASE = '/org/recalls';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RecallListItem {
  id: string;
  organizationId: string;
  branchId: string;
  patientId: string;
  visitId: string | null;
  dueDate: string;
  interval: string | null;
  type: string;
  reason: string;
  status: string;
  patientName: string;
  contactPhone: string;
  createdBy: string | null;
  sentAt: string | null;
  completedAt: string | null;
  bookedAppointmentId: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  isOverdue: boolean;
}

export interface RecallStats {
  dueToday: number;
  overdue: number;
  thisWeek: number;
  completed: number;
}

export interface RecallListFilters {
  status?: string;
  search?: string;
  branchId?: string;
  patientId?: string;
  dateFrom?: string;
  dateTo?: string;
  type?: string;
  page?: number;
  limit?: number;
}

export interface RecallListResponse {
  recalls: RecallListItem[];
  meta: { total: number; page: number; limit: number; pages: number };
}

// ── API Functions ─────────────────────────────────────────────────────────────

/** GET /recalls — paginated, filtered list */
export async function getRecalls(filters: RecallListFilters = {}): Promise<RecallListResponse> {
  const params = new URLSearchParams();
  if (filters.status)    params.set('status',    filters.status);
  if (filters.search)    params.set('search',    filters.search);
  if (filters.branchId)  params.set('branchId',  filters.branchId);
  if (filters.patientId) params.set('patientId', filters.patientId);
  if (filters.dateFrom)  params.set('dateFrom',  filters.dateFrom);
  if (filters.dateTo)    params.set('dateTo',    filters.dateTo);
  if (filters.type)      params.set('type',      filters.type);
  if (filters.page)      params.set('page',      String(filters.page));
  if (filters.limit)     params.set('limit',     String(filters.limit));

  const qs = params.toString();
  const url = `${BASE}${qs ? `?${qs}` : ''}`;
  // `silent: true` suppresses the global toast interceptor so PBAC 403 denials
  // in patient-scoped contexts don't surface as error toasts. The hook treats
  // 403 as an empty list.
  const res = await api.get<{ success: boolean; data: RecallListItem[]; meta: any }>(url, {
    silent: true,
  } as any);
  return { recalls: res.data.data, meta: res.data.meta };
}

/** GET /recalls/stats — dashboard counters */
export async function getRecallStats(): Promise<RecallStats> {
  const res = await api.get<{ success: boolean; data: RecallStats }>(`${BASE}/stats`);
  return res.data.data;
}

/** PATCH /recalls/:id/status — update status */
export async function updateRecallStatus(
  recallId: string,
  status: string,
  opts?: { bookedAppointmentId?: string; notes?: string }
): Promise<RecallListItem> {
  const res = await api.patch<{ success: boolean; data: RecallListItem }>(
    `${BASE}/${recallId}/status`,
    { status, ...opts }
  );
  return res.data.data;
}

/** DELETE /recalls/:id — cancel recall */
export async function deleteRecall(recallId: string): Promise<RecallListItem> {
  const res = await api.delete<{ success: boolean; data: RecallListItem }>(`${BASE}/${recallId}`);
  return res.data.data;
}
