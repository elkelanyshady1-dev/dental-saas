/**
 * OrganizationUserDetailPage.jsx
 * Platform — Org User Security Profile
 * Route: /platform/organizations/:orgId/users/:userId
 * Capability: VIEW_ORGANIZATIONS
 *
 * Layout identical to UserDetailPage but uses:
 *   GET  /governance/org/:orgId/:userId           — fetch profile + sessions + audit
 *   PATCH /governance/org/:orgId/:userId/status   — lock / unlock
 *   PATCH /governance/org/:orgId/:userId/force-logout
 *   PATCH /governance/org/:orgId/:userId/reset-password
 *   PATCH /governance/org/:orgId/:userId/reset-2fa (if available)
 */
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ChevronRight, ChevronLeft,
    Shield, History, Lock, Unlock,
    LogOut, RefreshCw, Building2, Key,
    AlertTriangle, Loader2, CheckCircle2, XCircle,
    Clock, Monitor, Smartphone, Globe, Activity,
    KeyRound, Plus, Mail, Copy,
    Phone, MessageCircle, Briefcase, Pencil,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import platformApi from '../auth/platformApi';
import RequireCapability from '../core/guards/RequireCapability';
import EditProfileModal from './EditProfileModal';
import UserIdentityHeader from './components/UserIdentityHeader';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr) {
    if (!dateStr) return 'Never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return 'Just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return d === 1 ? 'Yesterday' : `${d}d ago`;
}

function formatAuditDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
        d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function getInitials(name = '') {
    return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function parseUA(ua = '') {
    const lower = ua.toLowerCase();
    let browser = 'Browser', os = 'Unknown OS';
    if (lower.includes('chrome') && !lower.includes('edg')) browser = 'Chrome';
    else if (lower.includes('firefox')) browser = 'Firefox';
    else if (lower.includes('safari') && !lower.includes('chrome')) browser = 'Safari';
    else if (lower.includes('edg')) browser = 'Edge';
    if (lower.includes('windows')) os = 'Windows';
    else if (lower.includes('mac')) os = 'macOS';
    else if (lower.includes('linux')) os = 'Linux';
    else if (lower.includes('android')) os = 'Android';
    else if (lower.includes('ios') || lower.includes('iphone')) os = 'iOS';
    return { browser, os, isMobile: lower.includes('mobi') };
}

function maskIP(ip = '') {
    if (!ip) return 'Unknown';
    if (['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(ip)) return 'localhost';
    if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + ':****';
    const parts = ip.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.***.***`;
    return ip;
}

// ─── Audit event map ──────────────────────────────────────────────────────────

const AUDIT_CFG = {
    LOGIN_SUCCESS: { label: 'Login Successful', dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    LOGIN_FAILED: { label: 'Login Failed', dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
    LOGOUT: { label: 'Logged Out', dot: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' },
    TOKEN_REFRESH: { label: 'Session Refreshed', dot: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
    PASSWORD_CHANGE: { label: 'Password Changed', dot: 'bg-purple-500', text: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
    USER_CREATE: { label: 'User Created', dot: 'bg-indigo-500', text: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' },
    USER_UPDATE: { label: 'Profile Updated', dot: 'bg-cyan-500', text: 'text-cyan-700', bg: 'bg-cyan-50', border: 'border-cyan-200' },
    PASSWORD_RESET_BY_ADMIN: { label: 'Password Reset by Admin', dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
    INVITE_SENT: { label: 'Invitation Sent', dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
    INVITE_ACCEPTED: { label: 'Invitation Accepted', dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    CAPABILITY_DENIED: { label: 'Access Denied', dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
    ORG_USER_LOCKED: { label: 'Account Locked', dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
    ORG_FORCE_LOGOUT: { label: 'Sessions Revoked', dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
};
const DEFAULT_AUDIT = { label: null, dot: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' };

function auditCfg(action) {
    return AUDIT_CFG[action] || { ...DEFAULT_AUDIT, label: action?.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()) };
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function UserAvatar({ user }) {
    const initials = getInitials(user?.name);
    const colors = ['from-indigo-500 to-purple-600', 'from-blue-500 to-cyan-600', 'from-emerald-500 to-teal-600', 'from-rose-500 to-pink-600'];
    const gradient = colors[(user?.name?.charCodeAt(0) || 0) % colors.length];
    if (user?.profilePhotoUrl) {
        return <img src={user.profilePhotoUrl} alt={user.name} className="w-20 h-20 rounded-full object-cover ring-4 ring-white shadow-md flex-shrink-0" />;
    }
    return (
        <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${gradient} ring-4 ring-white shadow-md flex items-center justify-center font-bold text-white text-2xl flex-shrink-0 select-none`}>
            {initials}
        </div>
    );
}

// ─── InfoRow ──────────────────────────────────────────────────────────────────

function InfoRow({ label, children }) {
    return (
        <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
            <div className="text-sm font-medium text-slate-800">{children}</div>
        </div>
    );
}

// ─── SectionCard ─────────────────────────────────────────────────────────────

function SectionCard({ title, icon: Icon, iconColor = 'text-slate-400', action, children }) {
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

// ─── Audit Timeline ───────────────────────────────────────────────────────────

function AuditTimeline({ logs }) {
    if (!logs || logs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                <History className="w-7 h-7 text-slate-300" />
                <p className="text-slate-400 text-sm">No security events recorded.</p>
            </div>
        );
    }

    return (
        <div className="space-y-0">
            {logs.map((log, i) => {
                const cfg = auditCfg(log.action);
                return (
                    <div key={log._id || i} className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
                        {/* Coloured dot */}
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${cfg.dot}`} />

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                {/* Human-readable label badge */}
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                    {cfg.label}
                                </span>
                                <span className="text-xs text-slate-400 whitespace-nowrap">{formatAuditDate(log.createdAt)}</span>
                            </div>

                            {(log.ipAddress || log.success !== undefined) && (
                                <div className="flex items-center gap-2 mt-1">
                                    {log.success !== undefined && (
                                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${log.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                            {log.success ? 'OK' : 'DENIED'}
                                        </span>
                                    )}
                                    {log.ipAddress && !['::1', '127.0.0.1'].includes(log.ipAddress) && (
                                        <span className="text-[10px] text-slate-400 font-mono">{log.ipAddress}</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Session list ─────────────────────────────────────────────────────────────

function SessionList({ sessions }) {
    if (!sessions || sessions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                <Clock className="w-7 h-7 text-slate-300" />
                <p className="text-slate-400 text-sm">No active sessions detected.</p>
            </div>
        );
    }

    return (
        <div className="space-y-0">
            {sessions.map((session, idx) => {
                const { browser, os, isMobile } = parseUA(session.userAgent);
                const DeviceIcon = isMobile ? Smartphone : Monitor;
                return (
                    <div key={idx} className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
                        <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <DeviceIcon className="w-4 h-4 text-slate-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-slate-800">{browser} — {os}</span>
                                {idx === 0 && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 uppercase">Current</span>
                                )}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                                <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{maskIP(session.ipAddress)}</span>
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatRelativeTime(session.lastActive || session.lastUsedAt)}</span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Reset Password modal ─────────────────────────────────────────────────────

function ResetPasswordModal({ user, orgId, onClose }) {
    const [method, setMethod] = useState('email');
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState(null);
    const [err, setErr] = useState(null);
    const [copied, setCopied] = useState(false);
    const [org, setOrg] = useState(null);

    // Fetch org to get name + slug
    useEffect(() => {
        if (!orgId) return;
        platformApi.get(`/organizations/${orgId}`)
            .then(r => setOrg(r.data))
            .catch(() => { }); // non-fatal — slug display degrades gracefully
    }, [orgId]);

    // Escape key dismiss
    useEffect(() => {
        const h = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [onClose]);

    const handleSubmit = async () => {
        setSaving(true);
        setErr(null);
        try {
            const res = await platformApi.patch(`/governance/org/${orgId}/${user._id}/reset-password`, { method });
            setResult(res.data);
        } catch (e) {
            setErr(e.response?.data?.message || 'Failed to reset password.');
        } finally {
            setSaving(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(result.temporaryPassword);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // ── Identity card — shown in both steps ───────────────────────────────────
    const IdentityCard = () => (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
            {/* Admin user row */}
            <div className="flex items-start gap-2.5">
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold flex-shrink-0 select-none">
                    {(user?.name || user?.email || 'U').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 truncate leading-tight">
                        {user?.name || '—'}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate font-mono leading-tight mt-0.5">
                        {user?.email || '—'}
                    </p>
                </div>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-200" />

            {/* Clinic row */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                    <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span className="text-[11px] font-semibold text-slate-600 truncate">
                        {org?.name || 'Loading clinic…'}
                    </span>
                </div>
                {org?.slug && (
                    <span className="flex-shrink-0 px-2 py-0.5 rounded-md bg-slate-200 text-slate-600 text-[10px] font-mono font-bold tracking-wide">
                        {org.slug}
                    </span>
                )}
            </div>
        </div>
    );

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-900">Reset Password</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">&times;</button>
                </div>

                <div className="px-5 py-4 space-y-4">
                    {/* Always-visible identity card */}
                    <IdentityCard />

                    {!result ? (
                        <>
                            {err && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{err}</p>}
                            <p className="text-xs text-slate-500">Choose how to reset this user's password:</p>

                            <div className="space-y-2">
                                {[
                                    { v: 'email', label: 'Send Reset Email', sub: 'User clicks link to set a new password' },
                                    { v: 'temp_password', label: 'Generate Temporary Password', sub: 'Share credentials manually' }
                                ].map(opt => (
                                    <button key={opt.v} onClick={() => setMethod(opt.v)}
                                        className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${method === opt.v ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
                                        <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${method === opt.v ? 'border-indigo-500' : 'border-slate-300'}`}>
                                            {method === opt.v && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                                        </div>
                                        <div>
                                            <p className={`text-xs font-semibold ${method === opt.v ? 'text-indigo-700' : 'text-slate-700'}`}>{opt.label}</p>
                                            <p className="text-[11px] text-slate-400 mt-0.5">{opt.sub}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>

                            <div className="flex gap-3">
                                <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors">Cancel</button>
                                <button onClick={handleSubmit} disabled={saving}
                                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
                                </button>
                            </div>
                        </>
                    ) : result.emailSent || (!result.temporaryPassword) ? (
                        <div className="text-center py-2">
                            <Mail className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                            <h4 className="font-bold text-slate-900">Reset Email Sent</h4>
                            <p className="text-sm text-slate-500 mt-1">A password reset link was sent to <strong>{user?.email}</strong>.</p>
                            <button onClick={onClose} className="mt-4 w-full py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-500 transition-colors">Done</button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-xs text-slate-500">
                                Copy this temporary password and share it securely with the user:
                            </p>
                            {/* Password block */}
                            <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                <code className="flex-1 font-mono text-sm font-bold text-slate-800 select-all">{result.temporaryPassword}</code>
                                <button onClick={handleCopy}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${copied ? 'bg-emerald-100 text-emerald-700' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                                    {copied ? <><CheckCircle2 className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                                </button>
                            </div>
                            {/* Warning note */}
                            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
                                ⚠ User will be required to change this password on next login.
                            </p>
                            <button onClick={onClose} className="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-500 transition-colors">Done</button>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─── Confirm modal ────────────────────────────────────────────────────────────

function ConfirmModal({ open, title, message, intent = 'warning', loading, onConfirm, onCancel }) {
    useEffect(() => {
        if (!open) return;
        const h = (e) => { if (e.key === 'Escape') onCancel(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [open, onCancel]);

    if (!open) return null;
    const isDanger = intent === 'danger';

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm shadow-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2.5 rounded-xl border ${isDanger ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                        <AlertTriangle className={`w-4 h-4 ${isDanger ? 'text-red-600' : 'text-amber-600'}`} />
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
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-40 ${isDanger ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-amber-500 hover:bg-amber-400 text-white'}`}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type = 'success', onDismiss }) {
    useEffect(() => {
        const t = setTimeout(onDismiss, 3500);
        return () => clearTimeout(t);
    }, [onDismiss]);
    return createPortal(
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm font-semibold
            ${type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {type === 'success'
                ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                : <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />}
            {message}
        </div>,
        document.body
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const OrgUserDetailContent = () => {
    const { orgId, userId } = useParams();
    const navigate = useNavigate();

    const [data, setData] = useState({ user: null, auditLogs: [], sessions: [] });
    const [loading, setLoading] = useState(true);
    const [pageError, setPageError] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);
    const [confirm, setConfirm] = useState({ open: false, key: null, title: '', message: '', intent: 'warning' });
    const [showResetPwd, setShowResetPwd] = useState(false);
    const [editProfileOpen, setEditProfileOpen] = useState(false);
    const [toast, setToast] = useState(null);

    const fetchDetail = async () => {
        // Guard: never fire with missing route params
        if (!orgId || !userId) {
            console.warn('[OrgUserDetail] Missing route params', { orgId, userId });
            setPageError('Invalid page URL — organization or user context is missing.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setPageError(null);
        try {
            const res = await platformApi.get(`/governance/org/${orgId}/${userId}`);
            setData({
                user: res.data.user,
                auditLogs: res.data.auditLogs || [],
                sessions: res.data.sessions || [],
            });
        } catch (err) {
            setPageError(err.response?.data?.message || 'Failed to load user profile');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDetail(); }, [orgId, userId]);

    // Merge profile updates without full refetch
    const handleProfileSaved = (updatedUser) => {
        setData(prev => ({ ...prev, user: { ...prev.user, ...updatedUser } }));
        setToast({ message: 'Profile updated successfully.', type: 'success' });
    };

    const runAction = async (key, endpoint, body = {}) => {
        setActionLoading(key);
        try {
            await platformApi.patch(endpoint, body);
            await fetchDetail();
        } catch (err) {
            setPageError(err.response?.data?.message || 'Action failed');
        } finally {
            setActionLoading(null);
            setConfirm({ open: false });
        }
    };

    const openConfirm = (key, title, message, intent = 'warning') =>
        setConfirm({ open: true, key, title, message, intent });

    const executeConfirm = () => {
        const { user } = data;
        switch (confirm.key) {
            case 'FORCE_LOGOUT':
                return runAction('FORCE_LOGOUT', `/governance/org/${orgId}/${userId}/force-logout`);
            case 'TOGGLE_STATUS':
                return runAction('TOGGLE_STATUS', `/governance/org/${orgId}/${userId}/status`, { isActive: !user.isActive });
            case 'RESET_2FA':
                return runAction('RESET_2FA', `/governance/org/${orgId}/${userId}/reset-2fa`);
            default: break;
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

    // Full-page error state (bad params, network failure, 404, etc.)
    if (pageError && !data.user) {
        const isParamError = !orgId || !userId;
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
                <div className="w-16 h-16 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-center mb-5">
                    <AlertTriangle className="w-7 h-7 text-red-500" />
                </div>
                <h2 className="text-lg font-bold text-slate-800">
                    {isParamError ? 'Page URL Invalid' : 'Unable to Load User'}
                </h2>
                <p className="text-sm text-slate-500 mt-2 max-w-sm leading-relaxed">
                    {isParamError
                        ? 'The organization or user ID is missing from the URL. Navigate back and try again.'
                        : pageError}
                </p>
                <div className="flex gap-3 mt-6">
                    {!isParamError && (
                        <button
                            onClick={fetchDetail}
                            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-500 transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" /> Retry
                        </button>
                    )}
                    <button
                        onClick={() => navigate(orgId ? `/platform/organizations/${orgId}` : '/platform/organizations')}
                        className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        {orgId ? 'Back to Organization' : 'Back to Organizations'}
                    </button>
                </div>
            </div>
        );
    }

    const { user, auditLogs, sessions } = data;

    // Null-user guard: load completed but API returned no user
    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
                <div className="w-16 h-16 bg-slate-100 border border-slate-200 rounded-2xl flex items-center justify-center mb-5">
                    <XCircle className="w-7 h-7 text-slate-400" />
                </div>
                <h2 className="text-lg font-bold text-slate-700">User Not Found</h2>
                <p className="text-sm text-slate-400 mt-2">This user may have been deleted or transferred.</p>
                <button
                    onClick={() => navigate(`/platform/organizations/${orgId}`)}
                    className="mt-5 flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors"
                >
                    <ChevronLeft className="w-4 h-4" /> Back to Organization
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

                {/* ── Header row ── */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                    {/* Breadcrumb */}
                    <nav className="flex items-center gap-1.5 text-sm text-slate-500">
                        <button
                            onClick={() => navigate(`/platform/organizations/${orgId}`)}
                            className="hover:text-slate-800 font-medium transition-colors flex items-center gap-1"
                        >
                            <ChevronLeft className="w-3.5 h-3.5" />
                            Organization
                        </button>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                        <button
                            onClick={() => { navigate(`/platform/organizations/${orgId}`); }}
                            className="hover:text-slate-800 font-medium transition-colors"
                        >
                            Users
                        </button>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                        <span className="text-slate-800 font-semibold">User Details</span>
                    </nav>
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
                    roleLabel={user?.roleId?.name || user?.role?.name || 'Org Staff'}
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
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold uppercase tracking-wide">
                                    {user?.roleId?.name || user?.role?.name || 'Org Staff'}
                                </span>
                            </InfoRow>
                            <InfoRow label="Account Type">
                                <span className="flex items-center gap-1.5 text-slate-700">
                                    <Building2 className="w-3.5 h-3.5 text-emerald-500" />
                                    Organization Staff
                                </span>
                            </InfoRow>
                            <InfoRow label="Status">
                                {user?.isActive
                                    ? <span className="flex items-center gap-1.5 text-emerald-700 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" />Active</span>
                                    : <span className="flex items-center gap-1.5 text-red-700 font-semibold"><XCircle className="w-3.5 h-3.5" />Suspended</span>
                                }
                            </InfoRow>
                            <InfoRow label="2FA">
                                {user?.twoFactorEnabled
                                    ? <span className="flex items-center gap-1.5 text-emerald-700 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" />Enabled</span>
                                    : <span className="flex items-center gap-1.5 text-amber-600 font-semibold"><AlertTriangle className="w-3.5 h-3.5" />Disabled</span>
                                }
                            </InfoRow>
                            {user?.branchAccess && (
                                <InfoRow label="Branches">
                                    <span className="text-slate-700">{user.hasFullBranchAccess ? 'Full Access' : `${user.branchAccess.length} branches`}</span>
                                </InfoRow>
                            )}
                            {user?.createdAt && (
                                <InfoRow label="Created">
                                    <span className="text-slate-500 text-xs">{formatAuditDate(user.createdAt)}</span>
                                </InfoRow>
                            )}
                        </div>

                        {/* Contact Information */}
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Contact Information</p>
                            {user?.jobTitle && (
                                <InfoRow label="Job Title">
                                    <span className="flex items-center gap-1.5 text-slate-700">
                                        <Briefcase className="w-3.5 h-3.5 text-slate-400" />{user.jobTitle}
                                    </span>
                                </InfoRow>
                            )}
                            {user?.department && (
                                <InfoRow label="Department">
                                    <span className="flex items-center gap-1.5 text-slate-700">
                                        <Building2 className="w-3.5 h-3.5 text-slate-400" />{user.department}
                                    </span>
                                </InfoRow>
                            )}
                            {user?.phone && (
                                <InfoRow label="Phone">
                                    <span className="flex items-center gap-1.5 text-slate-700 font-mono text-xs">
                                        <Phone className="w-3 h-3 text-slate-400" />{user.phone}
                                    </span>
                                </InfoRow>
                            )}
                            {user?.whatsapp && (
                                <InfoRow label="WhatsApp">
                                    <span className="flex items-center gap-1.5 text-slate-700 font-mono text-xs">
                                        <MessageCircle className="w-3 h-3 text-emerald-500" />{user.whatsapp}
                                    </span>
                                </InfoRow>
                            )}
                            {!user?.phone && !user?.whatsapp && !user?.jobTitle && !user?.department && (
                                <p className="text-xs text-slate-400 text-center py-3">
                                    No contact info yet.{' '}
                                    <button onClick={() => setEditProfileOpen(true)} className="text-indigo-600 hover:underline">Add now</button>
                                </p>
                            )}
                            {/* Quick-contact */}
                            {(user?.phone || user?.whatsapp || user?.email) && (
                                <div className="flex gap-2 mt-4">
                                    {user?.phone && (
                                        <a href={`tel:${user.phone}`}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors">
                                            <Phone className="w-3.5 h-3.5" /> Call
                                        </a>
                                    )}
                                    {user?.whatsapp && (
                                        <a href={`https://wa.me/${user.whatsapp.replace(/[^0-9]/g, '')}`}
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
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Security Actions</p>
                            <div className="grid grid-cols-2 gap-3">

                                {/* Lock / Unlock */}
                                <button
                                    onClick={() => openConfirm('TOGGLE_STATUS',
                                        user?.isActive ? 'Suspend Account' : 'Restore Account',
                                        user?.isActive
                                            ? `Suspend ${user?.name}'s access to this organization?`
                                            : `Restore login access for ${user?.name}?`,
                                        user?.isActive ? 'danger' : 'warning'
                                    )}
                                    disabled={!!actionLoading}
                                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-xs font-semibold transition-all disabled:opacity-40 ${user?.isActive
                                        ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600'
                                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700'}`}
                                >
                                    {actionLoading === 'TOGGLE_STATUS' ? <Loader2 className="w-5 h-5 animate-spin" /> : user?.isActive ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
                                    <span className="text-center leading-tight">{user?.isActive ? 'Suspend' : 'Restore'}</span>
                                </button>

                                {/* Force Logout */}
                                <button
                                    onClick={() => openConfirm('FORCE_LOGOUT', 'Force Logout', `Invalidate all active sessions for ${user?.name}.`, 'warning')}
                                    disabled={!!actionLoading}
                                    className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700 transition-all disabled:opacity-40"
                                >
                                    {actionLoading === 'FORCE_LOGOUT' ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
                                    <span className="text-center leading-tight">Force Logout</span>
                                </button>

                                {/* Reset Password */}
                                <button
                                    onClick={() => setShowResetPwd(true)}
                                    disabled={!!actionLoading}
                                    className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-all disabled:opacity-40"
                                >
                                    <Key className="w-5 h-5" />
                                    <span className="text-center leading-tight">Reset Password</span>
                                </button>

                                {/* Reset 2FA */}
                                <button
                                    onClick={() => openConfirm('RESET_2FA', 'Reset 2FA', `Clear 2FA enrollment for ${user?.name}. They must re-enroll on next login.`, 'warning')}
                                    disabled={!!actionLoading || !user?.twoFactorEnabled}
                                    className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {actionLoading === 'RESET_2FA' ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                                    <span className="text-center leading-tight">Reset 2FA</span>
                                </button>
                            </div>
                            {!user?.twoFactorEnabled && (
                                <p className="text-[11px] text-slate-400 mt-2 text-center">Reset 2FA unavailable — not enrolled</p>
                            )}
                        </div>
                    </div>

                    {/* ─── RIGHT: sessions + audit ─── */}
                    <div className="lg:col-span-2 space-y-5">

                        {/* Active Sessions */}
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
                            <SessionList sessions={sessions} />
                        </SectionCard>

                        {/* Audit Timeline */}
                        <SectionCard
                            title="Audit Timeline"
                            icon={History}
                            iconColor="text-indigo-500"
                            action={
                                <span className="text-xs text-slate-400 font-medium">
                                    {auditLogs.length} event{auditLogs.length !== 1 ? 's' : ''}
                                </span>
                            }
                        >
                            <div className="max-h-[500px] overflow-y-auto -m-5 px-5 py-0 pt-2">
                                <AuditTimeline logs={auditLogs} />
                            </div>
                        </SectionCard>
                    </div>
                </div>
            </div>

            {/* Confirm modal */}
            <ConfirmModal
                open={confirm.open}
                title={confirm.title}
                message={confirm.message}
                intent={confirm.intent}
                loading={!!actionLoading}
                onConfirm={executeConfirm}
                onCancel={() => setConfirm({ open: false })}
            />

            {/* Reset Password modal */}
            {showResetPwd && (
                <ResetPasswordModal
                    user={data.user}
                    orgId={orgId}
                    onClose={() => setShowResetPwd(false)}
                />
            )}
            <EditProfileModal
                open={editProfileOpen}
                user={data.user}
                onClose={() => setEditProfileOpen(false)}
                onSaved={handleProfileSaved}
                saveEndpoint={`/governance/org/${orgId}/${userId}/profile`}
            />
            {toast && (
                <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
            )}
        </div>
    );
};

export default function OrganizationUserDetailPage() {
    return (
        <RequireCapability permission="VIEW_ORGANIZATIONS">
            <OrgUserDetailContent />
        </RequireCapability>
    );
}
