/**
 * PortalTreatmentsPage.jsx — Patient Portal Treatment Progress
 *
 * Route: /portal/treatments
 * Guard: PortalAuthGuard
 * Plane isolation: no modules/org/* imports
 *
 * Shows:
 *  - Active treatment cards
 *  - Stage progression per treatment
 *  - Aligner progress (if orthodontic)
 *  - Doctor notes
 *  - Link to photo upload (AlignerPhotoUploader)
 */
import { useState, useEffect } from "react";
import { portalApiService } from "../api/portal.api";
import AlignerPhotoUploader from "../components/AlignerPhotoUploader";
import { CheckCircle, Circle, Clock, ChevronDown, ChevronUp } from "lucide-react";

const TREATMENT_STATUS_STYLE = {
    active:     { bg: "bg-blue-50",    text: "text-blue-700",    label: "Active" },
    planning:   { bg: "bg-amber-50",   text: "text-amber-700",   label: "Planning" },
    completed:  { bg: "bg-emerald-50", text: "text-emerald-700", label: "Completed" },
    on_hold:    { bg: "bg-slate-50",   text: "text-slate-500",   label: "On Hold" },
};

function TreatmentCard({ treatment }) {
    const [expanded, setExpanded] = useState(false);
    const st = TREATMENT_STATUS_STYLE[treatment.status] || TREATMENT_STATUS_STYLE["planning"];
    const stages  = treatment.stages || [];
    const current = treatment.currentStage ?? 0;

    return (
        <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="p-6 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-100 flex-shrink-0">
                        <span className="text-white text-lg">🦷</span>
                    </div>
                    <div>
                        <h3 className="font-black text-slate-900 text-lg">
                            {treatment.procedureCode || treatment.type || "Treatment"}
                        </h3>
                        <p className="text-sm text-slate-500">
                            Dr. {treatment.doctorId?.name || treatment.doctorId?.firstName || "—"}
                            {treatment.startDate && ` · Started ${new Date(treatment.startDate).toLocaleDateString()}`}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider ${st.bg} ${st.text}`}>
                        {st.label}
                    </span>
                    <button onClick={() => setExpanded((x) => !x)}
                        className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Stage progress bar */}
            {stages.length > 0 && (
                <div className="px-6 pb-4">
                    <div className="flex items-center gap-1">
                        {stages.map((stage, i) => (
                            <div key={i} className={`flex-1 h-2 rounded-full transition-all ${
                                i < current ? "bg-blue-500" : i === current ? "bg-blue-400" : "bg-slate-100"
                            }`} />
                        ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5">
                        Stage {current + 1} of {stages.length}
                    </p>
                </div>
            )}

            {/* Expanded detail */}
            {expanded && (
                <div className="border-t border-slate-100 p-6 space-y-5">
                    {/* Stage timeline */}
                    {stages.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">Treatment Stages</h4>
                            {stages.map((stage, i) => {
                                const done = i < current;
                                const cur  = i === current;
                                return (
                                    <div key={i} className="flex items-start gap-3">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                            done ? "bg-emerald-100 text-emerald-600"
                                            : cur ? "bg-blue-600 text-white"
                                            : "bg-slate-100 text-slate-300"
                                        }`}>
                                            {done ? <CheckCircle className="w-3.5 h-3.5" />
                                            : cur ? <Clock className="w-3 h-3" />
                                            : <Circle className="w-3 h-3" />}
                                        </div>
                                        <div>
                                            <p className={`text-sm font-bold ${cur ? "text-blue-800" : done ? "text-slate-500" : "text-slate-300"}`}>
                                                {stage.label || `Stage ${i + 1}`}
                                                {cur && <span className="ml-2 text-[9px] uppercase bg-blue-600 text-white px-1.5 py-0.5 rounded-full">Current</span>}
                                            </p>
                                            {stage.notes && <p className="text-xs text-slate-400">{stage.notes}</p>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Aligner progress */}
                    {treatment.alignerPlan && (
                        <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4">
                            <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-3">Aligner Progress</h4>
                            <div className="flex items-center justify-between text-sm mb-2">
                                <span className="font-bold text-slate-700">
                                    Aligner {treatment.alignerPlan.completedAligners || 0} / {treatment.alignerPlan.totalAligners || "—"}
                                </span>
                                <span className="font-black text-blue-700">
                                    {Math.round(((treatment.alignerPlan.completedAligners || 0) / (treatment.alignerPlan.totalAligners || 1)) * 100)}% complete
                                </span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2">
                                <div className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all"
                                    style={{ width: `${Math.round(((treatment.alignerPlan?.completedAligners || 0) / (treatment.alignerPlan?.totalAligners || 1)) * 100)}%` }} />
                            </div>
                        </div>
                    )}

                    {/* Doctor notes */}
                    {treatment.notes && (
                        <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4">
                            <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2">Doctor Notes</h4>
                            <p className="text-sm text-slate-600 leading-relaxed">{treatment.notes}</p>
                        </div>
                    )}

                    {/* Photo upload */}
                    {treatment.requiresPhotoUpload && (
                        <div>
                            <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-3">Progress Photos</h4>
                            <AlignerPhotoUploader treatmentId={treatment._id} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function PortalTreatmentsPage() {
    const [treatments, setTreatments] = useState([]);
    const [loading,    setLoading]    = useState(true);

    useEffect(() => {
        portalApiService.getTreatments()
            .then((res) => setTreatments(res?.treatments || res?.data || res || []))
            .catch(() => setTreatments([]))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="space-y-8 pb-10">
            <section className="space-y-1">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">My Treatments</h2>
                <p className="text-slate-500 font-medium">Track your treatment stages and aligner progress</p>
            </section>

            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
            ) : treatments.length === 0 ? (
                <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm py-20 text-center">
                    <span className="text-4xl mb-4 block">🦷</span>
                    <p className="font-bold text-slate-400">No active treatments found</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {treatments.map((t) => <TreatmentCard key={t._id} treatment={t} />)}
                </div>
            )}
        </div>
    );
}
