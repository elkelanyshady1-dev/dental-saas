import { useState, useEffect, useCallback } from "react";
import { getCalendar } from "../../services/appointmentService";
import { useBranch } from "../../context/BranchContext";
import { useAuth } from "../../context/AuthContext";
import CalendarGrid from "./CalendarGrid";
import AppointmentDrawer from "./AppointmentDrawer";
import SlotPickerModal from "./SlotPickerModal";

export default function CalendarPage() {
    const { roleName, user } = useAuth();
    const { selectedBranches } = useBranch();

    const today = new Date().toISOString().split("T")[0];
    const [date, setDate] = useState(today);
    const [doctorId, setDoctorId] = useState("");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [showSlotPicker, setShowSlotPicker] = useState(false);

    /* ── Dentist role: force self-filter ─────────────────── */
    const isDentist = roleName === "doctor";
    const effectiveDoctorId = isDentist ? user?._id : doctorId || undefined;

    /* ── Fetch calendar data ────────────────────────────── */
    const loadCalendar = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await getCalendar(date, selectedBranches, effectiveDoctorId);
            setData(res.data);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to load calendar");
        } finally {
            setLoading(false);
        }
    }, [date, selectedBranches, effectiveDoctorId]);

    useEffect(() => { loadCalendar(); }, [loadCalendar]);

    /* ── Date navigation ────────────────────────────────── */
    const shiftDate = (days) => {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        setDate(d.toISOString().split("T")[0]);
    };

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => shiftDate(-1)}
                        className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 text-slate-400 hover:bg-slate-700 transition"
                    >
                        ←
                    </button>
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 border border-slate-700/50 text-slate-200 focus:outline-none focus:border-blue-500/50"
                    />
                    <button
                        onClick={() => shiftDate(1)}
                        className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 text-slate-400 hover:bg-slate-700 transition"
                    >
                        →
                    </button>
                    <button
                        onClick={() => setDate(today)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/20 border border-blue-500/50 text-blue-400 hover:bg-blue-600/30 transition"
                    >
                        Today
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    {/* Doctor filter (hidden for dentist role) */}
                    {!isDentist && (
                        <input
                            type="text"
                            value={doctorId}
                            onChange={(e) => setDoctorId(e.target.value)}
                            placeholder="Doctor ID filter"
                            className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 border border-slate-700/50 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 w-40"
                        />
                    )}

                    <button
                        onClick={() => setShowSlotPicker(true)}
                        className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-500 transition shadow-lg shadow-blue-600/20"
                    >
                        + New
                    </button>
                </div>
            </div>

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
                    {error}
                </div>
            )}

            {/* Empty state */}
            {!loading && !error && data && data.appointments?.length === 0 && (
                <div className="text-center py-20 text-slate-500">
                    <p className="text-lg mb-1">No appointments</p>
                    <p className="text-sm">No appointments found for this day.</p>
                </div>
            )}

            {/* Calendar grid */}
            {!loading && !error && data && (
                <CalendarGrid data={data} onAppointmentClick={setSelectedAppointment} />
            )}

            {/* Appointment drawer */}
            {selectedAppointment && (
                <AppointmentDrawer
                    appointment={selectedAppointment}
                    onClose={() => setSelectedAppointment(null)}
                    onRefresh={loadCalendar}
                />
            )}

            {/* Slot picker modal */}
            {showSlotPicker && data?.branches?.[0] && (
                <SlotPickerModal
                    branchId={selectedBranches[0] || data.branches[0]?.branchId}
                    chairId={data.branches[0]?.chairs?.[0]?.chairId}
                    dentistId={effectiveDoctorId}
                    date={date}
                    onClose={() => setShowSlotPicker(false)}
                    onCreated={loadCalendar}
                />
            )}
        </div>
    );
}
