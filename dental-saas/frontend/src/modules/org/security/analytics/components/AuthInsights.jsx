/**
 * AuthInsights.jsx — Smart Security Insights Engine (UI)
 *
 * Generates intelligent, actionable insights from analytics data:
 * - Denial trend detection
 * - Slowest auth layer identification
 * - Abnormal user access patterns
 * - Role permission suggestions
 *
 * TASK-FE-AUTH-INT-006
 * MODULE: frontend/src/modules/org/security/analytics
 * PLANE: Org only.
 */
import React, { useMemo } from "react";
import {
    Lightbulb,
    TrendingUp,
    TrendingDown,
    Clock,
    UserX,
    Shield,
    Zap,
    ArrowRight,
} from "lucide-react";

// ─── Insight Types ───────────────────────────────────────────────────────────

const INSIGHT_SEVERITY = {
    critical: { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
    warning:  { color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
    positive: { color: "#059669", bg: "#ECFDF5", border: "#A7F3D0" },
    info:     { color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
};

// ─── Insight Generator ───────────────────────────────────────────────────────

function generateInsights({ summary, layerPerformance, riskUsers, fieldViolations, deniedPermissions }) {
    const insights = [];

    // 1. Denial trend analysis
    if (summary) {
        const denyTrend = summary.denyRateTrend ?? 0;
        if (denyTrend > 5) {
            insights.push({
                id: "deny-spike",
                severity: "critical",
                icon: TrendingUp,
                title: `Denials increased ${Math.abs(denyTrend).toFixed(1)}% in the last period`,
                description: `Current deny rate is ${summary.denyRate}%. Investigate recent permission changes or suspicious user activity.`,
                action: "View Denials",
                actionTarget: "denials",
            });
        } else if (denyTrend > 0) {
            insights.push({
                id: "deny-uptick",
                severity: "warning",
                icon: TrendingUp,
                title: `Deny rate up ${Math.abs(denyTrend).toFixed(1)}% — monitor closely`,
                description: `Slight increase in denials. Currently at ${summary.denyRate}%.`,
                action: null,
            });
        } else if (denyTrend < -2) {
            insights.push({
                id: "deny-down",
                severity: "positive",
                icon: TrendingDown,
                title: `Denials decreased ${Math.abs(denyTrend).toFixed(1)}% — improvement detected`,
                description: `Authorization health improving. Deny rate at ${summary.denyRate}%.`,
                action: null,
            });
        }

        // Overall health
        if (summary.allowRate >= 99) {
            insights.push({
                id: "health-excellent",
                severity: "positive",
                icon: Shield,
                title: `Authorization health: Excellent (${summary.allowRate}% allow rate)`,
                description: "All auth layers operating within optimal parameters.",
                action: null,
            });
        }
    }

    // 2. Slowest auth layer
    if (layerPerformance?.length > 0) {
        const sorted = [...layerPerformance].sort((a, b) => b.p99Ms - a.p99Ms);
        const slowest = sorted[0];
        if (slowest.p99Ms > 15) {
            insights.push({
                id: "slow-layer",
                severity: "warning",
                icon: Clock,
                title: `${slowest.layer} is the slowest auth layer (P99: ${slowest.p99Ms}ms)`,
                description: `Average: ${slowest.avgMs}ms. Consider optimizing policy queries or adding caching for this layer.`,
                action: "View Layer Performance",
                actionTarget: "layers",
            });
        }

        // Low pass rate detection
        const lowPass = sorted.find((l) => l.passRate < 95);
        if (lowPass) {
            insights.push({
                id: "low-pass",
                severity: "critical",
                icon: Shield,
                title: `${lowPass.layer} pass rate below threshold (${lowPass.passRate}%)`,
                description: `This layer is blocking more requests than expected. Review policies and role assignments.`,
                action: "Investigate",
                actionTarget: "layers",
            });
        }
    }

    // 3. Risk user detection
    if (riskUsers?.length > 0) {
        const highRisk = riskUsers.filter((u) => u.riskLevel === "high");
        if (highRisk.length > 0) {
            const topUser = highRisk[0];
            insights.push({
                id: "risk-users",
                severity: "critical",
                icon: UserX,
                title: `${highRisk.length} high-risk user${highRisk.length > 1 ? "s" : ""} detected`,
                description: `${topUser.user} has ${topUser.denialCount} denials. Review access patterns and consider role reassignment.`,
                action: "View Risk Users",
                actionTarget: "risk-users",
            });
        }
    }

    // 4. Field violation patterns
    if (fieldViolations?.length > 0) {
        const totalAttempts = fieldViolations.reduce((sum, f) => sum + f.attempts, 0);
        if (totalAttempts > 500) {
            insights.push({
                id: "field-violations",
                severity: "warning",
                icon: Shield,
                title: `${totalAttempts.toLocaleString()} field-level violation attempts recorded`,
                description: `Top targeted field: ${fieldViolations[0].field} (${fieldViolations[0].attempts} attempts). Ensure field-level guards are properly configured.`,
                action: "View Violations",
                actionTarget: "violations",
            });
        }
    }

    // 5. Permission concentration
    if (deniedPermissions?.length > 0) {
        const topPerm = deniedPermissions[0];
        if (topPerm.value > 3000) {
            insights.push({
                id: "perm-concentration",
                severity: "info",
                icon: Zap,
                title: `"${topPerm.name}" is the most denied permission (${topPerm.value.toLocaleString()})`,
                description: "Consider whether users attempting this action need a role update, or if the permission boundary is correct.",
                action: "Drill Down",
                actionTarget: "permissions",
            });
        }
    }

    return insights;
}

// ─── Insight Card Component ──────────────────────────────────────────────────

function InsightCard({ insight, onAction }) {
    const severity = INSIGHT_SEVERITY[insight.severity] || INSIGHT_SEVERITY.info;
    const Icon = insight.icon || Lightbulb;

    return (
        <div
            style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "14px 16px",
                borderRadius: 14,
                border: `1px solid ${severity.border}`,
                background: severity.bg,
                transition: "transform 0.15s, box-shadow 0.15s",
                cursor: insight.action ? "pointer" : "default",
            }}
            onClick={() => insight.action && onAction?.(insight.actionTarget)}
            onMouseEnter={(e) => {
                if (insight.action) {
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.06)";
                }
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
            }}
        >
            <div
                style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: `${severity.color}20`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: 1,
                }}
            >
                <Icon size={14} style={{ color: severity.color }} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <p
                    style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#0F172A",
                        margin: "0 0 4px",
                        lineHeight: 1.3,
                    }}
                >
                    {insight.title}
                </p>
                <p
                    style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: "#64748B",
                        margin: 0,
                        lineHeight: 1.5,
                    }}
                >
                    {insight.description}
                </p>
            </div>

            {insight.action && (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        color: severity.color,
                        flexShrink: 0,
                        marginTop: 2,
                    }}
                >
                    {insight.action}
                    <ArrowRight size={10} />
                </div>
            )}
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AuthInsights({
    summary,
    layerPerformance,
    riskUsers,
    fieldViolations,
    deniedPermissions,
    onNavigate,
}) {
    const insights = useMemo(
        () =>
            generateInsights({
                summary,
                layerPerformance,
                riskUsers,
                fieldViolations,
                deniedPermissions,
            }),
        [summary, layerPerformance, riskUsers, fieldViolations, deniedPermissions]
    );

    if (insights.length === 0) return null;

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
                            background: "linear-gradient(135deg, #F59E0B20, #D9770620)",
                            color: "#D97706",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <Lightbulb size={18} />
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
                            Smart Insights
                        </h3>
                        <p
                            style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: "#94A3B8",
                                margin: "2px 0 0",
                            }}
                        >
                            AI-generated security intelligence
                        </p>
                    </div>
                </div>

                <span
                    style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: "5px 12px",
                        borderRadius: 8,
                        background: "#F1F5F9",
                        color: "#64748B",
                    }}
                >
                    {insights.length} insight{insights.length !== 1 ? "s" : ""}
                </span>
            </div>

            {/* Insights list */}
            <div
                style={{
                    padding: "16px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                }}
            >
                {insights.map((insight) => (
                    <InsightCard
                        key={insight.id}
                        insight={insight}
                        onAction={onNavigate}
                    />
                ))}
            </div>
        </div>
    );
}
