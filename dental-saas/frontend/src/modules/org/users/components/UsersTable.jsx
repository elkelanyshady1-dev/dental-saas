/**
 * UsersTable.jsx — Staff Users Table
 * Displays org staff with role badge, branch, status.
 * FLS: Phase E.1 — email column protected by FieldVisible
 * Phase 4.1 — replace(/_/g, " ") for role names
 * Phase 4.3 — loading states on action buttons
 */
import { useState } from "react";
import { Badge } from "@/design-system";
import { FieldVisible } from "@/context/ResourceCapabilityContext";

const ROLE_COLORS = {
    org_admin: { bg: "bg-purple-100", text: "text-purple-700" },
    doctor: { bg: "bg-blue-100", text: "text-blue-700" },
    assistant: { bg: "bg-teal-100", text: "text-teal-700" },
    receptionist: { bg: "bg-amber-100", text: "text-amber-700" },
    lab_technician: { bg: "bg-slate-100", text: "text-slate-700" },
};

export default function UsersTable({ users, onEdit, onDelete, isDeleting = false }) {
    const [deletingId, setDeletingId] = useState(null);

    const handleDelete = async (id) => {
        setDeletingId(id);
        try {
            await onDelete(id);
        } finally {
            setDeletingId(null);
        }
    };

    if (!Array.isArray(users) || users.length === 0) {
        return (
            <div className="text-center py-16 text-gray-400">
                <p className="text-lg mb-1">No staff members</p>
                <p className="text-sm">Add your first team member to get started.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Name</th>
                        <FieldVisible field="email">
                            <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Email</th>
                        </FieldVisible>
                        <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Role</th>
                        <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Status</th>
                        <th className="text-right px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {users.map((u) => {
                        const roleName = u.roleId?.name || u.role || "—";
                        // Phase 4.1 — replace ALL underscores, not just first
                        const roleDisplay = roleName.replace(/_/g, " ");
                        const roleStyle = ROLE_COLORS[roleName] || { bg: "bg-gray-100", text: "text-gray-600" };
                        const displayName = u.firstName
                            ? `${u.firstName} ${u.lastName || ""}`.trim()
                            : u.name || u.email;

                        const isThisDeleting = deletingId === u._id;

                        return (
                            <tr key={u._id} className="hover:bg-gray-50/50 transition-colors">
                                {/* Name */}
                                <td className="px-5 py-3.5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                            {(displayName[0] || "?").toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-800 leading-tight">{displayName}</p>
                                            {u.jobTitle && (
                                                <p className="text-xs text-gray-400">{u.jobTitle}</p>
                                            )}
                                        </div>
                                    </div>
                                </td>

                                {/* Email — FLS protected */}
                                <FieldVisible field="email">
                                    <td className="px-5 py-3.5 text-gray-500">{u.email}</td>
                                </FieldVisible>

                                {/* Role badge */}
                                <td className="px-5 py-3.5">
                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${roleStyle.bg} ${roleStyle.text}`}>
                                        {roleDisplay}
                                    </span>
                                </td>

                                {/* Status */}
                                <td className="px-5 py-3.5">
                                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${u.isActive !== false ? "text-emerald-600" : "text-gray-400"}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${u.isActive !== false ? "bg-emerald-500" : "bg-gray-300"}`} />
                                        {u.isActive !== false ? "Active" : "Inactive"}
                                    </span>
                                </td>

                                {/* Actions — Phase 4.3: disabled while loading */}
                                <td className="px-5 py-3.5 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        {onEdit && (
                                            <button
                                                id={`edit-user-${u._id}`}
                                                onClick={() => onEdit(u)}
                                                disabled={isThisDeleting}
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                Edit
                                            </button>
                                        )}
                                        {onDelete && (
                                            <button
                                                id={`delete-user-${u._id}`}
                                                onClick={() => handleDelete(u._id)}
                                                disabled={isThisDeleting || isDeleting}
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                {isThisDeleting ? "..." : "Deactivate"}
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
