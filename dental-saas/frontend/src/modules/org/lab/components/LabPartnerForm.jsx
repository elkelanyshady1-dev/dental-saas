/**
 * LabPartnerForm — controlled form for create/edit lab partner.
 *
 * Submits the plain object { name, location, specialties[], turnaroundDays,
 * contact: { phone, email, website }, status, avatar, notes } via `onSubmit`.
 */

import { useState } from "react";

const SPECIALTIES = [
    { value: "aligners",  label: "Aligners" },
    { value: "retainers", label: "Retainers" },
    { value: "functional",label: "Functional Appliances" },
    { value: "fixed",     label: "Fixed Prosthetics" },
    { value: "splints",   label: "Splints" },
];

const STATUS_OPTIONS = [
    { value: "active",      label: "Active" },
    { value: "inactive",    label: "Inactive" },
    { value: "maintenance", label: "Maintenance" },
];

const empty = {
    name: "",
    location: "",
    specialties: [],
    turnaroundDays: "",
    contact: { phone: "", email: "", website: "" },
    status: "active",
    avatar: "",
    notes: "",
};

export default function LabPartnerForm({
    initialValues,
    onSubmit,
    onCancel,
    submitLabel = "Save",
    pending = false,
    apiError = null,
}) {
    const [form, setForm] = useState(() => ({
        ...empty,
        ...(initialValues || {}),
        contact: { ...empty.contact, ...(initialValues?.contact || {}) },
        turnaroundDays: initialValues?.turnaroundDays ?? "",
    }));
    const [errors, setErrors] = useState({});

    const setField = (field) => (e) => {
        const value = e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value ?? e;
        setForm((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) setErrors((p) => ({ ...p, [field]: undefined }));
    };

    const setContact = (field) => (e) => {
        const value = e?.target?.value ?? e;
        setForm((prev) => ({ ...prev, contact: { ...prev.contact, [field]: value } }));
    };

    const toggleSpecialty = (value) => {
        setForm((prev) => ({
            ...prev,
            specialties: prev.specialties.includes(value)
                ? prev.specialties.filter((s) => s !== value)
                : [...prev.specialties, value],
        }));
    };

    const validate = () => {
        const e = {};
        if (!form.name.trim()) e.name = "Name is required";
        if (form.turnaroundDays !== "" && form.turnaroundDays !== null) {
            const n = Number(form.turnaroundDays);
            if (!Number.isFinite(n) || n < 0) e.turnaroundDays = "Must be a non-negative number";
        }
        if (form.contact.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.contact.email)) {
            e.email = "Invalid email";
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!validate()) return;
        const payload = {
            name: form.name.trim(),
            location: form.location.trim() || undefined,
            specialties: form.specialties,
            turnaroundDays:
                form.turnaroundDays === "" || form.turnaroundDays === null
                    ? undefined
                    : Number(form.turnaroundDays),
            contact: {
                phone:   form.contact.phone.trim()   || undefined,
                email:   form.contact.email.trim()   || undefined,
                website: form.contact.website.trim() || undefined,
            },
            status: form.status,
            avatar: form.avatar.trim() || undefined,
            notes:  form.notes.trim()  || undefined,
        };
        onSubmit(payload);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basics */}
            <section className="bg-card rounded-card shadow-card p-6 space-y-4">
                <h3 className="text-sm font-semibold text-text-primary">Basics</h3>

                <Field label="Lab name" error={errors.name} required>
                    <input
                        type="text"
                        value={form.name}
                        onChange={setField("name")}
                        placeholder="e.g. Orthoclear Dubai"
                        className={inputCls}
                    />
                </Field>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Location">
                        <input
                            type="text"
                            value={form.location}
                            onChange={setField("location")}
                            placeholder="City, country"
                            className={inputCls}
                        />
                    </Field>
                    <Field label="Turnaround (days)" error={errors.turnaroundDays}>
                        <input
                            type="number"
                            min="0"
                            value={form.turnaroundDays}
                            onChange={setField("turnaroundDays")}
                            placeholder="e.g. 7"
                            className={inputCls}
                        />
                    </Field>
                </div>

                <Field label="Status">
                    <select
                        value={form.status}
                        onChange={setField("status")}
                        className={inputCls}
                    >
                        {STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </Field>
            </section>

            {/* Specialties */}
            <section className="bg-card rounded-card shadow-card p-6">
                <h3 className="text-sm font-semibold text-text-primary mb-3">Specialties</h3>
                <div className="flex flex-wrap gap-2">
                    {SPECIALTIES.map((s) => {
                        const on = form.specialties.includes(s.value);
                        return (
                            <button
                                type="button"
                                key={s.value}
                                onClick={() => toggleSpecialty(s.value)}
                                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                                    on
                                        ? "bg-brand-clinical text-white border-brand-clinical"
                                        : "bg-surface-low border-border text-text-secondary hover:border-brand-clinical"
                                }`}
                            >
                                {s.label}
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* Contact */}
            <section className="bg-card rounded-card shadow-card p-6 space-y-4">
                <h3 className="text-sm font-semibold text-text-primary">Contact</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Phone">
                        <input
                            type="tel"
                            value={form.contact.phone}
                            onChange={setContact("phone")}
                            placeholder="+971 55 …"
                            className={inputCls}
                        />
                    </Field>
                    <Field label="Email" error={errors.email}>
                        <input
                            type="email"
                            value={form.contact.email}
                            onChange={setContact("email")}
                            placeholder="orders@lab.com"
                            className={inputCls}
                        />
                    </Field>
                </div>
                <Field label="Website">
                    <input
                        type="url"
                        value={form.contact.website}
                        onChange={setContact("website")}
                        placeholder="https://lab.com"
                        className={inputCls}
                    />
                </Field>
            </section>

            {/* Notes */}
            <section className="bg-card rounded-card shadow-card p-6 space-y-4">
                <h3 className="text-sm font-semibold text-text-primary">Internal notes</h3>
                <textarea
                    value={form.notes}
                    onChange={setField("notes")}
                    rows={4}
                    placeholder="Pricing, SLAs, contacts, preferences…"
                    className={`${inputCls} resize-none`}
                />
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
    "w-full rounded-btn border border-border bg-surface-lowest px-3 py-2 text-sm text-text-primary placeholder:text-text-subtle focus:border-brand-clinical focus:outline-none focus:ring-2 focus:ring-brand-clinical/20 transition-colors";

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
