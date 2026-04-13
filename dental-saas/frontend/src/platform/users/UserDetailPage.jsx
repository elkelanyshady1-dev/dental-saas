/**
 * UserDetailPage.jsx
 * v24.0 — Hybrid onboarding + Reset Password modal + Audit filters
 *
 * New in this version:
 *  - Reset Password action button → method selector modal (temp_password | reset_email)
 *  - Resend Invite action button → POST /users/:id/resend-invite
 *  - Security Actions grid expanded to 2×col grid (5 buttons)
 *  - Audit filter dropdown: All | Authentication | Security | User Management
 *  - Toast notification for non-modal actions (resend invite success)
 *  - Calling resetPassword with temp_password shows temp-password reveal modal
 *
 * All existing state, API calls, and action handlers preserved.
 */
import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    ChevronRight,
    ChevronLeft,
    Shield,
    History,
    Lock,
    Unlock,
    LogOut,
    RefreshCw,
    Building2,
    AlertTriangle,
    Loader2,
    CheckCircle2,
    XCircle,
    Clock,
    Monitor,
    Smartphone,
    Globe,
    Activity,
    Plus,
    KeyRound,
    Mail,
    Key,
    Copy,
    Eye,
    EyeOff,
    Filter,
    ChevronDown,
    Send,
    Phone,
    MessageCircle,
    Briefcase,
    Pencil,
} from "lucide-react";
import { createPortal } from "react-dom";
import platformApi from "../auth/platformApi";
import RequireCapability from "../core/guards/RequireCapability";
import EditProfileModal from "./EditProfileModal";
import UserIdentityHeader from "./components/UserIdentityHeader";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr) {
    if (!dateStr) return "Never";
    const diff = Date.now() - new Date(dateStr).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return "Just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return d === 1 ? "Yesterday" : `${d}d ago`;
}

function formatAuditDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return (
        d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        " · " +
        d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
    );
}

