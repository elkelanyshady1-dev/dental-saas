/**
 * CommunicationCenterPage.jsx
 * Platform — Communication Infrastructure Admin Center
 * v1.0
 *
 * Tabs:
 *   Overview        — Channel health cards (Email / SMS / WhatsApp)
 *   Email Testing   — Test sends, template preview
 *   SMS Testing     — OTP / reminder test sends
 *   WhatsApp        — WA message tests
 *   Retry Analytics — Retry log table with DLQ filter
 *   Dead-Letter     — DLQ job inspector + retry action
 *   Queue Monitor   — Links to Bull Board
 *
 * RBAC: VIEW_COMMUNICATION_METRICS (read), MANAGE_COMMUNICATION (test sends)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Mail, MessageSquare, Phone, RefreshCw, AlertTriangle,
    CheckCircle2, XCircle, Activity, Loader2, ExternalLink,
    Send, FlaskConical, RotateCcw, Inbox, BarChart3,
    Zap, Clock, Archive, ChevronRight, Monitor, Wifi, WifiOff, TrendingUp
} from 'lucide-react';
import platformApi from '../auth/platformApi';
import { toast } from 'sonner';
import { getPlatformToken } from '../auth/PlatformAuthContext';
import RequireCapability from '../core/guards/RequireCapability';

// ─── Tab config ───────────────────────────────────────────────────────────────
const TABS = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'email', label: 'Email Lab', icon: Mail },
    { id: 'sms', label: 'SMS Lab', icon: MessageSquare },
    { id: 'whatsapp', label: 'WhatsApp Lab', icon: Phone },
    { id: 'inspector', label: 'Email Inspector', icon: FlaskConical },
    { id: 'monitoring', label: 'Monitoring', icon: Monitor },
    { id: 'retries', label: 'Retry Analytics', icon: RotateCcw },
    { id: 'dlq', label: 'Dead-Letter', icon: Inbox },
];

// ─── Shared metric card ───────────────────────────────────────────────────────
function ChannelCard({ channel, data, icon: Icon, color }) {
    const colorMap = {
        blue: { bg: '#eff6ff', border: '#bfdbfe', icon: '#2563eb', title: '#1d4ed8' },
        emerald: { bg: '#f0fdf4', border: '#bbf7d0', icon: '#16a34a', title: '#15803d' },
        violet: { bg: '#faf5ff', border: '#e9d5ff', icon: '#9333ea', title: '#7e22ce' },
    };
    const c = colorMap[color] || colorMap.blue;
    const q = data?.queue || {};
    const t = data?.totals || {};
    const dlqSize = data?.dlq?.size ?? 0;
    const hasFailed = (q.failed ?? 0) > 0 || dlqSize > 0;

    return (
        <div style={{
            background: '#fff', border: `1px solid ${hasFailed ? '#fecaca' : c.border}`,
            borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '10px', background: c.bg, border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={16} style={{ color: c.icon }} />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', textTransform: 'capitalize' }}>{channel}</span>
                </div>
                {hasFailed ? (
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}>⚠ Issues</span>
                ) : (
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>✓ Healthy</span>
                )}
            </div>

            {/* Queue pills */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                    { label: 'Waiting', v: q.waiting, color: q.waiting > 0 ? '#d97706' : '#94a3b8' },
                    { label: 'Active', v: q.active, color: q.active > 0 ? '#2563eb' : '#94a3b8' },
                    { label: 'Done', v: q.completed, color: '#16a34a' },
                    { label: 'Failed', v: q.failed, color: q.failed > 0 ? '#dc2626' : '#94a3b8' },
                    { label: 'DLQ', v: dlqSize, color: dlqSize > 0 ? '#9333ea' : '#94a3b8' },
                ].map(({ label, v, color: vc }) => (
                    <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 10px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', minWidth: 48 }}>
                        <span style={{ fontSize: '1rem', fontWeight: 700, color: vc, lineHeight: 1 }}>{v ?? 0}</span>
                        <span style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>{label}</span>
                    </div>
                ))}
            </div>

            {/* Delivery totals */}
            <div style={{ paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem' }}>
                    <span style={{ color: '#64748b' }}>Sent: <strong style={{ color: '#0f172a' }}>{(t.sent || 0).toLocaleString()}</strong></span>
                    <span style={{ color: '#64748b' }}>Failed: <strong style={{ color: t.failed > 0 ? '#dc2626' : '#0f172a' }}>{t.failed || 0}</strong></span>
                    <span style={{ color: '#64748b' }}>Retried: <strong style={{ color: '#0f172a' }}>{t.retried || 0}</strong></span>
                </div>
            </div>
        </div>
    );
}

