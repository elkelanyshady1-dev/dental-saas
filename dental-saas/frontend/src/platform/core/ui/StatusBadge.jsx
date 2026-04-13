/**
 * StatusBadge.jsx
 * Platform UI Primitive — Semantic Status Pill
 *
 * Replaces all inline status badge implementations across platform pages.
 * Aligned with CSS custom property tokens.
 *
 * Variants:
 *   success  — emerald (active, operational, verified)
 *   warning  — amber (trial, suspended, degraded)
 *   danger   — red (cancelled, critical, error)
 *   info     — blue (pending, processing)
 *   neutral  — slate (inactive, unknown, archived)
 *
 * Usage:
 *   <StatusBadge variant="success" label="Active" />
 *   <StatusBadge variant="warning" label="Trial" icon={<Clock />} />
 */
import { CheckCircle2, XCircle, AlertTriangle, Clock, Archive } from "lucide-react";

const CONFIG = {
    success: {
        bg: "bg-emerald-50",
        text: "text-emerald-700",
        border: "border-emerald-200",
        dot: "bg-emerald-500",
    },
    warning: {
        bg: "bg-amber-50",
        text: "text-amber-700",
        border: "border-amber-200",
        dot: "bg-amber-500",
    },
    danger: {
        bg: "bg-red-50",
        text: "text-red-700",
        border: "border-red-200",
        dot: "bg-red-500",
    },
    info: {
        bg: "bg-blue-50",
        text: "text-blue-700",
        border: "border-blue-200",
        dot: "bg-blue-500",
    },
    neutral: {
        bg: "bg-slate-100",
        text: "text-slate-600",
        border: "border-slate-200",
        dot: "bg-slate-400",
    },
};

export default function StatusBadge({ variant = "neutral", label, icon, dot = false, className = "" }) {
    const c = CONFIG[variant] || CONFIG.neutral;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide border ${c.bg} ${c.text} ${c.border} ${className}`}>
            {dot && <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />}
            {icon && <span className="w-3 h-3 shrink-0">{icon}</span>}
            {label}
        </span>
    );
}

// Named export alias — allows both `import StatusBadge` (default) and `import { StatusBadge }` (named)
export { StatusBadge };

/**
 * OrgStatusBadge — pre-wired for Organization status + archived state
 * Replaces the bespoke StatusBadge in PlatformOrganizationsPage
 */
export function OrgStatusBadge({ status, isArchived }) {
    if (isArchived) {
        return (
            <StatusBadge
                variant="neutral"
                label="Archived"
                icon={<Archive className="w-3 h-3" />}
            />
        );
    }
    const STATUS_MAP = {
        active: { variant: "success", icon: <CheckCircle2 className="w-3 h-3" /> },
        trial: { variant: "info", icon: <Clock className="w-3 h-3" /> },
        suspended: { variant: "warning", icon: <AlertTriangle className="w-3 h-3" /> },
        cancelled: { variant: "danger", icon: <XCircle className="w-3 h-3" /> },
    };
    const cfg = STATUS_MAP[status?.toLowerCase()] || { variant: "neutral", icon: null };
    return (
        <StatusBadge
            variant={cfg.variant}
            label={status ?? "—"}
            icon={cfg.icon}
        />
    );
}

/**
 * LiveBadge — "LIVE" indicator with animated pulse dot
 */
export function LiveBadge() {
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold uppercase tracking-wide border border-emerald-200">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            Live
        </span>
    );
}
