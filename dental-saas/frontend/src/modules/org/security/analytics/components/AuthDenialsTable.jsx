/**
 * AuthDenialsTable.jsx — Recent Authorization Denials Table
 *
 * Displays recent denied access attempts with user, role, permission,
 * endpoint, time, and status badge.
 *
 * MODULE: frontend/src/modules/org/security/analytics
 * PLANE: Org only.
 */
import React from "react";
import { ShieldX, ExternalLink } from "lucide-react";

const ROLE_COLORS = {
    dentist: { bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE" },
    nurse: { bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0" },
    receptionist: { bg: "#FFF7ED", text: "#EA580C", border: "#FED7AA" },
    lab_tech: { bg: "#F5F3FF", text: "#7C3AED", border: "#DDD6FE" },
    intern: { bg: "#FDF2F8", text: "#DB2777", border: "#FBCFE8" },
    admin: { bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" },
};

export default function AuthDenialsTable({ data = [] }) {
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
                        Recent Denials
                    </h3>
                    <p
                        style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#94A3B8",
                            margin: "4px 0 0",
                        }}
                    >
                        Latest authorization failures
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
                    <ShieldX size={14} />
                    {data.length} denials
                </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: "auto" }}>
                <table
                    style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        minWidth: 700,
                    }}
                >
                    <thead>
                        <tr
                            style={{
                                background: "#F8FAFC",
                                borderBottom: "1px solid #E2E8F0",
                            }}
                        >
                            {["User", "Role", "Permission", "Endpoint", "Time", "Status"].map(
                                (h) => (
                                    <th
                                        key={h}
                                        style={{
                                            padding: "12px 16px",
                                            fontSize: 10,
                                            fontWeight: 800,
                                            color: "#94A3B8",
                                            textTransform: "uppercase",
                                            letterSpacing: "0.08em",
                                            textAlign: "start",
                                        }}
                                    >
                                        {h}
                                    </th>
                                )
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row) => {
                            const roleCfg =
                                ROLE_COLORS[row.role] || ROLE_COLORS.admin;
                            return (
                                <tr
                                    key={row.id}
                                    style={{
                                        borderBottom: "1px solid #F1F5F9",
                                        transition: "background 0.15s",
                                        cursor: "pointer",
                                    }}
                                    onMouseEnter={(e) =>
                                        (e.currentTarget.style.background = "#FAFBFC")
                                    }
                                    onMouseLeave={(e) =>
                                        (e.currentTarget.style.background = "transparent")
                                    }
                                >
                                    <td
                                        style={{
                                            padding: "14px 16px",
                                            fontSize: 13,
                                            fontWeight: 700,
                                            color: "#0F172A",
                                        }}
                                    >
                                        {row.user}
                                    </td>
                                    <td style={{ padding: "14px 16px" }}>
                                        <span
                                            style={{
                                                fontSize: 11,
                                                fontWeight: 700,
                                                padding: "4px 10px",
                                                borderRadius: 8,
                                                background: roleCfg.bg,
                                                color: roleCfg.text,
                                                border: `1px solid ${roleCfg.border}`,
                                                textTransform: "uppercase",
                                                letterSpacing: "0.04em",
                                            }}
                                        >
                                            {row.role}
                                        </span>
                                    </td>
                                    <td
                                        style={{
                                            padding: "14px 16px",
                                            fontSize: 12,
                                            fontWeight: 700,
                                            color: "#475569",
                                            fontFamily:
                                                "'JetBrains Mono', monospace",
                                        }}
                                    >
                                        {row.permission}
                                    </td>
                                    <td
                                        style={{
                                            padding: "14px 16px",
                                            fontSize: 11,
                                            fontWeight: 600,
                                            color: "#64748B",
                                            fontFamily:
                                                "'JetBrains Mono', monospace",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 6,
                                        }}
                                    >
                                        {row.endpoint}
                                        <ExternalLink
                                            size={10}
                                            style={{ opacity: 0.4, flexShrink: 0 }}
                                        />
                                    </td>
                                    <td
                                        style={{
                                            padding: "14px 16px",
                                            fontSize: 12,
                                            fontWeight: 600,
                                            color: "#94A3B8",
                                        }}
                                    >
                                        {row.time}
                                    </td>
                                    <td style={{ padding: "14px 16px" }}>
                                        <span
                                            style={{
                                                fontSize: 10,
                                                fontWeight: 800,
                                                padding: "4px 12px",
                                                borderRadius: 20,
                                                background: "#FEF2F2",
                                                color: "#EF4444",
                                                textTransform: "uppercase",
                                                letterSpacing: "0.06em",
                                            }}
                                        >
                                            Denied
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
