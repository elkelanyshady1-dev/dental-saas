/**
 * AccessLogsTab.jsx — Audit Access Logs (Connected)
 *
 * Shows paginated audit logs from the backend.
 * Supports search, result filter, and date range.
 */
import React, { useState } from "react";
import {
    Search,
    Download,
    Calendar,
    ChevronLeft,
    ChevronRight,
    CheckCircle2,
    XCircle,
    Clock,
    User,
    Shield,
    Database,
    AlertCircle,
    Loader2,
} from "lucide-react";
import { useAccessLogs } from "../hooks/useSecurity";
import { securityApi, downloadBlob } from "../api/security.api";

export default function AccessLogsTab() {
    const [filterResult, setFilterResult] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [page, setPage] = useState(1);
    const [exporting, setExporting] = useState(false);
    const limit = 25;

    const params = {
        page,
        limit,
        ...(filterResult !== "all" && { result: filterResult }),
        ...(searchQuery && { search: searchQuery }),
    };

    const { data, isLoading, error } = useAccessLogs(params);

    const handleExport = async () => {
        try {
            setExporting(true);
            const exportParams = {};
            if (filterResult !== "all") exportParams.result = filterResult;
            const res = await securityApi.exportLogs(exportParams);
            downloadBlob(res.data, `security_logs_${new Date().toISOString().split("T")[0]}.csv`);
        } catch (err) {
            console.error("[AccessLogsTab] Export failed:", err);
        } finally {
            setExporting(false);
        }
    };

    if (error) return <ErrorState message="Failed to load access logs" />;

    const logs = data?.logs || [];
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
                    <div style={{ position: "relative" }}>
                        <Search
                            size={14}
                            style={{
                                position: "absolute",
                                left: 12,
                                top: "50%",
                                transform: "translateY(-50%)",
                                color: "#94A3B8",
                            }}
                        />
                        <input
                            type="text"
                            placeholder="Search logs..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setPage(1);
                            }}
                            style={{
                                background: "#F8FAFC",
                                border: "1px solid #E2E8F0",
                                borderRadius: 12,
                                padding: "8px 16px 8px 36px",
                                fontSize: 12,
                                width: 260,
                                outline: "none",
                            }}
                        />
                    </div>
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
                            Result:
                        </span>
                        <select
                            value={filterResult}
                            onChange={(e) => {
                                setFilterResult(e.target.value);
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
                            <option value="all">All</option>
                            <option value="allowed">Allowed</option>
                            <option value="denied">Denied</option>
                        </select>
                    </div>
                </div>
                <button
                    onClick={handleExport}
                    disabled={exporting}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "8px 16px",
                        borderRadius: 12,
                        border: "1px solid #E2E8F0",
                        background: "#fff",
                        cursor: exporting ? "not-allowed" : "pointer",
                        opacity: exporting ? 0.6 : 1,
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#4F46E5",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        transition: "all 0.2s",
                    }}
                >
                    {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    {exporting ? "Exporting..." : "Export CSV"}
                </button>
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
                        Loading audit logs...
                    </div>
                ) : (
                    <>
                        <div style={{ overflow: "auto", flex: 1 }}>
                            <table
                                style={{
                                    width: "100%",
                                    textAlign: "left",
                                    borderCollapse: "collapse",
                                }}
                            >
                                <thead>
                                    <tr
                                        style={{
                                            background: "#F8FAFC",
                                            borderBottom: "1px solid #E2E8F0",
                                        }}
                                    >
                                        <th style={thStyle}>Timestamp</th>
                                        <th style={thStyle}>User</th>
                                        <th style={thStyle}>Action</th>
                                        <th style={thStyle}>Entity</th>
                                        <th style={thStyle}>Result</th>
                                        <th style={thStyle}>Description</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.length === 0 ? (
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
                                                No audit logs found
                                            </td>
                                        </tr>
                                    ) : (
                                        logs.map((log) => (
                                            <tr
                                                key={log.id}
                                                style={{
                                                    borderBottom: "1px solid #F1F5F9",
                                                    transition: "background 0.15s",
                                                }}
                                                onMouseEnter={(e) =>
                                                    (e.currentTarget.style.background = "#FAFBFC")
                                                }
                                                onMouseLeave={(e) =>
                                                    (e.currentTarget.style.background =
                                                        "transparent")
                                                }
                                            >
                                                <td style={tdStyle}>
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: 6,
                                                            fontSize: 11,
                                                            fontWeight: 700,
                                                            color: "#64748B",
                                                        }}
                                                    >
                                                        <Clock
                                                            size={12}
                                                            style={{ color: "#CBD5E1" }}
                                                        />
                                                        {formatTimestamp(log.timestamp)}
                                                    </div>
                                                </td>
                                                <td style={tdStyle}>
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: 8,
                                                        }}
                                                    >
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
                                                            <div
                                                                style={{
                                                                    fontSize: 12,
                                                                    fontWeight: 700,
                                                                    color: "#334155",
                                                                }}
                                                            >
                                                                {log.user}
                                                            </div>
                                                            <div
                                                                style={{
                                                                    fontSize: 9,
                                                                    fontWeight: 700,
                                                                    color: "#94A3B8",
                                                                    textTransform: "uppercase",
                                                                    letterSpacing: "0.08em",
                                                                }}
                                                            >
                                                                {log.role}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={tdStyle}>
                                                    <code
                                                        style={{
                                                            fontSize: 10,
                                                            fontWeight: 700,
                                                            color: "#475569",
                                                            background: "#F1F5F9",
                                                            padding: "2px 8px",
                                                            borderRadius: 4,
                                                            letterSpacing: "0.03em",
                                                        }}
                                                    >
                                                        {log.action}
                                                    </code>
                                                </td>
                                                <td style={tdStyle}>
                                                    <span
                                                        style={{
                                                            fontSize: 11,
                                                            fontWeight: 700,
                                                            color: "#64748B",
                                                        }}
                                                    >
                                                        {log.entity}
                                                    </span>
                                                </td>
                                                <td style={tdStyle}>
                                                    <ResultBadge result={log.result} />
                                                </td>
                                                <td style={tdStyle}>
                                                    <span
                                                        style={{
                                                            fontSize: 11,
                                                            fontWeight: 600,
                                                            color: "#64748B",
                                                            maxWidth: 200,
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis",
                                                            whiteSpace: "nowrap",
                                                            display: "block",
                                                        }}
                                                    >
                                                        {log.description}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
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
                                Page {pagination.page} of {pagination.pages} (
                                {pagination.total.toLocaleString()} total)
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
                                    onClick={() =>
                                        setPage(Math.min(pagination.pages, page + 1))
                                    }
                                    disabled={page >= pagination.pages}
                                    style={{
                                        padding: 8,
                                        border: "1px solid #E2E8F0",
                                        borderRadius: 12,
                                        background: "#fff",
                                        cursor:
                                            page >= pagination.pages
                                                ? "not-allowed"
                                                : "pointer",
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

function ResultBadge({ result }) {
    const isAllowed = result === "allowed";
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
                background: isAllowed ? "#ECFDF5" : "#FEF2F2",
                color: isAllowed ? "#059669" : "#DC2626",
            }}
        >
            {isAllowed ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            {result}
        </span>
    );
}

function formatTimestamp(ts) {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
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
            <p style={{ fontSize: 14, fontWeight: 700, color: "#991B1B" }}>{message}</p>
        </div>
    );
}
