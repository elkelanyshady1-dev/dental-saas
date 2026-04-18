/**
 * OrthodonticSituationRoom.jsx — Command-center dashboard for orthodontists.
 *
 * Route:  /org/orthodontics
 * RBAC:   orthodontics.read  (scope auto-widens to "organization" if caller
 *                             also has orthodontics.full; otherwise "owner")
 *
 * Data:   single React Query hook backed by
 *         GET /api/v1/org/orthodontic-cases/dashboard
 *         Invalidation is debounced by useOrthoDashboard() (2–5s window).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useOrthoDashboard } from "../hooks/useOrthodontics";
import KpiRow from "../components/situation-room/KpiRow";
import CaseFlow from "../components/situation-room/CaseFlow";
import DurationVariance from "../components/situation-room/DurationVariance";
import DoctorWorkload from "../components/situation-room/DoctorWorkload";
import Inventory from "../components/situation-room/Inventory";
import AlertsFeed from "../components/situation-room/AlertsFeed";
import OverdueList from "../components/situation-room/OverdueList";
import CriticalTicker from "../components/situation-room/CriticalTicker";

function useLiveClock() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);
    return now;
}

function TopBar({ scope, generatedAt, isFetching }) {
    const now = useLiveClock();
    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const updatedLabel = generatedAt
        ? `updated ${new Date(generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : "—";
    return (
        <header className="flex items-center justify-between border-b border-slate-800/70 bg-slate-950/60 px-6 py-3">
            <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-2 rounded border border-cyan-700/50 bg-cyan-950/30 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
                    Situation Room
                </span>
                <h1 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-300">
                    Orthodontics
                </h1>
                <span className="hidden rounded border border-slate-700/70 bg-slate-900/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400 md:inline">
                    scope · {scope || "owner"}
                </span>
            </div>

            <div className="flex items-center gap-4">
                <span className="font-mono text-sm tabular-nums text-slate-300">{time}</span>
                <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 md:inline">
                    {isFetching ? "syncing…" : updatedLabel}
                </span>
                <Link
                    to="/org/orthodontics/cases"
                    className="rounded border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-300"
                >
                    Case List ›
                </Link>
            </div>
        </header>
    );
}

function ErrorBanner({ error }) {
    if (!error) return null;
    return (
        <div className="mx-4 mt-4 flex items-center gap-3 rounded border border-red-700/60 bg-red-950/40 px-4 py-2 font-mono text-[12px] text-red-300">
            <span className="font-semibold uppercase tracking-[0.18em]">Link Lost</span>
            <span className="truncate text-red-300/80">
                {error?.message || "Dashboard feed temporarily unavailable."}
            </span>
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
        <div className="-m-6 flex min-h-[calc(100vh-56px)] flex-col bg-[#06090F] text-slate-200">
            <TopBar
                scope={payload.scope}
                generatedAt={payload.generatedAt}
                isFetching={isFetching}
            />

            <ErrorBanner error={error} />

            <main className="flex flex-1 flex-col gap-4 p-4">
                {/* KPI Row */}
                <KpiRow kpis={payload.kpis} loading={isLoading} />

                {/* Main grid: left rail · center · right rail */}
                <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-12">
                    {/* LEFT RAIL */}
                    <div className="flex flex-col gap-4 lg:col-span-3">
                        <AlertsFeed alerts={payload.criticalAlerts} loading={isLoading} />
                        <OverdueList cases={payload.overdueCases} loading={isLoading} />
                    </div>

                    {/* CENTER */}
                    <div className="flex flex-col gap-4 lg:col-span-6">
                        <CaseFlow
                            stageDistribution={payload.stageDistribution}
                            loading={isLoading}
                        />
                        <DurationVariance
                            durationVariance={payload.durationVariance}
                            loading={isLoading}
                        />
                    </div>

                    {/* RIGHT RAIL */}
                    <div className="flex flex-col gap-4 lg:col-span-3">
                        <DoctorWorkload
                            doctorWorkload={payload.doctorWorkload}
                            loading={isLoading}
                        />
                        <Inventory
                            applianceInventory={payload.applianceInventory}
                            photoCoverage={payload.photoCoverage}
                            loading={isLoading}
                        />
                    </div>
                </div>

                {/* Bottom ticker */}
                <CriticalTicker alerts={payload.criticalAlerts} />
            </main>
        </div>
    );
}
