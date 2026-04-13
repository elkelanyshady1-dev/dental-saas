/**
 * AuthAnalyticsPage.jsx — Authorization Analytics Dashboard
 *
 * Enterprise-grade analytics dashboard for monitoring authorization
 * decisions across the Dental SaaS platform.
 *
 * Phase 20.1 — Live data via React Query with auto-polling.
 * Graceful fallback to mock data when backend unavailable.
 *
 * MODULE: frontend/src/modules/org/security/analytics
 * PLANE: Org only. security.manage access required.
 *
 * SECTIONS:
 *   1. Summary KPI cards (4)
 *   2. Timeline chart (allow/deny over time)
 *   3. Distribution donut + Denied permissions bar chart
 *   4. Recent denials table + Risk users table
 *   5. Layer performance + Field violations
 *   6. Auth Inspector (DEV trace panel)
 *   7. Queue Health bar (footer)
 */
import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
    BarChart3,
    ShieldCheck,
    ShieldX,
    Clock,
    Activity,
    RefreshCw,
    Settings,
    SlidersHorizontal,
    ChevronDown,
    Wifi,
    WifiOff,
    Loader2,
    AlertCircle,
} from "lucide-react";

// Components
import AuthSummaryCard from "../components/AuthSummaryCard";
import AuthLineChart from "../components/AuthLineChart";
import AuthDonutChart from "../components/AuthDonutChart";
import AuthBarChart from "../components/AuthBarChart";
import AuthDenialsTable from "../components/AuthDenialsTable";
import AuthRiskUsersTable from "../components/AuthRiskUsersTable";
import AuthLayerPerformance from "../components/AuthLayerPerformance";
import AuthFieldViolations from "../components/AuthFieldViolations";
import AuthInspectorPanel from "../components/AuthInspectorPanel";
import AuthAlertsPanel from "../components/AuthAlertsPanel";
import AuthInsights from "../components/AuthInsights";
import RTLToggle from "../components/RTLToggle";

// React Query hooks
import {
    useAuthSummary,
    useAuthTimeline,
    useAuthDistribution,
    useAuthDeniedPermissions,
    useAuthRecentDenials,
    useAuthRiskUsers,
    useAuthLayerPerformance,
    useAuthFieldViolations,
    useAuthQueueHealth,
    useRefreshAuthAnalytics,
    useAuthAlerts,
    useAuthPrefetch,
} from "../hooks/useAuthAnalytics";
import { useAuthRealtime } from "../hooks/useAuthRealtime";

// Fallback mock data (graceful degradation)
import {
    summary as mockSummary,
    timelineData as mockTimeline,
    distributionData as mockDistribution,
    deniedPermissions as mockDeniedPermissions,
    recentDenials as mockRecentDenials,
    riskUsers as mockRiskUsers,
    layerPerformance as mockLayerPerformance,
    fieldViolations as mockFieldViolations,
    inspectorTrace as mockInspectorTrace,
} from "../data/mockData";

const DATE_RANGES = [
    { id: "24h", label: "Last 24h" },
    { id: "7d", label: "Last 7 Days" },
    { id: "30d", label: "Last 30 Days" },
];

const ROLE_FILTERS = [
    { id: "all", label: "All Roles" },
    { id: "dentist", label: "Dentist" },
    { id: "nurse", label: "Nurse" },
    { id: "receptionist", label: "Receptionist" },
    { id: "admin", label: "Admin" },
];

// ─── Loading Skeleton ────────────────────────────────────────────────────────

function SkeletonBlock({ height = 200, style = {} }) {
    return (
        <div
            style={{
                background: "#fff",
                borderRadius: 20,
                border: "1px solid #E2E8F0",
                overflow: "hidden",
                height,
                position: "relative",
                ...style,
            }}
        >
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    background:
                        "linear-gradient(90deg, transparent 0%, #F8FAFC 50%, transparent 100%)",
                    animation: "shimmer 1.5s infinite",
                }}
            />
            <style>{`
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.4; }
                }
            `}</style>
        </div>
    );
}

