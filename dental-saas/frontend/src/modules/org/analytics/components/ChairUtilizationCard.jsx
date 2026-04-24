import CardShell from "./CardShell";
import { formatMinutes, formatPercent, CHART_COLORS } from "../utils/format";
import { useChairUtilization } from "../hooks/useAnalytics";

export default function ChairUtilizationCard({ filters, onRetry }) {
    const { data, isLoading, isError } = useChairUtilization(filters);
    const rows = data?.rows ?? [];
    const totals = data?.totals;
    const isEmpty = !isLoading && !isError && rows.length === 0;

    // Group by branch for display.
    const byBranch = rows.reduce((acc, r) => {
        if (!acc[r.branchId]) acc[r.branchId] = { name: r.branchName, chairs: [] };
        acc[r.branchId].chairs.push(r);
        return acc;
    }, {});

    return (
        <CardShell
            title="Chair Utilization"
            subtitle={totals ? `Overall ${formatPercent(totals.utilization)}` : undefined}
            isLoading={isLoading}
            isError={isError}
            isEmpty={isEmpty}
            onRetry={onRetry}
        >
            <div className="space-y-4 max-h-[260px] overflow-y-auto pr-1">
                {Object.entries(byBranch).map(([branchId, { name, chairs }]) => (
                    <div key={branchId}>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">{name}</p>
                        <div className="space-y-1.5">
                            {chairs.map((c) => {
                                const pctV = c.availableMinutes > 0
                                    ? Math.min(100, (c.bookedMinutes / c.availableMinutes) * 100)
                                    : 0;
                                return (
                                    <div key={c.chairId}>
                                        <div className="flex justify-between text-xs text-slate-400 mb-0.5">
                                            <span className="truncate">{c.chairName}</span>
                                            <span className="tabular-nums text-slate-300">
                                                {formatPercent(c.utilization)}
                                                <span className="text-slate-500 ml-1 text-[10px]">
                                                    {formatMinutes(c.bookedMinutes)} / {formatMinutes(c.availableMinutes)}
                                                </span>
                                            </span>
                                        </div>
                                        <div className="h-2 bg-slate-800/60 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full"
                                                style={{
                                                    width: `${pctV}%`,
                                                    background: pctV > 85 ? CHART_COLORS.rose : pctV > 60 ? CHART_COLORS.emerald : CHART_COLORS.indigo,
                                                }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </CardShell>
    );
}
