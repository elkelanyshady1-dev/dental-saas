import { useState } from "react";
import { updateAppointmentStatus } from "../../services/appointmentService";
import { STATUS_COLORS } from "./AppointmentCard";
import { useAuth } from "../../context/AuthContext";

/* Allowed transitions (UI hint — backend enforces) */
const TRANSITIONS = {
    "open": ["confirmed", "cancelled", "no-show"],
    "confirmed": ["checked-in", "cancelled", "no-show"],
    "checked-in": ["in-progress", "cancelled"],
    "in-progress": ["completed", "cancelled"],
    "completed": [],
    "delayed": ["confirmed", "cancelled"],
    "cancelled": [],
    "no-show": [],
    "waiting-list": ["open"],
};

export default function AppointmentDrawer({ appointment, onClose, onRefresh }) {
    const { hasPermission } = useAuth();
    const [updating, setUpdating] = useState(false);
    const [error, setError] = useState(null);

    if (!appointment) return null;

    const patient = appointment.patientId;
    const patientName = patient
        ? `${patient.firstName || ""} ${patient.lastName || ""}`.trim()
        : "—";
    const dentist = appointment.dentistId?.name || "—";
    const chair = appointment.chairId?.name || "—";
    const colors = STATUS_COLORS[appointment.status] || STATUS_COLORS["open"];
    const allowed = TRANSITIONS[appointment.status] || [];
    const canUpdate = hasPermission("appointments.update");

    const fmt = (d) => new Date(d).toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const fmtDate = (d) => new Date(d).toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric",
    });

    const handleStatusChange = async (newStatus) => {
        setUpdating(true);
        setError(null);
        try {
            await updateAppointmentStatus(appointment._id, newStatus);
            onRefresh?.();
            onClose();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to update status");
        } finally {
            setUpdating(false);
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
                onClick={onClose}
            />

            {/* Drawer */}
            <div className="fixed right-0 top-0 bottom-0 w-96 bg-slate-900 border-l border-slate-700/50 shadow-2xl z-50 flex flex-col animate-slide-in">
                {/* Header */}
                <div className="p-5 border-b border-slate-700/50 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-slate-200">Appointment Details</h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition flex items-center justify-center text-sm"
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Status badge */}
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                        <span className={`text-sm font-medium ${colors.text}`}>
                            {appointment.status}
                        </span>
                    </div>

                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-3">
                        <InfoItem label="Patient" value={patientName} />
                        <InfoItem label="Dentist" value={dentist} />
                        <InfoItem label="Chair" value={chair} />
                        <InfoItem label="Duration" value={`${appointment.duration || "—"} min`} />
                        <InfoItem label="Date" value={fmtDate(appointment.startTime)} />
                        <InfoItem label="Time" value={`${fmt(appointment.startTime)} – ${fmt(appointment.endTime)}`} />
                    </div>

                    {/* Waiting duration */}
                    {appointment.waitingDuration != null && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                            <span className="text-[10px] text-slate-500 uppercase tracking-wide">Wait Time</span>
                            <p className="text-sm font-semibold text-amber-400 mt-0.5">
                                {appointment.waitingDuration} min
                            </p>
                        </div>
                    )}

                    {/* Notes */}
                    {appointment.notes && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                            <span className="text-[10px] text-slate-500 uppercase tracking-wide">Notes</span>
                            <p className="text-sm text-slate-300 mt-1">{appointment.notes}</p>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400">
                            {error}
                        </div>
                    )}

                    {/* Status actions */}
                    {canUpdate && allowed.length > 0 && (
                        <div>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wide block mb-2">
                                Update Status
                            </span>
                            <div className="flex flex-wrap gap-2">
                                {allowed.map((status) => {
                                    const c = STATUS_COLORS[status] || STATUS_COLORS["open"];
                                    return (
                                        <button
                                            key={status}
                                            onClick={() => handleStatusChange(status)}
                                            disabled={updating}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200
                        ${c.bg} ${c.border} ${c.text}
                        hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed`}
                                        >
                                            {updating ? "..." : status}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Status history */}
                    {appointment.statusHistory?.length > 0 && (
                        <div>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wide block mb-2">
                                History
                            </span>
                            <div className="space-y-1.5">
                                {[...appointment.statusHistory].reverse().map((h, i) => (
                                    <div key={i} className="flex items-center gap-2 text-[11px]">
                                        <span className={`w-1.5 h-1.5 rounded-full ${(STATUS_COLORS[h.status] || STATUS_COLORS["open"]).dot}`} />
                                        <span className="text-slate-400">{h.status}</span>
                                        <span className="text-slate-600 ml-auto">
                                            {new Date(h.changedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .animate-slide-in { animation: slideIn 0.2s ease-out; }
      `}</style>
        </>
    );
}

function InfoItem({ label, value }) {
    return (
        <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</span>
            <p className="text-sm text-slate-300 mt-0.5">{value}</p>
        </div>
    );
}
