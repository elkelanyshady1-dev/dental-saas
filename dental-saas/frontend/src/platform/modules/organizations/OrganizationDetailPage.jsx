/**
 * OrganizationDetailPage.jsx
 * Platform — Organization Control Surface
 * Route: /platform/organizations/:id
 * Capability: VIEW_ORGANIZATIONS
 *
 * Tabs:
 *   Overview       — Identity + commercial state + health
 *   Users          — Org users with search/filter (OrgUsersPanel)
 *   Branches       — Branch list with status
 *   Analytics      — Clinical & usage metrics
 *   Audit          — Recent audit log tail
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    Building2, ArrowLeft, Users, GitBranch,
    BarChart2, FileText, ShieldCheck, CreditCard,
    CheckCircle2, XCircle, AlertTriangle, Clock,
    DollarSign, RefreshCw, Archive, History,
    Loader2, MapPin, Hash, Calendar, Zap,
    Phone, MessageCircle, Pencil, X, Plus,
    Tag, CheckSquare, StickyNote, Trash2
} from 'lucide-react';
import platformApi from '../../auth/platformApi';
import RequireCapability from '../../core/guards/RequireCapability';
import PageContainer from '../../core/ui/PageContainer';
import Card, { CardHeader } from '../../core/ui/Card';
import { OrgStatusBadge } from '../../core/ui/StatusBadge';
import { LoadingState, ErrorState } from '../../core/ui/Feedback';
import OrgUsersPanel from './components/OrgUsersPanel';
import OrganizationSubscriptionsTab from './components/OrganizationSubscriptionsTab';
// Sprint 8 new tabs
import OrgFinancialControl from '../orgDetails/OrgFinancialControl';
import EntitlementsPanel from '../orgDetails/components/EntitlementsPanel';
import BillingTimelinePanel from '../billing/components/BillingTimelinePanel';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (iso) =>
    iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const cur = (val, currency = 'USD') =>
    val != null
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val / 100)
        : '—';

// ─── Tab Bar ──────────────────────────────────────────────────────────────────

const TABS = [
    { key: 'overview', label: 'Overview', icon: Building2 },
    { key: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
    { key: 'billing', label: 'Billing', icon: DollarSign },
    { key: 'timeline', label: 'Timeline', icon: History },
    { key: 'entitlements', label: 'Entitlements', icon: Zap },
    { key: 'crm', label: 'CRM', icon: StickyNote },
    { key: 'users', label: 'Users', icon: Users },
    { key: 'branches', label: 'Branches', icon: GitBranch },
    { key: 'analytics', label: 'Analytics', icon: BarChart2 },
    { key: 'audit', label: 'Audit Trail', icon: FileText },
];

function TabBar({ active, onChange, counts = {} }) {
    return (
        <div className="flex items-center gap-1 p-1 bg-surface-soft rounded-xl border border-brand-border">
            {TABS.map(tab => {
                const isActive = active === tab.key;
                const count = counts[tab.key];
                return (
                    <button
                        key={tab.key}
                        onClick={() => onChange(tab.key)}
                        className={`
                            flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap
                            ${isActive
                                ? 'bg-brand-primary text-white shadow-sm'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-white'}
                        `}
                    >
                        <tab.icon className="w-3.5 h-3.5" />
                        {tab.label}
                        {count != null && (
                            <span className={`
                                px-1.5 py-0.5 rounded-full text-[10px] font-black
                                ${isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}
                            `}>
                                {count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

// ─── Info Row ─────────────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value, mono }) {
    return (
        <div className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">
            <div className="p-1.5 bg-slate-50 rounded-lg border border-brand-border shrink-0 mt-0.5">
                <Icon className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
                <p className={`text-sm font-semibold text-slate-900 truncate ${mono ? 'font-mono' : ''}`}>
                    {value || '—'}
                </p>
            </div>
        </div>
    );
}

// ─── KPI Cell ────────────────────────────────────────────────────────────────

function KpiCell({ icon: Icon, label, value, sub, accent = 'blue' }) {
    const accentMap = {
        blue: 'bg-blue-50 border-blue-100 text-blue-600',
        emerald: 'bg-emerald-50 border-emerald-100 text-emerald-600',
        amber: 'bg-amber-50 border-amber-100 text-amber-600',
        red: 'bg-red-50 border-red-100 text-red-600',
        indigo: 'bg-indigo-50 border-indigo-100 text-indigo-600',
    };
    return (
        <div className="flex items-start gap-3 p-4 bg-bg-card rounded-xl border border-brand-border">
            <div className={`p-2 rounded-lg border shrink-0 ${accentMap[accent] || accentMap.blue}`}>
                <Icon className="w-4 h-4" />
            </div>
            <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                <p className="text-xl font-black text-slate-900 mt-0.5">{value ?? '—'}</p>
                {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ org }) {
    const sub = org.subscription || {};
    const com = org.commercial || {};
    // Sprint 8: prefer contract.trialEndDate; fall back to legacy sub.trialEndsAt
    const trialEndDate = org.contract?.trialEndDate || sub.trialEndsAt;

    // ── Correct auto-renew derivation ──────────────────────────────────────────────
    // com.autoRenew and sub.autoRenew both default to true on ALL contracts,
    // including trial-only provisioning with no scheduled follow-on plan.
    // The correct semantic: auto-renew = true ONLY if a pending_activation contract exists.
    // The backend now sends org.pendingContract for this purpose.
    const pendingContract = org.pendingContract || null;
    const autoRenew = Boolean(pendingContract);

    const healthCfg = {
        active: { label: 'Active', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        trial: { label: 'Trial', icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
        suspended: { label: 'Suspended', icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
        cancelled: { label: 'Cancelled', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
        expired: { label: 'Expired', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
    };
    const health = healthCfg[sub.status?.toLowerCase()] || healthCfg.suspended;
    const HealthIcon = health.icon;

    return (
        <div className="space-y-6">
            {/* KPI Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCell icon={Users} label="Total Users" value={org.userCount} sub={`${org.activeUsers || 0} active`} accent="blue" />
                <KpiCell icon={GitBranch} label="Branches" value={org.branchCount} sub="registered branches" accent="indigo" />
                <KpiCell icon={FileText} label="Audit Events" value={org.auditCount} sub="log entries" accent="amber" />
                <KpiCell icon={ShieldCheck} label="Health" value={health.label} sub={`v${org.version || 0}`} accent={sub.status === 'active' ? 'emerald' : 'red'} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Identity */}
                <Card>
                    <CardHeader title="Organization Identity" icon={Building2} />
                    <div className="mt-2">
                        <InfoRow icon={Hash} label="ID" value={String(org.id || org._id)} mono />
                        <InfoRow icon={Building2} label="Name" value={org.name} />
                        <InfoRow icon={MapPin} label="Country" value={org.country || org.regionCode} />
                        <InfoRow icon={Calendar} label="Provisioned" value={fmt(org.createdAt)} />
                        <InfoRow icon={Hash} label="OAV Version" value={String(org.version ?? 0)} mono />
                    </div>
                </Card>

                {/* Commercial State */}
                <Card>
                    <CardHeader title="Commercial State" icon={DollarSign} />
                    <div className="mt-2">
                        <InfoRow icon={CreditCard} label="Plan Code" value={com.planCode || '—'} />
                        <InfoRow icon={CreditCard} label="Plan Version" value={com.planVersionTag || '—'} />
                        <InfoRow icon={DollarSign} label="Locked Price" value={com.lockedPrice != null ? cur(com.lockedPrice, com.currency) : '—'} />
                        {/* Auto-renew derived from pendingContract existence, not com.autoRenew */}
                        <InfoRow icon={RefreshCw} label="Auto-Renew" value={autoRenew ? 'Enabled' : 'Off'} />
                        <InfoRow icon={Hash} label="Data Source" value={com._source || '—'} mono />
                    </div>
                    {(org.isArchived) && (
                        <div className="mt-4 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                            <Archive className="w-4 h-4 text-amber-500 shrink-0" />
                            <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Archived Organization</p>
                        </div>
                    )}
                </Card>
            </div>

            {/* Subscription health */}
            <Card>
                <CardHeader title="Subscription Status" icon={ShieldCheck} />
                <div className="mt-4 flex items-center gap-4 flex-wrap">
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${health.bg}`}>
                        <HealthIcon className={`w-4 h-4 ${health.color}`} />
                        <span className={`text-sm font-bold ${health.color}`}>{health.label}</span>
                    </div>
                    <OrgStatusBadge status={sub.status} />
                    {trialEndDate && (
                        <span className="text-xs text-slate-500">
                            Trial ends: <strong>{fmt(trialEndDate)}</strong>
                        </span>
                    )}
                    {/* Auto-renew: derived from pendingContract, not sub.autoRenew */}
                    <span className="text-xs text-slate-500">
                        Auto-renew:{' '}
                        <strong className={autoRenew ? 'text-emerald-600' : 'text-slate-500'}>
                            {autoRenew ? 'Yes' : 'No'}
                        </strong>
                    </span>
                    {/* Lifecycle next-step message for trial orgs */}
                    {trialEndDate && (
                        pendingContract ? (
                            <span className="text-xs text-blue-600">
                                Next plan: <strong>{pendingContract.planCode}</strong>
                            </span>
                        ) : (
                            <span className="text-xs text-amber-600 font-medium">
                                ⚠ Will suspend after trial
                            </span>
                        )
                    )}
                </div>
            </Card>

        </div>
    );
}

// ─── Contact Card ───────────────────────────────────────────────────────────────────

// Contact role options — matches backend enum
const CONTACT_ROLES = [
    { value: 'owner', label: 'Owner' },
    { value: 'it', label: 'IT Contact' },
    { value: 'finance', label: 'Finance' },
    { value: 'operations', label: 'Operations' },
    { value: 'sales', label: 'Sales' },
    { value: 'other', label: 'Other' },
];

function getRoleLabel(role) {
    return CONTACT_ROLES.find(r => r.value === role)?.label || 'Contact';
}

const ROLE_COLORS = {
    owner: 'bg-indigo-50 text-indigo-600 border-indigo-200',
    it: 'bg-cyan-50 text-cyan-600 border-cyan-200',
    finance: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    operations: 'bg-amber-50 text-amber-600 border-amber-200',
    sales: 'bg-purple-50 text-purple-600 border-purple-200',
    other: 'bg-slate-100 text-slate-500 border-slate-200',
};

function ContactCard({ org, orgId }) {
    const [contacts, setContacts] = useState(org.contacts || []);
    // editingContact = null → adding new; object with _id → editing existing
    const [editingContact, setEditingContact] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm] = useState({ role: 'owner', ownerName: '', phone: '' });
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [err, setErr] = useState(null);

    const openAdd = () => {
        setEditingContact(null);
        setForm({ role: 'owner', ownerName: '', phone: '' });
        setErr(null);
        setModalOpen(true);
    };

    const openEdit = (c) => {
        setEditingContact(c);
        setForm({ role: c.role || 'owner', ownerName: c.ownerName || '', phone: c.phone || '' });
        setErr(null);
        setModalOpen(true);
    };

    const handleSave = async () => {
        setSaving(true);
        setErr(null);
        try {
            if (editingContact) {
                // Update existing
                const res = await platformApi.patch(
                    `/organizations/${orgId}/contacts/${editingContact._id}`,
                    { role: form.role, ownerName: form.ownerName.trim() || null, phone: form.phone.trim() || null }
                );
                setContacts(res.data.contacts);
            } else {
                // Add new
                const res = await platformApi.post(
                    `/organizations/${orgId}/contacts`,
                    { role: form.role, ownerName: form.ownerName.trim() || null, phone: form.phone.trim() || null }
                );
                setContacts(res.data.contacts);
            }
            setModalOpen(false);
        } catch (e) {
            setErr(e.response?.data?.message || 'Failed to save contact.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (contactId) => {
        setDeletingId(contactId);
        try {
            const res = await platformApi.delete(`/organizations/${orgId}/contacts/${contactId}`);
            setContacts(res.data.contacts);
        } catch {
            // silent — contact still shown until page refresh
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <>
            <Card>
                <div className="flex items-center justify-between">
                    <CardHeader title="Contacts" icon={Phone} />
                    <button
                        onClick={openAdd}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand-primary text-white rounded-lg hover:opacity-90 transition-opacity"
                    >
                        <Plus className="w-3.5 h-3.5" /> Add Contact
                    </button>
                </div>

                {contacts.length === 0 ? (
                    <p className="mt-4 text-xs text-slate-400">No contacts added yet.</p>
                ) : (
                    <div className="mt-3 space-y-3">
                        {contacts.map(c => {
                            const waNum = c.phone ? c.phone.replace(/\D/g, '') : null;
                            const roleLabel = getRoleLabel(c.role);
                            const roleColor = ROLE_COLORS[c.role] || ROLE_COLORS.other;
                            return (
                                <div key={c._id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-brand-border group">
                                    {/* Role badge */}
                                    <div className="shrink-0 pt-0.5">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${roleColor}`}>
                                            {roleLabel}
                                        </span>
                                    </div>

                                    {/* Details */}
                                    <div className="flex-1 min-w-0">
                                        {c.ownerName && (
                                            <p className="text-sm font-semibold text-slate-800 truncate">{c.ownerName}</p>
                                        )}
                                        {c.phone && (
                                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                <span className="text-xs text-slate-500">{c.phone}</span>
                                                <a href={`tel:${c.phone}`}
                                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 border border-blue-200 text-blue-600 rounded text-[10px] font-semibold hover:bg-blue-100 transition-colors"
                                                    title="Call">
                                                    <Phone className="w-2.5 h-2.5" /> Call
                                                </a>
                                                {waNum && (
                                                    <a href={`https://wa.me/${waNum}`} target="_blank" rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded text-[10px] font-semibold hover:bg-emerald-100 transition-colors"
                                                        title="WhatsApp">
                                                        <MessageCircle className="w-2.5 h-2.5" /> WhatsApp
                                                    </a>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Actions — shown on hover */}
                                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => openEdit(c)}
                                            className="p-1.5 text-slate-400 hover:text-brand-primary hover:bg-white rounded-lg transition-colors"
                                            title="Edit"
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(c._id)}
                                            disabled={deletingId === c._id}
                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-white rounded-lg transition-colors disabled:opacity-40"
                                            title="Delete"
                                        >
                                            {deletingId === c._id
                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                : <Trash2 className="w-3.5 h-3.5" />
                                            }
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>

            {/* Add / Edit Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-brand-border">
                        <div className="flex items-center justify-between p-5 border-b border-brand-border">
                            <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4 text-brand-primary" />
                                <h3 className="text-sm font-bold text-slate-900">
                                    {editingContact ? 'Edit Contact' : 'Add Contact'}
                                </h3>
                            </div>
                            <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

                            {/* Role */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Contact Role</label>
                                <select
                                    value={form.role}
                                    onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                                    className="w-full border border-brand-border rounded-xl px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                                >
                                    {CONTACT_ROLES.map(r => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Name */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                    {getRoleLabel(form.role)} Name
                                </label>
                                <input
                                    value={form.ownerName}
                                    onChange={e => setForm(p => ({ ...p, ownerName: e.target.value }))}
                                    placeholder="Dr. Ahmed Hassan"
                                    className="w-full border border-brand-border rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                                />
                            </div>

                            {/* Phone */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Phone Number</label>
                                <input
                                    value={form.phone}
                                    onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                                    placeholder="+20 100 123 4567"
                                    className="w-full border border-brand-border rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                                />
                                <p className="text-[11px] text-slate-400 mt-1">International format. Spaces stripped for WhatsApp links.</p>
                            </div>
                        </div>
                        <div className="flex gap-3 px-5 pb-5">
                            <button onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 border border-brand-border text-sm text-slate-600 rounded-xl hover:bg-slate-50 transition-colors">Cancel</button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex-1 px-4 py-2 bg-brand-primary text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// ─── CRM Tab ────────────────────────────────────────────────────────────────────────

const TAG_PRESETS = ['VIP', 'Needs Support', 'High Value', 'At Risk', 'Enterprise', 'Demo Requested'];

function CrmTab({ orgId, org }) {
    const [data, setData] = useState({ notes: [], tags: [], tasks: [] });
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);

    // Note modal
    const [noteText, setNoteText] = useState('');
    const [addingNote, setAddingNote] = useState(false);
    const [savingNote, setSavingNote] = useState(false);

    // Tag input
    const [tagInput, setTagInput] = useState('');
    const tagInputRef = useRef(null);

    // Task modal
    const [addingTask, setAddingTask] = useState(false);
    const [taskForm, setTaskForm] = useState({ title: '', dueDate: '' });
    const [savingTask, setSavingTask] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await platformApi.get(`/organizations/${orgId}/crm`);
            setData(r.data);
        } catch (e) {
            setErr(e.response?.data?.message || 'Failed to load CRM data.');
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => { load(); }, [load]);

    // ── Notes ──
    const handleAddNote = async () => {
        if (!noteText.trim()) return;
        setSavingNote(true);
        try {
            const r = await platformApi.post(`/organizations/${orgId}/crm/notes`, { text: noteText });
            setData(prev => ({ ...prev, notes: r.data.notes }));
            setNoteText(''); setAddingNote(false);
        } finally { setSavingNote(false); }
    };

    const handleDeleteNote = async (noteId) => {
        try {
            const r = await platformApi.delete(`/organizations/${orgId}/crm/notes/${noteId}`);
            setData(prev => ({ ...prev, notes: r.data.notes }));
        } catch { }
    };

    // ── Tags ──
    const handleAddTag = async (tag) => {
        const t = (tag || tagInput).trim();
        if (!t) return;
        try {
            const r = await platformApi.post(`/organizations/${orgId}/crm/tags`, { tag: t });
            setData(prev => ({ ...prev, tags: r.data.tags }));
            setTagInput('');
        } catch { }
    };

    const handleRemoveTag = async (tag) => {
        try {
            const r = await platformApi.delete(`/organizations/${orgId}/crm/tags/${encodeURIComponent(tag)}`);
            setData(prev => ({ ...prev, tags: r.data.tags }));
        } catch { }
    };

    // ── Tasks ──
    const handleAddTask = async () => {
        if (!taskForm.title.trim()) return;
        setSavingTask(true);
        try {
            const r = await platformApi.post(`/organizations/${orgId}/crm/tasks`, {
                title: taskForm.title,
                dueDate: taskForm.dueDate || undefined,
            });
            setData(prev => ({ ...prev, tasks: r.data.tasks }));
            setTaskForm({ title: '', dueDate: '' });
            setAddingTask(false);
        } finally { setSavingTask(false); }
    };

    const handleToggleTask = async (task) => {
        try {
            const r = await platformApi.patch(`/organizations/${orgId}/crm/tasks/${task._id}`, {
                status: task.status === 'done' ? 'open' : 'done',
            });
            setData(prev => ({ ...prev, tasks: r.data.tasks }));
        } catch { }
    };

    if (loading) return <LoadingState message="Loading CRM data…" />;
    if (err) return <ErrorState message={err} />;

    const openTasks = data.tasks.filter(t => t.status === 'open');
    const doneTasks = data.tasks.filter(t => t.status === 'done');

    return (
        <div className="space-y-6">

            {/* ─── CONTACTS ─────────────────────────── */}
            <ContactCard org={org} orgId={orgId} />

            <Card>
                <CardHeader title="Tags" icon={Tag} />
                <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                        {data.tags.map(tag => (
                            <span key={tag} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                                {tag}
                                <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
                            </span>
                        ))}
                        {data.tags.length === 0 && <p className="text-xs text-slate-400">No tags yet.</p>}
                    </div>

                    {/* Quick presets */}
                    <div className="flex flex-wrap gap-1.5">
                        {TAG_PRESETS.filter(p => !data.tags.includes(p)).map(preset => (
                            <button
                                key={preset}
                                onClick={() => handleAddTag(preset)}
                                className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-slate-200 text-slate-500 hover:border-brand-primary hover:text-brand-primary transition-colors"
                            >
                                + {preset}
                            </button>
                        ))}
                    </div>

                    {/* Custom tag input */}
                    <div className="flex gap-2">
                        <input
                            ref={tagInputRef}
                            value={tagInput}
                            onChange={e => setTagInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                            placeholder="Custom tag…"
                            className="flex-1 border border-brand-border rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                        />
                        <button
                            onClick={() => handleAddTag()}
                            disabled={!tagInput.trim()}
                            className="px-3 py-2 bg-brand-primary text-white text-xs font-bold rounded-xl disabled:opacity-40 hover:opacity-90 transition-opacity"
                        >
                            Add
                        </button>
                    </div>
                </div>
            </Card>

            {/* ─── NOTES ─────────────────────────── */}
            <Card>
                <div className="flex items-center justify-between">
                    <CardHeader title="Notes" icon={StickyNote} />
                    <button
                        onClick={() => { setNoteText(''); setAddingNote(true); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand-primary text-white rounded-lg hover:opacity-90 transition-opacity"
                    >
                        <Plus className="w-3.5 h-3.5" /> Add Note
                    </button>
                </div>

                <div className="mt-4 space-y-3">
                    {data.notes.length === 0 && !addingNote && (
                        <p className="text-xs text-slate-400">No notes yet. Add the first internal note.</p>
                    )}

                    {data.notes.map(note => (
                        <div key={note._id} className="flex gap-3 p-4 bg-slate-50 rounded-xl border border-brand-border group">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.text}</p>
                                <p className="text-[10px] text-slate-400 mt-1">
                                    {note.createdBy} &middot; {fmt(note.createdAt)}
                                </p>
                            </div>
                            <button
                                onClick={() => handleDeleteNote(note._id)}
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all shrink-0"
                                title="Delete note"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}

                    {addingNote && (
                        <div className="border border-brand-primary/30 rounded-xl p-4 bg-blue-50/30 space-y-3">
                            <textarea
                                autoFocus
                                rows={3}
                                value={noteText}
                                onChange={e => setNoteText(e.target.value)}
                                placeholder="Type your note here…"
                                className="w-full text-sm text-slate-800 bg-white border border-brand-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/40 resize-none"
                            />
                            <div className="flex gap-2 justify-end">
                                <button onClick={() => setAddingNote(false)} className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                                <button
                                    onClick={handleAddNote}
                                    disabled={savingNote || !noteText.trim()}
                                    className="px-4 py-1.5 text-xs font-bold bg-brand-primary text-white rounded-lg disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center gap-1.5"
                                >
                                    {savingNote && <Loader2 className="w-3 h-3 animate-spin" />} Save
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </Card>

            {/* ─── TASKS ─────────────────────────── */}
            <Card>
                <div className="flex items-center justify-between">
                    <CardHeader title="Follow-up Tasks" icon={CheckSquare} />
                    <button
                        onClick={() => { setTaskForm({ title: '', dueDate: '' }); setAddingTask(true); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand-primary text-white rounded-lg hover:opacity-90 transition-opacity"
                    >
                        <Plus className="w-3.5 h-3.5" /> Add Task
                    </button>
                </div>

                <div className="mt-4 space-y-2">
                    {data.tasks.length === 0 && !addingTask && (
                        <p className="text-xs text-slate-400">No tasks yet.</p>
                    )}

                    {/* Open tasks */}
                    {openTasks.map(task => (
                        <div key={task._id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-brand-border hover:border-brand-primary/30 transition-colors">
                            <button
                                onClick={() => handleToggleTask(task)}
                                className="w-5 h-5 rounded border-2 border-slate-300 hover:border-brand-primary transition-colors flex items-center justify-center shrink-0"
                                title="Mark done"
                            />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800">{task.title}</p>
                                {task.dueDate && (
                                    <p className="text-[11px] text-slate-400">Due: {fmt(task.dueDate)}</p>
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Add task form */}
                    {addingTask && (
                        <div className="border border-brand-primary/30 rounded-xl p-4 bg-blue-50/30 space-y-3">
                            <input
                                autoFocus
                                value={taskForm.title}
                                onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))}
                                placeholder="Task title…"
                                className="w-full text-sm text-slate-800 bg-white border border-brand-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                            />
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Due Date (optional)</label>
                                <input
                                    type="date"
                                    value={taskForm.dueDate}
                                    onChange={e => setTaskForm(p => ({ ...p, dueDate: e.target.value }))}
                                    className="mt-1 w-full text-sm text-slate-800 bg-white border border-brand-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                                />
                            </div>
                            <div className="flex gap-2 justify-end">
                                <button onClick={() => setAddingTask(false)} className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                                <button
                                    onClick={handleAddTask}
                                    disabled={savingTask || !taskForm.title.trim()}
                                    className="px-4 py-1.5 text-xs font-bold bg-brand-primary text-white rounded-lg disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center gap-1.5"
                                >
                                    {savingTask && <Loader2 className="w-3 h-3 animate-spin" />} Save Task
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Done tasks (collapsed) */}
                    {doneTasks.length > 0 && (
                        <details className="mt-2">
                            <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 select-none">
                                {doneTasks.length} completed task{doneTasks.length > 1 ? 's' : ''}
                            </summary>
                            <div className="mt-2 space-y-2">
                                {doneTasks.map(task => (
                                    <div key={task._id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 opacity-60">
                                        <button
                                            onClick={() => handleToggleTask(task)}
                                            className="w-5 h-5 rounded bg-emerald-100 border-2 border-emerald-400 flex items-center justify-center shrink-0"
                                            title="Mark open"
                                        >
                                            <CheckSquare className="w-3 h-3 text-emerald-600" />
                                        </button>
                                        <p className="text-sm text-slate-500 line-through">{task.title}</p>
                                    </div>
                                ))}
                            </div>
                        </details>
                    )}
                </div>
            </Card>
        </div>
    );
}

// ─── Branches Tab ─────────────────────────────────────────────────────────────

function BranchesTab({ orgId }) {
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        platformApi.get(`/organizations/${orgId}/branches`)
            .then(r => setBranches(Array.isArray(r.data) ? r.data : []))
            .catch(e => setError(e.response?.data?.message || 'Failed to load branches'))
            .finally(() => setLoading(false));
    }, [orgId]);

    if (loading) return <LoadingState message="Loading branches…" />;
    if (error) return <ErrorState message={error} />;

    return (
        <Card padding="none">
            <div className="p-6 border-b border-brand-border flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-xl border border-indigo-100"><GitBranch className="w-4 h-4 text-indigo-600" /></div>
                <div>
                    <h2 className="text-sm font-bold text-slate-900">Branches</h2>
                    <p className="text-xs text-slate-400">{branches.length} registered branch{branches.length !== 1 ? 'es' : ''}</p>
                </div>
            </div>
            {branches.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-sm">No branches found.</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-surface-soft">
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-brand-border">Branch</th>
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-brand-border">Type</th>
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-brand-border">Status</th>
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-brand-border">Created</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {branches.map(b => (
                                <tr key={b._id} className="hover:bg-slate-50/60 transition-colors">
                                    <td className="px-6 py-4">
                                        <p className="text-sm font-semibold text-slate-900">{b.name}</p>
                                        <p className="text-[10px] text-slate-400 font-mono">{b._id}</p>
                                    </td>
                                    <td className="px-6 py-4 text-xs text-slate-500 capitalize">{b.type || 'internal'}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${b.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${b.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                            {b.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-xs text-slate-400">{fmt(b.createdAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────

function AnalyticsTab({ orgId }) {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        platformApi.get(`/organizations/${orgId}/analytics`)
            .then(r => setAnalytics(r.data))
            .catch(e => setError(e.response?.data?.message || 'Failed to load analytics'))
            .finally(() => setLoading(false));
    }, [orgId]);

    if (loading) return <LoadingState message="Loading analytics…" />;
    if (error) return <ErrorState message={error} />;
    if (!analytics) return null;

    const items = [
        { icon: GitBranch, label: 'Total Branches', value: analytics.totalBranches, accent: 'indigo' },
        { icon: Users, label: 'Total Users', value: analytics.totalUsers, accent: 'blue' },
        { icon: Users, label: 'Active Users', value: analytics.activeUsers, accent: 'emerald' },
        { icon: Users, label: 'Suspended Users', value: analytics.suspendedUsers, accent: 'red' },
        { icon: BarChart2, label: 'Total Patients', value: analytics.totalPatients, accent: 'blue' },
        { icon: BarChart2, label: 'Patients This Month', value: analytics.patientsThisMonth, accent: 'indigo' },
        { icon: Calendar, label: 'Total Appointments', value: analytics.totalAppointments, accent: 'amber' },
        { icon: Calendar, label: 'Appts This Month', value: analytics.appointmentsThisMonth, accent: 'emerald' },
    ];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {items.map(item => (
                    <KpiCell key={item.label} {...item} />
                ))}
            </div>

            {analytics.appointmentsByBranch?.length > 0 && (
                <Card>
                    <CardHeader title="Appointments by Branch (This Month)" icon={BarChart2} />
                    <div className="mt-4 space-y-3">
                        {analytics.appointmentsByBranch.map(b => {
                            const max = Math.max(...analytics.appointmentsByBranch.map(x => x.count), 1);
                            const pct = Math.round((b.count / max) * 100);
                            return (
                                <div key={b.branchId}>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm text-slate-700 font-medium">{b.branchName}</span>
                                        <span className="text-xs font-bold text-slate-500">{b.count}</span>
                                    </div>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-brand-primary rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}
        </div>
    );
}

// ─── Audit Tab ────────────────────────────────────────────────────────────────

function AuditTab({ orgId }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        platformApi.get(`/organizations/${orgId}/audit-logs?limit=50`)
            .then(r => setData(r.data))
            .catch(e => setError(e.response?.data?.message || 'Failed to load audit logs'))
            .finally(() => setLoading(false));
    }, [orgId]);

    if (loading) return <LoadingState message="Loading audit trail…" />;
    if (error) return <ErrorState message={error} />;

    const logs = data?.logs || [];

    return (
        <Card padding="none">
            <div className="p-6 border-b border-brand-border flex items-center gap-3">
                <div className="p-2 bg-amber-50 rounded-xl border border-amber-100"><FileText className="w-4 h-4 text-amber-600" /></div>
                <div>
                    <h2 className="text-sm font-bold text-slate-900">Recent Audit Trail</h2>
                    <p className="text-xs text-slate-400">{data?.total ?? 0} total events · showing latest 50</p>
                </div>
            </div>
            {logs.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-sm">No audit logs found for this organization.</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-surface-soft">
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-brand-border">Action</th>
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-brand-border">Actor</th>
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-brand-border">Result</th>
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-brand-border">Time</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {logs.map(log => (
                                <tr key={log._id} className="hover:bg-slate-50/60 transition-colors">
                                    <td className="px-6 py-3">
                                        <code className="text-[11px] font-mono font-bold text-slate-700 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200">
                                            {log.action}
                                        </code>
                                    </td>
                                    <td className="px-6 py-3 text-xs text-slate-500">
                                        {log.userId?.name || log.userId?.email || log.actorId || '—'}
                                    </td>
                                    <td className="px-6 py-3">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${log.success !== false ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-red-50 text-red-500 border border-red-200'}`}>
                                            {log.success !== false ? 'OK' : 'FAIL'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-[11px] text-slate-400 font-mono tabular-nums">
                                        {log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function OrganizationDetailPageContent() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [org, setOrg] = useState(null);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [usersLoading, setUsersLoading] = useState(false);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');

    const fetchOrg = useCallback(async () => {
        try {
            const res = await platformApi.get(`/organizations/${id}`);
            setOrg(res.data);
            setError(null);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load organization');
        } finally {
            setLoading(false);
        }
    }, [id]);

    const fetchUsers = useCallback(async () => {
        setUsersLoading(true);
        try {
            const res = await platformApi.get(`/organizations/${id}/users`);
            setUsers(Array.isArray(res.data) ? res.data : []);
        } catch {
            // silently fail — users count still visible in overview
        } finally {
            setUsersLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchOrg();
        fetchUsers();
    }, [fetchOrg, fetchUsers]);

    if (loading) return <LoadingState message="Loading organization…" fullPage />;
    if (error) return (
        <div className="p-8">
            <ErrorState message={error} />
            <div className="mt-4 text-center">
                <button onClick={() => navigate('/platform/organizations')} className="text-sm text-brand-primary hover:underline">
                    ← Back to Organizations
                </button>
            </div>
        </div>
    );
    if (!org) return null;

    const tabCounts = {
        users: users.length,
        branches: org.branchCount,
    };

    return (
        <PageContainer
            title={org.name}
            subtitle="Organization Control Surface"
            icon={Building2}
            actions={
                <div className="flex items-center gap-3">
                    <Link
                        to="/platform/organizations"
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 rounded-xl transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" /> All Organizations
                    </Link>
                    <OrgStatusBadge status={org.subscription?.status} />
                    {org.isArchived && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 text-xs font-bold uppercase">
                            <Archive className="w-3.5 h-3.5" /> Archived
                        </span>
                    )}
                </div>
            }
        >
            {/* Tab bar */}
            <TabBar active={activeTab} onChange={setActiveTab} counts={tabCounts} />

            {/* Tab content */}
            <div className="animate-in fade-in duration-300">
                {activeTab === 'overview' && <OverviewTab org={org} />}
                {activeTab === 'subscriptions' && <OrganizationSubscriptionsTab orgId={id} />}
                {activeTab === 'billing' && <OrgFinancialControl orgId={id} />}
                {activeTab === 'timeline' && <BillingTimelinePanel orgId={id} maxItems={50} />}
                {activeTab === 'entitlements' && <EntitlementsPanel orgId={id} />}
                {activeTab === 'crm' && <CrmTab orgId={id} org={org} />}
                {activeTab === 'users' && <OrgUsersPanel users={users} loading={usersLoading} orgId={id} onRefresh={fetchUsers} />}
                {activeTab === 'branches' && <BranchesTab orgId={id} />}
                {activeTab === 'analytics' && <AnalyticsTab orgId={id} />}
                {activeTab === 'audit' && <AuditTab orgId={id} />}
            </div>
        </PageContainer>
    );
}

export default function OrganizationDetailPage() {
    return (
        <RequireCapability permission="VIEW_ORGANIZATIONS">
            <OrganizationDetailPageContent />
        </RequireCapability>
    );
}
