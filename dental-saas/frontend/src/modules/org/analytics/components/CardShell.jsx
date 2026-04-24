/**
 * CardShell.jsx — shared chrome for every analytics card.
 * Handles loading skeleton, error banner, and empty state.
 */
import { ArrowPathIcon } from "@heroicons/react/24/outline";

export default function CardShell({ title, subtitle, isLoading, isError, isEmpty, onRetry, children, actions, className = "" }) {
    return (
        <div className={`bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-4 flex flex-col ${className}`}>
            <header className="flex items-start justify-between gap-3 mb-3">
                <div>
                    <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
                    {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
                </div>
                {actions}
            </header>
            {isLoading ? (
                <div className="flex-1 min-h-[180px] rounded-xl bg-slate-800/40 animate-pulse" />
            ) : isError ? (
                <div className="flex-1 min-h-[180px] flex flex-col items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-300 text-sm">
                    <span>Couldn't load this widget.</span>
                    {onRetry && (
                        <button
                            type="button"
                            onClick={onRetry}
                            className="inline-flex items-center gap-1 text-xs text-rose-200 hover:text-white"
                        >
                            <ArrowPathIcon className="w-3.5 h-3.5" /> Retry
                        </button>
                    )}
                </div>
            ) : isEmpty ? (
                <div className="flex-1 min-h-[180px] flex flex-col items-center justify-center gap-1 text-slate-500 text-sm">
                    <span>No data in this range.</span>
                </div>
            ) : (
                <div className="flex-1">{children}</div>
            )}
        </div>
    );
}
