/**
 * SecurityAlertsTab.jsx — Security Alerts Panel (Phase 6)
 *
 * Displays active and historical security alerts with severity badges,
 * timestamps, and acknowledge/resolve actions.
 *
 * Connected to backend via useSecurityAlerts, useAlertSummary.
 *
 * MODULE: frontend/src/modules/org/security
 * PLANE: Org only.
 */
import React, { useState } from "react";
import {
    AlertTriangle,
    ShieldAlert,
    ShieldCheck,
    Bell,
    CheckCircle2,
    Eye,
    Clock,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    Filter,
} from "lucide-react";
import {
    useSecurityAlerts,
    useAlertSummary,
    useAcknowledgeAlert,
    useResolveAlert,
} from "../hooks/useSecurity";

// ─── Severity Config ────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
    CRITICAL: {
        color: "#DC2626",
        bg: "#FEF2F2",
        border: "#FECACA",
        icon: AlertTriangle,
        label: "Critical",
    },
    HIGH: {
        color: "#EA580C",
        bg: "#FFF7ED",
        border: "#FED7AA",
        icon: ShieldAlert,
        label: "High",
    },
    MEDIUM: {
        color: "#D97706",
        bg: "#FFFBEB",
        border: "#FDE68A",
        icon: Bell,
        label: "Medium",
    },
    LOW: {
        color: "#059669",
        bg: "#ECFDF5",
        border: "#A7F3D0",
        icon: ShieldCheck,
        label: "Low",
    },
};

const STATUS_CONFIG = {
    active: { color: "#DC2626", bg: "#FEF2F2", label: "Active" },
    acknowledged: { color: "#D97706", bg: "#FFFBEB", label: "Acknowledged" },
    resolved: { color: "#059669", bg: "#ECFDF5", label: "Resolved" },
};

