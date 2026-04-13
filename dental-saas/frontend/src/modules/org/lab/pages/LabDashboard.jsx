/**
 * LabDashboard.jsx — Lab Domain Dashboard (v2 — Production-Ready)
 *
 * HARDENED — Uses DTO-shaped data, no mock fallbacks hidden in KPIs,
 * real data-driven bar chart, CSS shimmer loading, DTO assertions.
 *
 * Matches provided design reference:
 *   - 4 KPI cards (Active Cases, Pending Submissions, In Production, Monthly Expenses)
 *   - Case Volume by Lab bar chart (API-driven)
 *   - Activity Feed
 *   - Priority Case Monitoring table
 *
 * CAPABILITY GATE: useCapability("lab.view") — rendered by parent route only when entitled.
 */

import React, { useState, useMemo } from "react";
import { useNavigate }              from "react-router-dom";
import { useLabDashboard, useLabPriority, useLabPartners, useLabCases } from "../hooks/useLab";
import { assertLabCaseDTO } from "../utils/assertLabDTO";
import "./LabDashboard.css";

const STATUS_COLORS = {
    draft:         "#9CA3AF",
    sent:          "#3B82F6",
    accepted:      "#8B5CF6",
    in_production: "#F59E0B",
    shipped:       "#06B6D4",
    delivered:     "#10B981",
    completed:     "#6B7280",
};

// ── Shimmer skeleton for loading states ───────────────────────────────────────
function ShimmerBlock({ width = "100%", height = "1.2rem", style = {} }) {
    return (
        <div className="lab-shimmer" style={{ width, height, borderRadius: 6, ...style }} />
    );
}

function KpiCard({ icon, label, value, badge, badgeColor, loading }) {
    return (
        <div className="lab-kpi-card">
            <div className="lab-kpi-top">
                <span className="lab-kpi-icon">{icon}</span>
                {badge && (
                    <span className="lab-kpi-badge" style={{ color: badgeColor || "#10B981" }}>
                        {badge}
                    </span>
                )}
            </div>
            <p className="lab-kpi-label">{label}</p>
            {loading
                ? <ShimmerBlock height="2rem" width="50%" />
                : <p className="lab-kpi-value">{value}</p>
            }
        </div>
    );
}

function ActivityItem({ item }) {
    const iconMap = {
        draft:         { bg: "#EFF6FF", color: "#3B82F6", symbol: "▶" },
        sent:          { bg: "#EFF6FF", color: "#3B82F6", symbol: "▶" },
        accepted:      { bg: "#D1FAE5", color: "#10B981", symbol: "✓" },
        in_production: { bg: "#FEF3C7", color: "#F59E0B", symbol: "▲" },
        shipped:       { bg: "#F0FDF4", color: "#6B7280", symbol: "●" },
        delivered:     { bg: "#ECFDF5", color: "#10B981", symbol: "◈" },
    };
    const ico = iconMap[item.status] || iconMap.draft;
    return (
        <div className="lab-activity-item">
            <span className="lab-activity-dot" style={{ background: ico.bg, color: ico.color }}>{ico.symbol}</span>
            <div>
                <p className="lab-activity-title">
                    Case {item.caseCode} — {item.labDisplayName || item.labName || "—"}
                </p>
                <p className="lab-activity-sub">
                    {item.status?.replace("_", " ").toUpperCase()} · {_relTime(item.updatedAt)}
                </p>
            </div>
        </div>
    );
}

function _relTime(ts) {
    if (!ts) return "";
    const diff = Date.now() - new Date(ts);
    if (diff < 60000)   return "just now";
    if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    const days = Math.floor(diff / 86400000);
    return days === 1 ? "yesterday" : `${days}d ago`;
}

function StatusBadge({ status }) {
    const label = status?.replace("_", " ").toUpperCase();
    return (
        <span className="lab-status-badge" style={{
            background: (STATUS_COLORS[status] || "#9CA3AF") + "20",
            color: STATUS_COLORS[status] || "#9CA3AF",
        }}>
            {label}
        </span>
    );
}

/**
 * BarChart — real data-driven bar chart (no mock data).
 * Uses lab cases grouped by lab partner to show case volume distribution.
 */
