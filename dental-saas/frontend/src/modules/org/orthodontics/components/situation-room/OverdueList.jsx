import { memo } from "react";
import { useNavigate } from "react-router-dom";

function OverdueList({ cases, loading }) {
    const navigate = useNavigate();
    const rows = cases || [];
    return (
        <section className="rounded-md border border-slate-800/70 bg-slate-950/40 p-4">
            <header className="mb-3 flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                    Overdue Cases
                </h2>
                <span className="font-mono text-[10px] text-slate-500">
                    no visit ≥ 21d · top 10
                </span>
            </header>

            {loading ? (
                <ul className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <li key={i} className="h-8 animate-pulse rounded bg-slate-800/40" />
                    ))}
                </ul>
            ) : rows.length === 0 ? (
                <div className="py-4 text-center text-xs uppercase tracking-widest text-slate-600">
                    No overdue cases
                </div>
            ) : (
                <ul className="space-y-1.5">
                    {rows.map((c) => {
                        const tone = c.daysSinceLastVisit > 45 ? "text-red-300" : "text-amber-300";
                        return (
                            <li
                                key={c.caseId}
                                className="group flex cursor-pointer items-center justify-between rounded border border-slate-800/60 bg-slate-950/40 px-2.5 py-1.5 transition hover:border-amber-500/40"
                                onClick={() => navigate(`/org/orthodontics/${c.caseId}`)}
                            >
                                <span className="truncate text-xs text-slate-300">{c.patientName}</span>
                                <span className={`font-mono text-[11px] tabular-nums ${tone}`}>
                                    {c.daysSinceLastVisit}d
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

export default memo(OverdueList);
