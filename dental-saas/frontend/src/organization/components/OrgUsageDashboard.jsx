import React from "react";
import { useQuery } from "@tanstack/react-query";
import orgApi from "../../../../api/orgApi";

/**
 * OrgUsageDashboard — Phase 4.0h
 * 
 * Displays real-time usage counters + plan limits for:
 *   - Users (seats)
 *   - Patients
 *   - Branches
 *   - Storage (MB)
 *
 * Fetches from GET /api/v1/org/usage
 * Renders progress bars with color-coded warnings.
 */

function UsageBar({ label, used, limit, unit = "" }) {
    const isUnlimited = limit === null || limit === undefined;
    const percentage = isUnlimited ? 0 : Math.min((used / limit) * 100, 100);

    const getColor = () => {
        if (isUnlimited) return "#3b82f6";
        if (percentage >= 90) return "#ef4444";
        if (percentage >= 75) return "#f59e0b";
        return "#22c55e";
    };

    const getStatusLabel = () => {
        if (isUnlimited) return "Unlimited";
        if (percentage >= 100) return "Limit Reached";
        if (percentage >= 90) return "Almost Full";
        if (percentage >= 75) return "Getting Full";
        return "Available";
    };

    return (
        <div style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
        }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#334155" }}>
                    {label}
                </div>
                <span style={{
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    padding: "2px 8px",
                    borderRadius: "6px",
                    background: isUnlimited ? "rgba(59,130,246,0.1)" : percentage >= 90 ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
                    color: getColor(),
                }}>
                    {getStatusLabel()}
                </span>
            </div>

            <div style={{
                fontSize: "1.5rem",
                fontWeight: 800,
                color: "#0f172a",
                display: "flex",
                alignItems: "baseline",
                gap: "0.25rem",
            }}>
                {used}{unit && <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8" }}>{unit}</span>}
                <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "#94a3b8" }}>
                    / {isUnlimited ? "∞" : `${limit}${unit}`}
                </span>
            </div>

            <div style={{
                width: "100%",
                height: "8px",
                background: "#f1f5f9",
                borderRadius: "4px",
                overflow: "hidden",
            }}>
                <div style={{
                    width: isUnlimited ? "15%" : `${percentage}%`,
                    height: "100%",
                    background: getColor(),
                    borderRadius: "4px",
                    transition: "width 0.5s ease",
                }} />
            </div>

            {!isUnlimited && (
                <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                    {Math.max(0, limit - used)} remaining
                </div>
            )}
        </div>
    );
}

export default function OrgUsageDashboard() {
    const { data, isLoading, error } = useQuery({
        queryKey: ["orgUsage"],
        queryFn: () => orgApi.get("/usage").then(r => r.data),
        refetchInterval: 60000, // Refresh every 60s
    });

    if (isLoading) {
        return (
            <div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>
                Loading usage data...
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ padding: "2rem", textAlign: "center", color: "#ef4444" }}>
                Failed to load usage data
            </div>
        );
    }

    const usage = data?.data;
    if (!usage) return null;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "0.5rem",
            }}>
                <span style={{ fontSize: "1.1rem" }}>📊</span>
                <h3 style={{ fontSize: "1rem", fontWeight: 800, margin: 0, color: "#0f172a" }}>
                    Resource Usage
                </h3>
            </div>

            <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
            }}>
                <UsageBar
                    label="Users"
                    used={usage.users?.used || 0}
                    limit={usage.users?.limit}
                />
                <UsageBar
                    label="Patients"
                    used={usage.patients?.used || 0}
                    limit={usage.patients?.limit}
                />
                <UsageBar
                    label="Branches"
                    used={usage.branches?.used || 0}
                    limit={usage.branches?.limit}
                />
                <UsageBar
                    label="Storage"
                    used={usage.storage?.usedMB || 0}
                    limit={usage.storage?.limitMB}
                    unit=" MB"
                />
            </div>
        </div>
    );
}
