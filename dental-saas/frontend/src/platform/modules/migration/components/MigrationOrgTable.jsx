import React, { useState } from "react";
import { Lock, Unlock, CheckCircle2 } from "lucide-react";
import { StateBadge, fmtRelative } from "./MigrationBadges";

function RowStatusBadge({ org }) {
    // Status rules: green = Active, amber = Migrating, red = Failed
    if (org.migrationState === "FAILED") {
        return <StateBadge state="FAILED" />;
    }
    if (org.maintenanceMode || (org.migrationState && org.migrationState !== "COMPLETE")) {
        return <StateBadge state={org.maintenanceMode ? "MAINTENANCE" : org.migrationState} />;
    }
    return <StateBadge state={null} />; // defaults to "Active"
}

function RowControls({ org, onMigrate, onAction }) {
    const state = org.migrationState;
    const [busy, setBusy] = useState(null);

    const run = async (label, fn) => {
        setBusy(label);
        try { await fn(); } finally { setBusy(null); }
    };

    const primaryBtn =
        "text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded disabled:opacity-50";
    const secondaryBtn =
        "text-xs px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded disabled:opacity-50";
    const ghostBtn =
        "text-xs px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded disabled:opacity-50";

    if (state === "FAILED") {
        return (
            <button onClick={() => onMigrate(org)} className={primaryBtn}>
                Retry
            </button>
        );
    }

    if (!state && !org.maintenanceMode) {
        return (
            <button onClick={() => onMigrate(org)} className={primaryBtn}>
                Migrate
            </button>
        );
    }

    return (
        <div className="flex items-center justify-end gap-1">
            {state === "PREPARING" && (
                <button
                    onClick={() => run("sync", () => onAction(org._id, "sync"))}
                    disabled={busy}
                    className={secondaryBtn}
                >
                    {busy === "sync" ? "Syncing…" : "Run sync"}
                </button>
            )}
            {state === "CUTOVER_PENDING" && (
                <button
                    onClick={() => run("cutover", () => onAction(org._id, "cutover"))}
                    disabled={busy}
                    className="text-xs px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded disabled:opacity-50"
                >
                    {busy === "cutover" ? "Cutting over…" : "Cutover"}
                </button>
            )}
            {state === "VERIFYING" && (
                <button
                    onClick={() => run("verify", () => onAction(org._id, "verify"))}
                    disabled={busy}
                    className="text-xs px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded disabled:opacity-50"
                >
                    {busy === "verify" ? "Verifying…" : "Verify & complete"}
                </button>
            )}
            {["PREPARING", "SYNCING", "CUTOVER_PENDING"].includes(state) && (
                <button
                    onClick={() => run("rollback", () => onAction(org._id, "rollback"))}
                    disabled={busy}
                    className={ghostBtn}
                >
                    {busy === "rollback" ? "…" : "Rollback"}
                </button>
            )}
        </div>
    );
}

export function MigrationOrgTable({ orgs, loading, onMigrate, onAction }) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-800">Organizations</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                    {orgs.length} total · click <strong>Migrate</strong> to open the migration modal
                </p>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                        <tr>
                            <th className="text-left px-6 py-3">Org name</th>
                            <th className="text-left px-6 py-3">Current cluster</th>
                            <th className="text-left px-6 py-3">Status</th>
                            <th className="text-left px-6 py-3">Lock</th>
                            <th className="text-left px-6 py-3">Last migration</th>
                            <th className="text-right px-6 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && orgs.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                                    Loading organizations…
                                </td>
                            </tr>
                        )}
                        {!loading && orgs.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-10 text-center text-gray-400">
                                    No organizations found.
                                </td>
                            </tr>
                        )}
                        {orgs.map((org) => (
                            <tr key={org._id} className="border-t border-gray-100 hover:bg-gray-50/60">
                                <td className="px-6 py-3">
                                    <div className="font-medium text-gray-800">{org.name}</div>
                                    <div className="text-xs text-gray-400 font-mono">{org.slug}</div>
                                </td>
                                <td className="px-6 py-3 font-mono text-xs">{org.cluster || "—"}</td>
                                <td className="px-6 py-3">
                                    <RowStatusBadge org={org} />
                                    {org.targetCluster ? (
                                        <div className="text-xs text-indigo-700 font-mono mt-1">
                                            → {org.targetCluster}
                                        </div>
                                    ) : null}
                                </td>
                                <td className="px-6 py-3">
                                    {org.writeLocked ? (
                                        <span className="inline-flex items-center gap-1 text-xs text-rose-600 font-medium">
                                            <Lock className="w-3.5 h-3.5" />
                                            LOCKED
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                                            <Unlock className="w-3.5 h-3.5" />
                                            open
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-3 text-xs text-gray-500">
                                    {org.lastMigrationAt ? (
                                        <span className="inline-flex items-center gap-1">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                            {fmtRelative(org.lastMigrationAt)}
                                        </span>
                                    ) : (
                                        <span className="text-gray-400">never</span>
                                    )}
                                </td>
                                <td className="px-6 py-3 text-right">
                                    <RowControls
                                        org={org}
                                        onMigrate={onMigrate}
                                        onAction={onAction}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default MigrationOrgTable;
