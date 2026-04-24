import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import CardShell from "./CardShell";
import { formatBucketLabel, formatPercent, formatNumber, CHART_COLORS } from "../utils/format";
import { useLabSLA } from "../hooks/useAnalytics";

export default function LabSLACard({ filters, onRetry }) {
    const { data, isLoading, isError } = useLabSLA(filters);
    const series = data?.series ?? [];
    const totals = data?.totals;
    const granularity = data?.meta?.granularity || filters.granularity;
    const isEmpty = !isLoading && !isError && series.every((p) => p.onTime + p.late + p.pending === 0);

    return (
        <CardShell
            title="Lab SLA"
            subtitle={totals ? `${formatNumber(totals.cases)} cases · ${formatPercent(totals.onTimePct)} on-time` : undefined}
            isLoading={isLoading}
            isError={isError}
            isEmpty={isEmpty}
            onRetry={onRetry}
        >
            <ResponsiveContainer width="100%" height={220}>
                <BarChart data={series} margin={{ top: 10, right: 12, bottom: 0, left: -8 }}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                        dataKey="bucket"
                        tickFormatter={(v) => formatBucketLabel(v, granularity)}
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                    />
                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, fontSize: 12 }}
                        labelFormatter={(v) => formatBucketLabel(v, granularity)}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
                    <Bar dataKey="onTime" stackId="a" fill={CHART_COLORS.emerald} name="On time" />
                    <Bar dataKey="late" stackId="a" fill={CHART_COLORS.rose} name="Late" />
                    <Bar dataKey="pending" stackId="a" fill={CHART_COLORS.amber} name="Pending" />
                </BarChart>
            </ResponsiveContainer>
        </CardShell>
    );
}
