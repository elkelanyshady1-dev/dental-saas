/**
 * PODetailDrawer.jsx — Purchase Order Detail + Receive (v1)
 *
 * Renders the supplied PO and allows receiving if status is draft/ordered.
 * Receive increments stock on every line item and sets status=received.
 */

import { useMemo, useState, useEffect, useRef } from "react";
import { XMarkIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { useReceivePurchaseOrder, useInventoryList } from "../hooks/useInventory";

function formatCurrency(value) {
    if (value == null || isNaN(value)) return "—";
    return `EGP ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function shortPOId(po) {
    if (!po?._id) return "—";
    return `PO-${String(po._id).slice(-8).toUpperCase()}`;
}

export default function PODetailDrawer({ po, onClose, canUpdate }) {
    const receiveM = useReceivePurchaseOrder();
    const [error, setError] = useState(null);
    const [confirming, setConfirming] = useState(false);
    const receiveGuardRef = useRef(false);

    // Fetch items so we can display item names for line items that only carry itemId
    const itemsQ = useInventoryList({ page: 1, limit: 200 });
    const itemLookup = useMemo(() => {
        const map = new Map();
        (itemsQ.data?.data || []).forEach(it => map.set(String(it._id), it));
        return map;
    }, [itemsQ.data]);

    const lines = po?.items || [];
    const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.cost) || 0), 0);
    const status = po?.status || "draft";
    const canReceive = canUpdate && (status === "draft" || status === "ordered");

    const handleReceive = async () => {
        setError(null);
        if (!po?._id) return;
        if (status === "received") return;          // never re-receive
        if (receiveGuardRef.current) return;        // re-entrancy guard
        receiveGuardRef.current = true;
        try {
            await receiveM.mutateAsync(po._id);     // hook invalidates QK.inventory.all onSettled
            onClose?.();
        } catch (err) {
            setError(
                err?.response?.data?.error?.message ||
                err?.response?.data?.message ||
                err?.message ||
                "Failed to receive purchase order."
            );
            setConfirming(false);
        } finally {
            receiveGuardRef.current = false;
        }
    };

    const saving = receiveM.isPending;

    // ESC to close (blocked while receiving).
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape" && !saving) onClose?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [saving, onClose]);

    return (
        <>
            <div className="inv-drawer-backdrop" onClick={saving ? undefined : onClose} />
            <div className="inv-drawer wide" role="dialog" aria-modal="true" aria-labelledby="inv-po-detail-title">

                <div className="inv-drawer-header">
                    <div className="inv-drawer-title-block">
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <h2 id="inv-po-detail-title" style={{ margin: 0, fontFamily: "ui-monospace, SF Mono, Menlo, monospace" }}>
                                {shortPOId(po)}
                            </h2>
                            <span className={`inv-status-chip ${status}`}>{status}</span>
                        </div>
                        <small style={{ fontFamily: "inherit" }}>{po?.supplierName || po?.supplierId || "Unknown supplier"}</small>
                    </div>
                    <button className="inv-drawer-close" onClick={onClose} disabled={saving} aria-label="Close">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="inv-drawer-body">

                    {error && (
                        <div className="inv-banner error">
                            <span className="inv-banner-icon">⚠</span> {error}
                        </div>
                    )}

                    {/* Meta grid */}
                    <div className="inv-info-grid">
                        <div className="inv-info-row">
                            <span className="inv-info-label">Created</span>
                            <span className="inv-info-value">{formatDate(po?.createdAt)}</span>
                        </div>
                        <div className="inv-info-row">
                            <span className="inv-info-label">Received</span>
                            <span className="inv-info-value">{formatDate(po?.receivedAt)}</span>
                        </div>
                        <div className="inv-info-row">
                            <span className="inv-info-label">Items</span>
                            <span className="inv-info-value">{lines.length}</span>
                        </div>
                        <div className="inv-info-row">
                            <span className="inv-info-label">Total</span>
                            <span className="inv-info-value" style={{ fontWeight: 700, color: "#111827" }}>
                                {formatCurrency(po?.totalAmount ?? subtotal)}
                            </span>
                        </div>
                    </div>

                    {/* Line items */}
                    <div>
                        <h3 className="inv-panel-title" style={{ marginBottom: 10 }}>Line items</h3>
                        <div className="inv-po-items">
                            <div className="inv-po-items-header">
                                <span>Item</span>
                                <span>Qty</span>
                                <span>Unit cost</span>
                                <span>Line total</span>
                                <span />
                            </div>
                            {lines.length === 0 ? (
                                <div className="inv-empty" style={{ padding: "24px 12px" }}>
                                    <p className="inv-empty-title">No line items</p>
                                </div>
                            ) : lines.map((line, idx) => {
                                const itemDoc = itemLookup.get(String(line.itemId));
                                const name = itemDoc?.name || line.name || "Unknown item";
                                const sku  = itemDoc?.sku || line.sku;
                                const lineTotal = (Number(line.quantity) || 0) * (Number(line.cost) || 0);
                                return (
                                    <div key={idx} className="inv-po-items-row">
                                        <div>
                                            <div style={{ fontWeight: 500, color: "#111827" }}>{name}</div>
                                            {sku && <div style={{ fontSize: "0.7rem", color: "#9CA3AF", fontFamily: "ui-monospace" }}>{sku}</div>}
                                        </div>
                                        <span style={{ color: "#374151" }}>{line.quantity}</span>
                                        <span style={{ color: "#374151" }}>{formatCurrency(line.cost)}</span>
                                        <span style={{ fontWeight: 600, color: "#111827" }}>{formatCurrency(lineTotal)}</span>
                                        <span />
                                    </div>
                                );
                            })}
                        </div>

                        <div className="inv-po-totals">
                            <div className="inv-po-totals-row">
                                <span>Subtotal</span>
                                <span>{formatCurrency(subtotal)}</span>
                            </div>
                            <div className="inv-po-totals-row grand">
                                <span>Total</span>
                                <span>{formatCurrency(po?.totalAmount ?? subtotal)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    {po?.notes && (
                        <div className="inv-banner info" style={{ alignItems: "flex-start" }}>
                            <span className="inv-banner-icon">📝</span>
                            <div style={{ flex: 1, whiteSpace: "pre-wrap" }}>{po.notes}</div>
                        </div>
                    )}

                    {/* Receive workflow */}
                    {canReceive && (
                        <div style={{
                            background: "#F0F9FF",
                            border: "1px solid #BAE6FD",
                            borderRadius: 12,
                            padding: 16,
                            display: "flex", flexDirection: "column", gap: 8,
                        }}>
                            <h3 style={{ margin: 0, fontSize: "0.95rem", color: "#075985" }}>
                                Receive this PO
                            </h3>
                            <p style={{ margin: 0, fontSize: "0.82rem", color: "#0369A1" }}>
                                Stock levels will increase for each line item and an IN movement will be recorded.
                            </p>
                            {!confirming ? (
                                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                                    <button
                                        className="inv-btn success"
                                        onClick={() => setConfirming(true)}
                                        disabled={saving || lines.length === 0}
                                    >
                                        <CheckCircleIcon className="w-4 h-4" /> Receive & Update Stock
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                                    <button
                                        className="inv-btn ghost sm"
                                        onClick={() => setConfirming(false)}
                                        disabled={saving}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className="inv-btn success sm"
                                        onClick={handleReceive}
                                        disabled={saving}
                                    >
                                        {saving ? "Receiving..." : "Confirm receive"}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {status === "received" && (
                        <div className="inv-banner success">
                            <span className="inv-banner-icon"><CheckCircleIcon className="w-4 h-4" /></span>
                            <div>
                                Purchase order received on <strong>{formatDate(po?.receivedAt)}</strong>.
                                Stock levels were updated for {lines.length} line item{lines.length === 1 ? "" : "s"}.
                            </div>
                        </div>
                    )}

                </div>

                <div className="inv-drawer-footer">
                    <button className="inv-btn outline" onClick={onClose} disabled={saving}>Close</button>
                </div>
            </div>
        </>
    );
}
