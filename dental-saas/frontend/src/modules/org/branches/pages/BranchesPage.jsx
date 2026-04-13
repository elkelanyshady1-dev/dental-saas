/**
 * BranchesPage.jsx — Branch Management (v32.2 — Full Mockup Implementation)
 * Matches the DentaFlow SaaS HTML design spec exactly.
 * React Query for server state, RBAC-gated actions.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { branchesApi } from "../api/branches.api";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import BranchEditorModal from "../components/BranchEditorModal";
import SettingsBreadcrumb from "@/components/settings/SettingsBreadcrumb";
import AppModal from "@/components/ui/AppModal";

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || "";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function staticMapUrl(lat, lng) {
    if (!lat || !lng || !MAPS_KEY || MAPS_KEY === "YOUR_GOOGLE_MAPS_API_KEY_HERE") return null;
    return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=600x300&scale=2&markers=color:0x2563eb%7C${lat},${lng}&key=${MAPS_KEY}&style=feature:poi|visibility:off&style=feature:road|element:labels|visibility:off`;
}

function getBranchInitials(name = "") {
    return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "BR";
}

// ─── Branch Card (matches design spec) ────────────────────────────────────────
function BranchCard({ branch, onEdit, canUpdate, canDelete, onDelete }) {
    const hasPin  = branch.location?.lat && branch.location?.lng;
    const mapUrl  = hasPin ? staticMapUrl(branch.location.lat, branch.location.lng) : null;
    const address = branch.location?.formattedAddress || branch.address || "";
    const isAcademic = branch.clinicType === "ACADEMIC";

    // ── Actions ─────────────────────────────────────────────────────────────
    const mapsLink = hasPin ? `https://www.google.com/maps?q=${branch.location.lat},${branch.location.lng}` : null;
    const shareText = `Check out our clinic branch: ${branch.name}. Location: ${mapsLink || address}`;
    const whatsappLink = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

    return (
        <div className="group bg-white rounded-3xl overflow-hidden hover:shadow-2xl transition-all duration-500 flex flex-col border border-slate-100 shadow-sm">

            {/* ── Image / Map Hero ─────────────────────────────────────────── */}
            <div className="relative h-48 w-full overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200">
                {mapUrl ? (
                    <img
                        src={mapUrl}
                        alt={`Map of ${branch.name}`}
                        className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 ${!branch.isActive ? "grayscale opacity-60" : ""}`}
                    />
                ) : (
                    <div className={`w-full h-full flex flex-col items-center justify-center gap-3 ${!branch.isActive ? "opacity-40" : ""}`}>
                        <div className={`w-20 h-20 rounded-3xl flex items-center justify-center text-3xl font-black shadow-xl rotate-3 group-hover:rotate-0 transition-transform ${isAcademic ? "bg-purple-100 text-purple-600" : "bg-blue-100 text-blue-600"}`}>
                            {getBranchInitials(branch.name)}
                        </div>
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest bg-white/80 px-2 py-1 rounded-lg">No Map Data</span>
                    </div>
                )}

                {/* Status badge */}
                <div className="absolute top-4 left-4 z-10">
                    <span className={`inline-flex items-center px-3 py-1.5 backdrop-blur-md shadow-lg border border-white/20 rounded-full text-[10px] font-black uppercase tracking-widest ${branch.isActive ? "bg-white/90 text-blue-800" : "bg-white/80 text-slate-500"}`}>
                        <span className={`w-2 h-2 rounded-full mr-2 ${branch.isActive ? "bg-emerald-500 shadow-lg shadow-emerald-500/50" : "bg-slate-300"}`} />
                        {branch.isActive ? "Online" : "Defunct"}
                    </span>
                </div>

                {/* Gradient + address overlay */}
                <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-slate-900/40 to-transparent pointer-events-none" />
                {address && (
                    <div className="absolute bottom-4 left-4 right-4 z-10">
                        <div className="flex items-center gap-2 text-white">
                            <span className="material-symbols-outlined text-[16px] text-white/80">explore</span>
                            <span className="text-[11px] font-bold truncate tracking-tight">{address}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Card Body ────────────────────────────────────────────────── */}
            <div className="p-7 flex flex-col flex-1">
                <div className="flex justify-between items-start mb-5">
                    <div>
                        <h3 className="text-xl font-black text-slate-900 tracking-tight mb-1.5 leading-none">{branch.name}</h3>
                        <div className="flex items-center gap-2">
                            {isAcademic ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase bg-purple-50 text-purple-600 border border-purple-100">
                                    Research 🎓
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase bg-blue-50 text-blue-600 border border-blue-100">
                                    Commercial
                                </span>
                            )}
                        </div>
                    </div>
                    {hasPin && (
                        <a 
                            href={mapsLink} target="_blank" rel="noreferrer"
                            className="w-9 h-9 rounded-xl flex items-center justify-center bg-white border border-slate-100 text-slate-400 hover:text-blue-600 hover:border-blue-100 hover:shadow-xl hover:shadow-blue-500/10 transition-all active:scale-90"
                            title="Open in Google Maps"
                        >
                            <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                        </a>
                    )}
                </div>

                {/* Details rows */}
                <div className={`space-y-4 mb-8 flex-1 ${!branch.isActive ? "opacity-50" : ""}`}>
                    {branch.phone && (
                        <div className="flex items-center gap-4 group/row">
                            <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-50 text-slate-400 material-symbols-outlined text-[18px] group-hover/row:bg-blue-50 group-hover/row:text-blue-500 transition-colors">call</span>
                            <p className="text-sm text-slate-600 font-bold tracking-tight">{branch.phone}</p>
                        </div>
                    )}
                    <div className="flex items-center gap-4 group/row">
                        <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-50 text-slate-400 material-symbols-outlined text-[18px] group-hover/row:bg-purple-50 group-hover/row:text-purple-500 transition-colors">
                            {isAcademic ? "school" : "medical_services"}
                        </span>
                        <p className="text-sm text-slate-500 font-bold tracking-tight">
                            {isAcademic ? "Strictly Non-Billing" : "Full Clinical Suite"}
                        </p>
                    </div>
                </div>

                {/* Action buttons */}
                <div className="mt-auto grid grid-cols-2 gap-3">
                    {canUpdate && (
                        <button
                            onClick={() => onEdit && onEdit(branch)}
                            className="flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-800 text-white shadow-xl shadow-slate-200 transition-all rounded-2xl text-[11px] font-black uppercase tracking-widest active:scale-95"
                        >
                            <span className="material-symbols-outlined text-[16px]">tune</span>
                            Configure
                        </button>
                    )}
                    <div className="flex gap-2">
                        {hasPin && (
                            <a
                                href={whatsappLink} target="_blank" rel="noreferrer"
                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100 transition-all rounded-2xl text-[11px] font-black uppercase tracking-widest active:scale-95 text-center"
                            >
                                <span className="material-symbols-outlined text-[16px]">share</span>
                                WhatsApp
                            </a>
                        )}
                        {canDelete && (
                            <button
                                onClick={() => onDelete && onDelete(branch._id)}
                                className="w-12 flex items-center justify-center bg-red-50 hover:bg-red-500 text-red-400 hover:text-white transition-all rounded-2xl active:scale-90"
                            >
                                <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Bento Analytics Strip ────────────────────────────────────────────────────
function BentoStrip({ branches }) {
    const total    = branches.length;
    const active   = branches.filter(b => b.isActive).length;
    const pinned   = branches.filter(b => b.location?.lat).length;

    return (
        <div className="mt-12 grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Large gradient card */}
            <div className="md:col-span-2 bg-gradient-to-br from-blue-700 to-blue-500 rounded-2xl p-8 text-white relative overflow-hidden shadow-xl">
                <div className="relative z-10">
                    <p className="text-blue-200 text-sm font-bold uppercase tracking-widest mb-4">Branch Network</p>
                    <h4 className="text-5xl font-black mb-4">{total}</h4>
                    <p className="text-white/80 max-w-sm mb-6 text-sm leading-relaxed">
                        {active} active branch{active !== 1 ? "es" : ""} registered in your dental network.
                        {pinned > 0 && ` ${pinned} pinned on Google Maps.`}
                    </p>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-white/20 rounded-full px-4 py-2">
                            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            <span className="text-sm font-semibold">{active} Active</span>
                        </div>
                        <div className="flex items-center gap-2 bg-white/20 rounded-full px-4 py-2">
                            <span className="text-sm font-semibold">📍 {pinned} Mapped</span>
                        </div>
                    </div>
                </div>
                <span className="material-symbols-outlined absolute -right-8 -bottom-8 text-[200px] opacity-10 rotate-12 select-none pointer-events-none">
                    dentistry
                </span>
            </div>

            {/* Private branches stat */}
            <div className="bg-white rounded-2xl p-8 flex flex-col justify-between border border-slate-100 shadow-sm">
                <div>
                    <span className="material-symbols-outlined text-blue-600 mb-4 p-3 bg-blue-50 rounded-xl inline-block shadow-sm">
                        local_hospital
                    </span>
                    <h5 className="text-slate-400 font-bold text-sm uppercase tracking-widest mb-2">Private Branches</h5>
                    <p className="text-4xl font-black text-slate-800">
                        {branches.filter(b => b.clinicType !== "ACADEMIC").length}
                    </p>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-4">
                    <div
                        className="bg-blue-600 h-full rounded-full transition-all duration-700"
                        style={{ width: total > 0 ? `${(branches.filter(b => b.clinicType !== "ACADEMIC").length / total) * 100}%` : "0%" }}
                    />
                </div>
            </div>

            {/* Academic branches stat */}
            <div className="bg-white rounded-2xl p-8 flex flex-col justify-between border border-slate-100 shadow-sm">
                <div>
                    <span className="material-symbols-outlined text-purple-600 mb-4 p-3 bg-purple-50 rounded-xl inline-block shadow-sm">
                        school
                    </span>
                    <h5 className="text-slate-400 font-bold text-sm uppercase tracking-widest mb-2">Academic Branches</h5>
                    <p className="text-4xl font-black text-slate-800">
                        {branches.filter(b => b.clinicType === "ACADEMIC").length}
                    </p>
                </div>
                <div className="flex items-center text-purple-600 text-xs font-bold gap-1.5 mt-4">
                    <span className="material-symbols-outlined text-sm">info</span>
                    Billing disabled
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function BranchesPage() {
    const qc = useQueryClient();
    const [editingBranch, setEditingBranch] = useState(null);
    const [showCreate, setShowCreate]       = useState(false);
    const [search, setSearch]               = useState("");
    const [typeFilter, setTypeFilter]       = useState("ALL");
    const [deleteModal, setDeleteModal]     = useState({ open: false, id: null });

    const canCreate = useCapability(P.BRANCHES_CREATE);
    const canUpdate = useCapability(P.BRANCHES_UPDATE);
    const canDel    = useCapability(P.BRANCHES_DELETE);

    // ── Server state ──────────────────────────────────────────────────────────
    const { data: branches = [], isLoading, error } = useQuery({
        queryKey: ["branches"],
        queryFn:  () => branchesApi.list(),
        select:   res => res.data?.data || res.data || [],
    });

    const createMut = useMutation({
        mutationFn: data => branchesApi.create(data),
        onSuccess:  () => { qc.invalidateQueries({ queryKey: ["branches"] }); setShowCreate(false); },
    });

    const updateMut = useMutation({
        mutationFn: ({ id, data }) => branchesApi.update(id, data),
        onSuccess:  () => { qc.invalidateQueries({ queryKey: ["branches"] }); setEditingBranch(null); },
    });

    const deleteMut = useMutation({
        mutationFn: id => branchesApi.delete(id),
        onSuccess:  () => { qc.invalidateQueries({ queryKey: ["branches"] }); setDeleteModal({ open: false, id: null }); },
    });

    const confirmDelete = (id) => {
        setDeleteModal({ open: true, id });
    };

    const handleDelete = () => {
        if (deleteModal.id) deleteMut.mutate(deleteModal.id);
    };

    // ── Filtering ─────────────────────────────────────────────────────────────
    const filtered = branches.filter(b => {
        const q = search.toLowerCase();
        const matchSearch = !q
            || b.name.toLowerCase().includes(q)
            || (b.address || "").toLowerCase().includes(q)
            || (b.location?.formattedAddress || "").toLowerCase().includes(q);
        const matchType =
            typeFilter === "ALL"
            || (typeFilter === "ACADEMIC" && b.clinicType === "ACADEMIC")
            || (typeFilter === "PRIVATE"  && b.clinicType !== "ACADEMIC");
        return matchSearch && matchType;
    });

    return (
        <div className="text-slate-800">
            <SettingsBreadcrumb current="Branch Management" />

            {/* ── Page header ─────────────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
                <div>
                    <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-1">Branch Management</h2>
                    <p className="text-slate-500 text-base max-w-2xl">
                        Manage clinic locations, working hours, and resources across your dental network.
                    </p>
                </div>
                {canCreate && (
                    <button
                        onClick={() => setShowCreate(true)}
                        className="flex items-center gap-2 bg-gradient-to-r from-blue-700 to-blue-500 text-white px-5 py-3 rounded-xl font-bold shadow-lg shadow-blue-600/25 active:scale-95 transition-all flex-shrink-0 hover:shadow-blue-600/40"
                    >
                        <span className="material-symbols-outlined text-lg">add</span>
                        Add Branch
                    </button>
                )}
            </div>

            {/* ── Search and Filters ───────────────────────────────────────── */}
            <div className="bg-slate-50 rounded-2xl p-4 mb-8 flex flex-col md:flex-row gap-4 items-center">
                {/* Search input */}
                <div className="relative flex-1 w-full">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-white border-0 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:outline-none text-sm"
                        placeholder="Search by branch name or address..."
                        type="text"
                    />
                </div>

                {/* Type filter pills */}
                <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
                    {[
                        { id: "ALL",      label: "All" },
                        { id: "PRIVATE",  label: "Private" },
                        { id: "ACADEMIC", label: "Academic" },
                    ].map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTypeFilter(t.id)}
                            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                                typeFilter === t.id
                                    ? "bg-white shadow-sm text-blue-700"
                                    : "text-slate-500 hover:text-slate-700"
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Filter button */}
                <button className="flex items-center gap-2 px-4 py-3 bg-white text-slate-500 rounded-xl shadow-sm text-sm font-medium hover:bg-slate-50 transition-colors">
                    <span className="material-symbols-outlined text-lg">filter_list</span>
                    Advanced Filters
                </button>
            </div>

            {/* ── Error ────────────────────────────────────────────────────── */}
            {error && (
                <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-sm text-red-700 mb-6">
                    <span className="material-symbols-outlined text-red-400">error</span>
                    {error.message || "Failed to load branches"}
                </div>
            )}

            {/* ── Loading ───────────────────────────────────────────────────── */}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-28 gap-4">
                    <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                    <p className="text-sm text-slate-400 font-medium">Loading branches…</p>
                </div>
            ) : filtered.length === 0 ? (
                /* ── Empty State ──────────────────────────────────────────── */
                <div className="flex flex-col items-center justify-center py-28 text-center">
                    <div className="w-20 h-20 rounded-3xl bg-blue-50 flex items-center justify-center mb-5 shadow-sm">
                        <span className="material-symbols-outlined text-4xl text-blue-300">location_city</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-700 mb-2">
                        {branches.length === 0 ? "No branches yet" : "No results found"}
                    </h3>
                    <p className="text-sm text-slate-400 mb-7 max-w-sm">
                        {branches.length === 0
                            ? "Add your first clinic branch to get started managing locations."
                            : "Try adjusting your search or filter."}
                    </p>
                    {branches.length === 0 && canCreate && (
                        <button
                            onClick={() => setShowCreate(true)}
                            className="flex items-center gap-2 bg-gradient-to-r from-blue-700 to-blue-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 active:scale-95 transition-all"
                        >
                            <span className="material-symbols-outlined">add</span>
                            Add First Branch
                        </button>
                    )}
                </div>
            ) : (
                <>
                    {/* ── Branch Grid ──────────────────────────────────────── */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {filtered.map(branch => (
                            <BranchCard
                                key={branch._id}
                                branch={branch}
                                canUpdate={canUpdate}
                                canDelete={canDel}
                                onEdit={setEditingBranch}
                                onDelete={confirmDelete}
                            />
                        ))}
                    </div>

                    {/* ── Bento Analytics Strip ────────────────────────────── */}
                    <BentoStrip branches={branches} />
                </>
            )}

            {/* ── Modal ─────────────────────────────────────────────────────── */}
            {(showCreate || editingBranch) && (
                <BranchEditorModal
                    branch={editingBranch}
                    saving={createMut.isPending || updateMut.isPending}
                    saveError={
                        createMut.error?.response?.data?.message
                        || updateMut.error?.response?.data?.message
                    }
                    onSave={editingBranch
                        ? (id, data) => updateMut.mutate({ id, data })
                        : data => createMut.mutate(data)
                    }
                    onClose={() => { setShowCreate(false); setEditingBranch(null); }}
                />
            )}

            {deleteModal.open && (
                <AppModal
                    isOpen={deleteModal.open}
                    onClose={() => setDeleteModal({ open: false, id: null })}
                    onConfirm={handleDelete}
                    title="Deactivate Branch"
                    message="Deactivate this branch? Staff assigned to it will remain, but the branch will be hidden."
                    variant="danger"
                    confirmText="Deactivate"
                />
            )}
        </div>
    );
}
