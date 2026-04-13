/**
 * AlertTable.jsx
 * Platform Guardian Dashboard — Alert List Table
 *
 * Props:
 *   alerts  [{type, severity, organizationId, organizationName, message}]
 */
import { Link } from "react-router-dom";
import { AlertTriangle, XCircle, ExternalLink } from "lucide-react";

const SEVERITY_CONFIG = {
    critical: {
        label: "Critical",
        bg: "bg-red-500/15",
        text: "text-red-400",
        border: "border-red-500/30",
        icon: XCircle,
        iconColor: "text-red-400"
    },
    warning: {
        label: "Warning",
        bg: "bg-amber-500/10",
        text: "text-amber-400",
        border: "border-amber-500/20",
        icon: AlertTriangle,
        iconColor: "text-amber-400"
    }
};

const TYPE_LABELS = {
    MULTIPLE_ACTIVE_CONTRACTS: "Multiple Active Contracts",
    NULL_LOCKED_PRICE: "Null Locked Price",
    EXPIRED_AUTO_RENEW_STUCK: "Expired Auto-Renew Stuck",
    ORPHAN_DRAFT_CONTRACT: "Orphan Draft Contract"
};

export function AlertTable({ alerts = [] }) {
    if (alerts.length === 0) {
        return (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-6 py-10 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <p className="text-emerald-400 font-semibold text-sm">All systems nominal</p>
                <p className="text-slate-500 text-xs mt-1">No integrity violations detected</p>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-slate-800/80 border-b border-slate-700/50">
                        <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Severity</th>
                        <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Type</th>
                        <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Organization</th>
                        <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Message</th>
                    </tr>
                </thead>
                <tbody>
                    {alerts.map((alert, idx) => {
                        const cfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.warning;
                        const Icon = cfg.icon;

                        return (
                            <tr
                                key={idx}
                                className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors duration-150"
                            >
                                {/* Severity */}
                                <td className="px-4 py-3">
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                                        <Icon className={`w-3 h-3 ${cfg.iconColor}`} />
                                        {cfg.label}
                                    </span>
                                </td>

                                {/* Type */}
                                <td className="px-4 py-3">
                                    <span className="text-slate-300 text-xs font-mono">
                                        {TYPE_LABELS[alert.type] || alert.type}
                                    </span>
                                </td>

                                {/* Organization — clickable link */}
                                <td className="px-4 py-3">
                                    {alert.organizationId ? (
                                        <Link
                                            to={`/platform/organizations?highlight=${alert.organizationId}`}
                                            className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-medium text-xs transition-colors group"
                                        >
                                            <span className="truncate max-w-[140px]">{alert.organizationName || "Unknown Org"}</span>
                                            <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 shrink-0" />
                                        </Link>
                                    ) : (
                                        <span className="text-slate-500 text-xs italic">—</span>
                                    )}
                                </td>

                                {/* Message */}
                                <td className="px-4 py-3 max-w-xs">
                                    <span className="text-slate-400 text-xs leading-relaxed">{alert.message}</span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
