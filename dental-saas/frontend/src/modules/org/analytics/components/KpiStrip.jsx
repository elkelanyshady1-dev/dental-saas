/**
 * KpiStrip.jsx — 6 KPI cards across the top of the Insights page.
 *
 * Data comes from the /analytics/overview DTO; no local computation.
 */
import { ArrowUpRightIcon, ArrowDownRightIcon } from "@heroicons/react/24/outline";
import {
    formatCurrency,
    formatNumber,
    formatPercent,
    formatDelta,
} from "../utils/format";

function Sparkline({ values = [], color = "#6366F1" }) {
    if (!values || values.length < 2) return <div className="h-8" />;
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = Math.max(1, max - min);
    const points = values.map((v, i) => {
        const x = (i / (values.length - 1)) * 100;
        const y = 100 - ((v - min) / range) * 100;
        return `${x},${y}`;
    }).join(" ");
    return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-8 w-full mt-2">
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
}

function KpiCard({ card, currency }) {
    const formatted = formatValue(card, currency);
    const positive = card.deltaPct >= 0;
    const deltaClass = positive
        ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
        : "text-rose-400 bg-rose-500/10 border border-rose-500/20";
    return (
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-slate-400">
                    {card.label}
                </p>
                <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${deltaClass}`}>
                    {positive ? (
                        <ArrowUpRightIcon className="w-3 h-3" />
                    ) : (
                        <ArrowDownRightIcon className="w-3 h-3" />
                    )}
                    {formatDelta(card.deltaPct)}
                </span>
            </div>
            <p className="text-3xl font-bold text-slate-50 mt-2 font-headline tabular-nums">
                {formatted}
            </p>
            <Sparkline values={card.sparkline} color={positive ? "#10B981" : "#F43F5E"} />
        </div>
    );
}

function formatValue(card, currency) {
    switch (card.unit) {
        case "currency": return formatCurrency(card.value, currency);
        case "percent": return formatPercent(card.value);
        case "count": return formatNumber(card.value);
        default: return String(card.value);
    }
}

export default function KpiStrip({ overview, isLoading }) {
    if (isLoading) {
        return (
            <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 animate-pulse">
                        <div className="h-3 w-20 bg-slate-800 rounded mb-3" />
                        <div className="h-8 w-28 bg-slate-800 rounded mb-2" />
                        <div className="h-8 w-full bg-slate-800 rounded" />
                    </div>
                ))}
            </section>
        );
    }
    const cards = overview?.cards ?? [];
    const currency = overview?.meta?.currency || "AED";
    return (
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {cards.map((c) => <KpiCard key={c.key} card={c} currency={currency} />)}
        </section>
    );
}
