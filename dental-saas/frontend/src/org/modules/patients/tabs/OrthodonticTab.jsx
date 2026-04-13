/**
 * OrthodonticTab.jsx — ORTHO-PAGE-PERSPECTIVE-V2
 * ================================================
 * Matches the provided mockup design:
 *   - 4-card stats bar
 *   - 8/4 grid: Case Status + Timeline | Alerts + Financial + Next Step
 *   - "Open Chart Editor" launches SnapshotEditor as fullscreen overlay
 */

import React, { useState, Suspense } from 'react';
import { TimeProvider } from '../components/orthodontic-chart/components/GlobalTimeContext';
import { useOutletContext, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useActiveVisit, useStartVisit } from '../components/orthodontic-chart/hooks/useActiveVisit';
import {
    Activity, Smile, Plus, Clock, AlertTriangle,
    Calendar, Wallet, TrendingUp, Stethoscope,
    BarChart3, ExternalLink, CreditCard, Sparkles,
    Loader2, FolderOpen, FlaskConical, Ruler, FilePlus2,
    ListTodo, Layers, CheckCircle2,
} from 'lucide-react';
import { caseApi } from '../components/orthodontic-chart/api/case.api';
import { useCaseTimeline } from '../components/orthodontic-chart/hooks/useSnapshots';
import { useTodoSummary } from '../components/orthodontic-chart/hooks/useTodos';
import AppModal from '@/components/ui/AppModal';

/* ═══════════════════════════════════════════════════════════════════
   LAZY LOAD — SnapshotEditor is code-split (812KB JSON + 70KB component)
   ═══════════════════════════════════════════════════════════════════ */

const LazySnapshotEditor = React.lazy(() =>
    import('../components/orthodontic-chart/components/SnapshotEditor')
);

const LazyOrthoCasesTab = React.lazy(() =>
    import('../components/orthodontic-chart/components/cases/OrthoCasesTab')
);
const LazyOrthoTimelineTab = React.lazy(() =>
    import('../components/orthodontic-chart/components/cases/OrthoTimelineTab')
);
const LazyOrthoLabTab = React.lazy(() =>
    import('../components/orthodontic-chart/components/cases/OrthoLabTab')
);

const LazyCastAnalysisModal = React.lazy(() =>
    import('../components/orthodontic-chart/components/CastAnalysisModal')
);

/* ═══════════════════════════════════════════════════════════════════
   PHASE CONFIG
   ═══════════════════════════════════════════════════════════════════ */

const PHASE_LABELS = {
    'pre-treatment':  'Pre-Treatment',
    'treatment':      'Treatment',
    'post-treatment': 'Post-Treatment',
};

const CASE_TYPE_LABELS = {
    comprehensive: 'Comprehensive Case',
    limited:       'Limited Case',
    retention:     'Retention Only',
};

