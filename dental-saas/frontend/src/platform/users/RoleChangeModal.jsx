/**
 * RoleChangeModal.jsx
 * v20.2 — Replaces the native browser prompt() for platform user role changes.
 *
 * Props:
 *   isOpen           boolean
 *   user             { _id, name, email, role }
 *   onConfirm        (newRole: string) => void
 *   onCancel         () => void
 *   saving           boolean
 *   totalSuperAdmins number
 */
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Shield, AlertTriangle, Loader2, X, ChevronDown } from "lucide-react";

const ALLOWED_ROLES = [
    { value: "superadmin", label: "Superadmin", description: "Full platform access — all capabilities" },
    { value: "finance_admin", label: "Finance Admin", description: "Billing, subscriptions, analytics" },
    { value: "operations_admin", label: "Operations Admin", description: "Organizations, audit logs" },
    { value: "analyst", label: "Analyst", description: "Read-only analytics access" },
];

const ROLE_COLOR = {
    superadmin: "text-red-400 bg-red-500/10 border-red-500/30",
    finance_admin: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    operations_admin: "text-blue-400 bg-blue-500/10 border-blue-500/30",
    analyst: "text-slate-400 bg-slate-500/10 border-slate-500/30",
};

export default function RoleChangeModal({
    isOpen,
    user,
    onConfirm,
    onCancel,
    saving = false,
    totalSuperAdmins = 0,
}) {
    const [selected, setSelected] = useState(user?.role ?? "analyst");

    // Sync selection when a new user is targeted
    useEffect(() => {
        if (user) setSelected(user.role);
    }, [user]);

    // ESC to close
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e) => { if (e.key === "Escape") onCancel(); };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [isOpen, onCancel]);

    if (!isOpen || !user) return null;

    const isLastSuperadmin = user.role === "superadmin" && totalSuperAdmins <= 1;
    const isUnchanged = selected === user.role;
    const canSave = !saving && !isLastSuperadmin && !isUnchanged;

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
                onClick={onCancel}
                aria-hidden="true"
            />

            {/* Panel */}
            <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                            <Shield className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <h2 id="role-modal-title" className="text-base font-bold text-slate-100">Change Administrative Role</h2>
                            <p className="text-xs text-slate-400 mt-0.5 font-medium">{user.name} · {user.email}</p>
                        </div>
                    </div>
                    <button
                        onClick={onCancel}
                        disabled={saving}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-40"
                        aria-label="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-4">

                    {/* Last superadmin warning */}
                    {isLastSuperadmin && (
                        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/25 rounded-xl">
                            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-amber-300 font-medium leading-relaxed">
                                This is the <strong>only active superadmin</strong>. Role cannot be changed without promoting another user first.
                            </p>
                        </div>
                    )}

                    {/* Current role badge */}
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium">Current role</span>
                        <span className={`px-2.5 py-1 rounded-full font-bold uppercase tracking-wide border text-[11px] ${ROLE_COLOR[user.role] || ROLE_COLOR.analyst}`}>
                            {user.role.replace(/_/g, " ")}
                        </span>
                    </div>

                    {/* Role selector */}
                    <div>
                        <label htmlFor="role-select" className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-widest">
                            New Role
                        </label>
                        <div className="relative">
                            <select
                                id="role-select"
                                value={selected}
                                onChange={(e) => setSelected(e.target.value)}
                                disabled={isLastSuperadmin || saving}
                                className="w-full appearance-none bg-slate-800 border border-slate-700 text-slate-100 rounded-xl px-4 py-3 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                {ALLOWED_ROLES.map((r) => (
                                    <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>

                        {/* Role description */}
                        {selected && (
                            <p className="mt-2 text-xs text-slate-500 font-medium">
                                {ALLOWED_ROLES.find((r) => r.value === selected)?.description}
                            </p>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex gap-3 px-6 pb-6">
                    <button
                        onClick={onCancel}
                        disabled={saving}
                        className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-300 text-sm font-bold hover:bg-slate-800 hover:text-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Cancel
                    </button>
                    <button
                        id="role-modal-save"
                        onClick={() => onConfirm(selected)}
                        disabled={!canSave}
                        className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Saving…
                            </>
                        ) : (
                            "Save Role"
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
