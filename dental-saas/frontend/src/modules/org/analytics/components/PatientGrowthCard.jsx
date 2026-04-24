import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import CardShell from "./CardShell";
import { formatBucketLabel, formatNumber, CHART_COLORS } from "../utils/format";
import { usePatientGrowth } from "../hooks/useAnalytics";

export default function PatientGrowthCard({ filters, onRetry }) {
    const { data, isLoading, isError } = usePatientGrowth(filters);
    const series = data?.series ?? [];
    const granularity = data?.meta?.granularity || filters.granularity;
    const isEmpty = !isLoading && !isError && series.every((p) => p.newPatients === 0);

    return (
        <CardShell
            title="Patient Growth"
            subtitle={`${formatNumber(data?.totals?.newPatients || 0)} new in range`}
            isLoading={isLoading}
            isError={isError}
            isEmpty={isEmpty}
            onRetry={onRetry}
        >
            <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={series} margin={{ top: 10, right: 12, bottom: 0, left: -8 }}>
                    <defs>
                        <linearGradient id="newP" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={CHART_COLORS.indigo} stopOpacity={0.6} />
                            <stop offset="100%" stopColor={CHART_COLORS.indigo} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="cumP" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={CHART_COLORS.sky} stopOpacity={0.25} />
                            <stop offset="100%" stopColor={CHART_COLORS.sky} stopOpacity={0} />
                        </linearGradient>
                    </defs>
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
                        formatter={(v, name) => [formatNumber(v), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
                    <Area type="monotone" dataKey="cumulative" stroke={CHART_COLORS.sky} fill="url(#cumP)" name="Cumulative" />
                    <Area type="monotone" dataKey="newPatients" stroke={CHART_COLORS.indigo} fill="url(#newP)" name="New" />
                </AreaChart>
            </ResponsiveContainer>
        </CardShell>
    );
}