function BarChart({ cases, labs }) {
    const labVolume = useMemo(() => {
        if (!cases?.length) return [];

        const volumeMap = {};
        for (const c of cases) {
            const key = c.labId || c.labName || "Unknown";
            const name = c.labDisplayName || c.labName || "Unknown";
            if (!volumeMap[key]) volumeMap[key] = { name, count: 0 };
            volumeMap[key].count++;
        }
        return Object.values(volumeMap)
            .sort((a, b) => b.count - a.count)
            .slice(0, 6);
    }, [cases]);

    if (!labVolume.length) {
        return (
            <div className="lab-chart-empty">
                <p>No active cases to visualize</p>
            </div>
        );
    }

    const maxCount = Math.max(...labVolume.map(l => l.count), 1);

    return (
        <div className="lab-chart-canvas">
            {labVolume.map((lab, i) => {
                const heightPct = Math.max((lab.count / maxCount) * 100, 8);
                return (
                    <div key={lab.name + i} className="lab-chart-bar-group">
                        <div className="lab-chart-bar-value">{lab.count}</div>
                        <div
                            className="lab-chart-bar"
                            style={{
                                height: `${heightPct}%`,
                                animationDelay: `${i * 80}ms`,
                            }}
                        />
                        <span>{lab.name.length > 12 ? lab.name.slice(0, 12) + "…" : lab.name}</span>
                    </div>
                );
            })}
        </div>
    );
}

