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
        <section className="bg-white rounded-xl shadow-sm p-6">
            <header className="mb-4 flex items-end justify-between">
                <div>
                    <h3 className="text-base font-bold text-slate-900 font-headline">Doctor Workload</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Active cases and clinical activity this week</p>
                </div>
                <div className="flex items-center gap-4 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-indigo-500" />Active</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-emerald-500" />Visits/7d</span>
                </div>
            </header>

            {loading ? (
                <ul className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <li key={i} className="h-14 rounded-lg bg-slate-100 animate-pulse" />
                    ))}
                </ul>
            ) : rows.length === 0 ? (
                <div className="py-8 text-center">
                    <span className="material-symbols-outlined text-slate-300 text-4xl">person_off</span>
                    <p className="text-sm text-slate-500 mt-2">No doctor activity yet</p>
                </div>
            ) : (
                <ul className="space-y-2">
                    {rows.map((d) => {
                        const activePct = Math.round((d.activeCases / max) * 100);
                        const visitsPct = Math.round((d.visitsThisWeek / max) * 100);
                        return (
                            <li
                                key={d.doctorId}
                                className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5 hover:bg-slate-50 transition"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-bold text-indigo-600">
                                        {initials(d.doctorName)}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-slate-900">
                                            {d.doctorName}
                                        </p>
                                        <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                                            {d.activeCases} active · {d.visitsThisWeek} visits
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-2 space-y-1">
                                    <div className="relative h-1.5 overflow-hidden rounded-full bg-white">
                                        <div className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${activePct}%` }} />
                                    </div>
                                    <div className="relative h-1.5 overflow-hidden rounded-full bg-white">
                                        <div className="absolute inset-y-0 left-0 bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${visitsPct}%` }} />
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

export default memo(DoctorWorkload);
