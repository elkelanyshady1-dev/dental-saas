/**
 * AuthFieldViolations.jsx — Field-Level Access Violations
 *
 * Displays a list of the most-violated protected fields,
 * including attempt counts and last attempt timestamp.
 *
 * MODULE: frontend/src/modules/org/security/analytics
 * PLANE: Org only.
 */
import React from "react";
import { Lock, ShieldAlert, Clock } from "lucide-react";

export default function AuthFieldViolations({ data = [] }) {
    const maxAttempts = Math.max(...data.map((d) => d.attempts), 1);

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
                        Field Violations
                    </h3>
                    <p
                        style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#94A3B8",
                            margin: "4px 0 0",
                        }}
                    >
                        Most-targeted protected fields
                    </p>
                </div>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 14px",
                        background: "#FEF2F2",
                        borderRadius: 10,
                        color: "#EF4444",
                        fontSize: 12,
                        fontWeight: 700,
                    }}
                >
                    <ShieldAlert size={14} />
                    {data.reduce((sum, d) => sum + d.attempts, 0).toLocaleString()} total
                </div>
            </div>

            {/* List */}
            <div style={{ padding: "12px 16px 16px" }}>
                {data.map((field, idx) => {
                    const barWidth = Math.max(
                        8,
                        (field.attempts / maxAttempts) * 100
                    );
                    const severity =
                        field.attempts > 200
                            ? { color: "#EF4444", bg: "#FEF2F2" }
                            : field.attempts > 100
                            ? { color: "#F59E0B", bg: "#FFFBEB" }
                            : { color: "#64748B", bg: "#F8FAFC" };

                    return (
                        <div
                            key={idx}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                padding: "14px 16px",
                                borderRadius: 14,
                                transition: "background 0.15s",
                                cursor: "default",
                                gap: 14,
                            }}
                            onMouseEnter={(e) =>
                                (e.currentTarget.style.background = "#F8FAFC")
                            }
                            onMouseLeave={(e) =>
                                (e.currentTarget.style.background =
                                    "transparent")
                            }
                        >
                            {/* Lock icon */}
                            <div
                                style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 10,
                                    background: severity.bg,
                                    color: severity.color,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                }}
                            >
                                <Lock size={14} />
                            </div>

                            {/* Field name & bar */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        marginBottom: 6,
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 12,
                                            fontWeight: 700,
                                            color: "#0F172A",
                                            fontFamily:
                                                "'JetBrains Mono', monospace",
                                        }}
                                    >
                                        {field.field}
                                    </span>
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 12,
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontSize: 11,
                                                fontWeight: 700,
                                                color: severity.color,
                                            }}
                                        >
                                            {field.attempts.toLocaleString()} attempts
                                        </span>
                                        <span
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 4,
                                                fontSize: 10,
                                                fontWeight: 600,
                                                color: "#94A3B8",
                                            }}
                                        >
                                            <Clock size={10} />
                                            {field.lastAttempt}
                                        </span>
                                    </div>
                                </div>

                                {/* Progress bar */}
                                <div
                                    style={{
                                        width: "100%",
                                        height: 5,
                                        background: "#F1F5F9",
                                        borderRadius: 3,
                                        overflow: "hidden",
                                    }}
                                >
                                    <div
                                        style={{
                                            height: "100%",
                                            borderRadius: 3,
                                            background: `linear-gradient(90deg, ${severity.color}, ${severity.color}60)`,
                                            width: `${barWidth}%`,
                                            transition:
                                                "width 0.5s ease",
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
