/**
 * RoleFormModal.jsx — Create / Edit a custom org role (Phase B frontend)
 *
 * Modes:
 *   create → empty form, writes via useCreateRole()
 *   edit   → pre-filled from `role` prop, writes via useUpdateRole()
 *
 * System roles (role.isSystemRole === true) are hard-locked to read-only:
 *   - name / description inputs disabled
 *   - permission checkboxes disabled
 *   - Save button hidden
 *   - Lock banner explains why
 * The backend enforces immutability (I1 SYSTEM_ROLE_IMMUTABLE), but the
 * UI must never present a tempting-then-rejected flow.
 *
 * Permission matrix source of truth:
 *   ALL_PERMISSIONS from @/generated/permissionKeys — the auto-generated
 *   mirror of backend/src/rbac/orgPermissions.js. NEVER hardcode keys.
 *
 * Save button is disabled unless:
 *   (a) the form is dirty, AND
 *   (b) at least one permission is granted (matches backend createRoleSchema
 *       which rejects zero-grant roles), AND
 *   (c) the name is non-empty.
 *
 * Error mapping — backend error codes → human messages:
 *   ROLE_NAME_DUPLICATE / ROLE_NAME_ALREADY_EXISTS → name field error
 *   SYSTEM_ROLE_IMMUTABLE                          → banner (should never
 *                                                    reach here; guarded by
 *                                                    read-only mode)
 *   STAFF_MANAGE_LOCKOUT                           → banner (blocks save)
 *   LOCKOUT_PREVENTED_NO_STAFF_MANAGE_ROLE         → banner
 *
 * NOTE: This modal is intentionally decoupled from the existing read-only
 * <PermissionMatrix /> component. That one renders all roles × permissions
 * as a read grid. This modal renders a single editable role's permissions.
 * Merging them would muddle two different UX jobs.
 */

import { useEffect, useMemo, useState } from "react";
import { useCreateRole, useUpdateRole } from "../hooks/useRoleMutations";
import { ALL_PERMISSIONS } from "@/generated/permissionKeys";
import { flattenRolePermissions } from "../utils/permissionMapper";

// ─── Display config for module grouping ─────────────────────────────────────
// Ordering mirrors the read-only PermissionMatrix. Unknown modules (added
// at the backend but not yet listed here) get a default icon + titlecased
// label so nothing silently disappears from the UI.
const MODULE_DISPLAY = {
    patients: { label: "Patients", icon: "👤" },
    appointments: { label: "Appointments", icon: "📅" },
    recalls: { label: "Recalls", icon: "🔔" },
    treatments: { label: "Treatments", icon: "🦷" },
    medical_records: { label: "Medical Records", icon: "📋" },
    users: { label: "Staff", icon: "👥" },
    staff: { label: "Staff Management", icon: "🛡️" },
    branches: { label: "Branches", icon: "🏢" },
    accounting: { label: "Finance", icon: "💰" },
    billing: { label: "Billing", icon: "🧾" },
    billing_settings: { label: "Billing Settings", icon: "⚙️" },
    inventory: { label: "Inventory", icon: "📦" },
    security: { label: "Security", icon: "🔒" },
    analytics: { label: "Analytics", icon: "📊" },
    dashboard: { label: "Dashboard", icon: "🏠" },
    support: { label: "Support", icon: "💬" },
    lab: { label: "Lab", icon: "🔬" },
    orthodontics: { label: "Orthodontics", icon: "😁" },
    communication: { label: "Communication", icon: "📨" },
    storage: { label: "Storage", icon: "💾" },
    documents: { label: "Documents", icon: "📁" },
};

function labelForModule(mod) {
    if (MODULE_DISPLAY[mod]) return MODULE_DISPLAY[mod];
    const label = mod.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return { label, icon: "⚙️" };
}

