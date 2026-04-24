/**
 * SessionsTab.jsx — Login Sessions Log
 *
 * Shows paginated login sessions from RefreshToken records.
 * Displays: user, device, IP, status (active/expired/revoked), timestamps.
 *
 * PLANE: Org only.
 */
import React, { useState } from "react";
import {
    ChevronLeft,
    ChevronRight,
    Monitor,
    Smartphone,
    Globe,
    Clock,
    User,
    AlertCircle,
    CheckCircle2,
    XCircle,
    MinusCircle,
} from "lucide-react";
import { useSessions } from "../hooks/useSecurity";

// ── Device icon helper ──────────────────────────────────────────────────────
function getDeviceIcon(device) {
    const d = (device || "").toLowerCase();
    if (d.includes("iphone") || d.includes("android")) return Smartphone;
    return Monitor;
}

// ── Status badge ────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
    const config = {
        active: { bg: "#ECFDF5", color: "#059669", icon: CheckCircle2, label: "Active" },
        expired: { bg: "#FEF3C7", color: "#D97706", icon: MinusCircle, label: "Expired" },
        revoked: { bg: "#FEF2F2", color: "#DC2626", icon: XCircle, label: "Revoked" },
    };
    const c = config[status] || config.expired;
    const Icon = c.icon;

    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                background: c.bg,
                color: c.color,
            }}
        >
            <Icon size={12} />
            {c.label}
        </span>
    );
}

