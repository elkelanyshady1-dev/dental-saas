import React from "react";
import { Loader2, Lock, Unlock } from "lucide-react";
import { StateBadge, ProgressBar, StateStepper } from "./MigrationBadges";

function LiveRow({ item }) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-1 shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-50">
                        <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-800 truncate">
                            {item.name || item.orgId}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500 font-mono truncate">
                            {item.cluster}
                            {item.targetCluster ? (
                                <>
                                    <span className="text-gray-300"> → </span>
                                    <span className="text-indigo-700">{item.targetCluster}</span>
                                </>
                            ) : null}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {item.writeLocked ? (
                        <span className="inline-flex items-center gap-1 text-xs text-rose-600 font-medium">
                            <Lock className="w-3.5 h-3.5" />
                            LOCKED
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                            <Unlock className="w-3.5 h-3.5" />
                            open
                        </span>
                    )}
                    <StateBadge state={item.state} />
                </div>
            </div>

            <div className="mt-4 space-y-2">
                <ProgressBar value={item.progress} />
                <StateStepper current={item.state} />
            </div>
        </div>
    );
}

export function MigrationLiveStatus({ active }) {
    if (!active || active.length === 0) return null;

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                Live migration status
                <span className="text-xs text-gray-400">
                    ({active.length} in progress)
                </span>
            </div>
            <div className="grid grid-cols-1 gap-3">
                {active.map((item) => (
                    <LiveRow key={item.orgId} item={item} />
                ))}
            </div>
        </div>
    );
}

export default MigrationLiveStatus;
