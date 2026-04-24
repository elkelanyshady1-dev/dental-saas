/**
 * InventoryItemsTable.jsx — Items Tab (v1)
 *
 * Features:
 *   - Search (by name; server-side regex)
 *   - Category filter (server-side)
 *   - Stock status chips: All | Low Stock | (Out of Stock: client-side filter of low-stock server list)
 *   - Pagination
 *   - Row actions: View · Edit · + Stock · − Stock · ⇄ Adjust · Delete
 */

import { useMemo, useState, useEffect } from "react";
import {
    PlusIcon, PencilIcon, TrashIcon, EyeIcon, MagnifyingGlassIcon,
    ArrowDownTrayIcon, ArrowUpTrayIcon, ArrowsRightLeftIcon,
} from "@heroicons/react/24/outline";
import { useInventoryList, useDeleteItem } from "../hooks/useInventory";

const CATEGORY_OPTIONS = [
    { value: "",             label: "All Categories" },
    { value: "restorative",  label: "Restorative" },
    { value: "orthodontic",  label: "Orthodontic" },
    { value: "consumables",  label: "Consumables" },
    { value: "instruments",  label: "Instruments" },
    { value: "anesthetics",  label: "Anesthetics" },
    { value: "endo",         label: "Endo" },
    { value: "preventive",   label: "Preventive" },
];

const STOCK_FILTERS = [
    { key: "all", label: "All" },
    { key: "low", label: "Low Stock" },
    { key: "out", label: "Out of Stock" },
];

function relTime(iso) {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000)        return "just now";
    if (diff < 3_600_000)     return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000)    return `${Math.floor(diff / 3_600_000)}h ago`;
    const days = Math.floor(diff / 86_400_000);
    if (days === 1)           return "yesterday";
    if (days < 7)             return `${days}d ago`;
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function stockStatus(item) {
    const current = item.stockLevel ?? 0;
    const min = item.minStockLevel ?? 0;
    if (current <= 0)    return "critical";
    if (current <= min)  return "warning";
    return "healthy";
}

