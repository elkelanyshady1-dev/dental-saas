/**
 * Feedback.jsx
 * Platform UI Primitive — Inline Feedback Banners
 *
 * Replaces all ad-hoc alert / error / success inline divs.
 * Every platform page uses a consistent feedback pattern.
 *
 * Components:
 *   AlertBanner  — general purpose (variants: error, success, warning, info)
 *   ErrorState   — full-section error with retry button
 *   LoadingState — centered spinner with message
 *   EmptyState   — icon + title + description + optional action
 */
import { AlertTriangle, CheckCircle2, Info, XCircle, Loader2 } from "lucide-react";

// ── AlertBanner ───────────────────────────────────────────────────────────────

const BANNER_VARIANTS = {
    error: {
        wrapper: "bg-red-50 border-red-200",
        icon: XCircle,
        iconCls: "text-red-500",
        textCls: "text-red-700",
    },
    success: {
        wrapper: "bg-emerald-50 border-emerald-200",
        icon: CheckCircle2,
        iconCls: "text-emerald-500",
        textCls: "text-emerald-700",
    },
    warning: {
        wrapper: "bg-amber-50 border-amber-200",
        icon: AlertTriangle,
        iconCls: "text-amber-500",
        textCls: "text-amber-700",
    },
    info: {
        wrapper: "bg-blue-50 border-blue-200",
        icon: Info,
        iconCls: "text-blue-500",
        textCls: "text-blue-700",
    },
};

export function AlertBanner({ variant = "error", message, action, onDismiss }) {
    const c = BANNER_VARIANTS[variant] || BANNER_VARIANTS.error;
    const Icon = c.icon;

    if (!message) return null;

    return (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${c.wrapper} animate-fadeIn`}>
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${c.iconCls}`} />
            <p className={`text-sm font-medium flex-1 ${c.textCls}`}>{message}</p>
            {action && (
                <button
                    onClick={action.onClick}
                    className={`text-sm font-semibold transition-colors ${c.textCls} hover:opacity-70 shrink-0`}
                >
                    {action.label}
                </button>
            )}
            {onDismiss && (
                <button onClick={onDismiss} className={`${c.textCls} opacity-50 hover:opacity-100 transition-opacity shrink-0 text-lg leading-none`}>
                    ×
                </button>
            )}
        </div>
    );
}

// ── ErrorState ────────────────────────────────────────────────────────────────

export function ErrorState({ message, onRetry }) {
    return (
        <div className="flex items-start gap-3 p-5 bg-red-50 border border-red-200 rounded-2xl">
            <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
                <p className="text-red-700 font-semibold mb-0.5">Something went wrong</p>
                <p className="text-red-600/80 text-sm">{message}</p>
                {onRetry && (
                    <button
                        onClick={onRetry}
                        className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
                    >
                        Retry →
                    </button>
                )}
            </div>
        </div>
    );
}

// ── LoadingState ──────────────────────────────────────────────────────────────

export function LoadingState({ message = "Loading…", fullPage = false }) {
    return (
        <div className={`flex items-center justify-center gap-3 text-slate-500 ${fullPage ? "min-h-[60vh]" : "py-16"}`}>
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            <span className="text-sm font-medium">{message}</span>
        </div>
    );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

export function EmptyState({ icon: Icon, title, description, action }) {
    return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
            {Icon && (
                <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-5">
                    <Icon className="w-8 h-8 text-slate-400" />
                </div>
            )}
            <h3 className="text-lg font-semibold text-slate-800 mb-2">{title}</h3>
            {description && (
                <p className="text-slate-500 text-sm max-w-sm mb-6">{description}</p>
            )}
            {action && (
                <button
                    onClick={action.onClick}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all active:scale-95 shadow-sm shadow-blue-200"
                >
                    {action.icon && action.icon}
                    {action.label}
                </button>
            )}
        </div>
    );
}
