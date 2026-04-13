/**
 * AuthAlertsPanel.jsx — Security Anomaly Alerts
 *
 * Displays real-time and historical security alerts:
 * - Excessive denial bursts
 * - Suspicious user patterns
 * - Cross-org access attempts
 * - Role deviation anomalies
 *
 * TASK-FE-AUTH-INT-005
 * MODULE: frontend/src/modules/org/security/analytics
 * PLANE: Org only.
 */
import React, { useState, useMemo } from "react";
import {
    AlertTriangle,
    ShieldAlert,
    UserX,
    Zap,
    ChevronDown,
    ChevronRight,
    Clock,
    X,
    Eye,
} from "lucide-react";

// ─── Alert Config ────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
    critical: {
        color: "#DC2626",
        bg: "#FEF2F2",
        border: "#FECACA",
        icon: ShieldAlert,
        label: "CRITICAL",
    },
    warning: {
        color: "#D97706",
        bg: "#FFFBEB",
        border: "#FDE68A",
        icon: AlertTriangle,
        label: "WARNING",
    },
    info: {
        color: "#2563EB",
        bg: "#EFF6FF",
        border: "#BFDBFE",
        icon: Eye,
        label: "INFO",
    },
};

const TYPE_ICONS = {
    denial_burst: Zap,
    suspicious_user: UserX,
    cross_org: ShieldAlert,
    role_deviation: AlertTriangle,
};

// ─── Default mock alerts ─────────────────────────────────────────────────────

const DEFAULT_ALERTS = [
    {
        id: "alert-001",
        severity: "critical",
        type: "denial_burst",
        title: "Denial Rate Spike Detected",
        message: "Denial rate exceeded 5% threshold in the last 5 minutes (current: 8.2%). 42 denials from 6 unique users targeting patient:write and invoice:delete permissions.",
        user: null,
        timestamp: "2 min ago",
        acknowledged: false,
        meta: { denialCount: 42, threshold: "5%", current: "8.2%", window: "5m" },
    },
    {
        id: "alert-002",
        severity: "critical",
        type: "suspicious_user",
        title: "Abnormal Access Pattern — Receptionist Ali",
        message: "127 denied requests in the past hour. Attempting invoice:delete, settings:write, and user:manage — all outside assigned role capabilities.",
        user: "Receptionist Ali",
        timestamp: "8 min ago",
        acknowledged: false,
        meta: { userId: "usr_ali", denialCount: 127, topPermissions: ["invoice:delete", "settings:write"] },
    },
    {
        id: "alert-003",
        severity: "warning",
        type: "role_deviation",
        title: "Role Capability Mismatch — Dr. Mohamed",
        message: "Dentist role attempting user:manage operations (POST /api/v1/users/invite). This capability is not assigned to the dentist role.",
        user: "Dr. Mohamed Nasser",
        timestamp: "22 min ago",
        acknowledged: false,
        meta: { role: "dentist", attemptedPermission: "user:manage" },
    },
    {
        id: "alert-004",
        severity: "warning",
        type: "denial_burst",
        title: "PBAC Layer Slow Response",
        message: "PBAC layer P99 latency increased to 24ms (normal: 18ms). Possible policy complexity issue or database bottleneck.",
        user: null,
        timestamp: "35 min ago",
        acknowledged: true,
        meta: { layer: "PBAC", p99: "24ms", normal: "18ms" },
    },
    {
        id: "alert-005",
        severity: "info",
        type: "role_deviation",
        title: "New Permission Pattern Detected",
        message: "3 nurses attempted orthodontics:write in the past 2 hours. If this is expected, consider adding to the nurse role.",
        user: null,
        timestamp: "1 hr ago",
        acknowledged: true,
        meta: { count: 3, role: "nurse", permission: "orthodontics:write" },
    },
];

// ─── Alert Row Component ─────────────────────────────────────────────────────

