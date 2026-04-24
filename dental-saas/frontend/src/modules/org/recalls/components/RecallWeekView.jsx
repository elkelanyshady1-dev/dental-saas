/**
 * RecallWeekView — 7-day grid (Sunday → Saturday in this app).
 *
 * Each day cell shows a count badge and the first 3 recalls; "+N more"
 * drills back into Day view for that specific date.
 *
 * Receives the FULL week of recalls; bucketing is local.
 */

import { useMemo } from "react";
import StatusPill from "./StatusPill";
import EmptyState from "./EmptyState";
import { isOverdue } from "../utils/dateRange";

const MAX_PER_CELL = 3;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayKey(d) {
    const x = new Date(d);
    return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
}

export default function RecallWeekView({
    recalls,
    weekStart,
    isFiltered,
    onDrillToDay,
    onConvert,
    onCreate,
}) {
    // Build the seven date cells
    const days = useMemo(() => {
        const start = new Date(weekStart);
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            return d;
        });
    }, [weekStart]);

    const buckets = useMemo(() => {
        const map = new Map(days.map((d) => [dayKey(d), []]));
        if (Array.isArray(recalls)) {
            for (const r of recalls) {
                const k = dayKey(r.dueDate);
                if (map.has(k)) map.get(k).push(r);
            }
        }
        // sort each day: overdue first then by time
        for (const arr of map.values()) {
            arr.sort((a, b) => {
                const ao = isOverdue(a) ? 0 : 1;
                const bo = isOverdue(b) ? 0 : 1;
                if (ao !== bo) return ao - bo;
                return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            });
        }
        return map;
    }, [days, recalls]);

    const totalInWeek = (recalls || []).length;
    if (totalInWeek === 0) {
        return (
            <EmptyState
                variant={isFiltered ? "filtered" : "caughtUp"}
                onCreate={onCreate}
            />
        );
    }

    return (
        <div className="px-8 py-6">
            <div className="grid grid-cols-7 gap-3">
                {days.map((d, i) => {
                    const k = dayKey(d);
                    const items = buckets.get(k) || [];
                    const overflow = Math.max(0, items.length - MAX_PER_CELL);
                    return (
                        <div
                            key={k}
                            className="bg-white border border-[#c3c6d7]/40 rounded-xl overflow-hidden flex flex-col min-h-[180px]"
                        >
                            <div className="px-3 py-2 border-b border-[#c3c6d7]/30 bg-[#f6f7fb] flex items-center justify-between">
                                <div>
                                    <div className="text-[10px] uppercase tracking-wider font-bold text-[#737686]">
                                        {DAY_NAMES[i]}
                                    </div>
                                    <div className="text-sm font-semibold text-[#0f172a]">
                                        {d.getDate()}
                                    </div>
                                </div>
                                {items.length > 0 && (
                                    <span className="text-xs font-bold text-white bg-[#004ac6] rounded-full px-2 py-0.5">
                                        {items.length}
                                    </span>
                                )}
                            </div>
                            <div className="p-2 flex-1 flex flex-col gap-1.5">
                                {items.slice(0, MAX_PER_CELL).map((r) => (
                                    <button
                                        key={r._id}
                                        type="button"
                                        onClick={() => onConvert?.(r)}
                                        className="text-left bg-[#f6f7fb] hover:bg-[#eef1ff] rounded-md p-2 transition-colors"
                                        title="Click to convert to appointment"
                                    >
                                        <div className="text-xs font-medium text-[#0f172a] truncate">
                                            {r.patient?.name || "—"}
                                        </div>
                                        <div className="mt-1">
                                            <StatusPill status={r.status} overdue={isOverdue(r)} />
                                        </div>
                                    </button>
                                ))}
                                {overflow > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => onDrillToDay?.(d)}
                                        className="mt-auto text-xs font-medium text-[#004ac6] hover:underline self-start"
                                    >
                                        +{overflow} more
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
