import { memo, useMemo } from "react";

const STAGE_CONFIG = [
    { key: "draft",              label: "Draft",       color: "slate" },
    { key: "diagnosis",          label: "Diagnosis",   color: "cyan" },
    { key: "treatment_planning", label: "Planning",    color: "violet" },
    { key: "active",             label: "Active",      color: "emerald" },
    { key: "completed",          label: "Completed",   color: "sky" },
    { key: "cancelled",          label: "Cancelled",   color: "red" },
];

const COLOR_MAP = {
    slate:   { ring: "ring-slate-700",   text: "text-slate-300",   dot: "bg-slate-500",   bar: "from-slate-700/80" },
    cyan:    { ring: "ring-cyan-700",    text: "text-cyan-300",    dot: "bg-cyan-400",    bar: "from-cyan-600/80" },
    violet:  { ring: "ring-violet-700",  text: "text-violet-300",  dot: "bg-violet-400",  bar: "from-violet-600/80" },
    emerald: { ring: "ring-emerald-700", text: "text-emerald-300", dot: "bg-emerald-400", bar: "from-emerald-600/80" },
    sky:     { ring: "ring-sky-700",     text: "text-sky-300",     dot: "bg-sky-400",     bar: "from-sky-600/80" },
    red:     { ring: "ring-red-700",     text: "text-red-300",     dot: "bg-red-400",     bar: "from-red-600/80" },
};

function StageColumn({ stage, count, max }) {
    const color = COLOR_MAP[stage.color] || COLOR_MAP.slate;
    const chips = Math.min(count, 12);
    const fillPct = max > 0 ? Math.round((count / max) * 100) : 0;
    return (
        <div className="flex flex-col rounded-md border border-slate-800/70 bg-slate-950/50 p-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${color.dot}`} />
                    <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${color.text}`}>
                        {stage.label}
                    </span>
                </div>
                <span className={`font-mono text-lg font-semibold tabular-nums ${color.text}`}>
                    {count}
                </span>
            </div>
            <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-slate-800/80">
                <div
                    className={`absolute inset-y-0 left-0 bg-gradient-to-r ${color.bar} to-transparent`}
                    style={{ width: `${fillPct}%` }}
                />
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
                {Array.from({ length: chips }).map((_, i) => (
                    <span
                        key={i}
                        className={`h-2 w-4 rounded-sm ring-1 ${color.ring} bg-slate-900/60`}
                    />
                ))}
                {count > 12 && (
                    <span className={`text-[10px] font-mono ${color.text}`}>+{count - 12}</span>
                )}
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
    const max = useMemo(
        () => rows.reduce((m, r) => Math.max(m, r.count), 0),
        [rows]
    );
    return (
        <section className="rounded-md border border-slate-800/70 bg-slate-950/40 p-4">
            <header className="mb-3 flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                    Case Flow by Stage
                </h2>
                <span className="font-mono text-[10px] text-slate-500">
                    {loading ? "···" : `${rows.reduce((s, r) => s + r.count, 0)} total`}
                </span>
            </header>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {STAGE_CONFIG.map((s) => (
                    <StageColumn key={s.key} stage={s} count={byStage[s.key] || 0} max={max} />
                ))}
            </div>
        </section>
    );
}

export default memo(CaseFlow);