function AlertRow({ alert, onAcknowledge, onDrillDown }) {
    const [expanded, setExpanded] = useState(false);
    const severity = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info;
    const SeverityIcon = severity.icon;
    const TypeIcon = TYPE_ICONS[alert.type] || AlertTriangle;

    return (
        <div
            style={{
                borderRadius: 14,
                border: `1px solid ${alert.acknowledged ? "#E2E8F0" : severity.border}`,
                background: alert.acknowledged ? "#FAFBFC" : severity.bg,
                overflow: "hidden",
                transition: "all 0.2s",
                opacity: alert.acknowledged ? 0.7 : 1,
            }}
        >
            {/* Alert header */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 16px",
                    cursor: "pointer",
                }}
                onClick={() => setExpanded(!expanded)}
            >
                {/* Severity indicator */}
                <div
                    style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        background: alert.acknowledged ? "#F1F5F9" : `${severity.color}15`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                    }}
                >
                    <SeverityIcon size={14} style={{ color: alert.acknowledged ? "#94A3B8" : severity.color }} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span
                            style={{
                                fontSize: 8,
                                fontWeight: 900,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: alert.acknowledged ? "#F1F5F9" : severity.color,
                                color: alert.acknowledged ? "#94A3B8" : "#fff",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                            }}
                        >
                            {severity.label}
                        </span>
                        <TypeIcon size={10} style={{ color: "#94A3B8" }} />
                        <span
                            style={{
                                fontSize: 10,
                                fontWeight: 600,
                                color: "#94A3B8",
                                fontFamily: "'JetBrains Mono', monospace",
                                textTransform: "uppercase",
                            }}
                        >
                            {alert.type.replace(/_/g, " ")}
                        </span>
                    </div>
                    <span
                        style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: alert.acknowledged ? "#64748B" : "#0F172A",
                            lineHeight: 1.3,
                        }}
                    >
                        {alert.title}
                    </span>
                </div>

                {/* Timestamp + expand */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexShrink: 0,
                    }}
                >
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
                        {alert.timestamp}
                    </span>
                    {expanded ? (
                        <ChevronDown size={12} style={{ color: "#94A3B8" }} />
                    ) : (
                        <ChevronRight size={12} style={{ color: "#94A3B8" }} />
                    )}
                </div>
            </div>

            {/* Expanded details */}
            {expanded && (
                <div
                    style={{
                        padding: "0 16px 14px",
                        borderTop: `1px solid ${alert.acknowledged ? "#E2E8F0" : severity.border}`,
                    }}
                >
                    <p
                        style={{
                            fontSize: 11,
                            fontWeight: 500,
                            color: "#475569",
                            lineHeight: 1.6,
                            margin: "12px 0",
                        }}
                    >
                        {alert.message}
                    </p>

                    {/* Meta tags */}
                    {alert.meta && (
                        <div
                            style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 6,
                                marginBottom: 12,
                            }}
                        >
                            {Object.entries(alert.meta).map(([key, val]) => (
                                <span
                                    key={key}
                                    style={{
                                        fontSize: 10,
                                        fontWeight: 600,
                                        padding: "3px 8px",
                                        borderRadius: 6,
                                        background: "#F1F5F9",
                                        color: "#475569",
                                        fontFamily: "'JetBrains Mono', monospace",
                                    }}
                                >
                                    {key}: {Array.isArray(val) ? val.join(", ") : String(val)}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8 }}>
                        {!alert.acknowledged && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onAcknowledge?.(alert.id);
                                }}
                                style={{
                                    padding: "6px 14px",
                                    borderRadius: 8,
                                    border: "1px solid #E2E8F0",
                                    background: "#fff",
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: "#64748B",
                                    cursor: "pointer",
                                    transition: "all 0.15s",
                                }}
                            >
                                Acknowledge
                            </button>
                        )}
                        {alert.user && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDrillDown?.("user", alert.meta?.userId || alert.user);
                                }}
                                style={{
                                    padding: "6px 14px",
                                    borderRadius: 8,
                                    border: "none",
                                    background: severity.color,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: "#fff",
                                    cursor: "pointer",
                                    transition: "all 0.15s",
                                }}
                            >
                                Investigate User
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main Panel Component ────────────────────────────────────────────────────

export default function AuthAlertsPanel({
    alerts: externalAlerts,
    onAcknowledge,
    onDrillDown,
}) {
    const [filter, setFilter] = useState("all"); // all | critical | warning | info
    const alerts = externalAlerts?.length > 0 ? externalAlerts : DEFAULT_ALERTS;

    const filteredAlerts = useMemo(() => {
        if (filter === "all") return alerts;
        return alerts.filter((a) => a.severity === filter);
    }, [alerts, filter]);

    const counts = useMemo(() => ({
        critical: alerts.filter((a) => a.severity === "critical" && !a.acknowledged).length,
        warning: alerts.filter((a) => a.severity === "warning" && !a.acknowledged).length,
        info: alerts.filter((a) => a.severity === "info" && !a.acknowledged).length,
        total: alerts.filter((a) => !a.acknowledged).length,
    }), [alerts]);

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
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: counts.critical > 0 ? "#FEF2F2" : "#F8FAFC",
                            color: counts.critical > 0 ? "#DC2626" : "#94A3B8",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <ShieldAlert size={18} />
                    </div>
                    <div>
                        <h3
                            style={{
                                fontSize: 14,
                                fontWeight: 800,
                                color: "#0F172A",
                                margin: 0,
                            }}
                        >
                            Security Alerts
                        </h3>
                        <p
                            style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: "#94A3B8",
                                margin: "2px 0 0",
                            }}
                        >
                            Anomaly detection & threat monitoring
                        </p>
                    </div>
                </div>

                {/* Severity filter pills */}
                <div style={{ display: "flex", gap: 6 }}>
                    {[
                        { id: "all", label: `All (${counts.total})` },
                        { id: "critical", label: `Critical (${counts.critical})`, color: "#DC2626" },
                        { id: "warning", label: `Warning (${counts.warning})`, color: "#D97706" },
                    ].map((f) => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id)}
                            style={{
                                padding: "5px 12px",
                                borderRadius: 8,
                                border: "none",
                                fontSize: 10,
                                fontWeight: 700,
                                cursor: "pointer",
                                transition: "all 0.15s",
                                background: filter === f.id ? (f.color ? `${f.color}15` : "#F1F5F9") : "transparent",
                                color: filter === f.id ? (f.color || "#0F172A") : "#94A3B8",
                            }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Alert list */}
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10, maxHeight: 480, overflow: "auto" }}>
                {filteredAlerts.length === 0 ? (
                    <div
                        style={{
                            textAlign: "center",
                            padding: "40px 20px",
                            color: "#94A3B8",
                            fontSize: 12,
                            fontWeight: 600,
                        }}
                    >
                        No {filter !== "all" ? filter : ""} alerts
                    </div>
                ) : (
                    filteredAlerts.map((alert) => (
                        <AlertRow
                            key={alert.id}
                            alert={alert}
                            onAcknowledge={onAcknowledge}
                            onDrillDown={onDrillDown}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
