/**
 * DicomRenderer — card shows metadata + icon; drawer routes to
 * LazyDicomViewer (currently a "coming soon" placeholder with download).
 */

import React from "react";
import { Activity, Loader2 } from "lucide-react";
import type { AssetRenderer } from "./types";
import { assetName, formatBytes } from "./utils";
import LazyDicomViewer from "../LazyDicomViewer";

const CardBody: AssetRenderer["CardBody"] = ({ photo }) => {
    const size = formatBytes(photo.metadata.sizeBytes);

    // U-CAP §4 — if the async worker produced a grayscale PNG preview,
    // render it in the grid. The drawer still opens the full Cornerstone
    // viewer for window/level interaction.
    if (photo.thumbnailSignedUrl) {
        return (
            <div className="w-full h-full relative bg-black">
                <img
                    src={photo.thumbnailSignedUrl}
                    alt={assetName(photo)}
                    className="w-full h-full object-cover"
                    draggable={false}
                />
                <span className="absolute top-2 right-2 text-[10px] font-semibold uppercase tracking-widest text-white/80 bg-black/50 px-1.5 py-0.5 rounded">
                    {photo.dicomMetadata?.modality ?? "DICOM"}
                </span>
            </div>
        );
    }

    // Pending state — worker hasn't parsed the DICOM yet.
    if (photo.processingStatus === "pending") {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900/95 gap-1 px-3 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                <span className="text-[10px] font-semibold uppercase tracking-widest">
                    Parsing DICOM…
                </span>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-white gap-1 px-3 relative">
            <Activity className="w-10 h-10 text-emerald-500" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                DICOM
            </span>
            <span className="text-[11px] text-slate-700 truncate max-w-full text-center">
                {assetName(photo)}
            </span>
            {size ? (
                <span className="text-[10px] text-slate-400">{size}</span>
            ) : null}
            <span className="absolute bottom-2 left-0 right-0 text-center text-[10px] font-semibold text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">
                Click to open
            </span>
        </div>
    );
};

const DrawerPreview: AssetRenderer["DrawerPreview"] = ({ photo }) => (
    <LazyDicomViewer photo={photo} />
);

const DicomRenderer: AssetRenderer = {
    CardBody,
    DrawerPreview,
    EmptyState: { label: "No DICOM scans uploaded", icon: Activity },
};

export default DicomRenderer;
