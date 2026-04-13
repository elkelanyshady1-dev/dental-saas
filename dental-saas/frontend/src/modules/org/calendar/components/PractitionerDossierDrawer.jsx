/**
 * PractitionerDossierDrawer.jsx — Practitioner Clinical Dossier
 *
 * Right-side slide-over showing full practitioner profile:
 *   - Identity card (avatar, credentials, contact)
 *   - Performance KPI bento grid (4 cards)
 *   - Schedule density bar chart (Mon–Fri)
 *   - Today's appointment queue
 *   - Availability + shift summary
 *
 * Props:
 *   practitioner  — { _id, name, specialty, avatarUrl, status, email, phone }
 *   appointments  — all appointments array (filtered client-side for this doc)
 *   onClose       () => void
 *
 * Design: "Clinical Curator" — no raw dividers, tonal surfaces, Manrope/Inter
 *
 * @module modules/org/calendar/components/PractitionerDossierDrawer
 */
import { useMemo } from "react";

const STATUS_CONFIG = {
    active:    { dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "In Clinic"  },
    available: { dot: "bg-blue-500",    badge: "bg-blue-50 text-blue-700 border-blue-200",          label: "Available"  },
    away:      { dot: "bg-[#c3c6d7]",  badge: "bg-[#f2f4f6] text-[#737686] border-[#c3c6d7]/40",  label: "Away"       },
    on_leave:  { dot: "bg-amber-400",  badge: "bg-amber-50 text-amber-700 border-amber-200",        label: "On Leave"   },
};

// Mock performance KPIs — would be replaced with API data in Phase N
function getMockKPIs(name) {
    const seed = name?.charCodeAt(0) || 72;
    return {
        patients:    800  + (seed * 6  % 600),
        successRate: 94   + (seed      % 5),
        avgProcedure:38   + (seed      % 20),
        revenue:     (0.8 + (seed % 5) * 0.08).toFixed(1),
    };
}

// Map day to mock utilization
function getMockScheduleDensity() {
    return [
        { day: "Mon", pct: 90,  critical: false },
        { day: "Tue", pct: 75,  critical: false },
        { day: "Wed", pct: 95,  critical: true  },
        { day: "Thu", pct: 60,  critical: false },
        { day: "Fri", pct: 100, critical: true  },
    ];
}

