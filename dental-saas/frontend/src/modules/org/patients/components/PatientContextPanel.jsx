/**
 * PatientContextPanel.jsx — Right-Side Patient Preview Panel v1.0
 *
 * Clicking a patient in the list opens this panel instead of navigating away.
 * Shows: avatar, name, phone, age, tags, balance, insurance, alerts,
 *         upcoming appointments, treatment plan summary.
 *
 * Props:
 *   patient      {object|null}  — list-level patient object
 *   onClose      () => void
 *   onOpenFull   (patientId) => void  — navigate to full profile
 */
import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { patientsApi } from "../api/patients.api";
import { assertPatientDTO } from "@/utils/assertDTO";

const ALERT_ICONS = {
    inactive: { icon: "🕐", color: "text-slate-500 bg-slate-50 border-slate-200" },
    balance_due: { icon: "💰", color: "text-red-600 bg-red-50 border-red-200" },
    missed_appointment: { icon: "📅", color: "text-orange-600 bg-orange-50 border-orange-200" },
    recall_due: { icon: "🔔", color: "text-amber-600 bg-amber-50 border-amber-200" },
    orthodontic_review: { icon: "🦷", color: "text-blue-600 bg-blue-50 border-blue-200" },
    incomplete_profile: { icon: "⚠️", color: "text-amber-600 bg-amber-50 border-amber-200" },
};

const TAG_COLORS = [
    "bg-violet-50 text-violet-700 border-violet-200",
    "bg-blue-50 text-blue-700 border-blue-200",
    "bg-emerald-50 text-emerald-700 border-emerald-200",
    "bg-amber-50 text-amber-700 border-amber-200",
    "bg-pink-50 text-pink-700 border-pink-200",
];

function tagColor(i) { return TAG_COLORS[i % TAG_COLORS.length]; }

function calcAge(dob) {
    if (!dob) return null;
    return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

function formatDate(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ─── Tag Editor ────────────────────────────────────────────────────────────

function TagEditor({ patientId, tags = [], onTagsChanged }) {
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState("");

    const handleAdd = async () => {
        if (!draft.trim()) return;
        await patientsApi.addTag(patientId, draft.trim());
        onTagsChanged?.();
        setDraft("");
        setAdding(false);
    };

    const handleRemove = async (tag) => {
        await patientsApi.removeTag(patientId, tag);
        onTagsChanged?.();
    };

    return (
        <div className="flex flex-wrap gap-1.5">
            {tags.map((tag, i) => (
                <span key={tag} className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg border ${tagColor(i)} group`}>
                    {tag}
                    <button
                        onClick={() => handleRemove(tag)}
                        className="opacity-0 group-hover:opacity-100 text-current transition-opacity"
                    >
                        ×
                    </button>
                </span>
            ))}
            {adding ? (
                <input
                    autoFocus
                    type="text"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAdding(false); }}
                    onBlur={handleAdd}
                    placeholder="Tag name…"
                    className="text-[11px] font-bold px-2 py-0.5 rounded-lg border border-blue-300 bg-blue-50 text-blue-700 w-24 outline-none focus:ring-1 focus:ring-blue-400"
                />
            ) : (
                <button
                    onClick={() => setAdding(true)}
                    className="text-[11px] font-bold px-2 py-0.5 rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
                >
                    + Tag
                </button>
            )}
        </div>
    );
}

// ─── Main Panel ────────────────────────────────────────────────────────────

export default function PatientContextPanel({ patient, onClose, onTagsChanged }) {
    const navigate = useNavigate();
    if (!patient) return null;

    assertPatientDTO(patient, "PatientContextPanel");
    const displayName = patient.displayName || "Unknown";
    const age = calcAge(patient.dateOfBirth || patient.dob);
    const phone = patient.phone?.replace(/\D/g, "");

    return (
        <div className="flex flex-col h-full bg-white border-l border-slate-100 shadow-xl w-full">
            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg font-black shadow-lg shadow-blue-500/20 flex-shrink-0">
                        {displayName[0]?.toUpperCase()}
                    </div>
                    <div>
                        <h2 className="text-base font-black text-slate-800 leading-tight">{displayName}</h2>
                        {patient.nameArabic && patient.nameEnglish && (
                            <p className="text-xs text-slate-400 font-arabic">{patient.nameArabic}</p>
                        )}
                        <p className="text-[11px] font-mono text-slate-400 mt-0.5">{patient.patientCode}</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors flex-shrink-0"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* ── Scrollable body ─────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

                {/* Core info grid */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Phone</p>
                        <p className="text-sm font-bold text-slate-700">{patient.phone || "—"}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Age</p>
                        <p className="text-sm font-bold text-slate-700">{age != null ? `${age} yrs` : "—"}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Insurance</p>
                        <p className="text-sm font-bold text-slate-700 truncate">{patient.insurance?.provider || "None"}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Last Visit</p>
                        <p className="text-sm font-bold text-slate-700">{formatDate(patient.lastVisit) || "—"}</p>
                    </div>
                </div>

                {/* Balance */}
                {(patient.balance || 0) > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black text-red-400 uppercase tracking-wider">Outstanding Balance</p>
                            <p className="text-lg font-black text-red-600">{patient.balance?.toLocaleString()} {patient.currency || "EGP"}</p>
                        </div>
                        <svg className="w-8 h-8 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                )}

                {/* Alerts */}
                {patient.alerts?.length > 0 && (
                    <div className="space-y-1.5">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Alerts</p>
                        {patient.alerts.map((alert, i) => {
                            const cfg = ALERT_ICONS[alert.type] || { icon: "⚠️", color: "text-slate-600 bg-slate-50 border-slate-200" };
                            return (
                                <div key={i} className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border ${cfg.color}`}>
                                    <span>{cfg.icon}</span>
                                    <span>{alert.message}</span>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Tags */}
                <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Tags</p>
                    <TagEditor
                        patientId={patient._id}
                        tags={patient.tags || []}
                        onTagsChanged={onTagsChanged}
                    />
                </div>

                {/* Next Appointment */}
                {patient.nextAppointment && (
                    <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
                        <p className="text-[10px] font-black text-violet-400 uppercase tracking-wider mb-1">Next Appointment</p>
                        <p className="text-sm font-bold text-violet-700">
                            {new Date(patient.nextAppointment).toLocaleDateString("en-GB", {
                                weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                            })}
                        </p>
                    </div>
                )}
            </div>

            {/* ── Footer actions ──────────────────────────────────────── */}
            <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0 space-y-2">
                <button
                    onClick={() => {
                        if (!patient?._id || patient._id === "undefined") {
                            console.error("[PatientContextPanel] Navigation blocked — invalid patient._id:", patient);
                            return;
                        }
                        navigate(`/org/patients/${patient._id}`);
                    }}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all active:scale-98 shadow-lg shadow-blue-500/20"
                >
                    Open Full Profile →
                </button>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => {
                            if (!patient?._id || patient._id === "undefined") {
                                console.error("[PatientContextPanel] Navigation blocked — invalid patient._id:", patient);
                                return;
                            }
                            navigate(`/org/appointments/new?patientId=${patient._id}`);
                        }}
                        className="py-2 bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-bold rounded-xl border border-violet-200 transition-all"
                    >
                        📅 Appointment
                    </button>
                    {phone && (
                        <button
                            onClick={() => window.open(`https://wa.me/${phone}`, "_blank")}
                            className="py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-200 transition-all"
                        >
                            💬 WhatsApp
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
