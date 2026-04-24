/**
 * ItemFormDrawer.jsx — Create / Edit Inventory Item (v1)
 *
 * On create: backend defaults stock level to 0. User adds stock separately.
 * On edit: allowed fields are name, category, unit, unitCost, minStockLevel,
 *          optimalStock, supplierId, expiryDate, isActive.
 */

import { useState, useEffect, useRef } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useCreateItem, useUpdateItem } from "../hooks/useInventory";

const CATEGORIES = [
    { value: "restorative",  label: "Restorative" },
    { value: "orthodontic",  label: "Orthodontic" },
    { value: "consumables",  label: "Consumables" },
    { value: "instruments",  label: "Instruments" },
    { value: "anesthetics",  label: "Anesthetics" },
    { value: "endo",         label: "Endo" },
    { value: "preventive",   label: "Preventive" },
];

const UNITS = ["box", "pack", "pair", "piece", "tube", "vial", "bottle", "g", "ml"];

function emptyForm() {
    return {
        name: "",
        sku: "",
        category: "consumables",
        unit: "piece",
        unitCost: "",
        minStock: "5",
        optimalStock: "",
        supplierId: "",
        expiryDate: "",
    };
}

function toFormFromItem(item) {
    if (!item) return emptyForm();
    return {
        name:         item.name ?? "",
        sku:          item.sku ?? "",
        category:     item.category ?? "consumables",
        unit:         item.unit ?? "piece",
        unitCost:     item.unitCost != null ? String(item.unitCost) : "",
        minStock:     item.minStockLevel != null ? String(item.minStockLevel) : "5",
        optimalStock: item.optimalStock != null ? String(item.optimalStock) : "",
        supplierId:   item.supplierId ?? "",
        expiryDate:   item.expiryDate ? String(item.expiryDate).slice(0, 10) : "",
    };
}

