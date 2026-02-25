const STATUS_COLORS = {
    "open": { bg: "bg-blue-500/20", border: "border-blue-500/50", text: "text-blue-400", dot: "bg-blue-500" },
    "confirmed": { bg: "bg-sky-500/20", border: "border-sky-500/50", text: "text-sky-400", dot: "bg-sky-500" },
    "checked-in": { bg: "bg-cyan-500/20", border: "border-cyan-500/50", text: "text-cyan-400", dot: "bg-cyan-400" },
    "in-progress": { bg: "bg-purple-500/20", border: "border-purple-500/50", text: "text-purple-400", dot: "bg-purple-500" },
    "completed": { bg: "bg-emerald-500/20", border: "border-emerald-500/50", text: "text-emerald-400", dot: "bg-emerald-500" },
    "delayed": { bg: "bg-orange-500/20", border: "border-orange-500/50", text: "text-orange-400", dot: "bg-orange-500" },
    "cancelled": { bg: "bg-pink-500/20", border: "border-pink-500/50", text: "text-pink-400", dot: "bg-pink-400" },
    "no-show": { bg: "bg-red-500/20", border: "border-red-500/50", text: "text-red-400", dot: "bg-red-500" },
    "waiting-list": { bg: "bg-yellow-500/20", border: "border-yellow-500/50", text: "text-yellow-400", dot: "bg-yellow-500" },
};

export default function AppointmentCard({ appointment, slotDuration, workStart, onClick }) {
    const startDate = new Date(appointment.startTime);
    const endDate = new Date(appointment.endTime);

    const startMins = startDate.getHours() * 60 + startDate.getMinutes();
    const endMins = endDate.getHours() * 60 + endDate.getMinutes();
    const duration = endMins - startMins;

    const SLOT_HEIGHT = 48; // px per slot
    const top = ((startMins - workStart) / slotDuration) * SLOT_HEIGHT;
    const height = Math.max((duration / slotDuration) * SLOT_HEIGHT - 2, 20);

    const colors = STATUS_COLORS[appointment.status] || STATUS_COLORS["open"];
    const patient = appointment.patientId;
    const patientName = patient
        ? `${patient.firstName || ""} ${patient.lastName || ""}`.trim()
        : "—";

    const fmt = (d) => new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

    return (
        <div
            onClick={() => onClick?.(appointment)}
            className={`absolute left-0.5 right-0.5 rounded-lg border px-2 py-1 cursor-pointer
        transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:z-20
        ${colors.bg} ${colors.border} overflow-hidden`}
            style={{ top: `${top}px`, height: `${height}px` }}
        >
            <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors.dot}`} />
                <span className={`text-xs font-semibold truncate ${colors.text}`}>
                    {patientName}
                </span>
            </div>
            {height > 30 && (
                <p className="text-[10px] text-slate-500 mt-0.5">
                    {fmt(appointment.startTime)} – {fmt(appointment.endTime)}
                </p>
            )}
        </div>
    );
}

export { STATUS_COLORS };
