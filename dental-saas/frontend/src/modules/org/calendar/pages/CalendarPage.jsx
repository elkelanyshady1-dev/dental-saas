import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useBranch } from "@/context/BranchContext";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { ResourceCapabilityProvider } from "@/context/ResourceCapabilityContext";
import { useSocket } from "@/context/SocketContext";
import { useCalendarDay } from "../hooks/useAppointments";
import { useRealtimeCalendar } from "../hooks/useRealtimeCalendar";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appointmentsApi } from "../api/appointments.api";
import { usePractitioners, filterPractitionersByBranch } from "@/modules/org/staff/hooks/usePractitioners";
import CalendarView from "../components/CalendarView";
import CreateAppointmentDrawer from "../components/CreateAppointmentDrawer";
import EditAppointmentDrawer from "../components/EditAppointmentDrawer";
import PractitionerSelectorModal from "../components/PractitionerSelectorModal";
import PractitionerDossierDrawer from "../components/PractitionerDossierDrawer";
import toast from "react-hot-toast";

// ── Status Legend Config ────────────────────────────────────────────────────
const STATUS_LEGEND = [
    { label: "Open",        bg: "bg-[#eceef0]",  text: "text-[#434655]",  border: "border-[#c3c6d7]/50" },
    { label: "Confirmed",   bg: "bg-blue-50",     text: "text-blue-700",   border: "border-blue-200" },
    { label: "Checked-in",  bg: "bg-emerald-50",  text: "text-emerald-700",border: "border-emerald-200" },
    { label: "In Progress", bg: "bg-indigo-50",   text: "text-indigo-700", border: "border-indigo-200" },
    { label: "Completed",   bg: "bg-slate-100",   text: "text-slate-700",  border: "border-slate-200" },
    { label: "Delayed",     bg: "bg-amber-50",    text: "text-amber-700",  border: "border-amber-200" },
    { label: "Postponed",   bg: "bg-orange-50",   text: "text-orange-700", border: "border-orange-200" },
    { label: "Cancelled",   bg: "bg-red-50",      text: "text-red-700",    border: "border-red-200" },
    { label: "No Show",     bg: "bg-zinc-100",    text: "text-zinc-700",   border: "border-zinc-300" },
];

// ── View Modes ──────────────────────────────────────────────────────────────
const VIEWS = ["Month", "Week", "Day"];

/**
 * CalendarPage.jsx — High-Performance Scheduling Engine (v13.3)
 *
 * Three-View Calendar with Figma-aligned design:
 * - Day View:   Practitioner parallel columns + full appointment grid
 * - Week View:  7-column compact week overview
 * - Month View: Insights / KPI bento + appointment list
 */
