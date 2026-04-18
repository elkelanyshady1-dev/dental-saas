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

function humanizeEventType(t) {
    if (!t) return "Event";
    return t.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function AlertsFeed({ alerts, loading }) {
    const navigate = useNavigate();
    const rows = alerts || [];
    return (
        <section className="bg-white rounded-xl shadow-sm p-6">
            <header className="mb-4 flex items-end justify-between">
                <div>
                    <h3 className="text-base font-bold text-slate-900 font-headline">Clinical Alerts</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Critical events requiring attention</p>
                </div>
                {rows.length > 0 && (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-600 tabular-nums">
                        {rows.length}
                    </span>
                )}
            </header>

            {loading ? (
                <ul className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <li key={i} className="h-16 rounded-lg bg-slate-100 animate-pulse" />
                    ))}
                </ul>
            ) : rows.length === 0 ? (
                <div className="py-10 text-center">
                    <span className="material-symbols-outlined text-emerald-500 text-4xl">check_circle</span>
                    <p className="text-sm font-semibold text-slate-700 mt-2">All clear</p>
                    <p className="text-xs text-slate-500">No critical alerts</p>
                </div>
            ) : (
                <ul className="space-y-2 max-h-[360px] overflow-y-auto pr-1 -mr-1">
                    {rows.map((a, idx) => (
                        <li
                            key={a.eventId}
                            className="group cursor-pointer rounded-lg border-l-4 border-red-400 bg-red-50/40 pl-3 pr-3 py-2.5 transition hover:bg-red-50"
                            onClick={() => a.caseId && navigate(`/org/orthodontics/${a.caseId}`)}
                        >
                            <div className="flex items-start gap-2.5">
                                <span className="relative flex h-2 w-2 shrink-0 mt-1.5">
                                    <span className="absolute inset-0 rounded-full bg-red-500" />
                                    {idx === 0 && <span className="absolute inset-0 rounded-full bg-red-500/70 animate-ping" />}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="truncate text-sm font-semibold text-slate-900 group-hover:text-indigo-600">
                                            {a.patientName}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                                            {relativeTime(a.at)}
                                        </span>
                                    </div>
                                    <div className="mt-0.5 truncate text-xs text-red-600 font-medium">
                                        {humanizeEventType(a.type)}
                                    </div>
                                </div>
                                <span className="material-symbols-outlined text-slate-300 text-base group-hover:text-indigo-500">chevron_right</span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

export default memo(AlertsFeed);
