/**
 * EmailQueueWidget.jsx
 * Platform Dashboard — Email Queue Health Card
 * v1.0
 *
 * Fetches real-time email queue metrics from:
 *   GET /api/platform/analytics/queue-metrics
 *   GET /api/platform/analytics/worker-health
 *
 * Auto-refreshes every 30 seconds.
 * Links to Bull Board dashboard for full job inspection.
 *
 * RBAC: VIEW_PLATFORM_ANALYTICS
 * PLANE: Platform
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Mail,
    CheckCircle2,
    XCircle,
    Clock,
    Zap,
    AlertTriangle,
    Loader2,
    ExternalLink,
    RefreshCw,
    Activity,
    Pause
} from 'lucide-react';
import platformApi from '../auth/platformApi';

// ─── Metric Pill ──────────────────────────────────────────────────────────────
const MetricPill = ({ label, value, icon: Icon, color, pulse = false, alert = false }) => {
    const colorMap = {
        slate: { bg: '#f8fafc', text: '#475569', border: '#e2e8f0', icon: '#94a3b8' },
        emerald: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0', icon: '#16a34a' },
        blue: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', icon: '#2563eb' },
        amber: { bg: '#fffbeb', text: '#b45309', border: '#fde68a', icon: '#d97706' },
        red: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca', icon: '#dc2626' },
        violet: { bg: '#faf5ff', text: '#7e22ce', border: '#e9d5ff', icon: '#9333ea' },
    };
    const c = colorMap[color] || colorMap.slate;

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
            padding: '10px 14px', borderRadius: '10px',
            background: c.bg, border: `1px solid ${c.border}`,
            minWidth: '72px', flex: 1,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                {alert && (
                    <span style={{
                        width: '6px', height: '6px', borderRadius: '50%',
                        background: '#ef4444',
                        animation: 'pulse 2s infinite',
                        flexShrink: 0,
                    }} />
                )}
                <Icon size={13} style={{ color: c.icon, flexShrink: 0 }} />
            </div>
            <span style={{ fontSize: '1.3rem', fontWeight: 700, color: c.text, lineHeight: 1 }}>
                {value ?? '—'}
            </span>
            <span style={{ fontSize: '0.62rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>
                {label}
            </span>
        </div>
    );
};

// ─── Worker + Redis status badge ──────────────────────────────────────────────
const StatusChip = ({ label, ok, loading }) => (
    <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        padding: '3px 10px', borderRadius: '999px',
        fontSize: '0.67rem', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        background: loading ? '#f8fafc' : ok ? '#f0fdf4' : '#fef2f2',
        color: loading ? '#94a3b8' : ok ? '#15803d' : '#b91c1c',
        border: `1px solid ${loading ? '#e2e8f0' : ok ? '#bbf7d0' : '#fecaca'}`,
    }}>
        {loading ? (
            <Loader2 size={9} style={{ animation: 'spin 1s linear infinite' }} />
        ) : (
            <span style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: ok ? '#22c55e' : '#ef4444',
                ...(ok ? { animation: 'pulse 2s infinite' } : {}),
            }} />
        )}
        {label}: {loading ? '…' : ok ? 'OK' : 'DOWN'}
    </div>
);

// ─── Main Widget ──────────────────────────────────────────────────────────────
export default function EmailQueueWidget() {
    const [metrics, setMetrics] = useState(null);
    const [health, setHealth] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    const fetchAll = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        try {
            const [mRes, hRes] = await Promise.all([
                platformApi.get('/analytics/queue-metrics'),
                platformApi.get('/analytics/worker-health'),
            ]);
            setMetrics(mRes.data);
            setHealth(hRes.data);
            setLastUpdated(new Date());
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load queue metrics');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // Initial load + auto-refresh every 30s
    useEffect(() => {
        fetchAll();
        const interval = setInterval(() => fetchAll(true), 30_000);
        return () => clearInterval(interval);
    }, [fetchAll]);

    const hasFailed = (metrics?.failed ?? 0) > 0;
    const isWorkerOk = health?.emailWorker === 'running';
    const isRedisOk = health?.redis === 'connected';
    const isHealthy = isWorkerOk && isRedisOk && !hasFailed;

    const formatTime = (d) => d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

    return (
        <div style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '20px 22px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
        }}>

            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: '34px', height: '34px', borderRadius: '10px',
                        background: hasFailed ? '#fef2f2' : '#f0fdf4',
                        border: `1px solid ${hasFailed ? '#fecaca' : '#bbf7d0'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Mail size={16} style={{ color: hasFailed ? '#dc2626' : '#16a34a' }} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>
                            Email Queue Health
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '1px' }}>
                            emailQueue · BullMQ · Redis
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Status chips */}
                    <StatusChip label="Worker" ok={isWorkerOk} loading={loading} />
                    <StatusChip label="Redis" ok={isRedisOk} loading={loading} />

                    {/* Refresh button */}
                    <button
                        onClick={() => fetchAll(true)}
                        disabled={refreshing || loading}
                        title="Refresh queue metrics"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '5px 10px', borderRadius: '8px', cursor: 'pointer',
                            background: '#f8fafc', border: '1px solid #e2e8f0',
                            color: '#64748b', fontSize: '0.72rem', fontWeight: 600,
                            opacity: (refreshing || loading) ? 0.5 : 1,
                            transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                        onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                    >
                        <RefreshCw size={11} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
                        Refresh
                    </button>

                    {/* Bull Board link */}
                    <a
                        href="/admin/queues"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open Bull Board queue dashboard"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '5px 12px', borderRadius: '8px',
                            background: '#eff6ff', border: '1px solid #bfdbfe',
                            color: '#1d4ed8', fontSize: '0.72rem', fontWeight: 700,
                            textDecoration: 'none', transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff'; }}
                    >
                        <ExternalLink size={11} />
                        Queue Dashboard
                    </a>
                </div>
            </div>

            {/* ── Error State ── */}
            {error && !loading && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '10px 14px', borderRadius: '8px',
                    background: '#fef2f2', border: '1px solid #fecaca',
                    color: '#b91c1c', fontSize: '0.78rem',
                }}>
                    <AlertTriangle size={14} />
                    {error}
                </div>
            )}

            {/* ── Metrics Grid ── */}
            {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', gap: '8px', color: '#94a3b8', fontSize: '0.8rem' }}>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Loading…
                </div>
            ) : (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <MetricPill
                        label="Waiting"
                        value={metrics?.waiting ?? 0}
                        icon={Clock}
                        color={metrics?.waiting > 0 ? 'amber' : 'slate'}
                    />
                    <MetricPill
                        label="Active"
                        value={metrics?.active ?? 0}
                        icon={Activity}
                        color={metrics?.active > 0 ? 'blue' : 'slate'}
                        pulse={metrics?.active > 0}
                    />
                    <MetricPill
                        label="Completed"
                        value={metrics?.completed ?? 0}
                        icon={CheckCircle2}
                        color="emerald"
                    />
                    <MetricPill
                        label="Failed"
                        value={metrics?.failed ?? 0}
                        icon={XCircle}
                        color={metrics?.failed > 0 ? 'red' : 'slate'}
                        alert={metrics?.failed > 0}
                    />
                    <MetricPill
                        label="Delayed"
                        value={metrics?.delayed ?? 0}
                        icon={Zap}
                        color={metrics?.delayed > 0 ? 'violet' : 'slate'}
                    />
                    <MetricPill
                        label="Paused"
                        value={metrics?.paused ?? 0}
                        icon={Pause}
                        color={metrics?.paused > 0 ? 'amber' : 'slate'}
                    />
                </div>
            )}

            {/* ── Failed jobs warning ── */}
            {!loading && hasFailed && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                    padding: '10px 14px', borderRadius: '8px',
                    background: '#fef2f2', border: '1px solid #fecaca',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertTriangle size={14} style={{ color: '#dc2626', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.78rem', color: '#b91c1c', fontWeight: 600 }}>
                            {metrics.failed} email job{metrics.failed !== 1 ? 's' : ''} failed — review and retry in Bull Board
                        </span>
                    </div>
                    <a
                        href="/admin/queues"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            fontSize: '0.72rem', fontWeight: 700, color: '#dc2626',
                            textDecoration: 'none', whiteSpace: 'nowrap',
                            display: 'flex', alignItems: 'center', gap: '4px',
                        }}
                    >
                        View Failed <ExternalLink size={10} />
                    </a>
                </div>
            )}

            {/* ── Footer: last updated + all-clear ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '0.67rem', color: '#cbd5e1' }}>
                    {lastUpdated ? `Updated ${formatTime(lastUpdated)} · auto-refreshes every 30s` : 'Loading…'}
                </span>
                {!loading && isHealthy && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.67rem', color: '#16a34a', fontWeight: 600 }}>
                        <CheckCircle2 size={11} />
                        All Clear
                    </div>
                )}
            </div>
        </div>
    );
}