export default function PractitionerDossierDrawer({
    practitioner,
    appointments = [],
    onClose,
}) {
    if (!practitioner) return null;

    const sc   = STATUS_CONFIG[practitioner.status] || STATUS_CONFIG.available;
    const kpis = getMockKPIs(practitioner.name);
    const density = getMockScheduleDensity();

    // Filter today's appointments for this practitioner
    const todayStr = new Date().toISOString().split("T")[0];
    const todayAppts = useMemo(() =>
        appointments
            .filter(a => {
                const ds  = new Date(a.startTime).toISOString().split("T")[0];
                const doc = a.practitionerId || a.dentistId || a.doctorId;
                return ds === todayStr && doc === practitioner._id;
            })
            .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
            .slice(0, 5),
        [appointments, practitioner._id, todayStr]
    );

    const initials = (practitioner.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-50 bg-[#191c1e]/10 backdrop-blur-sm"
                onClick={onClose}
                aria-hidden
            />

            {/* Slide-over panel */}
            <aside
                className="fixed right-0 top-0 h-full w-[520px] z-50 flex flex-col bg-[#f7f9fb] shadow-[-24px_0_64px_-8px_rgba(25,28,30,0.12)] overflow-hidden"
                style={{ animation: "slideIn 220ms cubic-bezier(0.25,0.46,0.45,0.94)" }}
            >
                <style>{`
                    @keyframes slideIn {
                        from { transform: translateX(100%); opacity: 0.4; }
                        to   { transform: translateX(0);    opacity: 1; }
                    }
                `}</style>

                {/* ── Header ──────────────────────────────────────────── */}
                <header className="px-8 py-5 bg-white border-b border-[#c3c6d7]/10 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-4">
                        {/* Avatar */}
                        <div className="relative">
                            <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#004ac6]/10 flex items-center justify-center ring-2 ring-[#004ac6]/10">
                                {practitioner.avatarUrl
                                    ? <img src={practitioner.avatarUrl} alt={practitioner.name} className="w-full h-full object-cover" />
                                    : <span className="text-base font-extrabold text-[#004ac6]">{initials}</span>
                                }
                            </div>
                            <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${sc.dot}`} />
                        </div>
                        <div>
                            <h2 className="text-lg font-extrabold text-[#191c1e] font-headline leading-tight">
                                Dr. {practitioner.name}
                            </h2>
                            <p className="text-xs text-[#737686] font-medium">{practitioner.specialty || "Practitioner"}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-full border ${sc.badge}`}>
                            {sc.label}
                        </span>
                        <button
                            id="dossier-close-btn"
                            onClick={onClose}
                            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#f2f4f6] transition-colors text-[#737686]"
                        >
                            <span className="material-symbols-outlined text-xl">close</span>
                        </button>
                    </div>
                </header>

                {/* ── Scrollable Body ──────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto"
                    style={{ scrollbarWidth: "thin", scrollbarColor: "#e0e3e5 transparent" }}
                >
                    <div className="p-7 space-y-6">

                        {/* ── Dossier sub-label ──────────────────────── */}
                        <div>
                            <p className="text-[10px] font-black text-[#004ac6] uppercase tracking-widest mb-1">
                                Practitioner Dossier
                            </p>
                            <p className="text-sm text-[#737686]">
                                {practitioner.specialty
                                    ? `${practitioner.specialty} · Clinical performance overview`
                                    : "Clinical performance overview"
                                }
                            </p>
                        </div>

                        {/* ── KPI Bento Grid ─────────────────────────── */}
                        <div className="grid grid-cols-2 gap-4">
                            <KpiCard
                                icon="group"
                                iconBg="bg-[#004ac6]/10"
                                iconColor="text-[#004ac6]"
                                label="Total Patients"
                                value={kpis.patients.toLocaleString()}
                                delta="+12%"
                                deltaColor="text-emerald-600"
                            />
                            <KpiCard
                                icon="verified_user"
                                iconBg="bg-[#943700]/10"
                                iconColor="text-[#943700]"
                                label="Success Rate"
                                value={`${kpis.successRate}%`}
                                delta="Stable"
                                deltaColor="text-emerald-600"
                            />
                            <KpiCard
                                icon="timer"
                                iconBg="bg-[#495c95]/10"
                                iconColor="text-[#495c95]"
                                label="Avg Procedure"
                                value={`${kpis.avgProcedure}m`}
                                delta="-4 min"
                                deltaColor="text-[#ba1a1a]"
                            />
                            <KpiCard
                                icon="payments"
                                iconBg="bg-emerald-50"
                                iconColor="text-emerald-600"
                                label="Revenue Contrib."
                                value={`$${kpis.revenue}M`}
                                delta="+8%"
                                deltaColor="text-emerald-600"
                            />
                        </div>

                        {/* ── Schedule Density ───────────────────────── */}
                        <div className="bg-white rounded-2xl border border-[#c3c6d7]/10 shadow-[0_4px_16px_-4px_rgba(25,28,30,0.06)] p-6">
                            <div className="flex items-center justify-between mb-5">
                                <div>
                                    <p className="text-sm font-extrabold text-[#191c1e] font-headline">Schedule Density</p>
                                    <p className="text-xs text-[#737686]">Current week utilization</p>
                                </div>
                                <span className="text-[#004ac6] font-bold text-xs bg-[#004ac6]/5 px-3 py-1 rounded-full">
                                    84% Capacity
                                </span>
                            </div>

                            <div className="space-y-4">
                                {density.map(d => (
                                    <div key={d.day} className="flex items-center gap-3">
                                        <span className="w-8 text-[10px] font-black text-[#737686] uppercase">{d.day}</span>
                                        <div className="flex-1 h-2.5 bg-[#f2f4f6] rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-700
                                                    ${d.critical ? "bg-[#2563eb]" : "bg-[#004ac6]"}`}
                                                style={{ width: `${d.pct}%` }}
                                            />
                                        </div>
                                        <span className="w-12 text-right text-[10px] font-black text-[#191c1e]">
                                            {d.pct === 100 ? "MAX" : `${d.pct}%`}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-5 flex items-center gap-5 bg-[#f7f9fb] rounded-xl p-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 bg-[#004ac6] rounded-full" />
                                    <span className="text-[9px] font-black text-[#737686] uppercase tracking-widest">Standard</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 bg-[#2563eb] rounded-full" />
                                    <span className="text-[9px] font-black text-[#737686] uppercase tracking-widest">Critical/Surgeries</span>
                                </div>
                            </div>
                        </div>

                        {/* ── Today's Queue ──────────────────────────── */}
                        <div className="bg-white rounded-2xl border border-[#c3c6d7]/10 shadow-[0_4px_16px_-4px_rgba(25,28,30,0.06)] overflow-hidden">
                            <div className="px-6 py-4 border-b border-[#c3c6d7]/10 flex items-center justify-between">
                                <p className="text-sm font-extrabold text-[#191c1e] font-headline">Today's Queue</p>
                                <span className="text-[10px] font-bold text-[#737686]">
                                    {todayAppts.length} appointment{todayAppts.length !== 1 ? "s" : ""}
                                </span>
                            </div>

                            {todayAppts.length === 0 ? (
                                <div className="flex flex-col items-center py-10 text-center">
                                    <span className="material-symbols-outlined text-[#c3c6d7] text-4xl mb-2">event_available</span>
                                    <p className="text-xs font-bold text-[#737686]">No appointments today</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-[#c3c6d7]/10">
                                    {todayAppts.map(appt => {
                                        const start   = new Date(appt.startTime);
                                        const patient = appt.patient?.nameEnglish
                                            || `${appt.patient?.firstName || ""} ${appt.patient?.lastName || ""}`.trim()
                                            || "Patient";
                                        return (
                                            <div key={appt._id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-[#f7f9fb] transition-colors">
                                                <div className="w-10 h-10 rounded-xl bg-[#004ac6]/8 flex items-center justify-center flex-shrink-0">
                                                    <p className="text-[10px] font-black text-[#004ac6] text-center leading-tight">
                                                        {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                    </p>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-[#191c1e] truncate">{patient}</p>
                                                    <p className="text-[10px] text-[#737686] uppercase font-bold tracking-wide truncate">
                                                        {appt.type || "Appointment"}
                                                    </p>
                                                </div>
                                                <span className="text-[10px] font-bold bg-[#f2f4f6] text-[#737686] px-2 py-1 rounded-lg flex-shrink-0">
                                                    {appt.duration}m
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* ── Availability ───────────────────────────── */}
                        <div
                            className="rounded-2xl p-6 text-white relative overflow-hidden"
                            style={{ background: "linear-gradient(135deg, #191c1e 0%, #2d3133 100%)" }}
                        >
                            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-white/5 rounded-full blur-2xl" />
                            <div className="flex items-center gap-3 mb-5 relative z-10">
                                <span className="material-symbols-outlined text-[#b4c5ff] text-xl">schedule</span>
                                <h3 className="font-headline font-bold text-base">Today's Hours</h3>
                            </div>
                            <div className="space-y-4 relative z-10">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-white/60">Shift Status</span>
                                    <span className={`px-2.5 py-0.5 text-[10px] font-black uppercase rounded-full
                                        ${practitioner.status === "away" || practitioner.status === "on_leave"
                                            ? "bg-[#c3c6d7]/20 text-[#c3c6d7]"
                                            : "bg-[#004ac6] text-white"}`}
                                    >
                                        {practitioner.status === "away" ? "Off Duty" : practitioner.status === "on_leave" ? "On Leave" : "On Duty"}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-white/60">Hours</span>
                                    <span className="font-headline font-bold text-sm">08:00 — 17:30</span>
                                </div>
                                <div className="pt-4 border-t border-white/10">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <span className="material-symbols-outlined text-[#b4c5ff] text-sm">location_on</span>
                                        <span className="text-[9px] font-black text-[#b4c5ff] uppercase tracking-widest">Location</span>
                                    </div>
                                    <p className="text-sm font-bold">Main Campus · West Wing</p>
                                    <p className="text-xs text-white/50">Dental Surgery Unit 4A</p>
                                </div>
                            </div>
                        </div>

                        {/* ── Contact Row ─────────────────────────────── */}
                        {(practitioner.email || practitioner.phone) && (
                            <div className="bg-white rounded-2xl border border-[#c3c6d7]/10 p-5 flex gap-4">
                                {practitioner.email && (
                                    <a
                                        href={`mailto:${practitioner.email}`}
                                        className="flex items-center gap-2 text-xs text-[#737686] hover:text-[#004ac6] transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-lg">mail</span>
                                        {practitioner.email}
                                    </a>
                                )}
                                {practitioner.phone && (
                                    <a
                                        href={`tel:${practitioner.phone}`}
                                        className="flex items-center gap-2 text-xs text-[#737686] hover:text-[#004ac6] transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-lg">call</span>
                                        {practitioner.phone}
                                    </a>
                                )}
                            </div>
                        )}

                    </div>
                </div>

                {/* ── Footer Actions ──────────────────────────────────── */}
                <footer className="px-7 py-4 bg-white border-t border-[#c3c6d7]/10 flex items-center gap-3 flex-shrink-0">
                    <button
                        id="dossier-edit-btn"
                        className="flex-1 py-3 rounded-xl bg-[#f2f4f6] text-[#191c1e] font-bold text-sm hover:bg-[#eceef0] transition-colors flex items-center justify-center gap-2"
                    >
                        <span className="material-symbols-outlined text-base">edit</span>
                        Edit Profile
                    </button>
                    <button
                        id="dossier-schedule-btn"
                        className="flex-1 py-3 rounded-xl bg-[#004ac6] text-white font-bold text-sm hover:bg-[#003ea8] transition-colors shadow-lg shadow-[#004ac6]/20 flex items-center justify-center gap-2 active:scale-95"
                    >
                        <span className="material-symbols-outlined text-base">calendar_month</span>
                        View Full Schedule
                    </button>
                </footer>
            </aside>
        </>
    );
}

// ── KPI Card sub-component ────────────────────────────────────────────────────
function KpiCard({ icon, iconBg, iconColor, label, value, delta, deltaColor }) {
    return (
        <div className="bg-white rounded-2xl border border-[#c3c6d7]/10 shadow-[0_2px_8px_-2px_rgba(25,28,30,0.06)] p-5">
            <div className="flex items-center justify-between mb-4">
                <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center`}>
                    <span className={`material-symbols-outlined text-lg ${iconColor}`}>{icon}</span>
                </div>
                {delta && <span className={`text-[10px] font-black ${deltaColor}`}>{delta}</span>}
            </div>
            <p className="text-2xl font-extrabold text-[#191c1e] font-headline">{value}</p>
            <p className="text-[9px] font-black text-[#737686] uppercase tracking-widest mt-1">{label}</p>
        </div>
    );
}
