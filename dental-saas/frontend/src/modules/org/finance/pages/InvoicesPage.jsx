/**
 * InvoicesPage.jsx — Org Finance & Invoicing Hub (Phase 4 — DDD Fixed)
 *
 * ✅ Phase 4 FE fixes applied:
 *   - useState for server data REMOVED → useInvoices hook (React Query)
 *   - usePermission REMOVED → useCapability("invoices.create") (Step 4+5)
 *   - Manual fetchInvoices/useEffect REMOVED → React Query (Rule 11.1)
 *   - Summary now uses accountingApi (CQRS read side) (Step 3)
 *   - Real-time invalidation via useOrgSocket (Step 7)
 *
 * Route: /org/invoices
 * RBAC: invoices.read (via React Query stale management)
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useInvoices } from "../hooks/useInvoices";
import { accountingApi } from "../api/accounting.api";
import { QK } from "@/lib/query/queryKeys";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { useOrgSocket } from "@/hooks/useOrgSocket";
import { ResourceCapabilityProvider, FieldVisible } from "@/context/ResourceCapabilityContext";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import InvoiceViewer from "../components/InvoiceViewer";
import RevenueChart from "../components/RevenueChart";
import { PlusIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { CreditCard, TrendingUp, Clock, AlertCircle } from "lucide-react";

const STATUS_FILTERS = ["all", "pending", "partial", "paid", "overdue", "refunded", "voided"];

export default function InvoicesPage() {
    // ✅ Step 4+5 — usePermission → useCapability; key: accounting.create → invoices.create
    const canCreate = useCapability(P.INVOICES_CREATE);

    // ✅ UI-only state — these are NOT server data (compliant with Rule 11.1)
    const [search,   setSearch]   = useState("");
    const [status,   setStatus]   = useState("all");
    const [page,     setPage]     = useState(1);
    const [selected, setSelected] = useState(null);

    const LIMIT = 20;

    // Build query params object
    const params = {
        page,
        limit: LIMIT,
        ...(search ? { search } : {}),
        ...(status !== "all" ? { status } : {}),
    };

    // ✅ Step 3 — React Query via useInvoices hook (replaces all useState + fetchInvoices)
    const { data: invoiceData, isLoading: loading } = useInvoices(params);
    const invoices   = invoiceData?.invoices   || [];
    const total      = invoiceData?.pagination?.total      || 0;
    const totalPages = invoiceData?.pagination?.totalPages || 1;

    // ✅ Step 3 — Summary via accountingApi (CQRS read side)
    const { data: summary } = useQuery({
        queryKey: QK.accounting.monthly({}),
        queryFn:  () => accountingApi.getMonthlySummary(),
        select:   (res) => res.data?.summary || res.data,
        staleTime: 60_000,
    });

    // ✅ Step 7 — Real-time invalidation (both events → both query trees)
    useOrgSocket("invoice.created.v1",    QK.invoices.all);
    useOrgSocket("accounting.updated.v1", QK.accounting.all);

    const fmt = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });

    const STATS = summary ? [
        { label: "Total Billed",    value: fmt(summary.totalBilled),    sub: summary.currency || "EGP", icon: TrendingUp,  color: "text-blue-600",    bg: "bg-blue-50" },
        { label: "Total Collected", value: fmt(summary.totalCollected), sub: summary.currency || "EGP", icon: CreditCard,  color: "text-emerald-600", bg: "bg-emerald-50" },
        { label: "Outstanding",     value: fmt(summary.outstanding),    sub: summary.currency || "EGP", icon: Clock,       color: "text-amber-600",   bg: "bg-amber-50" },
        { label: "Overdue",         value: fmt(summary.overdue),        sub: summary.currency || "EGP", icon: AlertCircle, color: "text-red-600",     bg: "bg-red-50" },
    ] : [];

    const TABLE_HEADERS = [
        { label: "Invoice #",  field: "_id",         always: true },
        { label: "Patient",    field: "patientId",   always: true },
        { label: "Date",       field: "createdAt",   always: true },
        { label: "Total",      field: "totalAmount" },
        { label: "Paid",       field: "payments" },
        { label: "Balance",    field: "totalAmount" },
        { label: "Status",     field: "status",      always: true },
        { label: "",                                  always: true },
    ];

    return (
        <ResourceCapabilityProvider capabilities={null}>
        <div className="space-y-6 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800">Finance &amp; Invoices</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {total > 0 ? `${total} invoices` : "Billing and payment management"}
                    </p>
                </div>
                {canCreate && (
                    <button className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition flex items-center gap-2">
                        <PlusIcon className="w-4 h-4 stroke-[2.5]" />
                        New Invoice
                    </button>
                )}
            </div>

            {/* Summary Stats */}
            {STATS.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {STATS.map((s) => (
                        <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${s.bg}`}>
                                <s.icon className={`w-5 h-5 ${s.color}`} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-semibold text-gray-500">{s.label}</p>
                                <p className="text-base font-bold text-gray-800 truncate">{s.value} <span className="text-xs font-normal text-gray-400">{s.sub}</span></p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Revenue Chart — CQRS read side (accountingDomain) */}
            <RevenueChart />

            {/* Search + Status Filters */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                        type="text"
                        placeholder="Search by patient, invoice #..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition"
                    />
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                    {STATUS_FILTERS.map((s) => (
                        <button key={s} onClick={() => { setStatus(s); setPage(1); }}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold transition capitalize ${
                                status === s ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}>
                            {s === "all" ? "All" : s}
                        </button>
                    ))}
                </div>
            </div>

            {/* Invoices Table */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="w-7 h-7 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
            ) : invoices.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <CreditCard className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                    <p className="text-gray-400 font-medium">No invoices found</p>
                    <p className="text-sm text-gray-400 mt-0.5">{search ? `No results for "${search}"` : "No invoice records yet"}</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/50">
                                {TABLE_HEADERS.map((h, i) => (
                                    <th key={h.label || `action-${i}`} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {invoices.map((inv) => {
                                const patient = inv.patientId;
                                const patientName = patient
                                    ? `${patient.firstName || ""} ${patient.lastName || ""}`.trim() || patient.nameEnglish || "—"
                                    : "—";
                                const totalPaid = (inv.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
                                const balance = (inv.totalAmount || 0) - totalPaid;
                                const cur = inv.currency || "EGP";

                                return (
                                    <tr key={inv._id} className="hover:bg-blue-50/20 transition-colors group">
                                        <td className="px-5 py-3.5">
                                            <span className="font-mono text-xs font-bold text-gray-700">
                                                #{inv.invoiceNumber || inv._id?.slice(-6).toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5 font-semibold text-gray-800 max-w-[140px] truncate">{patientName}</td>
                                        <td className="px-5 py-3.5 text-gray-400 text-xs">
                                            {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : "—"}
                                        </td>
                                        <FieldVisible field="totalAmount">
                                        <td className="px-5 py-3.5 font-semibold text-gray-800">
                                            {Number(inv.totalAmount || 0).toLocaleString()} {cur}
                                        </td>
                                        </FieldVisible>
                                        <FieldVisible field="totalAmount">
                                        <td className="px-5 py-3.5 text-emerald-600 font-medium">
                                            {totalPaid > 0 ? `${totalPaid.toLocaleString()} ${cur}` : "—"}
                                        </td>
                                        </FieldVisible>
                                        <FieldVisible field="totalAmount">
                                        <td className={`px-5 py-3.5 font-bold ${balance > 0 ? "text-red-600" : "text-gray-400"}`}>
                                            {balance > 0 ? `${balance.toLocaleString()} ${cur}` : "—"}
                                        </td>
                                        </FieldVisible>
                                        <td className="px-5 py-3.5">
                                            <PaymentStatusBadge status={inv.status} />
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <button
                                                onClick={() => setSelected(inv._id)}
                                                className="text-xs text-blue-600 hover:underline font-semibold opacity-0 group-hover:opacity-100 transition"
                                            >
                                                View →
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 py-4 border-t border-gray-100">
                            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                                className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 hover:bg-gray-200 disabled:opacity-40 transition">
                                Previous
                            </button>
                            <span className="text-sm text-gray-500 px-3">Page {page} of {totalPages}</span>
                            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                                className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 hover:bg-gray-200 disabled:opacity-40 transition">
                                Next
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Invoice Viewer Drawer */}
            {selected && (
                <InvoiceViewer
                    invoiceId={selected}
                    onClose={() => setSelected(null)}
                />
            )}
        </div>
        </ResourceCapabilityProvider>
    );
}
