/**
 * PlatformOrganizationsPage.jsx
 * v20.0 — Paginated Platform Organizations
 *
 * Route: /platform/organizations
 * Capability: VIEW_ORGANIZATIONS (archive actions require MANAGE_ORGANIZATIONS)
 *
 * Changes from v19.4:
 * - GET /organizations now returns paginated response { success, data, pagination }
 * - Added page/limit state, Previous/Next controls, and page-size selector (10/20/50)
 * - Page resets to 1 on archived toggle or limit change
 * - Replaced alert() with inline actionError banner
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Building2, Plus, Globe, CreditCard, Calendar,
    Eye, CheckCircle2, XCircle, AlertTriangle, ExternalLink,
    Loader2, PauseCircle, Archive, RotateCcw, ToggleLeft, ToggleRight,
    ChevronLeft, ChevronRight, AlertCircle, Search
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SearchableCountrySelect from './SearchableCountrySelect';
import platformApi from '../../auth/platformApi';
import RequireCapability from '../../core/guards/RequireCapability';
import { usePlatformCapabilities } from '../../hooks/usePlatformCapabilities';

// ─── Status Badge (light theme) ──────────────────────────────────────────────

function StatusBadge({ status, isArchived }) {
    if (isArchived) {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wide text-slate-500 bg-slate-100 border-slate-200">
                <Archive className="w-3 h-3" /> Archived
            </span>
        );
    }
    const map = {
        active: { cls: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: <CheckCircle2 className="w-3 h-3" />, label: 'Active' },
        trial: { cls: 'text-blue-700 bg-blue-50 border-blue-200', icon: <CheckCircle2 className="w-3 h-3" />, label: 'Trial' },
        suspended: { cls: 'text-amber-700 bg-amber-50 border-amber-200', icon: <PauseCircle className="w-3 h-3" />, label: 'Suspended' },
        cancelled: { cls: 'text-red-700 bg-red-50 border-red-200', icon: <XCircle className="w-3 h-3" />, label: 'Cancelled' },
    };
    const cfg = map[status?.toLowerCase()] ?? {
        cls: 'text-slate-500 bg-slate-100 border-slate-200', icon: null, label: status ?? '—'
    };
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wide ${cfg.cls}`}>
            {cfg.icon}{cfg.label}
        </span>
    );
}

// ─── Plan Badge ───────────────────────────────────────────────────────────────

function PlanBadge({ plan }) {
    if (!plan) return <span className="text-xs text-slate-400">—</span>;
    const upper = plan.toUpperCase();
    const colorMap = {
        FREE: 'bg-slate-100 text-slate-600 border-slate-200',
        TRIAL: 'bg-blue-50   text-blue-700  border-blue-200',
        STARTER: 'bg-cyan-50   text-cyan-700  border-cyan-200',
        PRO: 'bg-violet-50 text-violet-700 border-violet-200',
        ENTERPRISE: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    };
    const cls = colorMap[upper] || 'bg-slate-100 text-slate-600 border-slate-200';
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold border uppercase tracking-wider ${cls}`}>
            {upper}
        </span>
    );
}

// ─── Org Avatar (logo → initials fallback) ────────────────────────────────────

function OrgAvatar({ org, archived }) {
    const initials = (org.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    if (org.logo) {
        return (
            <img
                src={org.logo}
                alt={org.name}
                className={`w-9 h-9 rounded-xl object-cover border border-slate-200 flex-shrink-0 ${archived ? 'opacity-40' : ''}`}
            />
        );
    }
    const colors = [
        'from-indigo-500 to-purple-600',
        'from-blue-500   to-cyan-600',
        'from-emerald-500 to-teal-600',
        'from-rose-500   to-pink-600',
        'from-amber-500  to-orange-600',
    ];
    const gradient = colors[(org.name?.charCodeAt(0) || 0) % colors.length];
    return (
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 select-none shadow-sm ${archived ? 'opacity-40' : ''}`}>
            {initials}
        </div>
    );
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
    return (
        <tr className="border-b border-slate-100">
            <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 animate-pulse flex-shrink-0" />
                    <div className="space-y-1.5">
                        <div className="w-36 h-3 bg-slate-100 rounded animate-pulse" />
                        <div className="w-24 h-2.5 bg-slate-50 rounded animate-pulse" />
                    </div>
                </div>
            </td>
            <td className="px-6 py-4"><div className="w-8 h-3 bg-slate-100 rounded animate-pulse" /></td>
            <td className="px-6 py-4"><div className="w-14 h-5 bg-slate-100 rounded-lg animate-pulse" /></td>
            <td className="px-6 py-4"><div className="w-16 h-5 bg-slate-100 rounded-full animate-pulse" /></td>
            <td className="px-6 py-4"><div className="w-20 h-3 bg-slate-100 rounded animate-pulse" /></td>
            <td className="px-6 py-4" />
        </tr>
    );
}


// ─── Confirm Action Modal ─────────────────────────────────────────────────────

function ConfirmModal({ org, action, onConfirm, onClose, loading }) {
    const isArchive = action === 'archive';
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isArchive ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'}`}>
                        {isArchive ? <Archive className="w-5 h-5 text-amber-400" /> : <RotateCcw className="w-5 h-5 text-emerald-400" />}
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-100">{isArchive ? 'Archive Organization' : 'Restore Organization'}</h3>
                        <p className="text-xs text-slate-500">{org?.name}</p>
                    </div>
                </div>
                <p className="text-slate-400 text-sm mb-6">
                    {isArchive
                        ? 'This organization will be hidden from the default list. All data is preserved. The organization can be restored at any time.'
                        : 'This organization will be restored to the active list and become visible to the platform again.'}
                </p>
                <div className="flex gap-3">
                    <button onClick={onClose} disabled={loading} className="flex-1 px-4 py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-xl transition-colors font-medium text-sm">
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className={`flex-1 px-4 py-2.5 text-white rounded-xl transition-colors font-semibold text-sm flex items-center justify-center gap-2 ${isArchive ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'} disabled:opacity-50`}
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (isArchive ? 'Archive' : 'Restore')}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Create Organization Modal ────────────────────────────────────────────────
// Sprint 8: Hybrid Onboarding Billing — includes plan selection + billing interval
// + preview panel showing trial → post-trial pricing.

function CreateOrgModal({ onClose, onSuccess }) {
    const [form, setForm] = useState({
        organizationName: '',
        adminName: '',
        adminEmail: '',
        adminPassword: '',
        country: '',
        postTrialPlanVersionId: '',  // Sprint 8: optional post-trial plan
        billingInterval: 'monthly',  // Sprint 8: billing cadence
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [fieldErrors, setFieldErrors] = useState({});
    const [planVersions, setPlanVersions] = useState([]);  // Sprint 8: available paid plans
    const [plansLoading, setPlansLoading] = useState(false);

    // ─── Duplicate warning state ───────────────────────────────────────────────
    const [dupMatches, setDupMatches] = useState([]);
    const [dupChecking, setDupChecking] = useState(false);
    const [dupDismissed, setDupDismissed] = useState(false); // admin clicked “Continue Anyway”
    const dupTimerRef = useRef(null);

    // Sprint 8: Load active, non-trial plan versions for plan selector
    useEffect(() => {
        setPlansLoading(true);
        platformApi.get('/plan-versions?status=active')
            .then(res => {
                const versions = Array.isArray(res.data) ? res.data : (res.data?.data || []);
                // Exclude the trial-tier plan from selection
                setPlanVersions(versions.filter(pv => pv.templateCode !== 'trial-tier'));
            })
            .catch(() => setPlanVersions([]))
            .finally(() => setPlansLoading(false));
    }, []);

    // ─── Duplicate check — debounced 600ms ────────────────────────────────
    useEffect(() => {
        const orgName = form.organizationName.trim();

        // Reset when name is too short or already dismissed
        if (orgName.length < 3) {
            setDupMatches([]);
            setDupDismissed(false);
            return;
        }

        // Reset dismiss if user changed the name again
        setDupDismissed(false);

        // Clear existing debounce
        clearTimeout(dupTimerRef.current);

        dupTimerRef.current = setTimeout(async () => {
            setDupChecking(true);
            try {
                const res = await platformApi.get(`/organizations/check-duplicates?q=${encodeURIComponent(orgName)}`);
                setDupMatches(res.data?.matches || []);
            } catch {
                setDupMatches([]); // non-fatal — silently ignore
            } finally {
                setDupChecking(false);
            }
        }, 600);

        return () => clearTimeout(dupTimerRef.current);
    }, [form.organizationName]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
        if (fieldErrors[name]) setFieldErrors(prev => ({ ...prev, [name]: null }));
    };

    const handleCountryChange = (value) => {
        setForm(prev => ({ ...prev, country: value }));
        if (fieldErrors.country) setFieldErrors(prev => ({ ...prev, country: null }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.country) {
            setFieldErrors(prev => ({ ...prev, country: 'Please select a country' }));
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            // Build payload — omit empty postTrialPlanVersionId
            const payload = {
                organizationName: form.organizationName,
                adminName: form.adminName,
                adminEmail: form.adminEmail,
                adminPassword: form.adminPassword,
                country: form.country,
                billingInterval: form.billingInterval,
            };
            if (form.postTrialPlanVersionId) {
                payload.postTrialPlanVersionId = form.postTrialPlanVersionId;
            }
            await platformApi.post('/organizations', payload);
            onSuccess();
        } catch (err) {
            const data = err.response?.data;
            // Structured duplicate-field error: route to inline field error
            if (data?.code === 'DUPLICATE_FIELD' && data?.field) {
                // Map backend field name to form field name
                const FIELD_MAP = {
                    email: 'adminEmail',
                    adminEmail: 'adminEmail',
                    name: 'organizationName',
                    slug: 'organizationName',
                };
                const formField = FIELD_MAP[data.field] || data.field;
                setFieldErrors(prev => ({ ...prev, [formField]: data.message }));
                // Also set the top-level banner for clarity
                setError(data.message);
            } else {
                setError(data?.message || 'Failed to create organization.');
            }
        } finally {
            setSubmitting(false);
        }
    };

    // Sprint 8: Derive display info for the selected post-trial plan
    const selectedPlanVersion = planVersions.find(pv => pv._id === form.postTrialPlanVersionId);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-6 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-100">Create Organization</h3>
                            <p className="text-xs text-slate-500">Provision a new tenant onto the platform</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors text-xl font-light">✕</button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* ── Core Fields ─────────────────────────────────────────── */}
                    {[
                        { name: 'organizationName', label: 'Organization Name', placeholder: 'Sunrise Dental Group', type: 'text' },
                        { name: 'adminName', label: 'Admin Full Name', placeholder: 'Dr. Sarah Ahmed', type: 'text' },
                        { name: 'adminEmail', label: 'Admin Email', placeholder: 'admin@example.com', type: 'email' },
                        { name: 'adminPassword', label: 'Initial Password', placeholder: '••••••••••', type: 'password' },
                    ].map(({ name, label, placeholder, type }) => (
                        <div key={name}>
                            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">{label}</label>
                            <input type={type} name={name} value={form[name]} onChange={handleChange} placeholder={placeholder} required
                                className={`w-full bg-slate-800 border rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:ring-2 transition-all ${fieldErrors[name]
                                    ? 'border-red-500/60 focus:ring-red-500/40 focus:border-red-500/60'
                                    : 'border-slate-700 focus:ring-blue-500/50 focus:border-blue-500/50'
                                    }`} />
                            {fieldErrors[name] && (
                                <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                    {fieldErrors[name]}
                                </p>
                            )}
                        </div>
                    ))}

                    <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Country</label>
                        <SearchableCountrySelect value={form.country} onChange={handleCountryChange} error={fieldErrors.country} />
                    </div>

                    {/* ── Sprint 8: Post-Trial Plan ─────────────────────────── */}
                    <div className="border-t border-slate-800/60 pt-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Billing Configuration</p>

                        <div className="space-y-3">
                            {/* Plan after trial */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                                    Plan After Trial <span className="text-slate-600 normal-case font-normal">(optional)</span>
                                </label>
                                <select
                                    id="create-org-plan-selector"
                                    name="postTrialPlanVersionId"
                                    value={form.postTrialPlanVersionId}
                                    onChange={handleChange}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                    disabled={plansLoading}
                                >
                                    <option value="">— Trial Only (no scheduled plan) —</option>
                                    {planVersions.map(pv => (
                                        <option key={pv._id} value={pv._id}>
                                            {pv.templateCode} · {pv.versionTag}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Billing interval toggle */}
                            {form.postTrialPlanVersionId && (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Billing Interval</label>
                                    <div className="flex gap-2">
                                        {['monthly', 'yearly'].map(interval => (
                                            <button
                                                key={interval}
                                                type="button"
                                                id={`billing-interval-${interval}`}
                                                onClick={() => setForm(prev => ({ ...prev, billingInterval: interval }))}
                                                className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${form.billingInterval === interval
                                                    ? 'bg-blue-600 border-blue-500 text-white'
                                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                                                    }`}
                                            >
                                                {interval}
                                                {interval === 'yearly' && (
                                                    <span className="ml-1 text-[9px] text-emerald-400 font-black">SAVE</span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Sprint 8: Billing Preview Panel ──────────────────── */}
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 space-y-2.5">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Billing Preview</p>

                        {/* Trial */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                                <span className="text-xs font-semibold text-slate-300">Trial Period</span>
                            </div>
                            <span className="text-xs font-black text-emerald-400">Free · 30 days</span>
                        </div>

                        {/* Post-trial */}
                        {selectedPlanVersion ? (
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-violet-400 flex-shrink-0" />
                                    <span className="text-xs font-semibold text-slate-300">
                                        After Trial · {selectedPlanVersion.templateCode}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs font-black text-slate-100 capitalize">
                                        {form.billingInterval} billing
                                    </span>
                                    <p className="text-[10px] text-slate-500 font-medium">
                                        Price locked at activation by pricing engine
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-slate-600 flex-shrink-0" />
                                    <span className="text-xs font-medium text-slate-500">No plan scheduled</span>
                                </div>
                                <span className="text-[10px] text-slate-600">Org suspends after trial</span>
                            </div>
                        )}
                    </div>

                    {/* ── Duplicate Warning Panel ──────────────────── */}
                    {dupChecking && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-xl">
                            <Search className="w-3.5 h-3.5 text-slate-500 animate-pulse" />
                            <span className="text-xs text-slate-500">Checking for similar organizations...</span>
                        </div>
                    )}

                    {!dupChecking && dupMatches.length > 0 && !dupDismissed && (
                        <div className="border border-amber-500/30 bg-amber-500/5 rounded-xl overflow-hidden">
                            {/* Header */}
                            <div className="flex items-start gap-2.5 px-4 py-3 border-b border-amber-500/20">
                                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                                        Possible existing organizations detected
                                    </p>
                                    <p className="text-xs text-amber-400/70 mt-0.5">
                                        Review before creating to avoid accidental duplicates.
                                    </p>
                                </div>
                            </div>

                            {/* Match rows */}
                            <div className="divide-y divide-amber-500/10">
                                {dupMatches.map((match) => (
                                    <div key={match._id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-semibold text-slate-200 truncate">
                                                    {match.name}
                                                </span>
                                                {match.isExactMatch && (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-red-500/20 border border-red-500/30 text-red-400">
                                                        Exact match
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                <span className="text-xs text-slate-500 uppercase font-medium">
                                                    {match.country}
                                                </span>
                                                <span className="text-xs text-slate-500 capitalize">
                                                    {match.status}
                                                </span>
                                                <span className="text-xs text-slate-600">
                                                    {match.createdAt
                                                        ? new Date(match.createdAt).toLocaleDateString('en-GB', {
                                                            day: '2-digit', month: 'short', year: 'numeric'
                                                        })
                                                        : '—'}
                                                </span>
                                            </div>
                                        </div>
                                        <a
                                            href={`/platform/organizations/${match._id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium shrink-0 transition-colors"
                                            title="View organization in new tab"
                                        >
                                            View <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>
                                ))}
                            </div>

                            {/* Continue anyway */}
                            <div className="px-4 py-3 border-t border-amber-500/20 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setDupDismissed(true)}
                                    className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-amber-400/10"
                                >
                                    Continue Anyway →
                                </button>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <p className="text-red-400 text-sm">{error}</p>
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} disabled={submitting} className="flex-1 px-4 py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-xl transition-colors font-medium text-sm">Cancel</button>
                        <button type="submit" disabled={submitting} className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl transition-colors font-semibold text-sm flex items-center justify-center gap-2">
                            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</> : 'Create Organization'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Empty State (light theme) ────────────────────────────────────────────────

function EmptyState({ onCreate, showArchived }) {
    return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center mb-6">
                <Building2 className="w-9 h-9 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1.5">
                {showArchived ? 'No Archived Organizations' : 'No Organizations Yet'}
            </h3>
            <p className="text-slate-400 text-sm max-w-sm mb-7">
                {showArchived
                    ? 'No organizations have been archived.'
                    : 'No tenants have been provisioned yet. Create your first organization to begin onboarding.'}
            </p>
            {!showArchived && (
                <button onClick={onCreate} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all active:scale-95 shadow-sm text-sm">
                    <Plus className="w-4 h-4" /> Create Organization
                </button>
            )}
        </div>
    );
}


// ─── Pagination Controls (light theme) ───────────────────────────────────────

function PaginationControls({ pagination, page, limit, onPageChange, onLimitChange }) {
    if (!pagination || pagination.total === 0) return null;
    const { total, pages } = pagination;
    const PAGE_SIZES = [10, 20, 50];

    return (
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/60">
            <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">Rows:</span>
                <select
                    value={limit}
                    onChange={(e) => onLimitChange(Number(e.target.value))}
                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                >
                    {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <span className="text-xs text-slate-400">
                    {total} tenant{total !== 1 ? 's' : ''}
                </span>
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => onPageChange(page - 1)}
                    disabled={page <= 1}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>
                <span className="text-xs text-slate-500 px-2 tabular-nums">
                    Page <span className="font-semibold text-slate-800">{page}</span> of <span className="font-semibold text-slate-800">{pages}</span>
                </span>
                <button
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= pages}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}


// ─── Main Page ────────────────────────────────────────────────────────────────

function PlatformOrganizationsPageContent() {
    const navigate = useNavigate();
    const { hasCapability } = usePlatformCapabilities();
    const canManage = hasCapability('MANAGE_ORGANIZATIONS');

    // List state
    const [organizations, setOrganizations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showArchived, setShowArchived] = useState(false);
    const [successMsg, setSuccessMsg] = useState(null);
    const [actionError, setActionError] = useState(null);

    // Client-side filter state
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    // Pagination state
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [pagination, setPagination] = useState(null);

    // Modal state
    const [createModal, setCreateModal] = useState(false);
    const [confirm, setConfirm] = useState({ open: false, org: null, action: null });
    const [actionLoading, setActionLoading] = useState(false);

    // ─── Fetch (reads paginated response shape) ───────────────────────────────
    const fetchOrganizations = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ page, limit });
            if (showArchived) params.set('includeArchived', 'true');
            const res = await platformApi.get(`/organizations?${params.toString()}`);
            const body = res.data;
            // Paginated shape: { success, data, pagination }
            setOrganizations(Array.isArray(body.data) ? body.data : []);
            setPagination(body.pagination || null);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fetch organizations.');
        } finally {
            setLoading(false);
        }
    }, [page, limit, showArchived]);

    useEffect(() => { fetchOrganizations(); }, [fetchOrganizations]);

    // ─── Page reset rules ─────────────────────────────────────────────────────
    const handleArchivedToggle = () => {
        setPage(1);
        setShowArchived(prev => !prev);
    };

    const handleLimitChange = (newLimit) => {
        if (newLimit !== limit) {
            setPage(1);
            setLimit(newLimit);
        }
    };

    // ─── Flash helpers ────────────────────────────────────────────────────────
    const flash = (msg) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(null), 4000);
    };

    const flashError = (msg) => {
        setActionError(msg);
        setTimeout(() => setActionError(null), 5000);
    };

    // ─── Actions ──────────────────────────────────────────────────────────────
    const handleCreateSuccess = async () => {
        setCreateModal(false);
        setPage(1);               // new org appears at first page
        await fetchOrganizations();
        flash('Organization created successfully.');
    };

    const handleConfirmAction = async () => {
        const { org, action } = confirm;
        setActionLoading(true);
        setActionError(null);
        try {
            await platformApi.patch(`/organizations/${org._id}/${action}`);
            setConfirm({ open: false, org: null, action: null });
            await fetchOrganizations();
            flash(action === 'archive' ? `"${org.name}" archived.` : `"${org.name}" restored.`);
        } catch (err) {
            // Inline error banner — never alert()
            flashError(err.response?.data?.message || `Failed to ${action} organization.`);
            setConfirm({ open: false, org: null, action: null });
        } finally {
            setActionLoading(false);
        }
    };

    // ─── Client-side filter ─────────────────────────────────────────────
    const filteredOrganizations = organizations.filter(org => {
        const term = search.toLowerCase();
        const name = (org.name || '').toLowerCase();
        const id = (org._id || '').toLowerCase();
        const matchesSearch = !term || name.includes(term) || id.includes(term);

        const subStatus = (org.subscription?.status || org.status || '').toLowerCase();
        const matchesStatus =
            statusFilter === 'all' ||
            (statusFilter === 'archived' && !!org.isArchived) ||
            (statusFilter !== 'archived' && subStatus === statusFilter && !org.isArchived);

        return matchesSearch && matchesStatus;
    });

    // ─── Loading skeleton ──────────────────────────────────────────────
    if (loading && organizations.length === 0) {
        return (
            <div className="p-6 space-y-5">
                <div className="flex items-center justify-between">
                    <div className="space-y-2">
                        <div className="w-44 h-6 bg-slate-100 rounded-lg animate-pulse" />
                        <div className="w-28 h-4 bg-slate-50 rounded animate-pulse" />
                    </div>
                    <div className="flex gap-2">
                        <div className="w-32 h-9 bg-slate-100 rounded-xl animate-pulse" />
                        <div className="w-36 h-9 bg-slate-100 rounded-xl animate-pulse" />
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="h-12 bg-slate-50 border-b border-slate-100 animate-pulse" />
                    <table className="w-full"><tbody>
                        {[1, 2, 3, 4, 5, 6].map(i => <SkeletonRow key={i} />)}
                    </tbody></table>
                </div>
            </div>
        );
    }

    // ─── Error state ───────────────────────────────────────────────────
    if (error) {
        return (
            <div className="p-6">
                <div className="flex items-start gap-3 p-5 bg-red-50 border border-red-200 rounded-2xl">
                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-red-700 font-semibold mb-1">Failed to load organizations</p>
                        <p className="text-red-500 text-sm">{error}</p>
                        <button onClick={fetchOrganizations} className="mt-3 text-sm text-indigo-600 hover:underline">Retry →</button>
                    </div>
                </div>
            </div>
        );
    }


    return (
        <div className="p-6 space-y-5 animate-in fade-in duration-300">

            {/* ── Toasts ── */}
            {successMsg && (
                <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl animate-in slide-in-from-top duration-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <p className="text-emerald-800 text-sm font-medium flex-1">{successMsg}</p>
                    <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-800 text-lg leading-none">×</button>
                </div>
            )}
            {actionError && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl animate-in slide-in-from-top duration-300">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-red-700 text-sm font-medium flex-1">{actionError}</p>
                    <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-800 text-lg leading-none">×</button>
                </div>
            )}

            {/* ── Page Header ── */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
                        <Building2 className="w-6 h-6 text-indigo-500" />
                        Organizations
                    </h1>
                    <p className="text-slate-400 mt-0.5 text-sm">
                        {pagination
                            ? `${pagination.total} ${showArchived ? 'total' : 'active'} tenant${pagination.total !== 1 ? 's' : ''}`
                            : 'Manage all tenants on the platform'}
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={handleArchivedToggle}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all ${showArchived
                                ? 'bg-amber-50 border-amber-200 text-amber-700'
                                : 'border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 bg-white'
                            }`}
                    >
                        {showArchived ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                        {showArchived ? 'Showing Archived' : 'Show Archived'}
                    </button>
                    {!showArchived && (
                        <button
                            onClick={() => setCreateModal(true)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all active:scale-95 shadow-sm text-sm"
                        >
                            <Plus className="w-4 h-4" /> New Organization
                        </button>
                    )}
                </div>
            </div>

            {/* ── Search + Status Filter bar ── */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search by name or ID…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 transition-colors placeholder-slate-400"
                    />
                </div>
                <div className="relative">
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="appearance-none pl-3 pr-8 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400/30 cursor-pointer"
                    >
                        <option value="all">All Status</option>
                        <option value="active">Active</option>
                        <option value="trial">Trial</option>
                        <option value="suspended">Suspended</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="archived">Archived</option>
                    </select>
                    <ChevronRight className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none rotate-90" />
                </div>
                {(search || statusFilter !== 'all') && (
                    <button
                        onClick={() => { setSearch(''); setStatusFilter('all'); }}
                        className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                        Clear
                    </button>
                )}
                <span className="text-xs text-slate-400 ml-auto tabular-nums">
                    {filteredOrganizations.length} result{filteredOrganizations.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* ── Table / Empty state ── */}
            {filteredOrganizations.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
                    <EmptyState onCreate={() => setCreateModal(true)} showArchived={showArchived} />
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    {/* Thin progress line while re-paginating */}
                    {loading && <div className="h-0.5 bg-indigo-200 animate-pulse" />}

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/80 border-b border-slate-100">
                                    <th className="px-6 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Organization</th>
                                    <th className="px-6 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" />Country</span>
                                    </th>
                                    <th className="px-6 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        <span className="flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" />Plan</span>
                                    </th>
                                    <th className="px-6 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                                    <th className="px-6 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Created</span>
                                    </th>
                                    {/* Slim actions column — no header text */}
                                    {canManage && <th className="px-4 py-3.5" />}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredOrganizations.map((org) => {
                                    const archived = !!org.isArchived;
                                    const planCode = org.commercial?.planCode
                                        || org.subscription?.plan
                                        || org.plan
                                        || null;
                                    return (
                                        <tr
                                            key={org._id}
                                            onClick={() => navigate(`/platform/organizations/${org._id}`)}
                                            className={`transition-colors group cursor-pointer ${archived
                                                    ? 'opacity-55 hover:bg-amber-50/30'
                                                    : 'hover:bg-indigo-50/40'
                                                }`}
                                        >
                                            {/* Identity */}
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <OrgAvatar org={org} archived={archived} />
                                                    <div>
                                                        <p className={`font-semibold text-sm leading-tight ${archived ? 'text-slate-400 line-through' : 'text-slate-900'
                                                            }`}>
                                                            {org.name}
                                                        </p>
                                                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{org._id}</p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Country */}
                                            <td className="px-6 py-4">
                                                <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">
                                                    {org.country || org.regionCode || '—'}
                                                </span>
                                            </td>

                                            {/* Plan */}
                                            <td className="px-6 py-4">
                                                <PlanBadge plan={planCode} />
                                            </td>

                                            {/* Status */}
                                            <td className="px-6 py-4">
                                                <StatusBadge status={org.subscription?.status || org.status} isArchived={archived} />
                                            </td>

                                            {/* Created */}
                                            <td className="px-6 py-4 text-xs text-slate-400 tabular-nums">
                                                {org.createdAt
                                                    ? new Date(org.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                                                    : '—'}
                                            </td>

                                            {/* Archive / Restore — stops row click propagation */}
                                            {canManage && (
                                                <td className="px-4 py-4 text-right" onClick={e => e.stopPropagation()}>
                                                    {archived ? (
                                                        <button
                                                            onClick={() => setConfirm({ open: true, org, action: 'restore' })}
                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors uppercase tracking-wide"
                                                        >
                                                            <RotateCcw className="w-3 h-3" /> Restore
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => setConfirm({ open: true, org, action: 'archive' })}
                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors uppercase tracking-wide opacity-0 group-hover:opacity-100"
                                                        >
                                                            <Archive className="w-3 h-3" /> Archive
                                                        </button>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <PaginationControls
                        pagination={pagination}
                        page={page}
                        limit={limit}
                        onPageChange={setPage}
                        onLimitChange={handleLimitChange}
                    />
                </div>
            )}

            {/* ── Modals ── */}
            {confirm.open && (
                <ConfirmModal
                    org={confirm.org}
                    action={confirm.action}
                    onConfirm={handleConfirmAction}
                    onClose={() => setConfirm({ open: false, org: null, action: null })}
                    loading={actionLoading}
                />
            )}
            {createModal && (
                <CreateOrgModal onClose={() => setCreateModal(false)} onSuccess={handleCreateSuccess} />
            )}
        </div>
    );
}

export default function PlatformOrganizationsPage() {
    return (
        <RequireCapability permission="VIEW_ORGANIZATIONS">
            <PlatformOrganizationsPageContent />
        </RequireCapability>
    );
}

