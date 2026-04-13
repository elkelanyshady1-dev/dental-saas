/**
 * OrgUsersPanel.jsx
 * v4.0 — Clickable users table + Add User modal + role/status filter
 *
 * Navigation: each row → /platform/organizations/:orgId/users/:userId
 *             which renders OrganizationUserDetailPage via the feature registry.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Users, UserCheck, UserX, Search, ChevronDown,
    Plus, Mail, Clock, ChevronRight, Loader2, X,
    Copy, CheckCircle2, Eye
} from 'lucide-react';
import { createPortal } from 'react-dom';
import Card, { CardHeader } from '@/platform/core/ui/Card';
import { StatusBadge } from '@/platform/core/ui/StatusBadge';
import platformApi from '@/platform/auth/platformApi';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function relativeTime(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return d === 1 ? 'Yesterday' : `${d}d ago`;
}

function getInitials(name = '') {
    return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() || '?';
}

// ─── Role options for Add User modal ─────────────────────────────────────────
// NOTE: Roles are now fetched dynamically from the API — NO hardcoded role names.
// This was the root cause of the "Role 'ORG_ADMIN' not found" error:
// DB stores roles as lowercase (org_admin, doctor, etc.) but the hardcoded
// ORG_ROLES constant used uppercase (ORG_ADMIN). Additionally, sending role
// names instead of ObjectIds is fragile. The modal now sends roleId (ObjectId).

// Display name formatter: "org_admin" → "Org Admin"
const formatRoleName = (name = '') =>
    name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// ─── Onboarding method selector ───────────────────────────────────────────────

const ONBOARDING_METHODS = [
    { value: 'invite', label: 'Send Invite Email', sub: 'User receives a secure registration link' },
    { value: 'temp_password', label: 'Generate Temporary Password', sub: 'Share credentials manually' },
];

// ─── Add User Modal ───────────────────────────────────────────────────────────

function AddUserModal({ orgId, onClose, onSuccess }) {
    const [form, setForm] = useState({ firstName: '', lastName: '', email: '', roleId: '', onboardingMethod: 'invite' });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState(null);
    const [result, setResult] = useState(null); // { inviteSent, temporaryPassword }
    const [copied, setCopied] = useState(false);
    const [roles, setRoles] = useState([]);      // fetched from API
    const [rolesLoading, setRolesLoading] = useState(true);

    // Fetch org roles on mount
    React.useEffect(() => {
        let cancelled = false;
        async function fetchRoles() {
            try {
                const res = await platformApi.get(`/governance/org/${orgId}/roles`);
                const data = res.data?.data || res.data || [];
                if (!cancelled) {
                    setRoles(data);
                    // Auto-select first role
                    if (data.length > 0 && !form.roleId) {
                        setForm(p => ({ ...p, roleId: data[0]._id }));
                    }
                }
            } catch (e) {
                if (!cancelled) setErr('Failed to load roles.');
            } finally {
                if (!cancelled) setRolesLoading(false);
            }
        }
        fetchRoles();
        return () => { cancelled = true; };
    }, [orgId]);

    // ESC to close
    React.useEffect(() => {
        const h = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [onClose]);

    const handleSubmit = async () => {
        if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
            setErr('First name, last name and email are required.');
            return;
        }
        if (!form.roleId) {
            setErr('Please select a role.');
            return;
        }
        setSaving(true);
        setErr(null);
        try {
            const res = await platformApi.post(`/governance/org/${orgId}/users`, {
                firstName: form.firstName,
                lastName: form.lastName,
                email: form.email,
                roleId: form.roleId,          // ← ObjectId, NOT name string
                onboardingMethod: form.onboardingMethod,
            });
            setResult(res.data);
        } catch (e) {
            setErr(e.response?.data?.message || 'Failed to create user.');
        } finally {
            setSaving(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(result.temporaryPassword);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDone = () => { onSuccess(); onClose(); };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-indigo-50 rounded-lg border border-indigo-100">
                            <Plus className="w-4 h-4 text-indigo-600" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-900">Add Organization User</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="px-6 py-5 space-y-4">
                    {!result ? (
                        <>
                            {err && (
                                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                                    {err}
                                </div>
                            )}

                            {/* Name — split row */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">First Name</label>
                                    <input
                                        value={form.firstName}
                                        onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))}
                                        placeholder="Ahmed"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Last Name</label>
                                    <input
                                        value={form.lastName}
                                        onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))}
                                        placeholder="Ali"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                                    />
                                </div>
                            </div>

                            {/* Email */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Email Address</label>
                                <input
                                    type="email"
                                    value={form.email}
                                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                                    placeholder="ahmed@clinic.com"
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                                />
                            </div>

                            {/* Role */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Role</label>
                                {rolesLoading ? (
                                    <div className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-400 bg-slate-50 flex items-center gap-2">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading roles…
                                    </div>
                                ) : (
                                    <select
                                        value={form.roleId}
                                        onChange={e => setForm(p => ({ ...p, roleId: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                                    >
                                        {roles.length === 0 && <option value="">No roles available</option>}
                                        {roles.map(r => (
                                            <option key={r._id} value={r._id}>{formatRoleName(r.name)}</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {/* Onboarding method */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Onboarding Method</label>
                                <div className="space-y-2">
                                    {ONBOARDING_METHODS.map(m => (
                                        <button
                                            key={m.value}
                                            type="button"
                                            onClick={() => setForm(p => ({ ...p, onboardingMethod: m.value }))}
                                            className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${form.onboardingMethod === m.value
                                                ? 'border-indigo-400 bg-indigo-50'
                                                : 'border-slate-200 hover:border-slate-300 bg-white'
                                                }`}
                                        >
                                            <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${form.onboardingMethod === m.value ? 'border-indigo-500' : 'border-slate-300'}`}>
                                                {form.onboardingMethod === m.value && (
                                                    <div className="w-2 h-2 rounded-full bg-indigo-500" />
                                                )}
                                            </div>
                                            <div>
                                                <p className={`text-xs font-semibold ${form.onboardingMethod === m.value ? 'text-indigo-700' : 'text-slate-700'}`}>{m.label}</p>
                                                <p className="text-[11px] text-slate-400 mt-0.5">{m.sub}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-1">
                                <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors">
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={saving}
                                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (form.onboardingMethod === 'invite' ? 'Send Invite' : 'Create User')}
                                </button>
                            </div>
                        </>
                    ) : result.inviteSent ? (
                        /* ── Invite success ── */
                        <div className="text-center py-4">
                            <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3 border border-emerald-200">
                                <Mail className="w-6 h-6 text-emerald-600" />
                            </div>
                            <h4 className="text-base font-bold text-slate-900">Invitation Sent</h4>
                            <p className="text-sm text-slate-500 mt-1">
                                An invite email has been sent to <strong>{form.email}</strong>.<br />
                                The user will receive a secure registration link.
                            </p>
                            <button onClick={handleDone} className="mt-5 w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors">
                                Done
                            </button>
                        </div>
                    ) : (
                        /* ── Temp password success ── */
                        <div className="py-2">
                            <div className="flex items-center gap-2 mb-3">
                                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                                <h4 className="text-sm font-bold text-slate-900">User Created</h4>
                            </div>
                            <p className="text-xs text-slate-500 mb-3">
                                Share this temporary password with <strong>{`${form.firstName} ${form.lastName}`.trim()}</strong>. They will be prompted to change it on first login.
                            </p>
                            <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                <code className="flex-1 font-mono text-sm font-bold text-slate-800 select-all">
                                    {result.temporaryPassword}
                                </code>
                                <button
                                    onClick={handleCopy}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${copied ? 'bg-emerald-100 text-emerald-700' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                >
                                    {copied ? <><CheckCircle2 className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                                </button>
                            </div>
                            <button onClick={handleDone} className="mt-4 w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors">
                                Done
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─── Status badge helper ──────────────────────────────────────────────────────

function UserStatusBadge({ user }) {
    if (user.invitePending) {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200">
                <Clock className="w-2.5 h-2.5" /> Invite Sent
            </span>
        );
    }
    if (!user.isActive) {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-red-50 text-red-700 border border-red-200">
                Suspended
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active
        </span>
    );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function OrgUsersPanel({ users = [], loading, orgId, onRefresh }) {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [showAddModal, setShowAddModal] = useState(false);

    const activeCount = users.filter(u => u.isActive && !u.invitePending).length;
    const pendingCount = users.filter(u => u.invitePending).length;

    const uniqueRoles = [...new Set(users.map(u => u.roleId?.name || u.role?.name).filter(Boolean))];

    const filtered = users.filter(u => {
        const roleName = (u.roleId?.name || u.role?.name || '').toLowerCase();
        const matchesRole = roleFilter === 'all' || roleName === roleFilter.toLowerCase();
        const matchesStatus =
            statusFilter === 'all' ||
            (statusFilter === 'active' && u.isActive && !u.invitePending) ||
            (statusFilter === 'pending' && u.invitePending) ||
            (statusFilter === 'suspended' && !u.isActive && !u.invitePending);
        const term = search.toLowerCase();
        const matchesSearch = !term ||
            (u.name || '').toLowerCase().includes(term) ||
            (u.email || '').toLowerCase().includes(term) ||
            roleName.includes(term);
        return matchesRole && matchesStatus && matchesSearch;
    });

    if (loading) {
        return (
            <Card padding="none">
                <div className="p-6 space-y-3 animate-pulse">
                    {[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl" />)}
                </div>
            </Card>
        );
    }

    return (
        <>
            <Card padding="none">
                {/* ── Header ── */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 rounded-xl border border-indigo-100">
                            <Users className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-slate-900">Organization Users</h2>
                            <p className="text-xs text-slate-400 mt-0.5">
                                <span className="font-semibold text-emerald-600">{activeCount} active</span>
                                {pendingCount > 0 && <span className="ml-2 font-semibold text-amber-600">{pendingCount} pending</span>}
                                <span className="ml-2 text-slate-400">· {users.length} total</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search users…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 transition-colors w-44"
                            />
                        </div>

                        {/* Role filter */}
                        <div className="relative">
                            <select
                                value={roleFilter}
                                onChange={e => setRoleFilter(e.target.value)}
                                className="appearance-none pl-3 pr-7 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400/30 cursor-pointer"
                            >
                                <option value="all">All Roles</option>
                                {uniqueRoles.map(r => <option key={r} value={r}>{r}</option>)}
                                {['ORG_ADMIN', 'DOCTOR', 'ASSISTANT', 'RECEPTIONIST', 'ACCOUNTANT']
                                    .filter(r => !uniqueRoles.includes(r))
                                    .map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                        </div>

                        {/* Status filter */}
                        <div className="relative">
                            <select
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value)}
                                className="appearance-none pl-3 pr-7 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400/30 cursor-pointer"
                            >
                                <option value="all">All Status</option>
                                <option value="active">Active</option>
                                <option value="pending">Invite Sent</option>
                                <option value="suspended">Suspended</option>
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                        </div>

                        {/* Add User */}
                        {orgId && (
                            <button
                                onClick={() => setShowAddModal(true)}
                                className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Add User
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Table ── */}
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 mb-4">
                            <Users className="w-8 h-8 text-slate-300" />
                        </div>
                        <p className="text-sm font-medium text-slate-500">
                            {users.length === 0 ? 'No users found for this organization.' : 'No users match your filter.'}
                        </p>
                        {users.length === 0 && orgId && (
                            <button
                                onClick={() => setShowAddModal(true)}
                                className="mt-3 flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-500 transition-colors"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add First User
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/80 border-b border-slate-100">
                                    <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">User</th>
                                    <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Role</th>
                                    <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                                    <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Last Login</th>
                                    <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Created</th>
                                    {orgId && <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest" />}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filtered.map(user => (
                                    <tr
                                        key={user._id}
                                        onClick={orgId ? () => navigate(`/platform/organizations/${orgId}/users/${user._id}`) : undefined}
                                        className={`transition-colors group ${orgId ? 'hover:bg-indigo-50/40 cursor-pointer' : 'hover:bg-slate-50/60'}`}
                                    >
                                        {/* User */}
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${user.isActive ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
                                                    {getInitials(user.name || user.email)}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-slate-900 truncate">{user.name || '—'}</p>
                                                    <p className="text-xs text-slate-400 truncate font-mono">{user.email}</p>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Role */}
                                        <td className="px-5 py-3.5">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-600 border border-slate-200">
                                                {user.roleId?.name || user.role?.name || 'No Role'}
                                            </span>
                                        </td>

                                        {/* Status */}
                                        <td className="px-5 py-3.5">
                                            <UserStatusBadge user={user} />
                                        </td>

                                        {/* Last Login */}
                                        <td className="px-5 py-3.5 text-xs text-slate-400 tabular-nums">
                                            {relativeTime(user.lastLoginAt || user.updatedAt)}
                                        </td>

                                        {/* Created */}
                                        <td className="px-5 py-3.5 text-xs text-slate-400 tabular-nums">
                                            {fmtDate(user.createdAt)}
                                        </td>

                                        {/* Chevron — only when row is clickable */}
                                        {orgId && (
                                            <td className="px-5 py-3.5 text-right">
                                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors ml-auto" />
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Add User modal */}
            {showAddModal && orgId && (
                <AddUserModal
                    orgId={orgId}
                    onClose={() => setShowAddModal(false)}
                    onSuccess={() => { onRefresh?.(); }}
                />
            )}
        </>
    );
}
