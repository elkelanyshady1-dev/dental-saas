/**
 * TreatmentsTab.jsx — Patient Profile Treatments Tab (Enhanced)
 *
 * Embeds TreatmentTimeline + XrayViewer for a full clinical view
 * within the patient profile layout.
 */
import { useOutletContext, useParams } from "react-router-dom";
import TreatmentTimeline from "@/modules/org/clinical/components/TreatmentTimeline";
import XrayViewer from "@/modules/org/clinical/components/XrayViewer";

export default function TreatmentsTab() {
    const { id } = useParams();
    const { aggregate } = useOutletContext();

    if (!aggregate) return null;

    const patientId = aggregate._id || id;

    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Treatment Timeline (2/3 width) */}
            <div className="xl:col-span-2">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <TreatmentTimeline patientId={patientId} />
                </div>
            </div>

            {/* X-ray / Imaging Panel (1/3 width) */}
            <div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h4 className="text-sm font-bold text-gray-800 mb-4">Imaging & Documents</h4>
                    <XrayViewer patientId={patientId} />
                </div>
            </div>
        </div>
    );
}