// ─── Group ALL_PERMISSIONS into { module: [action,...] } ────────────────────
// Computed once at module load (ALL_PERMISSIONS is a frozen const).
const PERMISSION_GROUPS = (() => {
    const groups = {};
    for (const key of ALL_PERMISSIONS) {
        const dot = key.indexOf(".");
        if (dot === -1) continue;
        const mod = key.substring(0, dot);
        const action = key.substring(dot + 1);
        if (!groups[mod]) groups[mod] = [];
        groups[mod].push(action);
    }
    // Sort actions within each module for deterministic rendering.
    for (const mod of Object.keys(groups)) groups[mod].sort();
    return groups;
})();

// Canonical module render order: known modules first (in MODULE_DISPLAY
// order), then any unknown modules alphabetically.
const ORDERED_MODULES = (() => {
    const known = Object.keys(MODULE_DISPLAY).filter((m) => PERMISSION_GROUPS[m]);
    const unknown = Object.keys(PERMISSION_GROUPS)
        .filter((m) => !MODULE_DISPLAY[m])
        .sort();
    return [...known, ...unknown];
})();

// ─── Input style helpers (match StaffFormModal) ─────────────────────────────
const inp = (err, disabled) =>
    `w-full px-4 py-3 rounded-lg bg-white border-0 ring-1 ${
        err ? "ring-red-400 bg-red-50" : "ring-gray-200"
    } ${disabled ? "bg-gray-50 text-gray-400 cursor-not-allowed" : "text-gray-900"} ` +
    "focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all text-sm placeholder:text-gray-400";