const CASE_STATUS_CONFIG = {
    active:             { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100', dot: 'bg-emerald-500', label: 'Active' },
    draft:              { bg: 'bg-slate-50',   text: 'text-slate-500',   border: 'border-slate-200',   dot: 'bg-slate-400',   label: 'Draft' },
    diagnosis:          { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-100',    dot: 'bg-blue-500',    label: 'Diagnosis' },
    treatment_planning: { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-100',   dot: 'bg-amber-500',   label: 'Planning' },
    completed:          { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-100',  dot: 'bg-purple-500',  label: 'Completed' },
};

const TOTAL_PHASES = 3;

const CLINICAL_PHASE_LABELS = {
    LEVEL_ALIGNMENT:  'Level & Alignment',
    SPACE_MANAGEMENT: 'Space Management',
    FINISHING:        'Finishing',
};

/* ═══════════════════════════════════════════════════════════════════
   SNAPSHOT EDITOR LOADING FALLBACK
   ═══════════════════════════════════════════════════════════════════ */

function ChartLoadingFallback() {
    return (
        <div className="fixed inset-0 bg-slate-100 flex flex-col items-center justify-center z-[200]">
            <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                </div>
                <div className="text-center">
                    <h3 className="text-lg font-bold text-slate-800">Loading Chart Editor</h3>
                    <p className="text-sm text-slate-500 mt-1">Preparing orthodontic workspace...</p>
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

const isValidObjectId = (id) => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);

/**
 * ORTHO_CASES_KEY — React Query key factory for orthodontic cases per patient.
 * Used for cache invalidation after creating a new case.
 */
const ORTHO_CASES_KEY = (patientId) => ['orthodontic-cases', 'list', { patientId }];

export default function OrthodonticTab() {
    const { id: patientId } = useParams();
    const { aggregate } = useOutletContext();
    const queryClient = useQueryClient();
    const [showChartEditor, setShowChartEditor]   = useState(false);
    const [showCastAnalysis, setShowCastAnalysis] = useState(false);
    const [activeTab, setActiveTab]               = useState('overview');
    const [isCreatingCase, setIsCreatingCase]     = useState(false);
    const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
    const [errorModalMessage, setErrorModalMessage] = useState('');

    // ── Fetch real orthodontic cases for this patient ─────────────────────
    // SINGLE SOURCE OF TRUTH for caseId.
    // SnapshotEditor, Bonding Engine, TAD Engine, and Sequence Engine all
    // depend on a valid caseId to persist data. Without this query,
    // all clinical writes silently fail (no API call fires).
    const { data: casesResponse, isLoading: casesLoading } = useQuery({
        queryKey: ORTHO_CASES_KEY(patientId),
        queryFn: () => caseApi.listByPatient(patientId),
        enabled: isValidObjectId(patientId),
        staleTime: 60_000,
    });

    // Resolve active case — DTO shape: { id, patientId, caseType, status }
    const casesList = casesResponse?.data?.data ?? [];
    const activeCase = casesList.find(c => c.status === 'active')
        || casesList[0]
        || null;

    // ── Authoritative caseId — real ObjectId or null ─────────────────────
    const realCaseId = activeCase?.id || null;

    // ── Case detail (phases, snapshot flags) — only when we have a real case ─
    const { data: caseDetailResponse } = useQuery({
        queryKey: ['orthodontic-cases', 'detail', realCaseId],
        queryFn:  () => caseApi.get(realCaseId),
        enabled:  !!realCaseId,
        staleTime: 60_000,
    });
    const caseDetail  = caseDetailResponse?.data?.data ?? null;
    const phases      = caseDetail?.phases ?? [];
    const activePhase = caseDetail?.activePhase ?? null;

    // ── Active visit — drives "Start Visit" / "Continue Visit" button ────
    const { data: activeVisit, isLoading: visitLoading } = useActiveVisit(realCaseId || undefined);
    const startVisitMutation = useStartVisit(realCaseId || undefined);

    // ── Todo summary — pending count for badge on overview ───────────────
    const { data: todoSummary } = useTodoSummary(realCaseId);
    const pendingTodos   = todoSummary?.pending      ?? 0;
    const highPrioTodos  = todoSummary?.highPriority ?? 0;

    // ── Timeline for overview panel ───────────────────────────────────────
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { data: recentTimeline = [] } = useCaseTimeline(realCaseId || undefined);
    const recentActivity = recentTimeline.slice(-3).reverse(); // last 3 visits, newest first

    // Most recent visit — used for currentClinicalPhase in Clinical Status card
    const lastVisit            = recentTimeline[recentTimeline.length - 1] ?? null;
    const currentClinicalPhase = lastVisit?.clinicalPhase ?? null;

    if (!aggregate) return null;

    // ── Derived display values ────────────────────────────────────────────
    const orthoCase       = caseDetail || activeCase || null;
    const caseTypeLabel   = CASE_TYPE_LABELS[orthoCase?.caseType] || orthoCase?.caseType || '—';
    const statusCfg       = CASE_STATUS_CONFIG[orthoCase?.status] || CASE_STATUS_CONFIG.draft;
    const activePhaseLabel = activePhase?.name ? (PHASE_LABELS[activePhase.name] || activePhase.name) : '—';

    // Progress: active phase position expressed as %; 100 when all completed
    const allDone = phases.length > 0 && phases.every(p => p.status === 'completed');
    const progress = allDone
        ? 100
        : activePhase
            ? Math.round(((activePhase.order - 0.5) / TOTAL_PHASES) * 100)
            : 0;

    // ── Financial — from patient aggregate ───────────────────────────────
    const financial  = aggregate?.financial ?? {};
    const totalCost  = financial.totalCost  ?? 0;
    const paidToDate = financial.paidToDate ?? 0;
    const remaining  = totalCost - paidToDate;

    const clinical = aggregate?.clinical || {};
    const alerts   = clinical?.alerts || [];

    // ── Case duration ─────────────────────────────────────────────────────
    let caseDuration = '—';
    const startedAtMs = caseDetail?.startedAt;
    if (startedAtMs) {
        const start = new Date(startedAtMs);
        if (!isNaN(start.getTime())) {
            const now = new Date();
            let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
            if (months < 0) months = 0;
            if (months === 0) caseDuration = '< 1 mo';
            else if (months < 12) caseDuration = `${months} mo`;
            else {
                const yrs = Math.floor(months / 12);
                const mos = months % 12;
                caseDuration = mos > 0 ? `${yrs}y ${mos}m` : `${yrs} yr`;
            }
        }
    }

    // ── Started-at display ────────────────────────────────────────────────
    const startedAtDisplay = startedAtMs
        ? new Date(startedAtMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '—';

    // ── Appointment context for SnapshotEditor ──────────────────────────
    // caseId MUST be a real ObjectId or undefined. Never a placeholder.
    // type and doctor are intentionally omitted — derived from activeVisit DTO.
    const appointment = {
        id: 'apt-live',
        patientId: patientId || 'unknown',
        caseId: realCaseId || undefined,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        status: 'checked-in',
    };

    // ── Create case handler ─────────────────────────────────────────────
    const handleCreateCase = async () => {
        if (isCreatingCase || !isValidObjectId(patientId)) return;
        setIsCreatingCase(true);
        try {
            await caseApi.create({ patientId });
            // Invalidate to surface the new case
            await queryClient.invalidateQueries({ queryKey: ORTHO_CASES_KEY(patientId) });
        } catch (err) {
            if (err?.response?.status === 409) {

                // Case already exists — reload from backend to get its real ID
                console.info('[OrthodonticTab] Case already exists (409) — refreshing case list');
                await queryClient.invalidateQueries({ queryKey: ORTHO_CASES_KEY(patientId) });
            } else {
                console.error('[OrthodonticTab] Failed to create case:', err?.response?.data || err.message);
                setErrorModalMessage('Failed to create orthodontic case. Please try again.');
                setIsErrorModalOpen(true);
            }
        } finally {
            setIsCreatingCase(false);
        }
    };


    // ── Start visit then open chart editor ───────────────────────────────
    const handleStartVisit = async () => {
        if (!realCaseId) {
            setShowChartEditor(true); // triggers "no case" modal
            return;
        }
        try {
            await startVisitMutation.mutateAsync({});
            setShowChartEditor(true);
        } catch (err) {
            // 409 = visit already active — just open the editor
            if (err?.response?.status === 409) {
                setShowChartEditor(true);
            } else {
                setErrorModalMessage('Failed to start visit. Please try again.');
                setIsErrorModalOpen(true);
            }
        }
    };

    const handleSaveSnapshot = (snapshot) => {
        console.log('[OrthodonticTab] Snapshot saved:', snapshot.id);
    };

    const SUB_TABS = [
        { id: 'overview',  label: 'Overview',  icon: BarChart3 },
        { id: 'cases',     label: 'Cases',     icon: FolderOpen },
        { id: 'timeline',  label: 'Timeline',  icon: Activity },
        { id: 'lab',       label: 'Lab',       icon: FlaskConical },
    ];

    return (
        <>
            <div className="space-y-4">

                {/* ══ 4-Card Stats Bar ══════════════════════════════════ */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                        icon={<Stethoscope className="w-5 h-5" />}
                        iconBg="bg-blue-50 text-blue-600"
                        label="Active Case"
                        value={caseTypeLabel}
                    />
                    <StatCard
                        icon={<Calendar className="w-5 h-5" />}
                        iconBg="bg-emerald-50 text-emerald-600"
                        label="Next Appointment"
                        value={aggregate.nextAppointment
                            ? new Date(aggregate.nextAppointment).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : 'Oct 24, 10:15 AM'}
                    />
                    <StatCard
                        icon={<Wallet className="w-5 h-5" />}
                        iconBg="bg-amber-50 text-amber-600"
                        label="Financial Balance"
                        value={totalCost > 0 ? `$${remaining.toLocaleString()} remaining` : '—'}
                    />
                    <StatCard
                        icon={<TrendingUp className="w-5 h-5" />}
                        iconBg="bg-purple-50 text-purple-600"
                        label="Progress"
                        value={`Stage: ${activePhaseLabel}`}
                    />
                </div>

                {/* ══ Sub-Tab Navigation ════════════════════════════════ */}
                <div className="flex gap-1 border-b border-gray-100 mb-1">
                    {SUB_TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                id={`ortho-tab-${tab.id}`}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-all relative ${
                                    isActive
                                        ? 'text-blue-600'
                                        : 'text-gray-400 hover:text-gray-600'
                                }`}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {tab.label}
                                {isActive && (
                                    <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-600 rounded-t" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* ══ Tab Content ═══════════════════════════════════════ */}
                {activeTab === 'overview' && (
                <div className="grid grid-cols-12 gap-8">

                    {/* ── LEFT col-7: Case Status + Quick Actions + Timeline ── */}
                    <div className="col-span-12 lg:col-span-7 space-y-8">

                        {/* Case Status Card */}
                        <div className="bg-white rounded-[2rem] border border-slate-100 p-8"
                            style={{ boxShadow: '0 4px 24px rgba(11,28,48,0.06)' }}>
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
                                        {caseTypeLabel}
                                    </h2>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">Orthodontic Case</p>
                                </div>
                                <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`}></span>
                                    {statusCfg.label}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                                <div className="bg-slate-50 rounded-xl p-3">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Malocclusion</p>
                                    <p className="text-sm font-semibold text-slate-800 truncate">{caseDetail?.malocclusionClass || '—'}</p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Phase</p>
                                    <p className="text-sm font-semibold text-slate-800">{activePhaseLabel}</p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Started</p>
                                    <p className="text-sm font-semibold text-slate-800">{startedAtDisplay}</p>
                                </div>
                                <div className="bg-blue-50/50 rounded-xl p-3 border border-blue-100/50">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-1">Duration</p>
                                    <p className="text-sm font-bold text-blue-700">{caseDuration}</p>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between items-end mb-1.5">
                                    <p className="text-xs font-medium text-slate-500">Overall Progress</p>
                                    <p className="text-xs font-bold text-blue-600">{progress}%</p>
                                </div>
                                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                    <div className="bg-blue-600 h-full rounded-full transition-all" style={{ width: `${progress}%` }}></div>
                                </div>
                            </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {/* Visit entry button — state-driven */}
                            {activeVisit ? (
                                <button
                                    id="continue-visit-btn"
                                    onClick={() => setShowChartEditor(true)}
                                    className="relative flex flex-col items-center justify-center p-6 bg-emerald-600 text-white rounded-[1.5rem] shadow-sm hover:bg-emerald-700 hover:shadow-md active:scale-95 transition-all gap-3"
                                >
                                    <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-white animate-pulse" />
                                    <ExternalLink className="w-6 h-6" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Continue Visit</span>
                                </button>
                            ) : (
                                <button
                                    id="start-visit-btn"
                                    onClick={handleStartVisit}
                                    disabled={startVisitMutation.isPending || visitLoading || casesLoading}
                                    className="flex flex-col items-center justify-center p-6 bg-blue-600 text-white rounded-[1.5rem] shadow-sm hover:bg-blue-700 hover:shadow-md active:scale-95 transition-all gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {startVisitMutation.isPending
                                        ? <Loader2 className="w-6 h-6 animate-spin" />
                                        : <Plus className="w-6 h-6" />
                                    }
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Start Visit</span>
                                </button>
                            )}
                            <button id="open-cast-analysis-btn" onClick={() => setShowCastAnalysis(true)}
                                className="flex flex-col items-center justify-center p-6 bg-white border border-slate-200 text-slate-600 rounded-[1.5rem] shadow-sm hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 active:scale-95 transition-all gap-3">
                                <Ruler className="w-6 h-6" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Cast Analysis</span>
                            </button>
                            <button className="flex flex-col items-center justify-center p-6 bg-white border border-slate-200 text-slate-600 rounded-[1.5rem] shadow-sm hover:bg-slate-50 active:scale-95 transition-all gap-3">
                                <Calendar className="w-6 h-6" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Appointment</span>
                            </button>
                            <button className="flex flex-col items-center justify-center p-6 bg-white border border-slate-200 text-slate-600 rounded-[1.5rem] shadow-sm hover:bg-slate-50 active:scale-95 transition-all gap-3">
                                <Plus className="w-6 h-6" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Lab Order</span>
                            </button>
                        </div>

                        {/* Clinical Timeline — Design 1 editorial */}
                        <div className="bg-white rounded-[2rem] border border-slate-100 p-8"
                            style={{ boxShadow: '0 4px 24px rgba(11,28,48,0.06)' }}>
                            <div className="flex justify-between items-center mb-8">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Patient History</p>
                                    <h2 className="text-xl font-bold tracking-tight text-slate-900">Clinical Timeline</h2>
                                </div>
                                <button onClick={() => setActiveTab('timeline')}
                                    className="text-blue-600 text-sm font-bold flex items-center gap-1 hover:underline">Full Timeline ↗</button>
                            </div>

                            <div className="relative pl-10">
                                <div className="absolute left-[3px] top-2 bottom-2 w-0.5 bg-blue-100 rounded-full"></div>

                                {recentActivity.length === 0 ? (
                                    <div className="border-2 border-dashed border-slate-200 rounded-3xl p-10 flex flex-col items-center text-center">
                                        <Calendar className="w-10 h-10 text-slate-300 mb-3" />
                                        <p className="text-sm font-bold text-slate-400">No clinical visits recorded yet</p>
                                        <p className="text-xs text-slate-300 mt-1 max-w-[220px] leading-relaxed">Open the Chart Editor and save your first snapshot to begin.</p>
                                    </div>
                                ) : recentActivity.map((entry, i) => {
                                    const TYPE_BADGE = { bonding:'bg-purple-50 text-purple-700 border-purple-100', adjustment:'bg-blue-50 text-blue-700 border-blue-100', wire_change:'bg-cyan-50 text-cyan-700 border-cyan-100', debonding:'bg-orange-50 text-orange-700 border-orange-100', treatment:'bg-emerald-50 text-emerald-700 border-emerald-100' };
                                    const TYPE_LABEL = { bonding:'Bonding', adjustment:'Adjustment', wire_change:'Wire Change', debonding:'Debonding', treatment:'Treatment' };
                                    const badgeCls  = TYPE_BADGE[entry.type] ?? TYPE_BADGE.treatment;
                                    const typeLabel = TYPE_LABEL[entry.type] ?? 'Visit';
                                    const isLatest  = i === 0;
                                    const procs     = entry.procedures ?? [];
                                    return (
                                        <div key={entry.visitId ?? i} className={`relative group ${i < recentActivity.length - 1 ? 'mb-10' : ''}`}>
                                            <div className={`absolute -left-[41px] top-1.5 w-5 h-5 rounded-full border-4 border-white shadow-sm z-10 ${isLatest ? 'bg-blue-600 ring-4 ring-blue-100' : 'bg-slate-300'}`} />
                                            <div className={`rounded-2xl p-5 transition-all group-hover:-translate-y-0.5 ${isLatest ? 'bg-blue-50/40 border border-blue-100' : 'bg-white border border-slate-100 hover:shadow-sm'}`}>
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${isLatest ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>Visit #{entry.visitNumber ?? '?'}</span>
                                                        {isLatest && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase">Latest</span>}
                                                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wider ${badgeCls}`}>{typeLabel}</span>
                                                    </div>
                                                    <span className="text-[10px] text-slate-400 font-medium shrink-0 ml-2">{entry.visitDate ? new Date(entry.visitDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'}) : '—'}</span>
                                                </div>
                                                {procs.length > 0 && (
                                                    <div className="space-y-1.5 mb-3">
                                                        {procs.slice(0,3).map((p,pi) => (
                                                            <div key={pi} className="flex items-start gap-2">
                                                                <Activity className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                                                                <p className="text-xs text-slate-700 leading-relaxed">{typeof p==='string'?p:(p?.type??JSON.stringify(p))}</p>
                                                            </div>
                                                        ))}
                                                        {procs.length > 3 && <p className="text-[10px] text-slate-400 pl-5">+{procs.length-3} more</p>}
                                                    </div>
                                                )}
                                                {entry.notes?.clinical && (
                                                    <div className="bg-white border-l-2 border-blue-400 px-3 py-2 rounded-r-xl mb-3">
                                                        <p className="text-xs italic text-slate-500 leading-relaxed">"{entry.notes.clinical.slice(0,120)}{entry.notes.clinical.length>120?'…':''}"
                                                        </p>
                                                    </div>
                                                )}
                                                {entry.snapshotId && (
                                                    <div className="flex items-center justify-end mt-4">
                                                        <button onClick={() => setShowChartEditor(true)}
                                                            className="text-[10px] font-bold uppercase tracking-widest text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg transition-colors border border-blue-100 flex items-center gap-1.5">
                                                            <ExternalLink className="w-3.5 h-3.5" /> Open Visit
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* ── RIGHT col-5 ── */}
                    <div className="col-span-12 lg:col-span-5 space-y-8">

                        {/* Critical Alerts */}
                        <div className="bg-white rounded-[2rem] border border-slate-100 p-6"
                            style={{ boxShadow: '0 4px 24px rgba(11,28,48,0.06)' }}>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Critical Alerts</p>
                            <div className="space-y-3">
                                {alerts.length > 0 ? alerts.map((alert, i) => {
                                    const Icon = alert.icon || AlertTriangle;
                                    return (
                                        <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-bold ${alert.color || 'bg-red-50 border-red-100 text-red-700'}`}>
                                            <Icon className="w-4 h-4 flex-shrink-0" />
                                            <span>{alert.label || alert.data?.[0] || alert.type}</span>
                                        </div>
                                    );
                                }) : (
                                    <p className="text-sm text-slate-400 text-center py-3">No active alerts</p>
                                )}
                            </div>
                        </div>

                        {/* Clinical Status */}
                        <div className="bg-white rounded-[2rem] border border-slate-100 p-6"
                            style={{ boxShadow: '0 4px 24px rgba(11,28,48,0.06)' }}>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Clinical Status</p>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center pb-3 border-b border-slate-50">
                                    <span className="text-sm text-slate-500 flex items-center gap-2">
                                        <Layers className="w-3.5 h-3.5" />Case Phase
                                    </span>
                                    <span className="bg-blue-50 px-3 py-1 rounded-full text-xs font-bold text-blue-700">
                                        {activePhase ? (PHASE_LABELS[activePhase.name] ?? activePhase.name) : '—'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center pb-3 border-b border-slate-50">
                                    <span className="text-sm text-slate-500 flex items-center gap-2">
                                        <Stethoscope className="w-3.5 h-3.5" />Clinical Focus
                                    </span>
                                    <span className="bg-slate-50 px-3 py-1 rounded-full text-xs font-bold text-slate-700">
                                        {currentClinicalPhase ? CLINICAL_PHASE_LABELS[currentClinicalPhase] : '—'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center pb-3 border-b border-slate-50">
                                    <span className="text-sm text-slate-500 flex items-center gap-2">
                                        <ListTodo className="w-3.5 h-3.5" />Pending TODOs
                                    </span>
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${pendingTodos > 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-700'}`}>
                                        {pendingTodos}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-500 flex items-center gap-2">
                                        <CheckCircle2 className="w-3.5 h-3.5" />High Priority
                                    </span>
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${highPrioTodos > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-700'}`}>
                                        {highPrioTodos}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Financial Summary */}
                        <div className="bg-white rounded-[2rem] border border-slate-100 p-6"
                            style={{ boxShadow: '0 4px 24px rgba(11,28,48,0.06)' }}>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Financial Summary</p>
                            <div className="mb-4">
                                <h3 className="text-3xl font-extrabold text-slate-900">
                                    ${remaining.toLocaleString()}
                                    <span className="text-sm font-medium text-slate-400 ml-1">remaining</span>
                                </h3>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-2">
                                <div className="bg-emerald-500 h-full rounded-full transition-all"
                                    style={{ width: totalCost ? `${Math.min(100, Math.round((paidToDate / totalCost) * 100))}%` : '0%' }} />
                            </div>
                            <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-4">
                                <span>{totalCost ? Math.round((paidToDate / totalCost) * 100) : 0}% Paid</span>
                                <span className="text-emerald-600">${paidToDate.toLocaleString()} of ${totalCost.toLocaleString()}</span>
                            </div>
                            <button className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2">
                                <CreditCard className="w-4 h-4" /> Add Payment
                            </button>
                        </div>

                        {/* Next Step */}
                        <div className="bg-blue-50 border-2 border-blue-100 rounded-[2rem] p-6">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-4">Upcoming Target</p>
                            <div className="flex gap-4">
                                <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                                    <Sparkles className="w-5 h-5 text-white" />
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-bold text-slate-900 text-sm leading-snug">Stage: Finishing &amp; Detailing</h4>
                                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">Review panoramic X-ray to confirm root parallelism before debonding consultation.</p>
                                    <button className="mt-3 px-4 py-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-full hover:bg-blue-700 transition-all">Review Treatment Plan</button>
                                </div>
                            </div>
                        </div>

                        {/* Analytics Snapshot */}
                        <div className="bg-white rounded-[2rem] border border-slate-100 p-6"
                            style={{ boxShadow: '0 4px 24px rgba(11,28,48,0.06)' }}>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Analytics Snapshot</p>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center pb-3 border-b border-slate-50">
                                    <span className="text-sm text-slate-500">Total Visits</span>
                                    <span className="bg-slate-50 px-3 py-1 rounded-full text-xs font-bold text-slate-800">{recentTimeline.length}</span>
                                </div>
                                <div className="flex justify-between items-center pb-3 border-b border-slate-50">
                                    <span className="text-sm text-slate-500">Last Visit</span>
                                    <span className="bg-slate-50 px-3 py-1 rounded-full text-xs font-bold text-slate-800">
                                        {recentTimeline.length > 0 ? new Date(recentTimeline[recentTimeline.length-1]?.visitDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) : '—'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-500">Next Appointment</span>
                                    <span className="bg-slate-50 px-3 py-1 rounded-full text-xs font-bold text-slate-800">
                                        {aggregate.nextAppointment ? new Date(aggregate.nextAppointment).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) : 'Oct 24'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Lab Shortcut Card */}
                        <button
                            onClick={() => setActiveTab('lab')}
                            className="w-full rounded-[2rem] bg-white border border-slate-100 p-6 flex items-center gap-4 hover:bg-slate-50 transition-all text-left"
                            style={{ boxShadow: '0 4px 24px rgba(11,28,48,0.04)' }}
                        >
                            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                                <FlaskConical className="w-5 h-5 text-purple-600" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-900">Lab Orders</p>
                                <p className="text-xs text-slate-400 mt-0.5">View aligners, retainers &amp; appliances</p>
                            </div>
                            <ExternalLink className="w-4 h-4 text-slate-300 ml-auto shrink-0" />
                        </button>

                    </div>
                </div>
                )}

                {/* ══ Cases Tab ═════════════════════════════════════════ */}
                {activeTab === 'cases' && (
                    <Suspense fallback={
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        </div>
                    }>
                        <LazyOrthoCasesTab
                            patientId={patientId || 'unknown'}
                            patientName={aggregate?.core?.displayName || ''}
                        />
                    </Suspense>
                )}

                {/* ══ Timeline Tab ══════════════════════════════════════ */}
                {activeTab === 'timeline' && (
                    <Suspense fallback={
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        </div>
                    }>
                        <LazyOrthoTimelineTab
                            caseId={realCaseId || undefined}
                            onOpenSnapshotEditor={(_visitId) => setShowChartEditor(true)}
                        />
                    </Suspense>
                )}

                {/* ══ Lab Tab ══════════════════════════════════════════ */}
                {activeTab === 'lab' && (
                    <Suspense fallback={
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        </div>
                    }>
                        <LazyOrthoLabTab labOrders={[]} />
                    </Suspense>
                )}

            </div>

            {/* ══ Fullscreen Chart Editor Overlay ═══════════════════ */}
            {showChartEditor && !realCaseId && !casesLoading && (
                <div className="fixed inset-0 z-[200] bg-slate-100 flex items-center justify-center">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 max-w-md w-full mx-4 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
                            <FilePlus2 className="w-7 h-7 text-amber-600" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 mb-2">No Orthodontic Case Found</h3>
                        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                            Create an orthodontic case before using the chart editor,
                            bonding, TADs, or treatment sequence tools.
                        </p>
                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={() => setShowChartEditor(false)}
                                className="px-5 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    await handleCreateCase();
                                    // Chart editor will re-render with realCaseId populated
                                }}
                                disabled={isCreatingCase}
                                className="px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all shadow-sm shadow-blue-600/20 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isCreatingCase && <Loader2 className="w-4 h-4 animate-spin" />}
                                Create Case
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showChartEditor && (realCaseId || casesLoading) && (
                <TimeProvider>
                    <Suspense fallback={<ChartLoadingFallback />}>
                        <LazySnapshotEditor
                            appointment={appointment}
                            caseId={realCaseId}
                            onBack={() => setShowChartEditor(false)}
                            onSave={handleSaveSnapshot}
                        />
                    </Suspense>
                </TimeProvider>
            )}

            {/* ══ Cast Analysis Modal ══════════════════════════════════ */}
            {showCastAnalysis && (
                <Suspense fallback={<ChartLoadingFallback />}>
                    <LazyCastAnalysisModal
                        patientId={patientId || 'unknown'}
                        caseId={realCaseId || undefined}
                        onClose={() => setShowCastAnalysis(false)}
                    />
                </Suspense>
            )}

            {/* Error Modal */}
            {isErrorModalOpen && (
                <AppModal
                    isOpen={isErrorModalOpen}
                    onClose={() => setIsErrorModalOpen(false)}
                    title="Error"
                    message={errorModalMessage}
                    variant="danger"
                />
            )}
        </>
    );
}

/* ─── Sub-Components ─────────────────────────────────────────────── */

function StatCard({ icon, iconBg, label, value }) {
    return (
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
                {icon}
            </div>
            <div>
                <p className="text-xs text-gray-500 font-medium">{label}</p>
                <p className="text-sm font-medium text-slate-900">{value}</p>
            </div>
        </div>
    );
}

function ToothGridPreview() {
    /* Simple anatomical chart preview matching the mockup */
    const upper = [
        'primary/20', 'primary/20', 'primary', 'primary',
        'primary', 'primary', 'primary/20', 'primary/20',
    ];
    const lower = [
        'slate-200', 'slate-200', 'primary/60', 'primary/60',
        'primary/60', 'primary/60', 'slate-200', 'slate-200',
    ];

    return (
        <>
            <div className="grid grid-cols-8 gap-1 mb-2">
                {upper.map((color, i) => (
                    <div
                        key={`u${i}`}
                        className={`w-4 h-4 rounded-sm border ${
                            color === 'primary'
                                ? 'bg-blue-600 border-blue-600'
                                : color === 'primary/20'
                                    ? 'bg-blue-100 border-blue-200'
                                    : 'bg-slate-200 border-slate-300'
                        }`}
                    />
                ))}
            </div>
            <div className="grid grid-cols-8 gap-1">
                {lower.map((color, i) => (
                    <div
                        key={`l${i}`}
                        className={`w-4 h-4 rounded-sm ${
                            color === 'primary/60'
                                ? 'bg-blue-400'
                                : 'bg-slate-200'
                        }`}
                    />
                ))}
            </div>
        </>
    );
}