// ─── Test send form ───────────────────────────────────────────────────────────
function TestSendPanel({ channel, presets }) {
    const [type, setType] = useState(presets[0]?.type || '');
    const [payload, setPayload] = useState('');
    const [status, setStatus] = useState(null); // null | 'loading' | 'ok' | 'err'
    const [result, setResult] = useState('');
    const [previewUrl, setPreviewUrl] = useState(null);
    const [jobId, setJobId] = useState(null);

    useEffect(() => {
        const preset = presets.find(p => p.type === type);
        if (preset) setPayload(JSON.stringify(preset.payload, null, 2));
    }, [type, presets]);

    const handleSend = async () => {
        setStatus('loading');
        setResult('');
        setPreviewUrl(null);
        setJobId(null);
        try {
            let parsed;
            try { parsed = JSON.parse(payload); } catch { setStatus('err'); setResult('Invalid JSON payload'); return; }
            const res = await platformApi.post('/communication/test/send', { channel, type, payload: parsed });
            setStatus('ok');
            setJobId(res.data.jobId);
            setResult(`✓ Enqueued (Job ID: ${res.data.jobId})`);
            if (res.data.previewUrl) {
                setPreviewUrl(res.data.previewUrl);
            }
        } catch (err) {
            setStatus('err');
            setResult(err.response?.data?.message || err.message);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {presets.map(p => (
                    <button key={p.type} onClick={() => setType(p.type)} style={{
                        padding: '6px 14px', borderRadius: '8px', border: '1px solid',
                        borderColor: type === p.type ? '#2563eb' : '#e2e8f0',
                        background: type === p.type ? '#eff6ff' : '#f8fafc',
                        color: type === p.type ? '#1d4ed8' : '#64748b',
                        fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer',
                    }}>
                        {p.label}
                    </button>
                ))}
            </div>

            <textarea
                value={payload}
                onChange={e => setPayload(e.target.value)}
                rows={8}
                style={{
                    width: '100%', borderRadius: '10px', border: '1px solid #e2e8f0',
                    padding: '12px', fontFamily: 'ui-monospace, monospace', fontSize: '0.78rem',
                    color: '#0f172a', background: '#f8fafc', resize: 'vertical', boxSizing: 'border-box',
                }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <button onClick={handleSend} disabled={status === 'loading'} style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    padding: '9px 20px', borderRadius: '10px',
                    background: '#2563eb', color: '#fff', border: 'none',
                    fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                    opacity: status === 'loading' ? 0.6 : 1, transition: 'all 0.15s',
                }}>
                    {status === 'loading'
                        ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        : <Send size={14} />}
                    Send Test
                </button>

                {result && (
                    <span style={{
                        fontSize: '0.78rem', fontWeight: 600,
                        color: status === 'ok' ? '#16a34a' : '#dc2626',
                    }}>
                        {result}
                    </span>
                )}
            </div>

            {/* Ethereal Preview URL — shown when backend returns it */}
            {previewUrl && (
                <div style={{
                    padding: '14px 16px', borderRadius: '10px',
                    background: '#f0fdf4', border: '1px solid #bbf7d0',
                    display: 'flex', flexDirection: 'column', gap: '6px',
                }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle2 size={13} /> Email sent — open Ethereal preview:
                    </div>
                    <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            fontSize: '0.72rem', color: '#2563eb', textDecoration: 'underline',
                            fontFamily: 'monospace', wordBreak: 'break-all',
                        }}
                    >
                        {previewUrl}
                    </a>
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Job ID: {jobId}</div>
                </div>
            )}
        </div>
    );
}

