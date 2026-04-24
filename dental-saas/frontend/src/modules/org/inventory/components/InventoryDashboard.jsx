/**
 * InventoryDashboard.jsx — Inventory Dashboard Tab (v1)
 *
 * Renders:
 *   - 4 KPI cards from projection (total items, total value, low stock, pending POs)
 *   - Low-stock alerts preview (top 6 critical/warning)
 *   - Category breakdown bar chart (derived from items)
 *   - Recently updated items list
 *
 * Data: uses projection hooks (pre-computed server-side) + items list for breakdown.
 * No cross-item movements feed yet (requires backend aggregation endpoint).
 */

import { memo, useMemo } from "react";
import {
    CubeIcon,
    BanknotesIcon,
    ExclamationTriangleIcon,
    ClipboardDocumentListIcon,
    ArrowRightIcon,
} from "@heroicons/react/24/outline";
import {
    useInventoryDashboard,
    useInventoryAlerts,
    useInventoryList,
} from "../hooks/useInventory";

const CATEGORY_LABEL = {
    restorative:  "Restorative",
    orthodontic:  "Orthodontic",
    consumables:  "Consumables",
    instruments:  "Instruments",
    anesthetics:  "Anesthetics",
    endo:         "Endo",
    preventive:   "Preventive",
};

function formatCurrency(value) {
    if (value == null || isNaN(value)) return "—";
    return `EGP ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function Shimmer({ w = "60%", h = "1.2rem", radius = 6 }) {
    return <div className="inv-shimmer" style={{ width: w, height: h, borderRadius: radius }} />;
}

function KpiCard({ label, value, icon, iconTone, trend, meta, loading }) {
    const IconComp = icon;
    return (
        <div className="inv-kpi-card">
            <div className="inv-kpi-top">
                <div className={`inv-kpi-icon-wrap inv-kpi-icon-${iconTone}`}>
                    <IconComp className="w-5 h-5" />
                </div>
                {trend && (
                    <span className={`inv-kpi-trend ${trend.direction}`}>
                        {trend.direction === "up" && "+"}
                        {trend.label}
                    </span>
                )}
            </div>
            <p className="inv-kpi-label">{label}</p>
            {loading
                ? <Shimmer w="45%" h="1.8rem" />
                : <p className="inv-kpi-value">{value}</p>
            }
            {meta && <p className="inv-kpi-meta">{meta}</p>}
        </div>
    );
}

function severityStyle(sev) {
    if (sev === "critical") return "critical";
    return "warning";
}

const AlertPreviewRow = memo(function AlertPreviewRow({ alert, onOpen }) {
    const current  = alert.currentStock ?? 0;
    const min      = alert.minStock ?? 0;
    const pct      = min > 0 ? Math.min(100, (current / min) * 100) : 0;
    const sev      = severityStyle(alert.severity);
    return (
        <div
            className="inv-activity-item"
            role="button"
            tabIndex={0}
            onClick={() => onOpen?.(alert.itemId)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen?.(alert.itemId)}
        >
            <div className={`inv-activity-dot ${sev === "critical" ? "out" : "adj"}`}>
                {sev === "critical" ? "!" : "⚠"}
            </div>
            <div className="inv-activity-body">
                <p className="inv-activity-title">{alert.itemName || "Unknown item"}</p>
                <p className="inv-activity-sub">
                    {current} / min {min} units
                </p>
            </div>
            <div style={{ width: 100, flexShrink: 0 }}>
                <div className="inv-stock-bar-track">
                    <div
                        className={`inv-stock-bar-fill ${sev === "critical" ? "critical" : "warning"}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>
        </div>
    );
});

const RecentItemRow = memo(function RecentItemRow({ item, onOpen }) {
    const current = item.stockLevel ?? 0;
    const min     = item.minStockLevel ?? 0;
    const status  = current === 0 ? "critical" : current <= min ? "warning" : "healthy";
    const pct     = min > 0 ? Math.min(100, (current / Math.max(min * 2, 1)) * 100) : 50;
    return (
        <div
            className="inv-activity-item"
            role="button"
            tabIndex={0}
            onClick={() => onOpen?.(item)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen?.(item)}
        >
            <div className={`inv-activity-dot ${status === "critical" ? "out" : status === "warning" ? "adj" : "in"}`}>
                <CubeIcon className="w-4 h-4" />
            </div>
            <div className="inv-activity-body">
                <p className="inv-activity-title">{item.name}</p>
                <p className="inv-activity-sub">
                    {CATEGORY_LABEL[item.category] || item.category || "Uncategorized"} · {current} in stock
                </p>
            </div>
            <div style={{ width: 100, flexShrink: 0 }}>
                <div className="inv-stock-bar-track">
                    <div className={`inv-stock-bar-fill ${status}`} style={{ width: `${pct}%` }} />
                </div>
            </div>
        </div>
    );
});

