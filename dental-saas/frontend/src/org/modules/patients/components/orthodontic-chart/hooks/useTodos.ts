/**
 * useTodos.ts
 * Domain: ortho-todos
 * Layer: Frontend > Hooks
 *
 * React Query hooks for the Orthodontic TODO Engine.
 * All server state lives here — NEVER useState(apiData).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  orthoTodoApi,
  TodoDTO,
  TodoStatus,
  CreateTodoPayload,
  PatchTodoPayload,
} from "../api/orthoTodo.api";

// ── Query Key Factory ─────────────────────────────────────────────────────────

export const TODO_KEYS = {
  all:     (caseId: string)                  => ["ortho-todos", caseId] as const,
  list:    (caseId: string, status?: string) => ["ortho-todos", caseId, "list", status ?? "all"] as const,
  summary: (caseId: string)                  => ["ortho-todos", caseId, "summary"] as const,
};

// ── useTodos — full list for a case ──────────────────────────────────────────

export function useTodos(caseId: string | null | undefined, status?: TodoStatus) {
  return useQuery({
    queryKey:  TODO_KEYS.list(caseId ?? "", status),
    queryFn:   () => orthoTodoApi.list(caseId!, status).then(r => r.data.data),
    enabled:   !!caseId,
    staleTime: 30_000,
    select:    (data: TodoDTO[]) => {
      // Sort: high priority first, then newest
      const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return [...data].sort((a, b) => {
        const pd = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
        if (pd !== 0) return pd;
        return (b.createdAt ?? 0) - (a.createdAt ?? 0);
      });
    },
  });
}

// ── useTodoSummary — pending count badge ─────────────────────────────────────

export function useTodoSummary(caseId: string | null | undefined) {
  return useQuery({
    queryKey:  TODO_KEYS.summary(caseId ?? ""),
    queryFn:   () => orthoTodoApi.summary(caseId!).then(r => r.data.data),
    enabled:   !!caseId,
    staleTime: 60_000,
  });
}

// ── useCreateTodo ─────────────────────────────────────────────────────────────

export function useCreateTodo(caseId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateTodoPayload) => orthoTodoApi.create(payload).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TODO_KEYS.all(caseId ?? "") });
    },
  });
}

// ── usePatchTodo ──────────────────────────────────────────────────────────────

export function usePatchTodo(caseId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PatchTodoPayload }) =>
      orthoTodoApi.patch(id, payload).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TODO_KEYS.all(caseId ?? "") });
    },
  });
}

// ── useDeleteTodo ─────────────────────────────────────────────────────────────

export function useDeleteTodo(caseId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => orthoTodoApi.remove(id).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TODO_KEYS.all(caseId ?? "") });
    },
  });
}

// ── useBatchCreateTodos — create multiple todos, invalidate once ───────────────

export function useBatchCreateTodos(caseId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payloads: CreateTodoPayload[]) => {
      // Sequential creation prevents race conditions on duplicate checks
      const results: TodoDTO[] = [];
      for (const p of payloads) {
        const r = await orthoTodoApi.create(p).then(res => res.data.data);
        results.push(r);
      }
      return results;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TODO_KEYS.all(caseId ?? "") });
    },
  });
}
