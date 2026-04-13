/**
 * SegmentationOverlay.jsx — AI Tooth Segmentation Results Display
 *
 * Shows the AI-returned segmentation data as a structured table
 * with FDI numbers, confidence scores, and tooth-specific findings.
 */
import { useState } from "react";

const FDI_QUADRANTS = {
    "1": { label: "Upper Right", range: [11, 18] },
    "2": { label: "Upper Left",  range: [21, 28] },
    "3": { label: "Lower Left",  range: [31, 38] },
    "4": { label: "Lower Right", range: [41, 48] },
};

const TOOTH_TYPE_COLORS = {
    incisor:  "bg-blue-50 text-blue-700 border-blue-200",
    canine:   "bg-purple-50 text-purple-700 border-purple-200",
    premolar: "bg-amber-50 text-amber-700 border-amber-200",
    molar:    "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function getToothType(fdiNum) {
    const n = fdiNum % 10;
    if (n === 1 || n === 2) return "incisor";
    if (n === 3) return "canine";
    if (n === 4 || n === 5) return "premolar";
    return "molar";
}

export default function SegmentationOverlay({ segmentation }) {
    const [activeQuadrant, setActiveQuadrant] = useState("all");

    if (!segmentation) {
        return (
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-6 text-center">
                <p className="text-sm text-indigo-600 font-medium">No AI segmentation data available</p>
                <p className="text-xs text-indigo-400 mt-1">Upload a scan and trigger AI analysis to see results here</p>
            </div>
        );
    }

    const teeth = segmentation.teeth || [];
    const filtered = activeQuadrant === "all"
        ? teeth
        : teeth.filter((t) => String(t.fdiNumber)[0] === activeQuadrant);

    const confidence = segmentation.confidence || segmentation.overallConfidence;

    return (
        <div className="space-y-4">
            {/* AI summary */}
            <div className="flex items-center gap-4 p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex-wrap">
                <div>
                    <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">AI Analysis</p>
                    <p className="text-sm font-bold text-indigo-800">{teeth.length} teeth detected</p>
                </div>
                {confidence != null && (
                    <div>
                        <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">Confidence</p>
                        <p className="text-sm font-bold text-indigo-800">{Math.round(confidence * 100)}%</p>
                    </div>
                )}
                {segmentation.analysisDate && (
                    <div className="ml-auto">
                        <p className="text-[10px] text-indigo-400">Analyzed</p>
                        <p className="text-xs text-indigo-600">{new Date(segmentation.analysisDate).toLocaleDateString()}</p>
                    </div>
                )}
            </div>

            {/* Quadrant filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
                {[["all", "All Teeth"], ...Object.entries(FDI_QUADRANTS).map(([k, v]) => [k, v.label])].map(([k, label]) => (
                    <button key={k} onClick={() => setActiveQuadrant(k)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                            activeQuadrant === k ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}>
                        {label}
                    </button>
                ))}
            </div>

            {/* Teeth grid */}
            {filtered.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {filtered.sort((a, b) => (a.fdiNumber || 0) - (b.fdiNumber || 0)).map((tooth) => {
                        const type  = tooth.type || getToothType(tooth.fdiNumber);
                        const style = TOOTH_TYPE_COLORS[type] || TOOTH_TYPE_COLORS["molar"];
                        const conf  = tooth.confidence != null ? Math.round(tooth.confidence * 100) : null;

                        return (
                            <div key={tooth.fdiNumber || tooth._id}
                                className={`relative px-3 py-3 rounded-xl border text-center ${style} transition hover:scale-[1.02]`}>
                                <p className="text-base font-black">{tooth.fdiNumber || "—"}</p>
                                <p className="text-[10px] font-semibold capitalize mt-0.5">{type}</p>
                                {conf != null && (
                                    <div className="absolute top-1.5 right-1.5">
                                        <span className="text-[9px] font-bold opacity-70">{conf}%</span>
                                    </div>
                                )}
                                {tooth.missing && (
                                    <span className="absolute top-1 left-1 text-[8px] bg-red-500 text-white rounded px-0.5">MISSING</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="text-sm text-gray-400 text-center py-4">No teeth in this quadrant</p>
            )}

            {/* Bolton + measurements */}
            {segmentation.measurements && (
                <div className="grid grid-cols-2 gap-3">
                    {Object.entries(segmentation.measurements).map(([key, value]) => (
                        <div key={key} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{key.replace(/_/g, " ")}</p>
                            <p className="text-sm font-bold text-gray-800 mt-0.5">{typeof value === "number" ? value.toFixed(2) : String(value)}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
