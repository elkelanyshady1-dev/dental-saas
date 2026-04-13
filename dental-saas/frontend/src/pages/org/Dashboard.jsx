/**
 * Dashboard (Design System v4.0)
 * Implements the DentoPrecision Enterprise Clinical Overview layout exactly.
 *
 * Sections:
 *  1. System Banners (trial + email verification) — preserved from v2.2
 *  2. Welcome Banner
 *  3. KPI Cards (4)
 *  4. Quick Actions (3 inline cards)
 *  5. Main 70/30 Grid
 *     LEFT:  Today's Schedule Preview
 *     RIGHT: Clinic Insights (Chair Utilization + Busy Hours + Staff Snapshot)
 *
 * Data: fetched from /org/dashboard/overview — same endpoint as before.
 * Falls back to onboarding view for new orgs.
 */
import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useBranch } from "@/context/BranchContext";
import api from "@/services/api";

// ─── Utility ──────────────────────────────────────────────────────────────────
const fmt = (n) => (n != null ? n.toLocaleString() : "—");

// ─── System Banners (preserved from v2.2) ─────────────────────────────────────
function TrialBanner({ trialEndDate }) {
    const [daysLeft, setDaysLeft] = useState(null);
    useEffect(() => {
        if (!trialEndDate) return;
        const diff = Math.ceil((new Date(trialEndDate) - new Date()) / (1000 * 60 * 60 * 24));
        setDaysLeft(Math.max(0, diff));
    }, [trialEndDate]);
    if (daysLeft === null) return null;
    const expired  = daysLeft === 0;
    const expiring = daysLeft <= 3;
    return (
        <div className={`rounded-2xl px-5 py-4 flex items-center justify-between gap-4 border ${
            expired ? "bg-red-50 border-red-200 text-red-700" :
            expiring ? "bg-amber-50 border-amber-200 text-amber-800" :
            "bg-indigo-50 border-indigo-200 text-indigo-800"
        }`}>
            <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${expired ? "bg-red-500" : expiring ? "bg-amber-500 animate-pulse" : "bg-indigo-500"}`} />
                <div>
                    <p className="font-bold text-sm">{expired ? "Your trial has expired." : `Free trial — ${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining`}</p>
                    <p className="text-xs opacity-75 mt-0.5">{expired ? "Upgrade to continue." : "Upgrade anytime to unlock your full plan."}</p>
                </div>
            </div>
            <Link to="/pricing" className="text-xs font-black uppercase tracking-widest px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-all flex-shrink-0">
                Upgrade Now
            </Link>
        </div>
    );
}

function EmailVerificationBanner({ email }) {
    const [state, setState] = useState("idle"); // idle | sending | sent
    const handleResend = async () => {
        if (state !== "idle") return;
        setState("sending");
        try { await api.post("/auth/request-email-verification"); setState("sent"); }
        catch { setState("idle"); }
    };
    return (
        <div className="rounded-2xl px-5 py-4 flex items-center justify-between gap-4 border bg-amber-50 border-amber-200 text-amber-800">
            <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-amber-500 animate-pulse" />
                <div>
                    <p className="font-bold text-sm">Email not verified</p>
                    <p className="text-xs opacity-75 mt-0.5">Check your inbox at <strong>{email || "your email"}</strong> for a verification link.</p>
                </div>
            </div>
            <button
                onClick={handleResend}
                disabled={state !== "idle"}
                className={`text-xs font-black uppercase tracking-widest px-4 py-2 rounded-xl flex-shrink-0 transition-all ${
                    state === "sent" ? "bg-emerald-100 text-emerald-700 cursor-default" : "bg-amber-600 text-white hover:bg-amber-700 shadow-md"
                }`}
            >
                {state === "sent" ? "Email Sent ✓" : state === "sending" ? "Sending…" : "Resend Verification"}
            </button>
        </div>
    );
}

// ─── 1. Welcome Banner ────────────────────────────────────────────────────────
function WelcomeBanner({ name }) {
    return (
        <section className="bg-white rounded-xl p-8 shadow-[0px_1px_12px_rgba(77,68,227,0.06)] relative overflow-hidden">
            <div className="relative z-10">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-2 font-headline">
                    Welcome back, {name || "Doctor"}.
                </h2>
                <p className="text-slate-500 text-sm">Here's what's happening in your clinic today.</p>
            </div>
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
        </section>
    );
}

// ─── 2. KPI Cards ─────────────────────────────────────────────────────────────
function KPICard({ icon, label, value, trend, trendUp, micro }) {
    return (
        <div className="bg-white p-6 rounded-xl shadow-sm transition-transform hover:scale-[1.02] duration-300">
            <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-indigo-50 rounded-lg">
                    <span className="material-symbols-outlined text-indigo-600 text-[22px]">{icon}</span>
                </div>
                {trend && (
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        trendUp ? "text-emerald-600 bg-emerald-50" : "text-red-500 bg-red-50"
                    }`}>{trend}</span>
                )}
            </div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
            <h3 className="text-3xl font-bold text-slate-900 font-headline">{value}</h3>
            {micro && <div className="mt-4">{micro}</div>}
        </div>
    );
}

