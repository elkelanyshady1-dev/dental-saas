/**
 * AnalyticsFilters.jsx — top filter bar: date range, granularity, branch, timezone.
 *
 * Server state lives in React Query — this component only emits filter changes
 * via callbacks. Filter inputs are local-only (HR-8 stable string keys).
 */
import { CalendarDaysIcon, BuildingOffice2Icon, GlobeAltIcon } from "@heroicons/react/24/outline";

const PRESETS = [
    { label: "7D", days: 7 },
    { label: "30D", days: 30 },
    { label: "90D", days: 90 },
    { label: "1Y", days: 365 },
];

const GRANULARITIES = ["day", "week", "month"];

export default function AnalyticsFilters({
    range,
    granularity,
    branchId,
    timezone,
    branches = [],
    onPreset,
    onGranularity,
    onBranch,
    onRangeChange,
}) {
    return (
        <div className="sticky top-0 z-10 bg-slate-950/70 backdrop-blur-xl border border-slate-800 rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 bg-slate-900/80 rounded-full p-1">
                {PRESETS.map((p) => (
                    <button
                        key={p.label}
                        type="button"
                        onClick={() => onPreset(p.days)}
                        className="px-3 py-1 text-xs font-semibold text-slate-300 hover:text-white rounded-full hover:bg-slate-800 transition"
                    >
                        {p.label}
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-full border border-slate-800">
                <CalendarDaysIcon className="w-4 h-4 text-slate-400" />
                <input
                    type="date"
                    value={range.from.slice(0, 10)}
                    onChange={(e) => onRangeChange({ ...range, from: new Date(e.target.value).toISOString() })}
                    className="bg-transparent text-xs text-slate-200 outline-none"
                />
                <span className="text-slate-500 text-xs">→</span>
                <input
                    type="date"
                    value={range.to.slice(0, 10)}
                    onChange={(e) => {
                        const d = new Date(e.target.value);
                        d.setHours(23, 59, 59, 999);
                        onRangeChange({ ...range, to: d.toISOString() });
                    }}
                    className="bg-transparent text-xs text-slate-200 outline-none"
                />
            </div>

            <div className="flex items-center bg-slate-900/80 rounded-full p-1 border border-slate-800">
                {GRANULARITIES.map((g) => (
                    <button
                        key={g}
                        type="button"
                        onClick={() => onGranularity(g)}
                        className={`px-3 py-1 text-xs font-semibold rounded-full capitalize transition ${
                            granularity === g
                                ? "bg-indigo-500 text-white"
                                : "text-slate-400 hover:text-white"
                        }`}
                    >
                        {g}
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-full border border-slate-800">
                <BuildingOffice2Icon className="w-4 h-4 text-slate-400" />
                <select
                    value={branchId}
                    onChange={(e) => onBranch(e.target.value)}
                    className="bg-transparent text-xs text-slate-200 outline-none"
                >
                    <option value="" className="bg-slate-900">All branches</option>
                    {branches.map((b) => (
                        <option key={b._id} value={b._id} className="bg-slate-900">
                            {b.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-900/80 px-3 py-1.5 rounded-full border border-slate-800 text-xs text-slate-400">
                <GlobeAltIcon className="w-4 h-4" />
                <span>{timezone}</span>
            </div>
        </div>
    );
}
