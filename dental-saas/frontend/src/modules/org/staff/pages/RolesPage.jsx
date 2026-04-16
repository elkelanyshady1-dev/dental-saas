/**
 * RolesPage.jsx — Org Role Management (Phase B)
 *
 * Shows the full list of roles for this org (system + custom) in a card grid
 * and lets admins create, edit, or delete custom roles. The read-only
 * PermissionMatrix remains below the cards as a cross-role reference.
 *
 * Guardrails:
 *   - System roles: Edit opens RoleFormModal in READ-ONLY mode (enforced inside
 *     the modal); Delete is disabled with a tooltip.
 *   - Custom roles in use: Delete is blocked at the UI level when userCount > 0
 *     with a confirmation dialog that tells the admin to reassign first. The
 *     backend double-checks (409 ROLE_IN_USE) — UI only avoids a round-trip.
 *
 * Cross-tab sync:
 *   useStaffChannelListener invalidates STAFF_KEYS.roles + STAFF_KEYS.all so a
 *   rename / delete / assign in one tab propagates to all others.
 */

import { useState, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import SettingsLayout from "@/components/settings/SettingsLayout";
import { useRoles } from "../hooks/useRoles";
import { useDeleteRole } from "../hooks/useRoleMutations";
import RoleFormModal from "../components/RoleFormModal";
import PermissionMatrix from "../components/PermissionMatrix";
import { formatRoleName, getRoleColor } from "../utils/roleFormatter";
import { STAFF_KEYS } from "../constants/queryKeys";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { useStaffChannelListener } from "@/lib/realtime/staffChannel";

// ─── Delete confirmation dialog ──────────────────────────────────────────────

function DeleteConfirmDialog({ role, onCancel, onConfirm, pending, error }) {
    const blocked = (role?.userCount || 0) > 0;
    return (
        <div
            className="fixed inset-0 z-[400] flex items-center justify-center p-4"
            style={{ background: "rgba(15,23,42,0.65)", backdropFilter: "blur(8px)" }}
            onClick={onCancel}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start gap-4 mb-5">
                    <div className="w-11 h-11 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                    </div>
                    <div className="flex-1">
                        <h3
                            className="text-lg font-black text-gray-900 mb-1"
                            style={{ fontFamily: "Manrope, sans-serif" }}
                        >
                            Delete role
                        </h3>
                        <p className="text-sm text-gray-500">
                            {blocked ? (
                                <>
                                    <span className="font-semibold text-red-600">
                                        {role.userCount} {role.userCount === 1 ? "user is" : "users are"}
                                    </span>{" "}
                                    currently assigned to{" "}
                                    <span className="font-semibold">{formatRoleName(role.name)}</span>.
                                    Reassign them to another role before deleting.
                                </>
                            ) : (
                                <>
                                    This will permanently delete{" "}
                                    <span className="font-semibold">{formatRoleName(role.name)}</span>.
                                    This action cannot be undone.
                                </>
                            )}
                        </p>
                    </div>
                </div>

                {error && (
                    <div className="mb-4 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 text-xs text-red-600">
                        {error}
                    </div>
                )}

                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={blocked || pending}
                        className={`flex-[2] py-2.5 rounded-xl font-bold text-sm text-white transition-all ${
                            blocked || pending
                                ? "bg-red-300 cursor-not-allowed"
                                : "bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/20"
                        }`}
                    >
                        {pending ? "Deleting…" : blocked ? "Cannot delete" : "Delete role"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Role card ───────────────────────────────────────────────────────────────

function RoleCard({ role, onEdit, onDelete, canManage }) {
    const isSystem = !!role.isSystemRole;
    const userCount = role.userCount || 0;
    const clr = getRoleColor(role.name);

    const permCount = Object.values(role.permissions || {}).flatMap((v) =>
        typeof v === "object" ? Object.values(v).filter(Boolean) : [v],
    ).length;

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-5 flex flex-col">
            <div className="flex items-start justify-between mb-3">
                <div className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold ${clr.bg} ${clr.text}`}>
                    {formatRoleName(role.name)}
                </div>
                {isSystem && (
                    <span className="text-[9px] font-bold uppercase tracking-widest text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                        System
                    </span>
                )}
            </div>

            <p className="text-2xl font-bold text-gray-900 leading-none">{permCount}</p>
            <p className="text-xs text-gray-400 mt-0.5 mb-3">permissions</p>

            {role.description && (
                <p className="text-xs text-gray-500 line-clamp-2 mb-3 flex-1">{role.description}</p>
            )}
            {!role.description && <div className="flex-1" />}

            <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                <div className="flex items-center gap-1 text-[11px] text-gray-500">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="font-semibold">{userCount}</span>
                    <span>{userCount === 1 ? "user" : "users"}</span>
                </div>

                {canManage && (
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => onEdit(role)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-all"
                        >
                            {isSystem ? "View" : "Edit"}
                        </button>
                        <button
                            type="button"
                            onClick={() => onDelete(role)}
                            disabled={isSystem}
                            title={isSystem ? "System roles cannot be deleted" : "Delete role"}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                isSystem
                                    ? "text-gray-300 bg-gray-50 cursor-not-allowed"
                                    : "text-red-600 bg-red-50 hover:bg-red-100"
                            }`}
                        >
                            Delete
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function RolesPage() {
    const qc = useQueryClient();
    const canManage = useCapability(P.STAFF_MANAGE);

    const { data: rolesRaw = [], isLoading, error } = useRoles();
    const deleteRole = useDeleteRole();

    const [showForm, setShowForm] = useState(false);
    const [editingRole, setEditingRole] = useState(null);
    const [deletingRole, setDeletingRole] = useState(null);
    const [deleteError, setDeleteError] = useState(null);

    // Cross-tab sync: another tab created/edited/deleted/assigned a role.
    // Only invalidate STAFF_KEYS.roles here — the emitting tab already
    // invalidated STAFF_KEYS.all locally, and re-invalidating it from the
    // listener would double-refetch on the same tab (echo). StaffPage will
    // own its own listener when it lands in the next pass.
    const onBroadcast = useCallback(() => {
        qc.invalidateQueries({ queryKey: STAFF_KEYS.roles });
    }, [qc]);
    useStaffChannelListener(onBroadcast);

    // Sort: system roles first, then custom roles — both alphabetical.
    const roles = useMemo(() => {
        const arr = Array.isArray(rolesRaw) ? [...rolesRaw] : [];
        return arr.sort((a, b) => {
            const sysA = a.isSystemRole ? 0 : 1;
            const sysB = b.isSystemRole ? 0 : 1;
            if (sysA !== sysB) return sysA - sysB;
            return (a.name || "").localeCompare(b.name || "");
        });
    }, [rolesRaw]);

    const systemCount = roles.filter((r) => r.isSystemRole).length;
    const customCount = roles.length - systemCount;

    // ── Handlers ────────────────────────────────────────────────────────────
    const openCreate = () => {
        setEditingRole(null);
        setShowForm(true);
    };
    const openEdit = (role) => {
        setEditingRole(role);
        setShowForm(true);
    };
    const closeForm = () => {
        setShowForm(false);
        setEditingRole(null);
    };

    const openDelete = (role) => {
        setDeleteError(null);
        setDeletingRole(role);
    };
    const closeDelete = () => {
        setDeletingRole(null);
        setDeleteError(null);
    };
    const handleDelete = async () => {
        if (!deletingRole) return;
        try {
            await deleteRole.mutateAsync(deletingRole._id);
            closeDelete();
        } catch (err) {
            setDeleteError(
                err?.response?.data?.error?.message ||
                    err?.response?.data?.message ||
                    "Failed to delete role",
            );
        }
    };

    // ── Render ──────────────────────────────────────────────────────────────
    return (
        <SettingsLayout
            title="Roles & Permissions"
            description="Create custom roles and fine-tune capabilities for your staff"
            breadcrumb="Roles"
            actions={
                canManage ? (
                    <button
                        type="button"
                        id="new-role-btn"
                        onClick={openCreate}
                        className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white px-4 py-2.5 rounded-xl font-semibold text-sm shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30 active:scale-95 transition-all whitespace-nowrap"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                        New Role
                    </button>
                ) : null
            }
        >
            <div className="space-y-8">
                {/* Summary line */}
                <p className="text-sm text-gray-500">
                    {systemCount} system {systemCount === 1 ? "role" : "roles"} ·{" "}
                    {customCount} custom {customCount === 1 ? "role" : "roles"}
                </p>

                {/* Error */}
                {error && (
                    <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 text-sm text-rose-600">
                        {error?.response?.data?.error?.message ||
                            error?.response?.data?.message ||
                            error?.message ||
                            "Failed to load roles"}
                    </div>
                )}

                {/* Role cards grid */}
                {isLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {[...Array(8)].map((_, i) => (
                            <div key={i} className="h-44 rounded-2xl bg-gray-100 animate-pulse" />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {roles.map((role) => (
                            <RoleCard
                                key={role._id}
                                role={role}
                                canManage={canManage}
                                onEdit={openEdit}
                                onDelete={openDelete}
                            />
                        ))}

                        {!roles.length && (
                            <div className="col-span-full text-center py-20">
                                <p className="text-gray-500 font-medium">No roles found</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Read-only cross-role matrix */}
                <div>
                    <h2 className="text-base font-bold text-gray-800 mb-4">Permission Matrix</h2>
                    <PermissionMatrix />
                </div>
            </div>

            {/* Create / Edit modal — RoleFormModal owns create/update
                mutations internally; we just render it open and let its
                onSaved callback fire after a successful write. */}
            {showForm && (
                <RoleFormModal
                    open={showForm}
                    role={editingRole}
                    onClose={closeForm}
                    onSaved={closeForm}
                />
            )}

            {/* Delete confirm */}
            {deletingRole && (
                <DeleteConfirmDialog
                    role={deletingRole}
                    onCancel={closeDelete}
                    onConfirm={handleDelete}
                    pending={deleteRole.isPending}
                    error={deleteError}
                />
            )}
        </SettingsLayout>
    );
}
