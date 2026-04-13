/**
 * AuthLayerPerformance.jsx — Auth Layer Performance Metrics
 *
 * Horizontal performance bars for each auth layer: RBAC, ENTITLEMENT,
 * PBAC, FIELD_WRITE, FIELD_READ with avg/p99 durations and pass rates.
 *
 * MODULE: frontend/src/modules/org/security/analytics
 * PLANE: Org only.
 */
import React from "react";
import { Zap, Clock, CheckCircle2 } from "lucide-react";

const LAYER_COLORS = {
    RBAC: { primary: "#4F46E5", bg: "#EEF2FF" },
    ENTITLEMENT: { primary: "#8B5CF6", bg: "#F5F3FF" },
    PBAC: { primary: "#2563EB", bg: "#EFF6FF" },
    FIELD_WRITE: { primary: "#F59E0B", bg: "#FFFBEB" },
    FIELD_READ: { primary: "#10B981", bg: "#ECFDF5" },
};

export default function AuthLayerPerformance({ data = [] }) {
    const maxP99 = Math.max(...data.map((d) => d.p99Ms), 1);

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
                            margin: 0,
                        }}
                    >
                        Layer Performance
                    </h3>
                    <p
                        style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#94A3B8",
                            margin: "4px 0 0",
                        }}
                    >
                        Average & P99 latency per auth layer
                    </p>
                </div>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 14px",
                        background: "#EEF2FF",
                        borderRadius: 10,
                        color: "#4F46E5",
                        fontSize: 12,
                        fontWeight: 700,
                    }}
                >
                    <Zap size={14} />
                    {data.length} layers
                </div>
            </div>

            {/* Layers */}
            <div style={{ padding: "16px 24px 20px" }}>
                {data.map((layer, idx) => {
                    const colors =
                        LAYER_COLORS[layer.layer] || LAYER_COLORS.RBAC;
                    const barWidth = Math.max(
                        8,
                        (layer.p99Ms / maxP99) * 100
                    );

                    return (
                        <div
                            key={idx}
                            style={{
                                padding: "14px 16px",
                                borderRadius: 14,
                                marginBottom: 8,
                                transition: "background 0.15s",
                                cursor: "default",
                            }}
                            onMouseEnter={(e) =>
                                (e.currentTarget.style.background = "#F8FAFC")
                            }
                            onMouseLeave={(e) =>
                                (e.currentTarget.style.background =
                                    "transparent")
                            }
                        >
                            {/* Layer header */}
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginBottom: 10,
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 800,
                                            padding: "4px 10px",
                                            borderRadius: 8,
                                            background: colors.bg,
                                            color: colors.primary,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.05em",
                                            fontFamily:
                                                "'JetBrains Mono', monospace",
                                        }}
                                    >
                                        {layer.layer}
                                    </span>
                                    <span
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 600,
                                            color: "#94A3B8",
                                        }}
                                    >
                                        {layer.totalChecks?.toLocaleString()} checks
                                    </span>
                                </div>

                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 16,
                                    }}
                                >
                                    <MetricBadge
                                        icon={<Clock size={12} />}
                                        label="AVG"
                                        value={`${layer.avgMs}ms`}
                                        color="#475569"
                                    />
                                    <MetricBadge
                                        icon={<Clock size={12} />}
                                        label="P99"
                                        value={`${layer.p99Ms}ms`}
                                        color="#EF4444"
                                    />
                                    <MetricBadge
                                        icon={<CheckCircle2 size={12} />}
                                        label="PASS"
                                        value={`${layer.passRate}%`}
                                        color="#10B981"
                                    />
                                </div>
                            </div>

                            {/* P99 bar */}
                            <div
                                style={{
                                    width: "100%",
                                    height: 8,
                                    background: "#F1F5F9",
                                    borderRadius: 4,
                                    overflow: "hidden",
                                }}
                            >
                                <div
                                    style={{
                                        height: "100%",
                                        borderRadius: 4,
                                        background: `linear-gradient(90deg, ${colors.primary}, ${colors.primary}80)`,
                                        width: `${barWidth}%`,
                                        transition:
                                            "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function MetricBadge({ icon, label, value, color }) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                fontWeight: 700,
                color,
            }}
        >
            {icon}
            <span style={{ color: "#94A3B8" }}>{label}</span>
            <span>{value}</span>
        </div>
    );
}
