import CardShell from "./CardShell";
import { formatNumber, formatPercent, PALETTE } from "../utils/format";
import { useAppointmentsFunnel } from "../hooks/useAnalytics";

export default function AppointmentFunnelCard({ filters, onRetry }) {
    const { data, isLoading, isError } = useAppointmentsFunnel(filters);
    const funnel = data?.funnel ?? [];
    const rates = data?.rates;
    const isEmpty = !isLoading && !isError && funnel.every((f) => f.count === 0);
    const maxCount = Math.max(1, ...funnel.map((f) => f.count));

    return (
        <CardShell
            title="Appointment Funnel"
            subtitle="Status progression in range"
            isLoading={isLoading}
            isError={isError}
            isEmpty={isEmpty}
            onRetry={onRetry}
        >
            <div className="space-y-2">
                {funnel.map((step, i) => (
                    <div key={step.status}>
                        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                            <span className="capitalize">{step.status.replace("-", " ")}</span>
                            <span className="tabular-nums text-slate-200">
                                {formatNumber(step.count)} <span className="text-slate-500">· {formatPercent(step.pct)}</span>
                            </span>
                        </div>
                        <div className="h-2 bg-slate-800/60 rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full"
                                style={{
                                    width: `${(step.count / maxCount) * 100}%`,
                                    background: PALETTE[i % PALETTE.length],
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>
            {rates && (
                <div className="mt-4 grid grid-cols-3 gap-2 pt-3 border-t border-slate-800">
                    <Stat label="Completion" value={formatPercent(rates.completionRate)} tone="emerald" />
                    <Stat label="No-show" value={formatPercent(rates.noShowRate)} tone="rose" />
                    <Stat label="Cancelled" value={formatPercent(rates.cancellationRate)} tone="amber" />
                </div>
            )}
        </CardShell>
    );
}

function Stat({ label, value, tone }) {
    const toneColor = {
        emerald: "text-emerald-400",
        rose: "text-rose-400",
        amber: "text-amber-400",
    }[tone] || "text-slate-200";
    return (
        <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
            <p className={`text-base font-semibold ${toneColor} tabular-nums`}>{value}</p>
        </div>
    );
}
