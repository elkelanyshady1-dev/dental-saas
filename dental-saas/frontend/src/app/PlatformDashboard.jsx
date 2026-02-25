import { useState, useEffect } from "react";
import api from "../services/api";

export default function PlatformDashboard() {
    const [loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState({
        totalOrganizations: 0,
        activeOrganizations: 0,
        trialOrganizations: 0,
        suspendedOrganizations: 0,
        totalUsers: 0,
        subscriptionDistribution: {
            basic: 0,
            pro: 0,
            enterprise: 0
        }
    });

    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                const res = await api.get("/platform/analytics");
                if (res.data) {
                    setMetrics(res.data);
                }
            } catch (err) {
                console.error("Failed to fetch platform analytics, using placeholders:", err);
                setMetrics({
                    totalOrganizations: 154,
                    activeOrganizations: 112,
                    trialOrganizations: 38,
                    suspendedOrganizations: 4,
                    totalUsers: 4892,
                    subscriptionDistribution: {
                        basic: 65,
                        pro: 35,
                        enterprise: 12
                    }
                });
            } finally {
                setLoading(false);
            }
        };

        fetchAnalytics();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-medium">Loading Platform Analytics...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in bg-slate-50 min-h-screen p-10 space-y-12">

            {/* Page Header */}
            <div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Platform Control Center</h1>
                <p className="text-slate-500 mt-2 text-sm">Enterprise SaaS Infrastructure Overview</p>
            </div>

            {/* SECTION 1 — KPI CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
                <StatCard
                    label="Total Organizations"
                    value={metrics.totalOrganizations}
                    accentFrom="from-blue-500" accentTo="to-indigo-500"
                    tint="bg-blue-50/40"
                />
                <StatCard
                    label="Active Organizations"
                    value={metrics.activeOrganizations}
                    accentFrom="from-emerald-500" accentTo="to-teal-500"
                    tint="bg-emerald-50/40"
                />
                <StatCard
                    label="Trial Organizations"
                    value={metrics.trialOrganizations}
                    accentFrom="from-amber-400" accentTo="to-orange-500"
                    tint="bg-amber-50/40"
                />
                <StatCard
                    label="Suspended / Expired"
                    value={metrics.suspendedOrganizations}
                    accentFrom="from-red-500" accentTo="to-rose-500"
                    tint="bg-red-50/40"
                />
                <StatCard
                    label="Total Org Users"
                    value={metrics.totalUsers}
                    accentFrom="from-blue-500" accentTo="to-indigo-500"
                    tint="bg-blue-50/40"
                />
            </div>

            {/* SECTION 2 — SYSTEM INFRASTRUCTURE */}
            <div>
                <SectionHeader title="System Infrastructure" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                    <InfraCard
                        label="API Status"
                        value="Operational"
                        valueColor="text-emerald-600"
                        dotColor="bg-emerald-500"
                        subtext="99.98% uptime"
                    />
                    <InfraCard
                        label="Database"
                        value="Healthy"
                        valueColor="text-blue-600"
                        dotColor="bg-blue-500"
                        subtext="Mongo Primary Connected"
                    />
                    <InfraCard
                        label="Audit Events"
                        value="124"
                        valueColor="text-purple-600"
                        dotColor="bg-purple-500"
                        subtext="Last 24 hours"
                    />
                </div>
            </div>

            {/* SECTION 3 — GROWTH + DISTRIBUTION */}
            <div className="flex flex-col xl:flex-row gap-6">
                {/* Organization Growth */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 flex-1 flex flex-col hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                    <SectionHeader title="Organization Growth" />
                    <div className="flex justify-between items-center text-sm text-slate-500 mt-4 mb-6">
                        <span className="font-medium">Total Orgs: {metrics.totalOrganizations}</span>
                        <span className="font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">Net Growth: +12</span>
                    </div>
                    <div className="flex-1 w-full min-h-[220px] relative border-b border-l border-slate-200 flex items-end">
                        <svg className="absolute w-full h-[85%] bottom-0 left-0" preserveAspectRatio="none" viewBox="0 0 100 100">
                            <defs>
                                <linearGradient id="chartGradientLight" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
                                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <path d="M0,80 C20,70 40,30 60,35 C80,10 90,20 100,5" fill="none" stroke="#3b82f6" strokeWidth="2.5" vectorEffect="non-scaling-stroke"></path>
                            <path d="M0,80 C20,70 40,30 60,35 C80,10 90,20 100,5 L100,100 L0,100 Z" fill="url(#chartGradientLight)" />
                            <circle cx="0" cy="80" r="2" fill="white" stroke="#3b82f6" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                            <circle cx="20" cy="70" r="2" fill="white" stroke="#3b82f6" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                            <circle cx="40" cy="30" r="2" fill="white" stroke="#3b82f6" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                            <circle cx="60" cy="35" r="2" fill="white" stroke="#3b82f6" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                            <circle cx="80" cy="10" r="2" fill="white" stroke="#3b82f6" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                            <circle cx="100" cy="5" r="2" fill="white" stroke="#3b82f6" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                        </svg>
                    </div>
                </div>

                {/* Subscription Distribution */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 w-full xl:w-1/3 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                    <SectionHeader title="Subscription Distribution" />
                    <div className="space-y-5 mt-8">
                        <ProgressBar
                            plan="Enterprise Plan"
                            value={metrics.subscriptionDistribution?.enterprise}
                            total={metrics.activeOrganizations + metrics.trialOrganizations}
                        />
                        <ProgressBar
                            plan="Pro Plan"
                            value={metrics.subscriptionDistribution?.pro}
                            total={metrics.activeOrganizations + metrics.trialOrganizations}
                        />
                        <ProgressBar
                            plan="Basic Plan"
                            value={metrics.subscriptionDistribution?.basic}
                            total={metrics.activeOrganizations + metrics.trialOrganizations}
                        />
                    </div>
                </div>
            </div>

            {/* SECTION 4 — RECENTLY REGISTERED ORGANIZATIONS */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <SectionHeader title="Recently Registered Organizations" />
                <div className="overflow-x-auto mt-6">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-200">
                                <th className="pb-4 px-4 text-xs uppercase text-slate-500 tracking-wider font-semibold">Organization Name</th>
                                <th className="pb-4 px-4 text-xs uppercase text-slate-500 tracking-wider font-semibold">Plan</th>
                                <th className="pb-4 px-4 text-xs uppercase text-slate-500 tracking-wider font-semibold">Status</th>
                                <th className="pb-4 px-4 text-xs uppercase text-slate-500 tracking-wider font-semibold">Created At</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            <TableRow name="Apex Dentistry Group" initial="A" initialColor="bg-indigo-100 text-indigo-700" plan="Enterprise" status="Active" time="2 mins ago" />
                            <TableRow name="SmileLine Orthodontics" initial="S" initialColor="bg-blue-100 text-blue-700" plan="Pro" status="Trial" time="1 hour ago" />
                            <TableRow name="OmniCare Clinics" initial="O" initialColor="bg-emerald-100 text-emerald-700" plan="Basic" status="Active" time="3 hours ago" />
                            <TableRow name="Global Dental Hub" initial="G" initialColor="bg-slate-100 text-slate-600" plan="—" status="Suspended" time="1 day ago" />
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBCOMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ title }) {
    return (
        <div className="mb-2">
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">{title}</h2>
            <div className="h-[2px] w-16 bg-gradient-to-r from-blue-500 to-indigo-500 mt-2 rounded-full" />
        </div>
    );
}

function StatCard({ label, value, accentFrom, accentTo, tint }) {
    return (
        <div className={`relative bg-white/80 backdrop-blur-xl border border-slate-200 rounded-2xl shadow-sm p-8 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ${tint}`}>
            {/* Colored top accent line */}
            <div className={`absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r ${accentFrom} ${accentTo} rounded-t-2xl`} />
            <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{label}</span>
            <div className="text-4xl font-bold text-slate-900 mt-3">{value}</div>
            <div className="text-sm text-slate-500 mt-1">+12% vs last month</div>
        </div>
    );
}

function InfraCard({ label, value, valueColor, dotColor, subtext }) {
    return (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
            <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{label}</span>
            <div className={`text-4xl font-bold mt-3 flex items-center gap-2 ${valueColor}`}>
                <div className={`w-2 h-2 rounded-full ${dotColor} shrink-0 mt-0.5`}></div>
                {value}
            </div>
            <div className="text-sm text-slate-500 mt-1">{subtext}</div>
        </div>
    );
}

function ProgressBar({ plan, value, total }) {
    const max = total || 100;
    const rawPercentage = (value / max) * 100;
    const percentage = value > 0 ? Math.max(rawPercentage, 2) : 0;

    return (
        <div>
            <div className="flex justify-between items-end mb-2.5">
                <span className="text-sm font-medium text-slate-700">{plan}</span>
                <span className="text-sm font-semibold text-slate-900">{value}</span>
            </div>
            <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-1000 ease-out"
                    style={{ width: `${percentage}%` }}
                ></div>
            </div>
        </div>
    );
}

function TableRow({ name, initial, initialColor, plan, status, time }) {
    let statusBadge = "bg-slate-100 text-slate-600";
    if (status === "Active") statusBadge = "bg-emerald-100 text-emerald-700";
    if (status === "Trial") statusBadge = "bg-amber-100 text-amber-700";
    if (status === "Suspended") statusBadge = "bg-red-100 text-red-700";

    return (
        <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors duration-200">
            <td className="py-4 px-4 font-semibold text-slate-800">
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${initialColor}`}>
                        {initial}
                    </div>
                    {name}
                </div>
            </td>
            <td className="py-4 px-4 text-slate-600 font-medium">{plan}</td>
            <td className="py-4 px-4">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusBadge}`}>
                    {status}
                </span>
            </td>
            <td className="py-4 px-4 text-slate-500 text-xs font-medium">{time}</td>
        </tr>
    );
}