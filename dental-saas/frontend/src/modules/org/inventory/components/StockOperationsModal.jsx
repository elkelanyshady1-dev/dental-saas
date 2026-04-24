/**
 * StockOperationsModal.jsx — Stock Operation Dialog (v1)
 *
 * Three modes in a tab group:
 *   - add:     POST /org/inventory/:id/add-stock   (IN, optional reference + cost override)
 *   - use:     POST /org/inventory/:id/use-stock   (OUT, optional patient/procedure/reference)
 *   - adjust:  POST /org/inventory/:id/adjust      (absolute newQuantity + reason)
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { XMarkIcon, MinusIcon, PlusIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import {
    useAddStock, useUseStock, useAdjustStock,
} from "../hooks/useInventory";

const COST_DISCLAIMER = "Preview based on the item's current unit cost. Final cost is finalized by the server when the operation is confirmed.";

const MODE_LABEL = {
    add:    "Add Stock",
    use:    "Use Stock",
    adjust: "Adjust",
};

const ADJUST_REASONS = [
    { value: "inventory_count",    label: "Inventory count" },
    { value: "damage",             label: "Damage / breakage" },
    { value: "expiry",             label: "Expired stock removal" },
    { value: "theft_loss",         label: "Theft or loss" },
    { value: "correction",         label: "Correction (data entry error)" },
    { value: "other",              label: "Other" },
];

function formatCurrency(value) {
    if (value == null || isNaN(value)) return "—";
    return `EGP ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Stepper({ value, onChange, min = 1, max = null, disabled }) {
    const setVal = (v) => {
        if (v < min) v = min;
        if (max != null && v > max) v = max;
        onChange(v);
    };
    return (
        <div className="inv-number-stepper">
            <button type="button" onClick={() => setVal((value ?? 0) - 1)} disabled={disabled || (value ?? 0) <= min}>
                <MinusIcon className="w-4 h-4 inline" />
            </button>
            <input
                type="number"
                value={value ?? ""}
                onChange={(e) => setVal(Number(e.target.value))}
                min={min}
                max={max ?? undefined}
                disabled={disabled}
            />
            <button type="button" onClick={() => setVal((value ?? 0) + 1)} disabled={disabled || (max != null && (value ?? 0) >= max)}>
                <PlusIcon className="w-4 h-4 inline" />
            </button>
        </div>
    );
}

export default function StockOperationsModal({ item, initialMode = "add", onClose }) {
    const [mode, setMode] = useState(initialMode);
    const [quantity, setQuantity] = useState(1);
    const [newQuantityAbs, setNewQuantityAbs] = useState(item?.stockLevel ?? 0);
    const [reference, setReference] = useState("");
    const [reason, setReason] = useState("inventory_count");
    const [costOverride, setCostOverride] = useState("");
    const [patientId, setPatientId] = useState("");
    const [procedure, setProcedure] = useState("");
    const [notes, setNotes] = useState("");
    const [error, setError] = useState(null);

    const addM    = useAddStock();
    const useM    = useUseStock();
    const adjustM = useAdjustStock();

    // Re-entrancy guard — prevents double-submit even across rapid clicks.
    const submittingRef = useRef(false);

    const currentStock = item?.stockLevel ?? 0;
    const unitCost = item?.unitCost ?? 0;
    const effCost = costOverride !== "" ? Number(costOverride) : unitCost;

    const handleModeChange = (nextMode) => {
        setMode(nextMode);
        setQuantity(1);
        setReference("");
        setReason("inventory_count");
        setCostOverride("");
        setPatientId("");
        setProcedure("");
        setNotes("");
        setNewQuantityAbs(item?.stockLevel ?? 0);
        setError(null);
    };

    const saving = addM.isPending || useM.isPending || adjustM.isPending;

    // ESC to close (blocked while saving).
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape" && !saving) onClose?.();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [saving, onClose]);

    // ── Previews ───────────────────────────────────────────────────────────
    const preview = useMemo(() => {
        if (mode === "add") {
            const qty = Number(quantity) || 0;
            return {
                newStock: currentStock + qty,
                cost: qty * (Number.isFinite(effCost) ? effCost : 0),
                delta: qty,
                valid: qty > 0,
            };
        }
        if (mode === "use") {
            const qty = Number(quantity) || 0;
            return {
                newStock: Math.max(0, currentStock - qty),
                cost: qty * unitCost,
                delta: -qty,
                valid: qty > 0 && qty <= currentStock,
                overflow: qty > currentStock,
            };
        }
        if (mode === "adjust") {
            const newQty = Number(newQuantityAbs);
            const delta = newQty - currentStock;
            return {
                newStock: newQty,
                delta,
                valid: Number.isFinite(newQty) && newQty >= 0,
            };
        }
        return { valid: false };
    }, [mode, quantity, newQuantityAbs, currentStock, effCost, unitCost]);

    const handleSubmit = async () => {
        setError(null);
        if (!item?._id) return;
        if (!preview.valid) {
            setError("Please enter a valid quantity.");
            return;
        }
        if (submittingRef.current) return;   // re-entrancy guard
        submittingRef.current = true;

        try {
            if (mode === "add") {
                const payload = { quantity: Number(quantity) };
                if (reference) payload.reference = reference;
                if (costOverride !== "") payload.cost = Number(costOverride);
                await addM.mutateAsync({ id: item._id, data: payload });
            } else if (mode === "use") {
                const payload = { quantity: Number(quantity) };
                if (patientId) payload.patientId = patientId;
                if (procedure) payload.procedure = procedure;
                if (reference || notes) payload.reference = reference || notes;
                await useM.mutateAsync({ id: item._id, data: payload });
            } else if (mode === "adjust") {
                const payload = {
                    newQuantity: Number(newQuantityAbs),
                    reason: notes ? `${reason} · ${notes}` : reason,
                };
                await adjustM.mutateAsync({ id: item._id, data: payload });
            }
            onClose?.();
        } catch (err) {
            setError(
                err?.response?.data?.error?.message ||
                err?.response?.data?.message ||
                err?.message ||
                "Operation failed."
            );
        } finally {
            submittingRef.current = false;
        }
    };

    if (!item) return null;

    return (
        <div className="inv-modal-backdrop" onClick={saving ? undefined : onClose}>
            <div className="inv-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="inv-stock-op-title">

                <div className="inv-modal-header">
                    <div className="inv-modal-title-block">
                        <h2 id="inv-stock-op-title">Stock Operation</h2>
                        <small>
                            {item.name}
                            {item.sku && <> · <code style={{ fontFamily: "ui-monospace" }}>SKU {item.sku}</code></>}
                        </small>
                    </div>
                    <button className="inv-drawer-close" onClick={onClose} disabled={saving} aria-label="Close">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="inv-modal-body">
                    {/* Operation tabs */}
                    <div className="inv-op-tabs" role="tablist">
                        {Object.keys(MODE_LABEL).map(k => (
                            <button
                                key={k}
                                role="tab"
                                aria-selected={mode === k}
                                className={`inv-op-tab ${mode === k ? `active ${k}` : ""}`}
                                onClick={() => handleModeChange(k)}
                                disabled={saving}
                            >
                                {MODE_LABEL[k]}
                            </button>
                        ))}
                    </div>

                    {/* Current stock banner */}
                    <div className="inv-banner info">
                        <span className="inv-banner-icon">📦</span>
                        <div style={{ flex: 1 }}>
                            <strong>{currentStock} units available</strong>
                            {item.minStockLevel != null && <> · min level {item.minStockLevel}</>}
                            <> · unit cost {formatCurrency(unitCost)}</>
                        </div>
                    </div>

                    {error && (
                        <div className="inv-banner error">
                            <span className="inv-banner-icon">⚠</span> {error}
                        </div>
                    )}

                    {/* Mode-specific form */}
                    {mode === "add" && (
                        <div className="inv-form">
                            <div className="inv-form-field">
                                <label className="inv-form-label">Quantity to add</label>
                                <Stepper value={quantity} onChange={setQuantity} min={1} disabled={saving} />
                                {preview.valid && (
                                    <p className="inv-preview-line">
                                        New stock: <strong>{preview.newStock}</strong> units
                                    </p>
                                )}
                            </div>
                            <div className="inv-form-row">
                                <div className="inv-form-field">
                                    <label className="inv-form-label">Unit cost override (optional)</label>
                                    <input
                                        className="inv-form-input"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={costOverride}
                                        onChange={(e) => setCostOverride(e.target.value)}
                                        placeholder={String(unitCost ?? 0)}
                                        disabled={saving}
                                    />
                                    <p className="inv-form-help">Uses item's unit cost if blank</p>
                                </div>
                                <div className="inv-form-field">
                                    <label className="inv-form-label">Reference</label>
                                    <input
                                        className="inv-form-input"
                                        type="text"
                                        value={reference}
                                        onChange={(e) => setReference(e.target.value)}
                                        placeholder="e.g. PO-2026-0040"
                                        disabled={saving}
                                    />
                                </div>
                            </div>
                            {preview.valid && (
                                <div className="inv-cost-card" aria-live="polite">
                                    <div
                                        className="inv-cost-card-label"
                                        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                                    >
                                        Estimated cost impact
                                        <span title={COST_DISCLAIMER} aria-label={COST_DISCLAIMER} style={{ display: "inline-flex", cursor: "help" }}>
                                            <InformationCircleIcon className="w-4 h-4" style={{ color: "#9CA3AF" }} />
                                        </span>
                                    </div>
                                    <div className="inv-cost-card-value">{formatCurrency(preview.cost)}</div>
                                    <div className="inv-cost-card-sub">
                                        {quantity} × {formatCurrency(effCost)} · finalized by server
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {mode === "use" && (
                        <div className="inv-form">
                            <div className="inv-form-field">
                                <label className="inv-form-label">Quantity to use</label>
                                <Stepper
                                    value={quantity}
                                    onChange={setQuantity}
                                    min={1}
                                    max={currentStock}
                                    disabled={saving || currentStock <= 0}
                                />
                                {preview.valid && (
                                    <p className="inv-preview-line negative">
                                        New stock: <strong>{preview.newStock}</strong> units
                                    </p>
                                )}
                                {preview.overflow && (
                                    <div className="inv-banner error" style={{ marginTop: 6 }}>
                                        <span className="inv-banner-icon">⚠</span>
                                        Insufficient stock — only <strong>{currentStock}</strong> available.
                                    </div>
                                )}
                            </div>
                            <div className="inv-form-row">
                                <div className="inv-form-field">
                                    <label className="inv-form-label">Patient ID (optional)</label>
                                    <input
                                        className="inv-form-input"
                                        type="text"
                                        value={patientId}
                                        onChange={(e) => setPatientId(e.target.value)}
                                        placeholder="Patient _id"
                                        disabled={saving}
                                    />
                                </div>
                                <div className="inv-form-field">
                                    <label className="inv-form-label">Procedure (optional)</label>
                                    <input
                                        className="inv-form-input"
                                        type="text"
                                        value={procedure}
                                        onChange={(e) => setProcedure(e.target.value)}
                                        placeholder="e.g. Class II composite"
                                        disabled={saving}
                                    />
                                </div>
                            </div>
                            <div className="inv-form-field">
                                <label className="inv-form-label">Reference or notes</label>
                                <input
                                    className="inv-form-input"
                                    type="text"
                                    value={reference}
                                    onChange={(e) => setReference(e.target.value)}
                                    placeholder="e.g. Stage completion reference"
                                    disabled={saving}
                                />
                            </div>
                            {preview.valid && (
                                <div className="inv-cost-card" aria-live="polite">
                                    <div
                                        className="inv-cost-card-label"
                                        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                                    >
                                        Estimated cost impact
                                        <span title={COST_DISCLAIMER} aria-label={COST_DISCLAIMER} style={{ display: "inline-flex", cursor: "help" }}>
                                            <InformationCircleIcon className="w-4 h-4" style={{ color: "#9CA3AF" }} />
                                        </span>
                                    </div>
                                    <div className="inv-cost-card-value">{formatCurrency(preview.cost)}</div>
                                    <div className="inv-cost-card-sub">
                                        {quantity} × {formatCurrency(unitCost)} · finalized by server
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {mode === "adjust" && (
                        <div className="inv-form">
                            <div className="inv-form-field">
                                <label className="inv-form-label">New stock count (absolute)</label>
                                <Stepper
                                    value={newQuantityAbs}
                                    onChange={setNewQuantityAbs}
                                    min={0}
                                    disabled={saving}
                                />
                                {preview.valid && (
                                    <p className={`inv-preview-line ${preview.delta < 0 ? "negative" : ""}`}>
                                        Delta: <strong>{preview.delta > 0 ? `+${preview.delta}` : preview.delta}</strong> units
                                        {" "}(was {currentStock})
                                    </p>
                                )}
                            </div>
                            <div className="inv-form-field">
                                <label className="inv-form-label">Reason</label>
                                <select
                                    className="inv-form-select"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    disabled={saving}
                                >
                                    {ADJUST_REASONS.map(r => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="inv-form-field">
                                <label className="inv-form-label">Notes (optional)</label>
                                <textarea
                                    className="inv-form-textarea"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Additional context for this adjustment…"
                                    disabled={saving}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="inv-modal-footer">
                    <button className="inv-btn ghost" onClick={onClose} disabled={saving}>
                        Cancel
                    </button>
                    <button
                        className={
                            mode === "use"    ? "inv-btn danger-solid"
                          : mode === "add"    ? "inv-btn success"
                          :                     "inv-btn primary"
                        }
                        onClick={handleSubmit}
                        disabled={saving || !preview.valid || preview.overflow}
                    >
                        {saving ? "Processing..." : MODE_LABEL[mode]}
                    </button>
                </div>
            </div>
        </div>
    );
}
