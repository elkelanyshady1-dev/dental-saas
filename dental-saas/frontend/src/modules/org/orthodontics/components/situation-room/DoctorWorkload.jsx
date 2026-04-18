import { memo, useMemo } from "react";

function initials(name) {
    if (!name) return "??";
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join("");
}

function DoctorWorkload({ doctorWorkload, loading }) {
    const rows = doctorWorkload || [];
    const max = useMemo(
        () => Math.max(1, ...rows.map((r) => Math.max(r.activeCases, r.visitsThisWeek))),
        [rows]
    );

    return (
        <section className="rounded-md border border-slate-800/70 bg-slate-950/40 p-4">
            <header className="mb-3 flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                    Doctor Workload
                </h2>
                <span className="font-mono text-[10px] text-slate-500">
                    top {rows.length || 0} · 7-day window
                </span>
            </header>

            {loading ? (
                <ul className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <li key={i} className="h-10 animate-pulse rounded bg-slate-800/40" />
                    ))}
                </ul>
            ) : rows.length === 0 ? (
                <div className="py-6 text-center text-xs uppercase tracking-widest text-slate-600">
                    No workload data
                </div>
            ) : (
                <ul className="space-y-2">
                    {rows.map((d) => {
                        const activePct = Math.round((d.activeCases / max) * 100);
                        const visitsPct = Math.round((d.visitsThisWeek / max) * 100);
                        return (
                            <li
                                key={d.doctorId}
                                className="rounded border border-slate-800/60 bg-slate-950/40 px-2.5 py-2"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-500/40 bg-slate-900 font-mono text-[10px] text-cyan-300">
                                        {initials(d.doctorName)}
                                    </span>
                                    <span className="flex-1 truncate text-xs text-slate-200">
                                        {d.doctorName}
                                    </span>
                                    <span className="font-mono text-[11px] text-slate-400">
                                        {d.activeCases} · {d.visitsThisWeek}
                                    </span>
                                </div>
                                <div className="mt-1.5 space-y-1">
                                    <div className="relative h-1 overflow-hidden rounded-full bg-slate-800/80">
                                        <div
                                            className="absolute inset-y-0 left-0 bg-cyan-500/70"
                                            style={{ width: `${activePct}%` }}
                                        />
                                    </div>
                                    <div className="relative h-1 overflow-hidden rounded-full bg-slate-800/80">
                                        <div
                                            className="absolute inset-y-0 left-0 bg-emerald-500/70"
                                            style={{ width: `${visitsPct}%` }}
                                        />
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
            <div className="mt-3 flex items-center justify-end gap-4 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-sm bg-cyan-500/70" />active</span>
                <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-sm bg-emerald-500/70" />visits/7d</span>
            </div>
        </section>
    );
}

export default memo(DoctorWorkload);
