/**
 * WorkspaceContextPanel.jsx — Patient File Side Panel v2.0
 *
 * Pixel-faithful to the design screenshot:
 *   - "PATIENT FILE" header + close ×
 *   - Avatar with online/status dot
 *   - Name, age, gender
 *   - Call / WhatsApp / Email action buttons
 *   - TREATMENT SUMMARY card (violet tinted)
 *   - FINANCIAL STATUS (Total Paid + Pending columns)
 *   - RECENT PAYMENTS list + VIEW ALL
 *   - Open Full History dark button
 *
 * Props:
 *   patient       {object|null}
 *   onClose       () => void
 *   onTagsChanged () => void
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { patientsApi } from "../api/patients.api";
import { usePatient } from "../hooks/usePatient";
import { assertPatientDTO } from "@/utils/assertDTO";

/** Inline TagChip (replaces deleted TagChip.jsx) */
function TagChip({ tag, onRemove, size = "sm" }) {
    const py = size === "xs" ? "py-0" : "py-0.5";
    return (
        <span className={`inline-flex items-center gap-1 ${py} px-2 rounded-lg text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200`}>
            {tag}
            {onRemove && (
                <button onClick={() => onRemove(tag)} className="ml-0.5 text-violet-400 hover:text-red-500 transition-colors">×</button>
            )}
        </span>
    );
}

// ─── Avatar (large, with ring) ─────────────────────────────────────────────

function LargeAvatar({ patient }) {
    assertPatientDTO(patient, "LargeAvatar");
    const name = patient.displayName || "?";
    const initials = name.slice(0, 2).toUpperCase();
    const gradients = [
        "from-violet-400 via-purple-500 to-indigo-600",
        "from-blue-400 via-indigo-500 to-violet-600",
        "from-rose-400 via-pink-500 to-fuchsia-600",
        "from-emerald-400 via-teal-500 to-cyan-600",
    ];
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
    const grad = gradients[Math.abs(h) % gradients.length];

    return (
        <div className="relative">
            <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-white text-2xl font-black shadow-xl shadow-violet-500/20 ring-4 ring-white`}>
                {initials}
            </div>
            {/* Online dot */}
            <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-white shadow-sm" />
        </div>
    );
}

// ─── Action Button ─────────────────────────────────────────────────────────

function ActionBtn({ icon, label, color, onClick }) {
    const colors = {
        violet: "bg-violet-600 hover:bg-violet-700 shadow-violet-500/30 text-white",
        green:  "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/30 text-white",
        slate:  "bg-slate-100 hover:bg-slate-200 text-slate-600",
    };
    return (
        <button
            onClick={onClick}
            title={label}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg transition-all active:scale-95 ${colors[color]}`}
        >
            {icon}
        </button>
    );
}

// ─── Treatment Summary Card ────────────────────────────────────────────────