export default function SecurityAlertsTab() {
    const [statusFilter, setStatusFilter] = useState("");
    const [severityFilter, setSeverityFilter] = useState("");
    const [page, setPage] = useState(1);

    const { data, isLoading, error } = useSecurityAlerts({
        status: statusFilter || undefined,
        severity: severityFilter || undefined,
        page,
        limit: 15,
    });
    const { data: summary } = useAlertSummary();
    const acknowledgeMut = useAcknowledgeAlert();
    const resolveMut = useResolveAlert();

    if (isLoading) return <AlertsSkeleton />;
    if (error) return <ErrorState message="Failed to load security alerts" />;

    const alerts = data?.alerts || [];
    const pagination = data?.pagination || {};

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Summary Badges */}
            {summary && (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(5, 1fr)",
                        gap: 16,
                    }}
                >
                    <SummaryCard
                        label="Total Active"
                        count={summary.total || 0}
                        color="#1E293B"
                        bg="#F8FAFC"
                        icon={<Bell size={18} />}
                    />
                    <SummaryCard
                        label="Critical"
                        count={summary.CRITICAL || 0}
                        color={SEVERITY_CONFIG.CRITICAL.color}
                        bg={SEVERITY_CONFIG.CRITICAL.bg}
                        icon={<AlertTriangle size={18} />}
                    />
                    <SummaryCard
                        label="High"
                        count={summary.HIGH || 0}
                        color={SEVERITY_CONFIG.HIGH.color}
                        bg={SEVERITY_CONFIG.HIGH.bg}
                        icon={<ShieldAlert size={18} />}
                    />
                    <SummaryCard
                        label="Medium"
                        count={summary.MEDIUM || 0}
                        color={SEVERITY_CONFIG.MEDIUM.color}
                        bg={SEVERITY_CONFIG.MEDIUM.bg}
                        icon={<Bell size={18} />}
                    />
                    <SummaryCard
                        label="Low"
                        count={summary.LOW || 0}
                        color={SEVERITY_CONFIG.LOW.color}
                        bg={SEVERITY_CONFIG.LOW.bg}
                        icon={<ShieldCheck size={18} />}
                    />
                </div>
            )}

            {/* Filters */}
            <div
                style={{
                    display: "flex",
                    gap: 12,
                    padding: "16px 20px",
                    background: "#fff",
                    borderRadius: 16,
                    border: "1px solid #E2E8F0",
                    alignItems: "center",
                }}
            >
                <Filter size={14} style={{ color: "#94A3B8" }} />
                <span
                    style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: "#94A3B8",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                    }}
                >
                    Filters
                </span>

                <select
                    value={statusFilter}
                    onChange={(e) => {
                        setStatusFilter(e.target.value);
                        setPage(1);
                    }}
                    style={{
                        padding: "6px 12px",
                        borderRadius: 8,
                        border: "1px solid #E2E8F0",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#475569",
                        background: "#F8FAFC",
                        cursor: "pointer",
                    }}
                >
                    <option value="">All Status</option>
                    <option value="active">Active</option>
                    <option value="acknowledged">Acknowledged</option>
                    <option value="resolved">Resolved</option>
                </select>

                <select
                    value={severityFilter}
                    onChange={(e) => {
                        setSeverityFilter(e.target.value);
                        setPage(1);
                    }}
                    style={{
                        padding: "6px 12px",
                        borderRadius: 8,
                        border: "1px solid #E2E8F0",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#475569",
                        background: "#F8FAFC",
                        cursor: "pointer",
                    }}
                >
                    <option value="">All Severity</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                </select>

                {(statusFilter || severityFilter) && (
                    <button
                        onClick={() => {
                            setStatusFilter("");
                            setSeverityFilter("");
                            setPage(1);
                        }}
                        style={{
                            padding: "6px 12px",
                            borderRadius: 8,
                            border: "none",
                            fontSize: 10,
                            fontWeight: 800,
                            color: "#EF4444",
                            background: "#FEF2F2",
                            cursor: "pointer",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                        }}
                    >
                        Clear
                    </button>
                )}
            </div>

            {/* Alerts List */}
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
                        padding: "16px 24px",
                        borderBottom: "1px solid #F1F5F9",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
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
                        Security Alerts
                    </h3>
                    <span
                        style={{
                            fontSize: 10,
                            fontWeight: 800,
                            color: "#94A3B8",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                        }}
                    >
                        {pagination.total || 0} total
                    </span>
                </div>

                {/* Empty State */}
                {alerts.length === 0 && (
                    <div
                        style={{
                            padding: 48,
                            textAlign: "center",
                        }}
                    >
                        <ShieldCheck
                            size={40}
                            style={{ color: "#10B981", margin: "0 auto 12px" }}
                        />
                        <p
                            style={{
                                fontSize: 14,
                                fontWeight: 700,
                                color: "#64748B",
                                margin: 0,
                            }}
                        >
                            No security alerts found
                        </p>
                        <p
                            style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: "#94A3B8",
                                margin: "4px 0 0",
                            }}
                        >
                            Your system is operating normally.
                        </p>
                    </div>
                )}

                {/* Alert Rows */}
                {alerts.map((alert) => {
                    const sevConfig =
                        SEVERITY_CONFIG[alert.severity] ||
                        SEVERITY_CONFIG.LOW;
                    const statConfig =
                        STATUS_CONFIG[alert.status] || STATUS_CONFIG.active;
                    const SevIcon = sevConfig.icon;

                    return (
                        <div
                            key={alert._id}
                            style={{
                                padding: "16px 24px",
                                borderBottom: "1px solid #F8FAFC",
                                display: "flex",
                                alignItems: "center",
                                gap: 16,
                                transition: "background 0.15s",
                            }}
                            onMouseEnter={(e) =>
                                (e.currentTarget.style.background = "#FAFBFF")
                            }
                            onMouseLeave={(e) =>
                                (e.currentTarget.style.background = "transparent")
                            }
                        >
                            {/* Severity Icon */}
                            <div
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 10,
                                    background: sevConfig.bg,
                                    color: sevConfig.color,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                }}
                            >
                                <SevIcon size={16} />
                            </div>

                            {/* Content */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        marginBottom: 4,
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 12,
                                            fontWeight: 800,
                                            color: "#1E293B",
                                        }}
                                    >
                                        {alert.type
                                            ?.replace(/_/g, " ")
                                            .replace(
                                                /\b\w/g,
                                                (c) => c.toUpperCase()
                                            )}
                                    </span>
                                    {/* Severity badge */}
                                    <span
                                        style={{
                                            fontSize: 9,
                                            fontWeight: 900,
                                            color: sevConfig.color,
                                            background: sevConfig.bg,
                                            padding: "2px 8px",
                                            borderRadius: 6,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.08em",
                                            border: `1px solid ${sevConfig.border}`,
                                        }}
                                    >
                                        {sevConfig.label}
                                    </span>
                                    {/* Status badge */}
                                    <span
                                        style={{
                                            fontSize: 9,
                                            fontWeight: 900,
                                            color: statConfig.color,
                                            background: statConfig.bg,
                                            padding: "2px 8px",
                                            borderRadius: 6,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.08em",
                                        }}
                                    >
                                        {statConfig.label}
                                    </span>
                                </div>
                                <p
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: "#64748B",
                                        margin: 0,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {alert.message}
                                </p>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 12,
                                        marginTop: 4,
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 10,
                                            fontWeight: 700,
                                            color: "#94A3B8",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 4,
                                        }}
                                    >
                                        <Clock size={10} />
                                        {new Date(
                                            alert.createdAt
                                        ).toLocaleString()}
                                    </span>
                                    {alert.details?.denialCount && (
                                        <span
                                            style={{
                                                fontSize: 10,
                                                fontWeight: 700,
                                                color: "#64748B",
                                            }}
                                        >
                                            {alert.details.denialCount}{" "}
                                            denials in window
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div
                                style={{
                                    display: "flex",
                                    gap: 8,
                                    flexShrink: 0,
                                }}
                            >
                                {alert.status === "active" && (
                                    <button
                                        onClick={() =>
                                            acknowledgeMut.mutate(alert._id)
                                        }
                                        disabled={acknowledgeMut.isPending}
                                        style={{
                                            padding: "6px 12px",
                                            borderRadius: 8,
                                            border: "1px solid #E2E8F0",
                                            background: "#fff",
                                            fontSize: 10,
                                            fontWeight: 800,
                                            color: "#D97706",
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 4,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.06em",
                                            transition: "all 0.15s",
                                        }}
                                    >
                                        <Eye size={12} />
                                        Ack
                                    </button>
                                )}
                                {(alert.status === "active" ||
                                    alert.status === "acknowledged") && (
                                    <button
                                        onClick={() =>
                                            resolveMut.mutate(alert._id)
                                        }
                                        disabled={resolveMut.isPending}
                                        style={{
                                            padding: "6px 12px",
                                            borderRadius: 8,
                                            border: "none",
                                            background: "#ECFDF5",
                                            fontSize: 10,
                                            fontWeight: 800,
                                            color: "#059669",
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 4,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.06em",
                                            transition: "all 0.15s",
                                        }}
                                    >
                                        <CheckCircle2 size={12} />
                                        Resolve
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}

                {/* Pagination */}
                {pagination.pages > 1 && (
                    <div
                        style={{
                            padding: "12px 24px",
                            borderTop: "1px solid #F1F5F9",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}
                    >
                        <span
                            style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: "#94A3B8",
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                            }}
                        >
                            Page {pagination.page} of {pagination.pages}
                        </span>
                        <div style={{ display: "flex", gap: 8 }}>
                            <button
                                onClick={() =>
                                    setPage((p) => Math.max(1, p - 1))
                                }
                                disabled={page <= 1}
                                style={{
                                    padding: "6px 10px",
                                    borderRadius: 8,
                                    border: "1px solid #E2E8F0",
                                    background: "#fff",
                                    cursor: page <= 1 ? "default" : "pointer",
                                    opacity: page <= 1 ? 0.4 : 1,
                                    display: "flex",
                                    alignItems: "center",
                                }}
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <button
                                onClick={() =>
                                    setPage((p) =>
                                        Math.min(pagination.pages, p + 1)
                                    )
                                }
                                disabled={page >= pagination.pages}
                                style={{
                                    padding: "6px 10px",
                                    borderRadius: 8,
                                    border: "1px solid #E2E8F0",
                                    background: "#fff",
                                    cursor:
                                        page >= pagination.pages
                                            ? "default"
                                            : "pointer",
                                    opacity:
                                        page >= pagination.pages ? 0.4 : 1,
                                    display: "flex",
                                    alignItems: "center",
                                }}
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function SummaryCard({ label, count, color, bg, icon }) {
    return (
        <div
            style={{
                background: "#fff",
                padding: "16px 20px",
                borderRadius: 16,
                border: "1px solid #E2E8F0",
                display: "flex",
                alignItems: "center",
                gap: 12,
            }}
        >
            <div
                style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: bg,
                    color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                }}
            >
                {icon}
            </div>
            <div>
                <p
                    style={{
                        fontSize: 9,
                        fontWeight: 800,
                        color: "#94A3B8",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        margin: 0,
                    }}
                >
                    {label}
                </p>
                <span style={{ fontSize: 22, fontWeight: 900, color }}>
                    {count}
                </span>
            </div>
        </div>
    );
}

function AlertsSkeleton() {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(5, 1fr)",
                    gap: 16,
                }}
            >
                {[1, 2, 3, 4, 5].map((i) => (
                    <div
                        key={i}
                        style={{
                            height: 80,
                            background: "#F1F5F9",
                            borderRadius: 16,
                            animation: "pulse 1.5s ease-in-out infinite",
                        }}
                    />
                ))}
            </div>
            <div
                style={{
                    height: 400,
                    background: "#F1F5F9",
                    borderRadius: 20,
                    animation: "pulse 1.5s ease-in-out infinite",
                }}
            />
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
            <p style={{ fontSize: 14, fontWeight: 700, color: "#991B1B" }}>
                {message}
            </p>
        </div>
    );
}
