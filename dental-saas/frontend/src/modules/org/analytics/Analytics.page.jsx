/**
 * Analytics.page.jsx — Org Insights / Performance Analytics
 *
 * Composition surface. All server state via React Query hooks; local state
 * is just filter controls. Export button hides when the user lacks
 * P.ANALYTICS_EXPORT.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownTrayIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { P } from "@/generated/permissionKeys";
import { useCapability } from "@/hooks/useCapability";
import { QK } from "@/lib/query/queryKeys";
import { branchesApi } from "@/modules/org/branches/api/branches.api";

import { useAnalyticsFilters } from "./hooks/useAnalyticsFilters";
import { useAnalyticsOverview } from "./hooks/useAnalytics";
import { analyticsApi } from "./api/analytics.api";

import AnalyticsFilters from "./components/AnalyticsFilters";
import KpiStrip from "./components/KpiStrip";
import RevenueTrendCard from "./components/RevenueTrendCard";
import AppointmentFunnelCard from "./components/AppointmentFunnelCard";
import ProcedureMixCard from "./components/ProcedureMixCard";
import PatientGrowthCard from "./components/PatientGrowthCard";
import DoctorLeaderboardCard from "./components/DoctorLeaderboardCard";
import ChairUtilizationCard from "./components/ChairUtilizationCard";
import LabSLACard from "./components/LabSLACard";
import InventoryAlertsCard from "./components/InventoryAlertsCard";
import BranchComparisonCard from "./components/BranchComparisonCard";

export default function AnalyticsPage() {
    const qc = useQueryClient();
    const canExport = useCapability(P.ANALYTICS_EXPORT);

    const {
        filters, range, granularity, branchId, timezone,
        setRange, setGranularity, setBranchId, setPreset,
    } = useAnalyticsFilters();

    // Branches feed the filter dropdown. Uses existing QK.branches key.
    const { data: branches = [] } = useQuery({
        queryKey: QK.branches.lists(),
        queryFn: () => branchesApi.list(),
        select: (res) => res.data?.data || res.data || [],
        staleTime: 5 * 60_000,
    });

    const overview = useAnalyticsOverview(filters);

    const onRetry = () => qc.invalidateQueries({ queryKey: QK.analytics.all });

    const handleExport = async () => {
        try {
            await analyticsApi.downloadCsv({
                from: filters.from,
                to: filters.to,
                branchId: filters.branchId,
                timezone: filters.timezone,
                widgets: "revenue,doctors,appointments",
            });
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error("[Analytics] export failed", err);
        }
    };

    return (
        <div className="space-y-6 bg-slate-950 min-h-full -m-6 p-6">
            <header className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-slate-50 font-headline">Performance Analytics</h1>
                    <p className="text-slate-400 text-sm">Data visualization for growth tracking.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onRetry}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-900/80 border border-slate-800 rounded-xl transition"
                    >
                        <ArrowPathIcon className="w-4 h-4" /> Refresh
                    </button>
                    {canExport && (
                        <button
                            type="button"
                            onClick={handleExport}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition"
                        >
                            <ArrowDownTrayIcon className="w-4 h-4" /> Export CSV
                        </button>
                    )}
                </div>
            </header>

            <AnalyticsFilters
                range={range}
                granularity={granularity}
                branchId={branchId}
                timezone={timezone}
                branches={branches}
                onPreset={setPreset}
                onGranularity={setGranularity}
                onBranch={setBranchId}
                onRangeChange={setRange}
            />

            <KpiStrip overview={overview.data} isLoading={overview.isLoading} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                    <RevenueTrendCard filters={filters} onRetry={onRetry} />
                </div>
                <div className="lg:col-span-1">
                    <AppointmentFunnelCard filters={filters} onRetry={onRetry} />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ProcedureMixCard filters={filters} onRetry={onRetry} />
                <PatientGrowthCard filters={filters} onRetry={onRetry} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <DoctorLeaderboardCard filters={filters} onRetry={onRetry} />
                <ChairUtilizationCard filters={filters} onRetry={onRetry} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <LabSLACard filters={filters} onRetry={onRetry} />
                <InventoryAlertsCard filters={filters} onRetry={onRetry} />
            </div>

            <div className="grid grid-cols-1 gap-4">
                <BranchComparisonCard filters={filters} onRetry={onRetry} />
            </div>

            <p className="text-[11px] text-slate-600 text-center pt-2">
                Data refreshes automatically · All figures in {overview.data?.meta?.currency || "AED"} · Timezone {overview.data?.meta?.timezone || timezone}
            </p>
        </div>
    );
}
