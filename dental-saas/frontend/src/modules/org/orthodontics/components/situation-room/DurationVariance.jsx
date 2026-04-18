import { memo, useMemo } from "react";

const BUCKETS = [
    { key: "ahead",   label: "Ahead",    color: "emerald", bar: "bg-emerald-500/80" },
    { key: "onTrack", label: "On Track", color: "cyan",    bar: "bg-cyan-500/80" },
    { key: "delayed", label: "Delayed",  color: "red",     bar: "bg-red-500/80" },
];

function DurationVariance({ durationVariance, loading }) {
    const rows = durationVariance || [];
    const { total, map } = useMemo(() => {
        const m = Object.fromEntries(rows.map((r) => [r.bucket, r.count]));
        const t = rows.reduce((s, r) => s + r.count, 0);
        return { total: t, map: m };
    }, [rows]);

    return (
        <section className="rounded-md border border-slate-800/70 bg-slate-950/40 p-4">
            <header className="mb-3 flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                    Treatment Duration Variance
                </h2>
                <span className="font-mono text-[10px] text-slate-500">
                    active cases · ±7d tolerance
                </span>
            </header>

            {loading ? (
                <div className="h-8 animate-pulse rounded bg-slate-800/40" />
            ) : total === 0 ? (
                <div className="py-6 text-center text-xs uppercase tracking-widest text-slate-600">
                    No active cases to analyse
                </div>
            ) : (
                <>
                    <div className="flex h-8 w-full overflow-hidden rounded border border-slate-800/70 bg-slate-900/60">
                        {BUCKETS.map((b) => {
                            const count = map[b.key] || 0;
                            const pct = total > 0 ? (count / total) * 100 : 0;
                            if (pct === 0) return null;
                            return (
                                <div
                                    key={b.key}
                                    className={`relative flex items-center justify-center text-[11px] font-semibold text-slate-950 ${b.bar}`}
                                    style={{ width: `${pct}%` }}
                                    title={`${b.label}: ${count}`}
                                >
                                    {pct > 10 && <span className="font-mono">{count}</span>}
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3 text-[10px] uppercase tracking-[0.14em]">
                        {BUCKETS.map((b) => {
                            const count = map[b.key] || 0;
                            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                            return (
                                <div key={b.key} className="flex items-center justify-between rounded border border-slate-800/60 bg-slate-950/40 px-2 py-1.5">
                                    <span className="flex items-center gap-2 text-slate-400">
                                        <span className={`h-1.5 w-3 rounded-sm ${b.bar}`} />
                                        {b.label}
                                    </span>
                                    <span className="font-mono text-slate-200">{count} · {pct}%</span>
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
