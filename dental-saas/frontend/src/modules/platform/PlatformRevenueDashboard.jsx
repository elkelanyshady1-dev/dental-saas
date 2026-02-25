import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api";
import { usePlatformAnalytics } from "./PlatformAnalyticsContext";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    AreaChart, Area
} from 'recharts';

const formatCurrency = (val) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val || 0);

export default function PlatformRevenueDashboard() {
    const { stats, loading } = usePlatformAnalytics();
    const [orgs, setOrgs] = useState([]);
    const [events, setEvents] = useState([]);
    const [loadingOrgs, setLoadingOrgs] = useState(true);

    useEffect(() => {
        // Fetch orgs for risk panel & recent events for activity feed
        Promise.all([
            api.get("/platform/organizations"),
            api.get("/platform/analytics/events?limit=20")
        ])
            .then(([oRes, eRes]) => {
                // Backend returns organizations as raw array
                setOrgs(Array.isArray(oRes.data) ? oRes.data : []);

                // Backend returns events in standardized { success, data } format
                const eventData = eRes.data?.data || eRes.data || [];
                setEvents(Array.isArray(eventData) ? eventData : []);
            })
            .catch(err => {
                console.error("Dashboard Feed Error:", err);
                setEvents([]);
                setOrgs([]);
            })
            .finally(() => setLoadingOrgs(false));
    }, []);

    if (loading) return <Spinner />;
    if (!stats) return <div className="p-10 text-red-500">Failed to load revenue analytics.</div>;

    const riskOrgs = orgs.filter(o =>
        (o.subscription?.graceEndsAt && new Date(o.subscription.graceEndsAt) > new Date()) ||
        (o.subscription?.status === 'suspended')
    ).slice(0, 10);

    return (
        <div className="px-8 py-6 space-y-6 animate-fade-in max-w-full">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Executive Revenue Cockpit</h1>
                <p className="text-gray-500 mt-1 text-sm">Real-time financial telemetry & platform governance</p>
            </div>

            {/* ROW 1 — EXECUTIVE KPI LAYER */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <KPICard title="MRR" value={stats.mrr} color="blue" subtitle="Monthly Recurring" sparklineData={stats.history} dataKey="mrr" />
                <KPICard title="ARR" value={stats.arr} color="purple" subtitle="Annualized Run Rate" sparklineData={stats.history} dataKey="arr" />
                <KPICard title="Revenue at Risk" value={stats.revenueAtRisk} color="amber" subtitle="Expiring/Failing" alert={stats.revenueAtRisk / stats.mrr > 0.15} sparklineData={stats.history} dataKey="revenueAtRisk" />
                <KPICard title="Churn Rate" value={(stats.churnRate || 0) * 100} isPercent color="red" subtitle="Rolling 30-Day" sparklineData={stats.history} dataKey="churnRate" />
                <KPICard title="NRR %" value={(stats.nrr || 0) * 100} isPercent color="emerald" subtitle="Net Retention" sparklineData={stats.history} dataKey="nrr" />
            </div>

            {/* ROW 2 — REVENUE TREND + RISK RAIL */}
            <div className="grid grid-cols-12 gap-6">
                <div className="col-span-12 lg:col-span-8 bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6">Revenue Trajectory</h3>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={stats.history || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorMrr" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="date" hide />
                                <YAxis hide />
                                <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                <Area type="monotone" dataKey="mrr" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorMrr)" activeDot={{ r: 6, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="col-span-12 lg:col-span-4 bg-white border border-gray-200 rounded-lg p-6 flex flex-col">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Risk Radar</h3>
                    <div className="flex-1 overflow-y-auto space-y-2">
                        {riskOrgs.length === 0 ? (
                            <p className="text-sm text-gray-400 italic">No critical risks detected.</p>
                        ) : riskOrgs.map(org => (
                            <Link key={org.id} to={`/platform/organizations/${org.id}?tab=billing`} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-red-50 transition-colors border border-transparent hover:border-red-100">
                                <div>
                                    <p className="text-sm font-bold text-gray-900">{org.name}</p>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase">{org.subscription?.status}</p>
                                </div>
                                <span className="text-xs font-bold text-red-600">-${org.subscription?.basePriceAtSubscription || 0}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>

            {/* ROW 3 — FORECAST + MRR MOVEMENT */}
            <div className="grid grid-cols-12 gap-6">
                <div className="col-span-12 lg:col-span-6 bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6">Probability Forecast</h3>
                    <div className="grid grid-cols-3 gap-4">
                        <ForecastSlot label="30D" amount={stats.forecast?.next30Days} />
                        <ForecastSlot label="60D" amount={stats.forecast?.next60Days} />
                        <ForecastSlot label="90D" amount={stats.forecast?.next90Days} />
                    </div>
                </div>
                <div className="col-span-12 lg:col-span-6 bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">MRR Movement</h3>
                    <div className="grid grid-cols-4 gap-2">
                        <MovementItem label="New" val={stats.mrrMovement?.newMRR} color="blue" />
                        <MovementItem label="Up" val={stats.mrrMovement?.expansionMRR} color="emerald" />
                        <MovementItem label="Down" val={stats.mrrMovement?.contractionMRR} color="amber" isNeg />
                        <MovementItem label="Churn" val={stats.mrrMovement?.churnedMRR} color="red" isNeg />
                    </div>
                </div>
            </div>

            {/* ROW 4 — SYSTEM INTELLIGENCE */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <IntelCard title="Cron Status" data={[
                    { l: "Last Heartbeat", v: "2m ago" },
                    { l: "Lock Active", v: "Yes (Master)", c: "text-emerald-600" },
                    { l: "Errors (24h)", v: "0" }
                ]} />
                <IntelCard title="Retry Queue" data={[
                    { l: "Pending Invoices", v: stats.dunning?.pendingCount || 0 },
                    { l: "Next Dispatch", v: "14:00 UTC" },
                    { l: "Max Retries Hit", v: stats.dunning?.exhaustedCount || 0, c: "text-red-600" }
                ]} />
                <IntelCard title="Mail Gateway" data={[
                    { l: "Sent Today", v: "142" },
                    { l: "Failure Rate", v: "0.2%", c: "text-emerald-600" },
                    { l: "Bounces", v: "0" }
                ]} />
            </div>

            {/* ROW 5 — LIVE ACTIVITY FEED */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="text-[15px] font-bold text-gray-900">Live Platform Activity</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="px-6 py-2 text-xs uppercase text-gray-400 font-bold">Event</th>
                                <th className="px-6 py-2 text-xs uppercase text-gray-400 font-bold">Details</th>
                                <th className="px-6 py-2 text-xs uppercase text-gray-400 font-bold">Time</th>
                                <th className="px-6 py-2 text-xs uppercase text-gray-400 font-bold text-right">Actor</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {(!Array.isArray(events) || events.length === 0) ? (
                                <tr><td colSpan="4" className="p-8 text-center text-gray-400">Listening for platform events...</td></tr>
                            ) : events.map((ev, i) => (
                                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-2">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getEventStyle(ev.action)}`}>
                                            {ev.action.replace(/_/g, ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-2 text-gray-600 truncate max-w-xs">{ev.details || '—'}</td>
                                    <td className="px-6 py-2 text-gray-400 text-xs">{new Date(ev.createdAt).toLocaleTimeString()}</td>
                                    <td className="px-6 py-2 text-right text-gray-500 font-medium">{ev.userId?.name || 'System'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ─── DASHBOARD UI COMPONENTS ────────────────────────────────────────────────

function KPICard({ title, value, color, subtitle, alert, isPercent, sparklineData, dataKey }) {
    const accents = {
        blue: { bg: "bg-blue-600", stroke: "#3b82f6" },
        purple: { bg: "bg-indigo-600", stroke: "#4f46e5" },
        amber: { bg: "bg-amber-500", stroke: "#f59e0b" },
        red: { bg: "bg-red-500", stroke: "#ef4444" },
        emerald: { bg: "bg-emerald-600", stroke: "#10b981" }
    };

    const strokeColor = alert ? "#ef4444" : (accents[color]?.stroke || "#e5e7eb");

    return (
        <div className={`bg-white border border-gray-200 rounded-lg p-5 hover:shadow-sm transition-shadow relative overflow-hidden flex flex-col justify-between ${alert ? 'bg-red-50/20' : ''}`}>
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${accents[color]?.bg || 'bg-gray-200'}`} />
            <div>
                <p className="text-sm text-gray-500 font-medium mb-1">{title}</p>
                <div className="flex items-baseline gap-2">
                    <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
                        {isPercent ? `${value.toFixed(1)}%` : formatCurrency(value)}
                    </h2>
                </div>
            </div>

            {sparklineData && dataKey && (
                <div className="h-[40px] mt-2 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sparklineData}>
                            <Line type="monotone" dataKey={dataKey} stroke={strokeColor} strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}

            <p className="text-[11px] text-gray-400 mt-2 font-semibold uppercase">{subtitle}</p>
        </div>
    );
}

function ForecastSlot({ label, amount }) {
    return (
        <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">{label}</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(amount)}</p>
        </div>
    );
}

function MovementItem({ label, val, color, isNeg }) {
    const colors = {
        blue: "text-blue-600",
        emerald: "text-emerald-600",
        amber: "text-amber-600",
        red: "text-red-600"
    };
    return (
        <div className="p-3 text-center border border-gray-100 rounded-lg transition-colors hover:bg-gray-50">
            <p className="text-[10px] uppercase font-bold text-gray-400 mb-1">{label}</p>
            <p className={`text-sm font-bold ${colors[color]}`}>{isNeg ? '-' : '+'}{formatCurrency(val)}</p>
        </div>
    );
}

function IntelCard({ title, data }) {
    return (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h4 className="text-[13px] font-bold text-gray-400 uppercase tracking-widest mb-4">{title}</h4>
            <div className="space-y-3">
                {data.map((d, i) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">{d.l}</span>
                        <span className={`font-bold ${d.c || 'text-gray-900'}`}>{d.v}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function getEventStyle(a) {
    if (a.includes('FAILED') || a.includes('SUSPENDED')) return 'border-red-200 text-red-700 bg-red-50';
    if (a.includes('SUCCESS') || a.includes('NEW')) return 'border-emerald-200 text-emerald-700 bg-emerald-50';
    return 'border-gray-200 text-gray-600 bg-gray-50';
}

function Spinner() {
    return (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-6 h-6 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-4">Analyzing Platform Ledger...</p>
        </div>
    );
}

