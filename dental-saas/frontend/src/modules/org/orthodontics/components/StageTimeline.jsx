/**
 * StageTimeline.jsx — Orthodontic Treatment Stage Progression
 *
 * Shows each treatment stage sequentially, highlighting current.
 * Supports custom stage names and completion status.
 */
import { CheckCircle, Circle, Clock } from "lucide-react";

export default function StageTimeline({ stages = [], currentStage = 0, onAdvanceStage, canUpdate }) {
    // If no stages defined, show planned stages from currentStage
    const items = stages.length > 0 ? stages : Array.from({ length: Math.max(currentStage + 3, 6) }, (_, i) => ({
        stage: i + 1,
        label: `Stage ${i + 1}`,
        status: i < currentStage ? "completed" : i === currentStage ? "current" : "upcoming",
    }));

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-gray-800">Treatment Stages</h4>
                {canUpdate && currentStage < items.length - 1 && (
                    <button onClick={onAdvanceStage}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 transition">
                        Advance Stage →
                    </button>
                )}
            </div>

            <div className="relative">
                {/* Vertical connecting line */}
                <div className="absolute left-4 top-4 bottom-4 w-px bg-gradient-to-b from-indigo-300 via-gray-200 to-gray-100" />

                <div className="space-y-2">
                    {items.map((item) => {
                        const isDone    = item.status === "completed" || item.stage < currentStage + 1;
                        const isCurrent = item.status === "current" || item.stage === currentStage + 1;
                        const isUpcoming = !isDone && !isCurrent;

                        return (
                            <div key={item.stage || item._id}
                                className={`flex items-start gap-4 pl-1 transition ${isCurrent ? "scale-[1.01]" : ""}`}>
                                {/* Status icon */}
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 z-10 transition
                                    ${isDone    ? "bg-emerald-100 text-emerald-600"
                                    : isCurrent ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                                    : "bg-gray-100 text-gray-300"}`}>
                                    {isDone ? <CheckCircle className="w-4 h-4" />
                                    : isCurrent ? <Clock className="w-3.5 h-3.5" />
                                    : <Circle className="w-3.5 h-3.5" />}
                                </div>

                                {/* Content */}
                                <div className={`flex-1 rounded-xl px-4 py-3 border transition
                                    ${isDone    ? "bg-gray-50 border-gray-100"
                                    : isCurrent ? "bg-indigo-50 border-indigo-200 shadow-sm"
                                    : "bg-white border-gray-100 opacity-60"}`}>
                                    <div className="flex items-center gap-2">
                                        <p className={`text-sm font-semibold ${isCurrent ? "text-indigo-800" : isDone ? "text-gray-600" : "text-gray-400"}`}>
                                            {item.label || `Stage ${item.stage}`}
                                        </p>
                                        {isCurrent && (
                                            <span className="text-[9px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">
                                                Current
                                            </span>
                                        )}
                                        {isDone && (
                                            <span className="text-[9px] text-emerald-600 font-bold ml-auto">✓ Done</span>
                                        )}
                                    </div>
                                    {item.notes && (
                                        <p className="text-xs text-gray-500 mt-1">{item.notes}</p>
                                    )}
                                    {item.completedAt && (
                                        <p className="text-[10px] text-gray-400 mt-1">
                                            {new Date(item.completedAt).toLocaleDateString()}
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
