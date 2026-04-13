/**
 * RevenueChart.jsx — Daily / Monthly Revenue Analytics (Phase 4 — CQRS Fixed)
 *
 * ✅ Phase 4 FE fixes applied:
 *   - useState/useEffect REMOVED → React Query only (Rule 11.1)
 *   - invoicesApi REMOVED → accountingApi (CQRS read side)
 *   - useCapability("accounting.read") guard added (Step 8)
 *   - useOrgSocket real-time invalidation added (Step 7)
 *
 * Data source: /org/accounting/daily | /org/accounting/monthly
 * (accountingDomain projection — CQRS READ side)
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend,
} from "recharts";
import { accountingApi } from "../api/accounting.api";
import { QK } from "@/lib/query/queryKeys";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { useOrgSocket } from "@/hooks/useOrgSocket";

const VIEWS = ["daily", "monthly"];

// Custom tooltip
const CustomTooltip = ({ active, payload, label, currency = "EGP" }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-xl px-4 py-3 text-sm min-w-[140px]">
            <p className="font-bold text-gray-700 mb-2">{label}</p>
            {payload.map((p) => (
                <p key={p.name} className="flex items-center justify-between gap-4">
                    <span style={{ color: p.color }} className="font-medium">{p.name}</span>
                    <span className="font-bold text-gray-800">{Number(p.value).toLocaleString()} {currency}</span>
                </p>
            ))}
        </div>
    );
};

// ── Placeholder builder (used when API returns empty) ──────────────────────

function buildPlaceholder(view) {
    const now = new Date();
    const count = view === "daily" ? 14 : 6;
    return Array.from({ length: count }, (_, i) => {
        const d = new Date(now);
        if (view === "daily") d.setDate(d.getDate() - (count - 1 - i));
        else d.setMonth(d.getMonth() - (count - 1 - i));
        return {
            label: view === "daily"
                ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
            revenue: 0,
            collected: 0,
        };
    });
}

export default function RevenueChart({ currency = "EGP" }) {
    // ✅ Step 8 — Capability guard (accounting.read)
    const canView = useCapability(P.ACCOUNTING_READ);

    // UI-only state — view toggle is local, not server state (Rule 11.1 compliant)
    const [view, setView] = useState("daily");

    const params = { period: view };

    // ✅ Step 2 — React Query replaces useState + useEffect + invoicesApi
    // ✅ CQRS: accountingApi.getDailySummary / getMonthlySummary (READ projection)
    const { data: rawData, isLoading } = useQuery({
        queryKey: view === "daily"
            ? QK.accounting.daily(params)
            : QK.accounting.monthly(params),
        queryFn: () => view === "daily"
            ? accountingApi.getDailySummary(params)
            : accountingApi.getMonthlySummary(params),
        select: (res) => res.data?.data || res.data || [],
        placeholderData: (prev) => prev,
        staleTime: 60_000,
    });

    // ✅ Step 7 — Real-time invalidation
    useOrgSocket("accounting.updated.v1", QK.accounting.all);

    // Guard: hide component entirely if no permission
    if (!canView) return null;

    const data = (rawData && rawData.length > 0) ? rawData : buildPlaceholder(view);
    const hasData = data.some((d) => (d.revenue || 0) > 0);

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-sm font-bold text-gray-800">Revenue Analytics</h3>
                    <p className="text-xs text-gray-400">Billed vs collected</p>
                </div>
                <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-0.5">
                    {VIEWS.map((v) => (
                        <button key={v} onClick={() => setView(v)}
                            className={`px-4 py-1.5 rounded-xl text-xs font-semibold capitalize transition ${
                                view === v ? "bg-white shadow text-gray-800" : "text-gray-500"
                            }`}>
                            {v}
                        </button>
                    ))}
                </div>
            </div>

            {/* Chart */}
            {isLoading ? (
                <div className="h-52 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
            ) : !hasData ? (
                <div className="h-52 flex flex-col items-center justify-center text-gray-300">
                    <svg className="w-10 h-10 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <p className="text-sm font-medium">No revenue data yet</p>
                </div>
            ) : (
                <ResponsiveContainer width="100%" height={208}>
                    <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false}
                            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={36} />
                        <Tooltip content={<CustomTooltip currency={currency} />} />
                        <Legend iconType="circle" iconSize={8}
                            formatter={(v) => <span className="text-xs text-gray-500 capitalize">{v}</span>} />
                        <Area type="monotone" dataKey="revenue" name="Billed" stroke="#3b82f6" strokeWidth={2}
                            fill="url(#revGrad)" dot={false} activeDot={{ r: 4, fill: "#3b82f6" }} />
                        <Area type="monotone" dataKey="collected" name="Collected" stroke="#10b981" strokeWidth={2}
                            fill="url(#colGrad)" dot={false} activeDot={{ r: 4, fill: "#10b981" }} />
                    </AreaChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
