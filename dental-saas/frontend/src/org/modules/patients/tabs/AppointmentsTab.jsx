/**
 * AppointmentsTab.jsx — Patient Appointments History
 * Loads appointment list for the current patient via API.
 */
import { useState, useEffect, useCallback } from "react";
import { Calendar, Clock, CheckCircle, XCircle } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { patientsApi } from "@/modules/org/patients/api/patients.api";

const STATUS_STYLES = {
    scheduled: { bg: "bg-blue-50", text: "text-blue-700", label: "Scheduled" },
    completed: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Completed" },
    cancelled: { bg: "bg-red-50", text: "text-red-700", label: "Cancelled" },
    no_show: { bg: "bg-amber-50", text: "text-amber-700", label: "No Show" },
    confirmed: { bg: "bg-teal-50", text: "text-teal-700", label: "Confirmed" },
};

export default function AppointmentsTab() {
    const { aggregate } = useOutletContext();
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchAppointments = useCallback(async () => {
        if (!aggregate?._id) return;
        setLoading(true);
        try {
            const res = await patientsApi.getAppointments(aggregate._id);
            setAppointments(res.data?.data || res.data?.appointments || res.data || []);
        } catch (err) {
            console.error("Failed to load appointments:", err);
        } finally {
            setLoading(false);
        }
    }, [aggregate?._id]);

    useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

    if (!aggregate) return null;

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">Appointment History</h3>
                        <p className="text-xs text-slate-500 mt-0.5">{appointments.length} total appointments</p>
                    </div>
                    <button className="px-4 py-2 rounded-xl text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition">
                        + Book Appointment
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                ) : appointments.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">
                        <Calendar className="w-8 h-8 mx-auto mb-3 opacity-20" />
                        <p className="text-sm">No appointments found for this patient.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {appointments.map((appt) => {
                            const statusStyle = STATUS_STYLES[appt.status] || STATUS_STYLES.scheduled;
                            const date = appt.date ? new Date(appt.date) : null;

                            return (
                                <div key={appt._id} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50/50 transition">
                                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                                        <Calendar className="w-5 h-5 text-blue-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-slate-800">
                                            {appt.reason || appt.type || "General Appointment"}
                                        </p>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                            {date && (
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {date.toLocaleDateString()} at {appt.startTime || date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                </span>
                                            )}
                                            {appt.doctorName && <span>Dr. {appt.doctorName}</span>}
                                        </div>
                                    </div>
                                    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${statusStyle.bg} ${statusStyle.text}`}>
                                        {statusStyle.label}
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
