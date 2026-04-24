/**
 * ClinicBillingSettingsPage.jsx — Clinic Billing Configuration (Plan D3)
 *
 * Per-org singleton configuration governing PATIENT invoicing:
 *   - Default currency + supported currencies
 *   - Tax rates (VAT/GST, multiple rates supported)
 *   - Invoice numbering scheme (prefix / padding / reset cadence)
 *   - Invoice template (clinic name, footer, payment terms, tax breakdown)
 *   - Enabled payment methods
 *   - Discount policy defaults
 *
 * NOT the SaaS subscription — that page lives at BillingPage.jsx.
 *
 * Version-guarded PATCH: every save includes `expectedVersion`. On 409 the
 * hook invalidates the cache and re-reads, so the form auto-reseeds with the
 * latest version and the user can retry.
 *
 * PLANE: Org only. Permission: billing_settings.read / billing_settings.write.
 *
 * @module modules/org/settings/pages/ClinicBillingSettingsPage
 */

import { useState, useMemo } from "react";
import {
    CurrencyDollarIcon,
    ReceiptPercentIcon,
    HashtagIcon,
    DocumentTextIcon,
    CreditCardIcon,
    TagIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    PlusIcon,
    TrashIcon,
} from "@heroicons/react/24/outline";

import SettingsBreadcrumb from "@/components/settings/SettingsBreadcrumb";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import {
    useClinicBillingSettings,
    usePatchClinicBillingSettings,
} from "../hooks/useClinicBillingSettings";

// Mirrors backend `SUPPORTED_CURRENCIES` in BillingSettings.model.js
const CURRENCY_OPTIONS = ["AED", "USD", "EUR", "GBP", "SAR", "EGP", "KWD", "QAR", "BHD", "OMR", "JOD", "INR"];
const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "insurance", "wallet"];
const RESET_CADENCES = ["never", "yearly", "monthly"];

