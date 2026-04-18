import { memo, useMemo } from "react";

const BUCKETS = [
    { key: "ahead",   label: "Ahead of Schedule", bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
    { key: "onTrack", label: "On Track",          bar: "bg-sky-500",     chip: "bg-sky-50 text-sky-700",         dot: "bg-sky-500" },
    { key: "delayed", label: "Delayed",           bar: "bg-amber-500",   chip: "bg-amber-50 text-amber-700",     dot: "bg-amber-500" },
];

function DurationVariance({ durationVariance, loading }) {
    const rows = durationVariance || [];
    const { total, map } = useMemo(() => {
        const m = Object.fromEntries(rows.map((r) => [r.bucket, r.count]));
        const t = rows.reduce((s, r) => s + r.count, 0);
        return { total: t, map: m };
    }, [rows]);

    return (
        <section className="bg-white rounded-xl shadow-sm p-6">
            <header className="mb-4 flex items-end justify-between">
                <div>
                    <h3 className="text-base font-bold text-slate-900 font-headline">Treatment Duration Variance</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Active cases vs. estimated duration · ±7 day tolerance</p>
                </div>
            </header>

            {loading ? (
                <div className="h-10 rounded-lg bg-slate-100 animate-pulse" />
            ) : total === 0 ? (
                <div className="py-10 text-center">
                    <span className="material-symbols-outlined text-slate-300 text-4xl">query_stats</span>
                    <p className="text-sm text-slate-500 mt-2">No active cases to analyse yet</p>
                </div>
            ) : (
                <>
                    <div className="flex h-10 w-full overflow-hidden rounded-lg bg-slate-100">
                        {BUCKETS.map((b) => {
                            const count = map[b.key] || 0;
                            const pct = total > 0 ? (count / total) * 100 : 0;
                            if (pct === 0) return null;
                            return (
                                <div
                                    key={b.key}
                                    className={`relative flex items-center justify-center text-xs font-bold text-white ${b.bar} transition-all`}
                                    style={{ width: `${pct}%` }}
                                    title={`${b.label}: ${count}`}
                                >
                                    {pct > 8 && <span className="tabular-nums">{count}</span>}
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {BUCKETS.map((b) => {
                            const count = map[b.key] || 0;
                            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                            return (
                                <div key={b.key} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className={`h-2 w-2 rounded-full ${b.dot}`} />
                                        <span className="text-xs font-semibold text-slate-700 truncate">{b.label}</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-slate-900 tabular-nums">{count}</div>
                                        <div className="text-[10px] text-slate-400 tabular-nums">{pct}%</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </section>
    );
}

export default memo(DurationVariance);
