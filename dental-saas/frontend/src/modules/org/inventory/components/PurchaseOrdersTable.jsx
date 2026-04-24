/**
 * PurchaseOrdersTable.jsx — Purchase Orders Tab (v1)
 *
 * Status tabs: All | Draft | Ordered | Received
 * Row click opens PODetailDrawer.
 */

import { useMemo, useState } from "react";
import { PlusIcon, ClipboardDocumentListIcon } from "@heroicons/react/24/outline";
import { usePurchaseOrders } from "../hooks/useInventory";

const STATUS_FILTERS = [
    { key: "all",      label: "All",      query: null },
    { key: "draft",    label: "Draft",    query: "draft" },
    { key: "ordered",  label: "Ordered",  query: "ordered" },
    { key: "received", label: "Received", query: "received" },
];

function formatCurrency(value) {
    if (value == null) return "—";
    return `EGP ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Shimmer({ w = "60%", h = "1rem", radius = 6 }) {
    return <div className="inv-shimmer" style={{ width: w, height: h, borderRadius: radius }} />;
}

function shortPOId(po) {
    if (!po?._id) return "—";
    const id = String(po._id);
    return `PO-${id.slice(-8).toUpperCase()}`;
}

export default function PurchaseOrdersTable({ onCreate, onView, canCreate }) {
    const [statusFilter, setStatusFilter] = useState("all");
    const [page, setPage] = useState(1);

    const handleStatusChange = (key) => {
        setStatusFilter(key);
        setPage(1);
    };

    const queryParams = useMemo(() => {
        const p = { page, limit: 20 };
        const active = STATUS_FILTERS.find(s => s.key === statusFilter);
        if (active?.query) p.status = active.query;
        return p;
    }, [statusFilter, page]);

    const ordersQ = usePurchaseOrders(queryParams);
    const orders     = ordersQ.data?.data || [];
    const pagination = ordersQ.data?.pagination || { total: 0, limit: 20 };

    const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || 20)));

    return (
        <div>
            {/* ── Status tabs + actions ── */}
            <div className="inv-toolbar">
                <div className="inv-filter-chips" role="tablist" aria-label="Status filter">
                    {STATUS_FILTERS.map(s => (
                        <button
                            key={s.key}
                            role="tab"
                            aria-selected={statusFilter === s.key}
                            className={`inv-filter-chip ${statusFilter === s.key ? "active" : ""}`}
                            onClick={() => handleStatusChange(s.key)}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>

                <div style={{ flex: 1 }} />
                <span style={{ fontSize: "0.8rem", color: "#6B7280" }}>
                    {pagination.total ?? 0} orders
                </span>
                {canCreate && (
                    <button className="inv-btn primary sm" onClick={onCreate}>
                        <PlusIcon className="w-4 h-4" /> New PO
                    </button>
                )}
            </div>

            {/* ── Table ── */}
            <div className="inv-table-wrap">
                <table className="inv-table">
                    <thead>
                        <tr>
                            <th>PO #</th>
                            <th>Supplier</th>
                            <th>Items</th>
                            <th>Total</th>
                            <th>Status</th>
                            <th>Created</th>
                            <th>Received</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ordersQ.isLoading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <tr key={`s-${i}`}>
                                    <td><Shimmer w="90px" /></td>
                                    <td><Shimmer w="70%" /></td>
                                    <td><Shimmer w="30%" /></td>
                                    <td><Shimmer w="60%" /></td>
                                    <td><Shimmer w="70px" radius={10} /></td>
                                    <td><Shimmer w="60%" /></td>
                                    <td><Shimmer w="60%" /></td>
                                </tr>
                            ))
                        ) : ordersQ.isError ? (
                            <tr>
                                <td colSpan={7}>
                                    <div className="inv-empty">
                                        <span className="inv-empty-icon">⚠</span>
                                        <p className="inv-empty-title">Couldn't load purchase orders</p>
                                        <p className="inv-empty-sub">Something went wrong. Try again in a moment.</p>
                                        <button className="inv-btn primary sm" onClick={() => ordersQ.refetch()}>
                                            Retry
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ) : orders.length === 0 ? (
                            <tr>
                                <td colSpan={7}>
                                    <div className="inv-empty">
                                        <ClipboardDocumentListIcon className="w-8 h-8" style={{ color: "#D1D5DB" }} />
                                        <p className="inv-empty-title">No purchase orders</p>
                                        <p className="inv-empty-sub">
                                            {statusFilter !== "all"
                                                ? `No purchase orders in "${statusFilter}" status.`
                                                : "Create a purchase order to start tracking supplier deliveries."}
                                        </p>
                                        {canCreate && statusFilter === "all" && (
                                            <button className="inv-btn primary sm" onClick={onCreate}>
                                                <PlusIcon className="w-4 h-4" /> New Purchase Order
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            orders.map(po => {
                                const lineCount = po.items?.length ?? 0;
                                return (
                                    <tr
                                        key={po._id}
                                        className="inv-table-row"
                                        onClick={() => onView?.(po)}
                                    >
                                        <td>
                                            <code style={{
                                                fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
                                                fontSize: "0.82rem",
                                                fontWeight: 600,
                                                color: "#2563EB",
                                            }}>
                                                {shortPOId(po)}
                                            </code>
                                        </td>
                                        <td>
                                            <span style={{ fontWeight: 500, color: "#111827" }}>
                                                {po.supplierName || po.supplierId || "—"}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{ color: "#374151" }}>
                                                {lineCount} {lineCount === 1 ? "item" : "items"}
                                            </span>
                                        </td>
                                        <td style={{ fontWeight: 600, color: "#111827" }}>
                                            {formatCurrency(po.totalAmount)}
                                        </td>
                                        <td>
                                            <span className={`inv-status-chip ${po.status || "draft"}`}>
                                                {po.status || "draft"}
                                            </span>
                                        </td>
                                        <td style={{ color: "#6B7280" }}>{formatDate(po.createdAt)}</td>
                                        <td style={{ color: "#6B7280" }}>{formatDate(po.receivedAt)}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>

                {pagination.total > (pagination.limit || 20) && (
                    <div className="inv-table-footer">
                        <span>
                            Showing{" "}
                            <strong>{((pagination.page ?? page) - 1) * (pagination.limit ?? 20) + 1}</strong>
                            –
                            <strong>{Math.min((pagination.page ?? page) * (pagination.limit ?? 20), pagination.total)}</strong>
                            {" "}of <strong>{pagination.total}</strong>
                        </span>
                        <div className="inv-pagination">
                            <button className="inv-page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>‹</button>
                            {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                                const pageNum = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                                if (pageNum > totalPages) return null;
                                return (
                                    <button
                                        key={pageNum}
                                        className={`inv-page-btn ${pageNum === page ? "active" : ""}`}
                                        onClick={() => setPage(pageNum)}
                                    >
                                        {pageNum}
                                    </button>
                                );
                            })}
                            <button className="inv-page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>›</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
