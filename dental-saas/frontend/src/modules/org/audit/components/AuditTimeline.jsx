/**
 * AuditTimeline.jsx — Medical-Grade Audit Timeline Component
 *
 * Displays a chronological audit trail for any entity (patient, appointment, etc.).
 * Can be used standalone or embedded inside tab panels.
 *
 * Features:
 *   - Category-based filtering (patient, appointment, treatment, etc.)
 *   - Paginated infinite-scroll style (load more)
 *   - Action icons with color coding
 *   - Actor name + role display
 *   - Expandable change details
 *   - Relative timestamps with full datetime tooltip
 *
 * USAGE:
 *   <AuditTimeline entityId={patientId} entityType="Patient" />
 *   <AuditTimeline userId={userId} mode="user" />
 *
 * PLANE: Org only.
 * SENTINEL: capabilities.includes("security.read") — enforced by API.
 */

import { useState, useEffect, useCallback } from "react";
import { getEntityTimeline, getUserActivity } from "../api/audit.api";

// ─── Category Configuration ────────────────────────────────────────────────

const CATEGORIES = [
    { key: "all", label: "All", icon: "📋", color: "#6b7280" },
    { key: "patient", label: "Patient", icon: "👤", color: "#3b82f6" },
    { key: "appointment", label: "Appointments", icon: "📅", color: "#8b5cf6" },
    { key: "treatment", label: "Treatments", icon: "🦷", color: "#10b981" },
    { key: "clinical", label: "Clinical", icon: "🩺", color: "#06b6d4" },
    { key: "financial", label: "Financial", icon: "💳", color: "#f59e0b" },
    { key: "admin", label: "Admin", icon: "⚙️", color: "#ef4444" },
    { key: "security", label: "Security", icon: "🔒", color: "#dc2626" },
];

// ─── Action Display Config ──────────────────────────────────────────────────

const ACTION_DISPLAY = {
    PATIENT_CREATED: { label: "Patient created", icon: "➕", color: "#10b981" },
    PATIENT_UPDATED: { label: "Patient updated", icon: "✏️", color: "#3b82f6" },
    PATIENT_DELETED: { label: "Patient deleted", icon: "🗑️", color: "#ef4444" },
    APPOINTMENT_CREATED: { label: "Appointment booked", icon: "📅", color: "#8b5cf6" },
    APPOINTMENT_UPDATED: { label: "Appointment modified", icon: "📝", color: "#6366f1" },
    APPOINTMENT_DELETED: { label: "Appointment cancelled", icon: "❌", color: "#ef4444" },
    TREATMENT_CREATED: { label: "Treatment started", icon: "🦷", color: "#10b981" },
    TREATMENT_UPDATED: { label: "Treatment updated", icon: "📋", color: "#3b82f6" },
    TREATMENT_COMPLETED: { label: "Treatment completed", icon: "✅", color: "#059669" },
    INVOICE_CREATED: { label: "Invoice generated", icon: "🧾", color: "#f59e0b" },
    PAYMENT_CREATED: { label: "Payment received", icon: "💰", color: "#10b981" },
    LOGIN_SUCCESS: { label: "Logged in", icon: "🔓", color: "#6b7280" },
    ORG_PERMISSION_DENIED: { label: "Access denied", icon: "🚫", color: "#dc2626" },
};

function getActionDisplay(action) {
    return ACTION_DISPLAY[action] || {
        label: action?.replace(/_/g, " ")?.toLowerCase() || "Unknown",
        icon: "📋",
        color: "#6b7280",
    };
}

// ─── Time Formatting ────────────────────────────────────────────────────────

function timeAgo(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
}

