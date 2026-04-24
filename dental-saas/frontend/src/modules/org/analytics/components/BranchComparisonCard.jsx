import CardShell from "./CardShell";
import { formatCurrency, formatNumber, formatPercent } from "../utils/format";
import { useBranchComparison } from "../hooks/useAnalytics";

export default function BranchComparisonCard({ filters, onRetry }) {
    const { data, isLoading, isError } = useBranchComparison(filters);
    const rows = data?.rows ?? [];
    const currency = data?.meta?.currency || "AED";
    const isEmpty = !isLoading && !isError && rows.length === 0;
    const maxRevenue = Math.max(1, ...rows.map((r) => r.revenue));

    return (
        <CardShell
            title="Branch Comparison"
            subtitle={`${rows.length} branch${rows.length === 1 ? "" : "es"}`}
            isLoading={isLoading}
            isError={isError}
            isEmpty={isEmpty}
            onRetry={onRetry}
        >
            <ul className="space-y-3">
                {rows.map((r) => (
                    <li key={r.branchId}>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-200 truncate">{r.branchName}</span>
                            <span className="text-slate-100 font-semibold tabular-nums">
                                {formatCurrency(r.revenue, currency)}
                            </span>
                        </div>
                        <div className="mt-1 h-1.5 bg-slate-800/60 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-indigo-500"
                                style={{ width: `${(r.revenue / maxRevenue) * 100}%` }}
                            />
                        </div>
                        <div className="mt-1 flex gap-3 text-[10px] text-slate-500">
                            <span>{formatNumber(r.appointments)} appts</span>
                            <span>{formatNumber(r.newPatients)} new patients</span>
                            <span>{formatPercent(r.completionRate)} completion</span>
                        </div>
                    </li>
                ))}
            </ul>
        </CardShell>
    );
}
