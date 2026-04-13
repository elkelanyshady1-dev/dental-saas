/**
 * TreatmentTimeline.jsx — Patient Treatment Chronological History
 *
 * Displays all treatments in reverse-chronological order as a vertical timeline.
 */
import { useState, useEffect, useCallback } from "react";
import { CheckCircle, Clock, XCircle, Circle, Plus } from "lucide-react";
import { treatmentsApi } from "../api/treatments.api";
import TreatmentStatusBadge, { TREATMENT_STATUS } from "./TreatmentStatusBadge";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import CreateTreatmentDrawer from "./CreateTreatmentDrawer";

const STATUS_ICONS = {
    completed: CheckCircle,
    in_progress: Clock,
    cancelled: XCircle,
    planned: Circle,
    pending: Circle,
};

export default function TreatmentTimeline({ patientId }) {
    const canCreate = useCapability(P.TREATMENTS_CREATE);
    const [treatments, setTreatments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);

    const fetch = useCallback(async () => {
        if (!patientId) return;
        setLoading(true);
        try {
            const res = await treatmentsApi.list({ patientId });
            const data = res.data;
            setTreatments(data.data || data.treatments || data || []);
        } catch (err) {
            console.error("Failed to load treatment timeline:", err);
        } finally {
            setLoading(false);
        }
    }, [patientId]);

    useEffect(() => { fetch(); }, [fetch]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-700">Treatment History</h4>
                {canCreate && (
                    <button
                        onClick={() => setShowCreate(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add Treatment
                    </button>
                )}
            </div>

            {treatments.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No treatment records for this patient.</p>
            ) : (
                <div className="relative">
                    {/* Vertical line */}
                    <div className="absolute left-4 top-0 bottom-4 w-px bg-gray-200" />

                    <div className="space-y-4">
                        {[...treatments].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)).map((tx) => {
                            const s = TREATMENT_STATUS[tx.status] || TREATMENT_STATUS["pending"];
                            const Icon = STATUS_ICONS[tx.status] || Circle;
                            const date = tx.date || tx.createdAt;

                            return (
                                <div key={tx._id} className="flex gap-4 pl-1">
                                    {/* Icon */}
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${s.bg} ${s.text} border ${s.border} z-10`}>
                                        <Icon className="w-3.5 h-3.5" />
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:border-gray-200 transition">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-gray-800 truncate">
                                                    {tx.procedureName || tx.procedure || tx.description || "Treatment"}
                                                    {tx.toothNumber && (
                                                        <span className="ml-2 font-mono text-xs text-gray-400">#{tx.toothNumber}</span>
                                                    )}
                                                </p>
                                                {tx.doctorId?.name && (
                                                    <p className="text-xs text-gray-500 mt-0.5">Dr. {tx.doctorId.name}</p>
                                                )}
                                            </div>
                                            <TreatmentStatusBadge status={tx.status} size="xs" />
                                        </div>

                                        {tx.notes && (
                                            <p className="text-xs text-gray-500 mt-2 italic leading-relaxed">{tx.notes}</p>
                                        )}

                                        <div className="flex items-center justify-between mt-3">
                                            {date && (
                                                <span className="text-[10px] text-gray-400">
                                                    {new Date(date).toLocaleDateString("en-US", {
                                                        day: "numeric", month: "short", year: "numeric",
                                                    })}
                                                </span>
                                            )}
                                            {tx.cost && (
                                                <span className="text-xs font-semibold text-gray-700">
                                                    {tx.cost} {tx.currency || ""}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {showCreate && (
                <CreateTreatmentDrawer
                    patientId={patientId}
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); fetch(); }}
                />
            )}
        </div>
    );
}