export default function ItemFormDrawer({ item, onClose }) {
    const isEdit = !!item?._id;
    const [form, setForm] = useState(() => toFormFromItem(item));
    const [error, setError] = useState(null);
    const [fieldErrors, setFieldErrors] = useState({});

    const createM = useCreateItem();
    const updateM = useUpdateItem();
    const submittingRef = useRef(false);

    const set = (field, value) => {
        setForm(p => ({ ...p, [field]: value }));
        if (fieldErrors[field]) setFieldErrors(p => ({ ...p, [field]: null }));
    };

    const validate = () => {
        const errs = {};
        if (!form.name.trim()) errs.name = "Name is required.";
        if (form.unitCost && Number(form.unitCost) < 0) errs.unitCost = "Unit cost cannot be negative.";
        if (form.minStock && Number(form.minStock) < 0) errs.minStock = "Min stock cannot be negative.";
        if (form.optimalStock && Number(form.optimalStock) < 0) errs.optimalStock = "Optimal stock cannot be negative.";
        setFieldErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        if (!validate()) return;
        if (submittingRef.current) return;
        submittingRef.current = true;

        const payload = {
            name:         form.name.trim(),
            sku:          form.sku.trim() || undefined,
            category:     form.category,
            unit:         form.unit,
            unitCost:     form.unitCost !== "" ? Number(form.unitCost) : 0,
            minStock:     form.minStock !== "" ? Number(form.minStock) : 5,
            optimalStock: form.optimalStock !== "" ? Number(form.optimalStock) : undefined,
            supplierId:   form.supplierId.trim() || undefined,
            expiryDate:   form.expiryDate || undefined,
        };

        try {
            if (isEdit) {
                // Update payload uses slightly different field names on the backend (minStockLevel vs minStock),
                // but the controller accepts both. Map minStock → minStockLevel for clarity.
                const updatePayload = {
                    ...payload,
                    minStockLevel: payload.minStock,
                };
                delete updatePayload.minStock;
                await updateM.mutateAsync({ id: item._id, data: updatePayload });
            } else {
                await createM.mutateAsync(payload);
            }
            onClose?.();
        } catch (err) {
            setError(
                err?.response?.data?.error?.message ||
                err?.response?.data?.message ||
                err?.message ||
                "Failed to save item."
            );
        } finally {
            submittingRef.current = false;
        }
    };

    const saving = createM.isPending || updateM.isPending;

    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape" && !saving) onClose?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [saving, onClose]);

    return (
        <>
            <div className="inv-drawer-backdrop" onClick={saving ? undefined : onClose} />
            <div className="inv-drawer" role="dialog" aria-modal="true" aria-labelledby="inv-form-title">

                <div className="inv-drawer-header">
                    <div className="inv-drawer-title-block">
                        <h2 id="inv-form-title">{isEdit ? "Edit Item" : "New Inventory Item"}</h2>
                        <small>{isEdit ? (item.sku ? `SKU: ${item.sku}` : "Update item details") : "Add a new item to your inventory"}</small>
                    </div>
                    <button className="inv-drawer-close" onClick={onClose} disabled={saving} aria-label="Close">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="inv-drawer-body">

                    {error && <div className="inv-banner error"><span className="inv-banner-icon">⚠</span>{error}</div>}

                    {!isEdit && (
                        <div className="inv-banner info">
                            <span className="inv-banner-icon">ℹ</span>
                            Initial stock starts at <strong>0</strong>. Use the "Add Stock" action after creation.
                        </div>
                    )}

                    <div className="inv-form">
                        {/* Name / SKU */}
                        <div className="inv-form-row">
                            <div className="inv-form-field">
                                <label className="inv-form-label" htmlFor="inv-name">
                                    Name <span className="required">*</span>
                                </label>
                                <input
                                    id="inv-name"
                                    className="inv-form-input"
                                    type="text"
                                    value={form.name}
                                    onChange={(e) => set("name", e.target.value)}
                                    placeholder="e.g. Composite Resin A2"
                                    required
                                    autoFocus
                                />
                                {fieldErrors.name && <p className="inv-form-error">{fieldErrors.name}</p>}
                            </div>
                            <div className="inv-form-field">
                                <label className="inv-form-label" htmlFor="inv-sku">SKU</label>
                                <input
                                    id="inv-sku"
                                    className="inv-form-input"
                                    type="text"
                                    value={form.sku}
                                    onChange={(e) => set("sku", e.target.value)}
                                    placeholder="e.g. COMP-A2-4G"
                                />
                                <p className="inv-form-help">Optional stock-keeping unit identifier</p>
                            </div>
                        </div>

                        {/* Category / Unit */}
                        <div className="inv-form-row">
                            <div className="inv-form-field">
                                <label className="inv-form-label" htmlFor="inv-cat">Category</label>
                                <select
                                    id="inv-cat"
                                    className="inv-form-select"
                                    value={form.category}
                                    onChange={(e) => set("category", e.target.value)}
                                >
                                    {CATEGORIES.map(c => (
                                        <option key={c.value} value={c.value}>{c.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="inv-form-field">
                                <label className="inv-form-label" htmlFor="inv-unit">Unit</label>
                                <select
                                    id="inv-unit"
                                    className="inv-form-select"
                                    value={form.unit}
                                    onChange={(e) => set("unit", e.target.value)}
                                >
                                    {UNITS.map(u => (
                                        <option key={u} value={u}>{u}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Cost / Min / Optimal */}
                        <div className="inv-form-row three">
                            <div className="inv-form-field">
                                <label className="inv-form-label" htmlFor="inv-cost">Unit cost (EGP)</label>
                                <input
                                    id="inv-cost"
                                    className="inv-form-input"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={form.unitCost}
                                    onChange={(e) => set("unitCost", e.target.value)}
                                    placeholder="0.00"
                                />
                                {fieldErrors.unitCost && <p className="inv-form-error">{fieldErrors.unitCost}</p>}
                            </div>
                            <div className="inv-form-field">
                                <label className="inv-form-label" htmlFor="inv-min">Min stock</label>
                                <input
                                    id="inv-min"
                                    className="inv-form-input"
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={form.minStock}
                                    onChange={(e) => set("minStock", e.target.value)}
                                />
                                <p className="inv-form-help">Alert threshold</p>
                                {fieldErrors.minStock && <p className="inv-form-error">{fieldErrors.minStock}</p>}
                            </div>
                            <div className="inv-form-field">
                                <label className="inv-form-label" htmlFor="inv-opt">Optimal stock</label>
                                <input
                                    id="inv-opt"
                                    className="inv-form-input"
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={form.optimalStock}
                                    onChange={(e) => set("optimalStock", e.target.value)}
                                    placeholder="Optional"
                                />
                                {fieldErrors.optimalStock && <p className="inv-form-error">{fieldErrors.optimalStock}</p>}
                            </div>
                        </div>

                        {/* Supplier / Expiry */}
                        <div className="inv-form-row">
                            <div className="inv-form-field">
                                <label className="inv-form-label" htmlFor="inv-supplier">Supplier reference</label>
                                <input
                                    id="inv-supplier"
                                    className="inv-form-input"
                                    type="text"
                                    value={form.supplierId}
                                    onChange={(e) => set("supplierId", e.target.value)}
                                    placeholder="Free-text for now"
                                />
                            </div>
                            <div className="inv-form-field">
                                <label className="inv-form-label" htmlFor="inv-exp">Expiry date</label>
                                <input
                                    id="inv-exp"
                                    className="inv-form-input"
                                    type="date"
                                    value={form.expiryDate}
                                    onChange={(e) => set("expiryDate", e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                </form>

                <div className="inv-drawer-footer">
                    <button type="button" className="inv-btn ghost" onClick={onClose} disabled={saving}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="inv-btn primary"
                        onClick={handleSubmit}
                        disabled={saving}
                    >
                        {saving
                            ? (isEdit ? "Saving..." : "Creating...")
                            : (isEdit ? "Save changes" : "Create item")
                        }
                    </button>
                </div>
            </div>
        </>
    );
}
