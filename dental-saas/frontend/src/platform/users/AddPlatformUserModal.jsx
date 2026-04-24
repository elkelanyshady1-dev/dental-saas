/**
 * AddPlatformUserModal.jsx
 * v2.0 — Hybrid onboarding: Invite Email OR Temporary Password
 *
 * Three-phase flow:
 *  Phase 1 — Form: name, email, role, onboardingMethod
 *  Phase 2a — Success (invite): confirmation notice
 *  Phase 2b — Success (temp_password): password reveal (eye, copy)
 *
 * POST /api/platform/users
 * Payload: { name, email, role, onboardingMethod: "invite" | "temp_password" }
 * Expected response:
 *   invite       → { success, user, onboardingMethod: "invite" }
 *   temp_password → { success, user, temporaryPassword, onboardingMethod: "temp_password" }
 */
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
    X, UserPlus, Shield, Loader2, Copy, CheckCircle2,
    AlertTriangle, Eye, EyeOff, Mail, Key,
} from "lucide-react";

const ALLOWED_ROLES = [
    { value: "analyst", label: "Analyst", desc: "Read-only analytics access" },
    { value: "operations_admin", label: "Operations Admin", desc: "Organizations, audit logs" },
    { value: "finance_admin", label: "Finance Admin", desc: "Billing, subscriptions, analytics" },
    { value: "superadmin", label: "Superadmin", desc: "Full platform access — all capabilities" },
];

const ONBOARDING_METHODS = [
    {
        value: "invite",
        icon: Mail,
        label: "Send Invite Email",
        desc: "User receives a secure invitation link via email to set their own password.",
    },
    {
        value: "temp_password",
        icon: Key,
        label: "Generate Temporary Password",
        desc: "Admin receives a one-time password to share securely. User must change it on first login.",
    },
];

