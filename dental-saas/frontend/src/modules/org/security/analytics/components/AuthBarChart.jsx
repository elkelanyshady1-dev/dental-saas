/**
 * AuthBarChart.jsx — Top Denied Permissions
 *
 * Horizontal bar chart showing the most-denied permissions.
 * Uses Recharts BarChart with custom tooltip and rounded bars.
 *
 * MODULE: frontend/src/modules/org/security/analytics
 * PLANE: Org only.
 */
import React from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from "recharts";

const BAR_COLORS = [
    "#EF4444", "#F97316", "#F59E0B", "#EAB308",
    "#84CC16", "#22C55E", "#14B8A6", "#06B6D4",
];

function CustomTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;
    const { name, value } = payload[0]?.payload || {};

    return (
        <div
            style={{
                background: "#0F172A",
                border: "1px solid #1E293B",
                borderRadius: 12,
                padding: "12px 16px",
                boxShadow: "0 16px 32px rgba(0,0,0,0.3)",
            }}
        >
            <p
                style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#F1F5F9",
                    margin: "0 0 4px",
                    fontFamily: "'JetBrains Mono', monospace",
                }}
            >
                {name}
            </p>
            <p
                style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: "#EF4444",
                    margin: 0,
                }}
            >
                {value?.toLocaleString()} denials
            </p>
        </div>
    );
}

export default function AuthBarChart({ data = [] }) {
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
                }}
            >
                <h3
                    style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: "#0F172A",
                        letterSpacing: "-0.01em",
                        margin: 0,
                    }}
                >
                    Top Denied Permissions
                </h3>
                <p
                    style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#94A3B8",
                        margin: "4px 0 0",
                    }}
                >
                    Permission denials by count
                </p>
            </div>

            {/* Chart */}
            <div style={{ padding: "16px 24px 24px" }}>
                <ResponsiveContainer width="100%" height={320}>
                    <BarChart
                        data={data}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                    >
                        <CartesianGrid
                            strokeDasharray="3 3"
                            horizontal={false}
                            stroke="#F1F5F9"
                        />
                        <XAxis
                            type="number"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fontWeight: 600, fill: "#94A3B8" }}
                        />
                        <YAxis
                            type="category"
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            tick={{
                                fontSize: 11,
                                fontWeight: 700,
                                fill: "#475569",
                                fontFamily: "'JetBrains Mono', monospace",
                            }}
                            width={90}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: "#F8FAFC" }} />
                        <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
                            {data.map((_, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={BAR_COLORS[index % BAR_COLORS.length]}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
