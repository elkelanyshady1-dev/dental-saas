import { memo } from "react";

const TONES = {
    indigo:  { chip: "bg-indigo-50  text-indigo-600",  value: "text-slate-900" },
    sky:     { chip: "bg-sky-50     text-sky-600",     value: "text-slate-900" },
    amber:   { chip: "bg-amber-50   text-amber-600",   value: "text-slate-900" },
    red:     { chip: "bg-red-50     text-red-500",     value: "text-slate-900" },
    emerald: { chip: "bg-emerald-50 text-emerald-600", value: "text-slate-900" },
};

function KpiCard({ icon, label, value, tone = "indigo", suffix = "", loading, alert, footnote }) {
    const t = TONES[tone] || TONES.indigo;
    return (
        <div className="relative bg-white p-6 rounded-xl shadow-sm transition-transform hover:scale-[1.01] duration-200">
            <div className="flex justify-between items-start mb-4">
                <div className={`p-2 rounded-lg ${t.chip}`}>
                    <span className="material-symbols-outlined text-[22px]">{icon}</span>
                </div>
                {alert && (
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inset-0 rounded-full bg-red-500" />
                        <span className="absolute inset-0 rounded-full bg-red-500/70 animate-ping" />
                    </span>
                )}
            </div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                {label}
            </p>
            <h3 className={`text-3xl font-bold tabular-nums ${t.value} font-headline`}>
                {loading ? <span className="inline-block h-8 w-16 rounded bg-slate-100 animate-pulse align-middle" /> : <>{value}{suffix}</>}
            </h3>
            {footnote && (
                <p className="mt-2 text-[11px] text-slate-400 font-medium">{footnote}</p>
            )}
        </div>
    );
}

function KpiRow({ kpis, loading }) {
    const k = kpis || {
        activeCount: 0, inTreatmentCount: 0, overdueAdjustments: 0,
        avgAlignerProgress: 0, criticalEventsToday: 0, todayVisits: 0,
    };
    return (
        <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <KpiCard icon="folder_shared" label="Active Cases"      value={k.activeCount}         tone="indigo"  loading={loading} />
            <KpiCard icon="healing"       label="In Treatment"      value={k.inTreatmentCount}    tone="sky"     loading={loading} />
            <KpiCard icon="pending_actions" label="Overdue"         value={k.overdueAdjustments}  tone={k.overdueAdjustments > 10 ? "red" : "amber"} loading={loading} footnote={k.overdueAdjustments > 0 ? "≥ 21 days no visit" : "all current"} />
            <KpiCard icon="trending_up"   label="Aligner Progress"  value={k.avgAlignerProgress}  suffix="%" tone="emerald" loading={loading} footnote="median, time-based" />
            <KpiCard icon="crisis_alert"  label="Critical Today"    value={k.criticalEventsToday} tone="red"     loading={loading} alert={k.criticalEventsToday > 0} />
            <KpiCard icon="event_available" label="Today's Visits"  value={k.todayVisits}         tone="indigo"  loading={loading} />
        </section>
    );
}

export default memo(KpiRow);
