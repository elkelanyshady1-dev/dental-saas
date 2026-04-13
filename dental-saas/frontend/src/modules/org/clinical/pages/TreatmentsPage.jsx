/**
 * TreatmentsPage.jsx — Clinic-wide Treatment Records
 *
 * Lists all treatments across the organization.
 * Route: /org/treatments
 * RBAC: treatments.read
 * FLS: Phase E.1 — FieldVisible integration for procedure/tooth/doctor
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PlusIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { treatmentsApi } from "../api/treatments.api";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { ResourceCapabilityProvider, FieldVisible } from "@/context/ResourceCapabilityContext";
import TreatmentStatusBadge from "../components/TreatmentStatusBadge";
import CreateTreatmentDrawer from "../components/CreateTreatmentDrawer";

const STATUS_FILTERS = ["all", "planned", "in_progress", "completed", "cancelled"];

export default function TreatmentsPage() {
    const navigate = useNavigate();
    const canCreate = useCapability(P.TREATMENTS_CREATE);

    const [treatments, setTreatments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [showCreate, setShowCreate] = useState(false);
    const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
    // FLS: capabilities from API response
    const [capabilities, setCapabilities] = useState(null);

    const fetchTreatments = useCallback(async () => {
        setLoading(true);
        try {
            const params = { page: pagination.page, limit: 25 };
            if (search) params.search = search;
            if (statusFilter !== "all") params.status = statusFilter;
            const res = await treatmentsApi.list(params);
            const data = res.data;
            setTreatments(data.data || data.treatments || data || []);
            // FLS: Store capabilities from API response
            if (data.capabilities) {
                setCapabilities(data.capabilities);
            }
            if (data.pagination) {
                setPagination((p) => ({
                    ...p,
                    totalPages: data.pagination.totalPages || 1,
                    total: data.pagination.total || 0,
                }));
            }
        } catch (err) {
            console.error("Failed to load treatments:", err);
        } finally {
            setLoading(false);
        }
    }, [search, statusFilter, pagination.page]);

    useEffect(() => {
        const t = setTimeout(fetchTreatments, 300);
        return () => clearTimeout(t);
    }, [fetchTreatments]);

    // FLS: build visible column headers dynamically
    const visibleFields = capabilities?.visibleFields || null;
    const isFieldVisible = (field) => !visibleFields || visibleFields.includes(field);

    const TABLE_HEADERS = [
        { label: "Patient", field: "patientId", always: true },
        { label: "Procedure", field: "procedureId" },
        { label: "Tooth", field: "toothNumber" },
        { label: "Doctor", field: "doctorId" },
        { label: "Date", field: "createdAt", always: true },
        { label: "Status", field: "status", always: true },
        { label: "", always: true },
    ].filter((h) => h.always || isFieldVisible(h.field));

    return (
        <ResourceCapabilityProvider capabilities={capabilities}>
        <div className="space-y-6 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800">Treatments</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {pagination.total > 0 ? `${pagination.total} treatment records` : "Clinical treatment records"}
                    </p>
                </div>
                {canCreate && (
                    <button
                        onClick={() => setShowCreate(true)}
                        className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2"
                    >
                        <PlusIcon className="w-4 h-4 stroke-[2.5]" />
                        New Treatment
                    </button>
                )}
            </div>

            {/* Search + Filters */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                        type="text"
                        placeholder="Search treatments..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition"
                    />
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                    {STATUS_FILTERS.map((s) => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold transition capitalize ${
                                statusFilter === s
                                    ? "bg-blue-600 text-white"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                        >
                            {s === "all" ? "All" : s.replace("_", " ")}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
            ) : treatments.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <p className="text-gray-400 text-lg mb-1">No treatments found</p>
                    <p className="text-sm text-gray-400">{search ? `No results for "${search}"` : "No treatment records yet"}</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/50">
                                {TABLE_HEADERS.map((h) => (
                                    <th key={h.label || "actions"} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {treatments.map((tx) => {
                                const patient = tx.patientId;
                                const patientName = patient
                                    ? `${patient.firstName || ""} ${patient.lastName || ""}`.trim() || patient.nameEnglish || "—"
                                    : "—";
                                const doctor = tx.doctorId?.name || tx.doctorId?.firstName || "—";
                                const date = tx.date || tx.createdAt;

                                return (
                                    <tr key={tx._id} className="hover:bg-blue-50/20 transition-colors">
                                        <td className="px-5 py-3.5">
                                            <button
                                                onClick={() => patient?._id && navigate(`/org/patients/${patient._id}/treatments`)}
                                                className="font-semibold text-gray-800 hover:text-blue-600 transition text-left"
                                            >
                                                {patientName}
                                            </button>
                                        </td>
                                        <FieldVisible field="procedureId">
                                        <td className="px-5 py-3.5 text-gray-700">{tx.procedureName || tx.procedure || "—"}</td>
                                        </FieldVisible>
                                        <FieldVisible field="toothNumber">
                                        <td className="px-5 py-3.5">
                                            {tx.toothNumber
                                                ? <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded-lg">#{tx.toothNumber}</span>
                                                : <span className="text-gray-400">—</span>
                                            }
                                        </td>
                                        </FieldVisible>
                                        <FieldVisible field="doctorId">
                                        <td className="px-5 py-3.5 text-gray-600">{doctor}</td>
                                        </FieldVisible>
                                        <td className="px-5 py-3.5 text-gray-400 text-xs">
                                            {date ? new Date(date).toLocaleDateString() : "—"}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <TreatmentStatusBadge status={tx.status} />
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <button
                                                onClick={() => patient?._id && navigate(`/org/patients/${patient._id}/treatments`)}
                                                className="text-xs text-blue-600 hover:underline font-medium"
                                            >
                                                View →
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                        onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
                        disabled={pagination.page <= 1}
                        className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 hover:bg-gray-200 disabled:opacity-40 transition"
                    >
                        Previous
                    </button>
                    <span className="text-sm text-gray-500 px-3">Page {pagination.page} of {pagination.totalPages}</span>
                    <button
                        onClick={() => setPagination((p) => ({ ...p, page: Math.min(p.totalPages, p.page + 1) }))}
                        disabled={pagination.page >= pagination.totalPages}
                        className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 hover:bg-gray-200 disabled:opacity-40 transition"
                    >
                        Next
                    </button>
                </div>
            )}

            {/* Create Drawer */}
            {showCreate && (
                <CreateTreatmentDrawer
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); fetchTreatments(); }}
                />
            )}
        </div>
        </ResourceCapabilityProvider>
    );
}
