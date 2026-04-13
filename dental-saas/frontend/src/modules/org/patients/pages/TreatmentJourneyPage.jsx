/**
 * TreatmentJourneyPage.jsx — Kanban Treatment Board v1.0
 *
 * Pixel-faithful to the design screenshot:
 *   Board / Timeline view toggle
 *   Kanban columns: Consultation · Active Treatment · Follow-Up · Retention
 *   Treatment card with patient, treatment type, progress bar
 *   Context panel: milestones + budget outlook
 *   "+ Start New Journey" CTA
 */
import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

// ─── Mock data — replace with real API once treatment aggregate endpoint is ready ──
const MOCK_PATIENTS = [
    {
        id: "1",
        name: "Ahmed Ali",
        initials: "AA",
        gradient: "from-violet-400 to-purple-600",
        treatment: "Diagnosis",
        doctor: "Dr. Sarah Miller",
        progress: 20,
        column: "consultation",
        priority: "high",
        priorityLabel: "High Priority",
        priorityColor: "text-orange-600 bg-orange-50 border-orange-200",
        note: "Scan Pending",
    },
    {
        id: "2",
        name: "Ziad Kareem",
        initials: "ZK",
        gradient: "from-emerald-400 to-teal-600",
        treatment: "Scan Pending",
        doctor: "Dr. Sarah Miller",
        progress: 45,
        column: "consultation",
        priority: "critical",
        priorityLabel: "Urgent",
        priorityColor: "text-red-600 bg-red-50 border-red-200",
        note: "Scan Pending",
    },
    {
        id: "3",
        name: "Mariam Said",
        initials: "MS",
        treatment: "Invisalign",
        note: "Aligner Set #8/24",
        progress: 35,
        column: "active",
        isPhoto: true,
        gradient: "from-rose-400 to-pink-600",
        milestones: [
            { label: "Initial Consultation & Scans", date: "Jan 12, 2024", status: "done" },
            { label: "Treatment Plan Approval", date: "Jan 18, 2024", status: "done" },
            { label: "Invisalign Active Phase (1/24)", subtitle: "Next Appointment: Feb 28", status: "active", alignersWorn: 8, alignersTotal: 24 },
            { label: "Refinement & Retainers", subtitle: "Estimated: July 2024", status: "pending" },
        ],
        budget: { total: 57000, due: 12000, currency: "EGP" },
    },
    {
        id: "4",
        name: "Omar Lutfi",
        initials: "OL",
        gradient: "from-sky-400 to-blue-600",
        treatment: "Regular Checkup",
        note: "Scaling & Polishing",
        progress: 60,
        column: "active",
    },
    {
        id: "5",
        name: "Hana Mohamed",
        initials: "HM",
        gradient: "from-amber-400 to-orange-500",
        treatment: "Braces",
        note: "6 Month Follow-Up",
        progress: 78,
        column: "followup",
    },
    {
        id: "6",
        name: "Karim Farouk",
        initials: "KF",
        gradient: "from-blue-400 to-indigo-600",
        treatment: "Implant",
        note: "Retention Check",
        progress: 95,
        column: "retention",
    },
];

const COLUMNS = [
    { id: "consultation", label: "Consultation",     count: 12, color: "text-slate-600", dot: "bg-slate-400" },
    { id: "active",       label: "Active Treatment", count: 24, color: "text-violet-600", dot: "bg-violet-500" },
    { id: "followup",     label: "Follow-Up",        count: 8,  color: "text-blue-600",   dot: "bg-blue-500" },
    { id: "retention",    label: "Retention",        count: 5,  color: "text-emerald-600", dot: "bg-emerald-500" },
];

// ─── Treatment Card ─────────────────────────────────────────────────────────

