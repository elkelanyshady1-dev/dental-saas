import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appointmentsApi } from "../api/appointments.api";
import { formatTime24, durationMins } from "../utils/calendarUtils";

const DURATIONS = [15, 30, 45, 60, 90, 120];
const STATUS_OPTIONS = [
    { id: "open",        label: "Open",        dot: "bg-blue-400" },
    { id: "confirmed",   label: "Confirmed",   dot: "bg-teal-400" },
    { id: "checked-in",  label: "Checked In",  dot: "bg-indigo-400" },
    { id: "in-progress", label: "In Progress", dot: "bg-orange-400" },
    { id: "completed",   label: "Completed",   dot: "bg-green-400" },
    { id: "delayed",     label: "Delayed",     dot: "bg-red-400" },
];

/**
 * EditAppointmentDrawer.jsx — Interactive Editor (v13.2)
 *
 * Capabilities:
 * 1. Reschedule (Time/Date/Duration)
 * 2. Status FSM (normalization)
 * 3. Clinical Notes update
 */
export default function EditAppointmentDrawer({
    appointment,
    onClose,
    onUpdated
}) {
    const queryClient = useQueryClient();

    // ── Form State ───────────────────────────────────────────────────────────
    const [status, setStatus] = useState(appointment.status || "open");
    const [date, setDate] = useState(new Date(appointment.startTime).toISOString().split("T")[0]);
    const [startTime, setStartTime] = useState(formatTime24(appointment.startTime));
    const [duration, setDuration] = useState(durationMins(new Date(appointment.startTime), new Date(appointment.endTime)));
    const [notes, setNotes] = useState(appointment.notes || "");

    const endTime = useMemo(() => {
        const [h, m] = startTime.split(":").map(Number);
        const end = new Date(date);
        end.setHours(h, m + duration, 0, 0);
        return formatTime24(end);
    }, [startTime, duration, date]);

    // ── Handlers ─────────────────────────────────────────────────────────────
    const { mutate: updateAppointment, isPending } = useMutation({
        mutationFn: (data) => appointmentsApi.update(appointment._id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(["appointments"]);
            onUpdated?.();
            onClose();
        },
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        
        updateAppointment({
            status,  // already in DB-canonical hyphenated form
            startTime: `${date}T${startTime}`, // Simplified format for update
            duration,
            notes
        });
    };

    return (
        <div className="fixed inset-0 z-[100] flex justify-end">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-[480px] bg-white h-full shadow-2xl flex flex-col">
                {/* Header */}
                <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/10">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800">Edit Appointment</h2>
                        <p className="text-sm font-bold text-slate-400 mt-1">Update session details or modify status.</p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:text-slate-600 transition">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                    {/* Patient Context Card */}
                    <div className="p-6 rounded-3xl bg-blue-600 text-white shadow-xl shadow-blue-600/20 relative overflow-hidden">
                        <div className="relative z-10">
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Editing Session for</p>
                            <h3 className="text-xl font-black mt-1 italic">
                                {appointment.patient?.nameEnglish ||
                                 `${appointment.patient?.firstName || ""} ${appointment.patient?.lastName || ""}`.trim() ||
                                 appointment.patientName ||
                                 "Unknown Patient"}
                            </h3>
                            <p className="text-xs font-bold mt-2 opacity-80 flex items-center gap-2">
                                🦷 {appointment.type?.toUpperCase()} SUBMISSION
                            </p>
                        </div>
                        <div className="absolute -bottom-10 -right-10 opacity-20 transform -rotate-12 select-none pointer-events-none">
                            <span className="text-[140px] font-black leading-none">🦷</span>
                        </div>
                    </div>

                    {/* Status FSM */}
                    <div className="space-y-4">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Appointment Status</label>
                        <div className="grid grid-cols-2 gap-3">
                            {STATUS_OPTIONS.map(opt => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => setStatus(opt.id)}
                                    className={`flex items-center gap-3 h-14 px-5 rounded-2xl border-2 transition-all duration-200 ${
                                        status === opt.id 
                                            ? "bg-slate-50 border-blue-600 text-slate-800 shadow-md" 
                                            : "bg-white border-slate-100 text-slate-500 hover:border-slate-200"
                                    }`}
                                >
                                    <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
                                    <span className="text-xs font-bold tracking-tight">{opt.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Rescheduling */}
                    <div className="space-y-6">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Reschedule Timing</label>
                        <div className="flex gap-4">
                            <input 
                                type="date" 
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="flex-1 h-14 px-6 rounded-2xl bg-slate-50 border-none text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-100 shadow-inner"
                            />
                            <input 
                                type="time" 
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                                className="flex-1 h-14 px-6 rounded-2xl bg-slate-50 border-none text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-100 shadow-inner"
                            />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {DURATIONS.map(d => (
                                <button
                                    key={d}
                                    type="button"
                                    onClick={() => setDuration(d)}
                                    className={`px-4 h-11 rounded-xl text-xs font-bold transition-all ${
                                        duration === d 
                                            ? "bg-slate-800 text-white scale-105 shadow-xl shadow-slate-800/20" 
                                            : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                                    }`}
                                >
                                    {d}m
                                </button>
                            ))}
                        </div>
                        <p className="text-xs font-black text-slate-400 italic text-right">Adjusted session ends at {endTime}</p>
                    </div>

                    {/* Notes */}
                    <div className="space-y-3">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Clinical Session Notes</label>
                        <textarea 
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={4}
                            className="w-full p-6 rounded-3xl bg-slate-50 border-none text-sm font-bold text-slate-600 placeholder:text-slate-300 focus:ring-2 focus:ring-blue-100 shadow-inner resize-none"
                        />
                    </div>
                </div>

                <div className="p-8 border-t border-slate-50 bg-white">
                    <button 
                        onClick={handleSubmit}
                        disabled={isPending}
                        className="w-full h-16 rounded-2xl bg-blue-600 text-white text-base font-black shadow-2xl shadow-blue-600/30 hover:bg-blue-700 transition flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                        {isPending ? <span className="animate-pulse">Saving changes...</span> : "Update Appointment"}
                    </button>
                    <button 
                        onClick={onClose}
                        className="w-full h-12 mt-4 rounded-xl text-sm font-bold text-slate-400 hover:text-slate-800 transition"
                    >
                        Discard Changes
                    </button>
                </div>
            </div>
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
            `}</style>
        </div>
    );
}
