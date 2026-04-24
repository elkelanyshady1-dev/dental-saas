/**
 * AlertsPanel.jsx — Low-Stock Alerts (v1)
 *
 * Shows one card per active (unresolved) low-stock alert. Filters by severity.
 * Actions per card: View item · Add stock · Create PO.
 * Suggested reorder qty = minStock × 2 - currentStock (simple heuristic until backend provides it).
 */

import { memo, useMemo, useState } from "react";
import {
    ArrowDownTrayIcon, ClipboardDocumentListIcon, EyeIcon,
    ExclamationTriangleIcon, ExclamationCircleIcon, CalculatorIcon,
} from "@heroicons/react/24/outline";
import { useInventoryAlerts, useInventoryList } from "../hooks/useInventory";

const SEVERITY_FILTERS = [
    { key: "all",      label: "All",      match: null },
    { key: "critical", label: "Critical", match: "critical" },
    { key: "warning",  label: "Warning",  match: "warning" },
];

function formatCurrency(value) {
    if (value == null || isNaN(value)) return "EGP 0.00";
    return `EGP ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Shimmer({ w = "60%", h = "1rem", radius = 6 }) {
    return <div className="inv-shimmer" style={{ width: w, height: h, borderRadius: radius }} />;
}

const AlertCard = memo(function AlertCard({ alert, item, onView, onAddStock, onCreatePO }) {
    const current = alert.currentStock ?? item?.stockLevel ?? 0;
    const min = alert.minStock ?? item?.minStockLevel ?? 0;
    const severity = alert.severity === "critical" ? "critical" : "warning";
    const pct = min > 0 ? Math.min(100, (current / min) * 100) : 0;

    // Heuristic: suggest enough to reach 2× min (i.e. optimal buffer)
    const targetLevel = item?.optimalStock ?? min * 2;
    const suggestedQty = Math.max(targetLevel - current, min);
    const unitCost = item?.unitCost ?? 0;
    const estCost = suggestedQty * unitCost;

    return (
        <div className={`inv-alert-card ${severity}`}>
            <div className="inv-alert-top">
                <div style={{ minWidth: 0, flex: 1 }}>
                    <h3 className="inv-alert-name">{alert.itemName || "Unknown item"}</h3>
                    {item?.sku && <p className="inv-alert-sku">SKU: {item.sku}</p>}
                </div>
                {severity === "critical" ? (
                    <ExclamationCircleIcon className="w-5 h-5" style={{ color: "#DC2626", flexShrink: 0 }} />
                ) : (
                    <ExclamationTriangleIcon className="w-5 h-5" style={{ color: "#D97706", flexShrink: 0 }} />
                )}
            </div>

            {/* Stock bar */}
            <div>
                <div className="inv-stock-numbers" style={{ marginBottom: 4 }}>
                    <span className="inv-stock-current" style={{ color: severity === "critical" ? "#DC2626" : "#D97706" }}>
                        {current}
                    </span>
                    <span className="inv-stock-min">/ min {min}</span>
                </div>
                <div className="inv-stock-bar-track">
                    <div
                        className={`inv-stock-bar-fill ${severity === "critical" ? "critical" : "warning"}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>

            {/* Reorder suggestion */}
            <div style={{
                background: "#F9FAFB",
                borderRadius: 8,
                padding: "10px 12px",
                display: "flex", flexDirection: "column", gap: 2,
            }}>
                <div style={{ fontSize: "0.72rem", color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Suggested reorder
                </div>
                <div className="inv-alert-reorder">
                    {suggestedQty}<small>units</small>
                </div>
                {unitCost > 0 && (
                    <div style={{ fontSize: "0.78rem", color: "#6B7280" }}>
                        Estimated cost: <strong style={{ color: "#111827" }}>{formatCurrency(estCost)}</strong>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="inv-alert-actions">
                <button className="inv-btn outline xs" onClick={() => onView?.(alert.itemId)}>
                    <EyeIcon className="w-3.5 h-3.5" /> View
                </button>
                <button className="inv-btn outline xs" onClick={() => onAddStock?.(item || { _id: alert.itemId, name: alert.itemName, stockLevel: current, minStockLevel: min, unitCost })}>
                    <ArrowDownTrayIcon className="w-3.5 h-3.5" /> Add
                </button>
                <button className="inv-btn outline xs" onClick={() => onCreatePO?.()}>
                    <ClipboardDocumentListIcon className="w-3.5 h-3.5" /> PO
                </button>
            </div>
        </div>
    );
});

export default function AlertsPanel({ onOpenItem, onAddStock, onCreatePO }) {
    const alertsQ = useInventoryAlerts();
    const itemsQ  = useInventoryList({ page: 1, limit: 200 });

    const alerts = alertsQ.data?.data || [];
    const itemLookup = useMemo(() => {
        const map = new Map();
        (itemsQ.data?.data || []).forEach(it => map.set(String(it._id), it));
        return map;
    }, [itemsQ.data]);

    const [severity, setSeverity] = useState("all");

    const filtered = useMemo(() => {
        const match = SEVERITY_FILTERS.find(s => s.key === severity)?.match;
        return match ? alerts.filter(a => a.severity === match) : alerts;
    }, [alerts, severity]);

    const counts = useMemo(() => {
        let critical = 0, warning = 0;
        for (const a of alerts) {
            if (a.severity === "critical") critical++;
            else warning++;
        }
        return { critical, warning, total: alerts.length };
    }, [alerts]);

    // Estimated reorder cost across filtered alerts (heuristic)
    const totalReorderCost = useMemo(() => {
        return filtered.reduce((sum, a) => {
            const item = itemLookup.get(String(a.itemId));
            const current = a.currentStock ?? item?.stockLevel ?? 0;
            const min = a.minStock ?? item?.minStockLevel ?? 0;
            const qty = Math.max(min * 2 - current, min);
            const unitCost = item?.unitCost ?? 0;
            return sum + qty * unitCost;
        }, 0);
    }, [filtered, itemLookup]);

    return (
        <div>
            {/* ── Summary strip ── */}
            <div className="inv-kpi-row" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                <div className="inv-kpi-card">
                    <div className="inv-kpi-top">
                        <div className="inv-kpi-icon-wrap inv-kpi-icon-rose">
                            <ExclamationCircleIcon className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="inv-kpi-label">Critical (out of stock)</p>
                    {alertsQ.isLoading
                        ? <Shimmer w="50px" h="1.8rem" />
                        : <p className="inv-kpi-value" style={{ color: "#DC2626" }}>{counts.critical}</p>
                    }
                    <p className="inv-kpi-meta">Immediate reorder required</p>
                </div>

                <div className="inv-kpi-card">
                    <div className="inv-kpi-top">
                        <div className="inv-kpi-icon-wrap inv-kpi-icon-amber">
                            <ExclamationTriangleIcon className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="inv-kpi-label">Warning (low stock)</p>
                    {alertsQ.isLoading
                        ? <Shimmer w="50px" h="1.8rem" />
                        : <p className="inv-kpi-value" style={{ color: "#D97706" }}>{counts.warning}</p>
                    }
                    <p className="inv-kpi-meta">Below minimum threshold</p>
                </div>

                <div className="inv-kpi-card">
                    <div className="inv-kpi-top">
                        <div className="inv-kpi-icon-wrap inv-kpi-icon-indigo">
                            <CalculatorIcon className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="inv-kpi-label">Estimated reorder cost</p>
                    {alertsQ.isLoading || itemsQ.isLoading
                        ? <Shimmer w="60%" h="1.8rem" />
                        : <p className="inv-kpi-value">{formatCurrency(totalReorderCost)}</p>
                    }
                    <p className="inv-kpi-meta">Based on suggested quantities</p>
                </div>
            </div>

            {/* ── Filter chips ── */}
            <div className="inv-toolbar">
                <div className="inv-filter-chips" role="tablist" aria-label="Severity filter">
                    {SEVERITY_FILTERS.map(s => (
                        <button
                            key={s.key}
                            role="tab"
                            aria-selected={severity === s.key}
                            className={`inv-filter-chip ${severity === s.key ? "active" : ""}`}
                            onClick={() => setSeverity(s.key)}
                        >
                            {s.label}
                            {s.key === "critical" && counts.critical > 0 && <span className="inv-filter-chip-count">{counts.critical}</span>}
                            {s.key === "warning" && counts.warning > 0 && <span className="inv-filter-chip-count">{counts.warning}</span>}
                        </button>
                    ))}
                </div>
                <div style={{ flex: 1 }} />
                {counts.total > 0 && (
                    <button className="inv-btn primary sm" onClick={onCreatePO}>
                        <ClipboardDocumentListIcon className="w-4 h-4" /> Create PO from alerts
                    </button>
                )}
            </div>

            {/* ── Cards grid ── */}
            {alertsQ.isLoading ? (
                <div className="inv-alerts-grid">
                    {[1,2,3,4,5,6].map(i => (
                        <div key={i} className="inv-alert-card">
                            <Shimmer w="70%" h="1rem" />
                            <Shimmer w="40%" h="0.7rem" />
                            <Shimmer w="100%" h="1.3rem" />
                            <Shimmer w="100%" h="3rem" radius={8} />
                            <Shimmer w="100%" h="1.8rem" radius={8} />
                        </div>
                    ))}
                </div>
            ) : alertsQ.isError ? (
                <div className="inv-panel">
                    <div className="inv-empty">
                        <span className="inv-empty-icon">⚠</span>
                        <p className="inv-empty-title">Couldn't load alerts</p>
                        <p className="inv-empty-sub">Something went wrong while fetching low-stock alerts.</p>
                        <button className="inv-btn primary sm" onClick={() => alertsQ.refetch()}>
                            Retry
                        </button>
                    </div>
                </div>
            ) : filtered.length === 0 ? (
                <div className="inv-panel">
                    <div className="inv-empty">
                        <span className="inv-empty-icon">✅</span>
                        <p className="inv-empty-title">All stocks healthy</p>
                        <p className="inv-empty-sub">
                            {severity !== "all"
                                ? `No ${severity} alerts — try another severity filter.`
                                : "No items are below minimum stock level. Keep up the good work!"}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="inv-alerts-grid">
                    {filtered.map(alert => (
                        <AlertCard
                            key={alert._id || alert.itemId}
                            alert={alert}
                            item={itemLookup.get(String(alert.itemId))}
                            onView={onOpenItem}
                            onAddStock={onAddStock}
                            onCreatePO={onCreatePO}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
