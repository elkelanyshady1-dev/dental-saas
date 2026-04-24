/**
 * DashboardPage.jsx
 * v22.0 — Enterprise Cockpit Theme
 *
 * Fetches real-time data from:
 *   GET /api/platform/analytics        → stat cards
 *   GET /api/platform/analytics/events  → recent activity
 *
 * RBAC: VIEW_PLATFORM_ANALYTICS
 */

import React, { useState, useEffect } from 'react';
import {
    Building2,
    Users,
    Activity,
    Clock,
    AlertTriangle,
    Loader2,
    RefreshCw,
    ArrowUpRight,
    Shield,
    Zap,
    Server,
    TrendingUp,
    Database,
    LogIn,
    Plus,
    Pencil,
    Trash2,
    CreditCard,
    ShieldAlert,
    KeyRound,
    Globe,
    Info,
    Mail
} from 'lucide-react';
import platformApi from '../auth/platformApi';
import RequireCapability from '../core/guards/RequireCapability';
import Card, { CardHeader } from '../core/ui/Card';
import { LiveBadge } from '../core/ui/StatusBadge';
import { AlertBanner } from '../core/ui/Feedback';
import EmailQueueWidget from './EmailQueueWidget';
import { BRAND } from '@/config/brand';

// ─── Skeleton Loader ──────────────────────────────────────────────────────────
const StatSkeleton = () => (
    <Card>
        <div className="flex items-center justify-between mb-5">
            <div className="w-10 h-10 rounded-xl bg-slate-100 animate-pulse" />
            <div className="w-12 h-5 rounded-full bg-slate-100 animate-pulse" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-slate-100 animate-pulse mb-2" />
        <div className="h-4 w-36 rounded bg-slate-100 animate-pulse" />
    </Card>
);

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, icon: Icon, color, subtitle }) => {
    const colorMap = {
        blue: { bg: 'bg-blue-50', icon: 'text-blue-600', border: 'border-blue-100' },
        emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-emerald-100' },
        indigo: { bg: 'bg-indigo-50', icon: 'text-indigo-600', border: 'border-indigo-100' },
        amber: { bg: 'bg-amber-50', icon: 'text-amber-600', border: 'border-amber-100' },
        violet: { bg: 'bg-violet-50', icon: 'text-violet-600', border: 'border-violet-100' },
    };
    const c = colorMap[color] || colorMap.blue;

    return (
        <Card className="group">
            <div className="flex items-center justify-between mb-5">
                <div className={`p-2.5 rounded-xl ${c.bg} ${c.border} border group-hover:scale-105 transition-transform duration-200`}>
                    <Icon className={`w-5 h-5 ${c.icon}`} />
                </div>
                <LiveBadge />
            </div>
            <div className="text-3xl font-semibold text-slate-900 mb-1 tracking-tight">{value}</div>
            <div className="text-sm text-slate-500">{label}</div>
            {subtitle && (
                <div className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-blue-400" />
                    {subtitle}
                </div>
            )}
        </Card>
    );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const secs = Math.floor(diff / 1000);
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (secs < 30) return 'Just now';
    if (mins < 1) return `${secs}s ago`;
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
}

