/**
 * AuthDonutChart.jsx — Allow vs Deny Distribution
 *
 * Donut/pie chart with center label for allow/deny ratio.
 * Uses Recharts PieChart with custom active shape.
 *
 * MODULE: frontend/src/modules/org/security/analytics
 * PLANE: Org only.
 */
import React, { useState } from "react";
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Sector,
} from "recharts";

const renderActiveShape = (props) => {
    const {
        cx,
        cy,
        innerRadius,
        outerRadius,
        startAngle,
        endAngle,
        fill,
        payload,
        percent,
        value,
    } = props;

    return (
        <g>
            {/* Center text */}
            <text
                x={cx}
                y={cy - 8}
                textAnchor="middle"
                fill="#0F172A"
                style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em" }}
            >
                {(percent * 100).toFixed(1)}%
            </text>
            <text
                x={cx}
                y={cy + 14}
                textAnchor="middle"
                fill="#94A3B8"
                style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}
            >
                {payload.name}
            </text>
            <text
                x={cx}
                y={cy + 30}
                textAnchor="middle"
                fill="#64748B"
                style={{ fontSize: 10, fontWeight: 600 }}
            >
                {value?.toLocaleString()} requests
            </text>

            {/* Active segment */}
            <Sector
                cx={cx}
                cy={cy}
                innerRadius={innerRadius}
                outerRadius={outerRadius + 6}
                startAngle={startAngle}
                endAngle={endAngle}
                fill={fill}
                style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.15))" }}
            />
            <Sector
                cx={cx}
                cy={cy}
                innerRadius={outerRadius + 10}
                outerRadius={outerRadius + 14}
                startAngle={startAngle}
                endAngle={endAngle}
                fill={fill}
                opacity={0.3}
            />
        </g>
    );
};

export default function AuthDonutChart({ data = [] }) {
    const [activeIndex, setActiveIndex] = useState(0);

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
                    Decision Distribution
                </h3>
                <p
                    style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#94A3B8",
                        margin: "4px 0 0",
                    }}
                >
                    Allow vs Deny ratio
                </p>
            </div>

            {/* Chart */}
            <div
                style={{
                    padding: "16px 24px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                }}
            >
                <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                        <Pie
                            activeIndex={activeIndex}
                            activeShape={renderActiveShape}
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={95}
                            paddingAngle={3}
                            dataKey="value"
                            onMouseEnter={(_, index) => setActiveIndex(index)}
                            style={{ cursor: "pointer", outline: "none" }}
                        >
                            {data.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={entry.color}
                                    stroke="none"
                                />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>

                {/* Legend */}
                <div
                    style={{
                        display: "flex",
                        gap: 20,
                        marginTop: 8,
                        paddingBottom: 8,
                    }}
                >
                    {data.map((entry, idx) => (
                        <div
                            key={idx}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                cursor: "pointer",
                                padding: "6px 14px",
                                borderRadius: 10,
                                background:
                                    activeIndex === idx
                                        ? `${entry.color}12`
                                        : "transparent",
                                transition: "background 0.2s",
                            }}
                            onMouseEnter={() => setActiveIndex(idx)}
                        >
                            <div
                                style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: "50%",
                                    background: entry.color,
                                }}
                            />
                            <span
                                style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: "#475569",
                                }}
                            >
                                {entry.name}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
