/**
 * FeaturesControlCenter.jsx — Phase 25 System Intelligence Panel (LIVE)
 *
 * Main page composing all sections with LIVE API data:
 *   1. ControlCenterHeader — plan badge + health + real-time indicator
 *   2. SystemWarningBanner — conflicts from API (/conflicts)
 *   3. SystemInsightCards — 4 Stripe-style KPI cards (from API data)
 *   4. ModulesGrid — 4-column cards with live states (/modules)
 *   5. FeaturesTable — enterprise table with live auth chains (/features)
 *   6. FeatureInspectorDrawer — auth decision chain + simulation (/simulate)
 *   7. EntitlementMatrix — live role × permission grid (/permissions)
 *
 * Data flow:
 *   - useModules() → live module states + usage stats
 *   - useFeatureDecisions() → live auth chains per feature
 *   - useLivePermissions() → live role × permission matrix (database)
 *   - useConflicts() → smart conflict detection
 *   - useSimulateAccess() → interactive auth simulation
 *   - useToggleModule() → module toggle mutation
 *   - useFeaturesRealtime() → Socket.IO live updates
 *
 * SENTINEL RULE: capabilities.includes() — ENFORCED
 * SENTINEL RULE: role === "admin" — FORBIDDEN
 * PLANE: Org only
 */

import { useState, useMemo, useCallback } from "react";

import ControlCenterHeader from "../components/ControlCenterHeader";
import SystemWarningBanner from "../components/SystemWarningBanner";
import SystemInsightCards from "../components/SystemInsightCards";
import ModulesGrid from "../components/ModulesGrid";
import FeaturesTable from "../components/FeaturesTable";
import FeatureInspectorDrawer from "../components/FeatureInspectorDrawer";
import EntitlementMatrix from "../components/EntitlementMatrix";
import SettingsBreadcrumb from "@/components/settings/SettingsBreadcrumb";

import {
    useModules,
    useFeatureDecisions,
    useLivePermissions,
    useConflicts,
    useSimulateAccess,
    useToggleModule,
} from "../hooks/useFeaturesControl";

import { useFeaturesRealtime } from "../hooks/useFeaturesRealtime";

import "../styles/features-control-center.css";

// ─── Loading Skeleton ────────────────────────────────────────────────────────

function LoadingSkeleton({ label }) {
    return (
        <div className="fcc-loading-skeleton" role="status" aria-label={`Loading ${label}`}>
            <div className="fcc-skeleton-shimmer" />
            <span className="fcc-skeleton-label">{label}</span>
        </div>
    );
}

// ─── Error Banner ────────────────────────────────────────────────────────────

function ErrorBanner({ message, onRetry }) {
    return (
        <div className="fcc-error-banner" role="alert">
            <span className="fcc-error-icon">⚠️</span>
            <span className="fcc-error-message">{message}</span>
            {onRetry && (
                <button className="fcc-error-retry" onClick={onRetry}>
                    Retry
                </button>
            )}
        </div>
    );
}

// ─── MAIN PAGE COMPONENT ─────────────────────────────────────────────────────