function Field({ label, required, error, children, hint }) {
    return (
        <div>
            <label className="block text-sm font-semibold text-gray-800 mb-2">
                {label}
                {required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            {children}
            {hint && !error && <p className="text-xs text-gray-400 mt-1.5">{hint}</p>}
            {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
        </div>
    );
}

// ─── Main component ─────────────────────────────────────────────────────────
/**
 * @param {Object}  props
 * @param {boolean} props.open
 * @param {Function} props.onClose
 * @param {Object?}  props.role      - existing role (edit mode) or null (create)
 * @param {Function?} props.onSaved   - optional post-save callback (toast etc.)
 */
export default function RoleFormModal({ open, onClose, role, onSaved }) {
    const isEdit = !!role?.id || !!role?._id;
    const roleId = role?.id || role?._id || null;
    const isSystemRole = role?.isSystemRole === true;
    const readOnly = isSystemRole;

    const createMut = useCreateRole();
    const updateMut = useUpdateRole();
    const activeMut = isEdit ? updateMut : createMut;

    // ── Initial permission set from the role prop (handles both shapes) ──
    // Backend DTO returns flat array; legacy nested-object callers also OK
    // because flattenRolePermissions handles both.
    const initialGranted = useMemo(() => {
        if (!role) return new Set();
        return flattenRolePermissions(role.permissions || {});
    }, [role]);

    // ── Local form state ────────────────────────────────────────────────
    const [name, setName] = useState(role?.name || "");
    const [description, setDescription] = useState(role?.description || "");
    const [granted, setGranted] = useState(() => new Set(initialGranted));
    const [fieldErrors, setFieldErrors] = useState({});
    const [banner, setBanner] = useState(null); // { type, message }

    // Reset on open/role change — React Query data can refresh underneath us.
    useEffect(() => {
        if (!open) return;
        setName(role?.name || "");
        setDescription(role?.description || "");
        setGranted(new Set(initialGranted));
        setFieldErrors({});
        setBanner(null);
    }, [open, role, initialGranted]);

    // ── Dirty tracking ──────────────────────────────────────────────────
    // Name comparison is case-insensitive because the backend stores names
    // lowercased (Role schema: { lowercase: true }) — so "Admin" and "admin"
    // are semantically identical and shouldn't show as dirty.
    const normalizeName = (v) => String(v || "").trim().toLowerCase();
    const isDirty = useMemo(() => {
        if (!isEdit) {
            // Create mode — dirty if ANY field has content beyond defaults.
            return (
                name.trim().length > 0 ||
                description.trim().length > 0 ||
                granted.size > 0
            );
        }
        if (normalizeName(name) !== normalizeName(role?.name)) return true;
        if ((description || "").trim() !== (role?.description || "").trim()) return true;
        if (granted.size !== initialGranted.size) return true;
        for (const p of granted) if (!initialGranted.has(p)) return true;
        return false;
    }, [isEdit, name, description, granted, initialGranted, role]);

    // ── Permission toggles ──────────────────────────────────────────────
    const toggleKey = (key) => {
        if (readOnly) return;
        setGranted((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const toggleModule = (mod) => {
        if (readOnly) return;
        const actions = PERMISSION_GROUPS[mod] || [];
        const keys = actions.map((a) => `${mod}.${a}`);
        const allOn = keys.every((k) => granted.has(k));
        setGranted((prev) => {
            const next = new Set(prev);
            if (allOn) keys.forEach((k) => next.delete(k));
            else keys.forEach((k) => next.add(k));
            return next;
        });
    };

    // ── Validation (client-side, mirrors backend Zod — best-effort only;
    //    backend is authoritative) ────────────────────────────────────────
    const canSave = (() => {
        if (readOnly) return false;
        if (!isDirty) return false;
        if (activeMut.isPending) return false;

        if (isEdit) {
            // Update: at least one changed field — already ensured by isDirty.
            // Name if present must still be valid.
            if (name && !/^[a-z][a-z0-9_]*$/.test(name)) return false;
            if (name && (name.length < 2 || name.length > 40)) return false;
            return true;
        }

        // Create: name required + valid, at least one permission granted.
        if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) return false;
        if (name.length < 2 || name.length > 40) return false;
        if (granted.size === 0) return false;
        return true;
    })();

    // ── Submit ──────────────────────────────────────────────────────────
    const handleSave = async () => {
        setFieldErrors({});
        setBanner(null);

        // Build permissions map — flat { "mod.action": true }. Only include
        // granted=true (backend flatToNested seeds false by default).
        const permissions = {};
        for (const key of granted) permissions[key] = true;

        try {
            if (isEdit) {
                const patch = {};
                if (normalizeName(name) !== normalizeName(role.name)) {
                    patch.name = normalizeName(name);
                }
                if ((description || "").trim() !== (role.description || "").trim()) {
                    patch.description = description;
                }
                // Permissions: send only if changed (any diff vs initialGranted).
                const permsChanged =
                    granted.size !== initialGranted.size ||
                    [...granted].some((k) => !initialGranted.has(k));
                if (permsChanged) patch.permissions = permissions;

                if (Object.keys(patch).length === 0) return; // nothing to send

                await updateMut.mutateAsync({ id: roleId, patch });
            } else {
                await createMut.mutateAsync({
                    name,
                    description: description || undefined,
                    permissions,
                });
            }

            onSaved?.();
            onClose?.();
        } catch (err) {
            // Backend error envelope — pull errorCode + map to UI.
            const { errorCode, message } = err?.response?.data?.error
                ? err.response.data.error
                : { errorCode: err?.response?.data?.errorCode, message: err?.response?.data?.message };

            switch (errorCode) {
                case "ROLE_NAME_DUPLICATE":
                case "ROLE_NAME_ALREADY_EXISTS":
                    setFieldErrors({ name: "This role name is already taken." });
                    break;
                case "SYSTEM_ROLE_IMMUTABLE":
                    setBanner({
                        type: "error",
                        message: "This is a system role and cannot be modified.",
                    });
                    break;
                case "STAFF_MANAGE_LOCKOUT":
                case "LOCKOUT_PREVENTED_NO_STAFF_MANAGE_ROLE":
                    setBanner({
                        type: "error",
                        message:
                            "Cannot save — at least one role granting Staff Management must remain in the organization.",
                    });
                    break;
                default:
                    setBanner({
                        type: "error",
                        message: message || "Unable to save role. Please try again.",
                    });
            }
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* ── Header ───────────────────────────────────────────── */}
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">
                            {isEdit ? "Edit Role" : "Create Role"}
                        </h2>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {readOnly
                                ? "System role — read-only view"
                                : "Grant permissions that users with this role will inherit."}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition"
                        aria-label="Close"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* ── Body ─────────────────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* System-role lock banner */}
                    {readOnly && (
                        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-100">
                            <span className="text-xl leading-none">🔒</span>
                            <div className="text-sm text-amber-800">
                                <p className="font-semibold">System role</p>
                                <p className="text-amber-700">
                                    This role is managed by the platform and cannot be modified.
                                    To change who has which capabilities, create a custom role instead.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Error banner */}
                    {banner && (
                        <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-700">
                            {banner.message}
                        </div>
                    )}

                    {/* Name + description */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field
                            label="Role Name"
                            required
                            error={fieldErrors.name}
                            hint="Lowercase letters, digits, and underscores. Starts with a letter."
                        >
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value.toLowerCase())}
                                disabled={readOnly}
                                placeholder="e.g. billing_clerk"
                                className={inp(fieldErrors.name, readOnly)}
                                maxLength={40}
                            />
                        </Field>

                        <Field label="Description" hint="Shown next to the role in staff lists.">
                            <input
                                type="text"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                disabled={readOnly}
                                placeholder="Optional short description"
                                className={inp(false, readOnly)}
                                maxLength={200}
                            />
                        </Field>
                    </div>

                    {/* Permissions matrix */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-800">
                                Permissions
                                <span className="ml-2 text-xs font-normal text-gray-400">
                                    ({granted.size} granted)
                                </span>
                            </h3>
                        </div>

                        <div className="space-y-4">
                            {ORDERED_MODULES.map((mod) => {
                                const { label, icon } = labelForModule(mod);
                                const actions = PERMISSION_GROUPS[mod];
                                const keys = actions.map((a) => `${mod}.${a}`);
                                const grantedCount = keys.filter((k) => granted.has(k)).length;
                                const allOn = grantedCount === keys.length;
                                const someOn = grantedCount > 0 && !allOn;

                                return (
                                    <div
                                        key={mod}
                                        className="rounded-xl border border-gray-100 overflow-hidden"
                                    >
                                        <div className="flex items-center justify-between px-4 py-3 bg-gray-50/60">
                                            <div className="flex items-center gap-2">
                                                <span className="text-base">{icon}</span>
                                                <span className="text-sm font-semibold text-gray-800">
                                                    {label}
                                                </span>
                                                <span className="text-xs text-gray-400">
                                                    {grantedCount}/{keys.length}
                                                </span>
                                            </div>
                                            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={allOn}
                                                    ref={(el) => {
                                                        if (el) el.indeterminate = someOn;
                                                    }}
                                                    onChange={() => toggleModule(mod)}
                                                    disabled={readOnly}
                                                    className="w-4 h-4 accent-blue-600"
                                                />
                                                Select all
                                            </label>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 p-3">
                                            {actions.map((action) => {
                                                const key = `${mod}.${action}`;
                                                const on = granted.has(key);
                                                return (
                                                    <label
                                                        key={key}
                                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs cursor-pointer transition ${
                                                            on
                                                                ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                                                                : "bg-white text-gray-600 ring-1 ring-gray-100 hover:bg-gray-50"
                                                        } ${readOnly ? "cursor-not-allowed opacity-70" : ""}`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={on}
                                                            onChange={() => toggleKey(key)}
                                                            disabled={readOnly}
                                                            className="w-4 h-4 accent-blue-600"
                                                        />
                                                        <span className="font-mono">{action}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* ── Footer ───────────────────────────────────────────── */}
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div className="text-xs text-gray-400">
                        {isEdit && role?.userCount !== undefined && (
                            <span>
                                {role.userCount} user{role.userCount === 1 ? "" : "s"} currently
                                assigned
                            </span>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 transition"
                        >
                            {readOnly ? "Close" : "Cancel"}
                        </button>
                        {!readOnly && (
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={!canSave}
                                className={`px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition ${
                                    canSave
                                        ? "bg-blue-600 hover:bg-blue-700"
                                        : "bg-blue-300 cursor-not-allowed"
                                }`}
                            >
                                {activeMut.isPending
                                    ? "Saving..."
                                    : isEdit
                                        ? "Save Changes"
                                        : "Create Role"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
