/**
 * AuthRiskUsersTable.jsx — Top Risk Users Table
 *
 * Shows users with the highest denial counts,
 * color-coded by risk level (high/medium/low).
 *
 * MODULE: frontend/src/modules/org/security/analytics
 * PLANE: Org only.
 */
import React from "react";
import { AlertTriangle, User } from "lucide-react";

const RISK_CONFIG = {
    high: { bg: "#FEF2F2", text: "#DC2626", border: "#FECACA", label: "HIGH" },
    medium: { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A", label: "MEDIUM" },
    low: { bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0", label: "LOW" },
};

export default function AuthRiskUsersTable({ data = [] }) {
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
                        Risk Users
                    </h3>
                    <p
                        style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#94A3B8",
                            margin: "4px 0 0",
                        }}
                    >
                        Users with highest denial frequency
                    </p>
                </div>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 14px",
                        background: "#FFFBEB",
                        borderRadius: 10,
                        color: "#D97706",
                        fontSize: 12,
                        fontWeight: 700,
                    }}
                >
                    <AlertTriangle size={14} />
                    {data.filter((u) => u.riskLevel === "high").length} high risk
                </div>
            </div>

            {/* List */}
            <div style={{ padding: "8px 12px" }}>
                {data.map((row, idx) => {
                    const risk = RISK_CONFIG[row.riskLevel] || RISK_CONFIG.low;
                    return (
                        <div
                            key={idx}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                padding: "14px 16px",
                                borderRadius: 14,
                                transition: "background 0.15s",
                                cursor: "pointer",
                                gap: 14,
                            }}
                            onMouseEnter={(e) =>
                                (e.currentTarget.style.background = "#F8FAFC")
                            }
                            onMouseLeave={(e) =>
                                (e.currentTarget.style.background = "transparent")
                            }
                        >
                            {/* Avatar */}
                            <div
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 12,
                                    background: risk.bg,
                                    color: risk.text,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                }}
                            >
                                <User size={16} />
                            </div>

                            {/* Name */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p
                                    style={{
                                        fontSize: 13,
                                        fontWeight: 700,
                                        color: "#0F172A",
                                        margin: 0,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {row.user}
                                </p>
                                <p
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: "#94A3B8",
                                        margin: "2px 0 0",
                                    }}
                                >
                                    {row.denialCount} denials
                                </p>
                            </div>

                            {/* Risk badge */}
                            <span
                                style={{
                                    fontSize: 10,
                                    fontWeight: 800,
                                    padding: "4px 12px",
                                    borderRadius: 20,
                                    background: risk.bg,
                                    color: risk.text,
                                    border: `1px solid ${risk.border}`,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.06em",
                                    flexShrink: 0,
                                }}
                            >
                                {risk.label}
                            </span>

                            {/* Bar */}
                            <div
                                style={{
                                    width: 80,
                                    height: 6,
                                    background: "#F1F5F9",
                                    borderRadius: 3,
                                    overflow: "hidden",
                                    flexShrink: 0,
                                }}
                            >
                                <div
                                    style={{
                                        height: "100%",
                                        borderRadius: 3,
                                        background: risk.text,
                                        width: `${Math.min(
                                            100,
                                            (row.denialCount / (data[0]?.denialCount || 1)) * 100
                                        )}%`,
                                        transition: "width 0.5s ease",
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
