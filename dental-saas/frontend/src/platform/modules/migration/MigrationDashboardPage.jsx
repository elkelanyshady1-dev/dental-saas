/**
 * MigrationDashboardPage.jsx — Migration Control Dashboard (modular)
 *
 * Mounted at /platform/migration via PLATFORM_FEATURES registry.
 * Required capability: MANAGE_ORGANIZATIONS.
 *
 * This page is a thin orchestrator. All feature logic lives in:
 *   hooks/        — data layer (fetch + derived state)
 *   components/   — isolated UI blocks (table, cards, modal, history, live)
 */

import React, { useCallback, useMemo, useState } from "react";
import { ArrowRightLeft, RefreshCw, AlertTriangle } from "lucide-react";
import platformApi from "../../auth/platformApi";

import { useMigrationOrgs } from "./hooks/useMigrationOrgs";
import { useMigrationHistory } from "./hooks/useMigrationHistory";
import { useMigrationStatus } from "./hooks/useMigrationStatus";

import MigrationSummaryCards from "./components/MigrationSummaryCards";
import MigrationLiveStatus from "./components/MigrationLiveStatus";
import MigrationOrgTable from "./components/MigrationOrgTable";
import MigrationHistoryPanel from "./components/MigrationHistoryPanel";
import MigrationModal from "./components/MigrationModal";

export default function MigrationDashboardPage() {
    const { data: orgs, loading, error, refetch } = useMigrationOrgs();
    const { data: history, loading: historyLoading, error: historyError } = useMigrationHistory();
    const { active } = useMigrationStatus(orgs);

    const [modalOrg, setModalOrg] = useState(null);

    const clusters = useMemo(() => {
        const set = new Set();
        orgs.forEach((o) => o.cluster && set.add(o.cluster));
        return Array.from(set).sort();
    }, [orgs]);

    const handleAction = useCallback(
        async (orgId, action) => {
            try {
                await platformApi.post(`/migration/${orgId}/${action}`);
                await refetch();
            } catch (e) {
                const msg = e?.response?.data?.message || e.message || `Failed to ${action}`;
                window.alert(msg);
            }
        },
        [refetch]
    );

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold flex items-center gap-2 text-gray-800">
                        <ArrowRightLeft className="w-6 h-6 text-indigo-600" />
                        Migration Control
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Move organizations between MongoDB clusters. Zero-downtime by default;
                        switch to Downtime Mode for small orgs or when change streams aren't
                        available.
                    </p>
                </div>
                <button
                    onClick={refetch}
                    disabled={loading}
                    className="text-sm px-3 py-2 bg-white border border-gray-200 shadow-sm hover:bg-gray-50 rounded-2xl flex items-center gap-1.5"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </button>
            </div>

            {/* Error banner */}
            {error && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 text-rose-700 rounded-2xl text-sm border border-rose-200">
                    <AlertTriangle className="w-4 h-4" />
                    {error}
                </div>
            )}

            {/* Section A — Summary cards */}
            <MigrationSummaryCards orgs={orgs} />

            {/* Section C — Live migration status (only when active) */}
            <MigrationLiveStatus active={active} />

            {/* Section B — Organization table */}
            <MigrationOrgTable
                orgs={orgs}
                loading={loading}
                onMigrate={setModalOrg}
                onAction={handleAction}
            />

            {/* Section D — History panel */}
            <MigrationHistoryPanel
                history={history}
                loading={historyLoading}
                error={historyError}
            />

            {/* Migration modal (toggle + zero-downtime + downtime flows) */}
            {modalOrg && (
                <MigrationModal
                    org={modalOrg}
                    clusters={clusters}
                    onClose={() => setModalOrg(null)}
                    onStarted={refetch}
                />
            )}
        </div>
    );
}