function TreatmentSummaryCard({ treatment }) {
    if (!treatment) return (
        <div className="bg-violet-50/50 border border-violet-100 rounded-2xl p-4">
            <p className="text-xs font-semibold text-slate-400 italic">No active treatment</p>
        </div>
    );

    return (
        <div className="bg-violet-50 border border-violet-200/60 rounded-2xl p-4">
            <div className="flex items-start justify-between mb-2">
                <p className="text-sm font-bold text-slate-800">{treatment.name || "Invisalign Treatment"}</p>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-violet-100 text-violet-700 border border-violet-200 whitespace-nowrap">
                    Phase {treatment.currentPhase || 2}/{treatment.totalPhases || 3}
                </span>
            </div>
            {treatment.notes && (
                <p className="text-[11px] text-slate-500 italic leading-relaxed">
                    "{treatment.notes}"
                </p>
            )}
            {treatment.nextNote && (
                <p className="text-[11px] text-violet-600 font-semibold mt-1.5">
                    {treatment.nextNote}
                </p>
            )}
            {treatment.progress != null && (
                <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Progress</span>
                        <span className="text-[10px] font-black text-violet-600">{treatment.progress}%</span>
                    </div>
                    <div className="h-1.5 bg-violet-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-violet-500 to-purple-600 rounded-full transition-all duration-500"
                            style={{ width: `${treatment.progress}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Payment Row ───────────────────────────────────────────────────────────

function PaymentRow({ label, date, amount }) {
    return (
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                </svg>
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-700 truncate">{label}</p>
                <p className="text-[10px] text-slate-400">{date}</p>
            </div>
            <span className="text-sm font-black text-emerald-600 flex-shrink-0">+{amount?.toLocaleString()}</span>
        </div>
    );
}

// ─── Tag Editor Row ────────────────────────────────────────────────────────

function TagsRow({ patientId, tags = [], onTagsChanged }) {
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState("");

    const addTag = async () => {
        if (!draft.trim()) { setAdding(false); return; }
        await patientsApi.addTag(patientId, draft.trim());
        setDraft(""); setAdding(false); onTagsChanged?.();
    };

    const rmTag = async (tag) => {
        await patientsApi.removeTag(patientId, tag);
        onTagsChanged?.();
    };

    return (
        <div className="flex flex-wrap gap-1.5">
            {tags.map(t => <TagChip key={t} tag={t} onRemove={rmTag} size="xs" />)}
            {adding ? (
                <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addTag(); if (e.key === "Escape") setAdding(false); }}
                    onBlur={addTag} placeholder="Tag…"
                    className="text-[11px] px-2 py-0.5 rounded-md border border-violet-300 bg-violet-50 text-violet-700 w-20 outline-none"
                />
            ) : (
                <button onClick={() => setAdding(true)}
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-dashed border-slate-300 text-slate-400 hover:border-violet-400 hover:text-violet-500 transition-colors">
                    + Tag
                </button>
            )}
        </div>
    );
}

// ─── Main Panel ────────────────────────────────────────────────────────────

function calcAge(dob) {
    if (!dob) return null;
    return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

export default function WorkspaceContextPanel({ patient, onClose, onTagsChanged }) {
    const navigate = useNavigate();

    // Extract financial data from patient aggregate via React Query hook
    const { patient: patientAggregate, isLoading: loadingFin } = usePatient(patient?._id, { enabled: !!patient?._id });
    const financial = patientAggregate?.financial || null;

    if (!patient) return null;

    assertPatientDTO(patient, "WorkspaceContextPanel");
    const displayName = patient.displayName || "Unknown";
    const age = calcAge(patient.dateOfBirth || patient.dob);
    const phone = patient.phone?.replace(/\D/g, "");
    const balance = patient.balance || 0;
    const currency = patient.currency || "EGP";

    // Mock treatment data (replace with real data when treatment aggregate is available)
    const treatment = patient.activeTreatment || null;

    return (
        <div className="h-full flex flex-col bg-white overflow-hidden">

            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">Patient File</span>
                <button
                    onClick={onClose}
                    className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* ── Scrollable Body ─────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto">

                {/* ── Identity Section ──────────────────────────────── */}
                <div className="px-6 py-6 flex flex-col items-center text-center gap-4 border-b border-slate-50">
                    <LargeAvatar patient={patient} />

                    <div>
                        <h2 className="text-lg font-black text-slate-900">{displayName}</h2>
                        {(age || patient.gender) && (
                            <p className="text-sm text-slate-400 font-medium mt-0.5">
                                {[age ? `${age} years old` : null, patient.gender ? (patient.gender === "male" ? "Male" : "Female") : null].filter(Boolean).join(" • ")}
                            </p>
                        )}
                        {patient.nameArabic && patient.nameEnglish && (
                            <p className="text-xs text-slate-400 font-arabic mt-0.5">{patient.nameArabic}</p>
                        )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-3">
                        <ActionBtn
                            label="Call"
                            color="violet"
                            onClick={() => phone && window.open(`tel:${phone}`)}
                            icon={
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                            }
                        />
                        <ActionBtn
                            label="WhatsApp"
                            color="green"
                            onClick={() => phone && window.open(`https://wa.me/${phone}`, "_blank")}
                            icon={
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a8.72 8.72 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                                </svg>
                            }
                        />
                        <ActionBtn
                            label="Email"
                            color="slate"
                            onClick={() => patient.email && window.open(`mailto:${patient.email}`)}
                            icon={
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            }
                        />
                    </div>

                    {/* Tags */}
                    <TagsRow patientId={patient._id} tags={patient.tags || []} onTagsChanged={onTagsChanged} />
                </div>

                {/* ── Treatment Summary ────────────────────────────── */}
                <div className="px-6 py-5 border-b border-slate-50 space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">Treatment Summary</p>
                    <TreatmentSummaryCard treatment={treatment} />
                </div>

                {/* ── Financial Status ─────────────────────────────── */}
                <div className="px-6 py-5 border-b border-slate-50 space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">Financial Status</p>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <p className="text-[10px] font-semibold text-slate-400 mb-1">TOTAL PAID</p>
                            <p className="text-xl font-black text-slate-800">
                                {(financial?.totalPaid ?? 0).toLocaleString()}
                                <span className="text-sm font-bold text-slate-500 ml-1">{currency}</span>
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold text-slate-400 mb-1">PENDING</p>
                            <p className={`text-xl font-black ${balance > 0 ? "text-red-500" : "text-emerald-600"}`}>
                                {balance.toLocaleString()}
                                <span className="text-sm font-bold ml-1">{currency}</span>
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── Recent Payments ──────────────────────────────── */}
                <div className="px-6 py-5 border-b border-slate-50 space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">Recent Payments</p>
                        <button
                            onClick={() => {
                                if (!patient?._id || patient._id === "undefined") {
                                    console.error("[WorkspaceContextPanel] Navigation blocked — invalid patient._id:", patient);
                                    return;
                                }
                                navigate(`/org/patients/${patient._id}/financial`);
                            }}
                            className="text-[10px] font-black text-violet-600 hover:text-violet-700 uppercase tracking-wide transition-colors"
                        >
                            View All
                        </button>
                    </div>
                    <div className="space-y-3">
                        {(financial?.recentPayments?.length > 0) ? (
                            financial.recentPayments.slice(0, 3).map((p, i) => (
                                <PaymentRow
                                    key={i}
                                    label={p.label || p.description || `Payment #${i + 1}`}
                                    date={p.date ? new Date(p.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : ""}
                                    amount={p.amount}
                                />
                            ))
                        ) : (
                            <p className="text-xs text-slate-400 italic text-center py-3">No payment history</p>
                        )}
                    </div>
                </div>

                {/* ── Intelligence Alerts ──────────────────────────── */}
                {patient.alerts?.length > 0 && (
                    <div className="px-6 py-5 border-b border-slate-50 space-y-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">Alerts</p>
                        {patient.alerts.slice(0, 3).map((a, i) => (
                            <div key={i} className={`flex items-start gap-2 text-[11px] font-semibold px-3 py-2 rounded-xl border ${
                                a.severity === "high" ? "bg-red-50 text-red-700 border-red-200" :
                                a.severity === "medium" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                "bg-slate-50 text-slate-600 border-slate-100"
                            }`}>
                                <span className="text-base leading-none">⚠️</span>
                                <span>{a.message}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Spacer ───────────────────────────────────────── */}
                <div className="h-4" />
            </div>

            {/* ── Footer — Open Full History ───────────────────────── */}
            <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0">
                <button
                    onClick={() => {
                        if (!patient?._id || patient._id === "undefined") {
                            console.error("[WorkspaceContextPanel] Navigation blocked — invalid patient._id:", patient);
                            return;
                        }
                        navigate(`/org/patients/${patient._id}`);
                    }}
                    className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-xl shadow-slate-900/20"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Open Full History
                </button>
            </div>
        </div>
    );
}
