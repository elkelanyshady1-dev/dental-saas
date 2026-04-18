/**
 * OrthodonticSituationRoom.jsx — Orthodontic dashboard for the org plane.
 *
 * Route:  /org/orthodontics
 * RBAC:   orthodontics.read  (scope widens to "organization" if caller also
 *                             has orthodontics.full; otherwise "owner")
 *
 * Data:   single useOrthoDashboard() hook →
 *         GET /api/v1/org/orthodontic-cases/dashboard
 *         Realtime invalidation is debounced inside the hook (2–5s window).
 */
import { Link } from "react-router-dom";
import { useOrthoDashboard } from "../hooks/useOrthodontics";
import KpiRow from "../components/situation-room/KpiRow";
import CaseFlow from "../components/situation-room/CaseFlow";
import DurationVariance from "../components/situation-room/DurationVariance";
import DoctorWorkload from "../components/situation-room/DoctorWorkload";
import Inventory from "../components/situation-room/Inventory";
import AlertsFeed from "../components/situation-room/AlertsFeed";
import OverdueList from "../components/situation-room/OverdueList";
import StatusFooter from "../components/situation-room/CriticalTicker";

function WelcomeBanner({ scope, isFetching }) {
    const scopeLabel = scope === "organization" ? "clinic-wide" : "your cases";
    return (
        <section className="bg-white rounded-xl p-8 shadow-[0px_1px_12px_rgba(77,68,227,0.06)] relative overflow-hidden">
            <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-1 font-headline">
                        Orthodontic Dashboard
                    </h2>
                    <p className="text-slate-500 text-sm">
                        Live snapshot of treatment load · viewing <span className="font-semibold text-slate-700">{scopeLabel}</span>
                        {isFetching && <span className="ml-2 text-indigo-500">· syncing…</span>}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        to="/org/orthodontics/cases"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 text-sm font-semibold transition-colors"
                    >
                        <span className="material-symbols-outlined text-[18px]">list</span>
                        Case List
                    </Link>
                </div>
            </div>
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
        </section>
    );
}

function ErrorBanner({ error }) {
    if (!error) return null;
    return (
        <div className="rounded-2xl px-5 py-4 flex items-center gap-3 border bg-red-50 border-red-200 text-red-700">
            <span className="material-symbols-outlined">error</span>
            <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">Dashboard feed unavailable</p>
                <p className="text-xs opacity-75 mt-0.5 truncate">
                    {error?.message || "Try refreshing in a moment."}
                </p>
            </div>
        </div>
    );
}

export default function OrthodonticSituationRoom() {
    const { data, isLoading, isFetching, error } = useOrthoDashboard();

    const payload = data || {
        kpis: null,
        stageDistribution: [],
        durationVariance: [],
        doctorWorkload: [],
        applianceInventory: null,
        photoCoverage: null,
        overdueCases: [],
        criticalAlerts: [],
        scope: "owner",
        generatedAt: null,
    };

    return (
        <div className="p-8 max-w-[1600px] mx-auto w-full space-y-6">
            <ErrorBanner error={error} />
            <WelcomeBanner scope={payload.scope} isFetching={isFetching && !isLoading} />
            <KpiRow kpis={payload.kpis} loading={isLoading} />

            <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
                {/* Main (70%) */}
                <div className="lg:col-span-7 space-y-6">
                    <CaseFlow stageDistribution={payload.stageDistribution} loading={isLoading} />
                    <DurationVariance durationVariance={payload.durationVariance} loading={isLoading} />
                    <DoctorWorkload doctorWorkload={payload.doctorWorkload} loading={isLoading} />
                </div>

                {/* Side (30%) */}
                <div className="lg:col-span-3 space-y-6">
                    <AlertsFeed alerts={payload.criticalAlerts} loading={isLoading} />
                    <OverdueList cases={payload.overdueCases} loading={isLoading} />
                    <Inventory
                        applianceInventory={payload.applianceInventory}
                        photoCoverage={payload.photoCoverage}
                        loading={isLoading}
                    />
                </div>
            </div>

            <StatusFooter
                generatedAt={payload.generatedAt}
                scope={payload.scope}
                totalCritical={payload.criticalAlerts?.length || 0}
                totalOverdue={payload.overdueCases?.length || 0}
            />
        </div>
    );
}
