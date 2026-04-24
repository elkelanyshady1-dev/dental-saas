import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import CardShell from "./CardShell";
import { formatCurrency, formatNumber, formatPercent, PALETTE } from "../utils/format";
import { useProcedureMix } from "../hooks/useAnalytics";

export default function ProcedureMixCard({ filters, onRetry }) {
    const { data, isLoading, isError } = useProcedureMix(filters);
    const slices = (data?.slices ?? []).slice(0, 6);
    const currency = data?.meta?.currency || "AED";
    const isEmpty = !isLoading && !isError && slices.length === 0;

    return (
        <CardShell
            title="Procedure Mix"
            subtitle={`Top 6 categories · ${formatNumber(data?.totals?.count || 0)} procedures`}
            isLoading={isLoading}
            isError={isError}
            isEmpty={isEmpty}
            onRetry={onRetry}
        >
            <div className="grid grid-cols-5 gap-2 items-center">
                <div className="col-span-2">
                    <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                            <Pie
                                data={slices}
                                dataKey="count"
                                nameKey="category"
                                innerRadius={40}
                                outerRadius={70}
                                paddingAngle={2}
                                stroke="none"
                            >
                                {slices.map((_, i) => (
                                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, fontSize: 12 }}
                                formatter={(v, name, item) => [formatNumber(v), item?.payload?.category]}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <ul className="col-span-3 text-xs text-slate-300 space-y-1.5">
                    {slices.map((s, i) => (
                        <li key={s.category} className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
                            <span className="flex-1 capitalize truncate">{s.category}</span>
                            <span className="tabular-nums text-slate-400">{formatNumber(s.count)}</span>
                            <span className="tabular-nums text-slate-500 text-[10px]">{formatPercent(s.pct)}</span>
                            <span className="tabular-nums text-slate-200 w-20 text-right">{formatCurrency(s.revenue, currency)}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </CardShell>
    );
}
