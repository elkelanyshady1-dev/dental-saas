/**
 * CreatePODrawer.jsx — Create Purchase Order (v1)
 *
 * Payload: { supplierId?, supplierName?, items: [{itemId, quantity, cost}], notes? }
 * Backend computes totalAmount = sum(qty × cost) and sets status=draft.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { XMarkIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useInventoryList, useCreatePurchaseOrder } from "../hooks/useInventory";

function formatCurrency(value) {
    if (value == null || isNaN(value)) return "EGP 0.00";
    return `EGP ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function emptyLine() {
    return { itemId: "", quantity: 1, cost: 0 };
}

export default function CreatePODrawer({ onClose }) {
    const [supplierName, setSupplierName] = useState("");
    const [supplierId,   setSupplierId]   = useState("");
    const [notes,        setNotes]        = useState("");
    const [lines,        setLines]        = useState([emptyLine()]);
    const [error,        setError]        = useState(null);

    const itemsQ  = useInventoryList({ page: 1, limit: 200 });
    const createM = useCreatePurchaseOrder();
    const submittingRef = useRef(false);

    const itemsMap = useMemo(() => {
        const data = itemsQ.data?.data || [];
        const m = new Map();
        for (const it of data) m.set(it._id, it);
        return m;
    }, [itemsQ.data]);

    const total = useMemo(() => {
        return lines.reduce((sum, l) => {
            const q = Number(l.quantity) || 0;
            const c = Number(l.cost) || 0;
            return sum + q * c;
        }, 0);
    }, [lines]);

    const validLines = useMemo(() => {
        return lines.filter(l =>
            l.itemId &&
            Number(l.quantity) > 0 &&
            !isNaN(Number(l.cost))
        );
    }, [lines]);

    const handleItemPick = (lineIdx, itemId) => {
        setLines(prev => prev.map((l, i) => {
            if (i !== lineIdx) return l;
            const item = itemsMap.get(itemId);
            return {
                ...l,
                itemId,
                cost: item?.unitCost ?? l.cost ?? 0,
            };
        }));
    };

    const updateLine = (lineIdx, field, value) => {
        setLines(prev => prev.map((l, i) => i === lineIdx ? { ...l, [field]: value } : l));
    };

    const addLine = () => setLines(prev => [...prev, emptyLine()]);
    const removeLine = (idx) => setLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

    const handleSubmit = async () => {
        setError(null);
        if (validLines.length === 0) {
            setError("Add at least one line item with an item and quantity.");
            return;
        }
        if (submittingRef.current) return;
        submittingRef.current = true;
        const payload = {
            supplierName: supplierName.trim() || undefined,
            supplierId:   supplierId.trim()   || undefined,
            notes:        notes.trim()         || undefined,
            items: validLines.map(l => ({
                itemId:   l.itemId,
                quantity: Number(l.quantity),
                cost:     Number(l.cost),
            })),
        };
        try {
            await createM.mutateAsync(payload);
            onClose?.();
        } catch (err) {
            setError(
                err?.response?.data?.error?.message ||
                err?.response?.data?.message ||
                err?.message ||
                "Failed to create purchase order."
            );
        } finally {
            submittingRef.current = false;
        }
    };

    const saving = createM.isPending;

    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape" && !saving) onClose?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [saving, onClose]);

    return (
        <>
            <div className="inv-drawer-backdrop" onClick={saving ? undefined : onClose} />
            <div className="inv-drawer wide" role="dialog" aria-modal="true" aria-labelledby="inv-po-form-title">

                <div className="inv-drawer-header">
                    <div className="inv-drawer-title-block">
                        <h2 id="inv-po-form-title">New Purchase Order</h2>
                        <small>Draft a PO and receive stock once delivered</small>
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

                    {/* Supplier */}
                    <div className="inv-form-row">
                        <div className="inv-form-field">
                            <label className="inv-form-label">Supplier name</label>
                            <input
                                className="inv-form-input"
                                type="text"
                                value={supplierName}
                                onChange={(e) => setSupplierName(e.target.value)}
                                placeholder="e.g. DentaSupply Co."
                                disabled={saving}
                            />
                        </div>
                        <div className="inv-form-field">
                            <label className="inv-form-label">Supplier reference</label>
                            <input
                                className="inv-form-input"
                                type="text"
                                value={supplierId}
                                onChange={(e) => setSupplierId(e.target.value)}
                                placeholder="Optional supplier ID or code"
                                disabled={saving}
                            />
                        </div>
                    </div>

                    {/* Line items */}
                    <div>
                        <label className="inv-form-label" style={{ marginBottom: 8, display: "block" }}>
                            Line items
                        </label>

                        <div className="inv-po-items">
                            <div className="inv-po-items-header">
                                <span>Item</span>
                                <span>Qty</span>
                                <span>Unit cost</span>
                                <span>Line total</span>
                                <span />
                            </div>

                            {lines.map((line, idx) => {
                                const lineTotal = (Number(line.quantity) || 0) * (Number(line.cost) || 0);
                                return (
                                    <div key={idx} className="inv-po-items-row">
                                        <select
                                            value={line.itemId}
                                            onChange={(e) => handleItemPick(idx, e.target.value)}
                                            disabled={saving || itemsQ.isLoading}
                                        >
                                            <option value="">{itemsQ.isLoading ? "Loading…" : "Select item…"}</option>
                                            {Array.from(itemsMap.values()).map(it => (
                                                <option key={it._id} value={it._id}>
                                                    {it.name}{it.sku ? ` · ${it.sku}` : ""}
                                                </option>
                                            ))}
                                        </select>
                                        <input
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={line.quantity}
                                            onChange={(e) => updateLine(idx, "quantity", e.target.value)}
                                            disabled={saving}
                                        />
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={line.cost}
                                            onChange={(e) => updateLine(idx, "cost", e.target.value)}
                                            disabled={saving}
                                        />
                                        <span style={{ fontWeight: 600, color: "#111827", fontSize: "0.85rem" }}>
                                            {formatCurrency(lineTotal)}
                                        </span>
                                        <button
                                            type="button"
                                            className="inv-row-quick-action use"
                                            title="Remove line"
                                            onClick={() => removeLine(idx)}
                                            disabled={saving || lines.length <= 1}
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        <button
                            type="button"
                            className="inv-btn outline sm"
                            style={{ marginTop: 10 }}
                            onClick={addLine}
                            disabled={saving}
                        >
                            <PlusIcon className="w-4 h-4" /> Add line
                        </button>
                    </div>

                    {/* Totals */}
                    <div className="inv-po-totals">
                        <div className="inv-po-totals-row grand">
                            <span>Total</span>
                            <span>{formatCurrency(total)}</span>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="inv-form-field">
                        <label className="inv-form-label">Notes</label>
                        <textarea
                            className="inv-form-textarea"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Delivery instructions, reference numbers…"
                            disabled={saving}
                        />
                    </div>

                </div>

                <div className="inv-drawer-footer">
                    <button className="inv-btn ghost" onClick={onClose} disabled={saving}>
                        Cancel
                    </button>
                    <button
                        className="inv-btn primary"
                        onClick={handleSubmit}
                        disabled={saving || validLines.length === 0}
                    >
                        {saving ? "Creating..." : "Create Purchase Order"}
                    </button>
                </div>
            </div>
        </>
    );
}
