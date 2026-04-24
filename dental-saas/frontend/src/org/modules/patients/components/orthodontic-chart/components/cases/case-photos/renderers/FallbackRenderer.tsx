/**
 * FallbackRenderer.tsx — visible fallback for unknown / unregistered fileTypes.
 *
 * Rule: the grid must ALWAYS render something. A missing or unsupported
 * fileType is never silently hidden — this renderer paints a visible
 * "Unsupported asset" card so the anomaly is obvious and the download
 * button still works.
 */

import React from "react";
import { FileWarning, Download } from "lucide-react";
import type { PhotoDTO } from "../types";
import type { AssetRenderer } from "./types";

const CardBody: React.FC<{ photo: PhotoDTO }> = ({ photo }) => {
    if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.error("[FallbackRenderer] Unsupported fileType", {
            assetId:  photo.id,
            fileType: photo.fileType,
            mimeType: photo.mimeType,
        });
    }
    return (
        <div className="absolute inset-0 bg-amber-50 border border-amber-200 flex flex-col items-center justify-center px-3 text-center">
            <FileWarning className="w-8 h-8 text-amber-500 mb-2" />
            <p className="text-xs font-bold text-amber-800">Unsupported asset</p>
            <p className="text-[10px] text-amber-600 mt-0.5 truncate max-w-full">
                {photo.fileType ?? "unknown"} · {photo.mimeType ?? "no MIME"}
            </p>
        </div>
    );
};

const DrawerPreview: React.FC<{ photo: PhotoDTO }> = ({ photo }) => (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <FileWarning className="w-12 h-12 text-amber-500 mb-4" />
        <h3 className="text-base font-bold text-slate-900 mb-1">
            Unsupported asset type
        </h3>
        <p className="text-xs text-slate-500 max-w-xs">
            We can't preview <code className="font-mono">{photo.fileType ?? "unknown"}</code> assets
            in the browser. You can still download the original file below.
        </p>
        {photo.signedUrl && (
            <a
                href={photo.signedUrl}
                download={photo.fileName ?? undefined}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
            >
                <Download className="w-3.5 h-3.5" />
                Download
            </a>
        )}
    </div>
);

const FallbackRenderer: AssetRenderer = {
    CardBody,
    DrawerPreview,
    EmptyState: {
        label: "No assets",
        icon:  FileWarning,
    },
};

export default FallbackRenderer;
