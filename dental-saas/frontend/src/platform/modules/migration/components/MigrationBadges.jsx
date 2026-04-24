import React from "react";

export const STATE_PROGRESS = {
    null: 0,
    PREPARING: 10,
    SYNCING: 35,
    CUTOVER_PENDING: 65,
    CUTOVER: 80,
    VERIFYING: 90,
    COMPLETE: 100,
    FAILED: 0,
    MAINTENANCE: 65,
};

const STATE_BADGE_CLASSES = {
    PREPARING:        "bg-blue-100 text-blue-700",
    SYNCING:          "bg-amber-100 text-amber-700",
    CUTOVER_PENDING:  "bg-orange-100 text-orange-700",
    CUTOVER:          "bg-purple-100 text-purple-700",
    VERIFYING:        "bg-violet-100 text-violet-700",
    COMPLETE:         "bg-emerald-100 text-emerald-700",
    FAILED:           "bg-rose-100 text-rose-700",
    MAINTENANCE:      "bg-amber-100 text-amber-800",
    ACTIVE:           "bg-emerald-100 text-emerald-700",
};

export function StateBadge({ state }) {
    if (!state) {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
                Active
            </span>
        );
    }
    return (
        <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                STATE_BADGE_CLASSES[state] || "bg-gray-100 text-gray-600"
            }`}
        >
            {state.replace(/_/g, " ")}
        </span>
    );
}

export function ProgressBar({ value }) {
    return (
        <div className="w-full h-2 bg-gray-200 rounded overflow-hidden">
            <div
                className="h-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
            />
        </div>
    );
}

const STEPS = ["PREPARING", "SYNCING", "CUTOVER_PENDING", "CUTOVER", "VERIFYING", "COMPLETE"];

export function StateStepper({ current }) {
    const idx = STEPS.indexOf(current);
    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {STEPS.map((s, i) => (
                <React.Fragment key={s}>
                    <span
                        className={
                            current === "FAILED" ? "text-rose-500"
                            : i < idx ? "text-emerald-600"
                            : i === idx ? "text-indigo-600 font-semibold"
                            : "text-gray-400"
                        }
                    >
                        {s.replace(/_/g, " ")}
                    </span>
                    {i < STEPS.length - 1 && <span className="text-gray-300">›</span>}
                </React.Fragment>
            ))}
        </div>
    );
}

export function fmtRelative(date) {
    if (!date) return "never";
    const ms = Date.now() - new Date(date).getTime();
    const s = Math.floor(ms / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
    const d = Math.floor(h / 24);
    if (d === 1) return "yesterday";
    if (d < 30) return `${d} days ago`;
    const mo = Math.floor(d / 30);
    if (mo === 1) return "1 month ago";
    return `${mo} months ago`;
}