export default function AddPlatformUserModal({ isOpen, onClose, onCreated, platformApi }) {
    // ── Phase 1: form state ──
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [role, setRole] = useState("analyst");
    const [method, setMethod] = useState("invite");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // ── Phase 2 state ──
    const [phase, setPhase] = useState("form"); // "form" | "invite_sent" | "temp_reveal"
    const [tempPassword, setTempPassword] = useState(null);
    const [copied, setCopied] = useState(false);
    const [showPw, setShowPw] = useState(false);
    const [createdUser, setCreatedUser] = useState(null);

    // Reset on open
    useEffect(() => {
        if (isOpen) {
            setFirstName(""); setLastName(""); setEmail(""); setRole("analyst"); setMethod("invite");
            setLoading(false); setError(null);
            setPhase("form"); setTempPassword(null); setCopied(false); setShowPw(false); setCreatedUser(null);
        }
    }, [isOpen]);

    // ESC key — only in form phase
    useEffect(() => {
        if (!isOpen) return;
        const h = (e) => { if (e.key === "Escape" && phase === "form") onClose(); };
        document.addEventListener("keydown", h);
        return () => document.removeEventListener("keydown", h);
    }, [isOpen, phase, onClose]);

    const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0 && email.trim().length > 0 && !loading;

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setLoading(true);
        setError(null);
        try {
            const res = await platformApi.post("/users", {
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                email: email.trim(),
                role,
                onboardingMethod: method,
            });
            setCreatedUser(res.data.user);
            onCreated?.();
            if (method === "temp_password" && res.data.temporaryPassword) {
                setTempPassword(res.data.temporaryPassword);
                setPhase("temp_reveal");
            } else {
                setPhase("invite_sent");
            }
        } catch (err) {
            setError(err.response?.data?.message || "Failed to create user");
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(tempPassword);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch { /* clipboard unavailable */ }
    };

    if (!isOpen) return null;

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-staff-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
            {/* Backdrop — only closeable in form phase */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={phase === "form" ? onClose : undefined}
                aria-hidden="true"
            />

            <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">

                {/* ── PHASE 1: Creation form ── */}
                {phase === "form" && (
                    <>
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                                    <UserPlus className="w-4 h-4 text-indigo-600" />
                                </div>
                                <div>
                                    <h2 id="add-staff-title" className="text-sm font-bold text-slate-800">Create Platform Staff</h2>
                                    <p className="text-xs text-slate-400 font-medium mt-0.5">Choose how the user will be onboarded</p>
                                </div>
                            </div>
                            <button onClick={onClose} disabled={loading}
                                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40"
                                aria-label="Close">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Body */}
                        <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">

                            {error && (
                                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm font-medium">
                                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
                                </div>
                            )}

                            {/* Name — split row */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="staff-firstname" className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">First Name</label>
                                    <input
                                        id="staff-firstname" type="text" value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        placeholder="Jane" required disabled={loading}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 transition-colors"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="staff-lastname" className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Last Name</label>
                                    <input
                                        id="staff-lastname" type="text" value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        placeholder="Smith" required disabled={loading}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 transition-colors"
                                    />
                                </div>
                            </div>

                            {/* Email */}
                            <div>
                                <label htmlFor="staff-email" className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Email Address</label>
                                <input
                                    id="staff-email" type="email" value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="jane@orthonoe.com" required disabled={loading}
                                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 transition-colors"
                                />
                            </div>

                            {/* Role */}
                            <div>
                                <label htmlFor="staff-role" className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Administrative Role</label>
                                <select
                                    id="staff-role" value={role}
                                    onChange={(e) => setRole(e.target.value)}
                                    disabled={loading}
                                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 bg-white transition-colors"
                                >
                                    {ALLOWED_ROLES.map((r) => (
                                        <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Onboarding method */}
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Onboarding Method</p>
                                <div className="space-y-2">
                                    {ONBOARDING_METHODS.map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setMethod(opt.value)}
                                            disabled={loading}
                                            className={`w-full flex items-start gap-3 px-3.5 py-3 rounded-xl border text-left transition-colors
                                                ${method === opt.value ? "bg-indigo-50 border-indigo-300" : "bg-white border-slate-200 hover:bg-slate-50"}`}
                                        >
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5
                                                ${method === opt.value ? "bg-indigo-100" : "bg-slate-100"}`}>
                                                <opt.icon className={`w-3.5 h-3.5 ${method === opt.value ? "text-indigo-600" : "text-slate-500"}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-xs font-semibold ${method === opt.value ? "text-indigo-700" : "text-slate-700"}`}>{opt.label}</p>
                                                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{opt.desc}</p>
                                            </div>
                                            {/* Radio dot */}
                                            <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-1 transition-colors
                                                ${method === opt.value ? "border-indigo-500 bg-indigo-500" : "border-slate-300 bg-white"}`}>
                                                {method === opt.value && (
                                                    <div className="w-full h-full rounded-full bg-white scale-[0.45] transform block" />
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Superadmin warning */}
                            {role === "superadmin" && (
                                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                    <Shield className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                                    <p className="text-xs text-amber-700 font-medium">
                                        Superadmin accounts have unrestricted access to all platform capabilities.
                                    </p>
                                </div>
                            )}

                            {/* Footer */}
                            <div className="flex gap-3 pt-1">
                                <button type="button" onClick={onClose} disabled={loading}
                                    className="flex-1 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-40">
                                    Cancel
                                </button>
                                <button type="submit" disabled={!canSubmit}
                                    className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                                    {loading
                                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
                                        : <><UserPlus className="w-4 h-4" /> Create User</>}
                                </button>
                            </div>
                        </form>
                    </>
                )}

                {/* ── PHASE 2a: Invite sent ── */}
                {phase === "invite_sent" && (
                    <>
                        <div className="flex items-center gap-3 px-6 pt-6 pb-4">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                                <Mail className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-slate-800">Invitation Sent</h2>
                                <p className="text-xs text-slate-400 font-medium mt-0.5">
                                    {createdUser?.name || `${firstName} ${lastName}`.trim()} · {createdUser?.email || email}
                                </p>
                            </div>
                        </div>
                        <div className="px-6 pb-6 space-y-4">
                            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                                <p className="text-sm text-emerald-800 font-medium">
                                    An invitation email has been sent to <strong>{createdUser?.email || email}</strong>.
                                    The user will receive a secure link to set their own password and activate their account.
                                </p>
                            </div>
                            <button onClick={onClose}
                                className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition-colors">
                                Done
                            </button>
                        </div>
                    </>
                )}

                {/* ── PHASE 2b: Temp password reveal ── */}
                {phase === "temp_reveal" && tempPassword && (
                    <>
                        <div className="flex items-center gap-3 px-6 pt-6 pb-4">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-slate-800">User Created Successfully</h2>
                                <p className="text-xs text-slate-400 font-medium mt-0.5">
                                    {createdUser?.name || `${firstName} ${lastName}`.trim()} · {createdUser?.email || email}
                                </p>
                            </div>
                        </div>
                        <div className="px-6 pb-6 space-y-4">
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Temporary Password</p>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 px-3 py-2.5 bg-white border border-slate-200 rounded-lg font-mono text-sm text-slate-800 tracking-widest select-all">
                                        {showPw ? tempPassword : "•".repeat(tempPassword.length)}
                                    </div>
                                    <button onClick={() => setShowPw(v => !v)}
                                        className="p-2.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                        title={showPw ? "Hide" : "Reveal"}>
                                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                    <button onClick={handleCopy}
                                        className={`p-2.5 rounded-lg border transition-colors ${copied
                                            ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                                            : "border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-100"}`}
                                        title="Copy to clipboard">
                                        {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>
                                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                    <span>Copy this password and share it securely. The user must change it on first login. This dialog will not show it again.</span>
                                </div>
                            </div>
                            <button onClick={onClose}
                                className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition-colors">
                                Done
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>,
        document.body
    );
}
