/**
 * StaffProfileModal.jsx — Staff Member Profile Viewer
 *
 * "Edit Profile" → opens StaffFormModal (full edit with role assignment).
 * roles comes as a PROP (loaded in StaffPage) — avoids the 401 race condition
 * that occurs when useRoles() fires immediately after login/token refresh.
 *
 * profileImage: shows real photo/avatar if set; falls back to gradient initial.
 */
import { useState } from "react";
import { formatRoleName, getRoleColor } from "../utils/roleFormatter";
import { useUpdateStaff } from "../hooks/useUpdateStaff";
import { useDeactivateStaff } from "../hooks/useDeactivateStaff";
import StaffFormModal from "./StaffFormModal";
import AppModal from "@/components/ui/AppModal";

// ── Permission chip (read-only display)
function PermChip({ label }) {
    return (
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border-2 border-blue-100 bg-white">
            <span className="text-sm font-medium text-gray-800">{label}</span>
            <div className="w-10 h-5 rounded-full bg-blue-600 relative flex-shrink-0">
                <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full" />
            </div>
        </div>
    );
}

function InfoRow({ label, value }) {
    return (
        <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
            <p className="font-semibold text-gray-900 text-sm">{value || "—"}</p>
        </div>
    );
}

export default function StaffProfileModal({ staff, roles = [], onClose }) {
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDeactivateModal, setShowDeactivateModal] = useState(false);

    const updateStaff = useUpdateStaff();
    const deactivateStaff = useDeactivateStaff();

    // ── Derived values
    const roleName = staff.roleId?.name || staff.role || "";
    const roleColor = getRoleColor(roleName);
    const displayName = staff.firstName
        ? `${staff.firstName} ${staff.lastName || ""}`.trim()
        : staff.name || "—";
    const initial = (displayName[0] || "?").toUpperCase();

    // ── Permission list from populated roleId or default fallback
    const permissions = (() => {
        const perms = staff.roleId?.permissions;
        if (!perms || typeof perms !== "object") return [];
        return Object.entries(perms).flatMap(([mod, actions]) =>
            typeof actions === "object"
                ? Object.entries(actions).filter(([, v]) => v).map(([a]) => `${mod}.${a}`)
                : []
        );
    })();

    // ── Deactivate
    const handleDeactivate = async () => {
        await deactivateStaff.mutateAsync(staff._id);
        setShowDeactivateModal(false);
        onClose();
    };

    // ── Save from edit modal
    const handleSave = async (formData) => {
        await updateStaff.mutateAsync({ id: staff._id, data: formData });
        setShowEditModal(false);
        onClose();
    };

    // Show edit modal on top
    if (showEditModal) {
        return (
            <StaffFormModal
                staff={staff}
                roles={roles}
                onSave={handleSave}
                onClose={() => setShowEditModal(false)}
                isSaving={updateStaff.isPending}
            />
        );
    }

    return (
        <div
            className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-6"
            style={{ background: "rgba(15,23,42,0.5)", backdropFilter: "blur(6px)" }}
        >
            <div
                className="w-full max-w-4xl flex flex-col rounded-2xl shadow-2xl bg-white overflow-hidden"
                style={{ maxHeight: "94vh" }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── Header / Hero */}
                <div className="px-8 py-6 bg-gray-50 flex flex-col sm:flex-row items-center gap-6 relative border-b border-gray-100">
                    {/* Avatar — shows profileImage if set */}
                    <div className="relative flex-shrink-0">
                        <div className="w-28 h-28 rounded-2xl overflow-hidden shadow-xl ring-4 ring-white">
                            {staff.profileImage ? (
                                <img
                                    src={staff.profileImage}
                                    alt={displayName}
                                    className="w-full h-full object-cover"
                                    onError={(e) => { e.target.style.display = "none"; }}
                                />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
                                    <span className="text-4xl font-extrabold text-white">{initial}</span>
                                </div>
                            )}
                        </div>
                        <div className={`absolute -bottom-2 -right-2 w-6 h-6 rounded-full border-4 border-white shadow-sm ${staff.isActive !== false ? "bg-green-500" : "bg-gray-300"}`} />
                    </div>

                    {/* Identity */}
                    <div className="flex-1 text-center sm:text-left">
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mb-1">
                            <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight" style={{ fontFamily: "Manrope, sans-serif" }}>
                                {displayName}
                            </h2>
                            <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${roleColor.bg} ${roleColor.text}`}>
                                {formatRoleName(roleName)}
                            </span>
                            <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${staff.isActive !== false ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                {staff.isActive !== false ? "Active" : "Inactive"}
                            </span>
                        </div>
                        {staff.jobTitle && <p className="text-gray-500 font-medium text-sm mb-1">{staff.jobTitle}</p>}
                        <div className="flex flex-wrap justify-center sm:justify-start gap-4 mt-2">
                            <div className="flex items-center gap-1.5 text-sm text-gray-600">
                                <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                {staff.email}
                                {staff.isSystemGenerated && (
                                    <span className="ml-1 text-[10px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                                        Clinic
                                    </span>
                                )}
                            </div>
                            {staff.phone && (
                                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                    </svg>
                                    {staff.phone}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Close */}
                    <button id="staff-profile-close" onClick={onClose}
                        className="absolute top-5 right-5 p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* ── Scrollable body */}
                <div className="flex-1 overflow-y-auto p-8 space-y-8">

                    {/* Info grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <section className="space-y-4">
                            <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                                </svg>
                                <h3 className="font-bold text-gray-800" style={{ fontFamily: "Manrope, sans-serif" }}>Basic Information</h3>
                            </div>
                            <div className="bg-gray-50 rounded-2xl p-5 space-y-4">
                                <InfoRow label="Legal Name" value={displayName} />
                                <InfoRow label="Job Title" value={staff.jobTitle} />
                                <InfoRow label="Phone" value={staff.phone} />
                                <InfoRow
                                    label={staff.isSystemGenerated ? "Clinic Login Email" : "Email"}
                                    value={staff.email}
                                />
                                {staff.isSystemGenerated && (
                                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-100">
                                        <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <p className="text-xs text-blue-600">System-generated clinic email — not a personal address</p>
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="space-y-4">
                            <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z" />
                                </svg>
                                <h3 className="font-bold text-gray-800" style={{ fontFamily: "Manrope, sans-serif" }}>Professional Info</h3>
                            </div>
                            <div className="bg-gray-50 rounded-2xl p-5 space-y-4">
                                <InfoRow label="Speciality" value={staff.speciality} />
                                <InfoRow label="Role" value={formatRoleName(roleName)} />
                                <InfoRow label="Account Status" value={staff.isActive !== false ? "Active" : "Inactive"} />
                                <InfoRow label="Full Branch Access" value={staff.hasFullBranchAccess ? "Yes" : "No"} />
                            </div>
                        </section>
                    </div>

                    {/* Role & Permissions */}
                    <section className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                                </svg>
                                <h3 className="font-bold text-gray-800" style={{ fontFamily: "Manrope, sans-serif" }}>Role &amp; Permissions</h3>
                            </div>
                            <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${roleColor.bg} ${roleColor.text}`}>
                                {formatRoleName(roleName)}
                            </span>
                        </div>
                        <div className="bg-gray-50 rounded-2xl p-5">
                            {permissions.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-4">No permission data available for this role</p>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {permissions.slice(0, 9).map((perm) => (
                                        <PermChip key={perm} label={perm} />
                                    ))}
                                </div>
                            )}
                            {permissions.length > 9 && (
                                <p className="text-xs text-gray-400 text-center mt-3">+{permissions.length - 9} more permissions</p>
                            )}
                        </div>
                    </section>

                    {/* Security & Danger Zone */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                            </svg>
                            <h3 className="font-bold text-gray-800" style={{ fontFamily: "Manrope, sans-serif" }}>Security &amp; Access</h3>
                        </div>
                        <div className="bg-gray-50 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
                            <div className="grid grid-cols-2 gap-5">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-white border border-gray-100 flex items-center justify-center shadow-sm">
                                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Last Active</p>
                                        <p className="text-sm font-semibold text-gray-800">
                                            {staff.lastLogin ? new Date(staff.lastLogin).toLocaleDateString() : "—"}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-white border border-gray-100 flex items-center justify-center shadow-sm">
                                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Authentication</p>
                                        <p className="text-sm font-semibold text-gray-800">Password</p>
                                    </div>
                                </div>
                            </div>

                            {staff.isActive !== false && (
                                <button
                                    id="staff-deactivate-btn"
                                    onClick={() => setShowDeactivateModal(true)}
                                    disabled={deactivateStaff.isPending}
                                    className="px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-all flex items-center gap-2 disabled:opacity-50 shadow-sm"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                    </svg>
                                    {deactivateStaff.isPending ? "Deactivating..." : "Deactivate Account"}
                                </button>
                            )}
                        </div>
                    </section>
                </div>

                {/* ── Footer */}
                <div className="px-8 py-5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                    <button
                        id="edit-profile-btn"
                        onClick={() => setShowEditModal(true)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit Profile
                    </button>
                    <button onClick={onClose}
                        className="px-6 py-2.5 rounded-xl text-sm font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors">
                        Close
                    </button>
                </div>
            </div>

            {showDeactivateModal && (
                <AppModal
                    isOpen={showDeactivateModal}
                    onClose={() => setShowDeactivateModal(false)}
                    onConfirm={handleDeactivate}
                    title="Deactivate Staff Member"
                    message={`Deactivate ${displayName}? They will lose access immediately.`}
                    variant="danger"
                    confirmText="Deactivate"
                />
            )}
        </div>
    );
}
