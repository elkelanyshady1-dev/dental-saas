/**
 * PATIENT DOMAIN ROOT (DETAIL VIEW) — PatientLayout.jsx
 * Controls 8 routed tabs via Outlet.
 * High coupling — move only as full unit with org/modules/patients/.
 * Verified Phase 4.1 — 40+ orthodontic chart components nested here.
 * 
 * DEFAULT TAB: Orthodontic (orthodontics-first clinical workflow)
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Outlet, NavLink, useParams, useNavigate, useLocation } from 'react-router-dom';
import {
    User, Stethoscope, Calendar,
    Mail, Activity, Smile,
    AlertTriangle, Wallet,
    Edit, MessageCircle, MessageSquare, ExternalLink,
    Pill, Receipt, Shield,
    Loader2, Check, Copy,
} from 'lucide-react';
import { patientsApi } from '../../../modules/org/patients/api/patients.api';
import { useSocket } from '../../../context/SocketContext';
import { useAuth } from '../../../context/AuthContext';
import PatientRegistrationWizard from '../../../modules/org/patients/components/PatientRegistrationWizard';
// api import removed — portal magic link now goes through patientsApi
import Can from '../../../components/Can';
import FeatureGate from '../../../components/FeatureGate';
import { useFeatures } from '../../../context/FeatureContext';
import { useCapability } from '../../../hooks/useCapability';
import { P } from '../../../generated/permissionKeys';

/* ═══════════════════════════════════════════════════════════════
   UTILS
   ═══════════════════════════════════════════════════════════════ */

