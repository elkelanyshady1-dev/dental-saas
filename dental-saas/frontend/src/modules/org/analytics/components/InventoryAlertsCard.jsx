import CardShell from "./CardShell";
import { formatNumber } from "../utils/format";
import { useInventoryAlerts } from "../hooks/useAnalytics";

export default function InventoryAlertsCard({ filters, onRetry }) {
    const { data, isLoading, isError } = useInventoryAlerts(filters);
    const alerts = data?.alerts ?? [];
    const burn = data?.burn ?? [];
    const isEmpty = !isLoading && !isError && alerts.length === 0 && burn.length === 0;

    return (
        <CardShell
            title="Inventory"
            subtitle={`${alerts.length} alerts · ${burn.length} items tracked`}
            isLoading={isLoading}
            isError={isError}
            isEmpty={isEmpty}
            onRetry={onRetry}
        >
            <div className="grid grid-cols-2 gap-4 max-h-[260px]">
                <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Low stock</p>
                    <ul className="space-y-1.5 overflow-y-auto max-h-[220px] pr-1">
                        {alerts.slice(0, 10).map((a) => (
                            <li key={a.itemId} className="flex items-center justify-between text-sm">
                                <span className="text-slate-200 truncate">{a.name}</span>
                                <span className="flex items-center gap-2 shrink-0">
                                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/20 tabular-nums">
                                        {formatNumber(a.stockLevel)}
                                    </span>
                                    <span className="text-slate-500 text-[10px] tabular-nums">min {formatNumber(a.minStockLevel)}</span>
                                </span>
                            </li>
                        ))}
                        {alerts.length === 0 && (
                            <li className="text-slate-500 text-xs">All items above minimum.</li>
                        )}
                    </ul>
                </div>
                <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Top burn</p>
                    <ul className="space-y-1.5 overflow-y-auto max-h-[220px] pr-1">
                        {burn.slice(0, 10).map((b) => (
                            <li key={b.itemId} className="flex items-center justify-between text-sm">
                                <span className="text-slate-200 truncate">{b.name}</span>
                                <span className="text-slate-300 tabular-nums">{formatNumber(b.totalBurn)}</span>
                            </li>
                        ))}
                        {burn.length === 0 && (
                            <li className="text-slate-500 text-xs">No transactions in range.</li>
                        )}
                    </ul>
                </div>
            </div>
        </CardShell>
    );
}
