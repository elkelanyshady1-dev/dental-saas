/**
 * RolesPage.jsx — Dynamic Roles & Permissions Page
 * Phase 6 — Dynamic from API. NO static ROLE_PERMISSIONS map.
 *
 * Renders:
 * 1. Role cards row (from GET /org/roles)
 * 2. PermissionMatrix — role × permission grid
 */
import SettingsLayout from "@/components/settings/SettingsLayout";
import { useRoles } from "../hooks/useRoles";
import { formatRoleName, getRoleColor } from "../utils/roleFormatter";
import PermissionMatrix from "../components/PermissionMatrix";

export default function RolesPage() {
    const { data: roles = [], isLoading, error } = useRoles();

    return (
        <SettingsLayout
            title="Roles & Permissions"
            description="View the RBAC permission matrix for each staff role"
            breadcrumb="Roles"
        >
            <div className="space-y-8">
                {/* ── Error ── */}
                {error && (
                    <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 text-sm text-rose-600">
                        {error?.message || "Failed to load roles"}
                    </div>
                )}

                {/* ── Role cards ── */}
                {isLoading ? (
                    <div className="flex gap-4">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="flex-1 h-20 rounded-2xl bg-gray-100 animate-pulse" />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        {roles.map((role) => {
                            const clr = getRoleColor(role.name);
                            const permCount = Object.values(role.permissions || {})
                                .flatMap((v) =>
                                    typeof v === "object" ? Object.values(v).filter(Boolean) : [v]
                                ).length;

                            return (
                                <div
                                    key={role._id}
                                    className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all p-5"
                                >
                                    <div className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold mb-3 ${clr.bg} ${clr.text}`}>
                                        {formatRoleName(role.name)}
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900 leading-none">{permCount}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">permissions</p>
                                    {role.isSystemRole && (
                                        <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400">
                                            🔒 System Role
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── Permission Matrix ── */}
                <div>
                    <h2 className="text-base font-bold text-gray-800 mb-4">Permission Matrix</h2>
                    <PermissionMatrix />
                </div>
            </div>
        </SettingsLayout>
    );
}