function formatTimestamp(ts) {
    if (!ts) return "\u2014";
    const d = new Date(ts);
    return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

function timeAgo(ts) {
    if (!ts) return "\u2014";
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

export default function SessionsTab() {
    const [statusFilter, setStatusFilter] = useState("all");
    const [page, setPage] = useState(1);
    const limit = 25;

    const params = {
        page,
        limit,
        ...(statusFilter !== "all" && { isActive: statusFilter === "active" ? "true" : "false" }),
    };

    const { data, isLoading, error } = useSessions(params);

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
                <AlertCircle size={40} className="text-red-500 mx-auto mb-3" />
                <p className="text-sm font-bold text-red-800">Failed to load sessions</p>
            </div>
        );
    }

    const sessions = data?.sessions || [];
    const pagination = data?.pagination || { page: 1, pages: 1, total: 0 };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24, height: "100%" }}>
            {/* Filters */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "#fff",
                    padding: 16,
                    borderRadius: 24,
                    border: "1px solid #E2E8F0",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                            style={{
                                fontSize: 10,
                                fontWeight: 800,
                                color: "#94A3B8",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                            }}
                        >
                            Status:
                        </span>
                        <select
                            value={statusFilter}
                            onChange={(e) => {
                                setStatusFilter(e.target.value);
                                setPage(1);
                            }}
                            style={{
                                background: "#F8FAFC",
                                border: "1px solid #E2E8F0",
                                borderRadius: 12,
                                padding: "8px 16px",
                                fontSize: 12,
                                fontWeight: 700,
                                color: "#475569",
                                cursor: "pointer",
                                outline: "none",
                            }}
                        >
                            <option value="all">All Sessions</option>
                            <option value="active">Active</option>
                            <option value="inactive">Expired / Revoked</option>
                        </select>
                    </div>
                </div>
                <span
                    style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#94A3B8",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                    }}
                >
                    {pagination.total.toLocaleString()} sessions
                </span>
            </div>

            {/* Table */}
            <div
                style={{
                    flex: 1,
                    background: "#fff",
                    borderRadius: 24,
                    border: "1px solid #E2E8F0",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                {isLoading ? (
                    <div
                        style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#94A3B8",
                            fontSize: 13,
                            fontWeight: 700,
                        }}
                    >
                        Loading sessions...
                    </div>
                ) : (
                    <>
                        <div style={{ overflow: "auto", flex: 1 }}>
                            <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
                                <thead>
                                    <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                                        <th style={thStyle}>User</th>
                                        <th style={thStyle}>Device</th>
                                        <th style={thStyle}>IP Address</th>
                                        <th style={thStyle}>Status</th>
                                        <th style={thStyle}>Login Time</th>
                                        <th style={thStyle}>Last Active</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sessions.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={6}
                                                style={{
                                                    padding: 48,
                                                    textAlign: "center",
                                                    color: "#94A3B8",
                                                    fontSize: 13,
                                                    fontWeight: 700,
                                                }}
                                            >
                                                No sessions found
                                            </td>
                                        </tr>
                                    ) : (
                                        sessions.map((s) => {
                                            const DeviceIcon = getDeviceIcon(s.device);
                                            return (
                                                <tr
                                                    key={s.id}
                                                    style={{
                                                        borderBottom: "1px solid #F1F5F9",
                                                        transition: "background 0.15s",
                                                    }}
                                                    onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFBFC")}
                                                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                                >
                                                    {/* User */}
                                                    <td style={tdStyle}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                            <div
                                                                style={{
                                                                    width: 28,
                                                                    height: 28,
                                                                    borderRadius: "50%",
                                                                    background: "#F1F5F9",
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                    justifyContent: "center",
                                                                    color: "#64748B",
                                                                    border: "1px solid #E2E8F0",
                                                                }}
                                                            >
                                                                <User size={12} />
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>
                                                                    {s.userName}
                                                                </div>
                                                                <div style={{ fontSize: 10, color: "#94A3B8" }}>
                                                                    {s.userEmail}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Device */}
                                                    <td style={tdStyle}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                            <DeviceIcon size={14} style={{ color: "#94A3B8" }} />
                                                            <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B" }}>
                                                                {s.device}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    {/* IP */}
                                                    <td style={tdStyle}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                            <Globe size={12} style={{ color: "#CBD5E1" }} />
                                                            <code
                                                                style={{
                                                                    fontSize: 11,
                                                                    fontWeight: 600,
                                                                    color: "#64748B",
                                                                    background: "#F8FAFC",
                                                                    padding: "2px 6px",
                                                                    borderRadius: 4,
                                                                }}
                                                            >
                                                                {s.ipAddress}
                                                            </code>
                                                        </div>
                                                    </td>

                                                    {/* Status */}
                                                    <td style={tdStyle}>
                                                        <StatusBadge status={s.status} />
                                                    </td>

                                                    {/* Login time */}
                                                    <td style={tdStyle}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "#64748B" }}>
                                                            <Clock size={12} style={{ color: "#CBD5E1" }} />
                                                            {formatTimestamp(s.createdAt)}
                                                        </div>
                                                    </td>

                                                    {/* Last active */}
                                                    <td style={tdStyle}>
                                                        <span style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8" }}>
                                                            {timeAgo(s.lastUsedAt)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        <div
                            style={{
                                padding: "12px 24px",
                                borderTop: "1px solid #F1F5F9",
                                background: "#FAFBFC",
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
                                    letterSpacing: "0.08em",
                                }}
                            >
                                Page {pagination.page} of {pagination.pages} ({pagination.total.toLocaleString()} total)
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <button
                                    onClick={() => setPage(Math.max(1, page - 1))}
                                    disabled={page <= 1}
                                    style={{
                                        padding: 8,
                                        border: "1px solid #E2E8F0",
                                        borderRadius: 12,
                                        background: "#fff",
                                        cursor: page <= 1 ? "not-allowed" : "pointer",
                                        opacity: page <= 1 ? 0.4 : 1,
                                        color: "#64748B",
                                    }}
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <button
                                    onClick={() => setPage(Math.min(pagination.pages, page + 1))}
                                    disabled={page >= pagination.pages}
                                    style={{
                                        padding: 8,
                                        border: "1px solid #E2E8F0",
                                        borderRadius: 12,
                                        background: "#fff",
                                        cursor: page >= pagination.pages ? "not-allowed" : "pointer",
                                        opacity: page >= pagination.pages ? 0.4 : 1,
                                        color: "#64748B",
                                    }}
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

const thStyle = {
    padding: "16px 20px",
    fontSize: 10,
    fontWeight: 800,
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    whiteSpace: "nowrap",
};

const tdStyle = {
    padding: "12px 20px",
    whiteSpace: "nowrap",
};
