/**
 * useRoleMutations.js — React Query mutations for org role management
 * Phase B frontend.
 *
 * Four hooks, one file — they share invalidation targets and a single
 * error-shape contract, so keeping them together makes the cache
 * invalidation policy easy to audit in one place.
 *
 *   useCreateRole   → POST   /org/roles
 *   useUpdateRole   → PATCH  /org/roles/:id
 *   useDeleteRole   → DELETE /org/roles/:id
 *   useAssignRole   → POST   /org/users/:userId/role
 *
 * Cache invalidation (CLAUDE.md §13.3 / §13.4):
 *   - All four invalidate STAFF_KEYS.roles (role list).
 *   - Update/Delete also invalidate STAFF_KEYS.roleDetail(id).
 *   - Assign invalidates STAFF_KEYS.all (staff list shows role name per user).
 *   - NO manual refetch() or window.location.reload() anywhere.
 *
 * forceRefresh handling (self-assign):
 *   useAssignRole reads `res.data?.meta?.forceRefresh`. When true, the caller
 *   is expected to trigger the auth-context logout() — this hook does NOT
 *   call logout itself because (a) hooks shouldn't touch navigation, and
 *   (b) the decision to navigate away belongs to the form that opened the
 *   dialog. The hook exposes the flag on the mutation result so the caller
 *   can wire it up in onSuccess.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { staffApi } from "../api/staff.api";
import { STAFF_KEYS } from "../constants/queryKeys";
import { emitStaffUpdate } from "@/lib/realtime/staffChannel";

/**
 * Backend error envelope:
 *   { success: false, error: { message, errorCode, statusCode } }
 * or legacy:
 *   { success: false, message, errorCode }
 *
 * This helper normalizes both so mutation `onError` handlers get a stable shape.
 */
function extractError(err) {
    const res = err?.response?.data;
    return {
        message:
            res?.error?.message ??
            res?.message ??
            err?.message ??
            "Unexpected error",
        errorCode: res?.error?.errorCode ?? res?.errorCode ?? null,
        statusCode: err?.response?.status ?? null,
    };
}

// ─── Create ──────────────────────────────────────────────────────────────────

export function useCreateRole() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => staffApi.createRole(data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: STAFF_KEYS.roles });
            emitStaffUpdate();
        },
        meta: { extractError },
    });
}

// ─── Update ──────────────────────────────────────────────────────────────────

export function useUpdateRole() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, patch }) => staffApi.updateRole(id, patch),
        onSuccess: (_data, { id }) => {
            qc.invalidateQueries({ queryKey: STAFF_KEYS.roles });
            qc.invalidateQueries({ queryKey: STAFF_KEYS.roleDetail(id) });
            // Staff list displays role name per user — invalidate so a
            // rename propagates without a manual refetch.
            qc.invalidateQueries({ queryKey: STAFF_KEYS.all });
            emitStaffUpdate();
        },
        meta: { extractError },
    });
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export function useDeleteRole() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => staffApi.deleteRole(id),
        onSuccess: (_data, id) => {
            qc.invalidateQueries({ queryKey: STAFF_KEYS.roles });
            // Staff list displays role name per user — if anyone was
            // reassigned away from this role pre-delete, the list may
            // still show stale role labels. Invalidate to be safe.
            qc.invalidateQueries({ queryKey: STAFF_KEYS.all });
            // Remove the detail cache entry for the deleted role so a
            // stale detail lookup doesn't re-populate.
            qc.removeQueries({ queryKey: STAFF_KEYS.roleDetail(id) });
            emitStaffUpdate();
        },
        meta: { extractError },
    });
}

// ─── Assign (user-scoped) ────────────────────────────────────────────────────

/**
 * Assign a role to a user. Usage:
 *
 *   const assign = useAssignRole();
 *   const result = await assign.mutateAsync({ userId, roleId });
 *   if (result.forceRefresh) {
 *     // actor reassigned themselves — old JWT carries stale permissions
 *     logout();
 *   }
 *
 * The hook normalizes the Axios response so callers never reach into
 * `res.data.meta.forceRefresh` — that shape is a controller-layer detail
 * and could change. Callers see a stable `{ data, forceRefresh, noop }`.
 *
 * Backend returns:
 *   { success, data: { userId, roleId }, meta: { forceRefresh, noop } }
 */
export function useAssignRole() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ userId, roleId }) => {
            const res = await staffApi.assignUserRole(userId, roleId);
            const body = res?.data ?? {};
            return {
                data: body.data ?? null,
                forceRefresh: body.meta?.forceRefresh === true,
                noop: body.meta?.noop === true,
            };
        },
        onSuccess: (_normalized, { userId }) => {
            // Staff list + the affected user's detail need the new role shown.
            qc.invalidateQueries({ queryKey: STAFF_KEYS.all });
            qc.invalidateQueries({ queryKey: STAFF_KEYS.detail(userId) });
            // Role list userCount changes as users move between roles.
            qc.invalidateQueries({ queryKey: STAFF_KEYS.roles });
            emitStaffUpdate();
        },
        meta: { extractError },
    });
}