function fullDateTime(dateStr) {
    return new Date(dateStr).toLocaleString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AuditTimeline({
    entityId,
    entityType,
    userId,
    mode = "entity", // "entity" | "user"
    maxHeight = "600px",
    showFilters = true,
    showHeader = true,
    compact = false,
}) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [category, setCategory] = useState("all");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [expandedId, setExpandedId] = useState(null);

    const fetchLogs = useCallback(async (resetPage = false) => {
        setLoading(true);
        setError(null);

        try {
            const currentPage = resetPage ? 1 : page;
            let result;

            if (mode === "user" && userId) {
                result = await getUserActivity(userId, {
                    category: category !== "all" ? category : undefined,
                    page: currentPage,
                    limit: compact ? 10 : 25,
                });
            } else if (entityId) {
                result = await getEntityTimeline(entityId, {
                    entityType,
                    category: category !== "all" ? category : undefined,
                    page: currentPage,
                    limit: compact ? 10 : 25,
                });
            }

            if (result) {
                if (resetPage) {
                    setLogs(result.logs || []);
                } else if (currentPage > 1) {
                    setLogs(prev => [...prev, ...(result.logs || [])]);
                } else {
                    setLogs(result.logs || []);
                }
                setTotal(result.total || 0);
                setTotalPages(result.totalPages || 1);
            }
        } catch (err) {
            setError(err.response?.data?.error?.message || "Failed to load audit trail");
        } finally {
            setLoading(false);
        }
    }, [entityId, entityType, userId, mode, category, page, compact]);

    useEffect(() => {
        if (entityId || userId) {
            fetchLogs(true);
            setPage(1);
        }
    }, [entityId, userId, category]);

    useEffect(() => {
        if (page > 1) {
            fetchLogs(false);
        }
    }, [page]);

    const handleCategoryChange = (cat) => {
        setCategory(cat);
    };

    const handleLoadMore = () => {
        if (page < totalPages) {
            setPage(p => p + 1);
        }
    };

    const toggleExpand = (id) => {
        setExpandedId(prev => prev === id ? null : id);
    };

    // ─── Render ───────────────────────────────────────────────────────────

    return (
        <div style={styles.container}>
            {showHeader && (
                <div style={styles.header}>
                    <div style={styles.headerTitle}>
                        <span style={styles.headerIcon}>📋</span>
                        <h3 style={styles.headerText}>Audit Trail</h3>
                        {total > 0 && (
                            <span style={styles.badge}>{total} entries</span>
                        )}
                    </div>
                </div>
            )}

            {showFilters && (
                <div style={styles.filterBar}>
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat.key}
                            onClick={() => handleCategoryChange(cat.key)}
                            style={{
                                ...styles.filterChip,
                                ...(category === cat.key ? {
                                    background: cat.color,
                                    color: "#fff",
                                    borderColor: cat.color,
                                } : {}),
                            }}
                        >
                            <span style={{ fontSize: "12px" }}>{cat.icon}</span>
                            <span>{cat.label}</span>
                        </button>
                    ))}
                </div>
            )}

            <div style={{ ...styles.timeline, maxHeight, overflowY: "auto" }}>
                {loading && logs.length === 0 ? (
                    <div style={styles.skeletonContainer}>
                        {[...Array(5)].map((_, i) => (
                            <div key={i} style={styles.skeleton}>
                                <div style={styles.skeletonIcon} />
                                <div style={styles.skeletonLines}>
                                    <div style={{ ...styles.skeletonLine, width: "60%" }} />
                                    <div style={{ ...styles.skeletonLine, width: "40%" }} />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : error ? (
                    <div style={styles.errorState}>
                        <span style={{ fontSize: "24px" }}>⚠️</span>
                        <p style={styles.errorText}>{error}</p>
                        <button onClick={() => fetchLogs(true)} style={styles.retryBtn}>
                            Retry
                        </button>
                    </div>
                ) : logs.length === 0 ? (
                    <div style={styles.emptyState}>
                        <span style={{ fontSize: "32px" }}>📭</span>
                        <p style={styles.emptyText}>No audit records found</p>
                        <p style={styles.emptySubtext}>
                            Actions on this {entityType?.toLowerCase() || "entity"} will appear here
                        </p>
                    </div>
                ) : (
                    <>
                        {logs.map((log, index) => {
                            const display = getActionDisplay(log.action);
                            const isExpanded = expandedId === log._id;
                            const isLast = index === logs.length - 1;

                            return (
                                <div
                                    key={log._id}
                                    style={styles.timelineItem}
                                    onClick={() => toggleExpand(log._id)}
                                    role="button"
                                    tabIndex={0}
                                >
                                    {/* Timeline line */}
                                    <div style={styles.timelineLine}>
                                        <div style={{
                                            ...styles.timelineDot,
                                            background: display.color,
                                            boxShadow: `0 0 0 4px ${display.color}22`,
                                        }}>
                                            <span style={{ fontSize: compact ? "10px" : "12px" }}>
                                                {display.icon}
                                            </span>
                                        </div>
                                        {!isLast && <div style={styles.timelineConnector} />}
                                    </div>

                                    {/* Content */}
                                    <div style={{
                                        ...styles.timelineContent,
                                        ...(isExpanded ? styles.timelineContentExpanded : {}),
                                    }}>
                                        <div style={styles.timelineRow}>
                                            <span style={styles.actionLabel}>{display.label}</span>
                                            <span
                                                style={styles.timeAgo}
                                                title={fullDateTime(log.createdAt)}
                                            >
                                                {timeAgo(log.createdAt)}
                                            </span>
                                        </div>

                                        <div style={styles.metaRow}>
                                            {log.performedBy?.name && (
                                                <span style={styles.actorName}>
                                                    {log.performedBy.name}
                                                </span>
                                            )}
                                            {log.performedBy?.role && (
                                                <span style={styles.roleBadge}>
                                                    {log.performedBy.role}
                                                </span>
                                            )}
                                        </div>

                                        {log.description && !compact && (
                                            <p style={styles.description}>{log.description}</p>
                                        )}

                                        {isExpanded && log.details && (
                                            <div style={styles.detailsPanel}>
                                                {log.details.changes && (
                                                    <div style={styles.changesBox}>
                                                        <h4 style={styles.changesTitle}>Changes</h4>
                                                        <pre style={styles.changesPre}>
                                                            {JSON.stringify(log.details.changes, null, 2)}
                                                        </pre>
                                                    </div>
                                                )}
                                                <div style={styles.metaGrid}>
                                                    {log.ipAddress && (
                                                        <div style={styles.metaItem}>
                                                            <span style={styles.metaLabel}>IP</span>
                                                            <span style={styles.metaValue}>{log.ipAddress}</span>
                                                        </div>
                                                    )}
                                                    {log.browser && (
                                                        <div style={styles.metaItem}>
                                                            <span style={styles.metaLabel}>Browser</span>
                                                            <span style={styles.metaValue}>{log.browser}</span>
                                                        </div>
                                                    )}
                                                    {log.device && (
                                                        <div style={styles.metaItem}>
                                                            <span style={styles.metaLabel}>Device</span>
                                                            <span style={styles.metaValue}>{log.device}</span>
                                                        </div>
                                                    )}
                                                    {log.correlationId && (
                                                        <div style={styles.metaItem}>
                                                            <span style={styles.metaLabel}>Request ID</span>
                                                            <span style={styles.metaValue}>
                                                                {log.correlationId.slice(0, 12)}…
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {page < totalPages && (
                            <div style={styles.loadMoreContainer}>
                                <button
                                    onClick={handleLoadMore}
                                    disabled={loading}
                                    style={styles.loadMoreBtn}
                                >
                                    {loading ? "Loading…" : `Load more (${logs.length} of ${total})`}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ─── Styles (Inline — Design System portable) ───────────────────────────────

const styles = {
    container: {
        background: "#fff",
        borderRadius: "12px",
        border: "1px solid #e5e7eb",
        overflow: "hidden",
    },
    header: {
        padding: "16px 20px",
        borderBottom: "1px solid #f3f4f6",
        background: "#fafbfc",
    },
    headerTitle: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
    },
    headerIcon: { fontSize: "18px" },
    headerText: {
        margin: 0,
        fontSize: "16px",
        fontWeight: 600,
        color: "#111827",
    },
    badge: {
        background: "#e5e7eb",
        color: "#374151",
        fontSize: "11px",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: "10px",
    },
    filterBar: {
        display: "flex",
        gap: "6px",
        padding: "12px 20px",
        borderBottom: "1px solid #f3f4f6",
        overflowX: "auto",
        flexWrap: "nowrap",
    },
    filterChip: {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "4px 10px",
        borderRadius: "16px",
        border: "1px solid #d1d5db",
        background: "#fff",
        color: "#374151",
        fontSize: "12px",
        fontWeight: 500,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "all 0.15s",
    },
    timeline: {
        padding: "16px 20px",
    },
    timelineItem: {
        display: "flex",
        gap: "12px",
        cursor: "pointer",
        marginBottom: "4px",
    },
    timelineLine: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "24px",
        flexShrink: 0,
    },
    timelineDot: {
        width: "24px",
        height: "24px",
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    timelineConnector: {
        width: "2px",
        flexGrow: 1,
        background: "#e5e7eb",
        minHeight: "16px",
    },
    timelineContent: {
        flex: 1,
        padding: "4px 12px 16px",
        borderRadius: "8px",
        transition: "background 0.15s",
    },
    timelineContentExpanded: {
        background: "#f9fafb",
    },
    timelineRow: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "8px",
    },
    actionLabel: {
        fontSize: "13px",
        fontWeight: 600,
        color: "#111827",
    },
    timeAgo: {
        fontSize: "11px",
        color: "#9ca3af",
        whiteSpace: "nowrap",
        cursor: "help",
    },
    metaRow: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginTop: "2px",
    },
    actorName: {
        fontSize: "12px",
        color: "#6b7280",
    },
    roleBadge: {
        fontSize: "10px",
        fontWeight: 600,
        color: "#6366f1",
        background: "#eef2ff",
        padding: "1px 6px",
        borderRadius: "4px",
        textTransform: "capitalize",
    },
    description: {
        fontSize: "12px",
        color: "#9ca3af",
        margin: "4px 0 0",
        lineHeight: 1.4,
    },
    detailsPanel: {
        marginTop: "8px",
        padding: "10px",
        background: "#f3f4f6",
        borderRadius: "6px",
    },
    changesBox: {
        marginBottom: "8px",
    },
    changesTitle: {
        margin: "0 0 4px",
        fontSize: "11px",
        fontWeight: 600,
        color: "#6b7280",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
    },
    changesPre: {
        margin: 0,
        fontSize: "11px",
        fontFamily: "'JetBrains Mono', monospace",
        color: "#374151",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: "200px",
        overflowY: "auto",
    },
    metaGrid: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "6px",
    },
    metaItem: {
        display: "flex",
        flexDirection: "column",
    },
    metaLabel: {
        fontSize: "10px",
        fontWeight: 600,
        color: "#9ca3af",
        textTransform: "uppercase",
    },
    metaValue: {
        fontSize: "12px",
        color: "#374151",
    },
    skeletonContainer: {
        display: "flex",
        flexDirection: "column",
        gap: "12px",
    },
    skeleton: {
        display: "flex",
        gap: "12px",
        alignItems: "flex-start",
    },
    skeletonIcon: {
        width: "24px",
        height: "24px",
        borderRadius: "50%",
        background: "#e5e7eb",
        animation: "pulse 1.5s infinite",
    },
    skeletonLines: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: "6px",
    },
    skeletonLine: {
        height: "12px",
        borderRadius: "4px",
        background: "#e5e7eb",
        animation: "pulse 1.5s infinite",
    },
    errorState: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
        padding: "32px 16px",
    },
    errorText: {
        fontSize: "13px",
        color: "#ef4444",
        margin: 0,
    },
    retryBtn: {
        fontSize: "12px",
        padding: "6px 16px",
        borderRadius: "6px",
        border: "1px solid #d1d5db",
        background: "#fff",
        color: "#374151",
        cursor: "pointer",
    },
    emptyState: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
        padding: "40px 16px",
    },
    emptyText: {
        fontSize: "14px",
        fontWeight: 600,
        color: "#6b7280",
        margin: 0,
    },
    emptySubtext: {
        fontSize: "12px",
        color: "#9ca3af",
        margin: 0,
    },
    loadMoreContainer: {
        display: "flex",
        justifyContent: "center",
        padding: "12px 0",
    },
    loadMoreBtn: {
        fontSize: "12px",
        padding: "6px 20px",
        borderRadius: "6px",
        border: "1px solid #d1d5db",
        background: "#fff",
        color: "#374151",
        cursor: "pointer",
        fontWeight: 500,
    },
};
