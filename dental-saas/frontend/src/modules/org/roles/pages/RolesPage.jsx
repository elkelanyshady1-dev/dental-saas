/**
 * RolesPage.jsx — RBAC Role Permission Matrix Viewer
 * Read-only visualization of org role→permission map.
 * Loads from AuthContext permissions (not a separate API).
 */
import { useAuth } from "@/context/AuthContext";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import SettingsBreadcrumb from "@/components/settings/SettingsBreadcrumb";

const PERMISSION_GROUPS = [
    { label: "Patients", keys: ["patients.read", "patients.create", "patients.update", "patients.delete"] },
    { label: "Appointments", keys: ["appointments.read", "appointments.create", "appointments.update", "appointments.delete"] },
    { label: "Calendar", keys: ["calendar.read", "calendar.multiBranchView", "calendar.selfFilterOnly"] },
    { label: "Users", keys: ["users.read", "users.create", "users.update", "users.delete"] },
    { label: "Branches", keys: ["branches.read", "branches.create", "branches.update", "branches.delete"] },
    { label: "Accounting", keys: ["accounting.read", "accounting.create", "accounting.update", "accounting.delete"] },
    { label: "Orthodontics", keys: ["orthodontics.read", "orthodontics.create", "orthodontics.update", "orthodontics.delete"] },
    { label: "Treatments", keys: ["treatments.read", "treatments.create", "treatments.update", "treatments.delete"] },
    { label: "Invoices", keys: ["invoices.read", "invoices.create", "invoices.update", "invoices.delete"] },
    { label: "Portal", keys: ["portal.read", "portal.manage", "monitoring.review"] },
];

const ROLES = [
    { key: "org_admin", label: "Admin", color: "bg-purple-100 text-purple-700" },
    { key: "doctor", label: "Doctor", color: "bg-blue-100 text-blue-700" },
    { key: "assistant", label: "Assistant", color: "bg-teal-100 text-teal-700" },
    { key: "receptionist", label: "Receptionist", color: "bg-amber-100 text-amber-700" },
    { key: "lab_technician", label: "Lab Tech", color: "bg-slate-100 text-slate-700" },
];

// Static role→permission map reflecting orgPermissions.js
const ROLE_PERMISSIONS = {
    org_admin: [
        "patients.read", "patients.create", "patients.update", "patients.delete",
        "appointments.read", "appointments.create", "appointments.update", "appointments.delete",
        "calendar.read", "calendar.multiBranchView",
        "users.read", "users.create", "users.update", "users.delete",
        "branches.read", "branches.create", "branches.update", "branches.delete",
        "accounting.read", "accounting.create", "accounting.update", "accounting.delete",
        "orthodontics.read", "orthodontics.create", "orthodontics.update", "orthodontics.delete",
        "treatments.read", "treatments.create", "treatments.update", "treatments.delete",
        "invoices.read", "invoices.create", "invoices.update", "invoices.delete",
        "portal.read", "portal.manage", "monitoring.review",
    ],
    doctor: [
        "patients.read", "patients.create", "patients.update",
        "appointments.read", "appointments.create", "appointments.update",
        "calendar.read", "calendar.selfFilterOnly",
        "branches.read",
        "orthodontics.read", "orthodontics.create", "orthodontics.update",
        "treatments.read", "treatments.create", "treatments.update",
        "invoices.read", "invoices.create",
        "portal.read", "monitoring.review",
    ],
    assistant: [
        "patients.read",
        "appointments.read", "appointments.create", "appointments.update",
        "calendar.read",
        "branches.read",
        "treatments.read",
        "invoices.read", "invoices.create", "invoices.update",
        "portal.read",
    ],
    receptionist: [
        "patients.read", "patients.create",
        "appointments.read", "appointments.create", "appointments.update",
        "calendar.read",
        "branches.read",
        "accounting.read",
        "treatments.read",
        "invoices.read", "invoices.create",
        "portal.read",
    ],
    lab_technician: [
        "patients.read",
        "calendar.read",
        "branches.read",
        "orthodontics.read", "orthodontics.update",
    ],
};

export default function RolesPage() {
    return (
        <div className="space-y-6">
            <SettingsBreadcrumb current="Role Permissions" />
            <div>
                <h1 className="text-xl font-bold text-gray-800">Role Permissions</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                    Permission matrix for all organization roles (read-only)
                </p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/50">
                                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                                    Permission
                                </th>
                                {ROLES.map((r) => (
                                    <th key={r.key} className="text-center px-3 py-3">
                                        <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${r.color}`}>
                                            {r.label}
                                        </span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {PERMISSION_GROUPS.map((group) => (
                                <>
                                    {/* Group header */}
                                    <tr key={`header-${group.label}`} className="bg-gray-50/30">
                                        <td colSpan={ROLES.length + 1} className="px-4 py-2">
                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{group.label}</span>
                                        </td>
                                    </tr>
                                    {group.keys.map((perm) => (
                                        <tr key={perm} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                                            <td className="px-4 py-2.5 text-gray-600 font-mono text-xs sticky left-0 bg-white">
                                                {perm}
                                            </td>
                                            {ROLES.map((role) => {
                                                const has = ROLE_PERMISSIONS[role.key]?.includes(perm);
                                                return (
                                                    <td key={`${perm}-${role.key}`} className="text-center px-3 py-2.5">
                                                        {has ? (
                                                            <CheckIcon className="w-4 h-4 text-emerald-500 mx-auto" />
                                                        ) : (
                                                            <XMarkIcon className="w-4 h-4 text-gray-200 mx-auto" />
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-6 text-xs text-gray-400">
                <div className="flex items-center gap-1.5">
                    <CheckIcon className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Granted</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <XMarkIcon className="w-3.5 h-3.5 text-gray-200" />
                    <span>Not granted</span>
                </div>
            </div>
        </div>
    );
}