// ─── Category config (light-theme palette) ────────────────────────────────────────────────
const CATEGORY_CFG = {
    auth: { label: 'Auth', icon: LogIn, badge: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', icon: '#2563eb' } },
    data: { label: 'Data', icon: Plus, badge: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0', icon: '#16a34a' } },
    billing: { label: 'Billing', icon: CreditCard, badge: { bg: '#faf5ff', color: '#7e22ce', border: '#e9d5ff', icon: '#9333ea' } },
    security: { label: 'Security', icon: ShieldAlert, badge: { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', icon: '#dc2626' } },
    danger: { label: 'Delete', icon: Trash2, badge: { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa', icon: '#ea580c' } },
};

function getCategoryCfg(category, action) {
    if (CATEGORY_CFG[category]) return CATEGORY_CFG[category];
    const upper = (action || '').toUpperCase();
    if (upper.includes('UPDATE') || upper.includes('EDIT')) return { label: 'Update', icon: Pencil, badge: { bg: '#fffbeb', color: '#92400e', border: '#fde68a', icon: '#d97706' } };
    if (upper.includes('TOKEN') || upper.includes('LOGIN')) return CATEGORY_CFG.auth;
    return { label: 'Event', icon: Info, badge: { bg: '#f8fafc', color: '#475569', border: '#e2e8f0', icon: '#64748b' } };
}

// ─── Event Row ────────────────────────────────────────────────────────────────
const EventRow = ({ event }) => {
    const cfg = getCategoryCfg(event.category, event.action);
    const Icon = cfg.icon;
    const isAuth = event.category === 'auth' || event.category === 'security';

    // Skip ::1 (loopback) — only show real IPs
    const ip = event.ipAddress && !['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(event.ipAddress)
        ? event.ipAddress : null;

    return (
        <div
            style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                padding: '0.5rem 0.5rem', borderRadius: '8px', cursor: 'default',
                transition: 'background 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
            {/* ── Icon chip ── */}
            <div style={{
                flexShrink: 0, marginTop: '2px',
                width: '28px', height: '28px', borderRadius: '7px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: cfg.badge.bg,
                border: `1px solid ${cfg.badge.border}`,
            }}>
                <Icon size={13} style={{ color: cfg.badge.icon }} />
            </div>

            {/* ── Text ── */}
            <div style={{ flex: 1, minWidth: 0 }}>

                {/* Line 1 — message + badge */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', flexWrap: 'nowrap' }}>
                    <span style={{
                        fontSize: '0.8125rem',   /* 13px */
                        fontWeight: 500,
                        color: '#0f172a',        /* slate-950 — very dark, high contrast on white */
                        lineHeight: 1.35,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flexShrink: 1,
                        minWidth: 0,
                    }}>
                        {event.message || event.actionLabel || event.action || '—'}
                    </span>
                    <span style={{
                        flexShrink: 0,
                        padding: '1px 6px',
                        borderRadius: '999px',
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.07em',
                        lineHeight: '1.6',
                        background: cfg.badge.bg,
                        color: cfg.badge.color,
                        border: `1px solid ${cfg.badge.border}`,
                    }}>
                        {cfg.label}
                    </span>
                </div>

                {/* Line 2 — org • branch */}
                {(event.organizationName || event.branchName) && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.25rem',
                        marginTop: '1px',
                        fontSize: '0.72rem', color: '#64748b',  /* slate-500 */
                        fontWeight: 400,
                    }}>
                        {event.organizationName && (
                            <><Globe size={9} style={{ color: '#94a3b8' }} />
                                <span>{event.organizationName}</span></>
                        )}
                        {event.organizationName && event.branchName && <span>·</span>}
                        {event.branchName && <span>{event.branchName}</span>}
                    </div>
                )}

                {/* Line 3 — timestamp [+ IP for auth/security] */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    marginTop: '2px',
                    fontSize: '0.7rem', color: '#94a3b8',  /* slate-400 */
                }}>
                    <Clock size={9} style={{ color: '#cbd5e1' }} />
                    <span>{timeAgo(event.timestamp || event.createdAt)}</span>
                    {isAuth && ip && (
                        <span style={{ fontFamily: 'ui-monospace, monospace', color: '#94a3b8' }}>
                            · IP {ip}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── System Health Badge ──────────────────────────────────────────────────────
const HealthBadge = ({ health }) => {
    if (!health) return null;
    const isUp = health.status === 'operational' && health.dbConnected;
    const uptimeHrs = health.uptime ? Math.floor(health.uptime / 3600) : 0;
    const uptimeMins = health.uptime ? Math.floor((health.uptime % 3600) / 60) : 0;

    return (
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${isUp
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-red-50 border-red-200 text-red-700'
            }`}>
            <span className={`w-2 h-2 rounded-full ${isUp ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            {isUp ? 'All Systems Operational' : 'Degraded'}
            <span className="text-slate-400 ml-1 font-normal">
                {uptimeHrs}h {uptimeMins}m uptime
            </span>
        </div>
    );
};

// ─── Main Dashboard Content ───────────────────────────────────────────────────
const DashboardPageContent = () => {
    const [analytics, setAnalytics] = useState(null);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [eventsLoading, setEventsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    const fetchAnalytics = async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        try {
            const res = await platformApi.get('/analytics');
            setAnalytics(res.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load analytics');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const fetchEvents = async () => {
        setEventsLoading(true);
        try {
            const res = await platformApi.get('/analytics/events?limit=15');
            setEvents(res.data?.data || []);
        } catch {
            // Non-critical — dashboard still works without events
        } finally {
            setEventsLoading(false);
        }
    };

    useEffect(() => {
        fetchAnalytics();
        fetchEvents();
    }, []);

    const formatNumber = (n) => {
        if (n == null) return '—';
        return Number(n).toLocaleString();
    };

    const totals = analytics?.totals || {};
    const growth = analytics?.growth || {};
    const health = analytics?.systemHealth;

    return (
        <div className="space-y-8">
            {/* ── Page Header ─────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900 mb-1 flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-blue-50 border border-blue-100">
                            <Zap className="w-5 h-5 text-blue-600" />
                        </div>
                        Platform Overview
                    </h1>
                    <p className="text-slate-500 text-sm ml-[52px]">{BRAND.platform.tagline}</p>
                </div>
                <div className="flex items-center gap-3">
                    <HealthBadge health={health} />
                    <button
                        onClick={() => { fetchAnalytics(true); fetchEvents(); }}
                        disabled={refreshing}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl transition-all disabled:opacity-50 shadow-sm"
                        title="Refresh data"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-500' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* ── Error Banner ─────────────────────────────────────────── */}
            <AlertBanner
                variant="error"
                message={error}
                action={error ? { label: "Retry →", onClick: () => fetchAnalytics(true) } : null}
            />

            {/* ── KPI Cards ────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {loading ? (
                    <>
                        <StatSkeleton />
                        <StatSkeleton />
                        <StatSkeleton />
                        <StatSkeleton />
                    </>
                ) : (
                    <>
                        <StatCard
                            label="Total Organizations"
                            value={formatNumber(totals.organizations)}
                            icon={Building2}
                            color="blue"
                            subtitle={growth.newOrganizationsToday > 0
                                ? `+${growth.newOrganizationsToday} today`
                                : `${formatNumber(totals.activeOrganizations)} active`}
                        />
                        <StatCard
                            label="Total Tenant Users"
                            value={formatNumber(totals.users)}
                            icon={Users}
                            color="emerald"
                            subtitle={`Across ${formatNumber(totals.branches)} branches`}
                        />
                        <StatCard
                            label="Total Patients"
                            value={formatNumber(totals.patients)}
                            icon={Activity}
                            color="indigo"
                            subtitle={`${formatNumber(totals.appointments)} appointments`}
                        />
                        <StatCard
                            label="System Health"
                            value={health?.status === 'operational' ? '100%' : 'Degraded'}
                            icon={Database}
                            color="emerald"
                            subtitle={health?.dbConnected ? 'DB Connected' : 'DB Issue'}
                        />
                    </>
                )}
            </div>

            {/* ── Lower Grid ───────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Quick Stats Panel */}
                <Card className="lg:col-span-1">
                    <CardHeader title="Quick Stats" icon={Server} />
                    <div className="divide-y divide-slate-100">
                        {[
                            { label: 'Active Orgs', value: formatNumber(totals.activeOrganizations), icon: Building2, color: 'text-blue-500' },
                            { label: 'Branches', value: formatNumber(totals.branches), icon: Shield, color: 'text-indigo-500' },
                            { label: 'Users', value: formatNumber(totals.users), icon: Users, color: 'text-emerald-500' },
                            { label: 'Patients', value: formatNumber(totals.patients), icon: ArrowUpRight, color: 'text-amber-500' },
                            { label: 'Appointments', value: formatNumber(totals.appointments), icon: Activity, color: 'text-violet-500' },
                            { label: 'New Today', value: formatNumber(growth.newOrganizationsToday), icon: Zap, color: 'text-cyan-500' },
                        ].map(({ label, value, icon: Ic, color }) => (
                            <div
                                key={label}
                                className="flex items-center justify-between py-3 hover:bg-blue-50/40 -mx-2 px-2 rounded-lg transition-colors cursor-default"
                            >
                                <div className="flex items-center gap-2.5">
                                    <Ic className={`w-3.5 h-3.5 ${color}`} />
                                    <span className="text-sm text-slate-500">{label}</span>
                                </div>
                                <span className="text-sm font-medium text-slate-900">
                                    {loading ? <span className="text-slate-300">—</span> : value}
                                </span>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Recent Activity Panel */}
                <Card className="lg:col-span-2 flex flex-col" style={{ maxHeight: '480px' }}>
                    <CardHeader
                        title="Recent Activity"
                        icon={Clock}
                        action={<span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last {events.length} events</span>}
                    />
                    <div className="flex-1 overflow-y-auto space-y-0.5 pr-1">
                        {eventsLoading ? (
                            <div className="flex items-center justify-center h-full py-16">
                                <div className="flex flex-col items-center gap-3">
                                    <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                                    <span className="text-xs text-slate-400">Loading events…</span>
                                </div>
                            </div>
                        ) : events.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full py-16 text-slate-400">
                                <Clock className="w-10 h-10 mb-3 opacity-20" />
                                <p className="text-sm font-medium text-slate-500">No recent events recorded</p>
                                <p className="text-xs text-slate-400 mt-1">Activity will appear here</p>
                            </div>
                        ) : (
                            events.map((event, i) => (
                                <EventRow key={event._id || i} event={event} />
                            ))
                        )}
                    </div>
                </Card>
            </div>

            {/* ── Infrastructure Section ─────────────────────────────────── */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <div style={{ padding: '6px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                        <Mail style={{ width: '14px', height: '14px', color: '#16a34a' }} />
                    </div>
                    <h2 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Infrastructure</h2>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 500 }}>Email queue health · auto-refreshes every 30s</span>
                </div>
                <EmailQueueWidget />
            </div>
        </div>
    );
};

export default function DashboardPage() {
    return (
        <RequireCapability permission="VIEW_PLATFORM_ANALYTICS">
            <DashboardPageContent />
        </RequireCapability>
    );
}
