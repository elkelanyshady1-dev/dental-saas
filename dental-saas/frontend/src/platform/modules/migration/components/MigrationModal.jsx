import React, { useState } from "react";
import {
    ArrowRightLeft, AlertTriangle, Lock, Clock, Zap, CheckCircle2, Loader2,
} from "lucide-react";
import platformApi from "../../../auth/platformApi";

const DOWNTIME_STAGES = [
    { key: "ENTER", label: "Entering maintenance mode…",      icon: Lock },
    { key: "DRAIN", label: "Draining in-flight requests…",    icon: Clock },
    { key: "DUMP",  label: "Migrating data…",                 icon: ArrowRightLeft },
    { key: "SWAP",  label: "Switching database…",             icon: Zap },
    { key: "DONE",  label: "Migration completed successfully", icon: CheckCircle2 },
];

function Toggle({ checked, onChange, disabled, label }) {
    return (
        <button
            type="button"
            onClick={() => !disabled && onChange(!checked)}
            className={`flex items-center gap-3 w-full p-3 rounded-2xl border transition-colors ${
                checked ? "bg-amber-50 border-amber-300" : "bg-gray-50 border-gray-200"
            } ${disabled ? "opacity-60 cursor-not-allowed" : "hover:border-amber-400"}`}
            disabled={disabled}
        >
            <span
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
                    checked ? "bg-amber-500" : "bg-gray-300"
                }`}
            >
                <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                        checked ? "translate-x-4" : "translate-x-0.5"
                    }`}
                />
            </span>
            <span className="text-sm font-medium text-gray-700 text-left">{label}</span>
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
                            <Icon className="w-4 h-4 text-gray-300" />
                        )}
                        <span
                            className={
                                state === "active" ? "text-indigo-700 font-medium"
                                : state === "done" ? "text-emerald-700"
                                : "text-gray-400"
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

export function MigrationModal({ org, clusters, onClose, onStarted }) {
    const [target, setTarget] = useState("");
    const [reason, setReason] = useState("");
    const [downtime, setDowntime] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [downtimeStage, setDowntimeStage] = useState(null);

    const choices = (clusters || []).filter((c) => c !== org?.cluster);

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
            setTimeout(onClose, 1200);
        } catch (err) {
            setError(err?.response?.data?.message || err.message || "Downtime migration failed");
            setDowntimeStage(null);
        } finally {
            setSubmitting(false);
        }
    };

    const submit = () => (downtime ? startDowntime() : startZeroDowntime());

    const inDowntimeLifecycle =
        downtime && (submitting || downtimeStage === "DONE" || (downtimeStage && downtimeStage !== null));
    const lockControls = submitting || inDowntimeLifecycle;

    if (!org) return null;

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-gray-200">
                <h3 className="text-lg font-semibold flex items-center gap-2 mb-1">
                    <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
                    Migrate organization
                </h3>
                <p className="text-sm text-gray-500 mb-4">{org.name}</p>

                {inDowntimeLifecycle && (
                    <div className="space-y-4">
                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl">
                            <DowntimeProgress stage={downtimeStage} error={error} />
                        </div>
                        {error && (
                            <div className="flex items-start gap-2 p-3 bg-rose-50 text-rose-700 rounded-2xl text-xs">
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                {error}
                            </div>
                        )}
                    </div>
                )}

                {!inDowntimeLifecycle && (
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">
                                Source cluster
                            </label>
                            <div className="px-3 py-2 bg-gray-50 rounded text-sm text-gray-700 font-mono">
                                {org.cluster}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">
                                Target cluster
                            </label>
                            <select
                                value={target}
                                onChange={(e) => setTarget(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                disabled={lockControls}
                            >
                                <option value="">Select a target cluster…</option>
                                {choices.map((k) => (
                                    <option key={k} value={k}>{k}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">
                                Reason (optional)
                            </label>
                            <input
                                type="text"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="e.g. capacity rebalance"
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                            <div className="flex items-start gap-2 p-3 bg-rose-50 text-rose-700 rounded-2xl text-xs">
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                {error}
                            </div>
                        )}

                        {downtime ? (
                            <div className="text-xs text-amber-800 bg-amber-50 p-3 rounded-2xl border border-amber-300">
                                <strong>Warning:</strong> downtime mode will temporarily make this
                                organization unavailable during migration. All tenant requests will
                                be rejected with
                                <span className="font-mono"> 503 MAINTENANCE_MODE </span>
                                until the cluster swap completes.
                            </div>
                        ) : (
                            <div className="text-xs text-gray-500 bg-indigo-50 p-3 rounded-2xl border border-indigo-200">
                                <strong>Zero-downtime:</strong> starts a PREPARING state. Use the per-row
                                controls in the table to advance through Sync, Cutover, and Verify. Writes
                                are locked only for the brief cutover window.
                            </div>
                        )}
                    </div>
                )}

                <div className="flex justify-end gap-2 mt-6">
                    <button
                        onClick={onClose}
                        className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
                        disabled={submitting}
                    >
                        {submitting ? "Running…" : "Cancel"}
                    </button>
                    <button
                        onClick={submit}
                        disabled={!target || submitting}
                        className={`px-3 py-2 text-white rounded text-sm font-medium disabled:bg-gray-300 disabled:cursor-not-allowed ${
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

export default MigrationModal;
