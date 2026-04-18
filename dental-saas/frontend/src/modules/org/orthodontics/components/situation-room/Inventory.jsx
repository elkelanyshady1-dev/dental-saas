import { memo } from "react";

function StatRow({ icon, label, value, tone = "indigo" }) {
    const tones = {
        indigo:  "bg-indigo-50 text-indigo-600",
        emerald: "bg-emerald-50 text-emerald-600",
        amber:   "bg-amber-50 text-amber-600",
    };
    return (
        <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
            <div className="flex items-center gap-3">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
                    <span className="material-symbols-outlined text-[18px]">{icon}</span>
                </span>
                <span className="text-sm text-slate-700">{label}</span>
            </div>
            <span className="text-lg font-bold text-slate-900 tabular-nums">{value}</span>
        </div>
    );
}

function Ring({ label, pct, tone = "indigo" }) {
    const r = 32;
    const c = 2 * Math.PI * r;
    const offset = c - (pct / 100) * c;
    const strokes = {
        indigo:  "stroke-indigo-500",
        emerald: "stroke-emerald-500",
    };
    return (
        <div className="flex flex-col items-center">
            <div className="relative h-20 w-20">
                <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
                    <circle cx="40" cy="40" r={r} className="fill-none stroke-slate-100" strokeWidth="6" />
                    <circle
                        cx="40" cy="40" r={r}
                        className={`fill-none ${strokes[tone]} transition-[stroke-dashoffset] duration-700`}
                        strokeWidth="6"
                        strokeDasharray={c}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                    />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-900 tabular-nums">
                    {pct}%
                </span>
            </div>
            <span className="mt-2 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">{label}</span>
        </div>
    );
}

function Inventory({ applianceInventory, photoCoverage, loading }) {
    const inv = applianceInventory || { activeBrackets: 0, activeTads: 0, bracketsDebondedThisMonth: 0 };
    const pc  = photoCoverage || { casesWithBaseline: 0, casesWithProgress: 0, totalActive: 0 };
    const basePct = pc.totalActive > 0 ? Math.round((pc.casesWithBaseline / pc.totalActive) * 100) : 0;
    const progPct = pc.totalActive > 0 ? Math.round((pc.casesWithProgress / pc.totalActive) * 100) : 0;

    return (
        <div className="space-y-4">
            <section className="bg-white rounded-xl shadow-sm p-6">
                <header className="mb-3">
                    <h3 className="text-base font-bold text-slate-900 font-headline">Appliance Inventory</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Current placements across your cases</p>
                </header>
                {loading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />
                        ))}
                    </div>
                ) : (
                    <>
                        <StatRow icon="dentistry"    label="Active Brackets"     value={inv.activeBrackets}            tone="indigo" />
                        <StatRow icon="engineering"  label="Active TADs"          value={inv.activeTads}                tone="emerald" />
                        <StatRow icon="output"       label="Debonded this month"  value={inv.bracketsDebondedThisMonth} tone="amber" />
                    </>
                )}
            </section>

            <section className="bg-white rounded-xl shadow-sm p-6">
                <header className="mb-4 flex items-end justify-between">
                    <div>
                        <h3 className="text-base font-bold text-slate-900 font-headline">Photo Coverage</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Documentation across active cases</p>
                    </div>
                    <span className="text-xs text-slate-400 font-semibold tabular-nums">{pc.totalActive} active</span>
                </header>
                {loading ? (
                    <div className="flex justify-around">
                        <div className="h-20 w-20 rounded-full bg-slate-100 animate-pulse" />
                        <div className="h-20 w-20 rounded-full bg-slate-100 animate-pulse" />
                    </div>
                ) : (
                    <div className="flex justify-around">
                        <Ring label="Baseline" pct={basePct} tone="indigo" />
                        <Ring label="Progress" pct={progPct} tone="emerald" />
                    </div>
                )}
            </section>
        </div>
    );
}

export default memo(Inventory);
