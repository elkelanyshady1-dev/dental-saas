/**
 * RecallToolbar — Filter bar + view switcher + "+ New Recall" button.
 *
 * Mirrors CalendarPage's filter row visually (status pills, day/week/month
 * switcher) so the Recall Center feels native to the scheduling family.
 *
 * The view switcher adds a "List" mode beyond the calendar's three views.
 */

import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { RECALL_STATUS } from "./statusStyles";

const VIEWS = ["Day", "Week", "Month", "List"];

const STATUS_FILTERS = [
    { id: null, label: "All" },
    { id: "pending", label: RECALL_STATUS.pending.label },
    { id: "sent", label: RECALL_STATUS.sent.label },
    { id: "booked", label: RECALL_STATUS.booked.label },
    { id: "cancelled", label: RECALL_STATUS.cancelled.label },
];

function fmtNavLabel(date, view) {
    const d = new Date(date);
    if (!Number.isFinite(d.getTime())) return "";
    if (view === "Month") {
        return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    }
    if (view === "Week") {
        return `Week of ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    }
    if (view === "Day") {
        return d.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
        });
    }
    return "All recalls";
}

export default function RecallToolbar({
    activeView,
    onViewChange,
    statusFilter,
    onStatusChange,
    date,
    onShiftDate,
    onCreate,
}) {
    const canCreate = useCapability(P.RECALLS_CREATE);

    const showDateNav = activeView !== "List";
    const navLabel = fmtNavLabel(date, activeView);

    return (
        <div className="px-8 py-5 bg-white border-b border-[#c3c6d7]/30 flex flex-col gap-4">
            {/* Top row: status filter + view switcher + create */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                    {STATUS_FILTERS.map((f) => {
                        const active = statusFilter === f.id;
                        return (
                            <button
                                key={f.label}
                                type="button"
                                onClick={() => onStatusChange(f.id)}
                                className={[
                                    "text-xs font-medium px-3 py-1.5 rounded-full border transition-colors",
                                    active
                                        ? "bg-[#004ac6] text-white border-[#004ac6]"
                                        : "bg-white text-[#434655] border-[#c3c6d7]/50 hover:border-[#004ac6]/40",
                                ].join(" ")}
                            >
                                {f.label}
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-[#f6f7fb] rounded-lg p-1 border border-[#c3c6d7]/30">
                        {VIEWS.map((v) => (
                            <button
                                key={v}
                                type="button"
                                onClick={() => onViewChange(v)}
                                className={[
                                    "text-xs font-medium px-3 py-1 rounded-md transition-colors",
                                    activeView === v
                                        ? "bg-[#004ac6] text-white"
                                        : "text-[#434655] hover:text-[#004ac6]",
                                ].join(" ")}
                            >
                                {v}
                            </button>
                        ))}
                    </div>

                    {canCreate && (
                        <button
                            type="button"
                            onClick={onCreate}
                            className="text-sm font-medium px-4 py-2 rounded-lg bg-[#004ac6] text-white hover:bg-[#003ba0] transition-colors"
                        >
                            + New Recall
                        </button>
                    )}
                </div>
            </div>

            {/* Bottom row: date nav (hidden in List view) */}
            {showDateNav && (
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => onShiftDate(-1)}
                        aria-label="Previous"
                        className="material-symbols-outlined text-[#434655] p-1.5 hover:bg-[#f6f7fb] rounded-md transition-colors"
                    >
                        chevron_left
                    </button>
                    <span className="text-sm font-semibold text-[#0f172a]">
                        {navLabel}
                    </span>
                    <button
                        type="button"
                        onClick={() => onShiftDate(1)}
                        aria-label="Next"
                        className="material-symbols-outlined text-[#434655] p-1.5 hover:bg-[#f6f7fb] rounded-md transition-colors"
                    >
                        chevron_right
                    </button>
                </div>
            )}
        </div>
    );
}