// ─── Retry logs table ─────────────────────────────────────────────────────────
function RetryLogTable({ logs, loading }) {
    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px', color: '#94a3b8' }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
    );
    if (!logs?.length) return <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>No retry logs found</div>;
    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                        {['Channel', 'Type', 'Recipient', 'Attempts', 'DLQ', 'Error', 'Time'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.05em' }}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {logs.map((log, i) => (
                        <tr key={log._id || i} style={{ borderBottom: '1px solid #f1f5f9' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <td style={{ padding: '8px 12px' }}><span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{log.channel}</span></td>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '0.72rem', color: '#475569' }}>{log.type || '—'}</td>
                            <td style={{ padding: '8px 12px', color: '#64748b', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.recipient || '—'}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                <span style={{ fontWeight: 700, color: log.attempts >= (log.maxAttempts || 5) ? '#dc2626' : '#d97706' }}>
                                    {log.attempts}/{log.maxAttempts || '?'}
                                </span>
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                {log.isDLQ
                                    ? <span style={{ color: '#dc2626', fontWeight: 700 }}>DLQ</span>
                                    : <span style={{ color: '#94a3b8' }}>—</span>}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#dc2626', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.error}>{log.error || '—'}</td>
                            <td style={{ padding: '8px 12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{new Date(log.createdAt).toLocaleString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── DLQ Job Inspector ────────────────────────────────────────────────────────
function DLQPanel({ dlqJobs, loading, onRetry }) {
    if (loading) return <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /></div>;

    const allEmpty = Object.values(dlqJobs || {}).every(jobs => !jobs?.length);
    if (allEmpty) return <div style={{ padding: '24px', textAlign: 'center', color: '#16a34a', fontSize: '0.85rem', fontWeight: 600 }}>✓ All dead-letter queues are empty</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {Object.entries(dlqJobs || {}).map(([ch, jobs]) => (
                jobs?.length > 0 && (
                    <div key={ch}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>{ch} DLQ ({jobs.length})</div>
                        {jobs.map(job => (
                            <div key={job.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '8px' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#b91c1c' }}>{job.name}</div>
                                    <div style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.failedReason || '—'}</div>
                                    <div style={{ fontSize: '0.67rem', color: '#94a3b8', marginTop: '4px' }}>Job ID: {job.id} · Attempts: {job.attemptsMade}</div>
                                </div>
                                <button onClick={() => onRetry(ch, job.id)} style={{
                                    display: 'flex', alignItems: 'center', gap: '5px',
                                    padding: '5px 12px', borderRadius: '8px', border: '1px solid #fca5a5',
                                    background: '#fff', color: '#dc2626', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                                }}>
                                    <RotateCcw size={11} /> Retry
                                </button>
                            </div>
                        ))}
                    </div>
                )
            ))}
        </div>
    );
}

// ─── Email preset test payloads ───────────────────────────────────────────────
const EMAIL_PRESETS = [
    { label: 'Magic Link', type: 'MAGIC_LINK', payload: { email: 'test@example.com', name: 'Test User', magicLink: 'https://example.com/auth?token=test123', expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() } },
    { label: 'Password Reset', type: 'PASSWORD_RESET', payload: { email: 'test@example.com', name: 'Test User', resetLink: 'https://example.com/reset?token=test456', expiresIn: '1 hour' } },
    { label: 'OTP', type: 'EMAIL_OTP', payload: { email: 'test@example.com', name: 'Test User', otp: '123456', expiresInMinutes: 10 } },
    { label: 'Invoice', type: 'INVOICE', payload: { email: 'test@example.com', orgName: 'Demo Clinic', invoiceNumber: 'INV-001', amount: 99.00, currency: 'USD', dueDate: new Date().toISOString(), items: [{ description: 'Pro Plan', quantity: 1, unitPrice: 99, total: 99 }] } },
    { label: 'Grace', type: 'GRACE', payload: { email: 'test@example.com', orgName: 'Demo Clinic', gracePeriodDays: 7, graceEndsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString() } },
    { label: 'Suspension', type: 'SUSPENSION', payload: { email: 'test@example.com', orgName: 'Demo Clinic', suspendedAt: new Date().toISOString() } },
];

const SMS_PRESETS = [
    { label: 'OTP', type: 'OTP', payload: { phone: '+1234567890', code: '123456', expiresInMinutes: 10, platformName: 'DentalSaaS' } },
    { label: 'Appt Reminder', type: 'APPOINTMENT_REMINDER', payload: { phone: '+1234567890', clinicName: 'Demo Clinic', date: '2026-03-08', time: '10:00 AM' } },
    { label: 'Grace SMS', type: 'GRACE_SMS', payload: { phone: '+1234567890', platformName: 'DentalSaaS' } },
];

const WHATSAPP_PRESETS = [
    { label: 'Appointment', type: 'APPOINTMENT_CONFIRM', payload: { phone: '+1234567890', body: 'Your appointment is confirmed for tomorrow at 10am. Reply YES to confirm.' } },
    { label: 'Payment', type: 'PAYMENT_RECEIPT', payload: { phone: '+1234567890', body: 'Payment received: $99.00 for DentalSaaS Pro Plan. Thank you!' } },
];

// ─── Main Page ─────────────────────────────────────────────────────────────────
function CommunicationCenterContent() {
    const [activeTab, setActiveTab] = useState('overview');
    const [metrics, setMetrics] = useState(null);
    const [retryLogs, setRetryLogs] = useState([]);
    const [dlqJobs, setDlqJobs] = useState({});
    const [loading, setLoading] = useState(true);
    const [logLoading, setLogLoading] = useState(false);
    const [dlqLoading, setDlqLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    const fetchMetrics = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        setError(null);
        try {
            const res = await platformApi.get('/communication/metrics');
            setMetrics(res.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load metrics');
        } finally {
            setLoading(false); setRefreshing(false);
        }
    }, []);

    const fetchRetryLogs = useCallback(async () => {
        setLogLoading(true);
        try {
            const res = await platformApi.get('/communication/retry-logs?limit=50');
            setRetryLogs(res.data?.data || []);
        } catch { } finally { setLogLoading(false); }
    }, []);

    const fetchDLQJobs = useCallback(async () => {
        setDlqLoading(true);
        try {
            const res = await platformApi.get('/communication/dlq');
            setDlqJobs(res.data?.dlq || {});
        } catch { } finally { setDlqLoading(false); }
    }, []);

    const retryDLQJob = async (channel, jobId) => {
        try {
            await platformApi.post(`/communication/dlq/${channel}/${jobId}/retry`);
            fetchDLQJobs();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Retry failed');
        }
    };

    useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

    useEffect(() => {
        if (activeTab === 'retries') fetchRetryLogs();
        if (activeTab === 'dlq') fetchDLQJobs();
    }, [activeTab, fetchRetryLogs, fetchDLQJobs]);

    const channels = metrics?.channels || {};

    return (
        <div style={{ fontFamily: 'Inter, system-ui, sans-serif', color: '#0f172a' }}>
            {/* ── Page Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ padding: '8px', borderRadius: '10px', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                        <Zap size={20} style={{ color: '#2563eb' }} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Communication Center</h1>
                        <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '2px 0 0' }}>Enterprise messaging — Email · SMS · WhatsApp</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => fetchMetrics(true)} disabled={refreshing} style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
                        borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc',
                        color: '#64748b', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                    }}>
                        <RefreshCw size={13} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
                        Refresh
                    </button>
                    <button
                        onClick={() => {
                            const token = getPlatformToken();
                            const url = token
                                ? `/admin/queues?token=${encodeURIComponent(token)}`
                                : '/admin/queues';
                            window.open(url, '_blank', 'noopener,noreferrer');
                        }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
                            borderRadius: '8px', border: '1px solid #bfdbfe', background: '#eff6ff',
                            color: '#1d4ed8', fontSize: '0.78rem', fontWeight: 700,
                            cursor: 'pointer',
                        }}
                    >
                        <ExternalLink size={13} />
                        Bull Board
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.8rem', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {/* ── Tabs ── */}
            <div style={{ display: 'flex', gap: '4px', borderBottom: '2px solid #e2e8f0', marginBottom: '24px', overflowX: 'auto' }}>
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '10px 16px', borderRadius: '8px 8px 0 0', border: 'none',
                            fontWeight: active ? 700 : 500, fontSize: '0.8rem',
                            background: active ? '#fff' : 'transparent',
                            color: active ? '#1d4ed8' : '#64748b',
                            borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
                            cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                        }}>
                            <Icon size={14} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* ── Tab Content ── */}

            {/* Overview */}
            {activeTab === 'overview' && (
                <div>
                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px', color: '#94a3b8' }}>
                            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                            <ChannelCard channel="email" data={channels.email} icon={Mail} color="blue" />
                            <ChannelCard channel="sms" data={channels.sms} icon={MessageSquare} color="emerald" />
                            <ChannelCard channel="whatsapp" data={channels.whatsapp} icon={Phone} color="violet" />
                        </div>
                    )}
                    <div style={{ marginTop: '20px', padding: '14px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.75rem', color: '#64748b' }}>
                        Metrics window: <strong>last 24 hours</strong> · Auto-refreshes on tab change
                    </div>
                </div>
            )}

            {/* Email Testing Lab */}
            {activeTab === 'email' && (
                <div>
                    <div style={{ marginBottom: '16px' }}>
                        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '4px' }}>📧 Email Testing Lab</h2>
                        <p style={{ fontSize: '0.78rem', color: '#64748b' }}>Select a template preset, edit the payload JSON, and fire a real test email via the queue.</p>
                    </div>
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
                        <TestSendPanel channel="email" presets={EMAIL_PRESETS} />
                    </div>
                    <div style={{ marginTop: '12px', padding: '10px 14px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '0.72rem', color: '#1d4ed8' }}>
                        💡 After sending, open the <strong>Email Inspector</strong> tab to see the preview URL and SMTP response.
                    </div>
                </div>
            )}

            {/* SMS Testing Lab */}
            {activeTab === 'sms' && (
                <div>
                    <div style={{ marginBottom: '16px' }}>
                        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '4px' }}>💬 SMS Testing Lab</h2>
                        <p style={{ fontSize: '0.78rem', color: '#64748b' }}>Test SMS delivery. In dev, messages are logged to console (SMS_PROVIDER=console).</p>
                    </div>
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
                        <TestSendPanel channel="sms" presets={SMS_PRESETS} />
                    </div>
                    <div style={{ marginTop: '12px', padding: '10px 14px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', fontSize: '0.72rem', color: '#15803d' }}>
                        ✓ Set SMS_PROVIDER=twilio to enable live sends. Uses TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN.
                    </div>
                </div>
            )}

            {/* WhatsApp Lab */}
            {activeTab === 'whatsapp' && (
                <div>
                    <div style={{ marginBottom: '16px' }}>
                        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '4px' }}>📱 WhatsApp Lab</h2>
                        <p style={{ fontSize: '0.78rem', color: '#64748b' }}>Test WhatsApp message delivery. Supports Twilio WhatsApp and Meta Cloud API.</p>
                    </div>
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
                        <TestSendPanel channel="whatsapp" presets={WHATSAPP_PRESETS} />
                    </div>
                    <div style={{ marginTop: '12px', padding: '10px 14px', background: '#faf5ff', borderRadius: '8px', border: '1px solid #e9d5ff', fontSize: '0.72rem', color: '#7e22ce' }}>
                        ✓ Set WHATSAPP_PROVIDER=twilio|meta. Meta requires META_WHATSAPP_TOKEN + META_PHONE_NUMBER_ID.
                    </div>
                </div>
            )}

            {/* Retry Analytics */}
            {activeTab === 'monitoring' && (
                <MonitoringDashboardPanel />
            )}

            {/* Retry Analytics */}
            {activeTab === 'retries' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>🔄 Retry Analytics</h2>
                        <button onClick={fetchRetryLogs} style={{ padding: '5px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '0.72rem', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}>
                            Refresh
                        </button>
                    </div>
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                        <RetryLogTable logs={retryLogs} loading={logLoading} />
                    </div>
                </div>
            )}

            {/* Dead-Letter Queues */}
            {activeTab === 'dlq' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>☠ Dead-Letter Queues</h2>
                        <button onClick={fetchDLQJobs} style={{ padding: '5px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '0.72rem', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}>
                            Refresh
                        </button>
                    </div>
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
                        <DLQPanel dlqJobs={dlqJobs} loading={dlqLoading} onRetry={retryDLQJob} />
                    </div>
                </div>
            )}

            {/* ─── Email Inspector ─── */}
            {activeTab === 'inspector' && (
                <EmailInspectorPanel />
            )}
        </div>
    );
}

