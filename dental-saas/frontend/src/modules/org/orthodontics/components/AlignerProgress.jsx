/**
 * AlignerProgress.jsx — Aligner Treatment Progress Panel
 *
 * Displays total, completed, and remaining aligners.
 * Visual ring progress indicator + detailed breakdown.
 */
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";

export default function AlignerProgress({ alignerPlan, onMarkComplete }) {
    const canUpdate = useCapability(P.ORTHODONTICS_UPDATE);

    if (!alignerPlan) {
        return (
            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5 text-center">
                <p className="text-sm text-gray-400 font-medium">No aligner plan created</p>
                <p className="text-xs text-gray-300 mt-0.5">Add an aligner plan to track wear progress</p>
            </div>
        );
    }

    const total     = alignerPlan.totalAligners     || 0;
    const completed = alignerPlan.completedAligners  || 0;
    const current   = alignerPlan.currentAligner     || (completed + 1);
    const remaining = Math.max(0, total - completed);
    const pct       = total > 0 ? Math.round((completed / total) * 100) : 0;

    // SVG ring progress
    const R  = 52;
    const C  = Math.PI * 2 * R;
    const offset = C - (pct / 100) * C;

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-800">Aligner Progress</h4>
                {alignerPlan.weeksPerAligner && (
                    <span className="text-xs text-gray-400">{alignerPlan.weeksPerAligner}w per aligner</span>
                )}
            </div>

            {/* Ring progress */}
            <div className="flex items-center gap-6">
                <div className="relative flex-shrink-0">
                    <svg width="128" height="128" className="-rotate-90">
                        {/* Track */}
                        <circle cx="64" cy="64" r={R} fill="none" stroke="#e5e7eb" strokeWidth="10" />
                        {/* Progress */}
                        <circle cx="64" cy="64" r={R} fill="none"
                            stroke="url(#alignerGrad)" strokeWidth="10"
                            strokeLinecap="round"
                            strokeDasharray={C}
                            strokeDashoffset={offset}
                            className="transition-all duration-700"
                        />
                        <defs>
                            <linearGradient id="alignerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#6366f1" />
                                <stop offset="100%" stopColor="#8b5cf6" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-black text-indigo-700">{pct}%</span>
                        <span className="text-[10px] text-gray-400 font-medium">Done</span>
                    </div>
                </div>

                {/* Stats */}
                <div className="space-y-3 flex-1">
                    <StatRow label="Total Aligners"    value={total}     color="text-gray-800" />
                    <StatRow label="Completed"         value={completed} color="text-emerald-600" />
                    <StatRow label="Current Aligner"   value={current}   color="text-indigo-600" />
                    <StatRow label="Remaining"         value={remaining} color="text-red-500" />
                </div>
            </div>

            {/* Progress bar */}
            <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                    <span>Aligner 1</span>
                    <span>Aligner {total}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                    <div className="h-2.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700"
                        style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                    <span>{completed} completed</span>
                    <span>{remaining} remaining</span>
                </div>
            </div>

            {/* Mark current complete */}
            {canUpdate && remaining > 0 && (
                <button onClick={onMarkComplete}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition">
                    ✓ Mark Aligner {current} Complete
                </button>
            )}

            {/* Duration estimate */}
            {alignerPlan.weeksPerAligner && remaining > 0 && (
                <p className="text-xs text-gray-400 text-center">
                    Est. remaining time: <span className="font-semibold text-gray-600">
                        {Math.ceil((remaining * alignerPlan.weeksPerAligner) / 4)} months
                    </span>
                </p>
            )}
        </div>
    );
}

function StatRow({ label, value, color }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{label}</span>
            <span className={`text-sm font-bold ${color}`}>{value}</span>
        </div>
    );
}
