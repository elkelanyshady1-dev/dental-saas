/**
 * BackupPolicyForm.tsx — Scheduled backup policy configuration form.
 *
 * Features:
 *   - Enable/disable toggle
 *   - Frequency dropdown (daily / weekly, constrained by plan)
 *   - Day of week selector (weekly mode only)
 *   - Time picker (UTC)
 *   - Retention days input (constrained by plan max)
 *   - Plan limit enforcement in form UI (server also enforces)
 *   - Loading, saving, and error states
 *
 * PLANE: Organization
 * RULE: Uses useQuery (via useBackupPolicy) + useMutation (via useSetBackupPolicy)
 *       — no useState for server state
 */

import { useState, useEffect } from "react";
import {
    useBackupPolicy,
    useSetBackupPolicy,
    type BackupPolicy,
    type PlanLimits,
} from "@/modules/org/settings/hooks/useStorage";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ─── Plan Tier Badge ──────────────────────────────────────────────────────────

function PlanLimitBadge({ label }: { label: string }) {
    return (
        <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/20">
            {label}
        </span>
    );
}

// ─── Form Component ───────────────────────────────────────────────────────────

interface FormState {
    enabled:       boolean;
    frequency:     "daily" | "weekly";
    timeOfDay:     string;
    dayOfWeek:     number;
    retentionDays: number;
}

function defaultFormState(policy: BackupPolicy | null, limits: PlanLimits): FormState {
    return {
        enabled:       policy?.enabled       ?? false,
        frequency:     policy?.frequency     ?? "weekly",
        timeOfDay:     policy?.timeOfDay     ?? "02:00",
        dayOfWeek:     policy?.dayOfWeek     ?? 0,
        retentionDays: policy?.retentionDays ?? Math.min(7, limits.maxRetentionDays),
    };
}

export default function BackupPolicyForm() {
    const { data, isLoading, isError } = useBackupPolicy();
    const { mutate, isPending, isError: saveError, isSuccess } = useSetBackupPolicy();

    const [form, setForm] = useState<FormState | null>(null);
    const [dirty, setDirty] = useState(false);

    // Initialize form when data arrives (only once, or when policy ID changes)
    useEffect(() => {
        if (data) {
            setForm(defaultFormState(data.policy, data.planLimits));
            setDirty(false);
        }
    }, [data?.policy?._id]);  // only reset if the policy document changes

    if (isLoading) {
        return (
            <div className="rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-6 space-y-4">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-10 bg-slate-800/40 rounded-xl animate-pulse" />
                ))}
            </div>
        );
    }

    if (isError || !data || !form) {
        return (
            <div className="rounded-2xl bg-slate-900/60 border border-red-900/30 p-6">
                <p className="text-xs text-red-400">Failed to load backup policy settings.</p>
            </div>
        );
    }

    const { planLimits } = data;
    const canDaily = planLimits.maxBackupFrequency === "daily";

    function update<K extends keyof FormState>(key: K, value: FormState[K]) {
        setForm((prev) => prev ? { ...prev, [key]: value } : prev);
        setDirty(true);
    }

    function handleSave() {
        if (!form) return;

        // Clamp retentionDays to plan max before saving
        const payload = {
            ...form,
            retentionDays: Math.min(form.retentionDays, planLimits.maxRetentionDays),
        };

        mutate(payload, {
            onSuccess: () => setDirty(false),
        });
    }

    return (
        <div className="rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-6 space-y-6">
            {/* ── Header ───────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-base font-bold text-slate-100">Scheduled Backups</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Automatically back up your organization data on a schedule.
                    </p>
                </div>

                {/* Enable/Disable toggle */}
                <button
                    onClick={() => update("enabled", !form.enabled)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none ${
                        form.enabled
                            ? "border-violet-500 bg-violet-500"
                            : "border-slate-600 bg-slate-700"
                    }`}
                    role="switch"
                    aria-checked={form.enabled}
                >
                    <span
                        className={`pointer-events-none inline-block h-4 w-4 translate-x-0 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            form.enabled ? "translate-x-5" : "translate-x-0.5"
                        }`}
                    />
                </button>
            </div>

            {/* ── Frequency ────────────────────────────────────────────────── */}
            <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Frequency
                    {!canDaily && <PlanLimitBadge label="Daily requires upgrade" />}
                </label>
                <div className="flex gap-3">
                    {(["weekly", "daily"] as const).map((freq) => {
                        const blocked = freq === "daily" && !canDaily;
                        return (
                            <button
                                key={freq}
                                onClick={() => !blocked && update("frequency", freq)}
                                disabled={blocked}
                                className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold capitalize transition-colors ${
                                    form.frequency === freq
                                        ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                                        : blocked
                                        ? "border-slate-700/50 text-slate-600 cursor-not-allowed"
                                        : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                                }`}
                            >
                                {freq}
                                {blocked && <span className="ml-1 text-[10px]">🔒</span>}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Day of Week (weekly only) ─────────────────────────────────── */}
            {form.frequency === "weekly" && (
                <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Day of Week
                    </label>
                    <select
                        value={form.dayOfWeek}
                        onChange={(e) => update("dayOfWeek", Number(e.target.value))}
                        className="w-full rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2.5 focus:outline-none focus:border-violet-500"
                    >
                        {DAY_NAMES.map((day, i) => (
                            <option key={i} value={i}>{day}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* ── Time of Day ───────────────────────────────────────────────── */}
            <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Time (UTC)
                </label>
                <input
                    type="time"
                    value={form.timeOfDay}
                    onChange={(e) => update("timeOfDay", e.target.value)}
                    className="w-full rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2.5 focus:outline-none focus:border-violet-500"
                />
                <p className="text-[10px] text-slate-600">
                    All times are in UTC. Current UTC: {new Date().toUTCString().slice(17, 22)}
                </p>
            </div>

            {/* ── Retention Days ────────────────────────────────────────────── */}
            <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Keep Backups For (days)
                    <span className="ml-2 text-slate-600 normal-case font-normal">
                        max {planLimits.maxRetentionDays} on your plan
                    </span>
                </label>
                <div className="flex items-center gap-3">
                    <input
                        type="number"
                        min={1}
                        max={planLimits.maxRetentionDays}
                        value={form.retentionDays}
                        onChange={(e) => {
                            const val = Math.min(
                                Math.max(1, parseInt(e.target.value, 10) || 1),
                                planLimits.maxRetentionDays
                            );
                            update("retentionDays", val);
                        }}
                        className="w-24 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2.5 focus:outline-none focus:border-violet-500 tabular-nums"
                    />
                    <span className="text-sm text-slate-500">days</span>
                </div>

                {/* Retention duration bar */}
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1.5">
                    <div
                        className="h-full bg-violet-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min((form.retentionDays / planLimits.maxRetentionDays) * 100, 100)}%` }}
                    />
                </div>
            </div>

            {/* ── Error / Success ───────────────────────────────────────────── */}
            {saveError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">
                    Failed to save policy. Check if your settings comply with your plan limits.
                </p>
            )}
            {isSuccess && !dirty && (
                <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-lg">
                    Backup policy saved successfully.
                </p>
            )}

            {/* ── Save Button ───────────────────────────────────────────────── */}
            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={!dirty || isPending}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-300 text-sm font-semibold hover:bg-violet-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isPending ? (
                        <>
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Saving…
                        </>
                    ) : (
                        "Save Policy"
                    )}
                </button>
            </div>
        </div>
    );
}
