/**
 * RetentionPolicyCard.tsx — Read-only display of the active retention policy.
 *
 * Shows:
 *   - Whether scheduled backups are enabled
 *   - Backup frequency + day/time
 *   - How long backups are retained
 *   - Last run timestamp
 *   - Computed next scheduled run
 *
 * PLANE: Organization
 * RULE: Read-only display — no mutations. Mutations are in BackupPolicyForm.
 *       Uses useBackupPolicy (useQuery) — no useState for server state.
 */

import { useBackupPolicy } from "@/modules/org/settings/hooks/useStorage";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Compute the next UTC run timestamp from the policy.
 * Returns an ISO string or null if policy is disabled / cannot be determined.
 */
function computeNextRun(policy: {
    enabled: boolean;
    frequency: "daily" | "weekly";
    timeOfDay: string;         // "HH:MM"
    dayOfWeek: number;
    lastRunAt: string | null;
}): Date | null {
    if (!policy.enabled) return null;

    const [hStr, mStr] = policy.timeOfDay.split(":");
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);

    const now = new Date();

    // Build a candidate Date for today at the scheduled time (UTC)
    const candidate = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        h, m, 0, 0,
    ));

    if (policy.frequency === "daily") {
        // If today's scheduled time has passed, advance by 1 day
        if (candidate <= now) candidate.setUTCDate(candidate.getUTCDate() + 1);
        return candidate;
    }

    // Weekly — advance to the next matching day of week
    const targetDay = policy.dayOfWeek;
    let daysAhead = (targetDay - now.getUTCDay() + 7) % 7;

    // If today is the target day but the time has already passed, push to next week
    if (daysAhead === 0 && candidate <= now) daysAhead = 7;

    candidate.setUTCDate(candidate.getUTCDate() + daysAhead);
    return candidate;
}

function formatUTC(date: Date): string {
    return date.toUTCString().replace("GMT", "UTC");
}

function formatRelative(date: Date): string {
    const diffMs = date.getTime() - Date.now();
    const diffH  = Math.floor(diffMs / 3_600_000);
    const diffM  = Math.floor((diffMs % 3_600_000) / 60_000);

    if (diffH >= 24) {
        const days = Math.floor(diffH / 24);
        return `in ${days} day${days !== 1 ? "s" : ""}`;
    }
    if (diffH > 0) return `in ${diffH}h ${diffM}m`;
    if (diffM > 0) return `in ${diffM}m`;
    return "very soon";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between py-2.5 border-b border-slate-800/60 last:border-0">
            <span className="text-xs text-slate-500">{label}</span>
            <span className="text-xs font-medium text-slate-200">{value}</span>
        </div>
    );
}

function StatusDot({ active }: { active: boolean }) {
    return (
        <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${active ? "bg-emerald-400" : "bg-slate-600"}`} />
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RetentionPolicyCard() {
    const { data, isLoading, isError } = useBackupPolicy();

    if (isLoading) {
        return (
            <div className="rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-6 space-y-3">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 bg-slate-800/40 rounded-xl animate-pulse" />
                ))}
            </div>
        );
    }

    if (isError || !data) {
        return (
            <div className="rounded-2xl bg-slate-900/60 border border-red-900/30 p-6">
                <p className="text-xs text-red-400">Failed to load retention policy.</p>
            </div>
        );
    }

    const { policy, planLimits } = data;

    // Policy may be null if never configured
    if (!policy) {
        return (
            <div className="rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-6">
                <h3 className="text-base font-bold text-slate-100 mb-1">Retention Policy</h3>
                <p className="text-xs text-slate-500">
                    No backup policy configured. Enable scheduled backups above to activate retention.
                </p>
            </div>
        );
    }

    const nextRun   = computeNextRun(policy);
    const scheduleLabel = policy.frequency === "daily"
        ? `Daily at ${policy.timeOfDay} UTC`
        : `Weekly on ${DAY_NAMES[policy.dayOfWeek]} at ${policy.timeOfDay} UTC`;

    return (
        <div className="rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-6 space-y-4">
            {/* ── Header ───────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-base font-bold text-slate-100">Retention Policy</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Current backup schedule and retention window.
                    </p>
                </div>

                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    policy.enabled
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                        : "bg-slate-700/40 text-slate-500 border border-slate-700/60"
                }`}>
                    <StatusDot active={policy.enabled} />
                    {policy.enabled ? "Active" : "Disabled"}
                </span>
            </div>

            {/* ── Info Grid ────────────────────────────────────────────────── */}
            <div className="divide-y divide-slate-800/60">
                <InfoRow label="Schedule"        value={scheduleLabel} />
                <InfoRow
                    label="Keep backups for"
                    value={
                        <span>
                            {policy.retentionDays} day{policy.retentionDays !== 1 ? "s" : ""}
                            <span className="ml-1.5 text-slate-600">
                                (plan max: {planLimits.maxRetentionDays})
                            </span>
                        </span>
                    }
                />
                <InfoRow
                    label="Last run"
                    value={
                        policy.lastRunAt
                            ? formatUTC(new Date(policy.lastRunAt))
                            : <span className="text-slate-600">Never</span>
                    }
                />
                {policy.enabled && nextRun && (
                    <InfoRow
                        label="Next scheduled run"
                        value={
                            <span title={formatUTC(nextRun)}>
                                {formatRelative(nextRun)}
                                <span className="ml-1.5 text-slate-600 text-[10px]">
                                    ({nextRun.toUTCString().slice(0, 22)} UTC)
                                </span>
                            </span>
                        }
                    />
                )}
            </div>

            {/* ── Retention bar ─────────────────────────────────────────────── */}
            <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-slate-600">
                    <span>Retention window</span>
                    <span>{policy.retentionDays} / {planLimits.maxRetentionDays} days</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-violet-500/60 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min((policy.retentionDays / planLimits.maxRetentionDays) * 100, 100)}%` }}
                    />
                </div>
            </div>
        </div>
    );
}