export default function LabDashboard() {
    const navigate = useNavigate();
    const [chartMode, setChartMode] = useState("monthly");

    const { data: dashData,     isLoading: dashLoading }     = useLabDashboard();
    const { data: priorityData, isLoading: priorityLoading } = useLabPriority();
    const { data: casesData }   = useLabCases({ limit: 200 }); // For chart aggregation

    const kpis     = dashData?.data?.kpis     || {};
    const activity = dashData?.data?.recentActivity || [];
    const priority = priorityData?.data || [];
    const allCases = casesData?.data || [];

    return (
        <div className="lab-dashboard">
            {/* ─── Header ─── */}
            <div className="lab-dash-header">
                <div>
                    <h1 className="lab-page-title">Lab Management</h1>
                    <span className="lab-page-subtitle">External laboratory operations & case tracking</span>
                </div>
                <div className="lab-dash-header-actions">
                    <button className="lab-btn-outline" onClick={() => navigate("directory")}>
                        🏢 Lab Directory
                    </button>
                    <button className="lab-btn-primary" onClick={() => navigate("cases")}>
                        + New Lab Case
                    </button>
                </div>
            </div>

            {/* ─── KPI Cards ─── */}
            <div className="lab-kpi-row">
                <KpiCard
                    icon="📊" label="Active Lab Cases"
                    value={kpis.activeCases ?? 0}
                    badge={kpis.activeCases > 0 ? `${kpis.activeCases} active` : null}
                    badgeColor="#10B981"
                    loading={dashLoading}
                />
                <KpiCard
                    icon="📋" label="Pending Submissions"
                    value={kpis.pendingSubmissions ?? 0}
                    badge={kpis.pendingSubmissions > 0 ? "Requires Action" : null}
                    badgeColor="#F59E0B"
                    loading={dashLoading}
                />
                <KpiCard
                    icon="🏭" label="In Production"
                    value={kpis.inProduction ?? 0}
                    badge={kpis.inProduction > 0 ? "In Production" : null}
                    badgeColor="#8B5CF6"
                    loading={dashLoading}
                />
                <KpiCard
                    icon="💵" label="Monthly Lab Expenses"
                    value={`$${(kpis.monthlyExpenses ?? 0).toLocaleString()}`}
                    badge="This Month"
                    badgeColor="#6B7280"
                    loading={dashLoading}
                />
            </div>

            {/* ─── Middle Row: Chart + Activity ─── */}
            <div className="lab-mid-row">
                {/* Chart Panel */}
                <div className="lab-chart-panel">
                    <div className="lab-chart-header">
                        <div>
                            <h3 className="lab-section-title">Case Volume by Lab</h3>
                            <p className="lab-section-sub">Distribution across external partners</p>
                        </div>
                        <div className="lab-chart-toggle">
                            <button
                                className={chartMode === "weekly" ? "active" : ""}
                                onClick={() => setChartMode("weekly")}
                            >Weekly</button>
                            <button
                                className={chartMode === "monthly" ? "active" : ""}
                                onClick={() => setChartMode("monthly")}
                            >Monthly</button>
                        </div>
                    </div>
                    <BarChart cases={allCases} />
                </div>

                {/* Activity Feed */}
                <div className="lab-activity-panel">
                    <div className="lab-activity-header">
                        <h3 className="lab-section-title">Activity Feed</h3>
                        <button className="lab-link-btn" onClick={() => navigate("cases")}>View All</button>
                    </div>
                    <div className="lab-activity-list">
                        {dashLoading ? (
                            Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="lab-activity-item">
                                    <ShimmerBlock width="28px" height="28px" style={{ borderRadius: "50%", flexShrink: 0 }} />
                                    <div style={{ flex: 1 }}>
                                        <ShimmerBlock width="80%" height="0.82rem" />
                                        <ShimmerBlock width="50%" height="0.7rem" style={{ marginTop: 6 }} />
                                    </div>
                                </div>
                            ))
                        ) : activity.length === 0 ? (
                            <p className="lab-empty">No recent activity</p>
                        ) : (
                            activity.slice(0, 5).map((item, i) => (
                                <ActivityItem key={item._id || i} item={assertLabCaseDTO(item, "ActivityFeed") || item} />
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* ─── Priority Case Monitoring ─── */}
            <div className="lab-priority-panel">
                <div className="lab-priority-header">
                    <div>
                        <h3 className="lab-section-title">Priority Case Monitoring</h3>
                        <p className="lab-section-sub">Cases nearing delivery deadline (next 5 days)</p>
                    </div>
                    <div className="lab-priority-actions">
                        <button className="lab-btn-outline" onClick={() => navigate("kanban")}>🔲 Kanban View</button>
                        <button className="lab-btn-outline" onClick={() => navigate("claims")}>💵 Claims</button>
                    </div>
                </div>
                <table className="lab-table">
                    <thead>
                        <tr>
                            <th>PATIENT / CASE ID</th>
                            <th>ASSIGNED LAB</th>
                            <th>APPLIANCE TYPE</th>
                            <th>STATUS</th>
                            <th>EXPECTED DELIVERY</th>
                            <th>COST</th>
                        </tr>
                    </thead>
                    <tbody>
                        {priorityLoading ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <tr key={i}>
                                    <td><ShimmerBlock /></td>
                                    <td><ShimmerBlock width="60%" /></td>
                                    <td><ShimmerBlock width="50%" /></td>
                                    <td><ShimmerBlock width="70px" /></td>
                                    <td><ShimmerBlock width="80%" /></td>
                                    <td><ShimmerBlock width="50px" /></td>
                                </tr>
                            ))
                        ) : priority.length === 0 ? (
                            <tr><td colSpan="6" className="lab-empty">
                                <div className="lab-empty-state">
                                    <span className="lab-empty-icon">✅</span>
                                    <p>No urgent cases — all deliveries on schedule</p>
                                </div>
                            </td></tr>
                        ) : (
                            priority.slice(0, 8).map(c => {
                                const caseDTO = assertLabCaseDTO(c, "PriorityTable");
                                return (
                                    <tr key={caseDTO._id} onClick={() => navigate(`cases/${caseDTO._id}`)} className="lab-table-row">
                                        <td>
                                            <strong>{caseDTO.patientDisplayName || caseDTO.patientName || "—"}</strong>
                                            <br/><span className="lab-case-id">ID: #{caseDTO.caseCode}</span>
                                        </td>
                                        <td>
                                            <span className="lab-lab-dot" style={{ background: "#3B82F6" }}>●</span>
                                            {caseDTO.labDisplayName || caseDTO.labName || "—"}
                                        </td>
                                        <td>{caseDTO.applianceType}</td>
                                        <td><StatusBadge status={caseDTO.status} /></td>
                                        <td>
                                            {caseDTO.expectedDelivery
                                                ? new Date(caseDTO.expectedDelivery).toLocaleDateString("en-US", {
                                                    month: "short", day: "numeric", year: "numeric"
                                                  })
                                                : "—"}
                                        </td>
                                        <td><strong>${(caseDTO.cost || 0).toLocaleString()}</strong></td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