// ── Section wrapper ──────────────────────────────────────────────────────────
// IconCmp is used in JSX below — linter false-positive on aliased destructured
// JSX components (same gap fires on ScanViewer3D.jsx:192).
// eslint-disable-next-line no-unused-vars
function Section({ icon: IconCmp, title, description, children }) {
    return (
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <IconCmp className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-gray-800">{title}</h3>
                    {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
                </div>
            </div>
            <div className="p-6 space-y-4">{children}</div>
        </div>
    );
}

function Field({ label, hint, children }) {
    return (
        <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">{label}</label>
            {children}
            {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
        </div>
    );
}

// ═════════════════════════════════════════════════════════════════════════════
export default function ClinicBillingSettingsPage() {
    const canRead  = useCapability(P.BILLING_SETTINGS_READ);
    const canWrite = useCapability(P.BILLING_SETTINGS_WRITE);

    const { data: settings, isLoading, isError, error } = useClinicBillingSettings();
    const patch = usePatchClinicBillingSettings();

    // ── Form state (derived from server via render-phase reset) ──────────
    // React docs pattern for "reseed from props": store the source version and
    // reset during render when it changes. Avoids an extra effect cycle.
    const [form, setForm] = useState(null);
    const [seededVersion, setSeededVersion] = useState(null);
    const [banner, setBanner] = useState(null);

    if (settings && settings.version !== seededVersion) {
        setSeededVersion(settings.version ?? 0);
        setForm(cloneForm(settings));
    }

    const dirty = useMemo(() => {
        if (!form || !settings) return false;
        return JSON.stringify(cloneForm(settings)) !== JSON.stringify(form);
    }, [form, settings]);

    // ── Permission + loading gates ───────────────────────────────────────
    if (!canRead) {
        return (
            <div className="p-8">
                <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
                    <p className="text-sm text-red-600 font-medium">
                        You don't have permission to view clinic billing settings.
                    </p>
                </div>
            </div>
        );
    }

    if (isLoading || !form) {
        return (
            <div className="p-8 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    if (isError) {
        return (
            <div className="p-8">
                <div className="rounded-2xl bg-red-50 border border-red-200 p-6">
                    <p className="text-sm text-red-600 font-semibold">Failed to load billing settings.</p>
                    <p className="text-xs text-red-500 mt-1">{error?.message || "Unknown error."}</p>
                </div>
            </div>
        );
    }

    // ── Submit ───────────────────────────────────────────────────────────
    const handleSave = async () => {
        setBanner(null);
        const payload = buildPatchPayload(settings, form);
        if (!payload) {
            setBanner({ type: "error", text: "Nothing to save." });
            return;
        }
        payload.expectedVersion = settings.version ?? 0;

        try {
            await patch.mutateAsync(payload);
            setBanner({ type: "success", text: "Billing settings saved." });
        } catch (err) {
            const code = err?.response?.data?.error?.code;
            if (code === "VERSION_CONFLICT") {
                setBanner({
                    type: "conflict",
                    text: "These settings were updated elsewhere — we reloaded the latest version. Please review and retry.",
                });
                return;
            }
            if (code === "VALIDATION_ERROR") {
                const details = err?.response?.data?.error?.details;
                const first = Array.isArray(details) && details[0]?.message;
                setBanner({ type: "error", text: first || "Invalid configuration." });
                return;
            }
            setBanner({ type: "error", text: err?.response?.data?.error?.message || "Failed to save." });
        }
    };

    // ── Render ───────────────────────────────────────────────────────────
    return (
        <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
            <SettingsBreadcrumb current="Clinic Billing Settings" />

            <header className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Clinic Billing Settings</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Configure patient invoicing: currencies, tax rates, numbering, invoice template, and payment methods.
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">
                        Version {settings.version ?? 0}
                    </p>
                </div>
            </header>

            {banner && (
                <div
                    className={`rounded-xl px-4 py-3 text-sm flex items-start gap-2 border ${
                        banner.type === "success"
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : banner.type === "conflict"
                                ? "bg-amber-50 border-amber-200 text-amber-700"
                                : "bg-red-50 border-red-200 text-red-600"
                    }`}
                >
                    {banner.type === "success" ? (
                        <CheckCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    ) : (
                        <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    )}
                    <span>{banner.text}</span>
                </div>
            )}

            {/* ── Currencies ───────────────────────────────────────────────── */}
            <Section
                icon={CurrencyDollarIcon}
                title="Currencies"
                description="Default currency appears on new invoices. Supported currencies may be used per-invoice."
            >
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Default Currency">
                        <select
                            value={form.defaultCurrency}
                            disabled={!canWrite}
                            onChange={(e) => setForm((f) => ({ ...f, defaultCurrency: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
                        >
                            {CURRENCY_OPTIONS.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </Field>
                </div>
                <Field label="Supported Currencies" hint="Multi-currency billing — default must be included.">
                    <div className="flex flex-wrap gap-2">
                        {CURRENCY_OPTIONS.map((c) => {
                            const selected = form.supportedCurrencies.includes(c);
                            const isDefault = form.defaultCurrency === c;
                            return (
                                <button
                                    key={c}
                                    type="button"
                                    disabled={!canWrite || isDefault}
                                    onClick={() => setForm((f) => toggleCurrency(f, c))}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                                        selected
                                            ? "bg-blue-600 border-blue-600 text-white"
                                            : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                                    } ${isDefault ? "opacity-60" : ""}`}
                                >
                                    {c}{isDefault && " ★"}
                                </button>
                            );
                        })}
                    </div>
                </Field>
            </Section>

            {/* ── Tax Rates ────────────────────────────────────────────────── */}
            <Section
                icon={ReceiptPercentIcon}
                title="Tax Rates"
                description="Define VAT/GST rates. At most one rate can be marked as default."
            >
                <div className="space-y-2">
                    {form.taxRates.map((rate, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <input
                                type="text"
                                placeholder="Code (e.g. VAT_5)"
                                value={rate.code}
                                disabled={!canWrite}
                                onChange={(e) => setForm((f) => updateTaxRate(f, i, { code: e.target.value }))}
                                className="w-36 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
                            />
                            <input
                                type="text"
                                placeholder="Label"
                                value={rate.label}
                                disabled={!canWrite}
                                onChange={(e) => setForm((f) => updateTaxRate(f, i, { label: e.target.value }))}
                                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
                            />
                            <div className="relative w-28">
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="100"
                                    value={rate.percent}
                                    disabled={!canWrite}
                                    onChange={(e) => setForm((f) => updateTaxRate(f, i, { percent: parseFloat(e.target.value) || 0 }))}
                                    className="w-full pl-3 pr-7 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                            </div>
                            <label className="flex items-center gap-1.5 text-xs text-gray-600 px-2">
                                <input
                                    type="radio"
                                    name="defaultTaxRate"
                                    checked={rate.isDefault}
                                    disabled={!canWrite}
                                    onChange={() => setForm((f) => setDefaultTaxRate(f, i))}
                                />
                                Default
                            </label>
                            <button
                                type="button"
                                disabled={!canWrite}
                                onClick={() => setForm((f) => ({ ...f, taxRates: f.taxRates.filter((_, j) => j !== i) }))}
                                className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-40"
                            >
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                    {canWrite && (
                        <button
                            type="button"
                            onClick={() => setForm((f) => ({
                                ...f,
                                taxRates: [...f.taxRates, { code: "", label: "", percent: 0, isDefault: f.taxRates.length === 0 }],
                            }))}
                            className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition pt-1"
                        >
                            <PlusIcon className="w-3.5 h-3.5" /> Add tax rate
                        </button>
                    )}
                </div>
            </Section>

            {/* ── Numbering Scheme ─────────────────────────────────────────── */}
            <Section
                icon={HashtagIcon}
                title="Invoice Numbering"
                description="Prefix + zero-padded sequence. `nextSequence` is managed by the server."
            >
                <div className="grid grid-cols-3 gap-4">
                    <Field label="Prefix">
                        <input
                            type="text"
                            maxLength={10}
                            value={form.numberingScheme.prefix}
                            disabled={!canWrite}
                            onChange={(e) => setForm((f) => ({ ...f, numberingScheme: { ...f.numberingScheme, prefix: e.target.value } }))}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
                        />
                    </Field>
                    <Field label="Padding" hint="1–10 digits">
                        <input
                            type="number"
                            min={1}
                            max={10}
                            value={form.numberingScheme.padding}
                            disabled={!canWrite}
                            onChange={(e) => setForm((f) => ({ ...f, numberingScheme: { ...f.numberingScheme, padding: parseInt(e.target.value, 10) || 1 } }))}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
                        />
                    </Field>
                    <Field label="Reset Cadence">
                        <select
                            value={form.numberingScheme.resetCadence}
                            disabled={!canWrite}
                            onChange={(e) => setForm((f) => ({ ...f, numberingScheme: { ...f.numberingScheme, resetCadence: e.target.value } }))}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
                        >
                            {RESET_CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </Field>
                </div>
                <p className="text-[11px] text-gray-400">
                    Preview: <span className="font-mono text-gray-600">{previewNumber(form.numberingScheme)}</span>
                </p>
            </Section>

            {/* ── Invoice Template ─────────────────────────────────────────── */}
            <Section icon={DocumentTextIcon} title="Invoice Template" description="Fields printed on patient invoices.">
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Clinic Name">
                        <input
                            type="text"
                            value={form.invoiceTemplate.clinicName || ""}
                            disabled={!canWrite}
                            onChange={(e) => setForm((f) => ({ ...f, invoiceTemplate: { ...f.invoiceTemplate, clinicName: e.target.value } }))}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
                        />
                    </Field>
                    <Field label="Payment Terms">
                        <input
                            type="text"
                            value={form.invoiceTemplate.paymentTerms || ""}
                            disabled={!canWrite}
                            placeholder="Net 30, due on receipt, ..."
                            onChange={(e) => setForm((f) => ({ ...f, invoiceTemplate: { ...f.invoiceTemplate, paymentTerms: e.target.value } }))}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
                        />
                    </Field>
                </div>
                <Field label="Footer">
                    <textarea
                        rows={3}
                        value={form.invoiceTemplate.footerText || ""}
                        disabled={!canWrite}
                        onChange={(e) => setForm((f) => ({ ...f, invoiceTemplate: { ...f.invoiceTemplate, footerText: e.target.value } }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none disabled:bg-gray-50"
                    />
                </Field>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                        type="checkbox"
                        checked={!!form.invoiceTemplate.showTaxBreakdown}
                        disabled={!canWrite}
                        onChange={(e) => setForm((f) => ({ ...f, invoiceTemplate: { ...f.invoiceTemplate, showTaxBreakdown: e.target.checked } }))}
                    />
                    Show tax breakdown on printed invoice
                </label>
            </Section>

            {/* ── Payment Methods ──────────────────────────────────────────── */}
            <Section icon={CreditCardIcon} title="Payment Methods" description="Accepted methods when recording patient payments.">
                <div className="flex flex-wrap gap-2">
                    {PAYMENT_METHODS.map((m) => {
                        const selected = form.paymentMethods.includes(m);
                        return (
                            <button
                                key={m}
                                type="button"
                                disabled={!canWrite}
                                onClick={() => setForm((f) => togglePaymentMethod(f, m))}
                                className={`px-3 py-2 rounded-lg text-xs font-semibold border transition capitalize ${
                                    selected
                                        ? "bg-blue-600 border-blue-600 text-white"
                                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                                }`}
                            >
                                {m.replace("_", " ")}
                            </button>
                        );
                    })}
                </div>
            </Section>

            {/* ── Discount Policy ──────────────────────────────────────────── */}
            <Section icon={TagIcon} title="Discount Policy" description="Default limits for patient invoices and line items.">
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Max Discount %" hint="0–100">
                        <input
                            type="number"
                            min={0}
                            max={100}
                            value={form.discountPolicy.maxDiscountPercent ?? 0}
                            disabled={!canWrite}
                            onChange={(e) => setForm((f) => ({ ...f, discountPolicy: { ...f.discountPolicy, maxDiscountPercent: parseFloat(e.target.value) || 0 } }))}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
                        />
                    </Field>
                    <Field label="Require Reason Above %" hint="0 disables requirement">
                        <input
                            type="number"
                            min={0}
                            max={100}
                            value={form.discountPolicy.requireReasonAbovePercent ?? 0}
                            disabled={!canWrite}
                            onChange={(e) => setForm((f) => ({ ...f, discountPolicy: { ...f.discountPolicy, requireReasonAbovePercent: parseFloat(e.target.value) || 0 } }))}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
                        />
                    </Field>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                        type="checkbox"
                        checked={!!form.discountPolicy.allowLineItemDiscounts}
                        disabled={!canWrite}
                        onChange={(e) => setForm((f) => ({ ...f, discountPolicy: { ...f.discountPolicy, allowLineItemDiscounts: e.target.checked } }))}
                    />
                    Allow per-line-item discounts
                </label>
            </Section>

            {/* ── Save bar ─────────────────────────────────────────────────── */}
            {canWrite && (
                <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-gray-200 -mx-6 lg:-mx-8 px-6 lg:px-8 py-4 flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                        {dirty ? "You have unsaved changes." : "All changes saved."}
                    </p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            disabled={!dirty || patch.isPending}
                            onClick={() => setForm(cloneForm(settings))}
                            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition disabled:opacity-40"
                        >
                            Discard
                        </button>
                        <button
                            type="button"
                            disabled={!dirty || patch.isPending}
                            onClick={handleSave}
                            className="px-5 py-2.5 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition disabled:opacity-40 flex items-center gap-2"
                        >
                            {patch.isPending && (
                                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            )}
                            {patch.isPending ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════════

function cloneForm(settings) {
    return {
        defaultCurrency: settings.defaultCurrency || "AED",
        supportedCurrencies: Array.isArray(settings.supportedCurrencies) ? [...settings.supportedCurrencies] : ["AED"],
        taxRates: Array.isArray(settings.taxRates)
            ? settings.taxRates.map((r) => ({
                code: r.code || "",
                label: r.label || "",
                percent: r.percent ?? 0,
                isDefault: !!r.isDefault,
            }))
            : [],
        numberingScheme: {
            prefix: settings.numberingScheme?.prefix || "INV",
            padding: settings.numberingScheme?.padding ?? 6,
            resetCadence: settings.numberingScheme?.resetCadence || "yearly",
        },
        invoiceTemplate: {
            clinicName: settings.invoiceTemplate?.clinicName || "",
            footerText: settings.invoiceTemplate?.footerText || "",
            paymentTerms: settings.invoiceTemplate?.paymentTerms || "",
            showTaxBreakdown: !!settings.invoiceTemplate?.showTaxBreakdown,
        },
        paymentMethods: Array.isArray(settings.paymentMethods) ? [...settings.paymentMethods] : [],
        discountPolicy: {
            maxDiscountPercent: settings.discountPolicy?.maxDiscountPercent ?? 0,
            requireReasonAbovePercent: settings.discountPolicy?.requireReasonAbovePercent ?? 0,
            allowLineItemDiscounts: !!settings.discountPolicy?.allowLineItemDiscounts,
        },
    };
}

function toggleCurrency(f, code) {
    const has = f.supportedCurrencies.includes(code);
    // Cannot remove the default currency
    if (has && f.defaultCurrency === code) return f;
    return {
        ...f,
        supportedCurrencies: has
            ? f.supportedCurrencies.filter((c) => c !== code)
            : [...f.supportedCurrencies, code],
    };
}

function togglePaymentMethod(f, method) {
    const has = f.paymentMethods.includes(method);
    return {
        ...f,
        paymentMethods: has ? f.paymentMethods.filter((m) => m !== method) : [...f.paymentMethods, method],
    };
}

function updateTaxRate(f, index, patch) {
    return {
        ...f,
        taxRates: f.taxRates.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    };
}

function setDefaultTaxRate(f, index) {
    return {
        ...f,
        taxRates: f.taxRates.map((r, i) => ({ ...r, isDefault: i === index })),
    };
}

function previewNumber(scheme) {
    const pad = String(1).padStart(scheme.padding || 6, "0");
    return `${scheme.prefix || "INV"}-${pad}`;
}

/**
 * Diff the current form against the loaded settings and emit only changed
 * top-level keys. The backend validator rejects empty patches, so we must
 * avoid sending unchanged keys that would bloat the audit trail.
 */
function buildPatchPayload(settings, form) {
    const out = {};
    const server = cloneForm(settings);
    const keys = [
        "defaultCurrency",
        "supportedCurrencies",
        "taxRates",
        "numberingScheme",
        "invoiceTemplate",
        "paymentMethods",
        "discountPolicy",
    ];
    for (const k of keys) {
        if (JSON.stringify(server[k]) !== JSON.stringify(form[k])) {
            out[k] = form[k];
        }
    }
    return Object.keys(out).length ? out : null;
}
