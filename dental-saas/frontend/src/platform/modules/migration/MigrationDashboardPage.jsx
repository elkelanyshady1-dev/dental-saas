/**
 * MigrationDashboardPage.jsx — Phase 8 Org Cluster Migration Admin
 *
 * Mounted at /platform/migration via PLATFORM_FEATURES registry.
 * Required capability: MANAGE_ORGANIZATIONS.
 *
 * Backend contract: see backend/src/routes/platform/migration.routes.js
 */

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
    Activity, ArrowRightLeft, Lock, Unlock, AlertTriangle, RefreshCw,
    Zap, Clock, CheckCircle2, Loader2,
} from "lucide-react";
import platformApi from "../../auth/platformApi";

const STATE_PROGRESS = {
    null: 0,
    PREPARING: 10,
    SYNCING: 35,
    CUTOVER_PENDING: 65,
    CUTOVER: 80,
    VERIFYING: 90,
    COMPLETE: 100,
    FAILED: 0,
};

const STATE_BADGE = {
    PREPARING:        "bg-blue-100 text-blue-700",
    SYNCING:          "bg-amber-100 text-amber-700",
    CUTOVER_PENDING:  "bg-orange-100 text-orange-700",
    CUTOVER:          "bg-purple-100 text-purple-700",
    VERIFYING:        "bg-violet-100 text-violet-700",
    COMPLETE:         "bg-emerald-100 text-emerald-700",
    FAILED:           "bg-rose-100 text-rose-700",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function StateBadge({ state }) {
    if (!state) return <span className="text-slate-400 text-xs">idle</span>;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${STATE_BADGE[state] || "bg-slate-100 text-slate-600"}`}>
            {state}
        </span>
    );
}

function ProgressBar({ value }) {
    return (
        <div className="w-full h-2 bg-slate-200 rounded overflow-hidden">
            <div
                className="h-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
            />
        </div>
    );
}

function StateStepper({ current }) {
    const steps = ["PREPARING", "SYNCING", "CUTOVER_PENDING", "CUTOVER", "VERIFYING", "COMPLETE"];
    const idx = steps.indexOf(current);
    return (
        <div className="flex items-center gap-2 text-xs">
            {steps.map((s, i) => (
                <React.Fragment key={s}>
                    <span
                        className={
                            current === "FAILED" ? "text-rose-500"
                            : i < idx ? "text-emerald-600"
                            : i === idx ? "text-indigo-600 font-semibold"
                            : "text-slate-400"
                        }
                    >
                        {s.replace("_", " ")}
                    </span>
                    {i < steps.length - 1 && <span className="text-slate-300">›</span>}
                </React.Fragment>
            ))}
        </div>
    );
}

// ─── Migration Modal ────────────────────────────────────────────────────────

const DOWNTIME_STAGES = [
    { key: "ENTER",    label: "Entering maintenance mode…",  icon: Lock },
    { key: "DRAIN",    label: "Draining in-flight requests…", icon: Clock },
    { key: "DUMP",     label: "Migrating data…",              icon: ArrowRightLeft },
    { key: "SWAP",     label: "Switching database…",          icon: Zap },
    { key: "DONE",     label: "Migration completed successfully", icon: CheckCircle2 },
];

function Toggle({ checked, onChange, disabled, label }) {
    return (
        <button
            type="button"
            onClick={() => !disabled && onChange(!checked)}
            className={`flex items-center gap-3 w-full p-3 rounded border transition-colors ${
                checked ? "bg-amber-50 border-amber-300" : "bg-slate-50 border-slate-200"
            } ${disabled ? "opacity-60 cursor-not-allowed" : "hover:border-amber-400"}`}
            disabled={disabled}
        >
            <span
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                    checked ? "bg-amber-500" : "bg-slate-300"
                }`}
            >
                <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                        checked ? "translate-x-4" : "translate-x-0.5"
                    }`}
                />
            </span>
            <span className="text-sm font-medium text-slate-700 text-left">{label}</span>
        </button>
    );
}

function DowntimeProgress({ stage, error }) {
    const currentIdx = DOWNTIME_STAGES.findIndex((s) => s.key === stage);
    return (
        <div className="space-y-2">
            {DOWNTIME_STAGES.map((s, i) => {
                const Icon = s.icon;
                const state =
                    error ? (i <= currentIdx ? "done" : "idle")
                    : i < currentIdx ? "done"
                    : i === currentIdx ? "active"
                    : "idle";
                return (
                    <div key={s.key} className="flex items-center gap-2 text-xs">
                        {state === "active" ? (
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                        ) : state === "done" ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : (
                            <Icon className="w-4 h-4 text-slate-300" />
                        )}
                        <span
                            className={
                                state === "active" ? "text-indigo-700 font-medium"
                                : state === "done" ? "text-emerald-700"
                                : "text-slate-400"
                            }
                        >
                            {s.label}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function MigrationModal({ org, clusters, onClose, onStarted }) {
    const [target, setTarget] = useState("");
    const [reason, setReason] = useState("");
    const [downtime, setDowntime] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [downtimeStage, setDowntimeStage] = useState(null);

    const choices = clusters.filter((c) => c !== org?.cluster);

    const startZeroDowntime = async () => {
        setError(null);
        setSubmitting(true);
        try {
            const { data } = await platformApi.post("/migration/start", {
                orgId: org._id,
                targetCluster: target,
                reason: reason || undefined,
            });
            onStarted?.(data?.data);
            onClose();
        } catch (err) {
            setError(err?.response?.data?.message || err.message || "Failed to start migration");
        } finally {
            setSubmitting(false);
        }
    };

    const startDowntime = async () => {
        setError(null);
        setSubmitting(true);
        setDowntimeStage("ENTER");
        try {
            // UI stage progression runs in parallel to the real request.
            // The backend call is synchronous — it only returns when the
            // migration is complete (or has failed). We advance the UI
            // stages on a timer to give the operator feedback during the
            // wait. If the response comes back before a given stage, we
            // skip ahead.
            const stageTicker = (async () => {
                await new Promise((r) => setTimeout(r, 600));
                setDowntimeStage("DRAIN");
                await new Promise((r) => setTimeout(r, 2200));
                setDowntimeStage("DUMP");
                await new Promise((r) => setTimeout(r, 1000));
                setDowntimeStage("SWAP");
            })();

            const { data } = await platformApi.post("/migration/downtime", {
                orgId: org._id,
                sourceCluster: org.cluster,
                targetCluster: target,
                reason: reason || undefined,
            });

            await stageTicker.catch(() => {});
            setDowntimeStage("DONE");
            onStarted?.(data?.data);

            // Give the success frame ~1.2s to be visible before closing.
            setTimeout(onClose, 1200);
        } catch (err) {
            setError(err?.response?.data?.message || err.message || "Downtime migration failed");
            setDowntimeStage(null);
        } finally {
            setSubmitting(false);
        }
    };

    const submit = () => (downtime ? startDowntime() : startZeroDowntime());

    // True from the moment a downtime migration starts through to the
    // success frame's close. Covers the submitting gap AND the 1.2s
    // "DONE" display window — prevents the operator from flipping the
    // toggle or changing the target cluster during the migration.
    const inDowntimeLifecycle =
        downtime && (submitting || downtimeStage === "DONE" || (downtimeStage && downtimeStage !== null));
    const lockControls = submitting || inDowntimeLifecycle;

    if (!org) return null;

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg w-full max-w-md p-6 shadow-2xl">
                <h3 className="text-lg font-semibold flex items-center gap-2 mb-1">
                    <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
                    Migrate organization
                </h3>
                <p className="text-sm text-slate-500 mb-4">{org.name}</p>

                {/* ─── Running state (downtime lifecycle) ─────────────── */}
                {inDowntimeLifecycle && (
                    <div className="space-y-4">
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                            <DowntimeProgress stage={downtimeStage} error={error} />
                        </div>
                        {error && (
                            <div className="flex items-start gap-2 p-3 bg-rose-50 text-rose-700 rounded text-xs">
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                {error}
                            </div>
                        )}
                    </div>
                )}

                {/* ─── Idle / form state ────────────────────────────── */}
                {!inDowntimeLifecycle && (
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-medium text-slate-600 block mb-1">Source cluster</label>
                            <div className="px-3 py-2 bg-slate-50 rounded text-sm text-slate-700 font-mono">
                                {org.cluster}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-medium text-slate-600 block mb-1">Target cluster</label>
                            <select
                                value={target}
                                onChange={(e) => setTarget(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                disabled={lockControls}
                            >
                                <option value="">Select a target cluster…</option>
                                {choices.map((k) => (
                                    <option key={k} value={k}>{k}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-medium text-slate-600 block mb-1">Reason (optional)</label>
                            <input
                                type="text"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="e.g. capacity rebalance"
                                className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                disabled={lockControls}
                            />
                        </div>

                        <Toggle
                            checked={downtime}
                            onChange={setDowntime}
                            disabled={lockControls}
                            label="Downtime Migration Mode"
                        />

                        {error && (
                            <div className="flex items-start gap-2 p-3 bg-rose-50 text-rose-700 rounded text-xs">
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                {error}
                            </div>
                        )}

                        {downtime ? (
                            <div className="text-xs text-amber-800 bg-amber-50 p-3 rounded border border-amber-300">
                                <strong>Warning:</strong> downtime mode will temporarily make this organization
                                unavailable during migration. All tenant requests will be rejected with
                                <span className="font-mono"> 503 MAINTENANCE_MODE </span>
                                until the cluster swap completes.
                            </div>
                        ) : (
                            <div className="text-xs text-slate-500 bg-indigo-50 p-3 rounded border border-indigo-200">
                                <strong>Zero-downtime:</strong> starts a PREPARING state. Use the per-row controls
                                in the table to advance through Sync, Cutover, and Verify. Writes are locked
                                only for the brief cutover window.
                            </div>
                        )}
                    </div>
                )}

                <div className="flex justify-end gap-2 mt-6">
                    <button
                        onClick={onClose}
                        className="px-3 py-2 text-sm text-slate-600 hover:text-slate-800"
                        disabled={submitting}
                    >
                        {submitting ? "Running…" : "Cancel"}
                    </button>
                    <button
                        onClick={submit}
                        disabled={!target || submitting}
                        className={`px-3 py-2 text-white rounded text-sm font-medium disabled:bg-slate-300 disabled:cursor-not-allowed ${
                            downtime ? "bg-amber-600 hover:bg-amber-700" : "bg-indigo-600 hover:bg-indigo-700"
                        }`}
                    >
                        {submitting
                            ? (downtime ? "Migrating…" : "Starting…")
                            : (downtime ? "Start Downtime Migration" : "Start migration")}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Per-row migration controls ─────────────────────────────────────────────

function RowControls({ org, onAction, onMigrate }) {
    const state = org.migrationState;
    const [busy, setBusy] = useState(null);

    const run = async (label, fn) => {
        setBusy(label);
        try { await fn(); } finally { setBusy(null); }
    };

    if (!state) {
        return (
            <button
                onClick={onMigrate}
                className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded"
            >
                Migrate
            </button>
        );
    }

    return (
        <div className="flex items-center gap-1">
            {state === "PREPARING" && (
                <button
                    onClick={() => run("sync", () => onAction(org._id, "sync"))}
                    disabled={busy}
                    className="text-xs px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded disabled:opacity-50"
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
                    className="text-xs px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded disabled:opacity-50"
                >
                    {busy === "rollback" ? "…" : "Rollback"}
                </button>
            )}
            {state === "FAILED" && (
                <button
                    onClick={onMigrate}
                    className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded"
                >
                    Retry
                </button>
            )}
        </div>
    );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function MigrationDashboardPage() {
    const [orgs, setOrgs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);
    const [modalOrg, setModalOrg] = useState(null);

    const load = useCallback(async () => {
        try {
            const { data } = await platformApi.get("/migration/orgs");
            setOrgs(data?.data || []);
            setErr(null);
        } catch (e) {
            setErr(e?.response?.data?.message || e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial load + polling whenever any org has an active migration.
    useEffect(() => { load(); }, [load]);

    const hasActive = useMemo(
        () => orgs.some((o) => o.migrationState && o.migrationState !== "FAILED"),
        [orgs]
    );

    useEffect(() => {
        if (!hasActive) return;
        const id = setInterval(load, 3000);
        return () => clearInterval(id);
    }, [hasActive, load]);

    const clusters = useMemo(() => {
        const set = new Set();
        orgs.forEach((o) => o.cluster && set.add(o.cluster));
        // Add any explicit cluster keys from window env (if exposed) — fall back
        // to whatever shows up in the orgs table.
        return Array.from(set).sort();
    }, [orgs]);

    const handleAction = useCallback(async (orgId, action) => {
        try {
            const url = `/migration/${orgId}/${action}`;
            await platformApi.post(url);
            await load();
        } catch (e) {
            const msg = e?.response?.data?.message || e.message || `Failed to ${action}`;
            // eslint-disable-next-line no-alert
            window.alert(msg);
        }
    }, [load]);

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold flex items-center gap-2">
                        <ArrowRightLeft className="w-6 h-6 text-indigo-600" />
                        Org Cluster Migration
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Move organizations between MongoDB clusters with zero data loss.
                        Phase 8 controls — writes are locked during migration; routingEpoch is
                        bumped atomically at cutover.
                    </p>
                </div>
                <button
                    onClick={load}
                    className="text-sm px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded flex items-center gap-1.5"
                    disabled={loading}
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </button>
            </div>

            {hasActive && (
                <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded text-xs">
                    <Activity className="w-4 h-4 animate-pulse" />
                    Live updates active — table refreshes every 3 seconds while a migration is in progress.
                </div>
            )}

            {err && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 text-rose-700 rounded text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    {err}
                </div>
            )}

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                        <tr>
                            <th className="text-left px-4 py-2">Organization</th>
                            <th className="text-left px-4 py-2">Cluster</th>
                            <th className="text-left px-4 py-2">Target</th>
                            <th className="text-left px-4 py-2 w-72">State</th>
                            <th className="text-left px-4 py-2">Lock</th>
                            <th className="text-left px-4 py-2">Epoch</th>
                            <th className="text-right px-4 py-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && orgs.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                                    Loading organizations…
                                </td>
                            </tr>
                        )}
                        {!loading && orgs.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                                    No organizations found.
                                </td>
                            </tr>
                        )}
                        {orgs.map((org) => {
                            const progress = STATE_PROGRESS[org.migrationState] ?? 0;
                            return (
                                <tr key={org._id} className="border-t border-slate-100 hover:bg-slate-50/60">
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-slate-800">{org.name}</div>
                                        <div className="text-xs text-slate-400 font-mono">{org.slug}</div>
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs">{org.cluster || "—"}</td>
                                    <td className="px-4 py-3 font-mono text-xs text-indigo-700">
                                        {org.targetCluster || "—"}
                                    </td>
                                    <td className="px-4 py-3 space-y-1.5">
                                        <StateBadge state={org.migrationState} />
                                        {org.migrationState && (
                                            <>
                                                <ProgressBar value={progress} />
                                                <StateStepper current={org.migrationState} />
                                            </>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        {org.writeLocked ? (
                                            <span className="inline-flex items-center gap-1 text-xs text-rose-600 font-medium">
                                                <Lock className="w-3.5 h-3.5" />
                                                LOCKED
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                                                <Unlock className="w-3.5 h-3.5" />
                                                open
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                                        {org.routingEpoch ?? 1}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <RowControls
                                            org={org}
                                            onAction={handleAction}
                                            onMigrate={() => setModalOrg(org)}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {modalOrg && (
                <MigrationModal
                    org={modalOrg}
                    clusters={clusters}
                    onClose={() => setModalOrg(null)}
                    onStarted={load}
                />
            )}
        </div>
    );
}
