/**
 * PatientsPage.jsx — Intelligent Patient Workspace v4.0
 *
 * Architecture: Stripe/Linear/Notion-inspired SaaS workspace
 *
 * Layout:
 *   Left (flex-1): CommandSearchBar + Toolbar + PatientList (table with rows)
 *   Right (400px, sliding): PatientContextPanel
 *
 * Features:
 *   - Command search (balance>X, insurance:X, tag:X, lastvisit>6, phone:X, name:X)
 *   - Intelligent sorted rows with priority badges
 *   - Inline phone editing (autosave)
 *   - Patient alerts displayed inline
 *   - Tag chips in row
 *   - Row selection → floating BulkActionBar
 *   - Hover quick-actions
 *   - Context panel (no navigation away)
 *   - Role-based view header badge
 *   - Keyboard navigation (↑↓ Enter Space Ctrl+K)
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PlusIcon } from "@heroicons/react/24/outline";
import { patientsApi } from "../api/patients.api";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { useRoleName } from "@/org/hooks/usePermission";
import { ResourceCapabilityProvider, FieldVisible } from "@/context/ResourceCapabilityContext";
import PatientContextPanel from "../components/PatientContextPanel";
import BulkActionBar from "../components/BulkActionBar";
import PatientRegistrationWizard from "../components/PatientRegistrationWizard";
import PatientExpandedRow from "../components/PatientExpandedRow";
import { assertPatientDTO } from "@/utils/assertDTO";

// ─── Utilities ─────────────────────────────────────────────────────────────

function calcAge(dob) {
    if (!dob) return null;
    return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

function isToday(iso) {
    if (!iso) return false;
    const d = new Date(iso);
    const t = new Date();
    return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}

function fmt(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const COMMAND_DOCS = [
    { cmd: "balance>1000", desc: "Outstanding balance above 1000" },
    { cmd: "insurance:mednet", desc: "MedNet insurance patients" },
    { cmd: "tag:orthodontics", desc: "Tagged as orthodontics" },
    { cmd: "lastvisit>6", desc: "No visit in 6+ months" },
    { cmd: "phone:010", desc: "Phone starting with 010" },
    { cmd: "name:ahmed", desc: "Name contains Ahmed" },
];

const ALERT_META = {
    inactive: { icon: "🕐", label: "Inactive", color: "text-slate-600 bg-slate-100 border-slate-200" },
    balance_due: { icon: "💰", label: "Balance Due", color: "text-red-600 bg-red-50 border-red-200" },
    missed_appointment: { icon: "📅", label: "Missed", color: "text-orange-600 bg-orange-50 border-orange-200" },
    recall_due: { icon: "🔔", label: "Recall", color: "text-amber-600 bg-amber-50 border-amber-200" },
    orthodontic_review: { icon: "🦷", label: "Review", color: "text-blue-600 bg-blue-50 border-blue-200" },
    incomplete_profile: { icon: "⚠️", label: "Incomplete", color: "text-amber-600 bg-amber-50 border-amber-200" },
};

const TAG_COLORS = [
    "bg-violet-50 text-violet-700 border-violet-200",
    "bg-blue-50 text-blue-700 border-blue-200",
    "bg-emerald-50 text-emerald-700 border-emerald-200",
    "bg-amber-50 text-amber-700 border-amber-200",
    "bg-pink-50 text-pink-700 border-pink-200",
];

// ─── CommandSearchBar ──────────────────────────────────────────────────────

function CommandSearchBar({ value, onChange, inputRef }) {
    const [showDocs, setShowDocs] = useState(false);

    const isCommand = value.includes(":") || value.includes(">");

    return (
        <div className="relative">
            <div className={`flex items-center gap-3 bg-white border rounded-2xl px-4 py-3 shadow-sm transition-all ${
                isCommand
                    ? "border-violet-300 ring-2 ring-violet-500/20"
                    : "border-slate-200 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-500/20"
            }`}>
                {/* Prefix icon */}
                <div className="flex-shrink-0">
                    {isCommand ? (
                        <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center">
                            <svg className="w-3.5 h-3.5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                    ) : (
                        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    )}
                </div>

                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    onFocus={() => setShowDocs(true)}
                    onBlur={() => setTimeout(() => setShowDocs(false), 200)}
                    placeholder="Search patients or type a command…"
                    className="flex-1 text-sm font-medium text-slate-800 placeholder:text-slate-400 bg-transparent outline-none"
                />

                {/* Clear */}
                {value && (
                    <button
                        onClick={() => onChange("")}
                        className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors flex-shrink-0"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}

                {/* Keyboard hint */}
                <kbd className="hidden sm:flex text-[10px] font-mono text-slate-300 bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5 flex-shrink-0">
                    Ctrl+K
                </kbd>
            </div>

            {/* Command docs dropdown */}
            {showDocs && !value && (
                <div className="absolute top-full mt-2 left-0 right-0 bg-white rounded-2xl border border-slate-100 shadow-2xl p-4 z-50">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Command Search Examples</p>
                    <div className="grid grid-cols-2 gap-1.5">
                        {COMMAND_DOCS.map(d => (
                            <button
                                key={d.cmd}
                                onClick={() => onChange(d.cmd + " ")}
                                className="text-left px-3 py-2 rounded-xl bg-slate-50 hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-all group"
                            >
                                <span className="text-xs font-mono font-bold text-violet-600 group-hover:text-violet-700">{d.cmd}</span>
                                <p className="text-[11px] text-slate-400 mt-0.5">{d.desc}</p>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Financial Status Chip ─────────────────────────────────────────────────

function FinancialChip({ patient }) {
    const bal = patient.balance || 0;
    const hasTreatment = patient.hasActiveTreatment;
    const currency = patient.currency || "EGP";
    const hasInsurance = patient.insurance?.provider;
    const insApproved = patient.insuranceApproved;

    if (hasTreatment) return <Chip color="blue" icon="⚙" label="Active Treatment" />;
    if (bal > 0) return <Chip color="red" icon="💰" label={`${bal.toLocaleString()} ${currency} Due`} />;
    if (hasInsurance && !insApproved) return <Chip color="amber" icon="🛡" label="Insurance Pending" />;
    return <Chip color="green" icon="✓" label="Paid" />;
}

function Chip({ color, icon, label }) {
    const colors = {
        blue:  "bg-blue-50 text-blue-700 border-blue-200",
        red:   "bg-red-50 text-red-600 border-red-200",
        amber: "bg-amber-50 text-amber-700 border-amber-200",
        green: "bg-emerald-50 text-emerald-700 border-emerald-200",
        gray:  "bg-slate-100 text-slate-500 border-slate-200",
    };
    return (
        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg border ${colors[color]}`}>
            <span className="text-[10px]">{icon}</span>
            {label}
        </span>
    );
}

// ─── Inline Phone Editor ───────────────────────────────────────────────────

function InlinePhoneEdit({ patientId, phone, onSaved }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(phone || "");
    const [saving, setSaving] = useState(false);

    const save = async () => {
        if (draft === phone) { setEditing(false); return; }
        setSaving(true);
        try {
            await patientsApi.update(patientId, { phone: draft });
            onSaved?.();
        } finally {
            setSaving(false);
            setEditing(false);
        }
    };

    return (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            {editing ? (
                <>
                    <input
                        autoFocus
                        type="tel"
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
                        onBlur={save}
                        className="text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-300 rounded-lg px-2 py-0.5 w-32 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                    />
                    {saving && <div className="w-3 h-3 border border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />}
                </>
            ) : (
                <>
                    <span className="text-sm font-semibold text-slate-600 tabular-nums">{phone || "—"}</span>
                    <button
                        onClick={() => { setDraft(phone || ""); setEditing(true); }}
                        className="w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-all opacity-0 group-hover:opacity-100"
                        title="Edit phone"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </button>
                </>
            )}
        </div>
    );
}

// ─── Hover Quick Actions ───────────────────────────────────────────────────

function RowQuickActions({ patient, canCreateAppt }) {
    const navigate = useNavigate();
    const phone = patient.phone?.replace(/\D/g, "");

    return (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-150">
            <QBtn title="Open" color="blue" onClick={e => { e.stopPropagation(); navigate(`/org/patients/${patient._id}`); }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </QBtn>
            {canCreateAppt && (
                <QBtn title="New Appointment" color="violet" onClick={e => { e.stopPropagation(); navigate(`/org/appointments/new?patientId=${patient._id}`); }}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </QBtn>
            )}
            {phone && (
                <QBtn title="WhatsApp" color="green" onClick={e => { e.stopPropagation(); window.open(`https://wa.me/${phone}`, "_blank"); }}>
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><path d="M12 0C5.373 0 0 5.373 0 12c0 2.12.554 4.112 1.528 5.836L.057 23.925l6.244-1.638A11.936 11.936 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.81 9.81 0 01-5.012-1.373l-.36-.214-3.727.977.993-3.631-.234-.374A9.818 9.818 0 012.182 12c0-5.421 4.397-9.818 9.818-9.818 5.422 0 9.818 4.397 9.818 9.818 0 5.422-4.396 9.818-9.818 9.818z" /></svg>
                </QBtn>
            )}
            {/* Billing: hidden for ACADEMIC patients (no billing allowed) */}
            {patient.careType !== "ACADEMIC" && (
                <QBtn title="Billing" color="amber" onClick={e => { e.stopPropagation(); navigate(`/org/patients/${patient._id}/financial`); }}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>
                </QBtn>
            )}
        </div>
    );
}

function QBtn({ title, onClick, color, children }) {
    const colors = {
        blue: "hover:bg-blue-100 text-blue-600",
        violet: "hover:bg-violet-100 text-violet-600",
        green: "hover:bg-emerald-100 text-emerald-600",
        amber: "hover:bg-amber-100 text-amber-600",
    };
    return (
        <button title={title} onClick={onClick} className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${colors[color]}`}>
            {children}
        </button>
    );
}

// ─── PatientRow ────────────────────────────────────────────────────────────

function PatientRow({ patient, selected, onSelect, onExpand, expanded, onContextOpen, onRefresh, canCreateAppt, isFocused, onBook, onProfile }) {
    assertPatientDTO(patient, "PatientRow");
    const displayName = patient.displayName || "Unknown";
    const todayAppt = isToday(patient.nextAppointment);
    const highPrio = patient.priorityScore > 30;
    const age = calcAge(patient.dateOfBirth || patient.dob);
    const topAlerts = (patient.alerts || []).slice(0, 2);

    return (
        <>
            <tr
                role="row"
                tabIndex={0}
                onClick={() => onContextOpen(patient)}
                onKeyDown={e => { if (e.key === " ") { e.preventDefault(); onExpand(patient._id); } if (e.key === "Enter") onContextOpen(patient); }}
                className={`group transition-colors cursor-pointer select-none outline-none ${
                    expanded ? "border-b-0" : "border-b border-slate-50"
                } ${
                    isFocused ? "bg-blue-50/60 ring-1 ring-inset ring-blue-200" : ""
                } ${selected ? "bg-blue-50/40" : expanded ? "bg-blue-50/20" : todayAppt ? "bg-violet-50/30 hover:bg-violet-50/50" : "hover:bg-slate-50/70"}`}
            >
                {/* Checkbox */}
                <td className="w-10 pl-4 pr-1" onClick={e => e.stopPropagation()}>
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onSelect(patient._id)}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 cursor-pointer"
                    />
                </td>

                {/* Priority indicator */}
                <td className="w-2 p-0">
                    {(todayAppt || highPrio) && (
                        <div className={`w-1 h-8 rounded-full ${todayAppt ? "bg-violet-500" : "bg-amber-400"}`} />
                    )}
                </td>

                {/* Patient identity */}
                <td className="px-4 py-3">
                    <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center text-white text-xs font-black ${
                            todayAppt ? "bg-gradient-to-br from-violet-500 to-purple-600" : "bg-gradient-to-br from-blue-500 to-indigo-600"
                        } shadow-sm`}>
                            {displayName[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{displayName}</span>
                                {todayAppt && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-violet-100 text-violet-600 border border-violet-200">TODAY</span>}
                                {patient.status === "incomplete" && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 border border-amber-200">INCOMPLETE</span>}
                                {/* Care Type Badge (v32.0) */}
                                {patient.careType === "ACADEMIC" && (
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">🎓 ACADEMIC</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] font-mono text-slate-400">{patient.patientCode}</span>
                                {patient.nameArabic && patient.nameEnglish && (
                                    <span className="text-[10px] text-slate-400 font-arabic truncate max-w-[100px]">{patient.nameArabic}</span>
                                )}
                            </div>
                            {/* Tags */}
                            {patient.tags?.length > 0 && (
                                <div className="flex gap-1 mt-1 flex-wrap">
                                    {patient.tags.slice(0, 3).map((tag, i) => (
                                        <span key={tag} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${TAG_COLORS[i % TAG_COLORS.length]}`}>{tag}</span>
                                    ))}
                                    {patient.tags.length > 3 && <span className="text-[10px] text-slate-400">+{patient.tags.length - 3}</span>}
                                </div>
                            )}
                        </div>
                    </div>
                </td>

                {/* Phone (inline editable — FLS protected) */}
                <FieldVisible field="phone">
                <td className="px-4 py-3">
                    <InlinePhoneEdit patientId={patient._id} phone={patient.phone} onSaved={onRefresh} />
                </td>
                </FieldVisible>

                {/* Financial Status */}
                <td className="px-4 py-3">
                    <FinancialChip patient={patient} />
                </td>

                {/* Alerts */}
                <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                        {topAlerts.map((a, i) => {
                            const m = ALERT_META[a.type] || { icon: "⚠️", label: a.type, color: "text-slate-500 bg-slate-50 border-slate-200" };
                            return (
                                <span key={i} title={a.message} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg border flex items-center gap-0.5 ${m.color}`}>
                                    <span>{m.icon}</span>
                                    <span>{m.label}</span>
                                </span>
                            );
                        })}
                    </div>
                </td>

                {/* Last visit */}
                <td className="px-4 py-3 text-xs font-semibold text-slate-500">{fmt(patient.lastVisit)}</td>

                {/* Actions — quick actions + dedicated expand chevron */}
                <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                        <RowQuickActions patient={patient} canCreateAppt={canCreateAppt} />

                        {/* Expand / Collapse chevron — independent from context-panel click */}
                        <button
                            title={expanded ? "Collapse" : "Expand summary"}
                            onClick={e => { e.stopPropagation(); onExpand(patient._id); }}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                                expanded
                                    ? "bg-blue-100 text-blue-600 rotate-180"
                                    : "hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                            }`}
                            aria-expanded={expanded}
                            aria-label={expanded ? "Collapse patient summary" : "Expand patient summary"}
                        >
                            <svg
                                className="w-4 h-4 transition-transform duration-200"
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>

            {/* ── Rich Expansion Panel ─────────────────────────────── */}
            {expanded && (
                <PatientExpandedRow
                    patient={patient}
                    onBook={onBook}
                    onProfile={onProfile}
                />
            )}
        </>
    );
}

function InfoCell({ label, value, valueColor = "text-slate-700" }) {
    return (
        <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
            <p className={`text-sm font-semibold ${valueColor} ${!value ? "text-slate-300 italic text-xs" : ""}`}>{value || "Not set"}</p>
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function PatientsPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const roleName = useRoleName();
    const canCreate     = useCapability(P.PATIENTS_CREATE);
    const canCreateAppt = useCapability(P.APPOINTMENTS_CREATE);

    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState("smart");
    const [careTypeFilter, setCareTypeFilter] = useState(""); // "" = All, "PRIVATE", "ACADEMIC"
    const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
    const [wizardOpen, setWizardOpen] = useState(false);

    // Auto-open wizard when navigated with ?new=1 (e.g. from Dashboard)
    useEffect(() => {
        if (searchParams.get("new") === "1") {
            setWizardOpen(true);
            setSearchParams({}, { replace: true }); // clean URL
        }
    }, [searchParams, setSearchParams]);

    // Selection
    const [selected, setSelected] = useState(new Set());
    // Context panel
    const [activePatient, setActivePatient] = useState(null);
    // Expanded rows
    const [expandedId, setExpandedId] = useState(null);
    // Keyboard focus
    const [focusedIdx, setFocusedIdx] = useState(-1);
    // FLS: capabilities from API response
    const [capabilities, setCapabilities] = useState(null);

    const searchRef = useRef(null);

    // ── Fetch ──────────────────────────────────────────────────────────────
    const fetchPatients = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await patientsApi.list({
                search,
                sort,
                page: pagination.page,
                limit: 25,
                ...(careTypeFilter ? { careType: careTypeFilter } : {}),
            });
            const data = res.data;
            const list = data.data || data.patients || data || [];
            setPatients(list);
            // FLS: Store capabilities from API response
            if (data.capabilities) {
                setCapabilities(data.capabilities);
            }
            if (data.pagination) {
                setPagination(p => ({
                    ...p,
                    totalPages: data.pagination.totalPages || 1,
                    total: data.pagination.total || 0,
                }));
            }
        } catch (err) {
            console.error("Failed to fetch patients:", err);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [search, sort, pagination.page]);

    // Reset page to 1 whenever search, sort, or careTypeFilter changes
    useEffect(() => {
        setPagination(p => ({ ...p, page: 1 }));
    }, [search, sort, careTypeFilter]);

    // Debounce search (300ms), but fetch immediately for sort/page changes
    const prevSearchRef = useRef(search);
    useEffect(() => {
        const searchChanged = prevSearchRef.current !== search;
        prevSearchRef.current = search;

        if (searchChanged) {
            const t = setTimeout(() => fetchPatients(), 300);
            return () => clearTimeout(t);
        } else {
            fetchPatients();
        }
    }, [fetchPatients, careTypeFilter]);

    // ── Keyboard shortcuts ────────────────────────────────────────────────
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey && e.key === "k") || (e.key === "/" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA")) {
                e.preventDefault();
                searchRef.current?.focus();
            }
            if (e.key === "Escape") { setActivePatient(null); setExpandedId(null); }
            if (e.key === "ArrowDown" && !e.target.closest("input")) { e.preventDefault(); setFocusedIdx(i => Math.min(i + 1, patients.length - 1)); }
            if (e.key === "ArrowUp"   && !e.target.closest("input")) { e.preventDefault(); setFocusedIdx(i => Math.max(i - 1, 0)); }
            if ((e.key === "Enter" || e.key === " ") && focusedIdx >= 0 && !e.target.closest("input")) {
                e.preventDefault();
                const p = patients[focusedIdx];
                if (p) {
                    if (e.key === " ") setExpandedId(id => id === p._id ? null : p._id);
                    else setActivePatient(p);
                }
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [patients, focusedIdx]);

    // ── Selection helpers ─────────────────────────────────────────────────
    const toggleSelect = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const toggleAll = () => setSelected(s => s.size === patients.length ? new Set() : new Set(patients.map(p => p._id)));

    // ── Bulk action handler ───────────────────────────────────────────────
    const handleBulkAction = async (action, payload) => {
        if (action === "whatsapp") {
            // Open WhatsApp for first selected patient (demo — real impl would queue)
            const first = patients.find(p => selected.has(p._id));
            if (first?.phone) window.open(`https://wa.me/${first.phone.replace(/\D/g, "")}`, "_blank");
            return;
        }
        if (action === "export") {
            const res = await patientsApi.bulkAction({ patientIds: [...selected], action: "export" });
            const csv = ["Name,Phone,Code", ...(res.data.data?.patients || []).map(p => `"${p.nameEnglish}","${p.phone}","${p.patientCode}"`)].join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = "patients.csv"; a.click();
            URL.revokeObjectURL(url);
            return;
        }
        await patientsApi.bulkAction({ patientIds: [...selected], action, payload });
        setSelected(new Set());
        fetchPatients(true);
    };

    const hasPanel = !!activePatient;

    return (
        <ResourceCapabilityProvider capabilities={capabilities}>
        <div className="flex h-full gap-0 max-w-[1600px] mx-auto">
            {/* ── Left: Patient Workspace ──────────────────────────────── */}
            <div className={`flex flex-col min-w-0 transition-all duration-300 ${hasPanel ? "flex-1" : "w-full"}`}>
                <div className="flex-1 overflow-y-auto px-1">
                    <div className="space-y-4 py-1">

                        {/* ── Page Header ─────────────────────────────── */}
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-3">
                                    <h1 className="text-xl font-black text-slate-800 tracking-tight">Patient Directory</h1>
                                    {roleName && (
                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-slate-100 text-slate-500 uppercase tracking-wider border border-slate-200">
                                            {roleName} view
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-slate-400 font-medium mt-0.5">
                                    {loading ? "Loading…" : `${pagination.total.toLocaleString()} patients`}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                {/* Sort toggle */}
                                <select
                                    value={sort}
                                    onChange={e => setSort(e.target.value)}
                                    className="text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                                >
                                    <option value="smart">⚡ Smart Sort</option>
                                    <option value="name">A → Z Name</option>
                                    <option value="recent">Recently Added</option>
                                    <option value="lastvisit">Recent Visit</option>
                                </select>

                                {/* Care Type Filter (v32.0) */}
                                <select
                                    value={careTypeFilter}
                                    onChange={e => setCareTypeFilter(e.target.value)}
                                    className="text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                                    title="Filter by care type"
                                >
                                    <option value="">🏧 All Patients</option>
                                    <option value="PRIVATE">🏥 Private</option>
                                    <option value="ACADEMIC">🎓 Academic</option>
                                </select>

                                {/* Intelligence Run */}
                                <button
                                    onClick={async () => { await patientsApi.runIntelligence(); fetchPatients(true); }}
                                    title="Run patient intelligence analysis"
                                    className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 text-violet-600 hover:bg-violet-100 flex items-center justify-center transition-all"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                    </svg>
                                </button>

                                {canCreate && (
                                    <button
                                        onClick={() => setWizardOpen(true)}
                                        className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all active:scale-95 flex items-center gap-2"
                                    >
                                        <PlusIcon className="w-4 h-4 stroke-[2.5]" />
                                        New Patient
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* ── Command Search ───────────────────────────── */}
                        <CommandSearchBar value={search} onChange={setSearch} inputRef={searchRef} />

                        {/* ── Patient List Table ───────────────────────── */}
                        {loading ? (
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-100 bg-slate-50/40">
                                            <th className="w-10 pl-4 pr-1 py-3"><div className="w-3.5 h-3.5 rounded bg-slate-100" /></th>
                                            <th className="w-2 p-0" />
                                            <th className="text-left px-4 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider">Patient</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider">Phone</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider">Financial Status</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider">Alerts</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider">Last Visit</th>
                                            <th className="px-4 py-3" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...Array(8)].map((_, i) => (
                                            <tr key={i} className="border-b border-slate-50 animate-pulse">
                                                <td className="w-10 pl-4 pr-1 py-3"><div className="w-3.5 h-3.5 rounded bg-slate-100" /></td>
                                                <td className="w-2 p-0" />
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-xl bg-slate-100 flex-shrink-0" />
                                                        <div className="space-y-1.5 flex-1">
                                                            <div className="h-3.5 bg-slate-100 rounded w-32" />
                                                            <div className="h-2.5 bg-slate-50 rounded w-20" />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3"><div className="h-3 bg-slate-100 rounded w-24" /></td>
                                                <td className="px-4 py-3"><div className="h-5 bg-slate-100 rounded-lg w-28" /></td>
                                                <td className="px-4 py-3"><div className="h-5 bg-slate-50 rounded-lg w-16" /></td>
                                                <td className="px-4 py-3"><div className="h-3 bg-slate-100 rounded w-14" /></td>
                                                <td className="px-4 py-3" />
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                                <table className="w-full text-sm" role="grid">
                                    <thead>
                                        <tr className="border-b border-slate-100 bg-slate-50/40">
                                            <th className="w-10 pl-4 pr-1 py-3">
                                                <input
                                                    type="checkbox"
                                                    checked={selected.size === patients.length && patients.length > 0}
                                                    onChange={toggleAll}
                                                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 cursor-pointer"
                                                />
                                            </th>
                                            <th className="w-2 p-0" />
                                            <th className="text-left px-4 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider">Patient</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider">Phone</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider">Financial Status</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider">Alerts</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider">Last Visit</th>
                                            <th className="px-4 py-3" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {patients.length === 0 ? (
                                            <tr>
                                                <td colSpan={8}>
                                                    <div className="py-20 text-center">
                                                        <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                                                            <svg className="w-7 h-7 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
                                                            </svg>
                                                        </div>
                                                        <p className="text-base font-bold text-slate-500">
                                                            {search ? `No results for "${search}"` : "No patients found"}
                                                        </p>
                                                        <p className="text-sm text-slate-400 mt-1">
                                                            {search ? "Try a different search or command" : "Register your first patient to begin"}
                                                        </p>
                                                        {search && canCreate && (
                                                            <button
                                                                onClick={() => setWizardOpen(true)}
                                                                className="mt-5 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 flex items-center gap-2 mx-auto"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                                                </svg>
                                                                Register &quot;{search}&quot; as New Patient
                                                            </button>
                                                        )}
                                                        {!search && canCreate && (
                                                            <button
                                                                onClick={() => setWizardOpen(true)}
                                                                className="mt-5 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20"
                                                            >
                                                                + Register First Patient
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : patients.map((p, idx) => (
                                            <PatientRow
                                                key={p._id}
                                                patient={p}
                                                selected={selected.has(p._id)}
                                                onSelect={toggleSelect}
                                                expanded={expandedId === p._id}
                                                onExpand={(id) => setExpandedId(prev => prev === id ? null : id)}
                                                onContextOpen={(pat) => { setActivePatient(pat); setFocusedIdx(idx); }}
                                                onRefresh={() => fetchPatients(true)}
                                                canCreateAppt={canCreateAppt}
                                                isFocused={focusedIdx === idx}
                                                onBook={() => navigate(`/org/appointments/new?patientId=${p._id}`)}
                                                onProfile={() => navigate(`/org/patients/${p._id}`)}
                                            />
                                        ))}
                                    </tbody>
                                </table>

                                {/* ── Keyboard hint ── */}
                                <div className="px-4 py-2 border-t border-slate-50 bg-slate-50/40 flex items-center gap-3 text-[10px] text-slate-400 font-medium">
                                    <span><kbd className="px-1 py-0.5 bg-white rounded border font-mono">↑↓</kbd> navigate</span>
                                    <span><kbd className="px-1 py-0.5 bg-white rounded border font-mono">Enter</kbd> preview</span>
                                    <span><kbd className="px-1 py-0.5 bg-white rounded border font-mono">Space</kbd> expand</span>
                                    <span><kbd className="px-1 py-0.5 bg-white rounded border font-mono">Ctrl+K</kbd> search</span>
                                    <span><kbd className="px-1 py-0.5 bg-white rounded border font-mono">Esc</kbd> close</span>
                                </div>
                            </div>
                        )}

                        {/* ── Pagination ─────────────────────────── */}
                        {pagination.totalPages > 1 && (
                            <div className="flex items-center justify-center gap-2 pt-1">
                                <button disabled={pagination.page <= 1} onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))} className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition-all">← Prev</button>
                                <span className="text-sm text-slate-500 font-medium px-3">Page <span className="font-black text-slate-700">{pagination.page}</span> of {pagination.totalPages}</span>
                                <button disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))} className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition-all">Next →</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Right: Context Panel ─────────────────────────────────── */}
            {hasPanel && (
                <div className="w-[380px] flex-shrink-0 border-l border-slate-100 bg-white h-full overflow-hidden transition-all duration-300">
                    <PatientContextPanel
                        patient={activePatient}
                        onClose={() => setActivePatient(null)}
                        onTagsChanged={() => fetchPatients(true)}
                    />
                </div>
            )}

            {/* ── Floating Bulk Action Bar ─────────────────────────────── */}
            <BulkActionBar
                selectedIds={[...selected]}
                onClear={() => setSelected(new Set())}
                onAction={handleBulkAction}
            />

            {/* ── Registration Wizard ──────────────────────────────────── */}
            <PatientRegistrationWizard
                open={wizardOpen}
                onClose={() => setWizardOpen(false)}
                onCreated={() => { setWizardOpen(false); fetchPatients(true); }}
            />
        </div>
        </ResourceCapabilityProvider>
    );
}
