import { useMemo } from "react";

const STATE_PROGRESS = {
    PREPARING: 10,
    SYNCING: 35,
    CUTOVER_PENDING: 65,
    CUTOVER: 80,
    VERIFYING: 90,
    COMPLETE: 100,
    FAILED: 0,
};

/**
 * Derives live-migration info from the orgs list returned by useMigrationOrgs.
 * Returns { active, hasActive } where `active` is an array of:
 *   { orgId, name, cluster, targetCluster, state, progress, writeLocked,
 *     maintenanceMode }
 */
export function useMigrationStatus(orgs) {
    return useMemo(() => {
        const active = (orgs || [])
            .filter((o) =>
                (o.migrationState && o.migrationState !== "FAILED") || o.maintenanceMode
            )
            .map((o) => ({
                orgId: String(o._id),
                name: o.name,
                cluster: o.cluster,
                targetCluster: o.targetCluster,
                state: o.maintenanceMode ? "MAINTENANCE" : o.migrationState,
                progress: o.maintenanceMode
                    ? 65
                    : (STATE_PROGRESS[o.migrationState] ?? 0),
                writeLocked: !!o.writeLocked,
                maintenanceMode: !!o.maintenanceMode,
            }));

        return { active, hasActive: active.length > 0 };
    }, [orgs]);
}
