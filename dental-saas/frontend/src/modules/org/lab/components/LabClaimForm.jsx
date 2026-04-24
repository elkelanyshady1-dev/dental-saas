/**
 * LabClaimForm — controlled form for create lab claim.
 *
 * Required: caseId, labId, cost.
 * Optional: caseCode, labName, applianceType, serviceDate, notes.
 *
 * When mounted from LabCaseDetail, pass `initialValues` with case+lab
 * already populated; the fields will be pre-filled.
 */

import { useState } from "react";

const empty = {
    caseId: "",
    caseCode: "",
    labId: "",
    labName: "",
    applianceType: "",
    cost: "",
    serviceDate: "",
    notes: "",
};

export default function LabClaimForm({
    initialValues,
    onSubmit,
    onCancel,
    submitLabel = "Create claim",
    pending = false,
    apiError = null,
    lockCaseFields = false,
}) {
    const [form, setForm] = useState(() => ({
        ...empty,
        ...(initialValues || {}),
        cost: initialValues?.cost ?? "",
        serviceDate: initialValues?.serviceDate
            ? String(initialValues.serviceDate).slice(0, 10)
            : new Date().toISOString().slice(0, 10),
    }));
    const [errors, setErrors] = useState({});

    const setField = (field) => (e) => {
        const value = e?.target?.value ?? e;
        setForm((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) setErrors((p) => ({ ...p, [field]: undefined }));
    };

    const validate = () => {
        const e = {};
        if (!form.caseId.trim()) e.caseId = "Case ID is required";
        if (!form.labId.trim())  e.labId  = "Lab ID is required";
        const n = Number(form.cost);
        if (!Number.isFinite(n) || n < 0) e.cost = "Cost must be a non-negative number";
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!validate()) return;
        onSubmit({
            caseId:        form.caseId,
            caseCode:      form.caseCode || undefined,
            labId:         form.labId,
            labName:       form.labName || undefined,
            applianceType: form.applianceType || undefined,
            cost:          Number(form.cost),
            serviceDate:   form.serviceDate
                ? new Date(form.serviceDate).toISOString()
                : undefined,
            notes:         form.notes.trim() || undefined,
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <section className="bg-card rounded-card shadow-card p-6 space-y-4">
                <h3 className="text-sm font-semibold text-text-primary">Claim details</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Case ID" required error={errors.caseId}>
                        <input
                            type="text"
                            value={form.caseId}
                            onChange={setField("caseId")}
                            disabled={lockCaseFields}
                            placeholder="Case ObjectId"
                            className={inputCls}
                        />
                    </Field>
                    <Field label="Case code">
                        <input
                            type="text"
                            value={form.caseCode}
                            onChange={setField("caseCode")}
                            disabled={lockCaseFields}
                            placeholder="ORD-XXXXXX"
                            className={inputCls}
                        />
                    </Field>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Lab ID" required error={errors.labId}>
                        <input
                            type="text"
                            value={form.labId}
                            onChange={setField("labId")}
                            disabled={lockCaseFields}
                            className={inputCls}
                        />
                    </Field>
                    <Field label="Lab name">
                        <input
                            type="text"
                            value={form.labName}
                            onChange={setField("labName")}
                            disabled={lockCaseFields}
                            className={inputCls}
                        />
                    </Field>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label="Appliance type">
                        <input
                            type="text"
                            value={form.applianceType}
                            onChange={setField("applianceType")}
                            disabled={lockCaseFields}
                            className={inputCls}
                        />
                    </Field>
                    <Field label="Service date">
                        <input
                            type="date"
                            value={form.serviceDate}
                            onChange={setField("serviceDate")}
                            className={inputCls}
                        />
                    </Field>
                    <Field label="Cost" required error={errors.cost}>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.cost}
                            onChange={setField("cost")}
                            placeholder="0.00"
                            className={inputCls}
                        />
                    </Field>
                </div>

                <Field label="Notes">
                    <textarea
                        value={form.notes}
                        onChange={setField("notes")}
                        rows={3}
                        className={`${inputCls} resize-none`}
                    />
                </Field>
            </section>

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
                    {pending ? "Saving…" : submitLabel}
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
