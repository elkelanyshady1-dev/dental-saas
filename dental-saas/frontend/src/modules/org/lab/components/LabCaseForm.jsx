/**
 * LabCaseForm — controlled form for create/edit lab case.
 *
 * When used for Edit, labId + caseCode are non-editable after create;
 * the backend rejects changes to those anyway.
 */

import { useState, useMemo } from "react";
import { useLabPartners } from "../hooks/useLab";

const APPLIANCE_TYPES = [
    { value: "aligner",   label: "Aligner" },
    { value: "essix",     label: "Essix Retainer" },
    { value: "twinblock", label: "Twin Block" },
    { value: "retainer",  label: "Retainer" },
    { value: "herbst",    label: "Herbst" },
    { value: "archwire",  label: "Arch Wire" },
];

const empty = {
    labId: "",
    patientId: "",
    patientName: "",
    applianceType: "",
    prescription: "",
    notes: "",
    expectedDelivery: "",
    cost: "",
    trackingNumber: "",
    trackingCarrier: "",
};

export default function LabCaseForm({
    mode = "create",        // "create" | "edit"
    initialValues,
    onSubmit,
    onCancel,
    submitLabel,
    pending = false,
    apiError = null,
}) {
    const { data: partnersResp } = useLabPartners({ limit: 100 });
    const partners = useMemo(
        () => (partnersResp?.data || []).filter((p) => p.status !== "archived"),
        [partnersResp]
    );

    const [form, setForm] = useState(() => {
        const seed = initialValues || {};
        return {
            ...empty,
            ...seed,
            labId:            seed.labId || "",
            expectedDelivery: seed.expectedDelivery
                ? String(seed.expectedDelivery).slice(0, 10)
                : "",
            cost:             seed.cost ?? "",
            prescription:     typeof seed.prescription === "string"
                ? seed.prescription
                : JSON.stringify(seed.prescription || "", null, 0).replace(/^""$/, ""),
        };
    });
    const [errors, setErrors] = useState({});

    const setField = (field) => (e) => {
        const value = e?.target?.value ?? e;
        setForm((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) setErrors((p) => ({ ...p, [field]: undefined }));
    };

    const validate = () => {
        const e = {};
        if (mode === "create" && !form.labId) e.labId = "Lab partner is required";
        if (!form.applianceType) e.applianceType = "Appliance type is required";
        if (form.cost !== "" && form.cost !== null) {
            const n = Number(form.cost);
            if (!Number.isFinite(n) || n < 0) e.cost = "Must be a non-negative number";
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!validate()) return;

        const base = {
            applianceType: form.applianceType,
            patientId:     form.patientId.trim() || undefined,
            patientName:   form.patientName.trim() || undefined,
            prescription:  form.prescription.trim() || undefined,
            notes:         form.notes.trim() || undefined,
            expectedDelivery: form.expectedDelivery
                ? new Date(form.expectedDelivery).toISOString()
                : undefined,
            cost: form.cost === "" || form.cost === null ? undefined : Number(form.cost),
            trackingNumber:  form.trackingNumber.trim()  || undefined,
            trackingCarrier: form.trackingCarrier.trim() || undefined,
        };

        if (mode === "create") {
            onSubmit({ labId: form.labId, ...base });
        } else {
            onSubmit(base);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <section className="bg-card rounded-card shadow-card p-6 space-y-4">
                <h3 className="text-sm font-semibold text-text-primary">Case details</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Lab partner" required error={errors.labId}>
                        <select
                            value={form.labId}
                            onChange={setField("labId")}
                            disabled={mode === "edit"}
                            className={inputCls}
                        >
                            <option value="">Select a lab…</option>
                            {partners.map((p) => (
                                <option key={p._id} value={p._id}>
                                    {p.displayName || p.name} {p.location ? `— ${p.location}` : ""}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Appliance type" required error={errors.applianceType}>
                        <select
                            value={form.applianceType}
                            onChange={setField("applianceType")}
                            className={inputCls}
                        >
                            <option value="">Select…</option>
                            {APPLIANCE_TYPES.map((a) => (
                                <option key={a.value} value={a.value}>{a.label}</option>
                            ))}
                        </select>
                    </Field>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Patient ID">
                        <input
                            type="text"
                            value={form.patientId}
                            onChange={setField("patientId")}
                            placeholder="Patient ObjectId (optional)"
                            className={inputCls}
                        />
                    </Field>
                    <Field label="Patient display name">
                        <input
                            type="text"
                            value={form.patientName}
                            onChange={setField("patientName")}
                            placeholder="e.g. John Smith"
                            className={inputCls}
                        />
                    </Field>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Expected delivery">
                        <input
                            type="date"
                            value={form.expectedDelivery}
                            onChange={setField("expectedDelivery")}
                            className={inputCls}
                        />
                    </Field>
                    <Field label="Estimated cost" error={errors.cost}>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.cost}
                            onChange={setField("cost")}
                            placeholder="e.g. 450.00"
                            className={inputCls}
                        />
                    </Field>
                </div>
            </section>

            <section className="bg-card rounded-card shadow-card p-6 space-y-4">
                <h3 className="text-sm font-semibold text-text-primary">Prescription & notes</h3>
                <Field label="Prescription / Rx details">
                    <textarea
                        value={form.prescription}
                        onChange={setField("prescription")}
                        rows={4}
                        placeholder="Material, shade, clasps, thickness…"
                        className={`${inputCls} resize-none`}
                    />
                </Field>
                <Field label="Notes for the lab">
                    <textarea
                        value={form.notes}
                        onChange={setField("notes")}
                        rows={3}
                        placeholder="Special instructions, patient preferences…"
                        className={`${inputCls} resize-none`}
                    />
                </Field>
            </section>

            {mode === "edit" && (
                <section className="bg-card rounded-card shadow-card p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-text-primary">Shipping</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Tracking number">
                            <input
                                type="text"
                                value={form.trackingNumber}
                                onChange={setField("trackingNumber")}
                                placeholder="e.g. 1Z-…"
                                className={inputCls}
                            />
                        </Field>
                        <Field label="Carrier">
                            <input
                                type="text"
                                value={form.trackingCarrier}
                                onChange={setField("trackingCarrier")}
                                placeholder="DHL, FedEx, Aramex…"
                                className={inputCls}
                            />
                        </Field>
                    </div>
                </section>
            )}

            {apiError && (
                <div className="bg-danger-bg border border-danger/30 text-danger text-sm rounded-btn px-4 py-3">
                    {apiError}
                </div>
            )}

            <div className="flex items-center justify-end gap-2">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium bg-surface-low text-text-secondary rounded-btn hover:bg-surface-high transition-colors"
                    >
                        Cancel
                    </button>
                )}
                <button
                    type="submit"
                    disabled={pending}
                    className="px-5 py-2 text-sm font-semibold text-white bg-brand-clinical rounded-btn hover:bg-brand-clinical-hover transition-colors disabled:opacity-50"
                >
                    {pending ? "Saving…" : (submitLabel || (mode === "create" ? "Create case" : "Save changes"))}
                </button>
            </div>
        </form>
    );
}

const inputCls =
    "w-full rounded-btn border border-border bg-surface-lowest px-3 py-2 text-sm text-text-primary placeholder:text-text-subtle focus:border-brand-clinical focus:outline-none focus:ring-2 focus:ring-brand-clinical/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

function Field({ label, error, required, children }) {
    return (
        <label className="block">
            <span className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
                {label} {required && <span className="text-danger">*</span>}
            </span>
            {children}
            {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
        </label>
    );
}