function TreatmentCard({ patient, selected, onClick }) {
    return (
        <div
            onClick={() => onClick(patient)}
            className={`bg-white rounded-2xl p-4 border cursor-pointer transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 ${
                selected
                    ? "border-violet-400 ring-2 ring-violet-400/30 shadow-lg shadow-violet-500/10"
                    : "border-slate-100 shadow-sm"
            }`}
        >
            {/* Treatment type badge */}
            {patient.treatment && (
                <div className="mb-3">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${
                        patient.treatment === "Invisalign"      ? "bg-violet-50 text-violet-700 border-violet-200" :
                        patient.treatment === "Regular Checkup" ? "bg-blue-50 text-blue-700 border-blue-200" :
                        patient.treatment === "Diagnosis"       ? "bg-amber-50 text-amber-700 border-amber-200" :
                        "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}>
                        {patient.treatment}
                    </span>
                </div>
            )}

            {/* Priority badge (Consultation) */}
            {patient.priority && (
                <div className="mb-2">
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${patient.priorityColor}`}>
                        {patient.priorityLabel}
                    </span>
                </div>
            )}

            {/* Patient identity */}
            <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${patient.gradient} flex items-center justify-center text-white text-xs font-black shadow-sm flex-shrink-0`}>
                    {patient.initials}
                </div>
                <div>
                    <p className="text-sm font-bold text-slate-800">{patient.name}</p>
                    <p className="text-xs text-slate-400">{patient.note || patient.doctor || ""}</p>
                </div>
                {/* 3-dot menu */}
                <button className="ml-auto w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"/>
                    </svg>
                </button>
            </div>

            {/* Progress */}
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Phase Completion</span>
                    <span className="text-[10px] font-black text-slate-500">{patient.progress}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-500"
                        style={{ width: `${patient.progress}%` }}
                    />
                </div>
            </div>
        </div>
    );
}

// ─── Milestone Item ────────────────────────────────────────────────────────

function MilestoneItem({ milestone }) {
    const { label, date, subtitle, status, alignersWorn, alignersTotal } = milestone;

    const icons = {
        done:    <div className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0"><svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg></div>,
        active:  <div className="w-6 h-6 rounded-full border-2 border-violet-600 bg-white flex items-center justify-center flex-shrink-0"><div className="w-2.5 h-2.5 rounded-full bg-violet-600" /></div>,
        pending: <div className="w-6 h-6 rounded-full border-2 border-slate-200 bg-white flex-shrink-0" />,
    };

    return (
        <div className="flex items-start gap-3">
            {icons[status]}
            <div className="flex-1 pb-4">
                <div className="flex items-start justify-between">
                    <div>
                        <p className={`text-sm font-bold ${status === "pending" ? "text-slate-400" : "text-slate-800"}`}>
                            {label}
                        </p>
                        {(date || subtitle) && (
                            <p className="text-xs text-slate-400 mt-0.5">{date || subtitle}</p>
                        )}
                    </div>
                    {status !== "pending" && (
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg ${
                            status === "done"   ? "bg-violet-500 text-white" :
                            status === "active" ? "text-violet-600 border border-violet-300 bg-violet-50" : ""
                        }`}>
                            {status.toUpperCase()}
                        </span>
                    )}
                </div>
                {/* Aligners progress */}
                {status === "active" && alignersWorn != null && (
                    <div className="mt-2.5 bg-slate-50 rounded-xl px-3 py-2">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Aligners Worn</span>
                            <span className="text-[10px] font-black text-slate-600">{alignersWorn} / {alignersTotal}</span>
                        </div>
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-violet-500 to-purple-600 rounded-full"
                                style={{ width: `${(alignersWorn / alignersTotal) * 100}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Context Panel (Board right side) ──────────────────────────────────────

function JourneyContextPanel({ patient, onClose }) {
    const navigate = useNavigate();
    if (!patient) return null;

    return (
        <div className="h-full flex flex-col bg-white">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
                <span className="text-[10px] font-black text-violet-600 uppercase tracking-[0.15em] bg-violet-50 border border-violet-200 px-3 py-1 rounded-xl">
                    Selected Focus
                </span>
                <button onClick={onClose}
                    className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {/* Patient Identity */}
                <div className="px-6 py-5 flex items-center gap-4 border-b border-slate-50">
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${patient.gradient} flex items-center justify-center text-white text-xl font-black shadow-xl shadow-violet-500/20 ring-4 ring-violet-100`}>
                        {patient.initials}
                    </div>
                    <div className="flex-1">
                        <h2 className="text-xl font-black text-slate-900">{patient.name}</h2>
                        <p className="text-sm text-slate-400 font-medium mt-0.5">{patient.treatment} • Phase 2</p>
                        <div className="flex items-center gap-2 mt-2">
                            <button
                                onClick={() => patient.phone && window.open(`tel:${patient.phone}`)}
                                className="w-8 h-8 rounded-xl bg-violet-600 hover:bg-violet-700 flex items-center justify-center text-white shadow-md shadow-violet-500/25 transition-all">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                            </button>
                            <button className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-emerald-100 hover:text-emerald-600 flex items-center justify-center text-slate-500 transition-all">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a8.72 8.72 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>
                            </button>
                            <button className="px-3 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-600 transition-all">
                                Edit Plan
                            </button>
                        </div>
                    </div>
                </div>

                {/* Treatment Milestones */}
                {patient.milestones && (
                    <div className="px-6 py-5 border-b border-slate-50 space-y-0">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-4">Treatment Milestones</p>
                        <div className="relative">
                            {/* Connector line */}
                            <div className="absolute left-3 top-3 bottom-3 w-px bg-slate-100" />
                            <div className="space-y-0">
                                {patient.milestones.map((m, i) => (
                                    <MilestoneItem key={i} milestone={m} />
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Budget Outlook */}
                {patient.budget && (
                    <div className="px-6 py-5 border-b border-slate-50">
                        <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
                            <div className="flex items-start justify-between">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">Budget Outlook</p>
                                <button className="w-5 h-5 rounded-full border border-slate-600 flex items-center justify-center text-slate-500 text-[10px]">i</button>
                            </div>
                            <div className="flex items-end justify-between">
                                <div>
                                    <p className="text-[10px] text-slate-500 mb-1">Total Treatment Value</p>
                                    <p className="text-2xl font-black text-white">
                                        {patient.budget.total.toLocaleString()}
                                        <span className="text-sm font-bold text-slate-400 ml-1.5">{patient.budget.currency}</span>
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] text-slate-500 mb-1">Balance Due</p>
                                    <p className="text-2xl font-black text-red-400">
                                        {patient.budget.due.toLocaleString()}
                                    </p>
                                </div>
                            </div>
                            <button className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-xl transition-all active:scale-95 shadow-lg shadow-violet-900/40">
                                Send Invoice Reminder
                            </button>
                        </div>
                    </div>
                )}

                <div className="h-4" />
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0">
                <button
                    onClick={() => navigate(`/org/patients/${patient.id}`)}
                    className="w-full py-3.5 bg-white hover:bg-violet-50 text-slate-800 text-sm font-bold rounded-2xl border border-slate-200 hover:border-violet-300 transition-all flex items-center justify-center gap-2"
                >
                    <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    Open Clinical Workspace
                </button>
            </div>
        </div>
    );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function TreatmentJourneyPage() {
    const [view, setView] = useState("board");
    const [selected, setSelected] = useState(null);

    // Group patients by column
    const byColumn = useCallback((colId) =>
        MOCK_PATIENTS.filter(p => p.column === colId),
        []
    );

    const hasPanel = !!selected;

    return (
        <div className="flex h-full overflow-hidden bg-slate-50/50">

            {/* ── Board Area ─────────────────────────────────────────── */}
            <div className={`flex flex-col min-w-0 overflow-hidden transition-all duration-300 ${hasPanel ? "flex-1" : "w-full"}`}>

                {/* ── Top bar ─────────────────────────────────────── */}
                <div className="px-6 py-5 flex items-start justify-between gap-4 bg-white border-b border-slate-100 flex-shrink-0">
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Treatment Journey</h1>
                        <p className="text-sm text-slate-400 font-medium mt-0.5">Track patient progress across clinical phases</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                        {/* Board/Timeline toggle */}
                        <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
                            {["board", "timeline"].map(v => (
                                <button key={v}
                                    onClick={() => setView(v)}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                                        view === v ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"
                                    }`}>
                                    {v}
                                </button>
                            ))}
                        </div>
                        <button className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-violet-500/25 transition-all active:scale-95">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                            Start New Journey
                        </button>
                    </div>
                </div>

                {/* ── Board columns ─────────────────────────────── */}
                <div className="flex-1 overflow-x-auto overflow-y-hidden">
                    <div className="flex h-full gap-4 px-6 py-5" style={{ minWidth: "900px" }}>
                        {COLUMNS.map(col => (
                            <div key={col.id} className="flex flex-col w-64 flex-shrink-0">
                                {/* Column header */}
                                <div className="flex items-center justify-between mb-3 px-1">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                                        <span className="text-sm font-bold text-slate-700">{col.label}</span>
                                        <span className="text-xs font-black text-slate-400">{col.count}</span>
                                    </div>
                                    <button className="w-6 h-6 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors">
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"/></svg>
                                    </button>
                                </div>

                                {/* Cards */}
                                <div className="flex-1 overflow-y-auto space-y-3 px-0.5 pb-4">
                                    {byColumn(col.id).map(p => (
                                        <TreatmentCard
                                            key={p.id}
                                            patient={p}
                                            selected={selected?.id === p.id}
                                            onClick={setSelected}
                                        />
                                    ))}

                                    {/* Add card placeholder */}
                                    <button className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-200 hover:border-violet-300 hover:bg-violet-50/50 text-slate-400 hover:text-violet-500 text-xs font-bold transition-all">
                                        + Add Case
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── 3 Pending actions floating bar ────────────── */}
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-30 pointer-events-none" style={{ left: hasPanel ? "calc(50% - 190px)" : "50%" }}>
                    <div className="pointer-events-auto bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 px-5 py-3 flex items-center gap-4">
                        <span className="text-xs font-bold text-slate-300">3 Pending Actions</span>
                        <div className="flex gap-2">
                            <button className="w-8 h-8 rounded-xl bg-violet-600 hover:bg-violet-700 flex items-center justify-center text-white transition-all">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                            </button>
                            <button className="w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center text-white transition-all">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a8.72 8.72 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>
                            </button>
                            <button className="w-8 h-8 rounded-xl bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-all">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── RIGHT: Journey Context Panel ─────────────────────── */}
            {hasPanel && (
                <div className="w-[380px] flex-shrink-0 border-l border-slate-100 bg-white h-full shadow-xl shadow-slate-200/40 transition-all duration-300">
                    <JourneyContextPanel
                        patient={selected}
                        onClose={() => setSelected(null)}
                    />
                </div>
            )}
        </div>
    );
}
