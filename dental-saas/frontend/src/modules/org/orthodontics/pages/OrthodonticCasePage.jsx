/**
 * OrthodonticCasePage.jsx — Orthodontic Case Detail View
 *
 * Route: /org/orthodontics/:caseId
 * RBAC: orthodontics.read
 *
 * Layout:
 *   Left panel:  3D Viewer + Scan Uploader + Segmentation Overlay
 *   Right panel: Case header + Stage Timeline + Aligner Progress + Case Notes
 */
import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { useCapability }    from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { useOrthoCase, useOrthoScans, useUpdateOrthoCase, useUpdateAlignerPlan } from "../hooks/useOrthodontics";
import CaseStatusBadge      from "../components/CaseStatusBadge";
import ScanViewer3D         from "../components/ScanViewer3D";
import ScanUploader         from "../components/ScanUploader";
import SegmentationOverlay  from "../components/SegmentationOverlay";
import StageTimeline        from "../components/StageTimeline";
import AlignerProgress      from "../components/AlignerProgress";
import CaseNotes            from "../components/CaseNotes";
import { toast } from "sonner";

const MALOCCLUSION_LABELS = {
    CLASS_I: "Class I", CLASS_II_DIV_1: "Class II Div.1",
    CLASS_II_DIV_2: "Class II Div.2", CLASS_III: "Class III",
};

const TABS = ["Overview", "Scans & AI", "Notes"];

export default function OrthodonticCasePage() {
    const { caseId }   = useParams();
    const navigate     = useNavigate();
    const canUpdate    = useCapability(P.ORTHODONTICS_UPDATE);

    const [tab, setTab] = useState("Overview");

    // ── React Query hooks ──────────────────────────────────────────────
    const { data: orthoCase, isLoading: loadingCase } = useOrthoCase(caseId);
    const { data: scans = [] } = useOrthoScans(caseId);
    const updateCase = useUpdateOrthoCase();
    const updateAligner = useUpdateAlignerPlan();

    const loading = loadingCase;

    const handleAdvanceStage = async () => {
        if (!orthoCase) return;
        const newStage = (orthoCase.currentStage ?? 0) + 1;
        updateCase.mutate(
            { caseId, data: { currentStage: newStage } },
            { onError: (err) => toast.error(err.response?.data?.message || "Failed to advance stage") }
        );
    };

    const handleMarkAlignerComplete = async () => {
        const plan = orthoCase?.alignerPlan;
        if (!plan?._id) return;
        updateAligner.mutate(
            { caseId, planId: plan._id, data: { completedAligners: (plan.completedAligners || 0) + 1 } },
            { onError: (err) => toast.error(err.response?.data?.message || "Failed to update aligner") }
        );
    };


    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            </div>
        );
    }
    if (!orthoCase) return null;

    const patient = orthoCase.patientId;
    const patientName = patient
        ? `${patient.firstName || ""} ${patient.lastName || ""}`.trim() || patient.nameEnglish || "—"
        : "—";

    const latestScan        = scans[0] || null;
    const segmentation      = latestScan?.segmentation || latestScan?.analysisResult || null;
    const stages            = orthoCase.stages || [];
    const notes             = orthoCase.notes || [];

    return (
        <div className="space-y-5 max-w-[1600px] mx-auto">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm">
                <button onClick={() => navigate("/org/orthodontics")}
                    className="flex items-center gap-1 text-gray-400 hover:text-gray-700 transition">
                    <ArrowLeftIcon className="w-3.5 h-3.5" />
                    Orthodontics
                </button>
                <span className="text-gray-300">/</span>
                <span className="text-gray-700 font-semibold">{patientName}</span>
            </div>

            {/* Case header card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start gap-5 flex-wrap">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200 flex-shrink-0">
                        <span className="text-xl">🦷</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-lg font-bold text-gray-800">{patientName}</h1>
                            <CaseStatusBadge status={orthoCase.status} />
                        </div>
                        <div className="flex items-center gap-4 mt-2 flex-wrap text-xs text-gray-500">
                            <span>
                                <span className="font-semibold text-gray-700">Malocclusion:</span>{" "}
                                {MALOCCLUSION_LABELS[orthoCase.malocclusionClass] || orthoCase.malocclusionClass || "—"}
                            </span>
                            {orthoCase.estimatedDurationMonths && (
                                <span>
                                    <span className="font-semibold text-gray-700">Duration:</span>{" "}
                                    {orthoCase.estimatedDurationMonths} months
                                </span>
                            )}
                            {orthoCase.startDate && (
                                <span>
                                    <span className="font-semibold text-gray-700">Started:</span>{" "}
                                    {new Date(orthoCase.startDate).toLocaleDateString()}
                                </span>
                            )}
                            {orthoCase.currentStage != null && (
                                <span className="font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg border border-indigo-100">
                                    Stage {orthoCase.currentStage + 1}
                                </span>
                            )}
                        </div>
                    </div>
                    {patient?._id && (
                        <Link to={`/org/patients/${patient._id}`}
                            className="text-xs text-blue-600 hover:underline font-semibold self-start">
                            View Patient →
                        </Link>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-0.5 w-fit">
                {TABS.map((t) => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`px-5 py-2 rounded-xl text-sm font-semibold transition ${
                            tab === t ? "bg-white shadow text-gray-800" : "text-gray-500"
                        }`}>
                        {t}
                    </button>
                ))}
            </div>

            {/* TAB: Overview */}
            {tab === "Overview" && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                    {/* Left: 3D viewer */}
                    <ScanViewer3D scan={latestScan} segmentation={segmentation} caseId={caseId} />

                    {/* Right: Stage + Aligner */}
                    <div className="space-y-5">
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <StageTimeline
                                stages={stages}
                                currentStage={orthoCase.currentStage ?? 0}
                                onAdvanceStage={handleAdvanceStage}
                                canUpdate={canUpdate}
                            />
                        </div>
                        <AlignerProgress
                            alignerPlan={orthoCase.alignerPlan}
                            onMarkComplete={handleMarkAlignerComplete}
                        />
                    </div>
                </div>
            )}

            {/* TAB: Scans & AI */}
            {tab === "Scans & AI" && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                    <div className="space-y-5">
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <h3 className="text-sm font-bold text-gray-800 mb-4">Upload Scan</h3>
                            <ScanUploader caseId={caseId} />
                        </div>

                        {/* Scan history */}
                        {scans.length > 0 && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                                <h3 className="text-sm font-bold text-gray-800 mb-3">Scan History</h3>
                                <div className="space-y-2">
                                    {scans.map((s, i) => (
                                        <div key={s._id || i} className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
                                            <span className="text-base">📁</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-gray-700 truncate">
                                                    {s.fileName || s.name || `Scan ${i + 1}`}
                                                </p>
                                                <p className="text-xs text-gray-400">
                                                    {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "—"} · {s.scanType || "STL"}
                                                </p>
                                            </div>
                                            <span className={`text-[10px] rounded-xl px-2 py-0.5 font-semibold border ${
                                                s.analysisStatus === "completed"
                                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                    : s.analysisStatus === "processing"
                                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                                    : "bg-gray-50 text-gray-500 border-gray-200"
                                            }`}>
                                                {s.analysisStatus || "pending"}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* AI Segmentation results */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <h3 className="text-sm font-bold text-gray-800 mb-4">AI Segmentation Results</h3>
                        <SegmentationOverlay segmentation={segmentation} />
                    </div>
                </div>
            )}

            {/* TAB: Notes */}
            {tab === "Notes" && (
                <CaseNotes caseId={caseId} notes={notes} />
            )}
        </div>
    );
}