function getInitials(name = "") {
    return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

function parseUA(ua = "") {
    const lower = ua.toLowerCase();
    let browser = "Unknown Browser";
    let os = "Unknown OS";
    if (lower.includes("chrome") && !lower.includes("edg")) browser = "Chrome";
    else if (lower.includes("firefox")) browser = "Firefox";
    else if (lower.includes("safari") && !lower.includes("chrome")) browser = "Safari";
    else if (lower.includes("edg")) browser = "Edge";
    if (lower.includes("windows")) os = "Windows";
    else if (lower.includes("mac")) os = "macOS";
    else if (lower.includes("linux")) os = "Linux";
    else if (lower.includes("android")) os = "Android";
    else if (lower.includes("iphone") || lower.includes("ipad")) os = "iOS";
    const isMobile = lower.includes("mobile") || lower.includes("android") || lower.includes("iphone");
    return { browser, os, isMobile };
}

function maskIP(ip = "") {
    if (!ip) return "Unknown";
    if (["::1", "127.0.0.1", "::ffff:127.0.0.1"].includes(ip)) return "localhost";
    if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":") + ":****";
    const parts = ip.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.***.***`;
    return ip;
}

// ─── Role display ─────────────────────────────────────────────────────────────
const ROLE_LABELS = {
    superadmin: "Super Admin",
    finance_admin: "Finance Admin",
    operations_admin: "Operations Admin",
    analyst: "Analyst",
};
function roleLabel(role) {
    return ROLE_LABELS[role] || (role || "—");
}

// ─── Audit event config ───────────────────────────────────────────────────────
const EVENT_CFG = {
    // Authentication
    LOGIN_SUCCESS: { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", category: "auth" },
    LOGIN_FAILED: { dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50", border: "border-red-200", category: "auth" },
    LOGOUT: { dot: "bg-slate-400", text: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200", category: "auth" },
    TOKEN_REFRESH: { dot: "bg-blue-400", text: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", category: "auth" },
    TWO_FA_LOCKED: { dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50", border: "border-red-200", category: "auth" },
    RECOVERY_CODE_USED: { dot: "bg-violet-500", text: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200", category: "auth" },
    TWO_FA_ENABLED: { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", category: "auth" },
    TWO_FA_DISABLED: { dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", category: "auth" },
    // Security
    CAPABILITY_DENIED: { dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", category: "security" },
    PASSWORD_CHANGE: { dot: "bg-purple-500", text: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200", category: "security" },
    NEW_IP_LOGIN: { dot: "bg-orange-500", text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", category: "security" },
    PLATFORM_USER_FORCE_LOGOUT: { dot: "bg-orange-500", text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", category: "security" },
    PLATFORM_USER_2FA_RESET: { dot: "bg-purple-500", text: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200", category: "security" },
    PASSWORD_RESET_BY_ADMIN: { dot: "bg-orange-500", text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", category: "security" },
    PLATFORM_USER_PASSWORD_RESET: { dot: "bg-orange-500", text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", category: "security" },
    ORG_USER_SUSPEND: { dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50", border: "border-red-200", category: "security" },
    ORG_USER_RESTORE: { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", category: "security" },
    PLATFORM_USER_SUSPEND: { dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50", border: "border-red-200", category: "security" },
    PLATFORM_USER_RESTORE: { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", category: "security" },
    // User management
    PLATFORM_USER_CREATED: { dot: "bg-blue-500", text: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", category: "management" },
    PLATFORM_USER_DELETED: { dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50", border: "border-red-200", category: "management" },
    PLATFORM_USER_ROLE_UPDATED: { dot: "bg-indigo-500", text: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200", category: "management" },
    PLATFORM_USER_STATUS_UPDATED: { dot: "bg-teal-500", text: "text-teal-700", bg: "bg-teal-50", border: "border-teal-200", category: "management" },
    PLATFORM_USER_PROFILE_UPDATED: { dot: "bg-slate-500", text: "text-slate-700", bg: "bg-slate-50", border: "border-slate-200", category: "management" },
    USER_INVITE_SENT: { dot: "bg-blue-500", text: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", category: "management" },
    INVITE_ACCEPTED: { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", category: "management" },
    TEMP_PASSWORD_GENERATED: { dot: "bg-indigo-500", text: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200", category: "management" },
    USER_PROFILE_UPDATED: { dot: "bg-slate-500", text: "text-slate-700", bg: "bg-slate-50", border: "border-slate-200", category: "management" },
    USER_PROFILE_IMAGE_CHANGED: { dot: "bg-slate-500", text: "text-slate-700", bg: "bg-slate-50", border: "border-slate-200", category: "management" },
    USER_CONTACT_UPDATED: { dot: "bg-slate-500", text: "text-slate-700", bg: "bg-slate-50", border: "border-slate-200", category: "management" },
    ORG_USER_FORCE_LOGOUT: { dot: "bg-orange-500", text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", category: "security" },
    ORG_USER_PASSWORD_RESET: { dot: "bg-orange-500", text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", category: "security" },
    ORG_USER_2FA_RESET: { dot: "bg-purple-500", text: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200", category: "security" },
    ORG_USER_ROLE_UPDATED: { dot: "bg-indigo-500", text: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200", category: "management" },
    USER_INVITE_RESENT: { dot: "bg-blue-400", text: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", category: "management" },
};
const DEFAULT_EVENT_CFG = { dot: "bg-slate-300", text: "text-slate-500", bg: "bg-slate-50", border: "border-slate-200", category: "other" };

const EVENT_LABELS = {
    LOGIN_SUCCESS: "Login Successful",
    LOGIN_FAILED: "Login Failed",
    LOGOUT: "Logged Out",
    TOKEN_REFRESH: "Session Refreshed",
    CAPABILITY_DENIED: "Access Denied",
    PASSWORD_CHANGE: "Password Changed",
    NEW_IP_LOGIN: "Login from New Location",
    TWO_FA_LOCKED: "2FA Temporarily Locked",
    TWO_FA_ENABLED: "2FA Enabled",
    TWO_FA_DISABLED: "2FA Disabled",
    RECOVERY_CODE_USED: "Recovery Code Used",
    PLATFORM_USER_FORCE_LOGOUT: "Force Logged Out by Admin",
    PLATFORM_USER_2FA_RESET: "2FA Reset by Admin",
    PASSWORD_RESET_BY_ADMIN: "Password Reset by Admin",
    PLATFORM_USER_PASSWORD_RESET: "Password Reset by Admin",
    PLATFORM_USER_CREATED: "Account Created",
    PLATFORM_USER_DELETED: "Account Deleted",
    PLATFORM_USER_ROLE_UPDATED: "Role Changed",
    PLATFORM_USER_STATUS_UPDATED: "Status Updated",
    PLATFORM_USER_PROFILE_UPDATED: "Profile Updated",
    PLATFORM_USER_SUSPEND: "Account Suspended",
    PLATFORM_USER_RESTORE: "Account Restored",
    USER_INVITE_SENT: "Invitation Sent",
    USER_INVITE_RESENT: "Invitation Resent",
    INVITE_ACCEPTED: "Invitation Accepted",
    TEMP_PASSWORD_GENERATED: "Temporary Password Generated",
    USER_PROFILE_UPDATED: "Profile Updated",
    USER_PROFILE_IMAGE_CHANGED: "Profile Photo Updated",
    USER_CONTACT_UPDATED: "Contact Info Updated",
    ORG_USER_SUSPEND: "Account Suspended by Admin",
    ORG_USER_RESTORE: "Account Restored by Admin",
    ORG_USER_FORCE_LOGOUT: "Force Logged Out by Admin",
    ORG_USER_PASSWORD_RESET: "Password Reset by Admin",
    ORG_USER_2FA_RESET: "2FA Reset by Admin",
    ORG_USER_ROLE_UPDATED: "Role Changed by Admin",
    // Generic HTTP events from auditLogger middleware
    CREATE: "Record Created",
    UPDATE: "Record Updated",
    DELETE: "Record Deleted",
};

/** Map raw action string → human label, falling back to smart title-casing */
function humanAction(log = {}) {
    const action = log.action || "";
    if (EVENT_LABELS[action]) return EVENT_LABELS[action];
    // Generic CREATE/UPDATE/DELETE: prefix with entity name if available
    const entity = log.entity || log.entityType || "";
    const entityLabel = entity ? entity.replace(/([A-Z])/g, " $1").trim() : "";
    if (action === "CREATE" && entityLabel) return `${entityLabel} Created`;
    if (action === "UPDATE" && entityLabel) return `${entityLabel} Updated`;
    if (action === "DELETE" && entityLabel) return `${entityLabel} Deleted`;
    // Last resort: prettify the raw string
    return action.replace(/_/g, " ").toLowerCase().replace(/^./, (s) => s.toUpperCase());
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function UserAvatar({ user, size = "lg" }) {
    const dim = size === "lg" ? "w-20 h-20 text-2xl" : "w-10 h-10 text-sm";
    if (user?.profilePhotoUrl) {
        return (
            <img
                src={user.profilePhotoUrl}
                alt={user.name}
                className={`${dim} rounded-full object-cover ring-4 ring-white shadow-md flex-shrink-0`}
            />
        );
    }
    const initials = getInitials(user?.name);
    const colors = [
        "from-indigo-500 to-purple-600",
        "from-blue-500 to-cyan-600",
        "from-emerald-500 to-teal-600",
        "from-rose-500 to-pink-600",
    ];
    const gradient = colors[(user?.name?.charCodeAt(0) || 0) % colors.length];
    return (
        <div className={`${dim} rounded-full bg-gradient-to-br ${gradient} ring-4 ring-white shadow-md flex items-center justify-center font-bold text-white flex-shrink-0 select-none`}>
            {initials}
        </div>
    );
}

// ─── Info row ─────────────────────────────────────────────────────────────────
function InfoRow({ label, children }) {
    return (
        <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
            <div className="text-sm font-medium text-slate-800">{children}</div>
        </div>
    );
}

// ─── Section card ─────────────────────────────────────────────────────────────
function SectionCard({ title, icon: Icon, iconColor = "text-slate-400", action, children }) {
    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
                <div className="flex items-center gap-2">
                    {Icon && <Icon className={`w-4 h-4 ${iconColor}`} />}
                    <span className="text-sm font-semibold text-slate-700">{title}</span>
                </div>
                {action}
            </div>
            <div className="p-5">{children}</div>
        </div>
    );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, type = "success", onDismiss }) {
    useEffect(() => {
        const t = setTimeout(onDismiss, 3500);
        return () => clearTimeout(t);
    }, [onDismiss]);

    return createPortal(
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm font-semibold transition-all
            ${type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
            {type === "success"
                ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                : <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />}
            {message}
        </div>,
        document.body
    );
}

// ─── Audit timeline ───────────────────────────────────────────────────────────
const AUDIT_FILTER_OPTIONS = [
    { value: "all", label: "All Events" },
    { value: "auth", label: "Authentication" },
    { value: "security", label: "Security Actions" },
    { value: "management", label: "User Management" },
    { value: "other", label: "System / Other" },
];

function AuditTimeline({ logs }) {
    const [filter, setFilter] = useState("all");
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropRef = useRef(null);

    useEffect(() => {
        const h = (e) => { if (!dropRef.current?.contains(e.target)) setDropdownOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, []);

    const filtered = filter === "all"
        ? logs
        : logs.filter(l => (EVENT_CFG[l.action] || DEFAULT_EVENT_CFG).category === filter);

    const activeLabel = AUDIT_FILTER_OPTIONS.find(o => o.value === filter)?.label;

    return (
        <div>
            {/* Filter bar */}
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-slate-400">
                    {filtered.length} event{filtered.length !== 1 ? "s" : ""}
                </span>
                <div className="relative" ref={dropRef}>
                    <button
                        onClick={() => setDropdownOpen(v => !v)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                    >
                        <Filter className="w-3 h-3" />
                        {activeLabel}
                        <ChevronDown className="w-3 h-3" />
                    </button>
                    {dropdownOpen && (
                        <div className="absolute right-0 top-full mt-1.5 z-20 bg-white border border-slate-200 rounded-xl shadow-lg w-44 py-1 overflow-hidden">
                            {AUDIT_FILTER_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => { setFilter(opt.value); setDropdownOpen(false); }}
                                    className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors
                                        ${filter === opt.value ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-slate-700 hover:bg-slate-50"}`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                    <History className="w-7 h-7 text-slate-300" />
                    <p className="text-slate-400 text-sm">No events in this category.</p>
                </div>
            ) : (
                <div className="space-y-0">
                    {filtered.map((log, i) => {
                        const cfg = EVENT_CFG[log.action] || DEFAULT_EVENT_CFG;
                        const label = humanAction(log);
                        // Detect if this user was the TARGET (not the actor)
                        const wasTarget = log.entityId && log.actorId && log.entityId !== log.actorId;
                        return (
                            <div key={log._id || i} className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
                                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${cfg.dot}`} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                            {label}
                                        </span>
                                        <span className="text-xs text-slate-400 whitespace-nowrap tabular-nums">
                                            {formatAuditDate(log.createdAt)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                        {log.success !== undefined && (
                                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${log.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                                                }`}>
                                                {log.success ? "✓ OK" : "✕ FAILED"}
                                            </span>
                                        )}
                                        {wasTarget && (
                                            <span className="text-[10px] text-amber-600 font-semibold bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
                                                by admin
                                            </span>
                                        )}
                                        {log.ipAddress && !["::1", "127.0.0.1", "::ffff:127.0.0.1"].includes(log.ipAddress) && (
                                            <span className="text-[10px] text-slate-400 font-mono">
                                                {maskIP(log.ipAddress)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── Session list ─────────────────────────────────────────────────────────────
function SessionList({ sessions, lastLoginAt }) {
    if (!sessions || sessions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                <Clock className="w-7 h-7 text-slate-300" />
                <p className="text-slate-400 text-sm font-medium">No active sessions</p>
                {lastLoginAt && (
                    <p className="text-xs text-slate-400">
                        Last login: {formatRelativeTime(lastLoginAt)}
                    </p>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-0">
            {sessions.map((session, idx) => {
                const { browser, os, isMobile } = parseUA(session.userAgent || "");
                const DeviceIcon = isMobile ? Smartphone : Monitor;
                const label = session.userAgent
                    ? `${browser} — ${os}`
                    : "Unknown Device";
                return (
                    <div key={session.sessionId || idx} className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
                        <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <DeviceIcon className="w-4 h-4 text-slate-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-slate-800">{label}</span>
                                {idx === 0 && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 uppercase tracking-wide">
                                        Most Recent
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                                <span className="flex items-center gap-1">
                                    <Globe className="w-3 h-3" />
                                    {maskIP(session.ipAddress)}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatRelativeTime(session.lastActive || session.createdAt)}
                                </span>
                            </div>
                        </div>
                        <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" title="Active" />
                    </div>
                );
            })}
        </div>
    );
}

// ─── Reset Password Modal ─────────────────────────────────────────────────────
function ResetPasswordModal({ open, userName, userId, onClose, onSuccess }) {
    const [method, setMethod] = useState("temp_password"); // "temp_password" | "reset_email"
    const [step, setStep] = useState("choose"); // "choose" | "reveal"
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [tempPassword, setTempPassword] = useState(null);
    const [showPw, setShowPw] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!open) {
            setMethod("temp_password");
            setStep("choose");
            setLoading(false);
            setError(null);
            setTempPassword(null);
            setShowPw(false);
            setCopied(false);
        }
    }, [open]);

    const handleContinue = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await platformApi.patch(`/users/${userId}/manage-credentials`, { mode: method === "temp_password" ? "temporary_password" : "send_reset_email" });
            if (method === "temp_password") {
                setTempPassword(res.data.tempPassword);
                setStep("reveal");
            } else {
                onSuccess("Password reset email sent to the user.");
                onClose();
            }
        } catch (err) {
            setError(err.response?.data?.message || "Action failed");
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        try { await navigator.clipboard.writeText(tempPassword); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* ignore */ }
    };

    if (!open) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="relative bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-sm">
                {step === "choose" && (
                    <>
                        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100">
                            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                                <Key className="w-4 h-4 text-amber-600" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-800">Reset Password</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Choose reset method for {userName}</p>
                            </div>
                        </div>
                        <div className="px-6 py-5 space-y-3">
                            {error && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-medium">
                                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />{error}
                                </div>
                            )}
                            {/* Method options */}
                            {[
                                { value: "temp_password", icon: Key, label: "Generate Temporary Password", desc: "Admin receives a one-time password to share securely." },
                                { value: "reset_email", icon: Mail, label: "Send Reset Email", desc: "User receives a secure reset link via email." },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setMethod(opt.value)}
                                    className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-colors
                                        ${method === opt.value ? "bg-indigo-50 border-indigo-300" : "bg-white border-slate-200 hover:bg-slate-50"}`}
                                >
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${method === opt.value ? "bg-indigo-100" : "bg-slate-100"}`}>
                                        <opt.icon className={`w-4 h-4 ${method === opt.value ? "text-indigo-600" : "text-slate-500"}`} />
                                    </div>
                                    <div>
                                        <p className={`text-sm font-semibold ${method === opt.value ? "text-indigo-700" : "text-slate-700"}`}>{opt.label}</p>
                                        <p className="text-xs text-slate-400 mt-0.5">{opt.desc}</p>
                                    </div>
                                    <div className={`ml-auto mt-1 w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors
                                        ${method === opt.value ? "border-indigo-500 bg-indigo-500" : "border-slate-300"}`}>
                                        {method === opt.value && <div className="w-full h-full rounded-full bg-white scale-[0.45] block" />}
                                    </div>
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-3 px-6 pb-5">
                            <button onClick={onClose} disabled={loading}
                                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-40">
                                Cancel
                            </button>
                            <button onClick={handleContinue} disabled={loading}
                                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-40">
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
                            </button>
                        </div>
                    </>
                )}

                {step === "reveal" && tempPassword && (
                    <>
                        <div className="flex items-center gap-3 px-6 pt-6 pb-4">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-800">New Temporary Password</h3>
                                <p className="text-xs text-slate-400 mt-0.5">For {userName} — share securely</p>
                            </div>
                        </div>
                        <div className="px-6 pb-6 space-y-4">
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 px-3 py-2.5 bg-white border border-slate-200 rounded-lg font-mono text-sm text-slate-800 tracking-widest select-all">
                                        {showPw ? tempPassword : "•".repeat(tempPassword.length)}
                                    </div>
                                    <button onClick={() => setShowPw(v => !v)}
                                        className="p-2.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors">
                                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                    <button onClick={handleCopy}
                                        className={`p-2.5 rounded-lg border transition-colors ${copied ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "border-slate-200 text-slate-500 hover:bg-slate-100"}`}>
                                        {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>
                                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                    <span>User will be required to change this on next login. This dialog will not show it again.</span>
                                </div>
                            </div>
                            <button onClick={() => { onSuccess("Temporary password generated successfully."); onClose(); }}
                                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition-colors">
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

// ─── Confirm modal ────────────────────────────────────────────────────────────
function ConfirmActionModal({ open, title, message, intent = "warning", loading, onConfirm, onCancel }) {
    useEffect(() => {
        if (!open) return;
        const h = (e) => { if (e.key === "Escape" && !loading) onCancel(); };
        document.addEventListener("keydown", h);
        return () => document.removeEventListener("keydown", h);
    }, [open, loading, onCancel]);

    if (!open) return null;
    const isDanger = intent === "danger";

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm shadow-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2.5 rounded-xl ${isDanger ? "bg-red-50 border border-red-200" : "bg-amber-50 border border-amber-200"}`}>
                        <AlertTriangle className={`w-4 h-4 ${isDanger ? "text-red-600" : "text-amber-600"}`} />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">{title}</h3>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed">{message}</p>
                <div className="flex gap-3 mt-6">
                    <button onClick={onCancel} disabled={loading}
                        className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-40">
                        Cancel
                    </button>
                    <button onClick={onConfirm} disabled={loading}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-40
                            ${isDanger ? "bg-red-600 hover:bg-red-500 text-white" : "bg-amber-500 hover:bg-amber-400 text-white"}`}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─── Action tile ──────────────────────────────────────────────────────────────
function ActionTile({ icon: Icon, label, onClick, disabled, loading, hoverClass = "hover:bg-slate-100 hover:text-slate-800", disabledHint }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={disabled && disabledHint ? disabledHint : undefined}
            className={`flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${!disabled ? hoverClass : ""}`}
        >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
            <span className="leading-tight text-center">{label}</span>
        </button>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
const UserDetailPageContent = () => {
    const { id, organizationId } = useParams();
    const navigate = useNavigate();

    const [data, setData] = useState({ user: null, auditLogs: [], sessions: [] });
    const [loading, setLoading] = useState(true);
    const [pageError, setPageError] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);
    const [confirm, setConfirm] = useState({ open: false, key: null, title: "", message: "", intent: "warning" });
    const [resetPwModal, setResetPwModal] = useState(false);
    const [toast, setToast] = useState(null); // { message, type }
    const [editProfileOpen, setEditProfileOpen] = useState(false);

    const isPlatformUser = !organizationId;

    const fetchDetail = async () => {
        setLoading(true);
        setPageError(null);
        try {
            const endpoint = isPlatformUser
                ? `/governance/platform/${id}`
                : `/governance/org/${organizationId}/${id}`;
            const res = await platformApi.get(endpoint);
            setData({
                user: res.data.user,
                auditLogs: res.data.auditLogs || [],
                sessions: res.data.sessions || [],
            });
        } catch (err) {
            setPageError(err.response?.data?.message || "Failed to load user profile");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDetail(); }, [id, organizationId]);

    // Merge updated profile fields without full refetch
    const handleProfileSaved = (updatedUser) => {
        setData(prev => ({
            ...prev,
            user: { ...prev.user, ...updatedUser },
        }));
        setToast({ message: "Profile updated successfully.", type: "success" });
    };

    const runAction = async (key, endpoint, body, method = "patch") => {
        setActionLoading(key);
        try {
            await platformApi[method](endpoint, body);
            await fetchDetail();
        } catch (err) {
            setPageError(err.response?.data?.message || "Action failed");
        } finally {
            setActionLoading(null);
            setConfirm({ open: false });
        }
    };

    const openConfirm = (key, title, message, intent = "warning") => {
        setConfirm({ open: true, key, title, message, intent });
    };

    const executeConfirm = () => {
        const { user } = data;
        switch (confirm.key) {
            case "FORCE_LOGOUT":
                return runAction("FORCE_LOGOUT", isPlatformUser
                    ? `/governance/platform/${id}/force-logout`
                    : `/governance/org/${organizationId}/${id}/force-logout`, {});
            case "TOGGLE_STATUS":
                return runAction("TOGGLE_STATUS", `/governance/platform/${id}/status`, { isActive: !user.isActive });
            case "RESET_2FA":
                return runAction("RESET_2FA", `/governance/platform/${id}/reset-2fa`, {});
            default: break;
        }
    };

    const handleResendInvite = async () => {
        setActionLoading("RESEND_INVITE");
        try {
            await platformApi.post(`/users/${id}/resend-invite`);
            setToast({ message: "Invitation email sent successfully.", type: "success" });
        } catch (err) {
            setToast({ message: err.response?.data?.message || "Failed to resend invite.", type: "error" });
        } finally {
            setActionLoading(null);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-sm text-slate-400 font-medium">Loading profile…</p>
            </div>
        );
    }

    const { user, auditLogs, sessions } = data;

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

                {/* ── Header ── */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <nav className="flex items-center gap-1.5 text-sm text-slate-500">
                        <button onClick={() => navigate(-1)}
                            className="hover:text-slate-800 font-medium transition-colors flex items-center gap-1">
                            <ChevronLeft className="w-3.5 h-3.5" />
                            Staff Management
                        </button>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                        <span className="text-slate-800 font-semibold">User Details</span>
                    </nav>
                    <button
                        onClick={() => navigate("/platform/users")}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Add Staff
                    </button>
                </div>

                {/* ── Error banner ── */}
                {pageError && (
                    <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        <span className="flex-1">{pageError}</span>
                        <button onClick={() => setPageError(null)} className="hover:text-red-900 transition-colors ml-auto">✕</button>
                    </div>
                )}

                {/* ── Profile hero ── */}
                <UserIdentityHeader
                    user={user}
                    roleLabel={isPlatformUser ? roleLabel(user?.role) : (user?.roleId?.name || 'Org Staff')}
                    onEdit={() => setEditProfileOpen(true)}
                />

                {/* ── Two-column grid ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* ─── LEFT: identity + security ─── */}
                    <div className="space-y-5">

                        {/* Account details */}
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Account Details</p>
                            <InfoRow label="Role">
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs font-semibold uppercase tracking-wide">
                                    <Shield className="w-3 h-3" />
                                    {isPlatformUser ? roleLabel(user?.role) : (user?.roleId?.name || "Org Staff")}
                                </span>
                            </InfoRow>
                            <InfoRow label="Account Type">
                                <span className="flex items-center gap-1.5 text-slate-700">
                                    {isPlatformUser
                                        ? <Shield className="w-3.5 h-3.5 text-indigo-500" />
                                        : <Building2 className="w-3.5 h-3.5 text-emerald-500" />}
                                    {isPlatformUser ? "Platform Admin" : "Org Staff"}
                                </span>
                            </InfoRow>
                            <InfoRow label="Status">
                                {user?.isActive
                                    ? <span className="flex items-center gap-1.5 text-emerald-700 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" />Active</span>
                                    : <span className="flex items-center gap-1.5 text-red-700 font-semibold"><XCircle className="w-3.5 h-3.5" />Locked</span>}
                            </InfoRow>
                            <InfoRow label="2FA">
                                {user?.twoFactorEnabled
                                    ? <span className="flex items-center gap-1.5 text-emerald-700 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" />Enabled</span>
                                    : <span className="flex items-center gap-1.5 text-amber-600 font-semibold"><AlertTriangle className="w-3.5 h-3.5" />Disabled</span>}
                            </InfoRow>
                            {user?.updatedAt && (
                                <InfoRow label="Last Updated">
                                    <span className="text-slate-500 text-xs">{formatAuditDate(user.updatedAt)}</span>
                                </InfoRow>
                            )}
                        </div>

                        {/* Contact Information */}
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Contact Information</p>
                            </div>
                            {user?.jobTitle && (
                                <InfoRow label="Job Title">
                                    <span className="flex items-center gap-1.5 text-slate-700">
                                        <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                                        {user.jobTitle}
                                    </span>
                                </InfoRow>
                            )}
                            {user?.department && (
                                <InfoRow label="Department">
                                    <span className="flex items-center gap-1.5 text-slate-700">
                                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                        {user.department}
                                    </span>
                                </InfoRow>
                            )}
                            {user?.phone && (
                                <InfoRow label="Phone">
                                    <span className="flex items-center gap-1.5 text-slate-700 font-mono text-xs">
                                        <Phone className="w-3 h-3 text-slate-400" />
                                        {user.phone}
                                    </span>
                                </InfoRow>
                            )}
                            {user?.whatsapp && (
                                <InfoRow label="WhatsApp">
                                    <span className="flex items-center gap-1.5 text-slate-700 font-mono text-xs">
                                        <MessageCircle className="w-3 h-3 text-emerald-500" />
                                        {user.whatsapp}
                                    </span>
                                </InfoRow>
                            )}
                            {!user?.phone && !user?.whatsapp && !user?.jobTitle && !user?.department && (
                                <p className="text-xs text-slate-400 text-center py-3">No contact info yet. <button onClick={() => setEditProfileOpen(true)} className="text-indigo-600 hover:underline">Add now</button></p>
                            )}
                            {/* Quick-contact actions */}
                            {(user?.phone || user?.whatsapp || user?.email) && (
                                <div className="flex gap-2 mt-4">
                                    {user?.phone && (
                                        <a href={`tel:${user.phone}`}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors">
                                            <Phone className="w-3.5 h-3.5" /> Call
                                        </a>
                                    )}
                                    {user?.whatsapp && (
                                        <a href={`https://wa.me/${user.whatsapp.replace(/[^0-9]/g, "")}`}
                                            target="_blank" rel="noopener noreferrer"
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-colors">
                                            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                                        </a>
                                    )}
                                    {user?.email && (
                                        <a href={`mailto:${user.email}`}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors">
                                            <Mail className="w-3.5 h-3.5" /> Email
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Security Actions */}
                        {isPlatformUser && (
                            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Security Actions</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <ActionTile
                                        icon={user?.isActive ? Lock : Unlock}
                                        label={user?.isActive ? "Lock Account" : "Unlock"}
                                        loading={actionLoading === "TOGGLE_STATUS"}
                                        disabled={!!actionLoading}
                                        hoverClass={user?.isActive
                                            ? "hover:bg-red-50 hover:border-red-200 hover:text-red-600"
                                            : "hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700"}
                                        onClick={() => openConfirm(
                                            "TOGGLE_STATUS",
                                            user.isActive ? "Lock Account" : "Unlock Account",
                                            user.isActive
                                                ? `Lock ${user.name}'s account? They cannot log in.`
                                                : `Restore login access for ${user.name}?`,
                                            user.isActive ? "danger" : "warning"
                                        )}
                                    />
                                    <ActionTile
                                        icon={LogOut}
                                        label="Force Logout"
                                        loading={actionLoading === "FORCE_LOGOUT"}
                                        disabled={!!actionLoading}
                                        hoverClass="hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700"
                                        onClick={() => openConfirm(
                                            "FORCE_LOGOUT",
                                            "Force Logout Sessions",
                                            `Immediately invalidate all active sessions for ${user.name}.`,
                                            "warning"
                                        )}
                                    />
                                    <ActionTile
                                        icon={RefreshCw}
                                        label="Reset 2FA"
                                        loading={actionLoading === "RESET_2FA"}
                                        disabled={!!actionLoading || !user?.twoFactorEnabled}
                                        disabledHint="User has not enrolled in 2FA"
                                        hoverClass="hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700"
                                        onClick={() => openConfirm(
                                            "RESET_2FA",
                                            "Reset 2FA",
                                            `Clear 2FA enrollment for ${user.name}. They must re-enroll on next login.`,
                                            "warning"
                                        )}
                                    />
                                    <ActionTile
                                        icon={Key}
                                        label="Reset Password"
                                        loading={false}
                                        disabled={!!actionLoading}
                                        hoverClass="hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700"
                                        onClick={() => setResetPwModal(true)}
                                    />
                                    <ActionTile
                                        icon={Send}
                                        label="Resend Invite"
                                        loading={actionLoading === "RESEND_INVITE"}
                                        disabled={!!actionLoading}
                                        hoverClass="hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700"
                                        onClick={handleResendInvite}
                                    />
                                </div>
                                {!user?.twoFactorEnabled && (
                                    <p className="text-[11px] text-slate-400 mt-3 text-center">Reset 2FA unavailable — not enrolled</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ─── RIGHT: sessions + audit ─── */}
                    <div className="lg:col-span-2 space-y-5">
                        <SectionCard
                            title="Active Sessions"
                            icon={Activity}
                            iconColor="text-emerald-500"
                            action={
                                <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                    {sessions.length} active
                                </span>
                            }
                        >
                            <SessionList sessions={sessions} lastLoginAt={user?.lastLogin || user?.lastLoginAt} />
                        </SectionCard>

                        <SectionCard
                            title="Audit Timeline"
                            icon={History}
                            iconColor="text-indigo-500"
                        >
                            <div className="max-h-[520px] overflow-y-auto">
                                <AuditTimeline logs={auditLogs} />
                            </div>
                        </SectionCard>
                    </div>
                </div>
            </div>

            {/* ── Modals + Toast ── */}
            <ConfirmActionModal
                open={confirm.open}
                title={confirm.title}
                message={confirm.message}
                intent={confirm.intent}
                loading={!!actionLoading}
                onConfirm={executeConfirm}
                onCancel={() => setConfirm({ open: false })}
            />
            <ResetPasswordModal
                open={resetPwModal}
                userName={user?.name}
                userId={id}
                onClose={() => setResetPwModal(false)}
                onSuccess={(msg) => setToast({ message: msg, type: "success" })}
            />
            {toast && (
                <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
            )}
            <EditProfileModal
                open={editProfileOpen}
                user={user}
                onClose={() => setEditProfileOpen(false)}
                onSaved={handleProfileSaved}
                saveEndpoint={isPlatformUser ? `/users/${id}/profile` : `/governance/org/${organizationId}/${id}/profile`}
            />
        </div>
    );
};

export default function UserDetailPage() {
    return (
        <RequireCapability permission="VIEW_ORGANIZATIONS">
            <UserDetailPageContent />
        </RequireCapability>
    );
}
