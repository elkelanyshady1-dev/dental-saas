/**
 * OrthodonticCasesPage.jsx — Org Orthodontic Case List
 *
 * Route: /org/orthodontics
 * RBAC: orthodontics.read
 *
 * Architecture: React Query (useOrthoCases) — no useState server data
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PlusIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import CaseStatusBadge, { CASE_STATUS } from "../components/CaseStatusBadge";
import CreateOrthoDrawer from "../components/CreateOrthoDrawer";
import { useOrthoCases } from "../hooks/useOrthodontics";

const MALOCCLUSION_LABELS = {
    CLASS_I: "Class I", CLASS_II_DIV_1: "Class II Div.1",
    CLASS_II_DIV_2: "Class II Div.2", CLASS_III: "Class III",
};

export default function OrthodonticCasesPage() {
    const navigate  = useNavigate();
    const canCreate = useCapability(P.ORTHODONTICS_CREATE);

    const [search,     setSearch]  = useState("");
    const [statusF,    setStatusF] = useState("all");
    const [page,       setPage]    = useState(1);
    const [showCreate, setCreate]  = useState(false);

    const STATUSES = ["all", ...Object.keys(CASE_STATUS)];
    const LIMIT    = 20;

    // ── Server state via React Query ──────────────────────────────────────
    const params = {
        page,
        limit: LIMIT,
        ...(search           ? { search }        : {}),
        ...(statusF !== "all" ? { status: statusF } : {}),
    };
    const { data, isLoading } = useOrthoCases(params);
    const cases    = data?.cases      || [];
    const total    = data?.pagination?.total      || 0;
    const totalPgs = data?.pagination?.totalPages || 1;

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800">Orthodontic Cases</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {total > 0 ? `${total} cases` : "AI-powered orthodontic case management"}
                    </p>
                </div>
                {canCreate && (
                    <button onClick={() => setCreate(true)}
                        className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition flex items-center gap-2">
                        <PlusIcon className="w-4 h-4 stroke-[2.5]" />
                        New Case
                    </button>
                )}
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input type="text" placeholder="Search by patient or case ID..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition" />
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                    {STATUSES.map((s) => (
                        <button key={s} onClick={() => { setStatusF(s); setPage(1); }}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold transition capitalize ${
                                statusF === s ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}>
                            {s === "all" ? "All" : s.replace(/_/g, " ")}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            {isLoading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="w-7 h-7 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                </div>
            ) : cases.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl">🦷</span>
                    </div>
                    <p className="text-gray-500 font-medium">No orthodontic cases found</p>
                    <p className="text-sm text-gray-400 mt-1">
                        {search ? `No results for "${search}"` : "Create the first case to get started"}
                    </p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/60">
                                {["Patient", "Malocclusion", "Stage", "Aligners", "Doctor", "Started", "Status", ""].map((h) => (
                                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {cases.map((c) => {
                                const patient = c.patientId;
                                const name = patient
                                    ? `${patient.firstName || ""} ${patient.lastName || ""}`.trim() || patient.nameEnglish || "—"
                                    : "—";
                                const doctor  = c.doctorId?.name || c.doctorId?.firstName || "—";
                                const aligner = c.alignerPlan;
                                return (
                                    <tr key={c._id} className="hover:bg-indigo-50/20 transition-colors group cursor-pointer"
                                        onClick={() => navigate(`/org/orthodontics/${c._id}`)}>
                                        <td className="px-5 py-3.5 font-semibold text-gray-800">{name}</td>
                                        <td className="px-5 py-3.5 text-gray-600 text-xs">
                                            {MALOCCLUSION_LABELS[c.malocclusionClass] || c.malocclusionClass || "—"}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {c.currentStage != null
                                                ? <span className="font-mono text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg border border-indigo-100">Stage {c.currentStage}</span>
                                                : <span className="text-gray-400">—</span>}
                                        </td>
                                        <td className="px-5 py-3.5 text-gray-600 text-xs">
                                            {aligner ? `${aligner.completedAligners || 0}/${aligner.totalAligners || 0}` : "—"}
                                        </td>
                                        <td className="px-5 py-3.5 text-gray-500">{doctor}</td>
                                        <td className="px-5 py-3.5 text-gray-400 text-xs">
                                            {c.startDate ? new Date(c.startDate).toLocaleDateString() : "—"}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <CaseStatusBadge status={c.status} />
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className="text-xs text-indigo-600 font-semibold opacity-0 group-hover:opacity-100 transition">
                                                Open →
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {totalPgs > 1 && (
                        <div className="flex items-center justify-center gap-2 py-4 border-t border-gray-100">
                            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                                className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 hover:bg-gray-200 disabled:opacity-40 transition">Previous</button>
                            <span className="text-sm text-gray-500 px-3">Page {page} of {totalPgs}</span>
                            <button onClick={() => setPage((p) => Math.min(totalPgs, p + 1))} disabled={page >= totalPgs}
                                className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 hover:bg-gray-200 disabled:opacity-40 transition">Next</button>
                        </div>
                    )}
                </div>
            )}

            {showCreate && (
                <CreateOrthoDrawer onClose={() => setCreate(false)} onCreated={() => setCreate(false)} />
            )}
        </div>
    );
}
