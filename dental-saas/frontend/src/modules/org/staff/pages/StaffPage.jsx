/**
 * StaffPage.jsx — Staff Management Page (MedCore Card Grid Design)
 * React Query SSOT. No useState for server data.
 * Clicking card → StaffProfileModal. Add Staff → StaffFormModal.
 */
import { useState, useDeferredValue, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { useAuth } from "@/context/AuthContext";
import { useStaffChannelListener } from "@/lib/realtime/staffChannel";

import { STAFF_KEYS } from "../constants/queryKeys";
import { useStaff } from "../hooks/useStaff";
import { useRoles } from "../hooks/useRoles";
import { useCreateStaff } from "../hooks/useCreateStaff";
import { useUpdateStaff } from "../hooks/useUpdateStaff";
import { useDeactivateStaff } from "../hooks/useDeactivateStaff";
import { staffApi } from "../api/staff.api";

import StaffFormModal from "../components/StaffFormModal";
import StaffProfileModal from "../components/StaffProfileModal";
import { formatRoleName, getRoleColor } from "../utils/roleFormatter";

// ── Role badge color map
const ROLE_BADGE_COLORS = {
    doctor: "bg-blue-100 text-blue-700",
    assistant: "bg-green-100 text-green-700",
    secretary: "bg-purple-100 text-purple-700",
    admin: "bg-red-100 text-red-700",
    org_admin: "bg-orange-100 text-orange-700",
    receptionist: "bg-amber-100 text-amber-700",
};

function getBadgeColor(roleName) {
    const n = roleName?.toLowerCase() || "";
    for (const [key, val] of Object.entries(ROLE_BADGE_COLORS)) {
        if (n.includes(key)) return val;
    }
    return "bg-gray-100 text-gray-600";
}

function getAvatarGradient(name) {
    const colors = [
        "from-blue-500 to-blue-700",
        "from-violet-500 to-violet-700",
        "from-emerald-500 to-emerald-700",
        "from-amber-500 to-amber-700",
        "from-rose-500 to-rose-700",
        "from-teal-500 to-teal-700",
    ];
    const idx = (name?.charCodeAt(0) || 0) % colors.length;
    return colors[idx];
}

// ── Staff Card
function StaffCard({ user, onView }) {
    const roleName = user.roleId?.name || user.role || "";
    const displayName = user.firstName
        ? `${user.firstName} ${user.lastName || ""}`.trim()
        : user.name || "—";
    const initial = displayName[0]?.toUpperCase() || "?";
    const badgeCls = getBadgeColor(roleName);
    const grad = getAvatarGradient(displayName);
    const isActive = user.isActive !== false;

    return (
        <div
            className="bg-white rounded-2xl p-6 cursor-pointer group hover:shadow-xl hover:shadow-blue-600/5 hover:-translate-y-0.5 transition-all duration-200 relative overflow-hidden border border-gray-100"
            onClick={() => onView(user)}
        >
            {/* Hover glow */}
            <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-blue-50 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none" />

            <div className="flex justify-between items-start mb-5 relative z-10">
                {/* Avatar + status dot */}
                <div className="relative">
                    <div className="w-20 h-20 rounded-full overflow-hidden ring-4 ring-gray-50 shadow-lg">
                        {user.profileImage ? (
                            <img
                                src={user.profileImage}
                                alt={displayName}
                                className="w-full h-full object-cover"
                                onError={(e) => { e.target.style.display = "none"; }}
                            />
                        ) : (
                            <div className={`w-full h-full bg-gradient-to-br ${grad} flex items-center justify-center`}>
                                <span className="text-2xl font-bold text-white">{initial}</span>
                            </div>
                        )}
                    </div>
                    <div className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-white ${isActive ? "bg-green-500" : "bg-gray-300"}`} />
                </div>

                {/* More button */}
                <button
                    className="p-2 text-gray-400 hover:bg-gray-50 rounded-full transition-all opacity-0 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); onView(user); }}
                >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                    </svg>
                </button>
            </div>

            <div className="relative z-10">
                {/* Role badge */}
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold mb-2 ${badgeCls}`}>
                    {formatRoleName(roleName)}
                </span>

                {/* Name */}
                <h3 className="text-lg font-extrabold text-gray-900 leading-tight mb-0.5" style={{ fontFamily: "Manrope, sans-serif" }}>
                    {displayName}
                </h3>
                {user.jobTitle && (
                    <p className="text-blue-600 font-medium text-sm mb-3">{user.jobTitle}</p>
                )}
                {user.speciality && !user.jobTitle && (
                    <p className="text-blue-600 font-medium text-sm mb-3">{user.speciality}</p>
                )}

                {/* Meta info */}
                <div className="space-y-2 pt-4 border-t border-gray-50">
                    {user.email && (
                        <div className="flex items-center gap-2 text-gray-400">
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            <span className="text-xs truncate">{user.email}</span>
                        </div>
                    )}
                    <div className="flex items-center gap-2 text-gray-400">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className={`text-xs font-semibold ${isActive ? "text-green-600" : "text-gray-400"}`}>
                            {isActive ? "Active" : "Inactive"}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── "Add New Member" CTA card
function AddMemberCard({ onClick }) {
    return (
        <button
            id="add-member-card"
            onClick={onClick}
            className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center gap-4 group hover:bg-gray-100/60 hover:border-blue-200 transition-all duration-200 min-h-[240px]"
        >
            <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-blue-600 shadow-sm group-hover:scale-110 group-hover:shadow-md transition-all duration-200">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
            </div>
            <div className="text-center">
                <p className="font-extrabold text-gray-800" style={{ fontFamily: "Manrope, sans-serif" }}>Add New Member</p>
                <p className="text-xs text-gray-400 mt-1">Assign roles and permissions</p>
            </div>
        </button>
    );
}

// ── Filter bar
function FilterBar({ roles, filters, onChange }) {
    const safeRoles = Array.isArray(roles) ? roles : [];
    return (
        <section className="bg-gray-50 rounded-2xl p-4 flex flex-wrap items-center gap-3 mb-8">
            {/* Filter label */}
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl text-sm font-semibold text-gray-500 border border-gray-100">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                </svg>
                <span>Filters</span>
            </div>

            {/* Role */}
            <select
                id="filter-roleId"
                value={filters.roleId || ""}
                onChange={(e) => onChange({ ...filters, roleId: e.target.value || undefined })}
                className="bg-white border border-gray-100 rounded-xl px-4 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer hover:bg-gray-50 transition"
            >
                <option value="">All Roles</option>
                {safeRoles.map((r) => (
                    <option key={r._id} value={r._id}>{formatRoleName(r.name)}</option>
                ))}
            </select>

            {/* Status */}
            <select
                id="filter-isActive"
                value={filters.isActive ?? ""}
                onChange={(e) => onChange({ ...filters, isActive: e.target.value === "" ? undefined : e.target.value === "true" })}
                className="bg-white border border-gray-100 rounded-xl px-4 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer hover:bg-gray-50 transition"
            >
                <option value="">All Status</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
            </select>

            {/* Clear */}
            {(filters.roleId || filters.isActive !== undefined) && (
                <button
                    id="filter-clear"
                    onClick={() => onChange({})}
                    className="ml-auto text-sm font-semibold text-blue-600 px-3 py-2 hover:bg-blue-50 rounded-xl transition-all"
                >
                    Clear All
                </button>
            )}
        </section>
    );
}

// ── Main page
export default function StaffPage() {
    const qc = useQueryClient();
    const canCreate = useCapability(P.USERS_CREATE);
    const canUpdate = useCapability(P.USERS_UPDATE);
    const { user } = useAuth();

    // Cross-tab sync: another tab changed a role — staff list shows role
    // names per user, so invalidate the staff list to pick up renames.
    const onBroadcast = useCallback(() => {
        qc.invalidateQueries({ queryKey: STAFF_KEYS.all });
    }, [qc]);
    useStaffChannelListener(onBroadcast);
    // orgSlug sourced from auth profile (organization.slug) — SSOT
    const orgSlug = user?.organization?.slug || "";

    const [rawFilters, setRawFilters] = useState({});
    const [search, setSearch] = useState("");
    const deferredSearch = useDeferredValue(search);
    const [showCreate, setShowCreate] = useState(false);
    const [viewingStaff, setViewingStaff] = useState(null);

    const filters = { ...rawFilters, search: deferredSearch };

    const { data, isLoading, error } = useStaff(filters);
    const { data: roles = [] } = useRoles();

    const users = data?.users ?? [];
    const pagination = data?.pagination;

    const createStaff = useCreateStaff();
    const updateStaff = useUpdateStaff();
    const deactivateStaff = useDeactivateStaff();

    const handleCreate = async (formData, uploadFile) => {
        const result = await createStaff.mutateAsync(formData);
        // If user uploaded a custom photo, upload it AFTER user is created
        if (uploadFile && result?.data?.data?._id) {
            try {
                await staffApi.uploadAvatar(result.data.data._id, uploadFile);
            } catch (_) { /* non-blocking */ }
        }
        // Return the full result so StaffFormModal can extract the generated email
        return result;
    };

    return (
        <div className="min-h-screen bg-gray-50/30">
            <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10">

                {/* ── Hero Header ── */}
                <section className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
                    <div>
                        <h1
                            className="text-4xl font-extrabold tracking-tight text-gray-900 mb-2"
                            style={{ fontFamily: "Manrope, sans-serif" }}
                        >
                            Staff &amp; Members
                        </h1>
                        <p className="text-gray-500 text-base">Manage your clinic team and access control</p>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Search */}
                        <div className="relative w-72">
                            <svg
                                className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                id="staff-search"
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search staff members..."
                                className="w-full bg-white border border-gray-200 rounded-xl py-3 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-sm transition-all shadow-sm"
                            />
                        </div>

                        {/* Add Staff */}
                        {canCreate && (
                            <button
                                id="add-staff-btn"
                                onClick={() => setShowCreate(true)}
                                className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white px-5 py-3 rounded-xl font-semibold text-sm shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30 active:scale-95 transition-all whitespace-nowrap"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                </svg>
                                Add Staff
                            </button>
                        )}
                    </div>
                </section>

                {/* ── Filter Bar ── */}
                <FilterBar roles={roles} filters={rawFilters} onChange={setRawFilters} />

                {/* ── Error ── */}
                {error && (
                    <div className="mb-6 bg-red-50 border border-red-100 rounded-2xl px-5 py-4 text-sm text-red-600">
                        {error?.response?.data?.message || "Failed to load staff members"}
                    </div>
                )}

                {/* ── Loading skeleton ── */}
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 animate-pulse">
                                <div className="w-20 h-20 rounded-full bg-gray-100 mb-4" />
                                <div className="h-3 w-16 bg-gray-100 rounded-full mb-2" />
                                <div className="h-5 w-32 bg-gray-100 rounded-full mb-1" />
                                <div className="h-4 w-24 bg-gray-100 rounded-full" />
                            </div>
                        ))}
                    </div>
                ) : (
                    <>
                        {/* ── Card Grid ── */}
                        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                            {users.map((user) => (
                                <StaffCard
                                    key={user._id}
                                    user={user}
                                    onView={setViewingStaff}
                                />
                            ))}

                            {/* Add Member CTA */}
                            {canCreate && <AddMemberCard onClick={() => setShowCreate(true)} />}
                        </section>

                        {/* ── Empty state ── */}
                        {!users.length && !canCreate && (
                            <div className="text-center py-20">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                </div>
                                <p className="text-gray-500 font-medium">No staff members found</p>
                                <p className="text-sm text-gray-400 mt-1">Try adjusting your filters</p>
                            </div>
                        )}
                    </>
                )}

                {/* ── Pagination Footer ── */}
                {pagination?.total > 0 && (
                    <footer className="mt-14 flex flex-col md:flex-row items-center justify-between py-5 border-t border-gray-100">
                        <p className="text-sm text-gray-400">
                            Showing <span className="font-bold text-gray-800">{users.length}</span> members out of{" "}
                            <span className="font-bold text-gray-800">{pagination.total}</span> total staff
                        </p>
                    </footer>
                )}
            </div>

            {/* ── Create Modal ── */}
            {showCreate && (
                <StaffFormModal
                    roles={roles}
                    orgSlug={orgSlug}
                    onSave={handleCreate}
                    onClose={() => setShowCreate(false)}
                    isSaving={createStaff.isPending}
                />
            )}

            {/* ── Profile Modal ── */}
            {viewingStaff && (
                <StaffProfileModal
                    staff={viewingStaff}
                    roles={roles}
                    onClose={() => setViewingStaff(null)}
                />
            )}
        </div>
    );
}
