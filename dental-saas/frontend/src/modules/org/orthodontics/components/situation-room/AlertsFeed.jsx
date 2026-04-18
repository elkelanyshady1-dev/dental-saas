import { memo } from "react";
import { useNavigate } from "react-router-dom";

function relativeTime(iso) {
    if (!iso) return "—";
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return "—";
    const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (diffSec < 60) return `${diffSec}s ago`;
    const m = Math.floor(diffSec / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
}

function AlertsFeed({ alerts, loading }) {
    const navigate = useNavigate();
    const rows = alerts || [];
    return (
        <section className="flex min-h-[280px] flex-col rounded-md border border-slate-800/70 bg-slate-950/40 p-4">
            <header className="mb-3 flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                    Critical Alerts
                </h2>
                <span className="font-mono text-[10px] text-slate-500">
                    top {Math.min(rows.length, 20)}
                </span>
            </header>

            {loading ? (
                <ul className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <li key={i} className="h-14 animate-pulse rounded bg-slate-800/40" />
                    ))}
                </ul>
            ) : rows.length === 0 ? (
                <div className="flex flex-1 items-center justify-center">
                    <span className="rounded border border-emerald-600/50 bg-emerald-950/40 px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] text-emerald-300">
                        No critical alerts — all clear
                    </span>
                </div>
            ) : (
                <ul className="space-y-2 overflow-y-auto">
                    {rows.map((a, idx) => (
                        <li
                            key={a.eventId}
                            className="group cursor-pointer rounded border border-slate-800/60 bg-slate-950/40 px-2.5 py-2 transition hover:border-red-500/40 hover:bg-red-950/10"
                            onClick={() => a.caseId && navigate(`/org/orthodontics/${a.caseId}`)}
                        >
                            <div className="flex items-start gap-2">
                                <span className="relative mt-1 flex h-2 w-2 shrink-0">
                                    <span className="absolute inset-0 rounded-full bg-red-500" />
                                    {idx === 0 && (
                                        <span className="absolute inset-0 animate-ping rounded-full bg-red-500/70" />
                                    )}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="truncate text-xs font-medium text-slate-200">
                                            {a.patientName}
                                        </span>
                                        <span className="font-mono text-[10px] text-slate-500">
                                            {relativeTime(a.at)}
                                        </span>
                                    </div>
                                    <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.1em] text-red-300/80">
                                        {a.type}
                                    </div>
                                </div>
                                <span className="text-slate-600 group-hover:text-red-400">›</span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

export default memo(AlertsFeed);
