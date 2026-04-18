import { memo, useMemo } from "react";

const STAGES = [
    { key: "draft",              label: "Draft",       tone: "slate" },
    { key: "diagnosis",          label: "Diagnosis",   tone: "sky" },
    { key: "treatment_planning", label: "Planning",    tone: "violet" },
    { key: "active",             label: "Active",      tone: "indigo" },
    { key: "completed",          label: "Completed",   tone: "emerald" },
    { key: "cancelled",          label: "Cancelled",   tone: "red" },
];

const TONE = {
    slate:   { bar: "bg-slate-400",   chip: "bg-slate-100 text-slate-700",   accent: "text-slate-700" },
    sky:     { bar: "bg-sky-500",     chip: "bg-sky-50 text-sky-700",        accent: "text-sky-700" },
    violet:  { bar: "bg-violet-500",  chip: "bg-violet-50 text-violet-700",  accent: "text-violet-700" },
    indigo:  { bar: "bg-indigo-600",  chip: "bg-indigo-50 text-indigo-700",  accent: "text-indigo-700" },
    emerald: { bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700", accent: "text-emerald-700" },
    red:     { bar: "bg-red-500",     chip: "bg-red-50 text-red-600",        accent: "text-red-600" },
};

function StageCell({ stage, count, max }) {
    const t = TONE[stage.tone] || TONE.slate;
    const fillPct = max > 0 ? Math.round((count / max) * 100) : 0;
    return (
        <div className="flex flex-col rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <div className="flex items-center justify-between">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${t.chip}`}>
                    {stage.label}
                </span>
                <span className={`text-2xl font-bold tabular-nums ${t.accent}`}>{count}</span>
            </div>
            <div className="mt-3 h-1.5 w-full rounded-full bg-white overflow-hidden">
                <div className={`h-full ${t.bar} transition-all duration-500`} style={{ width: `${fillPct}%` }} />
            </div>
        </div>
    );
}

function CaseFlow({ stageDistribution, loading }) {
    const rows = stageDistribution || [];
    const byStage = useMemo(
        () => Object.fromEntries(rows.map((r) => [r.stage, r.count])),
        [rows]
    );
    const max = useMemo(() => rows.reduce((m, r) => Math.max(m, r.count), 0), [rows]);
    const total = rows.reduce((s, r) => s + r.count, 0);

    return (
        <section className="bg-white rounded-xl shadow-sm p-6">
            <header className="mb-4 flex items-end justify-between">
                <div>
                    <h3 className="text-base font-bold text-slate-900 font-headline">Case Flow by Stage</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{loading ? "Loading…" : `${total} cases · live distribution`}</p>
                </div>
            </header>
            {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                    {STAGES.map((s) => (
                        <StageCell key={s.key} stage={s} count={byStage[s.key] || 0} max={max} />
                    ))}
                </div>
            )}
        </section>
    );
}

export default memo(CaseFlow);
