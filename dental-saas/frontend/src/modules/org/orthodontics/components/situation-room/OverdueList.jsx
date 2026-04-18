import { memo } from "react";
import { useNavigate } from "react-router-dom";

function OverdueList({ cases, loading }) {
    const navigate = useNavigate();
    const rows = cases || [];

    return (
        <section className="bg-white rounded-xl shadow-sm p-6">
            <header className="mb-4 flex items-end justify-between">
                <div>
                    <h3 className="text-base font-bold text-slate-900 font-headline">Overdue Cases</h3>
                    <p className="text-xs text-slate-500 mt-0.5">No visit in 21+ days</p>
                </div>
                {rows.length > 0 && (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 tabular-nums">
                        {rows.length}
                    </span>
                )}
            </header>

            {loading ? (
                <ul className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <li key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />
                    ))}
                </ul>
            ) : rows.length === 0 ? (
                <div className="py-8 text-center">
                    <span className="material-symbols-outlined text-emerald-500 text-3xl">schedule</span>
                    <p className="text-sm font-semibold text-slate-700 mt-2">All cases current</p>
                </div>
            ) : (
                <ul className="space-y-1.5">
                    {rows.map((c) => {
                        const severe = c.daysSinceLastVisit > 45;
                        const chipCls = severe
                            ? "bg-red-50 text-red-600"
                            : "bg-amber-50 text-amber-700";
                        return (
                            <li
                                key={c.caseId}
                                className="group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50 transition"
                                onClick={() => navigate(`/org/orthodontics/${c.caseId}`)}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="material-symbols-outlined text-slate-300 text-[18px] group-hover:text-indigo-500">person</span>
                                    <span className="truncate text-sm text-slate-700 group-hover:text-indigo-600 font-medium">
                                        {c.patientName}
                                    </span>
                                </div>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full tabular-nums ${chipCls}`}>
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
