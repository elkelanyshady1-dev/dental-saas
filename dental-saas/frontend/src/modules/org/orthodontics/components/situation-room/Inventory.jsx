import { memo } from "react";

function Stat({ label, value, tone = "cyan" }) {
    const colors = {
        cyan: "text-cyan-300",
        amber: "text-amber-300",
        red: "text-red-300",
        emerald: "text-emerald-300",
    };
    return (
        <div className="flex items-center justify-between border-b border-slate-800/60 py-2 last:border-0">
            <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">{label}</span>
            <span className={`font-mono text-base font-semibold tabular-nums ${colors[tone]}`}>
                {value}
            </span>
        </div>
    );
}

function Ring({ label, pct, color }) {
    const r = 28;
    const c = 2 * Math.PI * r;
    const offset = c - (pct / 100) * c;
    const stroke = {
        emerald: "stroke-emerald-400",
        cyan: "stroke-cyan-400",
        amber: "stroke-amber-400",
    }[color] || "stroke-cyan-400";
    return (
        <div className="flex flex-col items-center">
            <div className="relative h-[72px] w-[72px]">
                <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
                    <circle cx="36" cy="36" r={r} className="fill-none stroke-slate-800" strokeWidth="6" />
                    <circle
                        cx="36" cy="36" r={r}
                        className={`fill-none ${stroke} transition-[stroke-dashoffset] duration-700`}
                        strokeWidth="6"
                        strokeDasharray={c}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                    />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold text-slate-200">
                    {pct}%
                </span>
            </div>
            <span className="mt-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</span>
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
            <section className="rounded-md border border-slate-800/70 bg-slate-950/40 p-4">
                <header className="mb-2 flex items-center justify-between">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                        Appliance Inventory
                    </h2>
                </header>
                {loading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-7 animate-pulse rounded bg-slate-800/40" />
                        ))}
                    </div>
                ) : (
                    <>
                        <Stat label="Active Brackets"      value={inv.activeBrackets} tone="cyan" />
                        <Stat label="Active TADs"          value={inv.activeTads} tone="emerald" />
                        <Stat label="Debonded this Month"  value={inv.bracketsDebondedThisMonth} tone="amber" />
                    </>
                )}
            </section>

            <section className="rounded-md border border-slate-800/70 bg-slate-950/40 p-4">
                <header className="mb-3 flex items-center justify-between">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                        Photo Coverage
                    </h2>
                    <span className="font-mono text-[10px] text-slate-500">
                        {pc.totalActive} active
                    </span>
                </header>
                {loading ? (
                    <div className="flex justify-around">
                        <div className="h-[72px] w-[72px] animate-pulse rounded-full bg-slate-800/40" />
                        <div className="h-[72px] w-[72px] animate-pulse rounded-full bg-slate-800/40" />
                    </div>
                ) : (
                    <div className="flex justify-around">
                        <Ring label="Baseline" pct={basePct} color="cyan" />
                        <Ring label="Progress" pct={progPct} color="emerald" />
                    </div>
                )}
            </section>
        </div>
    );
}

export default memo(Inventory);