export default function FeaturesControlCenter() {
    // ── Live API data via React Query ────────────────────────────────────
    const {
        data: modulesData,
        isLoading: modulesLoading,
        isError: modulesError,
        refetch: refetchModules,
    } = useModules();

    const {
        data: featuresData,
        isLoading: featuresLoading,
        isError: featuresError,
        refetch: refetchFeatures,
    } = useFeatureDecisions();

    const {
        data: permissionsData,
        isLoading: permissionsLoading,
        isError: permissionsError,
        refetch: refetchPermissions,
    } = useLivePermissions();

    const {
        data: conflictsData,
        isLoading: conflictsLoading,
    } = useConflicts();

    // ── Mutations ────────────────────────────────────────────────────────
    const simulateMutation = useSimulateAccess();
    const toggleMutation = useToggleModule();

    // ── Real-time updates via Socket.IO ──────────────────────────────────
    const { isConnected: realtimeConnected, lastEvent } = useFeaturesRealtime({
        enabled: true,
        onModuleUpdate: (event) => {
            console.log("[FCC] Real-time module update:", event);
        },
    });

    // ── Local UI state ───────────────────────────────────────────────────
    const [inspectedFeature, setInspectedFeature] = useState(null);

    // ── Derived data ─────────────────────────────────────────────────────
    const modules = modulesData?.modules || [];
    const features = featuresData?.features || [];
    const conflicts = conflictsData?.conflicts || [];
    const conflictSummary = conflictsData?.summary || {};

    const roles = permissionsData?.roles || [];
    const permissions = permissionsData?.permissions || [];
    const matrix = permissionsData?.matrix || {};

    // ── Warnings (from conflicts API) ────────────────────────────────────
    const warnings = useMemo(() => {
        return conflicts.map((c) => ({
            icon: c.icon || "⚠️",
            message: c.message,
            source: c.source,
            severity: c.severity,
            recommendation: c.recommendation,
        }));
    }, [conflicts]);

    // ── Insight metrics (computed from live API data) ─────────────────────
    const insights = useMemo(() => ({
        activeModules: modules.filter((m) => m.state === "enabled").length,
        totalModules: modules.length,
        restrictedByPlan: modules.filter((m) => m.state === "locked").length,
        flagOverrides: modules.filter((m) => m.state === "flagged").length,
        activeRoles: roles.length,
        customEntitlements: Object.values(matrix).reduce(
            (sum, perms) =>
                sum +
                Object.values(perms).filter((v) => v === "inherited").length,
            0
        ),
        guardedRoutes: features.filter(
            (f) => f.decisionChain?.[2]?.passed === true
        ).length,
        totalRoutes: features.length,
        conflictCount: conflictSummary.total || 0,
        criticalConflicts: conflictSummary.critical || 0,
    }), [modules, features, roles, matrix, conflictSummary]);

    // ── Matrix permissions (from live API) ───────────────────────────────
    const matrixPermissions = useMemo(
        () => permissions.map((p) => ({ key: p.key, label: p.label })),
        [permissions]
    );

    // ── Handlers ─────────────────────────────────────────────────────────

    const handleModuleToggle = useCallback(
        (moduleKey, enabled) => {
            toggleMutation.mutate(
                { moduleKey, enabled },
                {
                    onError: (err) => {
                        console.error("[FCC] Module toggle failed:", err);
                    },
                }
            );
        },
        [toggleMutation]
    );

    const handleInspect = useCallback((feature) => {
        setInspectedFeature(feature);
    }, []);

    const handleSimulate = useCallback(
        (permission, resourceId) => {
            return simulateMutation.mutateAsync({ permission, resourceId });
        },
        [simulateMutation]
    );

    const handleCellClick = useCallback((cellData) => {
        console.log("[FCC] Matrix cell clicked:", cellData);
        // TODO: Open permission edit modal
    }, []);

    // ── Render ───────────────────────────────────────────────────────────

    const isAnyLoading = modulesLoading || featuresLoading || permissionsLoading;

    return (
        <div className="fcc-page" id="features-control-center">
            <div className="px-1 mb-2">
                <SettingsBreadcrumb current="Feature Control Center" />
            </div>
            {/* ── REAL-TIME INDICATOR ── */}
            <div className="fcc-realtime-indicator" title={realtimeConnected ? "Live updates active" : "Reconnecting..."}>
                <span className={`fcc-realtime-dot ${realtimeConnected ? "fcc-realtime-dot--connected" : "fcc-realtime-dot--disconnected"}`} />
                <span className="fcc-realtime-label">
                    {realtimeConnected ? "Live" : "Offline"}
                </span>
                {lastEvent && (
                    <span className="fcc-realtime-last">
                        Last: {new Date(lastEvent.timestamp).toLocaleTimeString()}
                    </span>
                )}
            </div>

            {/* ── HEADER ── */}
            <ControlCenterHeader
                flagOverrides={insights.flagOverrides}
            />

            {/* ── ERROR BANNERS ── */}
            {modulesError && (
                <ErrorBanner
                    message="Failed to load modules data"
                    onRetry={refetchModules}
                />
            )}
            {featuresError && (
                <ErrorBanner
                    message="Failed to load feature decisions"
                    onRetry={refetchFeatures}
                />
            )}
            {permissionsError && (
                <ErrorBanner
                    message="Failed to load permissions matrix"
                    onRetry={refetchPermissions}
                />
            )}

            {/* ── WARNING BANNER (from live conflicts API) ── */}
            {!conflictsLoading && warnings.length > 0 && (
                <SystemWarningBanner warnings={warnings} />
            )}

            {/* ── INSIGHT CARDS ── */}
            {isAnyLoading ? (
                <LoadingSkeleton label="Loading system insights…" />
            ) : (
                <SystemInsightCards insights={insights} />
            )}

            {/* ── MODULES GRID ── */}
            {modulesLoading ? (
                <LoadingSkeleton label="Loading modules…" />
            ) : (
                <ModulesGrid
                    modules={modules}
                    onToggle={handleModuleToggle}
                    isToggling={toggleMutation.isPending}
                />
            )}

            {/* ── FEATURES TABLE ── */}
            {featuresLoading ? (
                <LoadingSkeleton label="Loading feature decisions…" />
            ) : (
                <FeaturesTable
                    features={features}
                    onInspect={handleInspect}
                />
            )}

            {/* ── ENTITLEMENT MATRIX (live from DB) ── */}
            {permissionsLoading ? (
                <LoadingSkeleton label="Loading permissions matrix…" />
            ) : (
                <EntitlementMatrix
                    roles={roles}
                    permissions={matrixPermissions}
                    matrix={matrix}
                    onCellClick={handleCellClick}
                />
            )}

            {/* ── FEATURE INSPECTOR DRAWER ── */}
            <FeatureInspectorDrawer
                feature={inspectedFeature}
                onClose={() => setInspectedFeature(null)}
                onSimulate={handleSimulate}
                simulationLoading={simulateMutation.isPending}
                simulationResult={simulateMutation.data}
            />
        </div>
    );
}
