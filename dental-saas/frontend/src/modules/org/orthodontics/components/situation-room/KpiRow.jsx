import { memo } from "react";

const TONE = {
    cyan:    { label: "text-cyan-400/80",    value: "text-cyan-300",    glow: "shadow-[0_0_24px_rgba(34,211,238,0.15)]" },
    amber:   { label: "text-amber-400/80",   value: "text-amber-300",   glow: "shadow-[0_0_24px_rgba(251,191,36,0.15)]" },
    red:     { label: "text-red-400/80",     value: "text-red-300",     glow: "shadow-[0_0_28px_rgba(248,113,113,0.25)]" },
    emerald: { label: "text-emerald-400/80", value: "text-emerald-300", glow: "shadow-[0_0_24px_rgba(52,211,153,0.15)]" },
};

function KpiTile({ label, value, tone = "cyan", suffix = "", loading = false, pulse = false }) {
    const t = TONE[tone] || TONE.cyan;
    return (
        <div
            className={[
                "relative overflow-hidden rounded-md border border-slate-800/80 bg-slate-950/60 px-5 py-4",
                "backdrop-blur-sm", t.glow,
            ].join(" ")}
        >
            <div className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${t.label}`}>
                {label}
            </div>
            <div className={`mt-2 font-mono text-4xl font-semibold tabular-nums ${t.value}`}>
                {loading ? <span className="opacity-40">—</span> : <>{value}{suffix}</>}
            </div>
            {pulse && (
                <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(248,113,113,0.9)]">
                    <span className="absolute inset-0 animate-ping rounded-full bg-red-500/70" />
                </span>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent" />
        </div>
    );
}

function KpiRow({ kpis, loading }) {
    const k = kpis || {
        activeCount: 0, inTreatmentCount: 0, overdueAdjustments: 0,
        avgAlignerProgress: 0, criticalEventsToday: 0, todayVisits: 0,
    };
    const overdueTone = k.overdueAdjustments > 10 ? "red" : "amber";
    const criticalTone = "red";
    return (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiTile label="Active Cases"        value={k.activeCount}          tone="cyan"    loading={loading} />
            <KpiTile label="In Treatment"        value={k.inTreatmentCount}     tone="cyan"    loading={loading} />
            <KpiTile label="Overdue Adjustments" value={k.overdueAdjustments}   tone={overdueTone} loading={loading} />
            <KpiTile label="Aligner Progress"    value={k.avgAlignerProgress}   suffix="%"     tone="emerald" loading={loading} />
            <KpiTile label="Critical Today"      value={k.criticalEventsToday}  tone={criticalTone} pulse={k.criticalEventsToday > 0} loading={loading} />
            <KpiTile label="Today's Visits"      value={k.todayVisits}          tone="cyan"    loading={loading} />
        </div>
    );
}

export default memo(KpiRow);
