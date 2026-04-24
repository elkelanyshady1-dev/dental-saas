/**
 * ItemDetailDrawer.jsx — Inventory Item Detail (v2 · hardened)
 *
 * Right-side drawer with:
 *   - Header (name/SKU/close/edit)
 *   - Ribbon: current stock / min level / unit cost
 *   - Tabs: Overview | Movements
 *   - Bottom action bar
 *
 * Hardening:
 *   - Snapshot updatedAt at open → show stale-data banner if it changes externally
 *   - Show "Last updated" prominently in the ribbon
 *   - ESC closes drawer
 *   - Aria-labels on action buttons
 */

import { useEffect, useState } from "react";
import {
    XMarkIcon, PencilIcon,
    ArrowDownTrayIcon, ArrowUpTrayIcon, ArrowsRightLeftIcon,
    CubeIcon, ClockIcon, InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { useInventoryItem, useInventoryMovements } from "../hooks/useInventory";

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
    if (value == null) return "—";
    return `EGP ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
    });
}

function formatDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

function formatRelative(iso) {
    if (!iso) return "—";
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    if (diff < 60 * 1000)             return "just now";
    if (diff < 60 * 60 * 1000)        return `${Math.round(diff / 60000)} min ago`;
    if (diff < 24 * 60 * 60 * 1000)   return `${Math.round(diff / 3600000)} h ago`;
    return formatDateTime(iso);
}

function movementLabel(type, qty) {
    if (type === "IN")         return { badge: "in",  symbol: "+", text: "Received" };
    if (type === "OUT")        return { badge: "out", symbol: "−", text: "Used" };
    if (type === "ADJUSTMENT") return { badge: "adj", symbol: (qty ?? 0) >= 0 ? "+" : "", text: "Adjusted" };
    return { badge: "adj", symbol: "", text: type };
}

function Shimmer({ w = "60%", h = "1rem", radius = 6 }) {
    return <div className="inv-shimmer" style={{ width: w, height: h, borderRadius: radius }} />;
}

export default function ItemDetailDrawer({ itemId, onClose, onEdit, onStockOp, canUpdate }) {
    const [tab, setTab] = useState("overview");
    const itemQ = useInventoryItem(itemId);
    const movementsQ = useInventoryMovements(itemId, { limit: 25 });

    const item = itemQ.data?.data || itemQ.data || {};
    const movements = movementsQ.data?.data || [];

    // ── Concurrency snapshot: capture updatedAt the first time we see the item.
    // Uses the "adjust state during render" pattern (React docs) — not an effect.
    // If updatedAt changes later (external mutation), show a soft warning.
    const [openedAt, setOpenedAt] = useState(null);
    if (item?.updatedAt && openedAt === null) {
        setOpenedAt(item.updatedAt);                  // eslint-disable-line -- React 19: allowed during render
    }
    const stalenessDetected =
        openedAt != null &&
        item?.updatedAt != null &&
        item.updatedAt !== openedAt;

    // ── ESC to close
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const stockValue = (item.stockLevel ?? 0) * (item.unitCost ?? 0);
    const current    = item.stockLevel ?? 0;
    const min        = item.minStockLevel ?? 0;
    const isCritical = current <= 0;
    const isWarning  = !isCritical && current <= min;

    const dismissStaleWarning = () => {
        setOpenedAt(item.updatedAt);
    };

    return (
        <>
            <div className="inv-drawer-backdrop" onClick={onClose} />
            <div className="inv-drawer" role="dialog" aria-modal="true" aria-labelledby="inv-detail-title">

                {/* Header */}
                <div className="inv-drawer-header">
                    <div className="inv-drawer-title-block">
                        {itemQ.isLoading ? (
                            <>
                                <Shimmer w="220px" h="1.1rem" />
                                <div style={{ height: 6 }} />
                                <Shimmer w="140px" h="0.75rem" />
                            </>
                        ) : (
                            <>
                                <h2 id="inv-detail-title">{item.name || "Item detail"}</h2>
                                {item.sku && <small>SKU: {item.sku}</small>}
                            </>
                        )}
                    </div>
                    {canUpdate && item._id && (
                        <button
                            className="inv-drawer-close"
                            title="Edit item"
                            onClick={() => onEdit?.(item)}
                            aria-label="Edit item"
                        >
                            <PencilIcon className="w-4 h-4" />
                        </button>
                    )}
                    <button className="inv-drawer-close" onClick={onClose} aria-label="Close">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="inv-drawer-body">

                    {/* Stale-data warning (soft) */}
                    {stalenessDetected && (
                        <div
                            className="inv-banner warning"
                            role="status"
                            aria-live="polite"
                        >
                            <span className="inv-banner-icon"><InformationCircleIcon className="w-4 h-4" /></span>
                            <div style={{ flex: 1 }}>
                                <strong>Stock has changed since you opened this item.</strong>
                                {" "}Latest data is now shown.
                            </div>
                            <button
                                className="inv-btn ghost sm"
                                onClick={dismissStaleWarning}
                                aria-label="Dismiss stale-data warning"
                            >
                                Dismiss
                            </button>
                        </div>
                    )}

                    {/* Ribbon */}
                    <div className="inv-drawer-ribbon">
                        <div className="inv-ribbon-cell">
                            <div className="inv-ribbon-label">Current</div>
                            <div className="inv-ribbon-value" style={{ color: isCritical ? "#DC2626" : isWarning ? "#D97706" : "#111827" }}>
                                {current}<small>units</small>
                            </div>
                        </div>
                        <div className="inv-ribbon-cell">
                            <div className="inv-ribbon-label">Min level</div>
                            <div className="inv-ribbon-value">{min}<small>units</small></div>
                        </div>
                        <div className="inv-ribbon-cell">
                            <div className="inv-ribbon-label">Unit cost</div>
                            <div className="inv-ribbon-value" style={{ fontSize: "1.05rem" }}>{formatCurrency(item.unitCost)}</div>
                        </div>
                    </div>

                    {/* Stock value + last-updated chips */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span className="inv-stock-value-chip">
                            <CubeIcon className="w-4 h-4" />
                            Stock value: {formatCurrency(stockValue)}
                        </span>
                        {item.updatedAt && (
                            <span
                                className="inv-stock-value-chip"
                                style={{ background: "#F3F4F6", color: "#4B5563", borderColor: "#E5E7EB" }}
                                title={formatDateTime(item.updatedAt)}
                            >
                                <ClockIcon className="w-4 h-4" />
                                Last updated {formatRelative(item.updatedAt)}
                            </span>
                        )}
                    </div>

                    {/* Tabs */}
                    <div className="inv-drawer-tabs" role="tablist">
                        <button
                            role="tab"
                            aria-selected={tab === "overview"}
                            className={`inv-drawer-tab ${tab === "overview" ? "active" : ""}`}
                            onClick={() => setTab("overview")}
                        >
                            Overview
                        </button>
                        <button
                            role="tab"
                            aria-selected={tab === "movements"}
                            className={`inv-drawer-tab ${tab === "movements" ? "active" : ""}`}
                            onClick={() => setTab("movements")}
                        >
                            Movements ({movements.length})
                        </button>
                    </div>

                    {/* Overview */}
                    {tab === "overview" && (
                        <div>
                            {itemQ.isLoading ? (
                                <div className="inv-info-grid">
                                    {[1,2,3,4,5,6].map(i => (
                                        <div key={i} className="inv-info-row">
                                            <Shimmer w="40%" h="0.65rem" />
                                            <div style={{ height: 4 }} />
                                            <Shimmer w="70%" h="0.9rem" />
                                        </div>
                                    ))}
                                </div>
                            ) : itemQ.isError ? (
                                <div className="inv-empty">
                                    <span className="inv-empty-icon">⚠</span>
                                    <p className="inv-empty-title">Couldn't load item</p>
                                    <p className="inv-empty-sub">Something went wrong. Please try again.</p>
                                    <button className="inv-btn primary sm" onClick={() => itemQ.refetch()}>
                                        Retry
                                    </button>
                                </div>
                            ) : (
                                <div className="inv-info-grid">
                                    <div className="inv-info-row">
                                        <span className="inv-info-label">Category</span>
                                        <span className="inv-info-value">
                                            {CATEGORY_LABEL[item.category] || item.category || "—"}
                                        </span>
                                    </div>
                                    <div className="inv-info-row">
                                        <span className="inv-info-label">Unit</span>
                                        <span className="inv-info-value">{item.unit || "—"}</span>
                                    </div>
                                    <div className="inv-info-row">
                                        <span className="inv-info-label">Supplier</span>
                                        <span className="inv-info-value">{item.supplierId || "—"}</span>
                                    </div>
                                    <div className="inv-info-row">
                                        <span className="inv-info-label">Expiry</span>
                                        <span className="inv-info-value">{formatDate(item.expiryDate)}</span>
                                    </div>
                                    <div className="inv-info-row">
                                        <span className="inv-info-label">Optimal stock</span>
                                        <span className="inv-info-value">{item.optimalStock ?? "—"}</span>
                                    </div>
                                    <div className="inv-info-row">
                                        <span className="inv-info-label">Version</span>
                                        <span className="inv-info-value">v{item.version ?? 0}</span>
                                    </div>
                                    <div className="inv-info-row" style={{ gridColumn: "1 / -1" }}>
                                        <span className="inv-info-label">Added</span>
                                        <span className="inv-info-value">{formatDateTime(item.createdAt)}</span>
                                    </div>
                                    <div className="inv-info-row" style={{ gridColumn: "1 / -1" }}>
                                        <span className="inv-info-label">Last updated</span>
                                        <span className="inv-info-value">{formatDateTime(item.updatedAt)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Movements */}
                    {tab === "movements" && (
                        <div>
                            {movementsQ.isLoading ? (
                                <div className="inv-timeline">
                                    {[1,2,3,4].map(i => (
                                        <div key={i} className="inv-timeline-entry">
                                            <Shimmer w="32px" h="32px" radius={50} />
                                            <div style={{ flex: 1 }}>
                                                <Shimmer w="60%" h="0.85rem" />
                                                <div style={{ height: 4 }} />
                                                <Shimmer w="40%" h="0.7rem" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : movementsQ.isError ? (
                                <div className="inv-empty">
                                    <span className="inv-empty-icon">⚠</span>
                                    <p className="inv-empty-title">Couldn't load movements</p>
                                    <button className="inv-btn primary sm" onClick={() => movementsQ.refetch()}>
                                        Retry
                                    </button>
                                </div>
                            ) : movements.length === 0 ? (
                                <div className="inv-empty">
                                    <span className="inv-empty-icon">📜</span>
                                    <p className="inv-empty-title">No movements yet</p>
                                    <p className="inv-empty-sub">Stock changes will appear here.</p>
                                </div>
                            ) : (
                                <div className="inv-timeline">
                                    {movements.map(m => {
                                        const lbl = movementLabel(m.type, m.quantity);
                                        const signedQty = m.type === "OUT"
                                            ? `−${Math.abs(m.quantity)}`
                                            : m.type === "ADJUSTMENT"
                                                ? (m.quantity >= 0 ? `±${m.quantity}` : `${m.quantity}`)
                                                : `+${m.quantity}`;
                                        return (
                                            <div key={m._id} className="inv-timeline-entry">
                                                <div className={`inv-timeline-dot inv-activity-dot ${lbl.badge}`}>
                                                    {lbl.symbol || "~"}
                                                </div>
                                                <div className="inv-activity-body">
                                                    <p className="inv-activity-title">
                                                        {lbl.text}{" "}
                                                        <span className={`inv-activity-qty ${m.type === "OUT" ? "negative" : m.type === "ADJUSTMENT" ? "neutral" : "positive"}`}>
                                                            {signedQty}
                                                        </span>
                                                        {" units"}
                                                    </p>
                                                    <p className="inv-activity-sub">
                                                        {m.reference ? `${m.reference} · ` : ""}
                                                        {formatDateTime(m.createdAt)}
                                                        {m.cost != null && ` · ${formatCurrency(m.cost)} / unit`}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                </div>

                {/* Footer action bar */}
                {canUpdate && item._id && (
                    <div className="inv-drawer-footer">
                        <button
                            className="inv-btn outline sm"
                            onClick={() => onStockOp?.(item, "adjust")}
                            aria-label={`Adjust stock for ${item.name || "item"}`}
                            title="Adjust stock count"
                        >
                            <ArrowsRightLeftIcon className="w-4 h-4" /> Adjust
                        </button>
                        <button
                            className="inv-btn outline sm"
                            style={{ borderColor: "#FCA5A5", color: "#B91C1C" }}
                            onClick={() => onStockOp?.(item, "use")}
                            aria-label={`Record stock usage for ${item.name || "item"}`}
                            title="Record stock usage"
                        >
                            <ArrowUpTrayIcon className="w-4 h-4" /> Use stock
                        </button>
                        <button
                            className="inv-btn success sm"
                            onClick={() => onStockOp?.(item, "add")}
                            aria-label={`Add stock for ${item.name || "item"}`}
                            title="Add stock (restock)"
                        >
                            <ArrowDownTrayIcon className="w-4 h-4" /> Add stock
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}
