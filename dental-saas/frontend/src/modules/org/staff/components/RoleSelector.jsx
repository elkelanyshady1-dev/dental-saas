/**
 * RoleSelector.jsx — Reusable role dropdown component
 * Used in StaffFormModal. Guards against non-array roles (Phase 1.2).
 * IMPORTANT: No label rendered — parent <Field> provides the label.
 */
import { formatRoleName } from "../utils/roleFormatter";

export default function RoleSelector({ roles = [], value, onChange, required = false, disabled = false }) {
    const safeRoles = Array.isArray(roles) ? roles : [];

    return (
        <select
            id="staff-roleId"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled || safeRoles.length === 0}
            className="w-full px-4 py-3 rounded-xl bg-gray-50 border-0 ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-500 transition text-gray-900 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            required={required}
        >
            {safeRoles.length === 0 ? (
                <option value="">No roles available</option>
            ) : (
                safeRoles.map((r) => (
                    <option key={r._id} value={r._id}>
                        {formatRoleName(r.name)}
                    </option>
                ))
            )}
        </select>
    );
}
