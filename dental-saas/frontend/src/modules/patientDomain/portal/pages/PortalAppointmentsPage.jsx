/**
 * PortalAppointmentsPage.jsx — Patient Portal Appointments List
 *
 * Route: /portal/appointments
 * Guard: PortalAuthGuard (patientToken)
 * Plane isolation: no modules/org/* imports
 */
import { useState, useEffect } from "react";
import { portalApiService } from "../api/portal.api";
import { CalendarDaysIcon, ClockIcon, MapPinIcon, UserCircleIcon } from "@heroicons/react/24/outline";

const STATUS_STYLE = {
    confirmed:  { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500", label: "Confirmed" },
    scheduled:  { bg: "bg-blue-100",    text: "text-blue-700",    dot: "bg-blue-500",    label: "Scheduled" },
    pending:    { bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-400",   label: "Pending" },
    completed:  { bg: "bg-slate-100",   text: "text-slate-600",   dot: "bg-slate-400",   label: "Completed" },
    cancelled:  { bg: "bg-red-100",     text: "text-red-600",     dot: "bg-red-400",     label: "Cancelled" },
    no_show:    { bg: "bg-red-50",      text: "text-red-500",     dot: "bg-red-300",     label: "No Show" },
};

export default function PortalAppointmentsPage() {
    const [appointments, setAppointments] = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [filter,       setFilter]       = useState("upcoming"); // upcoming | past | all

    useEffect(() => {
        setLoading(true);
        portalApiService.getAppointments({ filter })
            .then((res) => setAppointments(res?.appointments || res?.data || res || []))
            .catch(() => setAppointments([]))
            .finally(() => setLoading(false));
    }, [filter]);

    return (
        <div className="space-y-8 pb-10">
            {/* Header */}
            <section className="space-y-1">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">My Appointments</h2>
                <p className="text-slate-500 font-medium">View and manage your clinic visits</p>
            </section>

            {/* Filter tabs */}
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-2xl p-1 w-fit">
                {[["upcoming", "Upcoming"], ["past", "Past"], ["all", "All"]].map(([k, label]) => (
                    <button key={k} onClick={() => setFilter(k)}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold transition ${
                            filter === k ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-800"
                        }`}>
                        {label}
                    </button>
                ))}
            </div>

            {/* List */}
            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
            ) : appointments.length === 0 ? (
                <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm py-20 text-center">
                    <CalendarDaysIcon className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="font-bold text-slate-400">No {filter !== "all" ? filter : ""} appointments found</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {appointments.map((appt, idx) => {
                        const st = STATUS_STYLE[appt.status] || STATUS_STYLE["pending"];
                        const dt = appt.startTime ? new Date(appt.startTime) : null;
                        const doctor = appt.doctorId?.name || appt.doctorId?.firstName || appt.doctor || "—";
                        const branch = appt.branchId?.name || appt.branchId?.nameEnglish || appt.branch || "—";

                        return (
                            <div key={appt._id || idx}
                                className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-6 flex gap-6 items-center flex-wrap hover:shadow-md transition-shadow group">
                                {/* Date block */}
                                {dt ? (
                                    <div className="flex flex-col items-center bg-blue-50 text-blue-700 px-5 py-4 rounded-2xl border border-blue-100 min-w-[72px] flex-shrink-0">
                                        <span className="text-xs font-black uppercase">{dt.toLocaleDateString("en", { month: "short" })}</span>
                                        <span className="text-3xl font-black leading-tight">{dt.getDate()}</span>
                                    </div>
                                ) : (
                                    <div className="w-[72px] h-[80px] bg-slate-50 rounded-2xl border border-slate-100 flex-shrink-0" />
                                )}

                                {/* Info */}
                                <div className="flex-1 min-w-0 space-y-2">
                                    <p className="font-black text-slate-900 text-lg truncate">
                                        {appt.type || appt.treatmentType || "Dental Appointment"}
                                    </p>
                                    <div className="flex items-center gap-4 flex-wrap text-sm text-slate-500 font-medium">
                                        {dt && (
                                            <span className="flex items-center gap-1.5">
                                                <ClockIcon className="w-4 h-4" />
                                                {dt.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}
                                            </span>
                                        )}
                                        <span className="flex items-center gap-1.5">
                                            <UserCircleIcon className="w-4 h-4" />
                                            Dr. {doctor}
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <MapPinIcon className="w-4 h-4" />
                                            {branch}
                                        </span>
                                    </div>
                                    {appt.notes && <p className="text-sm text-slate-400 italic line-clamp-1">"{appt.notes}"</p>}
                                </div>

                                {/* Status badge */}
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex-shrink-0 ${st.bg} ${st.text}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                                    {st.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
