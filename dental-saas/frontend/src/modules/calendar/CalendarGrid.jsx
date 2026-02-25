import AppointmentCard from "./AppointmentCard";

const parseTime = (str) => {
    const [h, m] = str.split(":").map(Number);
    return h * 60 + m;
};
const formatTime = (mins) => {
    const h = String(Math.floor(mins / 60)).padStart(2, "0");
    const m = String(mins % 60).padStart(2, "0");
    return `${h}:${m}`;
};

const SLOT_HEIGHT = 48;

export default function CalendarGrid({ data, onAppointmentClick }) {
    if (!data) return null;

    const { slotDuration, workingHours, branches, appointments } = data;
    const workStart = parseTime(workingHours.start);
    const workEnd = parseTime(workingHours.end);
    const totalSlots = (workEnd - workStart) / slotDuration;

    // Generate time labels
    const timeLabels = [];
    for (let i = 0; i <= totalSlots; i++) {
        timeLabels.push(formatTime(workStart + i * slotDuration));
    }

    // Group appointments by branchId → chairId
    const grouped = {};
    for (const appt of appointments) {
        const bId = appt.branchId?._id || appt.branchId;
        const cId = appt.chairId?._id || appt.chairId;
        if (!grouped[bId]) grouped[bId] = {};
        if (!grouped[bId][cId]) grouped[bId][cId] = [];
        grouped[bId][cId].push(appt);
    }

    return (
        <div className="overflow-x-auto">
            {branches.map((branch) => (
                <div key={branch.branchId} className="mb-6">
                    {/* Branch header */}
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <h3 className="text-sm font-semibold text-slate-300">
                            {branch.branchName}
                        </h3>
                        <span className="text-[10px] text-slate-600">
                            {branch.chairs.length} chair{branch.chairs.length !== 1 ? "s" : ""}
                        </span>
                    </div>

                    <div className="flex">
                        {/* Time axis */}
                        <div className="w-16 shrink-0 border-r border-slate-700/50">
                            {timeLabels.map((label, i) => (
                                <div
                                    key={label}
                                    className="text-[10px] text-slate-500 pr-2 text-right"
                                    style={{ height: i < timeLabels.length - 1 ? `${SLOT_HEIGHT}px` : "auto" }}
                                >
                                    {label}
                                </div>
                            ))}
                        </div>

                        {/* Chair columns */}
                        {branch.chairs.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center text-slate-600 text-sm py-10">
                                No chairs configured
                            </div>
                        ) : (
                            branch.chairs.map((chair) => {
                                const chairAppts = grouped[branch.branchId]?.[chair.chairId] || [];
                                return (
                                    <div key={chair.chairId} className="flex-1 min-w-[140px]">
                                        {/* Chair header */}
                                        <div className="text-center text-[11px] font-medium text-slate-400 pb-1 border-b border-slate-700/30 mb-1">
                                            {chair.chairName}
                                        </div>

                                        {/* Slot grid */}
                                        <div className="relative" style={{ height: `${totalSlots * SLOT_HEIGHT}px` }}>
                                            {/* Grid lines */}
                                            {Array.from({ length: totalSlots }).map((_, i) => (
                                                <div
                                                    key={i}
                                                    className="absolute left-0 right-0 border-b border-slate-800/50"
                                                    style={{ top: `${i * SLOT_HEIGHT}px`, height: `${SLOT_HEIGHT}px` }}
                                                />
                                            ))}

                                            {/* Appointment cards */}
                                            {chairAppts.map((appt) => (
                                                <AppointmentCard
                                                    key={appt._id}
                                                    appointment={appt}
                                                    slotDuration={slotDuration}
                                                    workStart={workStart}
                                                    onClick={onAppointmentClick}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