export default function CalendarPage() {
    const { user }                                   = useAuth();
    const { selectedBranches, activeBranchId, setActiveBranchId } = useBranch();
    const queryClient                                = useQueryClient();
    const canCreate                                  = useCapability(P.APPOINTMENTS_CREATE);
    const socket                                     = useSocket();
    const navigate                                   = useNavigate();
    const isSocketConnected                          = socket?.connected ?? false;

    const today   = new Date().toISOString().split("T")[0];
    const [date, setDate]                             = useState(today);
    const [doctorId, setDoctorId]                     = useState("");
    const [selectedPractitionerIds, setSelectedPractitionerIds] = useState([]);
    const [showPractitionerModal, setShowPractitionerModal]     = useState(false);
    const [dossierPractitioner,   setDossierPractitioner]       = useState(null);
    const [activeView, setActiveView]                 = useState("Day");
    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [showCreate, setShowCreate]                 = useState(false);
    const [initialSelection, setInitialSelection]     = useState(null);

    const isDentist        = useCapability(P.CALENDAR_SELF_FILTER);
    const effectiveDoctorId = isDentist ? user?._id : doctorId || undefined;

    // ── Data Fetching ─────────────────────────────────────────────────────────
    const {
        data: calendarData,
        isLoading,
        isError,
        error: queryError,
        refetch: refetchCalendar,
    } = useCalendarDay({
        date,
        branchIds: selectedBranches,
        doctorId: effectiveDoctorId,
    });

    // ── Real-time Sync ────────────────────────────────────────────────────────
    useRealtimeCalendar({
        enabled: true,
        onCreated: () => {
            toast.success("New appointment booked", { position: "bottom-right" });
            queryClient.invalidateQueries(["appointments"]);
        },
        onUpdated: () => queryClient.invalidateQueries(["appointments"]),
        onDeleted: () => {
            toast("Appointment removed", { icon: "🗑️", position: "bottom-right" });
            queryClient.invalidateQueries(["appointments"]);
        },
    });

    // ── Mutations ─────────────────────────────────────────────────────────────
    const { mutate: updateAppointment } = useMutation({
        mutationFn: ({ id, data }) => appointmentsApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(["appointments"]);
            toast.success("Schedule updated", { position: "bottom-right" });
        },
        onError: (err) => toast.error(err.response?.data?.message || "Failed to update schedule"),
    });

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleSelectionComplete = (selection) => {
        setInitialSelection(selection);
        setShowCreate(true);
    };

    const handleMoveAppointment = (id, newRange) =>
        updateAppointment({ id, data: { startTime: newRange.startTime, endTime: newRange.endTime, duration: newRange.duration } });

    const handleResizeAppointment = (id, newRange) =>
        updateAppointment({ id, data: { endTime: newRange.endTime, duration: newRange.duration } });

    const shiftDate = (days) => {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        setDate(d.toISOString().split("T")[0]);
    };

    // ── Derived ───────────────────────────────────────────────────────────────
    const displayDate = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric"
    });

    const weekDays = useMemo(() => {
        const d = new Date(date + "T00:00:00");
        // Adjust to Monday of that week
        const monday = new Date(d);
        monday.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
        return Array.from({ length: 7 }, (_, i) => {
            const day = new Date(monday);
            day.setDate(monday.getDate() + i);
            return day;
        });
    }, [date]);

    const weekRangeLabel = useMemo(() => {
        if (weekDays.length < 7) return "";
        const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return `${fmt(weekDays[0])} – ${fmt(weekDays[6])}, ${weekDays[0].getFullYear()}`;
    }, [weekDays]);

    // ── Practitioners: dedicated endpoint — SSOT for doctors ─────────────────
    // calendarData?.practitioners is kept as a fallback for the grid column headers
    // only. The PractitionerSelectorModal + scheduling drawers use this hook.
    const {
        data: allPractitioners = [],
        isLoading: practitionersLoading,
    } = usePractitioners();

    // Merge: prefer dedicated hook (full branchAccess data), fall back to calendar
    const practitioners = allPractitioners.length > 0
        ? allPractitioners
        : (calendarData?.practitioners || []);

    const appointments  = calendarData?.appointments  || [];
    const branches      = calendarData?.branches      || [];

    // Branch-filtered practitioners for the scheduling drawer
    const filteredPractitioners = filterPractitionersByBranch(
        practitioners,
        activeBranchId || null
    );

    // Quick KPI calculations from appointments list
    const totalAppts   = appointments.length;
    const checkedIn    = appointments.filter(a => a.status === "checked_in").length;
    const emergencies  = appointments.filter(a => a.type === "emergency").length;
    const completed    = appointments.filter(a => a.status === "completed").length;
    const occupancy    = practitioners.length > 0
        ? Math.round((appointments.length / (practitioners.length * 8)) * 100)
        : 0;

    return (
        <ResourceCapabilityProvider capabilities={calendarData?.capabilities}>
            <div className="flex flex-col min-h-screen bg-[#f7f9fb]">

                {/* ── Top Bar ───────────────────────────────────────────────── */}
                <header className="h-16 flex justify-between items-center w-full px-8 bg-white/80 backdrop-blur-xl sticky top-0 z-40 border-b border-[#c3c6d7]/20">
                    <div className="flex items-center gap-8">
                        <h2 className="text-xl font-headline font-extrabold tracking-tight text-[#004ac6]">
                            Calendar
                        </h2>
                        <nav className="hidden md:flex gap-6 text-sm">
                            {["Appointments", "Doctors", "Branches"].map(tab => (
                                <button key={tab} className="text-[#434655] font-medium hover:text-[#004ac6] transition-colors">
                                    {tab}
                                </button>
                            ))}
                        </nav>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-[#c3c6d7]/30">
                            <div className={`w-1.5 h-1.5 rounded-full ${isSocketConnected ? "bg-emerald-500" : "bg-[#c3c6d7]"}`} />
                            <span className="text-[10px] font-bold text-[#737686] uppercase tracking-widest">
                                {isSocketConnected ? "Live" : "Offline"}
                            </span>
                        </div>
                        <button className="material-symbols-outlined text-[#434655] p-2 hover:bg-[#eceef0] rounded-full transition-colors">
                            notifications
                        </button>
                        <button
                            id="calendar-settings-btn"
                            onClick={() => navigate("/org/calendar/settings")}
                            title="Calendar Settings"
                            className="material-symbols-outlined text-[#434655] p-2 hover:bg-[#eceef0] rounded-full transition-colors"
                        >
                            settings
                        </button>
                        <button className="material-symbols-outlined text-[#434655] p-2 hover:bg-[#eceef0] rounded-full transition-colors">
                            help_outline
                        </button>
                        {canCreate && (
                            <button
                                onClick={() => { setInitialSelection({}); setShowCreate(true); }}
                                className="bg-[#004ac6] text-white px-4 py-2 rounded-lg font-bold text-sm hover:opacity-90 active:scale-95 transition-all shadow-sm"
                            >
                                + New Booking
                            </button>
                        )}
                    </div>
                </header>

                {/* ── Filter / Control Bar ──────────────────────────────────── */}
                <section className="px-8 py-5 bg-[#f2f4f6] border-b border-[#c3c6d7]/20">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        {/* Left Controls */}
                        <div className="flex flex-wrap items-center gap-3">
                            {/* Branch Filter */}
                            <div className="relative group">
                                <label className="absolute -top-2.5 left-3 bg-[#f2f4f6] px-1 text-[10px] font-bold text-[#004ac6] uppercase tracking-wider pointer-events-none">
                                    Branch
                                </label>
                                <div className="relative">
                                    <select
                                        value={activeBranchId}
                                        onChange={e => setActiveBranchId(e.target.value)}
                                        className="appearance-none bg-white border border-[#c3c6d7]/40 rounded-lg px-4 py-2.5 pr-10 text-sm font-medium text-[#191c1e] focus:outline-none focus:ring-2 focus:ring-[#004ac6]/20 transition-all min-w-[180px]"
                                    >
                                        <option value="">All Branches</option>
                                        {branches.map(b => (
                                            <option key={b.branchId} value={b.branchId}>{b.branchName}</option>
                                        ))}
                                    </select>
                                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-[#737686] pointer-events-none">
                                        expand_more
                                    </span>
                                </div>
                            </div>

                             {/* Doctor Filter — Modal Trigger */}
                            {!isDentist && (
                                <div className="relative group">
                                    <label className="absolute -top-2.5 left-3 bg-[#f2f4f6] px-1 text-[10px] font-bold text-[#004ac6] uppercase tracking-wider pointer-events-none z-10">
                                        Practitioners
                                    </label>
                                    <button
                                        id="practitioners-trigger-btn"
                                        onClick={() => setShowPractitionerModal(true)}
                                        className="flex items-center gap-2.5 bg-white border border-[#c3c6d7]/40 rounded-lg px-4 py-2.5 min-w-[220px] hover:border-[#004ac6]/30 transition-colors group"
                                    >
                                        {selectedPractitionerIds.length > 0 ? (
                                            <>
                                                <span className="bg-[#004ac6]/10 text-[#004ac6] text-[10px] font-bold px-1.5 py-0.5 rounded">
                                                    {selectedPractitionerIds.length} Selected
                                                </span>
                                                <span className="text-sm font-medium text-[#434655] flex-1 text-left truncate">
                                                    {selectedPractitionerIds.length === 1
                                                        ? `Dr. ${practitioners.find(p => p._id === selectedPractitionerIds[0])?.name || ""}`
                                                        : `${selectedPractitionerIds.length} practitioners`
                                                    }
                                                </span>
                                                <button
                                                    onClick={e => { e.stopPropagation(); setSelectedPractitionerIds([]); setDoctorId(""); }}
                                                    className="text-[#737686] hover:text-[#191c1e] transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">close</span>
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                {practitioners.length > 0 && (
                                                    <span className="bg-[#004ac6]/10 text-[#004ac6] text-[10px] font-bold px-1.5 py-0.5 rounded">
                                                        {practitioners.length} Active
                                                    </span>
                                                )}
                                                <span className="text-sm font-medium text-[#434655] flex-1 text-left">All Practitioners</span>
                                                <span className="material-symbols-outlined text-[18px] text-[#737686]">expand_more</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}

                            <div className="h-8 w-px bg-[#c3c6d7]/40" />

                            {/* View Toggle */}
                            <div className="flex items-center bg-white rounded-lg p-1 border border-[#c3c6d7]/30 shadow-sm">
                                {VIEWS.map(v => (
                                    <button
                                        key={v}
                                        onClick={() => setActiveView(v)}
                                        className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all duration-200 ${
                                            activeView === v
                                                ? "bg-[#004ac6] text-white shadow-sm"
                                                : "text-[#434655] hover:bg-[#f2f4f6]"
                                        }`}
                                    >
                                        {v}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Date Navigation */}
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => shiftDate(activeView === "Week" ? -7 : -1)}
                                className="p-2.5 rounded-lg border border-[#c3c6d7]/30 bg-white text-[#434655] hover:border-[#004ac6]/40 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                            </button>
                            <div
                                className="text-base font-headline font-bold text-[#191c1e] cursor-pointer hover:text-[#004ac6] transition-colors min-w-[220px] text-center"
                                onClick={() => setDate(today)}
                                title="Back to today"
                            >
                                {activeView === "Week" ? weekRangeLabel : displayDate}
                            </div>
                            <button
                                onClick={() => shiftDate(activeView === "Week" ? 7 : 1)}
                                className="p-2.5 rounded-lg border border-[#c3c6d7]/30 bg-white text-[#434655] hover:border-[#004ac6]/40 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                            </button>
                        </div>
                    </div>

                    {/* Status Legend Row */}
                    <div className="flex flex-wrap gap-2 mt-5 overflow-x-auto pb-1">
                        {STATUS_LEGEND.map(s => (
                            <span
                                key={s.label}
                                className={`px-3 py-1 text-[10px] font-bold rounded-full border ${s.bg} ${s.text} ${s.border} whitespace-nowrap cursor-default select-none`}
                            >
                                {s.label}
                            </span>
                        ))}
                    </div>
                </section>

                {/* ── Main Calendar Area ────────────────────────────────────── */}
                <div className="flex-1 px-8 py-6">
                    {isLoading ? (
                        <LoadingState />
                    ) : isError ? (
                        <ErrorState error={queryError} onRetry={refetchCalendar} />
                    ) : (
                        <>
                            {/* DAY VIEW */}
                            {activeView === "Day" && (
                                <DayView
                                    calendarData={calendarData}
                                    date={date}
                                    practitioners={practitioners}
                                    appointments={appointments}
                                    onAppointmentClick={setSelectedAppointment}
                                    onSelectionComplete={handleSelectionComplete}
                                    onMoveAppointment={handleMoveAppointment}
                                    onResizeAppointment={handleResizeAppointment}
                                    onViewDossier={setDossierPractitioner}
                                />
                            )}

                            {/* WEEK VIEW */}
                            {activeView === "Week" && (
                                <WeekView
                                    weekDays={weekDays}
                                    practitioners={practitioners}
                                    appointments={appointments}
                                    onDayClick={(d) => {
                                        setDate(d.toISOString().split("T")[0]);
                                        setActiveView("Day");
                                    }}
                                    onAppointmentClick={setSelectedAppointment}
                                    canCreate={canCreate}
                                    onNewBooking={(d) => {
                                        setDate(d.toISOString().split("T")[0]);
                                        setInitialSelection({});
                                        setShowCreate(true);
                                    }}
                                />
                            )}

                            {/* MONTH VIEW */}
                            {activeView === "Month" && (
                                <MonthView
                                    date={date}
                                    appointments={appointments}
                                    practitioners={practitioners}
                                    totalAppts={totalAppts}
                                    checkedIn={checkedIn}
                                    emergencies={emergencies}
                                    completed={completed}
                                    occupancy={occupancy}
                                    onAppointmentClick={setSelectedAppointment}
                                    onDayClick={(d) => {
                                        setDate(d);
                                        setActiveView("Day");
                                    }}
                                />
                            )}
                        </>
                    )}
                </div>

                {/* ── KPI Bento Row — always visible below grid ─────────────── */}
                {!isLoading && !isError && activeView !== "Month" && (
                    <section className="px-8 pb-10 grid grid-cols-2 md:grid-cols-4 gap-5">
                        <KpiCard
                            icon="calendar_month"
                            iconBg="bg-[#004ac6]/10"
                            iconColor="text-[#004ac6]"
                            label="Total Appointments"
                            value={totalAppts}
                            badge={`+${checkedIn} checked in`}
                            badgeColor="text-emerald-600"
                        />
                        <KpiCard
                            icon="person"
                            iconBg="bg-[#495c95]/10"
                            iconColor="text-[#495c95]"
                            label="Active Practitioners"
                            value={practitioners.length}
                            badge="on roster"
                            badgeColor="text-[#737686]"
                        />
                        <KpiCard
                            icon="emergency_home"
                            iconBg="bg-[#ffdad6]"
                            iconColor="text-[#ba1a1a]"
                            label="Emergencies"
                            value={emergencies}
                            badge={emergencies > 0 ? "Requires attention" : "All clear"}
                            badgeColor={emergencies > 0 ? "text-[#ba1a1a]" : "text-emerald-600"}
                        />
                        <div className="p-6 bg-[#004ac6] text-white rounded-2xl flex flex-col justify-between relative overflow-hidden shadow-lg shadow-[#004ac6]/20">
                            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
                            <div className="relative z-10">
                                <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-1">Occupancy Rate</p>
                                <p className="text-2xl font-extrabold">{occupancy}%</p>
                            </div>
                            <div className="relative z-10 mt-3">
                                <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-white rounded-full transition-all duration-700"
                                        style={{ width: `${Math.min(occupancy, 100)}%` }}
                                    />
                                </div>
                                <span className="text-[10px] font-medium bg-white/20 px-2 py-0.5 rounded-full mt-2 inline-block">
                                    {occupancy > 80 ? "Optimal" : occupancy > 50 ? "Moderate" : "Low"}
                                </span>
                            </div>
                        </div>
                    </section>
                )}

                {/* ── Drawers ───────────────────────────────────────────────── */}
                {showCreate && (
                    <CreateAppointmentDrawer
                        branches={calendarData?.branches || []}
                        practitioners={filteredPractitioners}
                        initialSelection={initialSelection}
                        onClose={() => { setShowCreate(false); setInitialSelection(null); }}
                        onCreated={() => refetchCalendar()}
                    />
                )}

                {selectedAppointment && (
                    <EditAppointmentDrawer
                        appointment={selectedAppointment}
                        onClose={() => setSelectedAppointment(null)}
                        onUpdated={() => refetchCalendar()}
                    />
                )}

                {/* ── Practitioner Selector Modal ───────────────────── */}
                {showPractitionerModal && (
                    <PractitionerSelectorModal
                        practitioners={practitioners}
                        selectedIds={selectedPractitionerIds}
                        onApply={(ids) => {
                            setSelectedPractitionerIds(ids);
                            setDoctorId(ids.length === 1 ? ids[0] : "");
                        }}
                        onClose={() => setShowPractitionerModal(false)}
                        onViewDossier={(p) => {
                            setShowPractitionerModal(false);
                            setDossierPractitioner(p);
                        }}
                    />
                )}

                {/* ── Practitioner Dossier Drawer ───────────────────── */}
                {dossierPractitioner && (
                    <PractitionerDossierDrawer
                        practitioner={dossierPractitioner}
                        appointments={appointments}
                        onClose={() => setDossierPractitioner(null)}
                    />
                )}
            </div>
        </ResourceCapabilityProvider>
    );
}

// ── Day View ────────────────────────────────────────────────────────────────
function DayView({ calendarData, date, practitioners, appointments, onAppointmentClick, onSelectionComplete, onMoveAppointment, onResizeAppointment, onViewDossier }) {
    return (
        <div className="bg-white rounded-xl shadow-[0_12px_32px_-4px_rgba(25,28,30,0.06)] overflow-hidden border border-[#c3c6d7]/10 mb-6">
            {/* Doctor Column Header */}
            <div
                className="grid border-b border-[#c3c6d7]/20 bg-[#f2f4f6]/50"
                style={{ gridTemplateColumns: `100px repeat(${Math.max(practitioners.length, 1)}, 1fr)` }}
            >
                <div className="p-4 flex items-end justify-center">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-[#737686]">
                        {new Date().toLocaleTimeString([], { timeZoneName: "short" }).split(" ").pop() || "Time"}
                    </span>
                </div>
                {practitioners.length > 0 ? practitioners.map((doc, idx) => {
                    const isCurrentUser = doc._id === practitioners[0]?._id;
                    return (
                        <div
                            key={doc._id}
                            className={`p-4 border-l border-[#c3c6d7]/20 group/col cursor-pointer hover:bg-[#004ac6]/3 transition-colors ${isCurrentUser && idx === 0 ? "bg-[#004ac6]/5 ring-2 ring-inset ring-[#004ac6]/10" : ""}`}
                            onClick={() => onViewDossier && onViewDossier(doc)}
                            title={`View Dr. ${doc.name}'s dossier`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full overflow-hidden bg-[#004ac6]/10 flex items-center justify-center flex-shrink-0">
                                    {doc.avatarUrl
                                        ? <img src={doc.avatarUrl} alt={doc.name} className="w-full h-full object-cover" />
                                        : <span className="text-xs font-bold text-[#004ac6]">{doc.name?.[0]}</span>
                                    }
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-sm font-bold text-[#191c1e] truncate">Dr. {doc.name}</p>
                                        <span className="material-symbols-outlined text-[13px] text-[#004ac6] opacity-0 group-hover/col:opacity-100 transition-opacity flex-shrink-0">
                                            open_in_new
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-[#737686] font-medium">{doc.specialty || "Practitioner"}</p>
                                </div>
                            </div>
                        </div>
                    );
                }) : (
                    <div className="p-4 border-l border-[#c3c6d7]/20 text-sm text-[#737686] italic">
                        No practitioners assigned
                    </div>
                )}
            </div>

            {/* Grid Body */}
            <div className="h-[600px] overflow-hidden">
                <CalendarView
                    data={calendarData}
                    onAppointmentClick={onAppointmentClick}
                    onSelectionComplete={onSelectionComplete}
                    onMoveAppointment={onMoveAppointment}
                    onResizeAppointment={onResizeAppointment}
                />
            </div>
        </div>
    );
}

// ── Week View ───────────────────────────────────────────────────────────────
function WeekView({ weekDays, practitioners, appointments, onDayClick, onAppointmentClick, canCreate, onNewBooking }) {
    const today = new Date().toDateString();

    const getApptForDay = (day) => {
        const dayStr = day.toISOString().split("T")[0];
        return appointments.filter(a => {
            const apptDate = new Date(a.startTime).toISOString().split("T")[0];
            return apptDate === dayStr;
        });
    };

    const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    return (
        <div className="bg-white rounded-xl shadow-[0_12px_32px_-4px_rgba(25,28,30,0.06)] overflow-hidden border border-[#c3c6d7]/10 mb-6">
            {/* Week Column Header */}
            <div className="grid grid-cols-8 bg-[#f2f4f6]/50 border-b border-[#c3c6d7]/20">
                <div className="p-4 flex items-end justify-center">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-[#737686]">GMT</span>
                </div>
                {weekDays.map((day, i) => {
                    const isToday  = day.toDateString() === today;
                    const dayAppts = getApptForDay(day);
                    const isWeekend = i >= 5;
                    return (
                        <div
                            key={i}
                            onClick={() => !isWeekend && onDayClick(day)}
                            className={`p-4 text-center border-l border-[#c3c6d7]/20 transition-colors cursor-pointer
                                ${isToday    ? "bg-[#004ac6]/5 ring-2 ring-inset ring-[#004ac6]/10" : ""}
                                ${isWeekend  ? "opacity-50 bg-[#f2f4f6]/40 cursor-default" : "hover:bg-[#f2f4f6]"}`}
                        >
                            <p className={`text-xs font-bold uppercase tracking-tighter ${isToday ? "text-[#004ac6]" : "text-[#737686]"}`}>
                                {DAY_NAMES[i]} {day.getDate()}
                            </p>
                            {practitioners.length > 0 && (
                                <div className="mt-2 flex items-center justify-center -space-x-1">
                                    {practitioners.slice(0, 3).map(doc => (
                                        <div key={doc._id} className="w-5 h-5 rounded-full bg-[#004ac6]/10 text-[8px] font-bold text-[#004ac6] flex items-center justify-center ring-1 ring-white">
                                            {doc.name?.[0]}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {dayAppts.length > 0 && (
                                <div className="mt-1">
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isToday ? "bg-[#004ac6] text-white" : "bg-[#eceef0] text-[#434655]"}`}>
                                        {dayAppts.length} appt
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Week Body – time rows */}
            <div className="h-[520px] overflow-y-auto">
                {["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"].map((time) => (
                    <div key={time} className="grid grid-cols-8 border-b border-[#c3c6d7]/10 min-h-[64px]">
                        <div className="flex items-start justify-center pt-2 text-[11px] font-bold text-[#737686]">
                            {time}
                        </div>
                        {weekDays.map((day, i) => {
                            const isWeekend = i >= 5;
                            const isToday2  = day.toDateString() === today;
                            const dayAppts  = getApptForDay(day).filter(a => {
                                const h = new Date(a.startTime).getHours();
                                return `${String(h).padStart(2, "0")}:00` === time;
                            });

                            return (
                                <div
                                    key={i}
                                    className={`border-l border-[#c3c6d7]/10 p-1 relative group
                                        ${isWeekend ? "bg-[#f2f4f6]/30" : ""}
                                        ${isToday2  ? "bg-[#004ac6]/[0.02]" : ""}
                                        ${!isWeekend ? "hover:bg-[#f2f4f6]/50 cursor-pointer" : "cursor-default"}`}
                                    onClick={() => !isWeekend && canCreate && onNewBooking(day)}
                                >
                                    {dayAppts.map(appt => {
                                        const patient = appt.patient?.nameEnglish || appt.patient?.firstName || appt.patientName || "Patient";
                                        return (
                                            <div
                                                key={appt._id}
                                                onClick={(e) => { e.stopPropagation(); onAppointmentClick(appt); }}
                                                className="bg-[#004ac6]/10 border-l-4 border-[#004ac6] rounded-r-lg p-1.5 mb-0.5 cursor-pointer hover:bg-[#004ac6]/20 transition-colors"
                                            >
                                                <p className="text-[10px] font-bold text-[#191c1e] truncate">{patient}</p>
                                                <p className="text-[9px] text-[#434655]">{appt.type}</p>
                                            </div>
                                        );
                                    })}
                                    {isWeekend && (
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                            <span className="text-[9px] text-[#737686] italic">Closed</span>
                                        </div>
                                    )}
                                    {!isWeekend && dayAppts.length === 0 && (
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                            <div className="bg-white px-2 py-1 rounded-full shadow border border-[#c3c6d7]/30 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[12px] text-[#004ac6]">add</span>
                                                <span className="text-[9px] font-bold text-[#434655]">Book</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Month View — 7×5 Calendar Grid ────────────────────────────────────────
function MonthView({ date, appointments, practitioners, totalAppts, checkedIn, emergencies, completed, occupancy, onAppointmentClick, onDayClick }) {
    const [selectedDay, setSelectedDay] = useState(null);

    // Build the month grid
    const baseDate  = new Date(date + "T00:00:00");
    const year      = baseDate.getFullYear();
    const month     = baseDate.getMonth();
    const today     = new Date().toDateString();

    const firstDay  = new Date(year, month, 1);
    const lastDay   = new Date(year, month + 1, 0);
    // Start grid on Monday
    const startOffset = (firstDay.getDay() + 6) % 7; // 0 = Mon
    const totalCells  = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;

    const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const DAY_HEADERS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

    // Index appointments by date string
    const apptByDay = {};
    for (const a of appointments) {
        const ds = new Date(a.startTime).toISOString().split("T")[0];
        if (!apptByDay[ds]) apptByDay[ds] = [];
        apptByDay[ds].push(a);
    }

    const cells = Array.from({ length: totalCells }, (_, i) => {
        const dayNum = i - startOffset + 1;
        if (dayNum < 1 || dayNum > lastDay.getDate()) return null;
        const d     = new Date(year, month, dayNum);
        const ds    = d.toISOString().split("T")[0];
        return { day: dayNum, date: d, ds, appts: apptByDay[ds] || [] };
    });

    const selectedDayAppts = selectedDay ? (apptByDay[selectedDay] || []) : [];
    const selectedDayLabel = selectedDay
        ? new Date(selectedDay + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
        : null;

    const STATUS_DOT = {
        open:        "bg-[#c3c6d7]",
        confirmed:   "bg-blue-500",
        checked_in:  "bg-emerald-500",
        in_progress: "bg-indigo-500",
        completed:   "bg-slate-400",
        delayed:     "bg-amber-500",
        postponed:   "bg-orange-500",
        canceled:    "bg-red-500",
        no_show:     "bg-zinc-400",
    };

    const statusBadge = {
        open:        "bg-[#eceef0] text-[#434655] border-[#c3c6d7]/50",
        confirmed:   "bg-blue-50 text-blue-700 border-blue-200",
        checked_in:  "bg-emerald-50 text-emerald-700 border-emerald-200",
        in_progress: "bg-indigo-50 text-indigo-700 border-indigo-200",
        completed:   "bg-slate-100 text-slate-700 border-slate-200",
        delayed:     "bg-amber-50 text-amber-700 border-amber-200",
        postponed:   "bg-orange-50 text-orange-700 border-orange-200",
        canceled:    "bg-red-50 text-red-700 border-red-200",
        no_show:     "bg-zinc-100 text-zinc-700 border-zinc-300",
    };

    return (
        <div className="flex gap-6 mb-6">
            {/* ── 7×5 Grid ─────────────────────────────────────────────────── */}
            <div className="flex-1 bg-white rounded-xl shadow-[0_12px_32px_-4px_rgba(25,28,30,0.06)] overflow-hidden border border-[#c3c6d7]/10">
                {/* Month Title */}
                <div className="px-6 py-4 flex items-center justify-between border-b border-[#c3c6d7]/20">
                    <h3 className="font-headline font-extrabold text-xl text-[#191c1e]">
                        {MONTH_NAMES[month]} {year}
                    </h3>
                    <div className="flex items-center gap-3">
                        {/* KPI Pills */}
                        <span className="text-[10px] font-bold px-3 py-1 bg-[#004ac6]/10 text-[#004ac6] rounded-full">
                            {totalAppts} appt this month
                        </span>
                        <span className="text-[10px] font-bold px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
                            {completed} completed
                        </span>
                        {emergencies > 0 && (
                            <span className="text-[10px] font-bold px-3 py-1 bg-red-50 text-red-700 rounded-full border border-red-200">
                                {emergencies} emergency
                            </span>
                        )}
                    </div>
                </div>

                {/* Day Headers */}
                <div className="grid grid-cols-7 bg-[#f2f4f6]/50">
                    {DAY_HEADERS.map(d => (
                        <div key={d} className="py-3 text-center text-[10px] font-black text-[#737686] uppercase tracking-widest">
                            {d}
                        </div>
                    ))}
                </div>

                {/* Calendar Cells */}
                <div
                    className="grid grid-cols-7"
                    style={{ gridAutoRows: "minmax(100px, 1fr)" }}
                >
                    {cells.map((cell, i) => {
                        if (!cell) {
                            return <div key={`empty-${i}`} className="border-b border-r border-[#c3c6d7]/10 bg-[#f7f9fb]/50" />;
                        }
                        const isToday   = cell.date.toDateString() === today;
                        const isSelected = cell.ds === selectedDay;
                        const isWeekend = cell.date.getDay() === 0 || cell.date.getDay() === 6;
                        const hasAppts  = cell.appts.length > 0;

                        return (
                            <div
                                key={cell.ds}
                                onClick={() => {
                                    setSelectedDay(cell.ds);
                                }}
                                className={`border-b border-r border-[#c3c6d7]/10 p-2 flex flex-col gap-1 cursor-pointer group transition-colors
                                    ${isSelected ? "bg-[#004ac6]/5 ring-2 ring-inset ring-[#004ac6]/15" : ""}
                                    ${isWeekend && !isSelected ? "bg-[#f2f4f6]/40" : ""}
                                    ${!isSelected && !isWeekend ? "hover:bg-[#f7f9fb]" : ""}`}
                            >
                                {/* Day number */}
                                <div className="flex items-center justify-between">
                                    <span
                                        className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full transition-colors
                                            ${isToday ? "bg-[#004ac6] text-white" : ""}
                                            ${isSelected && !isToday ? "text-[#004ac6]" : ""}
                                            ${!isToday && !isSelected ? (isWeekend ? "text-[#737686]" : "text-[#191c1e]") : ""}`}
                                    >
                                        {cell.day}
                                    </span>
                                    {hasAppts && (
                                        <span className="text-[9px] font-bold text-[#737686] opacity-0 group-hover:opacity-100 transition-opacity">
                                            {cell.appts.length}
                                        </span>
                                    )}
                                </div>

                                {/* Appointment dots / bars */}
                                {hasAppts && (
                                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                                        {cell.appts.slice(0, 3).map((a, ai) => {
                                            const patient = a.patient?.nameEnglish
                                                || `${a.patient?.firstName || ""}`.trim()
                                                || "Patient";
                                            const dot = STATUS_DOT[a.status] || "bg-[#c3c6d7]";
                                            return (
                                                <div
                                                    key={a._id + ai}
                                                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold truncate max-w-full
                                                        ${a.type === "emergency" ? "bg-red-50 text-red-600" : "bg-[#004ac6]/5 text-[#004ac6]"}`}
                                                    onClick={(e) => { e.stopPropagation(); onAppointmentClick(a); }}
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                                                    <span className="truncate">{patient}</span>
                                                </div>
                                            );
                                        })}
                                        {cell.appts.length > 3 && (
                                            <span className="text-[9px] font-bold text-[#737686] px-1">
                                                +{cell.appts.length - 3} more
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Hover: book button */}
                                {!hasAppts && !isWeekend && (
                                    <div className="flex-1 flex items-end opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="text-[9px] text-[#004ac6] font-bold">+ Book</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Right Panel: Day Queue ────────────────────────────────────── */}
            <div className="w-72 flex-shrink-0 flex flex-col gap-4">
                {/* KPI Bento */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-[#c3c6d7]/10 flex flex-col">
                        <p className="text-[10px] font-bold text-[#737686] uppercase tracking-wider">Month Total</p>
                        <p className="text-2xl font-extrabold text-[#191c1e]">{totalAppts}</p>
                        <p className="text-[10px] text-emerald-600 font-bold mt-auto">{checkedIn} checked in</p>
                    </div>
                    <div className="bg-[#004ac6] rounded-xl p-4 flex flex-col relative overflow-hidden shadow-lg shadow-[#004ac6]/20">
                        <div className="absolute -right-3 -bottom-3 w-16 h-16 bg-white/10 rounded-full blur-xl" />
                        <p className="text-[10px] font-bold text-white/70 uppercase tracking-wider relative z-10">Occupancy</p>
                        <p className="text-2xl font-extrabold text-white relative z-10">{occupancy}%</p>
                        <div className="mt-auto w-full bg-white/20 h-1 rounded-full overflow-hidden relative z-10">
                            <div className="h-full bg-white rounded-full" style={{ width: `${Math.min(occupancy,100)}%` }} />
                        </div>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-[#c3c6d7]/10 flex flex-col">
                        <p className="text-[10px] font-bold text-[#737686] uppercase tracking-wider">Completed</p>
                        <p className="text-2xl font-extrabold text-[#191c1e]">{completed}</p>
                    </div>
                    <div className={`bg-white rounded-xl p-4 shadow-sm border flex flex-col ${emergencies > 0 ? "border-red-200" : "border-[#c3c6d7]/10"}`}>
                        <p className="text-[10px] font-bold text-[#737686] uppercase tracking-wider">Emergencies</p>
                        <p className={`text-2xl font-extrabold ${emergencies > 0 ? "text-[#ba1a1a]" : "text-[#191c1e]"}`}>{emergencies}</p>
                        {emergencies > 0 && <p className="text-[9px] text-[#ba1a1a] font-bold mt-auto">Action required</p>}
                    </div>
                </div>

                {/* Selected Day Queue */}
                <div className="bg-white rounded-xl shadow-[0_12px_32px_-4px_rgba(25,28,30,0.06)] border border-[#c3c6d7]/10 flex-1 flex flex-col">
                    <div className="px-4 py-3 border-b border-[#c3c6d7]/20 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-[#191c1e]">
                                {selectedDayLabel || "Select a day"}
                            </p>
                            <p className="text-[10px] text-[#737686]">
                                {selectedDayAppts.length} appointment{selectedDayAppts.length !== 1 ? "s" : ""}
                            </p>
                        </div>
                        {selectedDay && (
                            <button
                                onClick={() => onDayClick(selectedDay)}
                                className="text-[10px] font-bold text-[#004ac6] hover:underline"
                            >
                                Day View →
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto divide-y divide-[#c3c6d7]/10">
                        {!selectedDay && (
                            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                                <span className="material-symbols-outlined text-[#c3c6d7] text-4xl mb-2">touch_app</span>
                                <p className="text-xs font-bold text-[#737686]">Tap a day to see appointments</p>
                            </div>
                        )}
                        {selectedDay && selectedDayAppts.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                                <span className="material-symbols-outlined text-[#c3c6d7] text-4xl mb-2">event_available</span>
                                <p className="text-xs font-bold text-[#737686]">No appointments</p>
                            </div>
                        )}
                        {selectedDayAppts.map(appt => {
                            const patient = appt.patient?.nameEnglish
                                || `${appt.patient?.firstName || ""} ${appt.patient?.lastName || ""}`.trim()
                                || "Unknown Patient";
                            const start = new Date(appt.startTime);
                            const sc    = statusBadge[appt.status] || statusBadge.open;
                            return (
                                <div
                                    key={appt._id}
                                    onClick={() => onAppointmentClick(appt)}
                                    className="flex items-center gap-3 px-4 py-3 hover:bg-[#f7f9fb] cursor-pointer group transition-colors"
                                >
                                    <div className="text-center w-10 flex-shrink-0">
                                        <p className="text-[10px] font-black text-[#191c1e]">
                                            {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        </p>
                                        <p className="text-[9px] text-[#737686]">{appt.duration}m</p>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-[#191c1e] truncate">{patient}</p>
                                        <p className="text-[10px] text-[#737686] truncate">{appt.type}</p>
                                    </div>
                                    <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full border flex-shrink-0 ${sc}`}>
                                        {appt.status?.replace(/_/g, " ")}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Legacy list placeholder (kept for dead-code guard) ───────────────────────
function _LegacyMonthList({ appointments, practitioners, totalAppts, checkedIn, emergencies, completed, occupancy, onAppointmentClick }) {
    const statusColor = {
        open:        "bg-[#eceef0] text-[#434655] border-[#c3c6d7]/50",
        confirmed:   "bg-blue-50 text-blue-700 border-blue-200",
        checked_in:  "bg-emerald-50 text-emerald-700 border-emerald-200",
        in_progress: "bg-indigo-50 text-indigo-700 border-indigo-200",
        completed:   "bg-slate-100 text-slate-700 border-slate-200",
        delayed:     "bg-amber-50 text-amber-700 border-amber-200",
        postponed:   "bg-orange-50 text-orange-700 border-orange-200",
        canceled:    "bg-red-50 text-red-700 border-red-200",
        no_show:     "bg-zinc-100 text-zinc-700 border-zinc-300",
    };

    return (
        <div className="space-y-6 mb-6">
            {/* Bento KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                <div className="col-span-2 p-6 bg-[#f2f4f6] rounded-2xl flex flex-col justify-between min-h-[160px]">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-[#434655] uppercase tracking-widest mb-1">Clinic Utilization</p>
                            <h3 className="text-2xl font-headline font-extrabold text-[#191c1e]">{occupancy}%</h3>
                        </div>
                        <span className="p-2 bg-[#004ac6]/10 text-[#004ac6] rounded-lg material-symbols-outlined">trending_up</span>
                    </div>
                    <div className="w-full bg-[#c3c6d7]/30 h-2 rounded-full overflow-hidden mt-4">
                        <div className="h-full bg-[#004ac6] rounded-full transition-all duration-700" style={{ width: `${Math.min(occupancy, 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-[#737686] mt-2 font-medium">
                        {occupancy > 80 ? "Above weekly target" : "Below target — consider promoting slots"}
                    </p>
                </div>
                <div className="p-6 bg-[#f2f4f6] rounded-2xl flex flex-col justify-between">
                    <div>
                        <p className="text-xs font-bold text-[#434655] uppercase tracking-widest mb-1">Today's Appts</p>
                        <h3 className="text-xl font-headline font-extrabold text-[#191c1e]">{totalAppts}</h3>
                    </div>
                    <div className="flex items-center gap-1 text-emerald-600">
                        <span className="material-symbols-outlined text-sm">arrow_upward</span>
                        <span className="text-xs font-bold">{checkedIn} checked in</span>
                    </div>
                </div>
                <div className="p-6 bg-[#004ac6] text-white rounded-2xl flex flex-col justify-between relative overflow-hidden shadow-lg shadow-[#004ac6]/20">
                    <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
                    <div className="relative z-10">
                        <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-1">Completed</p>
                        <h3 className="text-xl font-headline font-extrabold">{completed}</h3>
                    </div>
                    <div className="relative z-10 flex items-center gap-2">
                        <span className="text-[10px] font-medium bg-white/20 px-2 py-0.5 rounded-full">
                            of {totalAppts} total
                        </span>
                    </div>
                </div>
            </div>

            {/* Appointment List Table */}
            <div className="bg-white rounded-xl shadow-[0_12px_32px_-4px_rgba(25,28,30,0.06)] overflow-hidden border border-[#c3c6d7]/10">
                <div className="px-6 py-4 border-b border-[#c3c6d7]/20 flex items-center justify-between">
                    <h3 className="font-headline font-bold text-[#191c1e]">Today's Appointments</h3>
                    <span className="text-xs text-[#737686] font-medium">{totalAppts} total</span>
                </div>
                {appointments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <span className="material-symbols-outlined text-[#c3c6d7] text-5xl mb-3">event_busy</span>
                        <p className="text-sm font-bold text-[#737686]">No appointments scheduled</p>
                        <p className="text-xs text-[#737686]/60 mt-1">Select a date from the Day or Week view to add bookings</p>
                    </div>
                ) : (
                    <div className="divide-y divide-[#c3c6d7]/10">
                        {appointments.map(appt => {
                            const patient  = appt.patient?.nameEnglish || `${appt.patient?.firstName || ""} ${appt.patient?.lastName || ""}`.trim() || appt.patientName || "Unknown Patient";
                            const doctor   = appt.dentistId?.name || "";
                            const start    = new Date(appt.startTime);
                            const sc       = statusColor[appt.status] || statusColor.open;
                            return (
                                <div
                                    key={appt._id}
                                    onClick={() => onAppointmentClick(appt)}
                                    className="flex items-center gap-4 px-6 py-4 hover:bg-[#f7f9fb] cursor-pointer transition-colors group"
                                >
                                    <div className="w-2 h-10 rounded-full bg-[#004ac6]/30 flex-shrink-0" />
                                    <div className="w-14 text-center flex-shrink-0">
                                        <p className="text-xs font-black text-[#191c1e]">
                                            {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        </p>
                                        <p className="text-[9px] text-[#737686]">{appt.duration}m</p>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-[#191c1e] truncate">{patient}</p>
                                        <p className="text-xs text-[#737686] mt-0.5">{appt.type} {doctor ? `· Dr. ${doctor}` : ""}</p>
                                    </div>
                                    <span className={`px-3 py-1 text-[10px] font-bold rounded-full border flex-shrink-0 ${sc}`}>
                                        {appt.status?.replace(/_/g, " ")}
                                    </span>
                                    <span className="material-symbols-outlined text-[#c3c6d7] group-hover:text-[#004ac6] transition-colors text-[18px]">
                                        chevron_right
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Shared UI Components ────────────────────────────────────────────────────
function KpiCard({ icon, iconBg, iconColor, label, value, badge, badgeColor }) {
    return (
        <div className="bg-white p-5 rounded-2xl shadow-[0_12px_32px_-4px_rgba(25,28,30,0.06)] flex items-center gap-4">
            <div className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                <span className={`material-symbols-outlined ${iconColor}`}>{icon}</span>
            </div>
            <div>
                <p className="text-xs text-[#434655] font-medium">{label}</p>
                <p className="text-2xl font-extrabold text-[#191c1e]">
                    {value}{" "}
                    <span className={`text-xs font-medium ${badgeColor}`}>{badge}</span>
                </p>
            </div>
        </div>
    );
}

function LoadingState() {
    return (
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <div className="w-14 h-14 border-[3px] border-[#004ac6]/10 border-t-[#004ac6] rounded-full animate-spin" />
            <p className="text-[10px] font-black text-[#737686] uppercase tracking-[0.3em] animate-pulse">Loading schedule...</p>
        </div>
    );
}

function ErrorState({ error, onRetry }) {
    return (
        <div className="flex flex-col items-center justify-center py-32 space-y-4 text-center">
            <div className="w-16 h-16 bg-[#ffdad6] text-[#ba1a1a] rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">error</span>
            </div>
            <p className="font-bold text-[#191c1e]">Could not load schedule</p>
            <p className="text-sm text-[#737686] max-w-sm">{error?.message || "Check your connection and try again."}</p>
            <button
                onClick={onRetry}
                className="px-8 py-3 bg-[#ba1a1a] text-white rounded-xl font-bold text-sm shadow-lg hover:opacity-90 transition-opacity"
            >
                Retry
            </button>
        </div>
    );
}
