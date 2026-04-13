/**
 * orthoTodo.api.ts
 * Domain: ortho-todos
 * Plane: Organization
 *
 * API client for the Orthodontic TODO Engine.
 * organizationId is NEVER sent — derived from JWT on backend.
 */

import api from "@/services/api";

const BASE = "/org/ortho-todos";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TodoType =
  | "BRACKET_REPOSITION"
  | "BOND_BRACKET"
  | "WIRE_BEND"
  | "OCCLUSAL_ADJUSTMENT"
  | "MINISCREW_REINSERTION";

export type TodoStatus   = "pending" | "done" | "skipped";
export type TodoPriority = "low" | "medium" | "high";
export type TodoClinicalPhase = "LEVEL_ALIGNMENT" | "SPACE_MANAGEMENT" | "FINISHING";

export interface TodoDTO {
  id:            string;
  patientId:     string;
  caseId:        string;
  visitId:       string | null;
  type:          TodoType;
  tooth:         string | null;
  surface:       string | null;
  description:   string;
  clinicalPhase: TodoClinicalPhase | null;
  status:        TodoStatus;
  priority:      TodoPriority;
  completedAt:   number | null;
  completedBy:   string | null;
  createdAt:     number | null;
  updatedAt:     number | null;
}

export interface TodoSummaryDTO {
  pending:      number;
  highPriority: number;
}

export interface CreateTodoPayload {
  caseId:        string;
  patientId:     string;
  visitId?:      string | null;
  type:          TodoType;
  tooth?:        string | null;
  surface?:      string | null;
  description:   string;
  clinicalPhase?: TodoClinicalPhase | null;
  priority?:     TodoPriority;
}

export interface PatchTodoPayload {
  description?:   string;
  status?:        TodoStatus;
  priority?:      TodoPriority;
  tooth?:         string | null;
  surface?:       string | null;
  clinicalPhase?: TodoClinicalPhase | null;
  visitId?:       string | null;
}

export interface TodoSuggestion {
  type:          TodoType;
  description:   string;
  tooth?:        string | null;
  surface?:      string | null;
  clinicalPhase: TodoClinicalPhase | null;
  priority:      TodoPriority;
  caseId:        string;
  patientId:     string;
  visitId?:      string | null;
}

// ── API Surface ───────────────────────────────────────────────────────────────

export const orthoTodoApi = {
  /** GET /ortho-todos?caseId=&status= */
  list: (caseId: string, status?: TodoStatus) =>
    api.get<{ success: true; data: TodoDTO[] }>(BASE, { params: { caseId, status } }),

  /** GET /ortho-todos/summary?caseId= */
  summary: (caseId: string) =>
    api.get<{ success: true; data: TodoSummaryDTO }>(`${BASE}/summary`, { params: { caseId } }),

  /** GET /ortho-todos/suggest?caseId=&wireType=&alignment=&tooth=&patientId= */
  suggest: (params: {
    caseId:     string;
    patientId:  string;
    wireType?:  string;
    alignment?: string;
    tooth?:     string;
  }) => api.get<{
    success: true;
    data: { suggestedClinicalPhase: TodoClinicalPhase | null; suggestedTodos: TodoSuggestion[] }
  }>(`${BASE}/suggest`, { params }),

  /** POST /ortho-todos */
  create: (payload: CreateTodoPayload) =>
    api.post<{ success: true; data: TodoDTO }>(BASE, payload),

  /** PATCH /ortho-todos/:id */
  patch: (id: string, payload: PatchTodoPayload) =>
    api.patch<{ success: true; data: TodoDTO }>(`${BASE}/${id}`, payload),

  /** DELETE /ortho-todos/:id (soft delete) */
  remove: (id: string) =>
    api.delete<{ success: true; data: { id: string } }>(`${BASE}/${id}`),
};
