/**
 * ProfileCompletionBanner.jsx — Patient Profile Completion System
 * v1.0
 *
 * Displayed at the top of the patient profile when completion < 80%.
 * Shows:
 *   - Animated progress bar with percentage
 *   - List of missing fields
 *   - "Complete Profile" button → opens wizard in edit mode
 *   - Dismiss capability (session-only)
 *
 * Props:
 *   profileCompletion  { percentage, missingFields, isIncomplete }
 *   patientId          string
 *   version            number  (for optimistic locking on updates)
 *   onUpdate           (data) => Promise<void>  — calls PUT /v1/patient/domain/:id
 *   onDismiss          () => void               — hide banner until refresh
 */
import { useState } from "react";

// Color scale for the progress bar
function getProgressColor(pct) {
    if (pct >= 80) return { bar: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", ring: "ring-emerald-100" };
    if (pct >= 50) return { bar: "bg-amber-400",  text: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200",  ring: "ring-amber-100" };
    return               { bar: "bg-red-400",    text: "text-red-700",    bg: "bg-red-50",    border: "border-red-200",    ring: "ring-red-100" };
}

export default function ProfileCompletionBanner({
    profileCompletion,
    patientId,
    version,
    onUpdate,
    onDismiss,
}) {
    const [expanded, setExpanded] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    if (dismissed) return null;
    if (!profileCompletion) return null;

    const { percentage, missingFields, isIncomplete } = profileCompletion;

    // Don't show if complete
    if (!isIncomplete && percentage >= 80) return null;

    const colors = getProgressColor(percentage);

    return (
        <div className={`mx-0 mb-6 rounded-2xl border ${colors.border} ${colors.bg} overflow-hidden shadow-sm`}>
            {/* Top bar — always visible */}
            <div className="px-5 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        percentage < 50 ? "bg-red-100" : "bg-amber-100"
                    }`}>
                        <svg className={`w-5 h-5 ${colors.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                    </div>

                    {/* Text + Progress */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1.5">
                            <p className={`text-sm font-bold ${colors.text}`}>
                                Patient profile is <span className="underline underline-offset-2">{percentage}% complete</span>
                            </p>
                            {missingFields.length > 0 && (
                                <button
                                    onClick={() => setExpanded(v => !v)}
                                    className={`text-[11px] font-bold ${colors.text} opacity-70 hover:opacity-100 flex items-center gap-1`}
                                >
                                    {expanded ? "Hide details ▲" : `${missingFields.length} missing field${missingFields.length > 1 ? "s" : ""} ▼`}
                                </button>
                            )}
                        </div>
                        {/* Progress bar */}
                        <div className="w-full bg-white/60 rounded-full h-2 border border-white/80">
                            <div
                                className={`h-2 rounded-full transition-all duration-700 ease-out ${colors.bar}`}
                                style={{ width: `${percentage}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={() => setDismissed(true)}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center ${colors.text} opacity-40 hover:opacity-70 hover:bg-white/60 transition-all`}
                        title="Dismiss"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Expanded — missing fields + quick-fill actions */}
            {expanded && missingFields.length > 0 && (
                <div className="px-5 pb-4 border-t border-white/50">
                    <p className="text-xs text-slate-500 font-semibold mt-3 mb-2 uppercase tracking-wider">Missing information:</p>
                    <div className="flex flex-wrap gap-2">
                        {missingFields.map((field) => (
                            <span
                                key={field}
                                className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg border ${colors.border} ${colors.bg} ${colors.text} bg-white/60`}
                            >
                                <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01" />
                                </svg>
                                {field}
                            </span>
                        ))}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-3">
                        Use the inline editors below or the <strong>Complete Profile</strong> button to fill in missing data.
                    </p>
                </div>
            )}
        </div>
    );
}
