/**
 * PatientWorkspace.jsx — Modern Patient Management Workspace v4.0
 *
 * Pixel-faithful to the provided design screenshots.
 * Architecture: Stripe/Linear/Notion-inspired grouped list + context panel.
 *
 * Layout:
 *   Left (flex-1): CommandSearchBar → grouped patient list
 *   Right (380px): WorkspaceContextPanel (slides in on patient click)
 *
 * Smart Grouping:
 *   🟢 APPOINTMENTS TODAY
 *   🔴 BALANCE DUE
 *      RECENT PATIENTS
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { PlusIcon, ArrowUpTrayIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { patientsApi } from "../api/patients.api";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import WorkspaceContextPanel from "../components/WorkspaceContextPanel";
import PatientRegistrationWizard from "../components/PatientRegistrationWizard";
import { assertPatientDTO } from "@/utils/assertDTO";
import AppModal from "@/components/ui/AppModal";

/** Inline PatientRowCard (replaces deleted PatientRowCard.jsx) */
function PatientRowCard({ patient, selected, onSelect, onClick }) {
    const p = patient;
    assertPatientDTO(p, "PatientRowCard");
    const name = p.displayName || "Unknown";
    const initials = name.slice(0, 2).toUpperCase();
    const age = p.dateOfBirth ? Math.floor((Date.now() - new Date(p.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;

    return (
        <div
            onClick={() => onClick?.(p)}
            className={`flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-colors border-b border-slate-50 last:border-b-0 ${
                selected ? 'bg-violet-50/50' : 'hover:bg-slate-50/80'
            }`}
        >
            {/* Checkbox */}
            <input
                type="checkbox"
                checked={selected}
                onChange={() => onSelect?.(p._id)}
                onClick={e => e.stopPropagation()}
                className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
            />

            {/* Avatar */}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-400 to-blue-500 flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                {initials}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{name}</p>
                <p className="text-[10px] text-slate-400 font-medium">
                    {[p.patientCode, age ? `${age}y` : null, p.gender === 'male' ? 'M' : p.gender === 'female' ? 'F' : null, p.phone].filter(Boolean).join(' · ')}
                </p>
            </div>

            {/* Tags */}
            {p.tags?.length > 0 && (
                <div className="flex items-center gap-1 flex-shrink-0">
                    {p.tags.slice(0, 2).map(t => (
                        <span key={t} className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-50 text-violet-600 border border-violet-100">{t}</span>
                    ))}
                </div>
            )}

            {/* Balance */}
            {(p.balance || 0) > 0 && (
                <span className="text-xs font-black text-red-500 flex-shrink-0">{p.balance?.toLocaleString()} EGP</span>
            )}
        </div>
    );
}

// ─── Utilities ─────────────────────────────────────────────────────────────

function isToday(iso) {
    if (!iso) return false;
    const d = new Date(iso), t = new Date();
    return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}

function groupPatients(patients) {
    const today = [], balance = [], recent = [];
    for (const p of patients) {
        if (isToday(p.nextAppointment)) { today.push(p); continue; }
        if ((p.balance || 0) > 0) { balance.push(p); continue; }
        recent.push(p);
    }
    return { today, balance, recent };
}

// ─── Command Search Bar ────────────────────────────────────────────────────

const COMMANDS = [
    { label: "balance > 1000",      icon: "💰", desc: "Patients with balance over 1000" },
    { label: "tag:orthodontics",    icon: "🏷️",  desc: "Tagged as orthodontics" },
    { label: "appointment:today",   icon: "📅", desc: "Appointments scheduled today" },
    { label: "insurance:mednet",    icon: "🛡️",  desc: "MedNet insurance patients" },
    { label: "inactive patients",   icon: "🕐", desc: "No visits in 6+ months" },
    { label: "lastvisit>3",        icon: "📆", desc: "No visit in 3+ months" },
];

function CommandSearchBar({ value, onChange, inputRef }) {
    const [open, setOpen] = useState(false);
    const isCmd = value.includes(":") || value.includes(">") || value === "inactive patients";

    return (
        <div className="relative">
            <div className={`flex items-center gap-3 bg-white/80 backdrop-blur border rounded-2xl px-4 py-3 transition-all ${
                open || value ? "border-slate-300 shadow-lg shadow-slate-100" : "border-slate-200 shadow-sm"
            } ${isCmd ? "ring-2 ring-violet-500/20 border-violet-300" : ""}`}>

                {/* Icon */}
                <div className="flex-shrink-0">
                    {isCmd ? (
                        <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center">
                            <svg className="w-3.5 h-3.5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                    ) : (
                        <svg className="w-4.5 h-4.5 text-slate-400" style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    )}
                </div>

                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 180)}
                    placeholder="Search patients or type a command (e.g. balance > 1000)"
                    className="flex-1 bg-transparent text-sm font-medium text-slate-700 placeholder:text-slate-400 outline-none"
                />

                {value && (
                    <button onClick={() => onChange("")}
                        className="w-5 h-5 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-slate-500 transition-colors text-xs flex-shrink-0">
                        ×
                    </button>
                )}
            </div>

            {/* Autocomplete / Command dropdown */}
            {open && !value && (
                <div className="absolute top-full mt-2 left-0 right-0 bg-white rounded-2xl border border-slate-100 shadow-2xl shadow-slate-200/60 overflow-hidden z-50">
                    <div className="px-4 pt-3 pb-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quick Commands</p>
                    </div>
                    {COMMANDS.map(cmd => (
                        <button
                            key={cmd.label}
                            onMouseDown={() => onChange(cmd.label)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-violet-50/60 transition-colors group text-left"
                        >
                            <span className="text-base w-6 text-center">{cmd.icon}</span>
                            <div className="flex-1 min-w-0">
                                <span className="text-xs font-bold text-violet-700 group-hover:text-violet-800 font-mono">{cmd.label}</span>
                                <p className="text-[10px] text-slate-400 mt-0.5">{cmd.desc}</p>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Patient Group Section ─────────────────────────────────────────────────

function PatientGroup({ dot, title, count, patients, selected, onSelect, onRowClick, onRefresh }) {
    if (patients.length === 0) return null;

    const dotColors = {
        emerald: "bg-emerald-500",
        red:     "bg-red-500",
        slate:   "bg-slate-400",
    };

    return (
        <div className="mb-1">
            {/* Group header */}
            <div className="flex items-center gap-2 px-5 py-2.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColors[dot] || "bg-slate-400"}`} />
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    {title}
                </span>
                <span className="text-[11px] font-black text-slate-400">({count})</span>
            </div>

            {/* Rows */}
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                {patients.map((p, i) => (
                    <PatientRowCard
                        key={p._id}
                        patient={p}
                        selected={selected.has(p._id)}
                        onSelect={onSelect}
                        onClick={onRowClick}
                        onRefresh={onRefresh}
                    />
                ))}
            </div>
        </div>
    );
}

// ─── Floating Bulk Action Bar ──────────────────────────────────────────────

function BulkActionBar({ selectedIds, onClear, onBulkSMS, onAddTag, onDelete }) {
    if (selectedIds.length === 0) return null;
    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
            <div className="pointer-events-auto bg-slate-900 rounded-2xl shadow-2xl border border-slate-700/60 backdrop-blur px-5 py-3 flex items-center gap-4">
                {/* Count */}
                <span className="text-sm font-bold text-white flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-violet-600 flex items-center justify-center text-[11px] font-black">{selectedIds.length}</div>
                    {selectedIds.length === 1 ? "Patient" : "Patients"} selected
                </span>

                <div className="w-px h-5 bg-slate-600" />

                <button onClick={onBulkSMS} className="flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white transition-colors px-2 py-1.5 rounded-xl hover:bg-slate-800">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21l4-4 4 4M3 10a9 9 0 0118 0v1a9 9 0 01-18 0v-1z" /></svg>
                    Bulk SMS
                </button>
                <button onClick={onAddTag} className="flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white transition-colors px-2 py-1.5 rounded-xl hover:bg-slate-800">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                    Add Tag
                </button>
                <button onClick={onDelete} className="flex items-center gap-1.5 text-xs font-bold text-red-400 hover:text-red-300 transition-colors px-2 py-1.5 rounded-xl hover:bg-slate-800">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Delete
                </button>

                <div className="w-px h-5 bg-slate-600" />

                <button onClick={onClear} className="text-xs font-bold text-slate-500 hover:text-slate-300 transition-colors">
                    Cancel
                </button>
            </div>
        </div>
    );
}

// ─── Main Workspace ────────────────────────────────────────────────────────

export default function PatientWorkspace() {
    const canCreate = useCapability(P.PATIENTS_CREATE);

    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [total, setTotal] = useState(0);
    const [selected, setSelected] = useState(new Set());
    const [activePatient, setActivePatient] = useState(null);
    const [wizardOpen, setWizardOpen] = useState(false);
    const [addTagOpen, setAddTagOpen] = useState(false);
    const [tagDraft, setTagDraft] = useState("");
    const [deleteModal, setDeleteModal] = useState({ open: false, count: 0 });

    const searchRef = useRef(null);

    // ── Fetch ──────────────────────────────────────────────────────────────
    const fetch = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await patientsApi.list({ search, sort: "smart", limit: 50 });
            const d = res?.data;
            const list = d?.data || d?.patients || [];
            setPatients(list);
            setTotal(d?.pagination?.total || list.length);
        } catch {}
        finally { if (!silent) setLoading(false); }
    }, [search]);

    useEffect(() => {
        const t = setTimeout(() => fetch(), 300);
        return () => clearTimeout(t);
    }, [fetch]);

    // Ctrl+K shortcut
    useEffect(() => {
        const h = (e) => {
            if ((e.ctrlKey && e.key === "k") || (e.key === "/" && document.activeElement?.tagName !== "INPUT")) {
                e.preventDefault(); searchRef.current?.focus();
            }
            if (e.key === "Escape") setActivePatient(null);
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, []);

    // ── Selection ──────────────────────────────────────────────────────────
    const toggleSel = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const clearSel = () => setSelected(new Set());

    // ── Grouping ───────────────────────────────────────────────────────────
    const { today, balance, recent } = groupPatients(patients);

    // ── Bulk Tag ───────────────────────────────────────────────────────────
    const handleBulkTag = async () => {
        if (!tagDraft.trim()) return;
        await patientsApi.bulkAction({ patientIds: [...selected], action: "tag", payload: { tag: tagDraft.trim() } });
        setTagDraft(""); setAddTagOpen(false); clearSel(); fetch(true);
    };

    // ── Bulk Delete ─────────────────────────────────────────────────────────
    const handleBulkDelete = async () => {
        await Promise.all([...selected].map(id => patientsApi.delete(id)));
        setDeleteModal({ open: false, count: 0 });
        clearSel();
        fetch(true);
    };

    // ── Panel open ─────────────────────────────────────────────────────────
    const handleRowClick = (p) => {
        setActivePatient(prev => prev?._id === p._id ? null : p);
    };

    const hasPanel = !!activePatient;

    return (
        <div className="flex h-full overflow-hidden bg-slate-50/50">

            {/* ── LEFT: Workspace ──────────────────────────────────── */}
            <div className={`flex flex-col min-w-0 overflow-hidden transition-all duration-300 ${hasPanel ? "flex-1" : "w-full max-w-5xl mx-auto"}`}>
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                    {/* ── Page Header ───────────────────────────────── */}
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Patients</h1>
                            <p className="text-sm text-slate-400 font-medium mt-0.5">
                                Manage {total.toLocaleString()} active patient records and histories
                            </p>
                        </div>

                        <div className="flex items-center gap-2.5 flex-shrink-0">
                            {/* Import */}
                            <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
                                <ArrowUpTrayIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                                Import
                            </button>
                            {/* Export */}
                            <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
                                <ArrowDownTrayIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                                Export
                            </button>
                            {/* New Patient */}
                            {canCreate && (
                                <button
                                    onClick={() => setWizardOpen(true)}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold shadow-lg shadow-violet-500/25 transition-all active:scale-95"
                                >
                                    <PlusIcon className="w-4 h-4 stroke-[2.5]" />
                                    New Patient
                                </button>
                            )}
                        </div>
                    </div>

                    {/* ── Command Search ─────────────────────────────── */}
                    <CommandSearchBar value={search} onChange={setSearch} inputRef={searchRef} />

                    {/* ── Patient List ───────────────────────────────── */}
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-28 gap-4">
                            <div className="w-10 h-10 rounded-2xl bg-violet-50 flex items-center justify-center">
                                <div className="w-5 h-5 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
                            </div>
                            <p className="text-sm font-semibold text-slate-400">Loading patients…</p>
                        </div>
                    ) : patients.length === 0 ? (
                        <div className="text-center py-28">
                            <div className="w-16 h-16 mx-auto rounded-3xl bg-violet-50 border border-violet-100 flex items-center justify-center mb-5">
                                <svg className="w-8 h-8 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
                                </svg>
                            </div>
                            <p className="text-lg font-black text-slate-500">
                                {search ? `No patients matching "${search}"` : "No patients yet"}
                            </p>
                            <p className="text-sm text-slate-400 mt-1.5">
                                {search ? "Try a different search or command" : "Register your first patient to begin"}
                            </p>
                            {!search && canCreate && (
                                <button onClick={() => setWizardOpen(true)}
                                    className="mt-6 px-6 py-3 bg-violet-600 text-white text-sm font-bold rounded-2xl hover:bg-violet-700 shadow-lg shadow-violet-500/25 transition-all">
                                    + Register First Patient
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-5 pb-24">
                            <PatientGroup
                                dot="emerald" title="Appointments Today" count={today.length}
                                patients={today} selected={selected}
                                onSelect={toggleSel} onRowClick={handleRowClick} onRefresh={() => fetch(true)}
                            />
                            <PatientGroup
                                dot="red" title="Balance Due" count={balance.length}
                                patients={balance} selected={selected}
                                onSelect={toggleSel} onRowClick={handleRowClick} onRefresh={() => fetch(true)}
                            />
                            <PatientGroup
                                dot="slate" title="Recent Patients" count={recent.length}
                                patients={recent} selected={selected}
                                onSelect={toggleSel} onRowClick={handleRowClick} onRefresh={() => fetch(true)}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* ── RIGHT: Context Panel ──────────────────────────────── */}
            {hasPanel && (
                <div className="w-[380px] flex-shrink-0 border-l border-slate-100 bg-white h-full shadow-xl shadow-slate-200/40 transition-all duration-300">
                    <WorkspaceContextPanel
                        patient={activePatient}
                        onClose={() => setActivePatient(null)}
                        onTagsChanged={() => fetch(true)}
                    />
                </div>
            )}

            {/* ── Floating Bulk Bar ─────────────────────────────────── */}
            <BulkActionBar
                selectedIds={[...selected]}
                onClear={clearSel}
                onBulkSMS={() => {
                    // Demo: open WhatsApp for first selected
                    const p = patients.find(pt => selected.has(pt._id));
                    if (p?.phone) window.open(`https://wa.me/${p.phone.replace(/\D/g, "")}`, "_blank");
                }}
                onAddTag={() => setAddTagOpen(true)}
                onDelete={() => setDeleteModal({ open: true, count: selected.size })}
            />

            {/* ── Add Tag Modal (bulk) ──────────────────────────────── */}
            {addTagOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                    <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 space-y-4">
                        <h3 className="text-base font-black text-slate-800">Add Tag to {selected.size} patient(s)</h3>
                        <input autoFocus type="text" value={tagDraft}
                            onChange={e => setTagDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") handleBulkTag(); if (e.key === "Escape") setAddTagOpen(false); }}
                            placeholder="e.g. orthodontics, vip, recall…"
                            className="w-full text-sm font-medium px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
                        />
                        <div className="flex gap-3">
                            <button onClick={handleBulkTag}
                                className="flex-1 py-3 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition-all">
                                Add Tag
                            </button>
                            <button onClick={() => setAddTagOpen(false)}
                                className="px-5 py-3 bg-slate-100 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-200 transition-all">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Patient Wizard ────────────────────────────────────── */}
            <PatientRegistrationWizard
                open={wizardOpen}
                onClose={() => setWizardOpen(false)}
                onCreated={() => fetch()}
            />

            {deleteModal.open && (
                <AppModal
                    isOpen={deleteModal.open}
                    onClose={() => setDeleteModal({ open: false, count: 0 })}
                    onConfirm={handleBulkDelete}
                    title="Delete Patients"
                    message={`Delete ${deleteModal.count} patient(s)? This action cannot be undone.`}
                    variant="danger"
                    confirmText="Delete"
                />
            )}
        </div>
    );
}
