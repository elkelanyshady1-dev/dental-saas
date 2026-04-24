import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    ServerCrash, AlertTriangle, Clock, Loader2, RefreshCw,
    X, ChevronLeft, ChevronRight, Search, RotateCcw, Eye, Play
} from 'lucide-react';
import platformApi from '@/platform/auth/platformApi';

// ─── API Layer ────────────────────────────────────────────────────────────────

// NOTE: platformApi baseURL is already '/api/platform' — do NOT re-prefix with '/platform'.
const getOutboxHealth = () => platformApi.get('/outbox/health');
const getFailedEvents = (params) => platformApi.get('/dlq/events', { params });
const replayEvent = (id) => platformApi.post(`/dlq/replay/${id}`);

// ─── Backend → UI normalization ───────────────────────────────────────────────
// Backend DTO (listFailedEvents): { _id, dbLabel, orgId, eventType, aggregateType,
//   aggregateId, failureCategory, failureReason, errorMessage, retryCount,
//   maxRetries, failedAt, lastAttemptAt, createdAt, dlq: { replayCount, replayHistory } }
function normalizeEvent(d) {
    return {
        id: String(d._id ?? d.id ?? ''),
        eventType: d.eventType ?? '—',
        organizationId: d.orgId ?? d.organizationId ?? 'platform',
        failureCategory: d.failureCategory ?? 'UNKNOWN',
        failureReason: d.failureReason ?? '',
        attempts: d.retryCount ?? d.attempts ?? 0,
        maxAttempts: d.maxRetries ?? d.maxAttempts ?? 5,
        failedAt: d.failedAt ?? d.createdAt ?? null,
        replayCount: d.dlq?.replayCount ?? 0,
        payload: d.payload ?? null,
        errorMessage: d.errorMessage ?? '',
        errorStack: d.errorStack ?? null,
        errorHistory: Array.isArray(d.errorHistory) ? d.errorHistory : [],
        replayHistory: Array.isArray(d.dlq?.replayHistory)
            ? d.dlq.replayHistory.map(h => ({
                timestamp: h.replayedAt ?? h.timestamp ?? null,
                operator: h.actorId ?? h.operator ?? '—',
                result: String(h.result ?? 'PENDING').toUpperCase(),
            }))
            : [],
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_COLORS = {
    NETWORK_ERROR: { bg: 'rgba(239,68,68,0.15)', text: '#f87171' },
    VALIDATION_ERROR: { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24' },
    TIMEOUT: { bg: 'rgba(249,115,22,0.15)', text: '#fb923c' },
    SERIALIZATION_ERROR: { bg: 'rgba(168,85,247,0.15)', text: '#c084fc' },
    UNKNOWN: { bg: 'rgba(100,116,139,0.2)', text: '#94a3b8' },
};

function formatDate(iso) {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

const CARD_CONFIGS = [
    { key: 'failed', label: 'Failed Events', color: '#ef4444', bg: 'rgba(239,68,68,0.06)', Icon: AlertTriangle },
    { key: 'pending', label: 'Pending Events', color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', Icon: Clock },
    { key: 'processing', label: 'Processing', color: '#3b82f6', bg: 'rgba(59,130,246,0.06)', Icon: Loader2 },
    { key: 'stuck', label: 'Stuck (>5min)', color: '#f97316', bg: 'rgba(249,115,22,0.06)', Icon: ServerCrash },
];

function SummaryCards({ health, isLoading }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1.25rem', marginBottom: '1.75rem' }}>
            {CARD_CONFIGS.map(({ key, label, color, bg, Icon }) => (
                <div
                    key={key}
                    style={{ backgroundColor: '#1e293b', borderRadius: '1rem', padding: '1.5rem', position: 'relative', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.25)', transition: 'transform 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', backgroundColor: color, borderRadius: '1rem 1rem 0 0' }} />
                    <div style={{ position: 'absolute', inset: 0, backgroundColor: bg, pointerEvents: 'none' }} />
                    <div style={{ position: 'relative', zIndex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#94a3b8' }}>{label}</span>
                            <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Icon size={18} color={color} />
                            </div>
                        </div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 800, color: isLoading ? '#64748b' : color, letterSpacing: '-0.02em', lineHeight: 1 }}>
                            {isLoading ? '–' : (health?.[key] ?? 0).toLocaleString()}
                        </div>
                        <div style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: '#64748b' }}>as of now</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Event Details Drawer ─────────────────────────────────────────────────────

function EventDetailsDrawer({ event, onClose, onReplay }) {
    const [tab, setTab] = useState('payload');

    if (!event) return null;

    const tabs = [
        { id: 'payload', label: 'Payload' },
        { id: 'error', label: 'Error' },
        { id: 'history', label: 'Replay History' },
    ];

    return (
        <>
            <div id="drawer-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 40 }} />
            <div id="event-details-drawer" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, backgroundColor: '#1e293b', boxShadow: '-8px 0 40px rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif' }}>
                {/* Header */}
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(51,65,85,0.5)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.25rem' }}>Event Details</div>
                        <code style={{ fontSize: '0.75rem', color: '#60a5fa', backgroundColor: 'rgba(59,130,246,0.1)', padding: '0.2rem 0.5rem', borderRadius: 4 }}>{event.eventType}</code>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button id="drawer-replay-btn" onClick={onReplay} style={{ backgroundColor: 'rgba(16,185,129,0.15)', color: '#34d399', border: 'none', borderRadius: '0.5rem', padding: '0.375rem 0.875rem', fontSize: '0.8125rem', fontWeight: 500, cursor: 'pointer' }}>Replay</button>
                        <button id="drawer-close-btn" onClick={onClose} style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: 'none', borderRadius: '0.5rem', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
                    </div>
                </div>

                {/* Meta */}
                <div style={{ padding: '1rem 1.5rem', backgroundColor: '#172033', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    {[['Organization', event.organizationId], ['Attempts', `${event.attempts}/${event.maxAttempts}`], ['Replay Count', String(event.replayCount)], ['Failed At', formatDate(event.failedAt)]].map(([label, value]) => (
                        <div key={label}>
                            <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.15rem' }}>{label}</div>
                            <div style={{ fontSize: '0.8125rem', color: '#e2e8f0', fontWeight: 500 }}>{value}</div>
                        </div>
                    ))}
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', padding: '0 1rem', borderBottom: '1px solid rgba(51,65,85,0.5)' }}>
                    {tabs.map(t => (
                        <button key={t.id} id={`tab-${t.id}`} onClick={() => setTab(t.id)} style={{ background: 'none', border: 'none', borderBottom: tab === t.id ? '2px solid #3b82f6' : '2px solid transparent', color: tab === t.id ? '#60a5fa' : '#64748b', padding: '0.625rem 1rem', fontSize: '0.875rem', fontWeight: tab === t.id ? 600 : 400, cursor: 'pointer', marginBottom: '-1px' }}>{t.label}</button>
                    ))}
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
                    {tab === 'payload' && (
                        <pre id="drawer-payload-content" style={{ backgroundColor: '#0f172a', borderRadius: '0.75rem', padding: '1rem', fontSize: '0.8rem', color: '#94d2bd', fontFamily: 'Consolas, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.7, margin: 0 }}>
                            {JSON.stringify(event.payload, null, 2)}
                        </pre>
                    )}
                    {tab === 'error' && (
                        <div id="drawer-error-content">
                            <div style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem' }}>
                                <div style={{ fontSize: '0.7rem', color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Error Message</div>
                                <p style={{ margin: 0, fontSize: '0.875rem', color: '#fca5a5', fontFamily: 'monospace' }}>{event.errorMessage}</p>
                            </div>
                            {event.errorStack && (
                                <pre style={{ backgroundColor: '#0f172a', borderRadius: '0.75rem', padding: '1rem', fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'Consolas, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6, margin: 0 }}>{event.errorStack}</pre>
                            )}
                        </div>
                    )}
                    {tab === 'history' && (
                        <div id="drawer-history-content">
                            {event.replayHistory.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b', fontSize: '0.875rem' }}>No replay history for this event.</div>
                            ) : event.replayHistory.map((entry, idx) => (
                                <div key={idx} style={{ backgroundColor: '#162032', borderRadius: '0.75rem', padding: '1rem', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '0.8125rem', color: '#e2e8f0', marginBottom: '0.25rem' }}>{entry.operator}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{formatDate(entry.timestamp)}</div>
                                    </div>
                                    <span style={{ padding: '0.25rem 0.625rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600, backgroundColor: entry.result === 'SUCCESS' ? 'rgba(16,185,129,0.15)' : entry.result === 'PENDING' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)', color: entry.result === 'SUCCESS' ? '#34d399' : entry.result === 'PENDING' ? '#fbbf24' : '#f87171' }}>{entry.result}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

// ─── Replay Modal ─────────────────────────────────────────────────────────────

function ReplayModal({ event, onClose, onConfirm, isLoading, isSuccess, isError }) {
    useEffect(() => {
        if (isSuccess) { const t = setTimeout(onClose, 1800); return () => clearTimeout(t); }
    }, [isSuccess, onClose]);

    if (!event) return null;

    return (
        <div id="modal-backdrop" onClick={!isLoading ? onClose : undefined} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div id="replay-modal" onClick={e => e.stopPropagation()} style={{ backgroundColor: '#1e293b', borderRadius: '1.25rem', padding: '2rem', width: 480, maxWidth: 'calc(100vw - 2rem)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)', fontFamily: 'Inter, sans-serif' }}>
                {isSuccess ? (
                    <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                            <Play size={24} color="#34d399" />
                        </div>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#e2e8f0', margin: '0 0 0.5rem' }}>Replay Queued</h3>
                        <p style={{ fontSize: '0.875rem', color: '#64748b', margin: 0 }}>Event submitted to the outbox pipeline successfully.</p>
                    </div>
                ) : (
                    <>
                        {isError && (
                            <div style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                <AlertTriangle size={18} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />
                                <p style={{ margin: 0, fontSize: '0.875rem', color: '#fca5a5' }}>Replay failed. Check error logs and try again.</p>
                            </div>
                        )}
                        <div style={{ width: 48, height: 48, borderRadius: '0.875rem', backgroundColor: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem' }}>
                            <RotateCcw size={22} color="#34d399" />
                        </div>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#e2e8f0', margin: '0 0 0.5rem' }}>Confirm Event Replay</h3>
                        <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: '0 0 1.25rem', lineHeight: 1.6 }}>Are you sure you want to replay this event? It will be submitted to the DLQ outbox pipeline.<br /><strong style={{ color: '#cbd5e1' }}>This action cannot be undone.</strong></p>
                        <div style={{ backgroundColor: '#162032', borderRadius: '0.75rem', padding: '0.875rem 1rem', marginBottom: '1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
                            {[['Event Type', event.eventType], ['Organization', event.organizationId], ['Category', event.failureCategory], ['Attempts', `${event.attempts}/${event.maxAttempts}`]].map(([label, value]) => (
                                <div key={label}>
                                    <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.15rem' }}>{label}</div>
                                    <div style={{ fontSize: '0.8125rem', color: '#e2e8f0', fontFamily: 'monospace' }}>{value}</div>
                                </div>
                            ))}
                        </div>
                        <div style={{ backgroundColor: 'rgba(59,130,246,0.06)', borderRadius: '0.625rem', padding: '0.75rem 1rem', marginBottom: '1.5rem', fontSize: '0.8rem', color: '#93c5fd', lineHeight: 1.5 }}>
                            🔒 Routes through <code style={{ backgroundColor: 'rgba(255,255,255,0.08)', padding: '0 4px', borderRadius: 3 }}>POST /api/platform/dlq/replay/:id</code> only. No direct DB mutations.
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button id="modal-cancel-btn" onClick={onClose} disabled={isLoading} style={{ backgroundColor: '#334155', color: '#94a3b8', border: 'none', borderRadius: '0.75rem', padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontWeight: 500, cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.5 : 1 }}>Cancel</button>
                            <button id="modal-confirm-replay-btn" onClick={onConfirm} disabled={isLoading} style={{ background: 'linear-gradient(135deg,#10b981 0%,#059669 100%)', color: '#fff', border: 'none', borderRadius: '0.75rem', padding: '0.625rem 1.5rem', fontSize: '0.875rem', fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: isLoading ? 0.8 : 1 }}>
                                {isLoading ? <><Loader2 size={14} className="animate-spin" />Replaying…</> : 'Confirm Replay'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EventSystemPage() {
    const queryClient = useQueryClient();
    const [filters, setFilters] = useState({ eventType: '', failureCategory: '', organizationId: '' });
    const [page, setPage] = useState(1);
    const [drawerEvent, setDrawerEvent] = useState(null);
    const [modalEvent, setModalEvent] = useState(null);

    // Summary health — real backend only
    const {
        data: healthData,
        isLoading: healthLoading,
        isError: healthIsError,
        refetch: refetchHealth,
    } = useQuery({
        queryKey: ['outbox-health'],
        queryFn: async () => {
            const r = await getOutboxHealth();
            const body = r.data?.data ?? r.data ?? {};
            return {
                failed: body.failed ?? 0,
                pending: body.pending ?? 0,
                processing: body.processing ?? 0,
                stuck: body.stuck ?? body.stuckProcessing ?? 0,
            };
        },
        refetchInterval: 30_000,
        staleTime: 20_000,
    });

    // Events list — server-side filtering. Backend supports: eventType,
    // failureCategory, orgId, limit. No server pagination yet → request one
    // page-sized window.
    const params = {
        limit: 10,
        ...(filters.eventType && { eventType: filters.eventType }),
        ...(filters.failureCategory && { failureCategory: filters.failureCategory }),
        ...(filters.organizationId && { orgId: filters.organizationId }),
    };
    const {
        data: eventsData,
        isLoading: eventsLoading,
        isError: eventsIsError,
    } = useQuery({
        queryKey: ['dlq-events', params],
        queryFn: async () => {
            const r = await getFailedEvents(params);
            const body = r.data?.data ?? r.data ?? {};
            const rawList = Array.isArray(body.events)
                ? body.events
                : Array.isArray(body.data)
                    ? body.data
                    : Array.isArray(body)
                        ? body
                        : [];
            return {
                events: rawList.map(normalizeEvent),
                total: body.total ?? rawList.length,
            };
        },
        staleTime: 15_000,
    });

    // Replay mutation
    const replayMutation = useMutation({
        mutationFn: (id) => replayEvent(id).then(r => r.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dlq-events'] });
            queryClient.invalidateQueries({ queryKey: ['outbox-health'] });
        },
    });

    const health = healthData ?? { failed: 0, pending: 0, processing: 0, stuck: 0 };
    const events = eventsData?.events ?? [];
    const total = eventsData?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / 10));

    // Server already applies filters — render as-is.
    const filteredEvents = events;

    const handleReplay = useCallback(async () => {
        if (!modalEvent) return;
        await replayMutation.mutateAsync(modalEvent.id);
    }, [modalEvent, replayMutation]);

    const inputStyle = { backgroundColor: '#1e293b', border: 'none', borderRadius: '0.625rem', color: '#e2e8f0', padding: '0.5625rem 0.875rem', fontSize: '0.875rem', width: '100%', outline: 'none' };
    const headerCellStyle = { padding: '0.75rem 1rem', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b', backgroundColor: '#0f172a', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 2 };

    return (
        <div id="event-system-page" style={{ minHeight: '100vh', backgroundColor: '#0f172a', padding: '2rem 2.5rem', fontFamily: 'Inter, sans-serif' }}>
            {/* Page Header */}
            <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#64748b' }}>
                        <span>Platform</span><span style={{ color: '#475569' }}>›</span><span style={{ color: '#94a3b8' }}>Infrastructure</span><span style={{ color: '#475569' }}>›</span><span style={{ color: '#94a3b8' }}>Event System</span>
                    </div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#e2e8f0', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>Event System Control</h1>
                    <p style={{ margin: '0.375rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>Dead Letter Queue &amp; Outbox Monitor</p>
                </div>
                <button
                    id="refresh-health-btn"
                    onClick={() => { refetchHealth(); queryClient.invalidateQueries({ queryKey: ['dlq-events'] }); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#1e293b', color: '#64748b', border: 'none', borderRadius: '0.75rem', padding: '0.5rem 1rem', fontSize: '0.8125rem', cursor: 'pointer', boxShadow: '0 2px 12px rgba(0,0,0,0.2)' }}
                >
                    <RefreshCw size={14} />
                    <span>Refresh</span>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#22c55e', boxShadow: '0 0 8px #22c55e', animation: 'pulse 2s infinite' }} />
                    <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
                </button>
            </div>

            {/* Summary Cards */}
            <SummaryCards health={health} isLoading={healthLoading} />

            {/* Section Label */}
            <h2 style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', margin: '0 0 1rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Dead Letter Queue</h2>

            {/* Filter Bar */}
            <div id="filters-bar" style={{ display: 'flex', gap: '0.875rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                    <Search size={14} color="#64748b" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    <input id="filter-event-type" placeholder="Search eventType…" value={filters.eventType} onChange={e => setFilters(p => ({ ...p, eventType: e.target.value }))} style={{ ...inputStyle, paddingLeft: '2.25rem' }} />
                </div>
                <div style={{ width: 220 }}>
                    <select id="filter-failure-category" value={filters.failureCategory} onChange={e => setFilters(p => ({ ...p, failureCategory: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="">All Categories</option>
                        <option value="SYSTEM_ERROR">SYSTEM_ERROR</option>
                        <option value="VALIDATION_ERROR">VALIDATION_ERROR</option>
                        <option value="DEPENDENCY_ERROR">DEPENDENCY_ERROR</option>
                        <option value="TIMEOUT">TIMEOUT</option>
                        <option value="UNHANDLED_EVENT">UNHANDLED_EVENT</option>
                        <option value="POISON_EVENT">POISON_EVENT</option>
                        <option value="SECURITY_BLOCKED">SECURITY_BLOCKED</option>
                    </select>
                </div>
                <div style={{ width: 220 }}>
                    <input
                        id="filter-organization"
                        placeholder="Org id or 'platform'"
                        value={filters.organizationId}
                        onChange={e => setFilters(p => ({ ...p, organizationId: e.target.value }))}
                        style={inputStyle}
                    />
                </div>
                <button id="filter-reset-btn" onClick={() => { setFilters({ eventType: '', failureCategory: '', organizationId: '' }); setPage(1); }} style={{ backgroundColor: '#334155', color: '#94a3b8', border: 'none', borderRadius: '0.625rem', padding: '0.5625rem 1.125rem', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>Reset</button>
            </div>

            {/* Table */}
            <div style={{ backgroundColor: '#1e293b', borderRadius: '1rem', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }}>
                <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
                    <table id="failed-events-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                {[['eventType', 'left'], ['organizationId', 'left'], ['failureCategory', 'left'], ['Reason', 'left'], ['Attempts', 'center'], ['Failed At', 'left'], ['Replays', 'center'], ['Actions', 'right']].map(([col, align]) => (
                                    <th key={col} style={{ ...headerCellStyle, textAlign: align }}>{col}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {eventsLoading ? (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}><Loader2 size={20} className="animate-spin" style={{ display: 'inline', marginRight: 8 }} />Loading events…</td></tr>
                            ) : filteredEvents.length === 0 ? (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: '#64748b', fontSize: '0.875rem' }}>No events match the current filters.</td></tr>
                            ) : filteredEvents.map((event, idx) => {
                                const catColors = CATEGORY_COLORS[event.failureCategory] ?? CATEGORY_COLORS.UNKNOWN;
                                return (
                                    <tr key={event.id} id={`event-row-${event.id}`} style={{ backgroundColor: idx % 2 === 0 ? '#1e293b' : '#192236', transition: 'background 0.12s' }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#293548'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#1e293b' : '#192236'}
                                    >
                                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                                            <span style={{ padding: '0.25rem 0.625rem', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600, backgroundColor: 'rgba(59,130,246,0.12)', color: '#60a5fa', fontFamily: 'monospace' }}>{event.eventType}</span>
                                        </td>
                                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                                            <span style={{ fontSize: '0.8125rem', color: '#94a3b8', fontFamily: 'monospace' }}>{event.organizationId}</span>
                                        </td>
                                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                                            <span style={{ padding: '0.25rem 0.625rem', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600, backgroundColor: catColors.bg, color: catColors.text }}>{event.failureCategory}</span>
                                        </td>
                                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle', maxWidth: 220 }}>
                                            <span style={{ fontSize: '0.8125rem', color: '#e2e8f0', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={event.failureReason}>{event.failureReason}</span>
                                        </td>
                                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle', textAlign: 'center' }}>
                                            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: event.attempts >= event.maxAttempts ? '#ef4444' : '#94a3b8' }}>{event.attempts}/{event.maxAttempts}</span>
                                        </td>
                                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                                            <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>{formatDate(event.failedAt)}</span>
                                        </td>
                                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle', textAlign: 'center' }}>
                                            <span style={{ fontSize: '0.8125rem', color: event.replayCount > 0 ? '#60a5fa' : '#475569' }}>{event.replayCount}</span>
                                        </td>
                                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                <button id={`btn-view-${event.id}`} onClick={() => setDrawerEvent(event)} style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'none', borderRadius: '0.5rem', padding: '0.375rem 0.75rem', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Eye size={12} />View
                                                </button>
                                                <button id={`btn-replay-${event.id}`} onClick={() => { setModalEvent(event); replayMutation.reset(); }} style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#34d399', border: 'none', borderRadius: '0.5rem', padding: '0.375rem 0.75rem', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <RotateCcw size={12} />Replay
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.25rem', borderTop: '1px solid rgba(51,65,85,0.5)' }}>
                    <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Showing {filteredEvents.length} of {total} events</span>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button id="pagination-prev" disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ backgroundColor: page <= 1 ? '#1e293b' : '#334155', color: page <= 1 ? '#475569' : '#94a3b8', border: 'none', borderRadius: '0.5rem', padding: '0.375rem 0.75rem', fontSize: '0.8125rem', cursor: page <= 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <ChevronLeft size={14} />Prev
                        </button>
                        <span style={{ fontSize: '0.8125rem', color: '#94a3b8', padding: '0 0.5rem' }}>{page} / {totalPages}</span>
                        <button id="pagination-next" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ backgroundColor: page >= totalPages ? '#1e293b' : '#334155', color: page >= totalPages ? '#475569' : '#94a3b8', border: 'none', borderRadius: '0.5rem', padding: '0.375rem 0.75rem', fontSize: '0.8125rem', cursor: page >= totalPages ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            Next<ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Drawer */}
            {drawerEvent && (
                <EventDetailsDrawer
                    event={drawerEvent}
                    onClose={() => setDrawerEvent(null)}
                    onReplay={() => { setModalEvent(drawerEvent); setDrawerEvent(null); replayMutation.reset(); }}
                />
            )}

            {/* Replay Modal */}
            {modalEvent && (
                <ReplayModal
                    event={modalEvent}
                    onClose={() => setModalEvent(null)}
                    onConfirm={handleReplay}
                    isLoading={replayMutation.isPending}
                    isSuccess={replayMutation.isSuccess}
                    isError={replayMutation.isError}
                />
            )}
        </div>
    );
}
