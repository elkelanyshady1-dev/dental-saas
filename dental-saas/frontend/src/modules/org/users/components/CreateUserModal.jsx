/**
 * CreateUserModal.jsx — Create Staff Member Modal
 * Phase 1.1 Hardening — Array guard on roles + BranchAccessSelector added.
 */
import { useState } from "react";
import { Input } from "@/design-system";
import BranchAccessSelector from "./BranchAccessSelector";

export default function CreateUserModal({ roles, onSave, onClose, isSaving = false }) {
    // Safe roles array — guard against non-array (fixes roles.map crash)
    const safeRoles = Array.isArray(roles) ? roles : [];

    const [form, setForm] = useState({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        roleId: safeRoles.length > 0 ? safeRoles[0]._id : "",
        phone: "",
        branchAccess: [],
        hasFullBranchAccess: false,
    });
    const [error, setError] = useState(null);

    const set = (field, value) => setForm((p) => ({ ...p, [field]: value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        try {
            await onSave(form);
        } catch (err) {
            setError(err.response?.data?.message || err.message || "Failed to create user");
        }
    };

    return (
        <div
            id="create-user-modal"
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-800">Add Staff Member</h2>
                    <button
                        id="create-user-close"
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                    >
                        &times;
                    </button>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-600">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            id="create-firstName"
                            label="First Name"
                            value={form.firstName}
                            onChange={(e) => set("firstName", e.target.value)}
                            required
                        />
                        <Input
                            id="create-lastName"
                            label="Last Name"
                            value={form.lastName}
                            onChange={(e) => set("lastName", e.target.value)}
                            required
                        />
                    </div>

                    <Input
                        id="create-email"
                        label="Email"
                        type="email"
                        value={form.email}
                        onChange={(e) => set("email", e.target.value)}
                        required
                    />

                    <Input
                        id="create-password"
                        label="Password"
                        type="password"
                        value={form.password}
                        onChange={(e) => set("password", e.target.value)}
                        required
                    />

                    <Input
                        id="create-phone"
                        label="Phone"
                        type="tel"
                        value={form.phone}
                        onChange={(e) => set("phone", e.target.value)}
                    />

                    {/* ── Role selector ── */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Role
                        </label>
                        <select
                            id="create-roleId"
                            value={form.roleId}
                            onChange={(e) => set("roleId", e.target.value)}
                            className="w-full h-14 rounded-xl border border-slate-200 px-4 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                            required
                        >
                            {safeRoles.length === 0 ? (
                                <option value="">No roles available</option>
                            ) : (
                                safeRoles.map((r) => (
                                    <option key={r._id} value={r._id}>
                                        {r.name?.replace(/_/g, " ")}
                                    </option>
                                ))
                            )}
                        </select>
                    </div>

                    {/* ── Branch access (Phase 4.2) ── */}
                    <BranchAccessSelector
                        selected={form.branchAccess}
                        onChange={(branches) => set("branchAccess", branches)}
                    />

                    {/* ── Full branch access toggle ── */}
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            id="create-fullBranchAccess"
                            type="checkbox"
                            checked={form.hasFullBranchAccess}
                            onChange={(e) => set("hasFullBranchAccess", e.target.checked)}
                            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 font-medium">Full branch access</span>
                    </label>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSaving}
                            className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            id="create-user-submit"
                            type="submit"
                            disabled={isSaving || safeRoles.length === 0}
                            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition disabled:opacity-50"
                        >
                            {isSaving ? "Creating..." : "Create Staff"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