export default function InventoryDashboard({ onOpenItem, onOpenCreatePO, onGoAlerts, onGoItems }) {
    const dashQ   = useInventoryDashboard();
    const alertsQ = useInventoryAlerts();
    const itemsQ  = useInventoryList({ page: 1, limit: 50 });

    const projection = dashQ.data?.data || dashQ.data || {};
    const alerts     = alertsQ.data?.data || alertsQ.data || [];
    const items      = itemsQ.data?.data || [];

    const loading = dashQ.isLoading;
    const hasError = dashQ.isError || alertsQ.isError || itemsQ.isError;

    const handleRetry = () => {
        if (dashQ.isError)   dashQ.refetch();
        if (alertsQ.isError) alertsQ.refetch();
        if (itemsQ.isError)  itemsQ.refetch();
    };

    // Category breakdown (derived) — count items per category + sum stock value per category
    const categoryStats = useMemo(() => {
        if (!Array.isArray(items) || items.length === 0) return [];
        const buckets = new Map();
        for (const it of items) {
            const key = it.category || "uncategorized";
            const value = (it.stockLevel ?? 0) * (it.unitCost ?? 0);
            const bucket = buckets.get(key) || { key, label: CATEGORY_LABEL[key] || key, count: 0, value: 0 };
            bucket.count += 1;
            bucket.value += value;
            buckets.set(key, bucket);
        }
        return Array.from(buckets.values()).sort((a, b) => b.value - a.value).slice(0, 8);
    }, [items]);

    const maxCatValue = Math.max(1, ...categoryStats.map(c => c.value));

    // Recent items (sorted by updatedAt/createdAt descending)
    const recentItems = useMemo(() => {
        if (!Array.isArray(items)) return [];
        return [...items]
            .sort((a, b) => {
                const tA = new Date(a.updatedAt || a.createdAt || 0).getTime();
                const tB = new Date(b.updatedAt || b.createdAt || 0).getTime();
                return tB - tA;
            })
            .slice(0, 6);
    }, [items]);

    const alertsPreview = (alerts || []).slice(0, 6);
    const criticalCount = alertsPreview.filter(a => a.severity === "critical").length;
    const warningCount  = alertsPreview.filter(a => a.severity === "warning").length;

    return (
        <div>
            {hasError && (
                <div className="inv-banner warning" role="alert" style={{ marginBottom: 14 }}>
                    <span className="inv-banner-icon">⚠</span>
                    <div style={{ flex: 1 }}>
                        Couldn't load some dashboard data. Showing what's available.
                    </div>
                    <button className="inv-btn outline sm" onClick={handleRetry}>
                        Retry
                    </button>
                </div>
            )}

            {/* ── KPI Row ── */}
            <div className="inv-kpi-row">
                <KpiCard
                    label="Total Items"
                    value={(projection.totalItems ?? 0).toLocaleString()}
                    icon={CubeIcon}
                    iconTone="indigo"
                    meta="Active inventory"
                    loading={loading}
                />
                <KpiCard
                    label="Stock Value"
                    value={formatCurrency(projection.totalValue)}
                    icon={BanknotesIcon}
                    iconTone="emerald"
                    meta={projection.lastUpdatedAt ? `Updated ${new Date(projection.lastUpdatedAt).toLocaleDateString()}` : "Live"}
                    loading={loading}
                />
                <KpiCard
                    label="Low Stock"
                    value={(projection.lowStockCount ?? 0).toString()}
                    icon={ExclamationTriangleIcon}
                    iconTone="amber"
                    trend={projection.lowStockCount > 0
                        ? { direction: "down", label: `${projection.lowStockCount} alerts` }
                        : null}
                    meta="Items ≤ min level"
                    loading={loading}
                />
                <KpiCard
                    label="Pending POs"
                    value={(projection.pendingOrders ?? 0).toString()}
                    icon={ClipboardDocumentListIcon}
                    iconTone="sky"
                    meta="Awaiting delivery"
                    loading={loading}
                />
            </div>

            {/* ── Mid row: Alerts Preview + Category Breakdown ── */}
            <div className="inv-two-col-60-40">

                {/* Category Breakdown */}
                <div className="inv-panel">
                    <div className="inv-panel-header">
                        <div>
                            <h3 className="inv-panel-title">Stock Value by Category</h3>
                            <p className="inv-panel-sub">Distribution across item categories</p>
                        </div>
                        <button className="inv-btn ghost sm" onClick={onGoItems}>
                            View all <ArrowRightIcon className="w-3 h-3" />
                        </button>
                    </div>
                    {itemsQ.isLoading ? (
                        <div style={{ padding: "10px 0" }}>
                            {[1,2,3,4,5].map(i => (
                                <div key={i} style={{ marginBottom: 14 }}>
                                    <Shimmer w="100%" h="0.9rem" />
                                    <div style={{ height: 6 }} />
                                    <Shimmer w={`${100 - i * 15}%`} h="0.65rem" />
                                </div>
                            ))}
                        </div>
                    ) : categoryStats.length === 0 ? (
                        <div className="inv-empty">
                            <span className="inv-empty-icon">📦</span>
                            <p className="inv-empty-title">No items yet</p>
                            <p className="inv-empty-sub">Add inventory items to see the category breakdown.</p>
                        </div>
                    ) : (
                        <div className="inv-hbar-list">
                            {categoryStats.map(c => {
                                const pct = Math.max(4, (c.value / maxCatValue) * 100);
                                return (
                                    <div key={c.key} className="inv-hbar-item">
                                        <span className="inv-hbar-name" title={c.label}>
                                            {c.label}
                                            <small style={{ color: "#9CA3AF", marginLeft: 6 }}>({c.count})</small>
                                        </span>
                                        <div className="inv-hbar-track">
                                            <div className="inv-hbar-fill" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="inv-hbar-value">{formatCurrency(c.value)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Low-Stock Alerts Preview */}
                <div className="inv-panel">
                    <div className="inv-panel-header">
                        <div>
                            <h3 className="inv-panel-title">Low Stock Alerts</h3>
                            <p className="inv-panel-sub">
                                {criticalCount > 0 && <span style={{ color: "#DC2626", fontWeight: 600 }}>{criticalCount} critical</span>}
                                {criticalCount > 0 && warningCount > 0 && " · "}
                                {warningCount > 0 && <span style={{ color: "#D97706", fontWeight: 600 }}>{warningCount} warning</span>}
                                {criticalCount === 0 && warningCount === 0 && "All stocks above minimum"}
                            </p>
                        </div>
                        <button className="inv-btn ghost sm" onClick={onGoAlerts}>
                            View all <ArrowRightIcon className="w-3 h-3" />
                        </button>
                    </div>

                    {alertsQ.isLoading ? (
                        <div className="inv-activity-list">
                            {[1,2,3,4].map(i => (
                                <div key={i} className="inv-activity-item">
                                    <Shimmer w="32px" h="32px" radius={50} />
                                    <div style={{ flex: 1 }}>
                                        <Shimmer w="70%" h="0.85rem" />
                                        <div style={{ height: 4 }} />
                                        <Shimmer w="40%" h="0.7rem" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : alertsPreview.length === 0 ? (
                        <div className="inv-empty">
                            <span className="inv-empty-icon">✅</span>
                            <p className="inv-empty-title">All clear</p>
                            <p className="inv-empty-sub">No items below minimum stock level.</p>
                        </div>
                    ) : (
                        <div className="inv-activity-list">
                            {alertsPreview.map(a => (
                                <AlertPreviewRow
                                    key={a.itemId || a._id}
                                    alert={a}
                                    onOpen={(id) => onOpenItem?.(id)}
                                />
                            ))}
                        </div>
                    )}
                </div>

            </div>

            {/* ── Recent Items ── */}
            <div className="inv-panel">
                <div className="inv-panel-header">
                    <div>
                        <h3 className="inv-panel-title">Recently Updated Items</h3>
                        <p className="inv-panel-sub">Latest stock movements and additions</p>
                    </div>
                    <button className="inv-btn outline sm" onClick={onOpenCreatePO}>
                        <ClipboardDocumentListIcon className="w-4 h-4" /> New PO
                    </button>
                </div>

                {itemsQ.isLoading ? (
                    <div className="inv-activity-list">
                        {[1,2,3,4,5].map(i => (
                            <div key={i} className="inv-activity-item">
                                <Shimmer w="32px" h="32px" radius={50} />
                                <div style={{ flex: 1 }}>
                                    <Shimmer w="60%" h="0.85rem" />
                                    <div style={{ height: 4 }} />
                                    <Shimmer w="30%" h="0.7rem" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : recentItems.length === 0 ? (
                    <div className="inv-empty">
                        <span className="inv-empty-icon">📋</span>
                        <p className="inv-empty-title">No items yet</p>
                        <p className="inv-empty-sub">Add your first inventory item to get started.</p>
                    </div>
                ) : (
                    <div className="inv-activity-list">
                        {recentItems.map(it => (
                            <RecentItemRow key={it._id} item={it} onOpen={onOpenItem} />
                        ))}
                    </div>
                )}
            </div>

        </div>
    );
}