function calcAge(dob) {
    if (!dob) return null;
    return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

function formatDob(dob) {
    if (!dob) return null;
    return new Date(dob).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* ═══════════════════════════════════════════════════════════════
    TAB DEFINITIONS
    
    STRATEGIC DISPLAY: Orthodontics-first workflow
    - Hidden: Overview, Timeline, Clinical, Treatments (general medical tabs)
    - Shown: Orthodontic, Appointments, Financial, Audit Trail
    ═══════════════════════════════════════════════════════════════ */

// Feature flag to enable general medical tabs (future rollout)
const ENABLE_GENERAL_TABS = false;

const ALL_TABS = [
    // Hidden tabs - orthodontics-first workflow
    // { name: 'Patient Timeline',  href: 'timeline',     icon: Activity },
    // { name: 'Clinical',          href: 'clinical',     icon: Stethoscope },
    // { name: 'Treatments',        href: 'treatments',   icon: Pill },
    
    // Visible tabs - orthodontic-focused
    { name: 'Orthodontic',       href: 'orthodontic',  icon: Smile,   module: 'orthodontics' },
    { name: 'Appointments',      href: 'appointments', icon: Calendar },
    { name: 'Financial',         href: 'financial',    icon: Receipt },
    { name: 'Audit Trail',       href: 'audit',        icon: Shield,  capability: 'security.read' },
];

// Routes that should redirect to orthodontic
const BLOCKED_ROUTES = ['timeline', 'clinical', 'treatments', 'overview'];

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function PatientLayout() {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const socket = useSocket();
    const { hasModule } = useFeatures();
    const hasSecurityRead = useCapability(P.SECURITY_READ);
    const [aggregate, setAggregate] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [editWizardOpen, setEditWizardOpen] = useState(false);
    const [actionsOpen, setActionsOpen] = useState(false);

    // ── REDIRECT: Default to Orthodontic tab ─────────────────────────────────
    // Redirect root patient path and blocked routes to orthodontic
    useEffect(() => {
        const pathParts = location.pathname.split('/');
        const currentTab = pathParts[pathParts.length - 1];
        
        // Redirect if on base path or blocked route
        const isBasePath = 
            location.pathname === `/org/patients/${id}` ||
            location.pathname === `/org/patients/${id}/`;
            
        if (isBasePath || BLOCKED_ROUTES.includes(currentTab)) {
            navigate(`/org/patients/${id}/orthodontic`, { replace: true });
        }
    }, [location.pathname, id, navigate]);

    // Portal link state
    const [portalLoading, setPortalLoading] = useState(false);
    const [portalSuccess, setPortalSuccess] = useState(null); // 'opened' | 'copied'
    const [portalError, setPortalError] = useState(null);

    const fetchAggregate = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const res = await patientsApi.get(id);
            const data = res.data?.data || res.data;
            setAggregate(data);
            setError(null);
        } catch (err) {
            console.error('Failed to fetch patient aggregate:', err);
            setError('Failed to load patient data.');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [id]);

    useEffect(() => { fetchAggregate(); }, [fetchAggregate]);

    useEffect(() => {
        if (socket && id) {
            const handleUpdate = (payload) => {
                if (payload.data.patientId === id) fetchAggregate(true);
            };
            socket.on('patient:update', handleUpdate);
            return () => socket.off('patient:update', handleUpdate);
        }
    }, [socket, id, fetchAggregate]);

    // Close actions dropdown on outside click
    useEffect(() => {
        if (!actionsOpen) return;
        const handleClick = () => setActionsOpen(false);
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, [actionsOpen]);

    // ─── Portal Link Handlers ────────────────────────────────
    const generatePortalLink = useCallback(async () => {
        setPortalLoading(true);
        setPortalError(null);
        setPortalSuccess(null);
        try {
            const res = await patientsApi.generatePortalMagicLink(id);
            const magicLink = res.data?.data?.magicLink;
            if (!magicLink) throw new Error('No link returned');
            return magicLink;
        } catch (err) {
            const msg = err.response?.data?.error?.message || 'Failed to generate portal link';
            setPortalError(msg);
            throw err;
        } finally {
            setPortalLoading(false);
        }
    }, [id]);

    const handleOpenPortal = useCallback(async () => {
        try {
            const link = await generatePortalLink();
            window.open(link, '_blank');
            setPortalSuccess('opened');
            setTimeout(() => setPortalSuccess(null), 3000);
        } catch {
            // Error already set in generatePortalLink
        }
    }, [generatePortalLink]);

    const handleCopyMagicLink = useCallback(async () => {
        try {
            const link = await generatePortalLink();
            await navigator.clipboard.writeText(link);
            setPortalSuccess('copied');
            setTimeout(() => setPortalSuccess(null), 3000);
        } catch {
            // Error already set in generatePortalLink
        }
    }, [generatePortalLink]);

    // Filter tabs by module enablement
    const tabs = useMemo(() => {
        return ALL_TABS.filter((tab) => {
            if (tab.module && !hasModule(tab.module)) return false;
            if (tab.capability === 'security.read' && !hasSecurityRead) return false;
            return true;
        });
    }, [hasModule, hasSecurityRead]);

    if (loading && !aggregate) return (
        <div className="flex flex-col h-full bg-[#F8FAFC]">
            {/* Skeleton Header */}
            <div className="bg-white border-b border-gray-100 px-4 xl:px-6 py-2.5">
                <div className="flex items-center gap-3 max-w-7xl mx-auto animate-pulse">
                    <div className="w-10 h-10 bg-slate-200 rounded-xl" />
                    <div className="flex-1 space-y-2">
                        <div className="h-4 bg-slate-200 rounded w-40" />
                        <div className="h-3 bg-slate-100 rounded w-24" />
                    </div>
                    <div className="flex gap-2">
                        <div className="w-8 h-8 bg-slate-100 rounded-lg" />
                        <div className="w-8 h-8 bg-slate-100 rounded-lg" />
                        <div className="w-8 h-8 bg-slate-100 rounded-lg" />
                    </div>
                </div>
            </div>
            {/* Skeleton Tabs */}
            <div className="bg-white border-b border-gray-200 px-4 xl:px-6">
                <div className="flex gap-4 max-w-7xl mx-auto animate-pulse py-3">
                    {[1,2,3,4,5].map(i => (
                        <div key={i} className="h-3 bg-slate-200 rounded w-20" />
                    ))}
                </div>
            </div>
            {/* Skeleton Body */}
            <div className="flex-1 p-6 max-w-7xl mx-auto w-full animate-pulse">
                <div className="h-40 bg-slate-100 rounded-2xl" />
            </div>
        </div>
    );
    if (error) return <div className="p-6 text-center text-red-600 font-bold text-sm">{error}</div>;

    // ── Frontend Hardening: Safe data extraction with fallbacks ──
    const core = aggregate?.core || {};
    const clinical = aggregate?.clinical || {};
    const financial = aggregate?.financial || {};
    const shortId = core?.patientCode || (aggregate?._id || '').toString().substring(0, 8).toUpperCase();
    const medicalAlerts = clinical?.alerts || [];
    const dob = core?.dateOfBirth || core?.dob;
    const age = calcAge(dob);
    const displayName = core?.displayName || core?.nameArabic || core?.nameEnglish || 'Unknown Patient';

    return (
        <div className="flex flex-col h-full bg-[#F8FAFC] min-h-0">

            {/* ═══════════════════════════════════════════════════════
                PATIENT HEADER — Compact single-row
               ═══════════════════════════════════════════════════════ */}
            <div className="bg-white border-b border-gray-100 px-4 xl:px-6 py-2.5">
                <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">

                    {/* ── LEFT: Avatar + Name + ID + DOB ────────────── */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">

                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 border border-slate-200 overflow-hidden">
                                <User className="w-5 h-5" />
                            </div>
                            <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 border-2 border-white rounded-full ${core.isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        </div>

                        {/* Name + Meta */}
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-[15px] font-semibold text-slate-900 truncate" dir={core.nameArabic ? 'rtl' : 'ltr'}>
                                    {displayName}
                                </span>
                                <span className="px-1.5 py-0.5 bg-slate-800 text-white text-[9px] font-bold rounded">
                                    ID:{shortId}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                                {dob && (
                                    <span className="text-xs text-gray-500">
                                        DOB: {formatDob(dob)}{age !== null && ` (${age}Y)`}
                                    </span>
                                )}
                                {medicalAlerts.length > 0 && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                                        <AlertTriangle className="w-2.5 h-2.5" />
                                        {(medicalAlerts[0].data?.[0] || medicalAlerts[0].type || 'Alert').toString().substring(0, 18)}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── CENTER: Financial Summary (compact) ─────── */}
                    <Can permission="accounting.read">
                    <div className="hidden lg:flex items-center gap-5">
                        <div className="text-right">
                            <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider leading-none">Balance</p>
                            <p className="text-sm font-semibold text-slate-900">${(financial?.balance || 0).toFixed(2)}</p>
                        </div>
                        <div className="w-px h-7 bg-gray-200" />
                        <div className="text-right">
                            <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider leading-none">Due</p>
                            <p className="text-sm font-semibold text-red-500">${(financial?.due || 0).toFixed(2)}</p>
                        </div>
                        <div className="w-px h-7 bg-gray-200" />
                        <div className="text-right">
                            <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider leading-none">Paid</p>
                            <p className="text-sm font-semibold text-emerald-600">${(financial?.totalPaid || 0).toFixed(2)}</p>
                        </div>
                    </div>
                    </Can>

                    {/* ── RIGHT: Action Buttons (capability-gated) ── */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Can permission="accounting.create">
                            <button
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Add Balance"
                            >
                                <Wallet className="w-4 h-4" />
                            </button>
                        </Can>
                        <FeatureGate module="portal">
                            <Can permission="portal.manage">
                                <button
                                    onClick={handleCopyMagicLink}
                                    disabled={portalLoading}
                                    className={`p-2 rounded-lg transition-colors relative ${
                                        portalSuccess === 'copied'
                                            ? 'text-emerald-600 bg-emerald-50'
                                            : portalError
                                                ? 'text-red-500 bg-red-50'
                                                : 'text-gray-400 hover:text-purple-600 hover:bg-purple-50'
                                    }`}
                                    title={portalError || (portalSuccess === 'copied' ? 'Copied!' : 'Copy Magic Link')}
                                >
                                    {portalLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : portalSuccess === 'copied' ? (
                                        <Check className="w-4 h-4" />
                                    ) : (
                                        <Copy className="w-4 h-4" />
                                    )}
                                </button>
                                <button
                                    onClick={handleOpenPortal}
                                    disabled={portalLoading}
                                    className={`p-2 rounded-lg transition-colors ${
                                        portalSuccess === 'opened'
                                            ? 'text-emerald-600 bg-emerald-50'
                                            : 'text-gray-400 hover:text-slate-700 hover:bg-slate-100'
                                    }`}
                                    title={portalSuccess === 'opened' ? 'Portal opened!' : 'Open Patient Portal'}
                                >
                                    {portalLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : portalSuccess === 'opened' ? (
                                        <Check className="w-4 h-4" />
                                    ) : (
                                        <ExternalLink className="w-4 h-4" />
                                    )}
                                </button>
                            </Can>
                        </FeatureGate>

                        <div className="w-px h-5 bg-gray-200 mx-0.5" />

                        <Can permission="patients.update">
                            <button
                                onClick={() => setEditWizardOpen(true)}
                                className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                title="Edit Patient"
                            >
                                <Edit className="w-4 h-4" />
                            </button>
                        </Can>
                        <Can permission="patients.read">
                            <button className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="WhatsApp">
                                <MessageCircle className="w-4 h-4" />
                            </button>
                            <button className="p-2 text-gray-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" title="SMS">
                                <MessageSquare className="w-4 h-4" />
                            </button>
                            <button className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Email">
                                <Mail className="w-4 h-4" />
                            </button>
                        </Can>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════
                TAB BAR — Single, clean navigation
                STRATEGIC: Orthodontic-first, no Overview tab
               ═══════════════════════════════════════════════════════ */}
            <div className="bg-white border-b border-gray-200 px-4 xl:px-6 sticky top-0 z-30">
                <nav className="flex gap-1 max-w-7xl mx-auto overflow-x-auto no-scrollbar -mb-px">
                    {tabs.map((tab) => (
                        <NavLink
                            key={tab.name}
                            to={tab.href}
                            className={({ isActive }) =>
                                `px-3 py-2.5 text-xs font-semibold border-b-2 transition-all duration-150 whitespace-nowrap flex items-center gap-1.5 ${
                                    isActive
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-400 hover:text-gray-600'
                                }`
                            }
                        >
                            <tab.icon className="w-3.5 h-3.5" />
                            {tab.name}
                        </NavLink>
                    ))}
                </nav>
            </div>

            {/* ═══════════════════════════════════════════════════════
                SCROLLABLE BODY
               ═══════════════════════════════════════════════════════ */}
            <main className="flex-1 overflow-y-auto">
                <div className="px-4 xl:px-6 py-4 max-w-7xl mx-auto w-full">
                    <Outlet context={{ aggregate, fetchAggregate }} />
                </div>
            </main>

            {/* ── Edit Wizard ────────────────────────────────────── */}
            {editWizardOpen && (
                <PatientRegistrationWizard
                    open={editWizardOpen}
                    onClose={() => setEditWizardOpen(false)}
                    onCreated={() => { setEditWizardOpen(false); fetchAggregate(true); }}
                    editMode
                    existingPatientId={id}
                    existingData={core}
                />
            )}
        </div>
    );
}
