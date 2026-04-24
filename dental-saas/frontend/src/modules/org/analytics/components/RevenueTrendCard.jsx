import {
    LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, Area, ComposedChart,
} from "recharts";
import CardShell from "./CardShell";
import { formatBucketLabel, formatCurrency, CHART_COLORS } from "../utils/format";
import { useRevenueSeries } from "../hooks/useAnalytics";

export default function RevenueTrendCard({ filters, onRetry }) {
    const { data, isLoading, isError } = useRevenueSeries(filters);
    const series = data?.series ?? [];
    const currency = data?.meta?.currency || "AED";
    const granularity = data?.meta?.granularity || filters.granularity;
    const isEmpty = !isLoading && !isError && series.every((p) => p.paid === 0 && p.invoiced === 0 && p.outstanding === 0);

    return (
        <CardShell
            title="Revenue Trend"
            subtitle={`Paid · Invoiced · Outstanding`}
            isLoading={isLoading}
            isError={isError}
            isEmpty={isEmpty}
            onRetry={onRetry}
            className="h-full"
        >
            <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={series} margin={{ top: 10, right: 12, bottom: 0, left: -8 }}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                        dataKey="bucket"
                        tickFormatter={(v) => formatBucketLabel(v, granularity)}
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                    />
                    <YAxis
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => {
                            if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k`;
                            return v;
                        }}
                    />
                    <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, fontSize: 12 }}
                        labelFormatter={(v) => formatBucketLabel(v, granularity)}
                        formatter={(v, name) => [formatCurrency(v, currency), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
                    <Area type="monotone" dataKey="outstanding" stroke={CHART_COLORS.amber} fill={CHART_COLORS.amber} fillOpacity={0.15} name="Outstanding" />
                    <Line type="monotone" dataKey="invoiced" stroke={CHART_COLORS.sky} strokeDasharray="4 4" dot={false} name="Invoiced" />
                    <Line type="monotone" dataKey="paid" stroke={CHART_COLORS.indigo} strokeWidth={2} dot={false} name="Paid" />
                </ComposedChart>
            </ResponsiveContainer>
        </CardShell>
    );
}
