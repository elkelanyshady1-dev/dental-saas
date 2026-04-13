/**
 * PermissionMatrix.jsx — Dynamic role-permission matrix
 * Phase 6 — Dynamic from API, NO static ROLE_PERMISSIONS map.
 *
 * Renders a table: rows = permission groups, columns = roles.
 * All data comes from the roles API response (GET /org/roles).
 */
import { useRoles } from "../hooks/useRoles";
import { flattenRolePermissions, groupPermissionsByModule } from "../utils/permissionMapper";
import { formatRoleName } from "../utils/roleFormatter";

// Ordered module display config
const MODULE_DISPLAY = {
    patients: { label: "Patients", icon: "👤" },
    appointments: { label: "Appointments", icon: "📅" },
    treatments: { label: "Treatments", icon: "🦷" },
    users: { label: "Staff", icon: "👥" },
    branches: { label: "Branches", icon: "🏢" },
    accounting: { label: "Finance", icon: "💰" },
    inventory: { label: "Inventory", icon: "📦" },
    security: { label: "Security", icon: "🔒" },
    analytics: { label: "Analytics", icon: "📊" },
    support: { label: "Support", icon: "💬" },
    lab: { label: "Lab", icon: "🔬" },
    orthodontics: { label: "Orthodontics", icon: "😁" },
};

export default function PermissionMatrix() {
    const { data: roles = [], isLoading, error } = useRoles();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-[3px] border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 text-sm text-rose-600">
                Failed to load permission matrix. Please refresh.
            </div>
        );
    }

    if (!roles.length) {
        return <p className="text-sm text-gray-400 text-center py-8">No roles configured.</p>;
    }

    // Build set of all unique permission strings across all roles
    const allActions = new Set();
    const rolePermMaps = roles.map((role) => {
        const flatPerms = flattenRolePermissions(role.permissions || {});
        flatPerms.forEach((p) => allActions.add(p));
        return { role, flatPerms };
    });

    // Group by module
    const grouped = groupPermissionsByModule([...allActions]);
    const modules = Object.keys(grouped).sort();

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[180px]">
                            Permission
                        </th>
                        {roles.map((role) => (
                            <th key={role._id} className="text-center px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                                {formatRoleName(role.name)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {modules.map((module, mIdx) => {
                        const { label, icon } = MODULE_DISPLAY[module] || { label: module, icon: "⚙️" };
                        const actions = grouped[module].sort();

                        return (
                            <>
                                {/* Module group header */}
                                <tr key={`mod-${module}`} className={mIdx > 0 ? "border-t-2 border-gray-100" : ""}>
                                    <td
                                        colSpan={roles.length + 1}
                                        className="px-5 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50/40"
                                    >
                                        {icon} {label}
                                    </td>
                                </tr>
                                {/* Permission rows */}
                                {actions.map((action) => {
                                    const permKey = `${module}.${action}`;
                                    return (
                                        <tr key={permKey} className="border-t border-gray-50 hover:bg-gray-50/30">
                                            <td className="px-5 py-3 text-gray-600">
                                                <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                                    {action}
                                                </span>
                                            </td>
                                            {rolePermMaps.map(({ role, flatPerms }) => (
                                                <td key={role._id} className="px-4 py-3 text-center">
                                                    {flatPerms.has(permKey) ? (
                                                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100">
                                                            <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100">
                                                            <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </span>
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
