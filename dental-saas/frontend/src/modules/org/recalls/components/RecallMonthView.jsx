/**
 * RecallMonthView — Month calendar grid with per-day count badges.
 *
 * Each day cell shows the count + a stacked status indicator. Clicking a
 * cell drills to Day view for that date. No inline list to keep the grid
 * dense and readable.
 */

import { useMemo } from "react";
import EmptyState from "./EmptyState";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayKey(d) {
    const x = new Date(d);
    return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
}

function isSameMonth(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function isToday(d) {
    const now = new Date();
    return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
    );
}

export default function RecallMonthView({
    recalls,
    cursor,
    isFiltered,
    onDrillToDay,
    onCreate,
}) {
    // Build a grid that always starts on Sunday and has 6 weeks (42 cells)
    // so layout is stable regardless of month length.
    const cells = useMemo(() => {
        const ref = new Date(cursor);
        const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
        const start = new Date(first);
        start.setDate(first.getDate() - first.getDay()); // back to nearest Sunday
        return Array.from({ length: 42 }, (_, i) => {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            return d;
        });
    }, [cursor]);

    const buckets = useMemo(() => {
        const map = new Map();
        if (Array.isArray(recalls)) {
            for (const r of recalls) {
                const k = dayKey(r.dueDate);
                if (!map.has(k)) map.set(k, []);
                map.get(k).push(r);
            }
        }
        return map;
    }, [recalls]);

    if ((recalls || []).length === 0) {
        return (
            <EmptyState
                variant={isFiltered ? "filtered" : "caughtUp"}
                onCreate={onCreate}
            />
        );
    }

    const refDate = new Date(cursor);

    return (
        <div className="px-8 py-6">
            <div className="bg-white border border-[#c3c6d7]/40 rounded-xl overflow-hidden">
                <div className="grid grid-cols-7 bg-[#f6f7fb] border-b border-[#c3c6d7]/30">
                    {DAY_NAMES.map((n) => (
                        <div
                            key={n}
                            className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-[#737686] text-center"
                        >
                            {n}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7">
                    {cells.map((d, idx) => {
                        const k = dayKey(d);
                        const items = buckets.get(k) || [];
                        const inMonth = isSameMonth(d, refDate);
                        const today = isToday(d);
                        return (
                            <button
                                key={`${k}-${idx}`}
                                type="button"
                                onClick={() => onDrillToDay?.(d)}
                                className={[
                                    "min-h-[88px] p-2 text-left border-r border-b border-[#c3c6d7]/20 transition-colors",
                                    inMonth ? "bg-white" : "bg-[#f9fafc] opacity-60",
                                    "hover:bg-[#eef1ff]",
                                ].join(" ")}
                                aria-label={`${d.toDateString()} — ${items.length} recall${items.length === 1 ? "" : "s"}`}
                            >
                                <div className="flex items-center justify-between">
                                    <span
                                        className={[
                                            "text-xs font-semibold",
                                            today ? "bg-[#004ac6] text-white rounded-full w-6 h-6 flex items-center justify-center" : "text-[#0f172a]",
                                        ].join(" ")}
                                    >
                                        {d.getDate()}
                                    </span>
                                    {items.length > 0 && (
                                        <span className="text-[10px] font-bold text-white bg-[#004ac6] rounded-full px-1.5 py-0.5">
                                            {items.length}
                                        </span>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
