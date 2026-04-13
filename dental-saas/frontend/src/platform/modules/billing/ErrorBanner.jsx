/**
 * ErrorBanner.jsx
 * Sprint 7.2 — Structured Error Display
 *
 * Replaces generic inline error strings across billing/finance pages.
 * Supports: dismiss, retry, severity levels.
 *
 * Props:
 *   error     string | null   — error message (null = hidden)
 *   onDismiss () => void      — optional dismiss handler
 *   onRetry   () => void      — optional retry handler (shows retry button)
 *   severity  "error" | "warning" | "info"
 *   title     string          — optional header above message
 */

import React from "react";
import { AlertTriangle, Info, RefreshCw, X } from "lucide-react";

const SEVERITY_MAP = {
    error: { bg: "bg-red-50 border-red-200", text: "text-red-700", sub: "text-red-500", icon: AlertTriangle, iconColor: "text-red-500" },
    warning: { bg: "bg-amber-50 border-amber-200", text: "text-amber-800", sub: "text-amber-600", icon: AlertTriangle, iconColor: "text-amber-500" },
    info: { bg: "bg-blue-50 border-blue-200", text: "text-blue-800", sub: "text-blue-500", icon: Info, iconColor: "text-blue-500" },
};

export default function ErrorBanner({ error, onDismiss, onRetry, severity = "error", title }) {
    if (!error) return null;

    const { bg, text, sub, icon: Icon, iconColor } = SEVERITY_MAP[severity] || SEVERITY_MAP.error;

    return (
        <div className={`flex items-start gap-3 rounded-2xl border px-5 py-4 ${bg}`} role="alert">
            <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconColor}`} />
            <div className="flex-1 min-w-0">
                {title && (
                    <p className={`text-xs font-black uppercase tracking-widest mb-0.5 ${text}`}>{title}</p>
                )}
                <p className={`text-xs font-bold leading-relaxed ${text}`}>{error}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
                {onRetry && (
                    <button
                        onClick={onRetry}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border border-current/20 hover:bg-white/50 transition-colors ${sub}`}
                        aria-label="Retry"
                    >
                        <RefreshCw className="w-3 h-3" /> Retry
                    </button>
                )}
                {onDismiss && (
                    <button
                        onClick={onDismiss}
                        className={`p-1 rounded-lg hover:bg-white/50 transition-colors ${sub}`}
                        aria-label="Dismiss"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}