function KPIGrid({ stats, loading }) {
    const skeletonCls = "bg-slate-100 animate-pulse rounded h-8 w-24";
    const v = (val, fallback = "—") => (loading ? <span className={skeletonCls} /> : (val ?? fallback));

    return (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <KPICard
                icon="group"
                label="Total Patients"
                value={v(stats?.totalPatients != null ? fmt(stats.totalPatients) : null)}
                trend="+4%"
                trendUp={true}
                micro={
                    <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 w-3/4" />
                    </div>
                }
            />
            <KPICard
                icon="event_note"
                label="Today's Appts"
                value={v(stats?.todayAppointments != null ? fmt(stats.todayAppointments) : null)}
                trend="Today"
                trendUp={true}
                micro={
                    <div className="flex gap-1 items-end h-4">
                        {[2, 3, 4, 1].map((h, i) => (
                            <div key={i} className={`w-full rounded-t-sm ${i === 2 ? "bg-blue-400" : "bg-blue-100"}`} style={{ height: `${h * 4}px` }} />
                        ))}
                    </div>
                }
            />
            <KPICard
                icon="payments"
                label="Revenue Today"
                value={v(stats?.todayRevenue != null ? `$${fmt(stats.todayRevenue)}` : (stats?.monthlyRevenue != null ? `$${fmt(stats.monthlyRevenue)}` : null))}
                trend="+12%"
                trendUp={true}
                micro={<p className="text-[10px] text-slate-400 font-medium">Target: $5,000</p>}
            />
            <KPICard
                icon="block"
                label="No-show Rate"
                value={v(stats?.noShowRate != null ? `${stats.noShowRate}%` : null)}
                trend="-2%"
                trendUp={false}
                micro={<p className="text-[10px] text-slate-400 font-medium">Industry Avg: 3.2%</p>}
            />
        </section>
    );
}

// ─── 3. Quick Actions ─────────────────────────────────────────────────────────
function QuickActions({ onAddPatient, onNewAppointment, onAddStaff }) {
    const actions = [
        { icon: "person_add",        label: "+ Add Patient",       sub: "Register new record",        onClick: onAddPatient },
        { icon: "add_task",          label: "+ New Appointment",   sub: "Schedule clinical visit",    onClick: onNewAppointment },
        { icon: "medical_services",  label: "+ Add Staff",         sub: "Onboard dental professional",onClick: onAddStaff },
    ];
    return (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {actions.map((a, i) => (
                <button
                    key={i}
                    type="button"
                    onClick={a.onClick}
                    className="group flex items-center gap-4 p-5 bg-slate-50 hover:bg-indigo-600 transition-all duration-300 rounded-xl text-left"
                >
                    <div className="w-12 h-12 flex items-center justify-center bg-white group-hover:bg-white/20 rounded-xl shadow-sm flex-shrink-0">
                        <span className="material-symbols-outlined text-indigo-600 group-hover:text-white text-[22px]">{a.icon}</span>
                    </div>
                    <div>
                        <p className="font-bold text-sm text-slate-900 group-hover:text-white">{a.label}</p>
                        <p className="text-xs text-slate-500 group-hover:text-white/80">{a.sub}</p>
                    </div>
                </button>
            ))}
        </section>
    );
}

