/**
 * OverviewTab.jsx — Security Dashboard Overview (Connected)
 *
 * Replaces static mock data with live backend data via useSecurityOverview().
 * Shows KPIs, weekly access chart, and recent security alerts.
 */
import React from "react";
import {
    ShieldCheck,
    ShieldAlert,
    Lock,
    Activity,
    TrendingUp,
    AlertCircle,
    CheckCircle2,
} from "lucide-react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { useSecurityOverview, useCoverage } from "../hooks/useSecurity";

export default function OverviewTab() {
    const { data, isLoading, error } = useSecurityOverview();
    const { data: coverage } = useCoverage();

    if (isLoading) return <OverviewSkeleton />;
    if (error) return <ErrorState message="Failed to load security overview" />;
    if (!data) return null;

    const { kpis, weeklyChart } = data;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {/* KPI Cards */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 20,
                }}
            >
                <KPICard
                    title="Policy Coverage"
                    value={`${kpis.policyCoverage}%`}
                    change={`${kpis.coveredWritePermissions}/${kpis.writePermissions}`}
                    icon={<ShieldCheck size={20} />}
                    color="#4F46E5"
                    bg="#EEF2FF"
                />
                <KPICard
                    title="Route Matrix"
                    value={String(kpis.matrixCoverage)}
                    change="guarded routes"
                    icon={<Lock size={20} />}
                    color="#8B5CF6"
                    bg="#F5F3FF"
                />
                <KPICard
                    title="Total Permissions"
                    value={String(kpis.totalPermissions)}
                    change={`${kpis.writePermissions} write`}
                    icon={<Activity size={20} />}
                    color="#3B82F6"
                    bg="#EFF6FF"
                />
                <KPICard
                    title="Active Policies"
                    value={String(kpis.activePolicies)}
                    change={`${kpis.totalRules} rules`}
                    icon={<CheckCircle2 size={20} />}
                    color="#10B981"
                    bg="#ECFDF5"
                />
                <KPICard
                    title="Recent Denials"
                    value={String(kpis.recentDenials)}
                    change="last 24h"
                    icon={<ShieldAlert size={20} />}
                    color={kpis.recentDenials > 0 ? "#F59E0B" : "#10B981"}
                    bg={kpis.recentDenials > 0 ? "#FFFBEB" : "#ECFDF5"}
                />
                <KPICard
                    title="Field RBAC"
                    value={`${kpis.fieldCoverage ?? 0}%`}
                    change="role coverage"
                    icon={<Lock size={20} />}
                    color="#0EA5E9"
                    bg="#F0F9FF"
                />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 32 }}>
                {/* Chart */}
                <div
                    style={{
                        background: "#fff",
                        borderRadius: 24,
                        border: "1px solid #E2E8F0",
                        overflow: "hidden",
                    }}
                >
                    <div
                        style={{
                            padding: "20px 24px",
                            borderBottom: "1px solid #F1F5F9",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}
                    >
                        <div>
                            <h3
                                style={{
                                    fontSize: 13,
                                    fontWeight: 900,
                                    color: "#1E293B",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                    margin: 0,
                                }}
                            >
                                Access Requests
                            </h3>
                            <p
                                style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: "#94A3B8",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                    margin: "4px 0 0",
                                }}
                            >
                                Allowed vs Denied (Last 7 Days)
                            </p>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                            <Legend color="#4F46E5" label="Allowed" />
                            <Legend color="#E11D48" label="Denied" />
                        </div>
                    </div>
                    <div style={{ padding: 24, minHeight: 300 }}>
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart
                                data={weeklyChart}
                                margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
                            >
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    vertical={false}
                                    stroke="#F1F5F9"
                                />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fontWeight: 700, fill: "#94A3B8" }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fontWeight: 700, fill: "#94A3B8" }}
                                />
                                <Tooltip
                                    cursor={{ fill: "#F8FAFC" }}
                                    contentStyle={{
                                        borderRadius: 16,
                                        border: "1px solid #E2E8F0",
                                        boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                                        fontSize: 12,
                                        fontWeight: 700,
                                    }}
                                />
                                <Bar
                                    dataKey="allowed"
                                    fill="#4F46E5"
                                    radius={[4, 4, 0, 0]}
                                    barSize={24}
                                />
                                <Bar
                                    dataKey="denied"
                                    fill="#E11D48"
                                    radius={[4, 4, 0, 0]}
                                    barSize={24}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Policy Stats */}
                <div
                    style={{
                        background: "#fff",
                        borderRadius: 24,
                        border: "1px solid #E2E8F0",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <div
                        style={{
                            padding: "20px 24px",
                            borderBottom: "1px solid #F1F5F9",
                        }}
                    >
                        <h3
                            style={{
                                fontSize: 13,
                                fontWeight: 900,
                                color: "#1E293B",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                margin: 0,
                            }}
                        >
                            Policy Statistics
                        </h3>
                    </div>
                    <div
                        style={{
                            flex: 1,
                            padding: 24,
                            display: "flex",
                            flexDirection: "column",
                            gap: 16,
                        }}
                    >
                        <StatRow label="Allow Rules" value={kpis.allowRules} color="#10B981" />
                        <StatRow label="Deny Rules" value={kpis.denyRules} color="#E11D48" />
                        <StatRow
                            label="Coverage"
                            value={`${kpis.policyCoverage}%`}
                            color="#4F46E5"
                        />
                        <div style={{ borderTop: "1px solid #F1F5F9", margin: "4px 0" }} />
                        <StatRow
                            label="Allowed (7d)"
                            value={kpis.allowedLast7Days || 0}
                            color="#10B981"
                        />
                        <StatRow
                            label="Denied (7d)"
                            value={kpis.deniedLast7Days || 0}
                            color="#E11D48"
                        />
                        {coverage && (
                            <>
                                <div style={{ borderTop: "1px solid #F1F5F9", margin: "4px 0" }} />
                                <StatRow
                                    label="Covered Write Perms"
                                    value={coverage.covered?.length || 0}
                                    color="#10B981"
                                />
                                <StatRow
                                    label="Uncovered Write Perms"
                                    value={coverage.uncovered?.length || 0}
                                    color={
                                        (coverage.uncovered?.length || 0) > 0
                                            ? "#E11D48"
                                            : "#10B981"
                                    }
                                />
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function KPICard({ title, value, change, icon, color, bg }) {
    return (
        <div
            style={{
                background: "#fff",
                padding: 24,
                borderRadius: 24,
                border: "1px solid #E2E8F0",
                transition: "box-shadow 0.2s",
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 16,
                }}
            >
                <div
                    style={{
                        width: 48,
                        height: 48,
                        borderRadius: 16,
                        background: bg,
                        color: color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    {icon}
                </div>
                <span
                    style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: "#94A3B8",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        background: "#F8FAFC",
                        padding: "4px 8px",
                        borderRadius: 8,
                    }}
                >
                    <TrendingUp size={12} />
                    {change}
                </span>
            </div>
            <p
                style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: "#94A3B8",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    margin: "0 0 4px",
                }}
            >
                {title}
            </p>
            <span
                style={{
                    fontSize: 28,
                    fontWeight: 900,
                    color: "#1E293B",
                    letterSpacing: "-0.02em",
                }}
            >
                {value}
            </span>
        </div>
    );
}

function StatRow({ label, value, color }) {
    return (
        <div
            style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                borderRadius: 12,
                background: "#F8FAFC",
            }}
        >
            <span
                style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#64748B",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                }}
            >
                {label}
            </span>
            <span style={{ fontSize: 15, fontWeight: 900, color }}>{value}</span>
        </div>
    );
}

function Legend({ color, label }) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                background: `${color}10`,
                borderRadius: 8,
                fontSize: 10,
                fontWeight: 800,
                color,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
            }}
        >
            <div
                style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: color,
                }}
            />
            {label}
        </div>
    );
}

function OverviewSkeleton() {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 20,
                }}
            >
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                        key={i}
                        style={{
                            height: 140,
                            background: "#F1F5F9",
                            borderRadius: 24,
                            animation: "pulse 1.5s ease-in-out infinite",
                        }}
                    />
                ))}
            </div>
            <div style={{ height: 400, background: "#F1F5F9", borderRadius: 24 }} />
        </div>
    );
}

function ErrorState({ message }) {
    return (
        <div
            style={{
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                borderRadius: 16,
                padding: 32,
                textAlign: "center",
            }}
        >
            <AlertCircle
                size={40}
                style={{ color: "#EF4444", margin: "0 auto 12px" }}
            />
            <p style={{ fontSize: 14, fontWeight: 700, color: "#991B1B" }}>{message}</p>
        </div>
    );
}
