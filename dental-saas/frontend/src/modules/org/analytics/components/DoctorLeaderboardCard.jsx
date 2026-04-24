import CardShell from "./CardShell";
import { formatCurrency, formatNumber, formatPercent } from "../utils/format";
import { useDoctorLeaderboard } from "../hooks/useAnalytics";

export default function DoctorLeaderboardCard({ filters, onRetry }) {
    const { data, isLoading, isError } = useDoctorLeaderboard(filters);
    const rows = (data?.rows ?? []).slice(0, 8);
    const currency = data?.meta?.currency || "AED";
    const isEmpty = !isLoading && !isError && rows.length === 0;

    return (
        <CardShell
            title="Doctor Leaderboard"
            subtitle="Top 8 by revenue"
            isLoading={isLoading}
            isError={isError}
            isEmpty={isEmpty}
            onRetry={onRetry}
        >
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                            <th className="text-left font-semibold py-2">Doctor</th>
                            <th className="text-right font-semibold py-2">Appts</th>
                            <th className="text-right font-semibold py-2">Completed</th>
                            <th className="text-right font-semibold py-2">Revenue</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr
                                key={r.doctorId}
                                className={i % 2 === 1 ? "bg-slate-900/30" : ""}
                            >
                                <td className="py-2 text-slate-200 truncate max-w-[180px]">
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] flex items-center justify-center font-semibold">
                                            {initials(r.displayName)}
                                        </span>
                                        <span className="truncate">{r.displayName}</span>
                                    </div>
                                </td>
                                <td className="py-2 text-right tabular-nums text-slate-300">{formatNumber(r.appointments)}</td>
                                <td className="py-2 text-right">
                                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 tabular-nums">
                                        {formatPercent(r.completionRate)}
                                    </span>
                                </td>
                                <td className="py-2 text-right tabular-nums text-slate-100 font-semibold">
                                    {formatCurrency(r.revenue, currency)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </CardShell>
    );
}

function initials(name) {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}
