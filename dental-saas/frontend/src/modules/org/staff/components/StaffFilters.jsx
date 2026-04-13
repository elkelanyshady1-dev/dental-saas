/**
 * StaffFilters.jsx — Search & filter toolbar for StaffPage
 * Phase 7 — UX polish. Separate component per spec.
 *
 * RULE: Filters are UI-state only (useState is ALLOWED for filter fields).
 * The actual data fetching lives in useStaff(filters) — not here.
 */
export default function StaffFilters({ roles = [], filters, onChange }) {
    const safeRoles = Array.isArray(roles) ? roles : [];

    const set = (key, value) => onChange({ ...filters, [key]: value });

    return (
        <div className="flex flex-col sm:flex-row gap-3">
            {/* ── Text search ── */}
            <div className="relative flex-1">
                <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </span>
                <input
                    id="staff-search-input"
                    type="text"
                    placeholder="Search by name or email..."
                    value={filters.search ?? ""}
                    onChange={(e) => set("search", e.target.value || undefined)}
                    className="w-full pl-9 pr-4 h-10 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
            </div>

            {/* ── Role filter ── */}
            <select
                id="staff-role-filter"
                value={filters.roleId ?? ""}
                onChange={(e) => set("roleId", e.target.value || undefined)}
                className="h-10 rounded-xl border border-gray-200 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white"
            >
                <option value="">All Roles</option>
                {safeRoles.map((r) => (
                    <option key={r._id} value={r._id}>
                        {r.name?.replace(/_/g, " ")}
                    </option>
                ))}
            </select>

            {/* ── Active/Inactive status filter ── */}
            <select
                id="staff-status-filter"
                value={filters.isActive === true ? "active" : filters.isActive === false ? "inactive" : "all"}
                onChange={(e) => {
                    const v = e.target.value;
                    set("isActive", v === "active" ? true : v === "inactive" ? false : undefined);
                }}
                className="h-10 rounded-xl border border-gray-200 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white"
            >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
            </select>
        </div>
    );
}
