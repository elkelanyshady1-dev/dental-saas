/**
 * AuthLineChart.jsx — Authorization Timeline Chart
 *
 * Smooth line chart showing allow vs deny requests over time.
 * Uses Recharts with custom tooltips and gradient fills.
 *
 * MODULE: frontend/src/modules/org/security/analytics
 * PLANE: Org only.
 */
import React from "react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    AreaChart,
} from "recharts";

function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;

    return (
        <div
            style={{
                background: "#0F172A",
                border: "1px solid #1E293B",
                borderRadius: 14,
                padding: "14px 18px",
                boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
            }}
        >
            <p
                style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#94A3B8",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    margin: "0 0 10px",
                }}
            >
                {label}
            </p>
            {payload.map((entry, idx) => (
                <div
                    key={idx}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                    }}
                >
                    <div
                        style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: entry.color,
                        }}
                    />
                    <span
                        style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#CBD5E1",
                        }}
                    >
                        {entry.name}:
                    </span>
                    <span
                        style={{
                            fontSize: 13,
                            fontWeight: 800,
                            color: "#F1F5F9",
                        }}
                    >
                        {entry.value?.toLocaleString()}
                    </span>
                </div>
            ))}
        </div>
    );
}

export default function AuthLineChart({ data = [] }) {
    return (
        <div
            style={{
                background: "#fff",
                borderRadius: 20,
                border: "1px solid #E2E8F0",
                overflow: "hidden",
            }}
        >
            {/* Header */}
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
                            fontSize: 14,
                            fontWeight: 800,
                            color: "#0F172A",
                            letterSpacing: "-0.01em",
                            margin: 0,
                        }}
                    >
                        Authorization Timeline
                    </h3>
                    <p
                        style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#94A3B8",
                            margin: "4px 0 0",
                        }}
                    >
                        Allow vs Deny requests over time
                    </p>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                    <LegendDot color="#10B981" label="Allowed" />
                    <LegendDot color="#EF4444" label="Denied" />
                </div>
            </div>

            {/* Chart */}
            <div style={{ padding: "20px 24px 24px", minHeight: 300 }}>
                <ResponsiveContainer width="100%" height={280}>
                    <AreaChart
                        data={data}
                        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                        <defs>
                            <linearGradient id="allowGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10B981" stopOpacity={0.15} />
                                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="denyGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.15} />
                                <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="#F1F5F9"
                        />
                        <XAxis
                            dataKey="time"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fontWeight: 600, fill: "#94A3B8" }}
                            dy={10}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fontWeight: 600, fill: "#94A3B8" }}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Area
                            type="monotone"
                            dataKey="allow"
                            name="Allowed"
                            stroke="#10B981"
                            strokeWidth={2.5}
                            fill="url(#allowGrad)"
                            dot={false}
                            activeDot={{
                                r: 5,
                                fill: "#10B981",
                                stroke: "#fff",
                                strokeWidth: 2,
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="deny"
                            name="Denied"
                            stroke="#EF4444"
                            strokeWidth={2.5}
                            fill="url(#denyGrad)"
                            dot={false}
                            activeDot={{
                                r: 5,
                                fill: "#EF4444",
                                stroke: "#fff",
                                strokeWidth: 2,
                            }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

function LegendDot({ color, label }) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                background: `${color}0D`,
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 700,
                color,
            }}
        >
            <div
                style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: color,
                }}
            />
            {label}
        </div>
    );
}