// ─── 4. Appointment Item ──────────────────────────────────────────────────────
const STATUS_STYLE = {
    "in-progress": "bg-violet-100 text-violet-700",
    "in_progress":  "bg-violet-100 text-violet-700",
    "checked-in":  "bg-blue-100 text-blue-700",
    "confirmed":   "bg-slate-100 text-slate-600",
    "open":        "bg-slate-100 text-slate-600",
    "completed":   "bg-emerald-100 text-emerald-700",
    "cancelled":   "bg-red-50 text-red-500",
    "no-show":     "bg-red-50 text-red-500",
};

function AppointmentItem({ appt }) {
    const timeStr = appt.startTime
        ? new Date(appt.startTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
        : appt.time || "—";

    const [hour, rest]    = timeStr.split(":");
    const [min, meridiem] = (rest || "").split(" ");
    const statusCls = STATUS_STYLE[appt.status] || "bg-slate-100 text-slate-600";
    const statusLabel = (appt.status || "open").replace(/-|_/g, " ");

    return (
        <div className="flex items-center gap-6 p-4 bg-white rounded-xl hover:shadow-md transition-shadow group border border-slate-50">
            <div className="text-center min-w-[60px]">
                <p className="text-xs font-bold text-slate-900 uppercase">{`${hour}:${min}`}</p>
                <p className="text-[10px] font-medium text-slate-400">{meridiem}</p>
            </div>
            <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-indigo-100 flex items-center justify-center">
                {appt.patientAvatar
                    ? <img src={appt.patientAvatar} alt={appt.patientName} className="w-full h-full object-cover" />
                    : <span className="text-sm font-bold text-indigo-600">{(appt.patientName || "P")[0].toUpperCase()}</span>
                }
            </div>
            <div className="flex-1 min-w-0">
                <h4 className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                    {appt.patientName || appt.patient?.displayName || "Patient"}
                </h4>
                <p className="text-xs text-slate-500 truncate">
                    {appt.treatmentType || appt.type || "Consultation"} {appt.chairName ? `• ${appt.chairName}` : ""}
                </p>
            </div>
            <span className={`px-3 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider flex-shrink-0 ${statusCls}`}>
                {statusLabel}
            </span>
        </div>
    );
}

function SchedulePreview({ appointments, loading }) {
    const placeholders = [
        { time: "09:00 AM", patientName: "Sarah Henderson", type: "Root Canal Treatment", chairName: "Chair 02", status: "in-progress" },
        { time: "10:30 AM", patientName: "Michael Chen",    type: "Orthodontic Checkup", chairName: "Chair 01", status: "open" },
        { time: "11:45 AM", patientName: "Elena Rodriguez", type: "Teeth Whitening",     chairName: "Chair 03", status: "confirmed" },
    ];
    const items = appointments?.length ? appointments.slice(0, 6) : placeholders;
    const count = appointments?.length ?? 24;

    return (
        <section className="space-y-4">
            <div className="flex justify-between items-end">
                <div>
                    <h3 className="text-xl font-bold text-slate-900 font-headline">Today's Schedule Preview</h3>
                    <p className="text-sm text-slate-500">Managing {count} patient visits today</p>
                </div>
                <Link to="/org/calendar" className="text-sm font-semibold text-indigo-600 hover:underline underline-offset-4">
                    View full calendar
                </Link>
            </div>
            <div className="space-y-3">
                {loading
                    ? [...Array(3)].map((_, i) => (
                        <div key={i} className="flex items-center gap-6 p-4 bg-white rounded-xl animate-pulse border border-slate-50">
                            <div className="min-w-[60px] h-8 bg-slate-100 rounded" />
                            <div className="w-12 h-12 rounded-full bg-slate-100" />
                            <div className="flex-1 space-y-2">
                                <div className="h-4 bg-slate-100 rounded w-32" />
                                <div className="h-3 bg-slate-50 rounded w-24" />
                            </div>
                        </div>
                    ))
                    : items.map((appt, i) => (
                        <AppointmentItem key={appt._id || i} appt={
                            appt.startTime
                                ? { ...appt, time: appt.startTime }
                                : { ...appt }
                        } />
                    ))
                }
            </div>
        </section>
    );
}

// ─── 5. Clinic Insights ───────────────────────────────────────────────────────
function ChairUtilization({ pct = 78, active = 4, total = 5 }) {
    const dash = pct;
    return (
        <div className="bg-white p-6 rounded-xl shadow-sm">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Chair Utilization</p>
            <div className="relative w-32 h-32 mx-auto">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <path
                        className="text-slate-100"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none" stroke="currentColor" strokeWidth="3"
                    />
                    <path
                        className="text-indigo-600"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none" stroke="currentColor"
                        strokeDasharray={`${dash}, 100`}
                        strokeLinecap="round" strokeWidth="3"
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-slate-900">{pct}%</span>
                </div>
            </div>
            <div className="mt-6 flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-600" />
                    <span className="text-slate-500">Active</span>
                </div>
                <span className="font-bold text-slate-700">{active}/{total} Chairs</span>
            </div>
        </div>
    );
}

const BUSY_DATA = [40, 90, 85, 60, 30, 70, 100, 50];
const BUSY_LABELS = ["9AM", "", "", "12PM", "", "", "", "4PM"];

function BusyHours({ data = BUSY_DATA }) {
    return (
        <div className="bg-white p-6 rounded-xl shadow-sm">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Busy Hours</p>
            <div className="flex items-end justify-between h-24 gap-1">
                {data.map((h, i) => (
                    <div
                        key={i}
                        className={`w-full rounded-t-sm transition-all ${h >= 70 ? "bg-indigo-500" : "bg-slate-100"}`}
                        style={{ height: `${h}%` }}
                        title={BUSY_LABELS[i] || ""}
                    />
                ))}
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-slate-400 font-medium px-1">
                <span>9 AM</span>
                <span>12 PM</span>
                <span>4 PM</span>
            </div>
        </div>
    );
}

function StaffSnapshot({ doctorCount = 3, hygienistCount = 5, staff = [] }) {
    return (
        <div className="p-6 bg-gradient-to-br from-indigo-600 to-indigo-500 rounded-xl text-white shadow-lg overflow-hidden relative">
            <div className="relative z-10">
                <h4 className="text-sm font-bold mb-1">On-Duty Snapshot</h4>
                <p className="text-xs text-indigo-100 mb-4">{doctorCount} Doctors • {hygienistCount} Hygienists</p>
                <div className="flex -space-x-2">
                    {staff.slice(0, 3).map((s, i) => (
                        <div key={i} className="w-8 h-8 rounded-full border-2 border-white/20 bg-indigo-400 flex items-center justify-center overflow-hidden">
                            {s.avatarUrl
                                ? <img src={s.avatarUrl} alt={s.name} className="w-full h-full object-cover" />
                                : <span className="text-[10px] font-bold">{(s.name || "S")[0]}</span>
                            }
                        </div>
                    ))}
                    {staff.length === 0 && (
                        <>
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="w-8 h-8 rounded-full border-2 border-white/20 bg-indigo-400 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[14px]">person</span>
                                </div>
                            ))}
                        </>
                    )}
                    <div className="w-8 h-8 rounded-full border-2 border-white/20 bg-indigo-400 flex items-center justify-center text-[10px] font-bold">
                        +{hygienistCount + doctorCount - Math.min(3, staff.length)}
                    </div>
                </div>
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-10">
                <span className="material-symbols-outlined text-6xl">groups</span>
            </div>
        </div>
    );
}