// ─── Email Inspector Panel ──────────────────────────────────────────────────────
const STATUS_STYLE = {
    queued: { bg: '#fef3c7', color: '#92400e', label: 'Queued' },
    processing: { bg: '#dbeafe', color: '#1d4ed8', label: 'Processing' },
    sent: { bg: '#d1fae5', color: '#065f46', label: 'Sent' },
    failed: { bg: '#fee2e2', color: '#991b1b', label: 'Failed' },
    retrying: { bg: '#fde8d8', color: '#9a3412', label: 'Retrying' },
};

function EmailInspectorPanel() {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('all');
    const [preview, setPreview] = useState(null);  // { html } for template preview modal
    const [previewLoading, setPL] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState('magicLink');

    const TEMPLATES = ['magicLink', 'resetPassword', 'otp', 'invoice', 'refund', 'grace', 'suspension', 'retryFailed'];

    const fetchEvents = useCallback(async () => {
        setLoading(true);
        try {
            const params = filter !== 'all' ? `?status=${filter}` : '';
            const res = await platformApi.get(`/communication/email-events${params}`);
            setEvents(res.data.data || []);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [filter]);

    useEffect(() => { fetchEvents(); }, [fetchEvents]);

    // Auto-refresh every 15s
    useEffect(() => {
        const t = setInterval(fetchEvents, 15000);
        return () => clearInterval(t);
    }, [fetchEvents]);

    const handlePreview = async (template) => {
        setPL(true);
        setPreview(null);
        try {
            const res = await platformApi.post('/communication/template-preview', {
                template,
                data: { name: 'Preview User', email: 'preview@example.com', link: 'https://example.com', otp: '123456', subject: `Preview: ${template}` }
            });
            setPreview(res.data.html);
        } catch (e) {
            setPreview(`<p style="color:red">Preview failed: ${e.message}</p>`);
        } finally { setPL(false); }
    };

    const tdStyle = { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '0.75rem', color: '#374151', verticalAlign: 'middle' };
    const thStyle = { padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '0.67rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', whiteSpace: 'nowrap' };

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                    <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 3px' }}>🔍 Email Inspector</h2>
                    <p style={{ fontSize: '0.73rem', color: '#64748b', margin: 0 }}>Real-time email job log with SMTP results and Ethereal preview links</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Status filter */}
                    <select
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.75rem', color: '#374151', background: '#fff', cursor: 'pointer' }}
                    >
                        <option value="all">All Statuses</option>
                        {Object.entries(STATUS_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <button onClick={fetchEvents} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '0.72rem', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}>
                        {loading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
                        Refresh
                    </button>
                </div>
            </div>

            {/* Template Preview Section */}
            <div style={{ marginBottom: '16px', padding: '14px 16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e3a5f', marginBottom: '10px' }}>🖼 Template Preview (no email sent)</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                        value={selectedTemplate}
                        onChange={e => setSelectedTemplate(e.target.value)}
                        style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.75rem', color: '#374151', background: '#fff' }}
                    >
                        {TEMPLATES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button
                        onClick={() => handlePreview(selectedTemplate)}
                        disabled={previewLoading}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 14px', borderRadius: '8px', background: '#2563eb', color: '#fff', border: 'none', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                        {previewLoading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                        Preview Template
                    </button>
                </div>

                {/* Preview iframe modal */}
                {preview && (
                    <div style={{ marginTop: '12px', position: 'relative' }}>
                        <button
                            onClick={() => setPreview(null)}
                            style={{ position: 'absolute', top: 6, right: 6, zIndex: 1, padding: '2px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '0.7rem', color: '#64748b' }}
                        >
                            ✕ Close
                        </button>
                        <iframe
                            srcDoc={preview}
                            title="Email Preview"
                            style={{ width: '100%', height: '500px', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#fff' }}
                            sandbox="allow-same-origin"
                        />
                    </div>
                )}
            </div>

            {/* Events Table */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                {loading && events.length === 0 ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', color: '#94a3b8' }}>
                        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                    </div>
                ) : events.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                        <Activity size={24} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
                        No email events yet. Send a test email from the Email Lab tab.
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {['Job ID', 'Template', 'Recipient', 'Status', 'Duration', 'Preview / Error'].map(h => (
                                        <th key={h} style={thStyle}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {events.map(ev => {
                                    const ss = STATUS_STYLE[ev.status] || STATUS_STYLE.queued;
                                    return (
                                        <tr key={ev._id} style={{ transition: 'background 0.1s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                            onMouseLeave={e => e.currentTarget.style.background = ''}
                                        >
                                            <td style={tdStyle}>
                                                <span style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: '#94a3b8' }}>{ev.jobId}</span>
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={{ fontWeight: 600, color: '#1e3a5f' }}>{ev.template}</span>
                                            </td>
                                            <td style={{ ...tdStyle, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {ev.recipient}
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '999px', background: ss.bg, color: ss.color, fontSize: '0.65rem', fontWeight: 700 }}>
                                                    {ss.label}
                                                </span>
                                            </td>
                                            <td style={{ ...tdStyle, color: '#94a3b8' }}>
                                                {ev.durationMs != null ? `${ev.durationMs}ms` : '—'}
                                            </td>
                                            <td style={tdStyle}>
                                                {ev.previewUrl ? (
                                                    <a href={ev.previewUrl} target="_blank" rel="noopener noreferrer"
                                                        style={{ color: '#2563eb', fontSize: '0.72rem', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <ExternalLink size={10} /> Open in Ethereal
                                                    </a>
                                                ) : ev.error ? (
                                                    <span style={{ color: '#dc2626', fontSize: '0.7rem' }} title={ev.error}>
                                                        ⚠ {ev.error.substring(0, 40)}{ev.error.length > 40 ? '…' : ''}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                <div style={{ padding: '8px 14px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', fontSize: '0.68rem', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Showing {events.length} event(s) · Auto-refreshes every 15s</span>
                    <span>TTL: 90 days</span>
                </div>
            </div>
        </div>
    );
}

export default function CommunicationCenterPage() {
    return (
        <RequireCapability permission="VIEW_COMMUNICATION_METRICS">
            <CommunicationCenterContent />
        </RequireCapability>
    );
}

// ─── Monitoring Dashboard Panel ─────────────────────────────────────────────
function MetricCard({ label, value, sub, color = '#2563eb', icon: Icon }) {
    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px 20px', flex: '1 1 160px', minWidth: 150 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                {Icon && <Icon size={14} style={{ color }} />}
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '4px' }}>{sub}</div>}
        </div>
    );
}

function MonitoringDashboardPanel() {
    const [metrics, setMetrics] = useState(null);
    const [qHealth, setQHealth] = useState(null);
    const [wStatus, setWStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState(null);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [mRes, qRes, wRes] = await Promise.all([
                platformApi.get('/monitoring/email-metrics'),
                platformApi.get('/monitoring/queue-health'),
                platformApi.get('/monitoring/worker-status'),
            ]);
            setMetrics(mRes.data.data);
            setQHealth(qRes.data.data);
            setWStatus(wRes.data.data);
            setLastRefresh(new Date());
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);
    useEffect(() => {
        const t = setInterval(fetchAll, 30000);
        return () => clearInterval(t);
    }, [fetchAll]);

    const m = metrics?.totals || {};
    const q = qHealth?.queues || {};

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                    <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 3px' }}>📊 Monitoring Dashboard</h2>
                    <p style={{ fontSize: '0.73rem', color: '#64748b', margin: 0 }}>Real-time delivery metrics, queue depth, and worker health · 30s auto-refresh</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {lastRefresh && <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Updated {lastRefresh.toLocaleTimeString()}</span>}
                    <button onClick={fetchAll} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '0.72rem', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}>
                        {loading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />} Refresh
                    </button>
                </div>
            </div>

            {/* Worker Status Banner */}
            {wStatus && (
                <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '10px', background: wStatus.overallStatus === 'healthy' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${wStatus.overallStatus === 'healthy' ? '#bbf7d0' : '#fecaca'}`, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    {wStatus.overallStatus === 'healthy' ? <Wifi size={14} style={{ color: '#16a34a' }} /> : <WifiOff size={14} style={{ color: '#dc2626' }} />}
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: wStatus.overallStatus === 'healthy' ? '#15803d' : '#b91c1c' }}>
                        System {wStatus.overallStatus === 'healthy' ? 'Healthy' : 'Degraded'}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Redis: <strong>{wStatus.redis}</strong></span>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Email Worker: <strong>{wStatus.emailWorker}</strong></span>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Active jobs: <strong>{wStatus.activeEmailJobs ?? '—'}</strong></span>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Sent last 5m: <strong>{wStatus.recentSentLast5m ?? '—'}</strong></span>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Chain: <strong>{wStatus.providerChain}</strong></span>
                </div>
            )}

            {/* Delivery Metric Cards */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
                <MetricCard label="Delivery Rate" value={metrics ? `${metrics.deliveryRate}%` : '—'} sub="last 24h" color="#16a34a" icon={TrendingUp} />
                <MetricCard label="Retry Rate" value={metrics ? `${metrics.retryRate}%` : '—'} sub="last 24h" color="#d97706" icon={RotateCcw} />
                <MetricCard label="Sent" value={m.sent ?? '—'} sub="last 24h" color="#2563eb" icon={Mail} />
                <MetricCard label="Failed" value={m.failed ?? '—'} sub="last 24h" color={m.failed > 0 ? '#dc2626' : '#94a3b8'} icon={XCircle} />
                <MetricCard label="Retried" value={m.retried ?? '—'} sub="last 24h" color="#7c3aed" icon={RefreshCw} />
                <MetricCard label="DLQ" value={m.dlq ?? '—'} sub="last 24h" color={m.dlq > 0 ? '#9333ea' : '#94a3b8'} icon={Inbox} />
            </div>

            {/* Queue Depth + Provider Breakdown Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>

                {/* Queue Health */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e3a5f', marginBottom: '12px' }}>📥 Queue Depths</div>
                    {['email', 'sms', 'whatsapp', 'emailDLQ'].map(ch => {
                        const c = q[ch] || {};
                        return (
                            <div key={ch} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'capitalize' }}>{ch}</span>
                                <div style={{ display: 'flex', gap: '8px', fontSize: '0.68rem' }}>
                                    {[['W', c.waiting, '#d97706'], ['A', c.active, '#2563eb'], ['D', c.completed, '#16a34a'], ['F', c.failed, '#dc2626']].map(([l, v, cl]) => (
                                        <span key={l} style={{ color: v > 0 ? cl : '#cbd5e1' }}>{l}:{v ?? 0}</span>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    <div style={{ fontSize: '0.64rem', color: '#94a3b8', marginTop: '8px' }}>W=Waiting A=Active D=Done F=Failed</div>
                </div>

                {/* Provider Breakdown */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e3a5f', marginBottom: '12px' }}>📤 Provider Usage (24h)</div>
                    {loading ? (
                        <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Loading…</div>
                    ) : metrics?.providerUsage?.length > 0 ? (
                        metrics.providerUsage.map(p => (
                            <div key={p.provider} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: '0.73rem', fontWeight: 600, color: '#374151', minWidth: 80 }}>{p.provider}</span>
                                <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: '99px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', borderRadius: '99px', background: '#2563eb', width: `${Math.min(100, (p.count / (m.sent || 1)) * 100)}%` }} />
                                </div>
                                <span style={{ fontSize: '0.68rem', color: '#64748b', minWidth: 30, textAlign: 'right' }}>{p.count}</span>
                            </div>
                        ))
                    ) : (
                        <div style={{ color: '#94a3b8', fontSize: '0.73rem' }}>No sent emails in the last 24h</div>
                    )}
                </div>
            </div>

            <div style={{ fontSize: '0.68rem', color: '#94a3b8', textAlign: 'right' }}>Data window: last 24 hours · Refreshes every 30s</div>
        </div>
    );
}