// ─── Error Banner ────────────────────────────────────────────────────────────

function ErrorBanner({ message, onRetry }) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 20px",
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                borderRadius: 14,
                marginBottom: 16,
            }}
        >
            <AlertCircle size={16} style={{ color: "#EF4444", flexShrink: 0 }} />
            <span
                style={{
                    flex: 1,
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#DC2626",
                }}
            >
                {message}
            </span>
            {onRetry && (
                <button
                    onClick={onRetry}
                    style={{
                        padding: "6px 14px",
                        borderRadius: 10,
                        border: "1px solid #FECACA",
                        background: "#fff",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#DC2626",
                        cursor: "pointer",
                        transition: "all 0.15s",
                    }}
                >
                    Retry
                </button>
            )}
        </div>
    );
}

// ─── Live Indicator ──────────────────────────────────────────────────────────

function LiveIndicator({ isLive, isPolling, lastUpdated }) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 10,
                fontWeight: 700,
                color: "#94A3B8",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
            }}
        >
            {isPolling ? (
                <Loader2
                    size={12}
                    style={{
                        color: "#2563EB",
                        animation: "spin 1s linear infinite",
                    }}
                />
            ) : isLive ? (
                <Wifi size={12} style={{ color: "#10B981" }} />
            ) : (
                <WifiOff size={12} style={{ color: "#EF4444" }} />
            )}
            <Activity size={12} />
            Analytics Engine:{" "}
            <span style={{ color: isLive ? "#10B981" : "#EF4444" }}>
                {isLive ? "Live" : "Offline"}
            </span>
            {lastUpdated && (
                <span style={{ color: "#CBD5E1", marginInlineStart: 8 }}>
                    Updated {lastUpdated}
                </span>
            )}
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function AuthAnalyticsPage() {
    const [dateRange, setDateRange] = useState("24h");
    const [roleFilter, setRoleFilter] = useState("all");
    const [showInspector, setShowInspector] = useState(true);
    const [pollingEnabled, setPollingEnabled] = useState(true);

    // Build query params from filters
    const queryParams = useMemo(
        () => ({
            range: dateRange,
            ...(roleFilter !== "all" && { role: roleFilter }),
        }),
        [dateRange, roleFilter]
    );

    const hookOptions = { polling: pollingEnabled };

    // ─── Data Hooks ──────────────────────────────────────────────────────────

    const summaryQ = useAuthSummary(queryParams, hookOptions);
    const timelineQ = useAuthTimeline(queryParams, hookOptions);
    const distributionQ = useAuthDistribution(queryParams, hookOptions);
    const deniedPermissionsQ = useAuthDeniedPermissions(queryParams, hookOptions);
    const recentDenialsQ = useAuthRecentDenials(queryParams, hookOptions);
    const riskUsersQ = useAuthRiskUsers(queryParams, hookOptions);
    const layerPerformanceQ = useAuthLayerPerformance(queryParams, hookOptions);
    const fieldViolationsQ = useAuthFieldViolations(queryParams, hookOptions);
    const queueHealthQ = useAuthQueueHealth(hookOptions);
    const alertsQ = useAuthAlerts(queryParams, hookOptions);
    const { refresh } = useRefreshAuthAnalytics();
    const { prefetchUser, prefetchPermission } = useAuthPrefetch();

    // ─── Real-Time Streaming (TASK-FE-AUTH-INT-003) ───────────────────────────

    const realtime = useAuthRealtime({
        enabled: pollingEnabled,
        onDenial: useCallback((event) => {
            // Real-time denial events update the cache automatically
            // via debounced invalidation in useAuthRealtime
        }, []),
    });

    // ─── Derived State ───────────────────────────────────────────────────────

    // Use live data when available, fall back to mock
    const summary = summaryQ.data ?? mockSummary;
    const timelineData = timelineQ.data ?? mockTimeline;
    const distributionData = distributionQ.data ?? mockDistribution;
    const deniedPermissions = deniedPermissionsQ.data ?? mockDeniedPermissions;
    const recentDenials = recentDenialsQ.data ?? mockRecentDenials;
    const riskUsers = riskUsersQ.data ?? mockRiskUsers;
    const layerPerformance = layerPerformanceQ.data ?? mockLayerPerformance;
    const fieldViolations = fieldViolationsQ.data ?? mockFieldViolations;
    const inspectorTrace = mockInspectorTrace; // Inspector is DEV-only, mock is fine
    const alerts = alertsQ.data ?? [];

    // Check if any query has errored
    const allQueries = [
        summaryQ, timelineQ, distributionQ, deniedPermissionsQ,
        recentDenialsQ, riskUsersQ, layerPerformanceQ, fieldViolationsQ,
    ];
    const hasError = allQueries.some((q) => q.isError);
    const isAnyLoading = allQueries.some((q) => q.isLoading);
    const isLive = allQueries.some((q) => q.isSuccess);
    const isRefetching = allQueries.some((q) => q.isFetching && !q.isLoading);

    // Compute trends from summary (backend should return these, but fallback to mock)
    const summaryTrends = useMemo(() => ({
        total: summary.totalTrend ?? 12.4,
        allowRate: summary.allowRateTrend ?? 0.3,
        denyRate: summary.denyRateTrend ?? -0.2,
        avgDuration: summary.avgDurationTrend ?? -5.1,
    }), [summary]);

    // Format large numbers
    const formatNumber = useCallback((num) => {
        if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
        if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
        return num?.toLocaleString();
    }, []);

    // Last updated timestamp
    const [lastUpdated, setLastUpdated] = useState(null);
    useEffect(() => {
        if (isRefetching || isLive) {
            const now = new Date();
            setLastUpdated(
                now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
            );
        }
    }, [summaryQ.dataUpdatedAt]);

    // Refresh handler
    const handleRefresh = useCallback(() => {
        refresh();
    }, [refresh]);

    // ─── Drill-down Handlers (TASK-FE-AUTH-INT-004) ───────────────────────────

    const handlePermissionClick = useCallback((permission) => {
        // Scroll to inspector or open permission detail view
        console.log("[drill-down] Permission:", permission);
    }, []);

    const handleUserClick = useCallback((userId) => {
        // Navigate to user detail or open user denial breakdown
        console.log("[drill-down] User:", userId);
    }, []);

    const handleAlertAcknowledge = useCallback((alertId) => {
        // Optimistic update — will wire to API when backend ready
        console.log("[alert] Acknowledged:", alertId);
    }, []);

    const handleInsightNavigate = useCallback((target) => {
        // Scroll to the relevant section
        const sectionMap = {
            denials: "section-denials",
            "risk-users": "section-risk-users",
            layers: "section-layers",
            violations: "section-violations",
            permissions: "section-distribution",
        };
        const el = document.getElementById(sectionMap[target]);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, []);

    return (
        <div
            className="flex-1 flex flex-col h-full overflow-hidden"
            dir="auto"
        >
            {/* ═══════════════════════════════════════
                HEADER
            ═══════════════════════════════════════ */}
            <div
                style={{
                    padding: "24px 32px 0",
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 16,
                }}
            >
                {/* Title section */}
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div
                        style={{
                            width: 44,
                            height: 44,
                            background: "linear-gradient(135deg, #4F46E5, #2563EB)",
                            borderRadius: 14,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            boxShadow: "0 4px 14px rgba(79, 70, 229, 0.3)",
                        }}
                    >
                        <BarChart3 size={22} />
                    </div>
                    <div>
                        <h1
                            style={{
                                fontSize: 20,
                                fontWeight: 900,
                                color: "#0F172A",
                                letterSpacing: "-0.02em",
                                margin: 0,
                            }}
                        >
                            Authorization Analytics
                        </h1>
                        <p
                            style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#94A3B8",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                margin: "2px 0 0",
                            }}
                        >
                            Real-time RBAC · PBAC · Field-Level Monitoring
                            {!isLive && !isAnyLoading && (
                                <span style={{ color: "#F59E0B", marginInlineStart: 8 }}>
                                    (MOCK DATA)
                                </span>
                            )}
                        </p>
                    </div>
                </div>

                {/* Controls */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                    }}
                >
                    {/* Date Range Filter */}
                    <div
                        style={{
                            display: "flex",
                            background: "#F1F5F9",
                            borderRadius: 12,
                            padding: 3,
                        }}
                    >
                        {DATE_RANGES.map((range) => (
                            <button
                                key={range.id}
                                onClick={() => setDateRange(range.id)}
                                style={{
                                    padding: "7px 14px",
                                    borderRadius: 10,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    border: "none",
                                    cursor: "pointer",
                                    transition: "all 0.15s",
                                    background:
                                        dateRange === range.id
                                            ? "#fff"
                                            : "transparent",
                                    color:
                                        dateRange === range.id
                                            ? "#0F172A"
                                            : "#94A3B8",
                                    boxShadow:
                                        dateRange === range.id
                                            ? "0 1px 3px rgba(0,0,0,0.08)"
                                            : "none",
                                }}
                            >
                                {range.label}
                            </button>
                        ))}
                    </div>

                    {/* Role Filter */}
                    <div style={{ position: "relative" }}>
                        <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                            style={{
                                appearance: "none",
                                padding: "8px 32px 8px 14px",
                                borderRadius: 12,
                                border: "1px solid #E2E8F0",
                                background: "#fff",
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#475569",
                                cursor: "pointer",
                                outline: "none",
                            }}
                        >
                            {ROLE_FILTERS.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.label}
                                </option>
                            ))}
                        </select>
                        <ChevronDown
                            size={12}
                            style={{
                                position: "absolute",
                                insetInlineEnd: 12,
                                top: "50%",
                                transform: "translateY(-50%)",
                                color: "#94A3B8",
                                pointerEvents: "none",
                            }}
                        />
                    </div>

                    {/* RTL Toggle (TASK-FE-AUTH-INT-008) */}
                    <RTLToggle />

                    {/* Live Polling Toggle */}
                    <button
                        onClick={() => setPollingEnabled(!pollingEnabled)}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "8px 14px",
                            borderRadius: 12,
                            border: `1px solid ${pollingEnabled ? "#BBF7D0" : "#E2E8F0"}`,
                            background: pollingEnabled ? "#ECFDF5" : "#fff",
                            fontSize: 11,
                            fontWeight: 700,
                            color: pollingEnabled ? "#16A34A" : "#94A3B8",
                            cursor: "pointer",
                            transition: "all 0.15s",
                        }}
                        title={pollingEnabled ? "Auto-refresh ON" : "Auto-refresh OFF"}
                    >
                        {pollingEnabled ? <Wifi size={12} /> : <WifiOff size={12} />}
                        {pollingEnabled ? "Live" : "Paused"}
                        {realtime.isConnected && (
                            <span
                                style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: "50%",
                                    background: "#10B981",
                                    animation: "pulse 2s infinite",
                                }}
                            />
                        )}
                    </button>

                    {/* Refresh */}
                    <button
                        onClick={handleRefresh}
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: 12,
                            border: "1px solid #E2E8F0",
                            background: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: isRefetching ? "#2563EB" : "#64748B",
                            cursor: "pointer",
                            transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#F8FAFC";
                            e.currentTarget.style.color = "#2563EB";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = "#fff";
                            e.currentTarget.style.color = isRefetching ? "#2563EB" : "#64748B";
                        }}
                        title="Refresh all data"
                    >
                        <RefreshCw
                            size={14}
                            style={{
                                animation: isRefetching ? "spin 1s linear infinite" : "none",
                            }}
                        />
                    </button>

                    {/* Settings */}
                    <button
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: 12,
                            border: "1px solid #E2E8F0",
                            background: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#64748B",
                            cursor: "pointer",
                            transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#F8FAFC";
                            e.currentTarget.style.color = "#2563EB";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = "#fff";
                            e.currentTarget.style.color = "#64748B";
                        }}
                        title="Settings"
                    >
                        <Settings size={14} />
                    </button>
                </div>
            </div>

            {/* ═══════════════════════════════════════
                DASHBOARD CONTENT
            ═══════════════════════════════════════ */}
            <div
                style={{
                    flex: 1,
                    overflow: "auto",
                    padding: "24px 32px 40px",
                    background: "#F8FAFC",
                }}
            >
                {/* ─── Error Banner ─── */}
                {hasError && (
                    <ErrorBanner
                        message="Some analytics data could not be loaded. Showing cached or fallback data."
                        onRetry={handleRefresh}
                    />
                )}

                {/* ─── SECTION 1: Summary Cards ─── */}
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns:
                            "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: 16,
                        marginBottom: 28,
                    }}
                >
                    {summaryQ.isLoading ? (
                        <>
                            <SkeletonBlock height={120} />
                            <SkeletonBlock height={120} />
                            <SkeletonBlock height={120} />
                            <SkeletonBlock height={120} />
                        </>
                    ) : (
                        <>
                            <AuthSummaryCard
                                title="Total Requests"
                                value={formatNumber(summary.total)}
                                trend={summaryTrends.total}
                                trendLabel="vs previous period"
                                icon={Activity}
                                color="#2563EB"
                                bg="#EFF6FF"
                            />
                            <AuthSummaryCard
                                title="Allow Rate"
                                value={`${summary.allowRate}%`}
                                trend={summaryTrends.allowRate}
                                trendLabel="from target 98%"
                                icon={ShieldCheck}
                                color="#10B981"
                                bg="#ECFDF5"
                            />
                            <AuthSummaryCard
                                title="Deny Rate"
                                value={`${summary.denyRate}%`}
                                trend={summaryTrends.denyRate}
                                trendLabel="decreasing"
                                icon={ShieldX}
                                color="#EF4444"
                                bg="#FEF2F2"
                            />
                            <AuthSummaryCard
                                title="Avg Auth Duration"
                                value={`${summary.avgDuration}ms`}
                                trend={summaryTrends.avgDuration}
                                trendLabel="faster than last period"
                                icon={Clock}
                                color="#8B5CF6"
                                bg="#F5F3FF"
                            />
                        </>
                    )}
                </div>

                {/* ─── SECTION 2: Timeline Chart ─── */}
                <div style={{ marginBottom: 28 }}>
                    {timelineQ.isLoading ? (
                        <SkeletonBlock height={340} />
                    ) : (
                        <AuthLineChart data={timelineData} />
                    )}
                </div>

                {/* ─── SECTION 2.5: Smart Insights (TASK-FE-AUTH-INT-006) ─── */}
                <div style={{ marginBottom: 28 }}>
                    <AuthInsights
                        summary={summary}
                        layerPerformance={layerPerformance}
                        riskUsers={riskUsers}
                        fieldViolations={fieldViolations}
                        deniedPermissions={deniedPermissions}
                        onNavigate={handleInsightNavigate}
                    />
                </div>

                {/* ─── SECTION 3: Distribution + Top Denied ─── */}
                <div
                    id="section-distribution"
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 2fr",
                        gap: 20,
                        marginBottom: 28,
                    }}
                >
                    {distributionQ.isLoading ? (
                        <SkeletonBlock height={360} />
                    ) : (
                        <AuthDonutChart data={distributionData} />
                    )}
                    {deniedPermissionsQ.isLoading ? (
                        <SkeletonBlock height={360} />
                    ) : (
                        <AuthBarChart
                            data={deniedPermissions}
                            onBarClick={handlePermissionClick}
                            onBarHover={(perm) => prefetchPermission(perm)}
                        />
                    )}
                </div>

                {/* ─── SECTION 4: Tables ─── */}
                <div
                    id="section-denials"
                    style={{
                        display: "grid",
                        gridTemplateColumns: "2fr 1fr",
                        gap: 20,
                        marginBottom: 28,
                    }}
                >
                    {recentDenialsQ.isLoading ? (
                        <SkeletonBlock height={400} />
                    ) : (
                        <AuthDenialsTable data={recentDenials} />
                    )}
                    {riskUsersQ.isLoading ? (
                        <SkeletonBlock height={400} />
                    ) : (
                        <AuthRiskUsersTable
                            data={riskUsers}
                            onUserClick={handleUserClick}
                            onUserHover={(userId) => prefetchUser(userId)}
                        />
                    )}
                </div>

                {/* ─── SECTION 5: Advanced Insights ─── */}
                <div
                    id="section-layers"
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 20,
                        marginBottom: 28,
                    }}
                >
                    {layerPerformanceQ.isLoading ? (
                        <SkeletonBlock height={380} />
                    ) : (
                        <AuthLayerPerformance data={layerPerformance} />
                    )}
                    {fieldViolationsQ.isLoading ? (
                        <SkeletonBlock height={380} />
                    ) : (
                        <AuthFieldViolations data={fieldViolations} />
                    )}
                </div>

                {/* ─── SECTION 5.5: Security Alerts (TASK-FE-AUTH-INT-005) ─── */}
                <div id="section-violations" style={{ marginBottom: 28 }}>
                    <AuthAlertsPanel
                        alerts={[
                            ...realtime.alerts,
                            ...(alerts || []),
                        ]}
                        onAcknowledge={handleAlertAcknowledge}
                        onDrillDown={(type, target) => {
                            if (type === "user") handleUserClick(target);
                        }}
                    />
                </div>

                {/* ─── SECTION 6: Auth Inspector ─── */}
                <div style={{ marginBottom: 16 }}>
                    <button
                        onClick={() => setShowInspector(!showInspector)}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "10px 18px",
                            borderRadius: 12,
                            border: "1px solid #1E293B",
                            background: "#0F172A",
                            color: "#10B981",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            transition: "all 0.15s",
                            marginBottom: 16,
                        }}
                        onMouseEnter={(e) =>
                            (e.currentTarget.style.background = "#1E293B")
                        }
                        onMouseLeave={(e) =>
                            (e.currentTarget.style.background = "#0F172A")
                        }
                    >
                        <SlidersHorizontal size={14} />
                        {showInspector ? "Hide" : "Show"} Auth Inspector (DEV)
                        <ChevronDown
                            size={12}
                            style={{
                                transform: showInspector
                                    ? "rotate(180deg)"
                                    : "rotate(0deg)",
                                transition: "transform 0.2s",
                            }}
                        />
                    </button>

                    {showInspector && (
                        <AuthInspectorPanel trace={inspectorTrace} />
                    )}
                </div>
            </div>

            {/* ═══════════════════════════════════════
                FOOTER
            ═══════════════════════════════════════ */}
            <div
                style={{
                    height: 40,
                    background: "#fff",
                    borderTop: "1px solid #E2E8F0",
                    padding: "0 32px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexShrink: 0,
                }}
            >
                <LiveIndicator
                    isLive={isLive}
                    isPolling={isRefetching}
                    lastUpdated={lastUpdated}
                />
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                    }}
                >
                    {/* Queue health indicator */}
                    {queueHealthQ.data && (
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: 10,
                                fontWeight: 700,
                                color: "#94A3B8",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                            }}
                        >
                            Queue:{" "}
                            <span
                                style={{
                                    color:
                                        queueHealthQ.data.waiting > 100
                                            ? "#F59E0B"
                                            : "#10B981",
                                }}
                            >
                                {queueHealthQ.data.waiting ?? 0} waiting
                            </span>
                            {" · "}
                            <span style={{ color: "#10B981" }}>
                                {queueHealthQ.data.completed ?? 0} completed
                            </span>
                            {queueHealthQ.data.failed > 0 && (
                                <>
                                    {" · "}
                                    <span style={{ color: "#EF4444" }}>
                                        {queueHealthQ.data.failed} failed
                                    </span>
                                </>
                            )}
                        </div>
                    )}
                    <div
                        style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#94A3B8",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                        }}
                    >
                        Auth Trace v2.0 · RBAC + PBAC + Field-Level
                    </div>
                </div>
            </div>
        </div>
    );
}