function InsightsPanel({ stats, loading }) {
    const pct    = stats?.chairUtilization ?? 78;
    const active = stats?.activeChairs ?? 4;
    const total  = stats?.totalChairs ?? 5;
    return (
        <section className="space-y-6">
            <div>
                <h3 className="text-xl font-bold text-slate-900 font-headline">Clinic Insights</h3>
                <p className="text-sm text-slate-500">Live operational data</p>
            </div>
            <ChairUtilization pct={pct} active={active} total={total} />
            <BusyHours data={stats?.busyHours || BUSY_DATA} />
            <StaffSnapshot
                doctorCount={stats?.doctorCount ?? 3}
                hygienistCount={stats?.hygienistCount ?? 5}
                staff={stats?.onDutyStaff || []}
            />
        </section>
    );
}

// ─── Onboarding Welcome (preserved from v2.2) ─────────────────────────────────
function OnboardingWelcome({ userName }) {
    const navigate = useNavigate();
    return (
        <div className="space-y-6">
            <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 text-white p-8 shadow-xl shadow-indigo-500/20">
                <h1 className="text-2xl font-black mb-2">Welcome to your clinic!</h1>
                <p className="text-indigo-100 text-sm leading-relaxed max-w-lg">
                    {userName ? `Hi ${userName.split(" ")[0]}, your` : "Your"} clinic dashboard is ready. Complete these steps to get started.
                </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
    { label: "Add your first patient", sub: "Create patient records to start managing your clinic.", path: "/org/patients?new=1", icon: "group" },
                    { label: "Schedule an appointment", sub: "Set up your calendar and book your first visit.", path: "/org/calendar", icon: "calendar_today" },
                    { label: "Invite your team", sub: "Add staff members and assign roles.", path: "/org/settings/users", icon: "people" },
                ].map((action, i) => (
                    <button
                        key={i}
                        onClick={() => navigate(action.path)}
                        className="group block rounded-2xl bg-white border border-slate-100 p-6 text-left hover:shadow-lg hover:ring-2 hover:ring-indigo-100 transition-all duration-200"
                    >
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center mb-4">
                            <span className="material-symbols-outlined text-indigo-600">{action.icon}</span>
                        </div>
                        <h3 className="font-bold text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors">{action.label}</h3>
                        <p className="text-xs text-slate-500 leading-relaxed">{action.sub}</p>
                    </button>
                ))}
            </div>
        </div>
    );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
    const { user }    = useAuth();
    const navigate    = useNavigate();

    const isOnTrial   = user?.subscription?.status === "trial_active" || user?.subscription?.status === "trial";
    const trialEndDate = user?.subscription?.trialEndDate;

    const [stats,         setStats]         = useState(null);
    const [appointments,  setAppointments]  = useState([]);
    const [statsLoading,  setStatsLoading]  = useState(true);

    const fetchData = useCallback(async () => {
        if (!user) return;
        try {
            const res = await api.get("/org/dashboard/overview");
            const d = res.data?.data || res.data;
            setStats(d?.stats || d);
            setAppointments(d?.appointmentsPreview || []);
        } catch {
            // API may not exist yet — show onboarding
        } finally {
            setStatsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const isNewOrg = !statsLoading && (!stats || (
        (stats.totalPatients ?? 0) === 0 &&
        (stats.todayAppointments ?? 0) === 0
    ));

    const firstName = user?.firstName || user?.name?.split(" ")[0] || user?.fullName?.split(" ")[0];

    const onAddPatient = useCallback(() => navigate("/org/patients?new=1"), [navigate]);

    return (
        <div className="p-8 max-w-7xl mx-auto w-full space-y-8">

            {/* System Banners */}
            {user?.isEmailVerified === false && (
                <EmailVerificationBanner email={user.email} />
            )}
            {isOnTrial && <TrialBanner trialEndDate={trialEndDate} />}

            {/* Show skeleton while data is still loading — prevents flicker */}
            {statsLoading ? (
                <div className="space-y-6 animate-pulse">
                    <div className="bg-white rounded-xl h-28 shadow-sm" />
                    <div className="grid grid-cols-4 gap-5">
                        {[...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-xl h-36 shadow-sm" />)}
                    </div>
                    <div className="grid grid-cols-3 gap-5">
                        {[...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-xl h-20 shadow-sm" />)}
                    </div>
                </div>
            ) : isNewOrg ? (
                <OnboardingWelcome userName={firstName} />
            ) : (
                <>
                    {/* 1. Welcome Banner */}
                    <WelcomeBanner name={firstName} />

                    {/* 2. KPI Cards */}
                    <KPIGrid stats={stats} loading={statsLoading} />

                    {/* 3. Quick Actions */}
                    <QuickActions
                        onAddPatient={onAddPatient}
                        onNewAppointment={() => navigate("/org/calendar")}
                        onAddStaff={() => navigate("/org/settings/users")}
                    />

                    {/* 4. Main 70/30 Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-10 gap-8">
                        {/* Left: Schedule (70%) */}
                        <div className="lg:col-span-7">
                            <SchedulePreview
                                appointments={appointments}
                                loading={statsLoading}
                            />
                        </div>
                        {/* Right: Insights (30%) */}
                        <div className="lg:col-span-3">
                            <InsightsPanel stats={stats} loading={statsLoading} />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
