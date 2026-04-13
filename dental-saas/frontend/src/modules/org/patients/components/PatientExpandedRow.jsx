/**
 * PatientExpandedRow.jsx — Rich Accordion Panel (Patient Directory v2.0)
 *
 * Renders as a <tr><td colSpan=8> inside the patient table.
 * Props:
 *   patient   — patient object from existing useQuery list data (NO extra fetches)
 *   onBook    — callback: navigate to new appointment (passed from PatientsPage)
 *   onProfile — callback: navigate to patient profile  (passed from PatientsPage)
 *
 * INVARIANTS (from Feature Spec):
 *   ❌ NO additional API calls
 *   ❌ NO server state in local useState
 *   ❌ NO React Query mutations triggered here
 *   ✅ Pure UI — reads only from `patient` prop
 *   ✅ All fields safely optional-chained
 */

// ─── Utility helpers (local, no imports from outside) ──────────────────────

function calcAge(dob) {
    if (!dob) return null;
    return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

function fmt(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

// ─── Sub-components ────────────────────────────────────────────────────────

function SectionLabel({ children }) {
    return (
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            {children}
        </p>
    );
}

function InfoRow({ label, value, valueClass = "text-slate-700" }) {
    return (
        <div className="flex items-start justify-between gap-2 py-1.5 border-b border-slate-50 last:border-0">
            <span className="text-xs text-slate-400 font-medium flex-shrink-0">{label}</span>
            <span className={`text-xs font-bold text-right ${valueClass} ${!value ? "text-slate-300 italic" : ""}`}>
                {value || "—"}
            </span>
        </div>
    );
}

function AlertBadge({ alert }) {
    const ALERT_COLORS = {
        inactive:            "bg-slate-100 text-slate-600 border-slate-200",
        balance_due:         "bg-red-50 text-red-600 border-red-200",
        missed_appointment:  "bg-orange-50 text-orange-600 border-orange-200",
        recall_due:          "bg-amber-50 text-amber-700 border-amber-200",
        orthodontic_review:  "bg-blue-50 text-blue-600 border-blue-200",
        incomplete_profile:  "bg-amber-50 text-amber-600 border-amber-200",
    };
    const ICON_MAP = {
        inactive:            "🕐",
        balance_due:         "💰",
        missed_appointment:  "📅",
        recall_due:          "🔔",
        orthodontic_review:  "🦷",
        incomplete_profile:  "⚠️",
    };

    const color = ALERT_COLORS[alert?.type] ?? "bg-red-50 text-red-600 border-red-200";
    const icon  = ICON_MAP[alert?.type] ?? "⚠️";
    const label = alert?.message || alert?.type || "Alert";

    return (
        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border ${color} mb-1 mr-1`}>
            <span className="text-[10px]">{icon}</span>
            {label}
        </span>
    );
}

import { assertPatientDTO } from "@/utils/assertDTO";

// ─── Main Export ────────────────────────────────────────────────────────────

export default function PatientExpandedRow({ patient, onBook, onProfile }) {
    assertPatientDTO(patient, "PatientExpandedRow");
    const displayName = patient?.displayName || "Unknown";
    const age         = calcAge(patient?.dateOfBirth || patient?.dob);
    const balance     = patient?.balance ?? 0;
    const currency    = patient?.currency || "EGP";
    const isPaid      = balance <= 0;
    const alerts      = patient?.alerts || [];
    const criticalAlerts = alerts.filter(a => ["balance_due", "missed_appointment", "orthodontic_review"].includes(a?.type));
    const otherAlerts    = alerts.filter(a => !["balance_due", "missed_appointment", "orthodontic_review"].includes(a?.type));

    // Gender normalisation
    const genderLabel = patient?.gender
        ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)
        : null;

    // Blood type (field may be nested)
    const bloodType = patient?.bloodType || patient?.medicalHistory?.bloodType || null;

    // Insurance
    const insuranceProvider = patient?.insurance?.provider || patient?.insuranceProvider || null;
    const insurancePolicyNo = patient?.insurance?.policyNumber || null;

    // Treatment summary (string or object)
    const treatmentSummary =
        typeof patient?.treatmentSummary === "string"
            ? patient.treatmentSummary
            : patient?.activeTreatment?.name || patient?.lastTreatment || null;

    // Doctor
    const doctorName = patient?.assignedDoctorName || (patient?.assignedDoctorId ? "Assigned" : null);

    // Financial helpers
    const totalPaid = patient?.totalPaid ?? patient?.paid ?? null;

    return (
        <tr>
            <td
                colSpan={8}
                className="p-0 border-b border-slate-100"
                // Prevent row click from bubbling to table row click handlers
                onClick={e => e.stopPropagation()}
            >
                {/* Animated entrance wrapper */}
                <div
                    className="overflow-hidden"
                    style={{ animation: "expandDown 180ms ease-out" }}
                >
                    <style>{`
                        @keyframes expandDown {
                            from { opacity: 0; transform: translateY(-6px); }
                            to   { opacity: 1; transform: translateY(0); }
                        }
                    `}</style>

                    {/* ── Panel body ─────────────────────────────────────── */}
                    <div className="bg-gradient-to-br from-slate-50 to-blue-50/30 px-6 py-5 pl-[4.5rem]">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                            {/* ── SECTION 1: PERSONAL PROFILE ──────────── */}
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-4">
                                <SectionLabel>
                                    <span className="w-5 h-5 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500 text-[10px]">👤</span>
                                    Personal Profile
                                    <button
                                        onClick={onProfile}
                                        className="ml-auto text-[10px] font-bold text-blue-500 hover:text-blue-700 transition-colors"
                                    >
                                        Edit Info →
                                    </button>
                                </SectionLabel>

                                <div className="space-y-0">
                                    <InfoRow
                                        label="Age / Gender"
                                        value={
                                            [age != null ? `${age} yrs` : null, genderLabel]
                                                .filter(Boolean)
                                                .join(" / ") || null
                                        }
                                    />
                                    <InfoRow label="Blood Type"   value={bloodType} />
                                    <InfoRow label="Phone"        value={patient?.phone} />
                                    <InfoRow
                                        label="Insurance"
                                        value={insuranceProvider}
                                    />
                                    {insurancePolicyNo && (
                                        <InfoRow label="Policy #" value={insurancePolicyNo} />
                                    )}
                                    <InfoRow label="Last Visit"   value={fmt(patient?.lastVisit)} />
                                    <InfoRow label="Next Appt."   value={fmt(patient?.nextAppointment)} />
                                </div>

                                {/* Allergy chips */}
                                {patient?.allergies?.length > 0 && (
                                    <div className="mt-3">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Allergies</p>
                                        <div className="flex flex-wrap gap-1">
                                            {patient.allergies.map((a, i) => (
                                                <span
                                                    key={i}
                                                    className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-red-50 text-red-600 border border-red-200 uppercase tracking-wide"
                                                >
                                                    {a}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── SECTION 2: CLINICAL STATUS ─────────────── */}
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-4">
                                <SectionLabel>
                                    <span className="w-5 h-5 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-500 text-[10px]">🦷</span>
                                    Clinical Status
                                </SectionLabel>

                                {/* Critical alerts first */}
                                {criticalAlerts.length > 0 && (
                                    <div className="mb-3 p-2.5 rounded-xl bg-red-50 border border-red-100">
                                        <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1.5">
                                            ⚠ Active Alerts
                                        </p>
                                        {criticalAlerts.map((a, i) => (
                                            <AlertBadge key={i} alert={a} />
                                        ))}
                                    </div>
                                )}

                                {/* Treatment summary */}
                                <div className="mb-3">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                        Treatment
                                    </p>
                                    <p className="text-sm font-semibold text-slate-700">
                                        {treatmentSummary || (
                                            <span className="text-slate-300 italic text-xs">No active treatment</span>
                                        )}
                                    </p>
                                </div>

                                {/* Doctor */}
                                <InfoRow label="Assigned Doctor" value={doctorName} />

                                {/* Other alerts */}
                                {otherAlerts.length > 0 && (
                                    <div className="mt-3">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                                            Other Flags
                                        </p>
                                        <div>
                                            {otherAlerts.map((a, i) => (
                                                <AlertBadge key={i} alert={a} />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Empty state */}
                                {alerts.length === 0 && !treatmentSummary && (
                                    <div className="py-4 text-center">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mx-auto mb-2">
                                            <span className="text-xl">✅</span>
                                        </div>
                                        <p className="text-xs font-semibold text-emerald-600">All Clear</p>
                                        <p className="text-[11px] text-slate-400 mt-0.5">No active clinical flags</p>
                                    </div>
                                )}
                            </div>

                            {/* ── SECTION 3: FINANCIAL SUMMARY ─────────── */}
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-4 flex flex-col">
                                <SectionLabel>
                                    <span className="w-5 h-5 rounded-lg bg-amber-50 flex items-center justify-center text-amber-500 text-[10px]">💰</span>
                                    Financial Summary
                                </SectionLabel>

                                {/* Summary cards */}
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center">
                                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-0.5">
                                            Total Paid
                                        </p>
                                        <p className="text-base font-black text-emerald-600">
                                            {totalPaid != null
                                                ? `${totalPaid.toLocaleString()} ${currency}`
                                                : <span className="text-slate-300 italic text-xs">N/A</span>
                                            }
                                        </p>
                                    </div>

                                    <div className={`rounded-xl border p-3 text-center ${
                                        isPaid
                                            ? "bg-emerald-50 border-emerald-100"
                                            : "bg-red-50 border-red-100"
                                    }`}>
                                        <p className={`text-[10px] font-black uppercase tracking-widest mb-0.5 ${
                                            isPaid ? "text-emerald-500" : "text-red-500"
                                        }`}>
                                            Balance
                                        </p>
                                        <p className={`text-base font-black ${isPaid ? "text-emerald-600" : "text-red-600"}`}>
                                            {isPaid
                                                ? "Paid ✓"
                                                : `${balance.toLocaleString()} ${currency}`
                                            }
                                        </p>
                                    </div>
                                </div>

                                {/* Insurance status */}
                                {insuranceProvider && (
                                    <div className={`text-xs font-bold px-3 py-2 rounded-xl mb-4 ${
                                        patient?.insuranceApproved
                                            ? "bg-blue-50 text-blue-600 border border-blue-100"
                                            : "bg-amber-50 text-amber-600 border border-amber-100"
                                    }`}>
                                        🛡 {insuranceProvider} — {patient?.insuranceApproved ? "Approved" : "Pending Approval"}
                                    </div>
                                )}

                                {/* Quick actions */}
                                <div className="mt-auto space-y-2">
                                    <button
                                        onClick={e => { e.stopPropagation(); onBook?.(); }}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm shadow-blue-600/20 transition-all active:scale-[0.98]"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"
                                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        Book Appointment
                                    </button>

                                    <button
                                        onClick={e => { e.stopPropagation(); onProfile?.(); }}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-all active:scale-[0.98]"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"
                                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                        View Full Profile
                                    </button>
                                </div>
                            </div>

                        </div>

                        {/* ── Patient notes strip ─────────────────────── */}
                        {patient?.notes && (
                            <div className="mt-4 px-4 py-3 rounded-xl bg-white border border-amber-100 text-xs text-slate-600 font-medium flex items-start gap-2">
                                <span className="flex-shrink-0 text-amber-400 mt-0.5">📝</span>
                                <span className="italic leading-relaxed">"{patient.notes}"</span>
                            </div>
                        )}
                    </div>
                </div>
            </td>
        </tr>
    );
}
