import { memo } from "react";

// Replaced the command-center marquee with a quiet status footer.
// Shows the feed's freshness + scope — no motion, no scrolling text.
// Kept under the original filename so imports stay stable.

function formatUpdated(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function StatusFooter({ generatedAt, scope, totalCritical, totalOverdue }) {
    return (
        <footer className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 rounded-xl bg-slate-50/80 border border-slate-100 text-xs text-slate-500">
            <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold text-slate-600">Live feed</span>
                <span className="text-slate-400">· updated {formatUpdated(generatedAt)}</span>
            </div>
            <div className="flex items-center gap-5">
                <span>
                    Scope: <span className="font-semibold text-slate-700 capitalize">{scope || "owner"}</span>
                </span>
                <span className="tabular-nums">
                    {totalCritical} critical · {totalOverdue} overdue
                </span>
            </div>
        </footer>
    );
}

export default memo(StatusFooter);
