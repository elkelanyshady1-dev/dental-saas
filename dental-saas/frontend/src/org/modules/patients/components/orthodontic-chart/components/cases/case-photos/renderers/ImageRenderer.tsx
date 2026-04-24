/**
 * ImageRenderer — renders <img> from signedUrl for both card and drawer.
 */

import React from "react";
import { Images, ImageOff, Loader2 } from "lucide-react";
import type { AssetRenderer } from "./types";
import { assetName } from "./utils";

const CardBody: AssetRenderer["CardBody"] = ({ photo }) => {
    // U-CAP §2 — prefer the 512-px thumbnail in the grid when the worker
    // has produced one. Falls through to the full signed URL if the job
    // is still pending / failed / skipped — the card stays rendered.
    const src = photo.thumbnailSignedUrl ?? photo.signedUrl;

    // Pending state — worker hasn't finished yet. Show a skeleton instead
    // of the full-resolution URL so a slow R2 doesn't stall the grid.
    if (!src && photo.processingStatus === "pending") {
        return (
            <div className="w-full h-full flex items-center justify-center bg-slate-100 animate-pulse text-slate-300">
                <Loader2 className="w-6 h-6 animate-spin" />
            </div>
        );
    }

    if (!src) {
        return (
            <div className="w-full h-full flex items-center justify-center text-slate-400 bg-slate-50">
                <ImageOff className="w-8 h-8" />
            </div>
        );
    }
    return (
        <img
            src={src}
            alt={assetName(photo)}
            className="w-full h-full object-cover"
            draggable={false}
            onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
        />
    );
};

const DrawerPreview: AssetRenderer["DrawerPreview"] = ({ photo }) => {
    if (!photo.signedUrl) {
        return (
            <div className="h-40 w-full rounded-xl bg-white flex items-center justify-center text-slate-400 text-sm">
                Preview unavailable
            </div>
        );
    }
    return (
        <img
            src={photo.signedUrl}
            alt={assetName(photo)}
            className="max-h-80 w-auto rounded-xl object-contain shadow-sm"
        />
    );
};

const ImageRenderer: AssetRenderer = {
    CardBody,
    DrawerPreview,
    EmptyState: { label: "No photos yet", icon: Images },
};

export default ImageRenderer;
