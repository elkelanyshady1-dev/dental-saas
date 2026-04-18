import { memo, useMemo } from "react";

const SEVERITY_COLOR = {
    critical: "text-red-400",
    warning: "text-amber-400",
    info: "text-cyan-400",
};

function formatTime(iso) {
    if (!iso) return "--:--";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "--:--";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function CriticalTicker({ alerts }) {
    const rows = alerts || [];
    // Duplicate to create seamless marquee loop; fallback placeholder when empty.
    const items = useMemo(() => {
        if (!rows.length) {
            return [{ eventId: "placeholder", patientName: "System Nominal", type: "NO_CRITICAL_EVENTS", severity: "info", at: null }];
        }
        return [...rows, ...rows];
    }, [rows]);

    return (
        <section className="relative overflow-hidden rounded-md border border-slate-800/70 bg-slate-950/60">
            <div className="absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-slate-950 to-transparent" />
            <div className="absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-slate-950 to-transparent" />
            <div className="flex items-center gap-3 px-4 py-3">
                <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                    Live Clinical Events
                </span>
                <div className="relative flex-1 overflow-hidden">
                    <div className="flex min-w-max animate-[ticker_60s_linear_infinite] gap-8 whitespace-nowrap font-mono text-[12px]">
                        {items.map((it, idx) => {
                            const tone = SEVERITY_COLOR[it.severity] || SEVERITY_COLOR.info;
                            return (
                                <span key={`${it.eventId}-${idx}`} className="flex items-center gap-2">
                                    <span className={`h-1.5 w-1.5 rounded-full ${tone.replace("text-", "bg-")}`} />
                                    <span className="text-slate-500">[{formatTime(it.at)}]</span>
                                    <span className="text-slate-200">{it.patientName}</span>
                                    <span className="text-slate-600">—</span>
                                    <span className={tone}>{it.type}</span>
                                </span>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Inline keyframes — avoids adding a global CSS file for one marquee. */}
            <style>{`
                @keyframes ticker {
                    from { transform: translateX(0); }
                    to   { transform: translateX(-50%); }
                }
            `}</style>
        </section>
    );
}

export default memo(CriticalTicker);
