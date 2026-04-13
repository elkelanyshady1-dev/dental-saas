/**
 * StaffTable.jsx — Staff member data table
 * Phase 4.1 — formatRoleName from roleFormatter utility.
 * Phase 4.3 — Per-row loading state on Deactivate.
 */
import { useState } from "react";
import { formatRoleName, getRoleColor } from "../utils/roleFormatter";

export default function StaffTable({ users = [], onEdit, onDelete, isDeleting = false }) {
    const [deletingId, setDeletingId] = useState(null);

    const safeUsers = Array.isArray(users) ? users : [];

    const handleDelete = async (id) => {
        setDeletingId(id);
        try {
            await onDelete(id);
        } finally {
            setDeletingId(null);
        }
    };

    if (safeUsers.length === 0) {
        return (
            <div className="text-center py-20 text-gray-400">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
                    <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
                    </svg>
                </div>
                <p className="text-base font-medium text-gray-500 mb-1">No staff members</p>
                <p className="text-sm">Add your first team member to get started.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                        <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Email</th>
                        <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                        <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {safeUsers.map((u) => {
                        const roleName = u.roleId?.name || u.role || "";
                        const roleColor = getRoleColor(roleName);
                        const displayName = u.firstName
                            ? `${u.firstName} ${u.lastName || ""}`.trim()
                            : u.name || "—";
                        const initials = (displayName[0] || "?").toUpperCase();
                        const isThisDeleting = deletingId === u._id;

                        return (
                            <tr key={u._id} className="hover:bg-gray-50/50 transition-colors">
                                {/* Name + avatar */}
                                <td className="px-5 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm">
                                            {initials}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-800 leading-tight">{displayName}</p>
                                            {u.jobTitle && <p className="text-[11px] text-gray-400 mt-0.5">{u.jobTitle}</p>}
                                        </div>
                                    </div>
                                </td>

                                {/* Email */}
                                <td className="px-5 py-4 text-gray-500 hidden sm:table-cell">{u.email}</td>

                                {/* Role badge */}
                                <td className="px-5 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${roleColor.bg} ${roleColor.text}`}>
                                        {formatRoleName(roleName)}
                                    </span>
                                </td>

                                {/* Status dot */}
                                <td className="px-5 py-4">
                                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${u.isActive !== false ? "text-emerald-600" : "text-gray-400"}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${u.isActive !== false ? "bg-emerald-500 animate-pulse" : "bg-gray-300"}`} />
                                        {u.isActive !== false ? "Active" : "Inactive"}
                                    </span>
                                </td>

                                {/* Actions */}
                                <td className="px-5 py-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        {onEdit && (
                                            <button
                                                id={`staff-edit-${u._id}`}
                                                onClick={() => onEdit(u)}
                                                disabled={isThisDeleting}
                                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-40"
                                            >
                                                Edit
                                            </button>
                                        )}
                                        {onDelete && (
                                            <button
                                                id={`staff-deactivate-${u._id}`}
                                                onClick={() => handleDelete(u._id)}
                                                disabled={isThisDeleting || isDeleting}
                                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-40"
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
