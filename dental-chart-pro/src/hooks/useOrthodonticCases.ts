/**
 * useOrthodonticCases.ts
 * Domain: orthodontic-cases
 * Layer: Frontend > Hooks (Server State)
 *
 * React Query hooks for:
 *   - Listing cases for a patient (scheduling sidebar)
 *   - Reading a single case (snapshot editor header)
 *   - Transitioning case status (clinician workflow)
 *
 * SYSTEM RULE (§9):
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
    throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  }
  return json.data as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type CaseStatus =
  | "draft"
  | "diagnosis"
  | "treatment_planning"
  | "active"
  | "completed";

export interface OrthodonticCaseDTO {
  id:                      string;
  organizationId:          string | null;
  patientId:               string | null;
  caseType:                string;
  status:                  CaseStatus;
  malocclusionClass:       string | null;
  estimatedDurationMonths: number | null;
  startedAt:               number | null;
  completedAt:             number | null;
  createdAt:               number | null;
  updatedAt:               number | null;
}

export interface OrthodonticCaseListItem {
  id:        string;
  patientId: string | null;
  caseType:  string;
  status:    CaseStatus;
  createdAt: number | null;
  updatedAt: number | null;
}

// ── Query Keys ───────────────────────────────────────────────────────────────

const CASE_KEYS = {
  list:   (patientId?: string, status?: string) =>
    ["orthodontic-cases", "list", patientId ?? "all", status ?? "all"] as const,
  detail: (caseId: string) =>
    ["orthodontic-cases", "detail", caseId] as const,
};

// ── API calls ─────────────────────────────────────────────────────────────────

async function fetchCasesByPatient(
  patientId: string,
  status?: CaseStatus
): Promise<{ data: OrthodonticCaseListItem[]; meta: { total: number } }> {
  const params = new URLSearchParams({ patientId });
  if (status) params.set("status", status);
  const res = await fetch(`${BASE_URL}/orthodontic-cases?${params}`, {
    headers: getAuthHeaders(),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return { data: json.data, meta: json.meta };
}

async function fetchCaseById(caseId: string): Promise<OrthodonticCaseDTO> {
  const res = await fetch(`${BASE_URL}/orthodontic-cases/${caseId}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<OrthodonticCaseDTO>(res);
}

async function updateCaseStatus(
  caseId: string,
  status: CaseStatus
): Promise<OrthodonticCaseDTO> {
  const res = await fetch(`${BASE_URL}/orthodontic-cases/${caseId}/status`, {
    method:  "PATCH",
    headers: getAuthHeaders(),
    body:    JSON.stringify({ status }),
  });
  return handleResponse<OrthodonticCaseDTO>(res);
}

// ─────────────────────────────────────────────────────────────────────────────
// useCasesByPatient
// Powers SnapshotHistorySidebar + appointment scheduling panel
// ─────────────────────────────────────────────────────────────────────────────

export function useCasesByPatient(
  patientId: string | null,
  status?: CaseStatus
) {
  const query = useQuery({
    queryKey: CASE_KEYS.list(patientId ?? undefined, status),
    queryFn:  () => fetchCasesByPatient(patientId!, status),
    enabled:  !!patientId,
    staleTime: 60_000, // 1 min — cases change infrequently
  });

  return {
    cases:     query.data?.data ?? [] as OrthodonticCaseListItem[],
    total:     query.data?.meta.total ?? 0,
    isLoading: query.isLoading,
    isError:   query.isError,
    error:     query.error,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// useActiveCase
// Convenience — fetches the active/draft case for a patient
// ─────────────────────────────────────────────────────────────────────────────

export function useActiveCase(patientId: string | null) {
  const { cases, isLoading, isError, error } = useCasesByPatient(patientId);
  const active = cases.find(
    (c) => !["completed"].includes(c.status)
  ) ?? null;

  return { activeCase: active, isLoading, isError, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// useCaseById
// ─────────────────────────────────────────────────────────────────────────────

export function useCaseById(caseId: string | null) {
  const query = useQuery({
    queryKey: CASE_KEYS.detail(caseId ?? ""),
    queryFn:  () => fetchCaseById(caseId!),
    enabled:  !!caseId,
    staleTime: 30_000,
  });

  return {
    orthoCase: query.data ?? null as OrthodonticCaseDTO | null,
    isLoading: query.isLoading,
    isError:   query.isError,
    error:     query.error,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// useUpdateCaseStatus
// ─────────────────────────────────────────────────────────────────────────────

export function useUpdateCaseStatus() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ caseId, status }: { caseId: string; status: CaseStatus }) =>
      updateCaseStatus(caseId, status),

    onSuccess: (updated) => {
      // Update the specific case detail in cache
      queryClient.setQueryData(CASE_KEYS.detail(updated.id), updated);

      // Invalidate all list queries — status change affects list filters
      queryClient.invalidateQueries({ queryKey: ["orthodontic-cases", "list"] });
    },
  });

  return {
    updateStatus:      mutation.mutate,
    updateStatusAsync: mutation.mutateAsync,
    isUpdating:        mutation.isPending,
    isSuccess:         mutation.isSuccess,
    isError:           mutation.isError,
    error:             mutation.error,
  };
}
