/**
 * useClinicalCaseEngine.ts
 * Domain: orthodontic-cases (Phase 3 — Clinical Case Engine)
 * Layer: Frontend > Hooks (Server State)
 *
 * React Query hooks for:
 *   - Creating a new OrthodonticCase with default phases
 *   - Getting full case detail (with phases[])
 *   - Getting the case timeline (visits + procedures)
 *   - Saving a snapshot (the CRITICAL flow → auto-generates VisitRecord)
 *   - Advancing to the next phase
 *
 * SYSTEM RULES (§9):
 *   ❌ Forbidden: useState(apiData), raw fetch, refetch(), window.location.reload()
 *   ✅ Required:  useQuery() + useMutation() + invalidateQueries()
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000/api/v1";

function getAuthHeaders(): Record<string, string> {
  const token = sessionStorage.getItem("org_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  const json = await res.json();
  if (!res.ok || !json.success) {
    const err = new Error(json?.error?.message ?? `HTTP ${res.status}`);
    (err as any).code = json?.error?.code;
    (err as any).existingId = json?.error?.existingId;
    throw err;
  }
  return json.data as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type PhaseName = "bonding" | "active" | "retention" | "post-treatment";
export type PhaseStatus = "pending" | "active" | "completed";
export type CaseStatus = "draft" | "diagnosis" | "treatment_planning" | "active" | "completed" | "cancelled";

export interface CasePhaseDTO {
  id:          string;
  caseId:      string | null;
  name:        PhaseName;
  order:       number;
  status:      PhaseStatus;
  startedAt:   number | null;
  completedAt: number | null;
  createdAt:   number | null;
}

export interface CaseDetailDTO {
  id:                      string;
  organizationId:          string | null;
  patientId:               string | null;
  caseType:                string;
  status:                  CaseStatus;
  activePhaseId:           string | null;
  phases:                  CasePhaseDTO[];
  malocclusionClass:       string | null;
  estimatedDurationMonths: number | null;
  createdAt:               number | null;
  updatedAt:               number | null;
}

export interface ProcedureDTO {
  id:        string | null;
  type:      string;
  target:    { toothId: number } | null;
  metadata:  Record<string, unknown> | null;
  timestamp: number | null;
}

export interface TimelineEntryDTO {
  visitId:       string;
  visitNumber:   number;
  date:          number;
  phaseId:       string | null;
  appointmentId: string | null;
  snapshotId:    string | null;
  procedures:    ProcedureDTO[];
  notes: {
    clinical:       string;
    administrative: string;
  };
  attachments: { url: string; type: string; name: string | null }[];
  thumbnail:   string | null;
}

export interface VisitRecordDTO {
  id:            string;
  caseId:        string | null;
  phaseId:       string | null;
  appointmentId: string | null;
  snapshotId:    string | null;
  visitNumber:   number;
  notes:         string;
  attachments:   { url: string; type: string; name: string | null; size: number | null }[];
  createdAt:     number | null;
}

export interface SnapshotSaveInput {
  appointmentId?:  string | null;
  chartState:      Record<string, unknown>;
  // FIX 3 — Optimistic concurrency lock.
  // Send the version of the most recent snapshot you loaded.
  // Omit for first-visit saves (no previous snapshot to conflict with).
  expectedVersion?: number | null;
  thumbnail?:      string | null;
  notes?:          string | { text?: string; tags?: string[]; warnings?: string[] };
  attachments?:    { url: string; type: string; name?: string; size?: number }[];
}

export interface PhaseAdvanceResult {
  completed:   CasePhaseDTO;
  activated:   CasePhaseDTO | null;
  isLastPhase: boolean;
}

// ── Query Keys ────────────────────────────────────────────────────────────────

const KEYS = {
  caseDetail: (caseId: string) => ["orthodontic-cases", "detail", caseId] as const,
  timeline:   (caseId: string) => ["orthodontic-cases", "timeline", caseId] as const,
  list:       (patientId?: string)  => ["orthodontic-cases", "list", patientId ?? "all"] as const,
};

// ── API calls ─────────────────────────────────────────────────────────────────

async function createCase(body: { patientId: string; caseType?: string }): Promise<CaseDetailDTO> {
  const res = await fetch(`${BASE_URL}/orthodontic-cases`, {
    method:  "POST",
    headers: getAuthHeaders(),
    body:    JSON.stringify(body),
  });
  return handleResponse<CaseDetailDTO>(res);
}

async function fetchCaseDetail(caseId: string): Promise<CaseDetailDTO> {
  const res = await fetch(`${BASE_URL}/orthodontic-cases/${caseId}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<CaseDetailDTO>(res);
}

async function fetchTimeline(caseId: string): Promise<TimelineEntryDTO[]> {
  const res = await fetch(`${BASE_URL}/orthodontic-cases/${caseId}/timeline`, {
    headers: getAuthHeaders(),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json.data as TimelineEntryDTO[];
}

async function saveSnapshot(
  caseId: string,
  payload: SnapshotSaveInput
): Promise<{ visitRecord: VisitRecordDTO; snapshot: { id: string; procedures: ProcedureDTO[]; procedureCount: number; thumbnail: string | null; createdAt: number | null } }> {
  const res = await fetch(`${BASE_URL}/orthodontic-cases/${caseId}/snapshots`, {
    method:  "POST",
    headers: getAuthHeaders(),
    body:    JSON.stringify(payload),
  });
  return handleResponse(res);
}

async function advancePhase(caseId: string): Promise<PhaseAdvanceResult> {
  const res = await fetch(`${BASE_URL}/orthodontic-cases/${caseId}/advance-phase`, {
    method:  "POST",
    headers: getAuthHeaders(),
    body:    "{}",
  });
  return handleResponse<PhaseAdvanceResult>(res);
}

// ─────────────────────────────────────────────────────────────────────────────
// useCreateCase
// ─────────────────────────────────────────────────────────────────────────────

export function useCreateCase() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: createCase,
    onSuccess: (newCase) => {
      // Prime the detail cache immediately
      queryClient.setQueryData(KEYS.caseDetail(newCase.id), newCase);
      // Invalidate list for the patient
      queryClient.invalidateQueries({ queryKey: KEYS.list(newCase.patientId ?? undefined) });
    },
  });

  return {
    createCase:       mutation.mutate,
    createCaseAsync:  mutation.mutateAsync,
    isCreating:       mutation.isPending,
    isSuccess:        mutation.isSuccess,
    isError:          mutation.isError,
    error:            mutation.error,
    createdCase:      mutation.data ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// useCaseDetail — includes phases[]
// ─────────────────────────────────────────────────────────────────────────────

export function useCaseDetail(caseId: string | null) {
  const query = useQuery({
    queryKey: KEYS.caseDetail(caseId ?? ""),
    queryFn:  () => fetchCaseDetail(caseId!),
    enabled:  !!caseId,
    staleTime: 30_000,
  });

  return {
    orthoCase:  query.data ?? null as CaseDetailDTO | null,
    phases:     query.data?.phases ?? [] as CasePhaseDTO[],
    activePhase: query.data?.phases.find((p) => p.id === query.data?.activePhaseId) ?? null,
    isLoading:  query.isLoading,
    isError:    query.isError,
    error:      query.error,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// useCaseTimeline — visit history with procedures
// ─────────────────────────────────────────────────────────────────────────────

export function useCaseTimeline(caseId: string | null) {
  const query = useQuery({
    queryKey: KEYS.timeline(caseId ?? ""),
    queryFn:  () => fetchTimeline(caseId!),
    enabled:  !!caseId,
    staleTime: 60_000, // Timeline grows via mutations — list invalidation is the refresh trigger
  });

  return {
    timeline:  query.data ?? [] as TimelineEntryDTO[],
    total:     query.data?.length ?? 0,
    isLoading: query.isLoading,
    isError:   query.isError,
    error:     query.error,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// useSaveSnapshot — THE CRITICAL MUTATION
// Saves chartState → auto-creates VisitRecord + generates procedures server-side
// ─────────────────────────────────────────────────────────────────────────────

export function useSaveSnapshot(caseId: string | null) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: SnapshotSaveInput) => saveSnapshot(caseId!, payload),
    onSuccess: () => {
      if (!caseId) return;
      // Timeline now has a new entry — invalidate to refetch
      queryClient.invalidateQueries({ queryKey: KEYS.timeline(caseId) });
      // Case detail may have updated visitCount / updatedAt
      queryClient.invalidateQueries({ queryKey: KEYS.caseDetail(caseId) });
    },
  });

  return {
    saveSnapshot:       mutation.mutate,
    saveSnapshotAsync:  mutation.mutateAsync,
    isSaving:           mutation.isPending,
    isSuccess:          mutation.isSuccess,
    isError:            mutation.isError,
    error:              mutation.error,
    result:             mutation.data ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// useAdvancePhase
// ─────────────────────────────────────────────────────────────────────────────

export function useAdvancePhase(caseId: string | null) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => advancePhase(caseId!),
    onSuccess: () => {
      if (!caseId) return;
      // Case detail now has new activePhaseId — invalidate
      queryClient.invalidateQueries({ queryKey: KEYS.caseDetail(caseId) });
    },
  });

  return {
    advancePhase:       mutation.mutate,
    advancePhaseAsync:  mutation.mutateAsync,
    isAdvancing:        mutation.isPending,
    isSuccess:          mutation.isSuccess,
    isLastPhase:        mutation.data?.isLastPhase ?? false,
    activated:          mutation.data?.activated ?? null,
    isError:            mutation.isError,
    error:              mutation.error,
  };
}
