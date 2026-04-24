/**
 * QuotationsPage.jsx — Org Quotation Management Hub
 *
 * Route: /org/quotations
 * RBAC: quotations.read
 * PLANE: Org only
 *
 * Lists quotations with status filters, search, and detail viewer drawer.
 * Real-time updates via socket event "quotation.update.v1".
 */
import { useState } from "react";
import { useQuotations } from "../hooks/useQuotations";
import { QK } from "@/lib/query/queryKeys";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { useOrgSocket } from "@/hooks/useOrgSocket";
import { useOrgCurrency } from "@/modules/org/hooks/useOrgCurrency";
import QuotationStatusBadge from "../components/QuotationStatusBadge";
import QuotationViewer from "../components/QuotationViewer";
import CreateQuotationModal from "../components/CreateQuotationModal";
import { PlusIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { FileText } from "lucide-react";

const STATUS_FILTERS = ["all", "draft", "sent", "accepted", "rejected", "expired", "converted"];

export default function QuotationsPage() {
    const canCreate = useCapability(P.QUOTATIONS_CREATE);
    const orgCurrency = useOrgCurrency();

    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("all");
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState(null);
    const [showCreate, setShowCreate] = useState(false);

    const LIMIT = 20;

    const params = {
        page,
        limit: LIMIT,
        ...(search ? { search } : {}),
        ...(status !== "all" ? { status } : {}),
    };

    const { data: quotationData, isLoading: loading } = useQuotations(params);
    const quotations = quotationData?.quotations || [];
    const total      = quotationData?.total || 0;
    const totalPages = Math.ceil(total / LIMIT) || 1;

    // Real-time invalidation
    useOrgSocket("quotation.update.v1", QK.quotations.all);

    const fmt = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800">Quotations</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {total > 0 ? `${total} quotation${total !== 1 ? "s" : ""}` : "Patient cost estimates and quotations"}
                    </p>
                </div>
                {canCreate && (
                    <button
                        onClick={() => setShowCreate(true)}
                        className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition flex items-center gap-2"
                    >
                        <PlusIcon className="w-4 h-4 stroke-[2.5]" />
                        New Quotation
                    </button>
                )}
            </div>

            {/* Search + Status Filters */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                        type="text"
                        placeholder="Search by patient, quotation #..."
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

            {/* Quotations Table */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="w-7 h-7 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
            ) : quotations.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <FileText className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                    <p className="text-gray-400 font-medium">No quotations found</p>
                    <p className="text-sm text-gray-400 mt-0.5">{search ? `No results for "${search}"` : "No quotation records yet"}</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/50">
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Quotation #</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Patient</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Expires</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {quotations.map((q) => {
                                const patient = q.patientId;
                                const patientName = patient
                                    ? `${patient.firstName || ""} ${patient.lastName || ""}`.trim() || patient.nameEnglish || "—"
                                    : "—";
                                const cur = q.currency || orgCurrency;

                                return (
                                    <tr key={q._id} className="hover:bg-blue-50/20 transition-colors group">
                                        <td className="px-5 py-3.5">
                                            <span className="font-mono text-xs font-bold text-gray-700">
                                                {q.quotationNumber || q._id?.slice(-6).toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5 font-semibold text-gray-800 max-w-[140px] truncate">{patientName}</td>
                                        <td className="px-5 py-3.5 text-gray-400 text-xs">
                                            {q.createdAt ? new Date(q.createdAt).toLocaleDateString() : "—"}
                                        </td>
                                        <td className="px-5 py-3.5 text-gray-400 text-xs">
                                            {q.expiresAt ? new Date(q.expiresAt).toLocaleDateString() : "—"}
                                        </td>
                                        <td className="px-5 py-3.5 font-semibold text-gray-800">
                                            {fmt(q.totalAmount)} {cur}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <QuotationStatusBadge status={q.status} />
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <button
                                                onClick={() => setSelected(q._id)}
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

            {/* Quotation Viewer Drawer */}
            {selected && (
                <QuotationViewer
                    quotationId={selected}
                    onClose={() => setSelected(null)}
                />
            )}

            {/* Create Quotation Modal */}
            {showCreate && (
                <CreateQuotationModal onClose={() => setShowCreate(false)} />
            )}
        </div>
    );
}
