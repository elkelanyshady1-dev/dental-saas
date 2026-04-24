/**
 * CreateInvoiceModal.jsx — Premium Invoice Creation Experience
 *
 * Full-screen overlay with two-column layout:
 *   LEFT:  Patient + Branch header, Treatment line items table, Clinical notes
 *   RIGHT: Sticky financial summary panel (discount %, tax %, insurance, totals)
 *
 * Design references: DentaFlow Premium invoice modal + patient payment portal.
 *
 * Uses useCreateInvoice mutation (React Query).
 * PLANE: Org only.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { useOrgCurrency } from "@/modules/org/hooks/useOrgCurrency";
import { useBranches } from "@/modules/org/staff/hooks/useBranches";
import { useCreateInvoice } from "../hooks/useInvoices";
import { patientsApi } from "@/modules/org/patients/api/patients.api";
import { toast } from "sonner";

// ── Helpers ──────────────────────────────────────────────────────────────────
const emptyItem = () => ({ description: "", unitPrice: "", quantity: 1 });
const fmt = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Patient Search Sub-Component ─────────────────────────────────────────────
function PatientSearch({ onSelect, selectedPatient, onClear }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (query.length < 2) { setResults([]); setOpen(false); return; }
        const timeout = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await patientsApi.search({ q: query });
                setResults(res.data?.data || []);
                setOpen(true);
            } finally { setLoading(false); }
        }, 300);
        return () => clearTimeout(timeout);
    }, [query]);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    if (selectedPatient) {
        return (
            <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-xl px-5 py-4">
                <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-black text-base flex-shrink-0">
                    {selectedPatient.name?.[0]?.toUpperCase() || "P"}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{selectedPatient.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{selectedPatient.phone || `ID: ${selectedPatient.id?.slice(-8)}`}</p>
                </div>
                <button type="button" onClick={onClear}
                    className="text-xs font-bold text-red-500 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition">
                    Change
                </button>
            </div>
        );
    }

    return (
        <div className="relative" ref={ref}>
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg select-none">&#128269;</span>
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search patient by name, phone, or code..."
                className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
                autoFocus
            />
            {loading && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
            )}
            {open && results.length > 0 && (
                <div className="absolute z-20 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto">
                    {results.map((p) => {
                        const name = `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.nameEnglish || p.displayName || "Patient";
                        return (
                            <button key={p._id} type="button"
                                onClick={() => { onSelect({ id: p._id, name, phone: p.phone || p.email || "" }); setQuery(""); setOpen(false); }}
                                className="w-full text-left px-4 py-3 hover:bg-blue-50 transition flex items-center gap-3 border-b border-slate-50 last:border-0">
                                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs flex-shrink-0">
                                    {name[0]?.toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-800 truncate">{name}</p>
                                    <p className="text-xs text-slate-400">{p.phone || p.email || ""}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
            {open && results.length === 0 && query.length >= 2 && !loading && (
                <div className="absolute z-20 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-xl p-5 text-center text-sm text-slate-400">
                    No patients found for "{query}"
                </div>
            )}
        </div>
    );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function CreateInvoiceModal({ onClose, preselectedPatientId }) {
    const canCreate = useCapability(P.INVOICES_CREATE);
    const currency = useOrgCurrency();
    const { data: branches = [] } = useBranches();
    const createInvoice = useCreateInvoice();

    // ── State ────────────────────────────────────────────────────────────────
    const [patient, setPatient] = useState(
        preselectedPatientId ? { id: preselectedPatientId, name: "", phone: "" } : null
    );

    // Fetch full patient details when preselectedPatientId is provided
    useEffect(() => {
        if (!preselectedPatientId) return;
        let cancelled = false;
        patientsApi.get(preselectedPatientId).then((res) => {
            if (cancelled) return;
            const p = res.data?.data || res.data;
            if (!p) return;
            const name = `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.nameEnglish || p.displayName || "Patient";
            setPatient({ id: preselectedPatientId, name, phone: p.phone || p.email || "" });
        }).catch(() => { /* keep the ID-only fallback */ });
        return () => { cancelled = true; };
    }, [preselectedPatientId]);
    const [branchId, setBranchId] = useState("");
    const [items, setItems] = useState([emptyItem()]);
    const [discountPercent, setDiscountPercent] = useState("");
    const [discountAmount, setDiscountAmount] = useState("");
    const [discountMode, setDiscountMode] = useState("percent"); // which field drives
    const [taxPercent, setTaxPercent] = useState("");
    const [taxAmount, setTaxAmount] = useState("");
    const [taxMode, setTaxMode] = useState("percent");
    const [insurancePercent, setInsurancePercent] = useState("");
    const [insuranceAmount, setInsuranceAmount] = useState("");
    const [insuranceMode, setInsuranceMode] = useState("percent");
    const [notes, setNotes] = useState("");
    const [error, setError] = useState(null);

    // Auto-select first branch
    useEffect(() => {
        if (branches.length === 1 && !branchId) setBranchId(branches[0]._id);
    }, [branches, branchId]);

    // ── Line items ───────────────────────────────────────────────────────────
    const updateItem = (index, field, value) => {
        setItems((prev) => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
    };
    const addItem = () => setItems((prev) => [...prev, emptyItem()]);
    const removeItem = (index) => { if (items.length > 1) setItems((prev) => prev.filter((_, i) => i !== index)); };

    // ── Financial calculations ───────────────────────────────────────────────
    const subtotal = useMemo(() =>
        items.reduce((sum, item) => sum + (parseFloat(item.unitPrice) || 0) * (parseInt(item.quantity, 10) || 0), 0),
        [items]
    );

    // Discount: sync % <-> amount
    const discountVal = useMemo(() => {
        if (discountMode === "percent") {
            const pct = parseFloat(discountPercent) || 0;
            return Math.min(subtotal, subtotal * pct / 100);
        }
        return Math.min(subtotal, parseFloat(discountAmount) || 0);
    }, [discountMode, discountPercent, discountAmount, subtotal]);

    const afterDiscount = subtotal - discountVal;

    // Tax: sync % <-> amount
    const taxVal = useMemo(() => {
        if (taxMode === "percent") {
            const pct = parseFloat(taxPercent) || 0;
            return afterDiscount * pct / 100;
        }
        return parseFloat(taxAmount) || 0;
    }, [taxMode, taxPercent, taxAmount, afterDiscount]);

    const totalInvoice = afterDiscount + taxVal;

    // Insurance: sync % <-> amount
    const insuranceVal = useMemo(() => {
        if (insuranceMode === "percent") {
            const pct = parseFloat(insurancePercent) || 0;
            return Math.min(totalInvoice, totalInvoice * pct / 100);
        }
        return Math.min(totalInvoice, parseFloat(insuranceAmount) || 0);
    }, [insuranceMode, insurancePercent, insuranceAmount, totalInvoice]);

    const finalDue = Math.max(0, totalInvoice - insuranceVal);

    // ── Submit ───────────────────────────────────────────────────────────────
    const handleSubmit = (e) => {
        e?.preventDefault();
        setError(null);

        if (!patient?.id) { setError("Please select a patient."); return; }
        if (!branchId) { setError("Please select a branch."); return; }

        const validItems = items.filter((item) => item.description && parseFloat(item.unitPrice) > 0);
        if (validItems.length === 0) { setError("Add at least one line item with a description and price."); return; }

        createInvoice.mutate(
            {
                patientId: patient.id,
                branchId,
                treatments: validItems.map((item) => ({
                    procedureName: item.description,
                    unitPrice: parseFloat(item.unitPrice),
                    quantity: parseInt(item.quantity, 10) || 1,
                })),
                discount: discountVal,
                insuranceCovered: insuranceVal,
                tax: taxVal,
                notes: notes.trim() || undefined,
            },
            {
                onSuccess: () => { toast.success("Invoice created successfully"); onClose?.(); },
                onError: (err) => {
                    setError(err.response?.data?.error?.message || err.response?.data?.message || "Failed to create invoice");
                },
            }
        );
    };

    if (!canCreate) return null;

    const selectedBranch = branches.find((b) => b._id === branchId);
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
        + " \u2014 " + now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

    return (
        <>
            {/* Full-screen backdrop */}
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]" onClick={onClose} />

            {/* Full-screen modal */}
            <div className="fixed inset-0 z-[70] flex items-stretch justify-center overflow-hidden animate-fade-in">
                <div className="w-full max-w-[1400px] mx-auto my-4 bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">

                    {/* ═══ Top Bar ═══════════════════════════════════════════════ */}
                    <div className="bg-white px-8 py-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-lg font-black text-slate-900 tracking-tight">New Invoice</h1>
                                <p className="text-xs text-slate-400 font-medium mt-0.5">Create a patient invoice with treatments and financial details</p>
                            </div>
                        </div>
                        <button onClick={onClose}
                            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* ═══ Header Info Bar ═══════════════════════════════════════ */}
                    <div className="bg-white px-8 py-4 border-b border-slate-100 flex-shrink-0">
                        <div className="flex flex-wrap items-center gap-6">
                            {/* Branch */}
                            <div className="space-y-1">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Branch</label>
                                <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
                                    className="bg-slate-50 border-none rounded-lg text-sm font-semibold text-slate-800 pl-3 pr-8 py-2 focus:ring-2 focus:ring-blue-500/20 cursor-pointer">
                                    <option value="">Select branch...</option>
                                    {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
                                </select>
                            </div>
                            {/* Date */}
                            <div className="space-y-1">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Created At</label>
                                <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-lg">
                                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <span className="text-sm font-semibold text-slate-700">{dateStr}</span>
                                </div>
                            </div>
                            {/* Currency badge */}
                            <div className="space-y-1">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Currency</label>
                                <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg text-sm font-bold">{currency}</div>
                            </div>
                        </div>
                    </div>

                    {/* ═══ Two-Column Body ═══════════════════════════════════════ */}
                    <div className="flex-1 overflow-y-auto">
                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 p-6 items-start">

                            {/* ── LEFT COLUMN: Patient + Treatments ──────────── */}
                            <div className="xl:col-span-8 space-y-5">

                                {/* Patient Selection */}
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                                    <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Patient</label>
                                    <PatientSearch
                                        selectedPatient={patient}
                                        onSelect={setPatient}
                                        onClear={() => setPatient(null)}
                                    />
                                </div>

                                {/* Treatment Line Items */}
                                <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                            </svg>
                                            <h3 className="text-base font-bold text-slate-900">Treatment Items</h3>
                                        </div>
                                        <button type="button" onClick={addItem}
                                            className="flex items-center gap-1.5 text-blue-600 font-bold text-sm hover:text-blue-700 transition">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                            </svg>
                                            Add Treatment
                                        </button>
                                    </div>

                                    {/* Table Header */}
                                    <div className="grid grid-cols-12 gap-3 px-6 py-3 bg-slate-50 border-b border-slate-100">
                                        <div className="col-span-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Procedure</div>
                                        <div className="col-span-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Unit Price</div>
                                        <div className="col-span-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Qty</div>
                                        <div className="col-span-1 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total</div>
                                        <div className="col-span-1" />
                                    </div>

                                    {/* Rows */}
                                    <div className="divide-y divide-slate-50">
                                        {items.map((item, index) => {
                                            const lineTotal = (parseFloat(item.unitPrice) || 0) * (parseInt(item.quantity, 10) || 0);
                                            return (
                                                <div key={index} className="grid grid-cols-12 gap-3 px-6 py-3.5 items-center hover:bg-blue-50/30 transition-colors">
                                                    <div className="col-span-5">
                                                        <input type="text" value={item.description}
                                                            onChange={(e) => updateItem(index, "description", e.target.value)}
                                                            placeholder="e.g., Composite Filling, Root Canal..."
                                                            className="w-full bg-transparent border-none p-0 text-sm font-medium text-slate-800 placeholder:text-slate-300 focus:ring-0" />
                                                    </div>
                                                    <div className="col-span-3">
                                                        <div className="relative">
                                                            <input type="number" step="0.01" min="0" value={item.unitPrice}
                                                                onChange={(e) => updateItem(index, "unitPrice", e.target.value)}
                                                                placeholder="0.00"
                                                                className="w-full bg-transparent border-none p-0 text-sm font-semibold text-slate-800 text-right placeholder:text-slate-300 focus:ring-0 pr-1" />
                                                        </div>
                                                    </div>
                                                    <div className="col-span-2 flex justify-center">
                                                        <input type="number" min="1" value={item.quantity}
                                                            onChange={(e) => updateItem(index, "quantity", e.target.value)}
                                                            className="w-14 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-center py-1.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                                                    </div>
                                                    <div className="col-span-1 text-right">
                                                        <span className="text-sm font-bold text-slate-800">{fmt(lineTotal)}</span>
                                                    </div>
                                                    <div className="col-span-1 flex justify-end">
                                                        <button type="button" onClick={() => removeItem(index)}
                                                            disabled={items.length <= 1}
                                                            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-20 disabled:cursor-not-allowed">
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Subtotal footer */}
                                    <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{items.length} item{items.length !== 1 ? "s" : ""}</span>
                                        <span className="text-sm font-black text-slate-800">Subtotal: {fmt(subtotal)} {currency}</span>
                                    </div>
                                </div>

                                {/* Clinical Notes */}
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                                    <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                        Clinical Notes
                                    </h3>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Enter special instructions, clinical observations, or patient notes..."
                                        rows={3}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none transition"
                                    />
                                </div>
                            </div>

                            {/* ── RIGHT COLUMN: Financial Summary (Sticky) ───── */}
                            <div className="xl:col-span-4 space-y-5 xl:sticky xl:top-4">
                                <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100">
                                    <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2.5">
                                        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Financial Details
                                    </h3>

                                    <div className="space-y-4">

                                        {/* Discount (Amber) */}
                                        <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                                            <label className="block text-[10px] font-black text-amber-800 uppercase tracking-widest mb-2">Discount</label>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 flex items-center bg-white rounded-lg px-3 py-2 border border-amber-200 focus-within:ring-2 focus-within:ring-amber-300/30">
                                                    <span className="text-xs font-bold text-amber-600 mr-2">%</span>
                                                    <input type="number" step="0.1" min="0" max="100"
                                                        value={discountPercent}
                                                        onFocus={() => setDiscountMode("percent")}
                                                        onChange={(e) => { setDiscountMode("percent"); setDiscountPercent(e.target.value); }}
                                                        placeholder="0"
                                                        className="w-full border-none p-0 text-sm font-bold text-slate-800 focus:ring-0 placeholder:text-slate-300 bg-transparent" />
                                                </div>
                                                <div className="flex-1 flex items-center bg-white rounded-lg px-3 py-2 border border-amber-200 focus-within:ring-2 focus-within:ring-amber-300/30">
                                                    <span className="text-[10px] font-bold text-amber-600 mr-1.5">{currency}</span>
                                                    <input type="number" step="0.01" min="0"
                                                        value={discountMode === "percent" && discountPercent ? fmt(discountVal) : discountAmount}
                                                        onFocus={() => setDiscountMode("amount")}
                                                        onChange={(e) => { setDiscountMode("amount"); setDiscountAmount(e.target.value); }}
                                                        placeholder="0.00"
                                                        className="w-full border-none p-0 text-sm font-bold text-right text-slate-800 focus:ring-0 placeholder:text-slate-300 bg-transparent"
                                                        readOnly={discountMode === "percent" && !!discountPercent} />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Tax (Rose) */}
                                        <div className="p-4 bg-rose-50 rounded-xl border border-rose-100">
                                            <label className="block text-[10px] font-black text-rose-800 uppercase tracking-widest mb-2">Tax / VAT</label>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 flex items-center bg-white rounded-lg px-3 py-2 border border-rose-200 focus-within:ring-2 focus-within:ring-rose-300/30">
                                                    <span className="text-xs font-bold text-rose-600 mr-2">%</span>
                                                    <input type="number" step="0.1" min="0" max="100"
                                                        value={taxPercent}
                                                        onFocus={() => setTaxMode("percent")}
                                                        onChange={(e) => { setTaxMode("percent"); setTaxPercent(e.target.value); }}
                                                        placeholder="0"
                                                        className="w-full border-none p-0 text-sm font-bold text-slate-800 focus:ring-0 placeholder:text-slate-300 bg-transparent" />
                                                </div>
                                                <div className="flex-1 flex items-center bg-white rounded-lg px-3 py-2 border border-rose-200 focus-within:ring-2 focus-within:ring-rose-300/30">
                                                    <span className="text-[10px] font-bold text-rose-600 mr-1.5">{currency}</span>
                                                    <input type="number" step="0.01" min="0"
                                                        value={taxMode === "percent" && taxPercent ? fmt(taxVal) : taxAmount}
                                                        onFocus={() => setTaxMode("amount")}
                                                        onChange={(e) => { setTaxMode("amount"); setTaxAmount(e.target.value); }}
                                                        placeholder="0.00"
                                                        className="w-full border-none p-0 text-sm font-bold text-right text-slate-800 focus:ring-0 placeholder:text-slate-300 bg-transparent"
                                                        readOnly={taxMode === "percent" && !!taxPercent} />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Insurance Coverage (Sky) */}
                                        <div className="p-4 bg-sky-50 rounded-xl border border-sky-100">
                                            <label className="block text-[10px] font-black text-sky-800 uppercase tracking-widest mb-2">Insurance Coverage</label>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 flex items-center bg-white rounded-lg px-3 py-2 border border-sky-200 focus-within:ring-2 focus-within:ring-sky-300/30">
                                                    <span className="text-xs font-bold text-sky-600 mr-2">%</span>
                                                    <input type="number" step="0.1" min="0" max="100"
                                                        value={insurancePercent}
                                                        onFocus={() => setInsuranceMode("percent")}
                                                        onChange={(e) => { setInsuranceMode("percent"); setInsurancePercent(e.target.value); }}
                                                        placeholder="0"
                                                        className="w-full border-none p-0 text-sm font-bold text-slate-800 focus:ring-0 placeholder:text-slate-300 bg-transparent" />
                                                </div>
                                                <div className="flex-1 flex items-center bg-white rounded-lg px-3 py-2 border border-sky-200 focus-within:ring-2 focus-within:ring-sky-300/30">
                                                    <span className="text-[10px] font-bold text-sky-600 mr-1.5">{currency}</span>
                                                    <input type="number" step="0.01" min="0"
                                                        value={insuranceMode === "percent" && insurancePercent ? fmt(insuranceVal) : insuranceAmount}
                                                        onFocus={() => setInsuranceMode("amount")}
                                                        onChange={(e) => { setInsuranceMode("amount"); setInsuranceAmount(e.target.value); }}
                                                        placeholder="0.00"
                                                        className="w-full border-none p-0 text-sm font-bold text-right text-slate-800 focus:ring-0 placeholder:text-slate-300 bg-transparent"
                                                        readOnly={insuranceMode === "percent" && !!insurancePercent} />
                                                </div>
                                            </div>
                                            {insuranceVal > 0 && (
                                                <div className="flex items-center gap-1.5 text-sky-700 font-bold text-xs bg-sky-100/50 p-2 rounded-lg mt-3">
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    Insurance covers: {fmt(insuranceVal)} {currency}
                                                </div>
                                            )}
                                        </div>

                                        {/* ── Real-time Summary ────────────────────── */}
                                        <div className="pt-5 mt-2 border-t border-slate-200 space-y-2.5">
                                            <div className="flex justify-between text-sm text-slate-500">
                                                <span>Subtotal</span>
                                                <span className="font-semibold text-slate-700">{fmt(subtotal)} {currency}</span>
                                            </div>
                                            {discountVal > 0 && (
                                                <div className="flex justify-between text-sm font-bold text-amber-600">
                                                    <span>- Discount</span>
                                                    <span>{fmt(discountVal)} {currency}</span>
                                                </div>
                                            )}
                                            {taxVal > 0 && (
                                                <div className="flex justify-between text-sm font-bold text-rose-500">
                                                    <span>+ Tax</span>
                                                    <span>{fmt(taxVal)} {currency}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between text-base font-black text-blue-700 bg-blue-50 p-3 rounded-lg border border-blue-100">
                                                <span>Total Invoice</span>
                                                <span>{fmt(totalInvoice)} {currency}</span>
                                            </div>
                                            {insuranceVal > 0 && (
                                                <div className="flex justify-between text-sm font-bold text-sky-600">
                                                    <span>- Insurance</span>
                                                    <span>{fmt(insuranceVal)} {currency}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between items-center pt-3 border-t border-dashed border-slate-200">
                                                <span className="text-lg font-black text-slate-900">Patient Due</span>
                                                <span className="text-2xl font-black text-slate-900 tracking-tight">
                                                    {fmt(finalDue)} <span className="text-sm font-bold text-slate-400">{currency}</span>
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── Error ───────────────────────────────────── */}
                                    {error && (
                                        <div className="mt-5 rounded-xl px-4 py-3 text-sm bg-red-50 border border-red-200 text-red-600 font-medium">
                                            {error}
                                        </div>
                                    )}

                                    {/* ── Action Buttons ──────────────────────────── */}
                                    <div className="mt-6 space-y-3">
                                        <button type="button" onClick={handleSubmit}
                                            disabled={createInvoice.isPending}
                                            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-40">
                                            {createInvoice.isPending ? (
                                                <>
                                                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                                    Creating...
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    Finalize Invoice
                                                </>
                                            )}
                                        </button>
                                        <button type="button" onClick={onClose}
                                            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold text-sm transition-colors">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
                .animate-fade-in { animation: fadeIn 0.2s ease-out; }
            `}</style>
        </>
    );
}