function formatCurrency(value) {
    if (value == null) return "—";
    return `EGP ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Shimmer({ w = "60%", h = "1rem", radius = 6 }) {
    return <div className="inv-shimmer" style={{ width: w, height: h, borderRadius: radius }} />;
}

export default function InventoryItemsTable({
    onCreate,
    onEdit,
    onView,
    onStockOp,
    canCreate,
    canUpdate,
}) {
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [category, setCategory] = useState("");
    const [stockFilter, setStockFilter] = useState("all");
    const [page, setPage] = useState(1);
    const [deletingId, setDeletingId] = useState(null);

    // Debounce search
    useEffect(() => {
        const t = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 300);
        return () => clearTimeout(t);
    }, [search]);

    const handleCategoryChange = (value) => {
        setCategory(value);
        setPage(1);
    };
    const handleStockFilterChange = (value) => {
        setStockFilter(value);
        setPage(1);
    };

    const queryParams = useMemo(() => {
        const p = { page, limit: 20 };
        if (debouncedSearch) p.search = debouncedSearch;
        if (category) p.category = category;
        if (stockFilter === "low" || stockFilter === "out") p.lowStock = "true";
        return p;
    }, [debouncedSearch, category, stockFilter, page]);

    const listQ = useInventoryList(queryParams);
    const deleteM = useDeleteItem();

    const rawItems = listQ.data?.data || [];
    const pagination = listQ.data?.pagination || { total: 0, limit: 20 };

    // Apply "out of stock" client-side filter on top of server low-stock set
    const items = useMemo(() => {
        if (stockFilter === "out") {
            return rawItems.filter(it => (it.stockLevel ?? 0) <= 0);
        }
        return rawItems;
    }, [rawItems, stockFilter]);

    const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || 20)));

    const handleDelete = async (id) => {
        if (!window.confirm("Deactivate this item? It will be hidden from the list and cannot receive stock movements.")) return;
        setDeletingId(id);
        try {
            await deleteM.mutateAsync(id);
        } catch (err) {
            alert(err?.response?.data?.error?.message || err?.message || "Failed to deactivate.");
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div>
            {/* ── Toolbar ── */}
            <div className="inv-toolbar">
                <div className="inv-search">
                    <MagnifyingGlassIcon className="w-4 h-4 inv-search-icon" />
                    <input
                        type="text"
                        placeholder="Search by name or SKU..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Search inventory items"
                    />
                </div>

                <div className="inv-filter">
                    <select value={category} onChange={(e) => handleCategoryChange(e.target.value)} aria-label="Filter by category">
                        {CATEGORY_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>

                <div className="inv-filter-chips" role="tablist" aria-label="Stock status filter">
                    {STOCK_FILTERS.map(f => (
                        <button
                            key={f.key}
                            role="tab"
                            aria-selected={stockFilter === f.key}
                            className={`inv-filter-chip ${stockFilter === f.key ? "active" : ""}`}
                            onClick={() => handleStockFilterChange(f.key)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                <div style={{ flex: 1 }} />

                <span style={{ fontSize: "0.8rem", color: "#6B7280" }}>
                    {pagination.total ?? 0} items
                </span>
            </div>

            {/* ── Table ── */}
            <div className="inv-table-wrap">
                <table className="inv-table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Category</th>
                            <th>Stock Level</th>
                            <th>Unit Cost</th>
                            <th>Updated</th>
                            <th style={{ textAlign: "right" }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {listQ.isLoading ? (
                            Array.from({ length: 6 }).map((_, i) => (
                                <tr key={`s-${i}`}>
                                    <td><Shimmer w="60%" /><div style={{ height: 4 }} /><Shimmer w="35%" h="0.7rem" /></td>
                                    <td><Shimmer w="70px" h="0.8rem" radius={10} /></td>
                                    <td><Shimmer w="80%" /><div style={{ height: 6 }} /><Shimmer w="60%" h="0.4rem" /></td>
                                    <td><Shimmer w="60%" /></td>
                                    <td><Shimmer w="50%" /></td>
                                    <td><Shimmer w="40px" /></td>
                                </tr>
                            ))
                        ) : listQ.isError ? (
                            <tr>
                                <td colSpan={6}>
                                    <div className="inv-empty">
                                        <span className="inv-empty-icon">⚠</span>
                                        <p className="inv-empty-title">Couldn't load items</p>
                                        <p className="inv-empty-sub">Something went wrong. Check your connection and try again.</p>
                                        <button className="inv-btn primary sm" onClick={() => listQ.refetch()}>
                                            Retry
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ) : items.length === 0 ? (
                            <tr>
                                <td colSpan={6}>
                                    <div className="inv-empty">
                                        <span className="inv-empty-icon">📦</span>
                                        <p className="inv-empty-title">No items found</p>
                                        <p className="inv-empty-sub">
                                            {debouncedSearch || category || stockFilter !== "all"
                                                ? "Try adjusting your filters or search query."
                                                : "Start by adding your first inventory item."}
                                        </p>
                                        {canCreate && !debouncedSearch && !category && stockFilter === "all" && (
                                            <button className="inv-btn primary sm" onClick={onCreate}>
                                                <PlusIcon className="w-4 h-4" /> Add Item
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            items.map(item => {
                                const status = stockStatus(item);
                                const current = item.stockLevel ?? 0;
                                const min = item.minStockLevel ?? 0;
                                const pct = Math.max(4, Math.min(100, (current / Math.max(min * 2, 1)) * 100));
                                const cat = item.category || "uncategorized";

                                return (
                                    <tr
                                        key={item._id}
                                        className="inv-table-row"
                                        onClick={() => onView?.(item)}
                                    >
                                        <td>
                                            <div className="inv-item-cell">
                                                <span className="inv-item-name">{item.name}</span>
                                                {item.sku && <span className="inv-item-sku">SKU: {item.sku}</span>}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`inv-category-pill ${cat}`}>
                                                {CATEGORY_OPTIONS.find(o => o.value === cat)?.label || cat}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="inv-stock-cell">
                                                <div className="inv-stock-numbers">
                                                    <span className="inv-stock-current">{current}</span>
                                                    <span className="inv-stock-min">/ min {min}</span>
                                                    {status === "critical" && <span className="inv-status-chip critical">Out</span>}
                                                    {status === "warning"  && <span className="inv-status-chip warning">Low</span>}
                                                </div>
                                                <div className="inv-stock-bar-track">
                                                    <div className={`inv-stock-bar-fill ${status}`} style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                        </td>
                                        <td>{formatCurrency(item.unitCost)}</td>
                                        <td style={{ color: "#6B7280" }}>{relTime(item.updatedAt || item.createdAt)}</td>
                                        <td onClick={(e) => e.stopPropagation()}>
                                            <div className="inv-table-actions">
                                                {canUpdate && (
                                                    <>
                                                        <button
                                                            className="inv-row-quick-action add"
                                                            title="Add stock"
                                                            aria-label={`Add stock to ${item.name}`}
                                                            onClick={() => onStockOp?.(item, "add")}
                                                        >
                                                            <ArrowDownTrayIcon className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            className="inv-row-quick-action use"
                                                            title="Use stock"
                                                            aria-label={`Use stock from ${item.name}`}
                                                            onClick={() => onStockOp?.(item, "use")}
                                                        >
                                                            <ArrowUpTrayIcon className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            className="inv-row-quick-action"
                                                            title="Adjust stock"
                                                            aria-label={`Adjust stock for ${item.name}`}
                                                            onClick={() => onStockOp?.(item, "adjust")}
                                                        >
                                                            <ArrowsRightLeftIcon className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                                <button
                                                    className="inv-row-quick-action"
                                                    title="View details"
                                                    aria-label={`View details for ${item.name}`}
                                                    onClick={() => onView?.(item)}
                                                >
                                                    <EyeIcon className="w-4 h-4" />
                                                </button>
                                                {canUpdate && (
                                                    <button
                                                        className="inv-row-quick-action"
                                                        title="Edit item"
                                                        aria-label={`Edit ${item.name}`}
                                                        onClick={() => onEdit?.(item)}
                                                    >
                                                        <PencilIcon className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {canUpdate && (
                                                    <button
                                                        className="inv-row-quick-action use"
                                                        title="Deactivate"
                                                        aria-label={`Deactivate ${item.name}`}
                                                        disabled={deletingId === item._id}
                                                        onClick={() => handleDelete(item._id)}
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>

                {/* ── Pagination ── */}
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
