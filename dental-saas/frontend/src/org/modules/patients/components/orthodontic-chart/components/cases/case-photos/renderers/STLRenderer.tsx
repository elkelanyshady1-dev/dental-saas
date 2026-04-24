/**
 * STLRenderer — auto-rotating card preview (LazyMount-wrapped) +
 * interactive drawer viewer with OrbitControls.
 *
 * Perf:
 *   - Preview only mounts when the card is in view AND a slot is free
 *     (see LazyMount's MAX_ACTIVE_CANVAS cap).
 *   - Offscreen / capped cards render a static placeholder instead.
 */

import React, { Suspense } from "react";
import { Box, Download, Loader2 } from "lucide-react";
import type { AssetRenderer } from "./types";
import { assetName } from "./utils";
import LazyMount from "../LazyMount";

// Lazy modules — the three.js bundle is only fetched when a 3D asset
// actually needs to render.
const LazySTLPreview = React.lazy(() => import("../STLPreview"));
const LazySTLViewer  = React.lazy(() => import("../STLViewer"));

const StaticPlaceholder: React.FC<{ label?: string }> = ({ label = "STL" }) => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 gap-1 text-slate-400">
        <Box className="w-8 h-8" />
        <span className="text-[10px] font-semibold uppercase tracking-widest">
            {label}
        </span>
    </div>
);

const CardBody: AssetRenderer["CardBody"] = ({ photo }) => {
    if (!photo.signedUrl) {
        return <StaticPlaceholder />;
    }
    return (
        <div className="w-full h-full relative bg-slate-50">
            <LazyMount placeholder={<StaticPlaceholder />}>
                <Suspense
                    fallback={
                        <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                            Loading 3D…
                        </div>
                    }
                >
                    <LazySTLPreview url={photo.signedUrl} />
                </Suspense>
            </LazyMount>
            <span className="absolute bottom-1 left-1 text-[10px] font-semibold bg-black/60 text-white px-1.5 py-0.5 rounded">
                3D
            </span>
            <span className="absolute inset-x-0 bottom-1 text-center text-[10px] font-semibold text-white bg-slate-900/0 group-hover:bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-all py-1 pointer-events-none">
                Open Viewer
            </span>
        </div>
    );
};

const DrawerPreview: AssetRenderer["DrawerPreview"] = ({ photo }) => {
    if (!photo.signedUrl) {
        return (
            <div className="w-full px-6 py-8 rounded-xl bg-white border border-slate-200 shadow-sm text-center text-slate-500 text-sm">
                3D model unavailable
            </div>
        );
    }
    return (
        <div className="w-full">
            <Suspense
                fallback={
                    <div className="w-full h-80 rounded-xl bg-slate-900/95 border border-slate-200 flex items-center justify-center text-slate-300 text-sm">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        Loading 3D viewer…
                    </div>
                }
            >
                <LazySTLViewer url={photo.signedUrl} fileName={photo.fileName ?? undefined} />
            </Suspense>
            <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-slate-500">Rotate · Zoom · Pan · {assetName(photo)}</p>
                <a
                    href={photo.signedUrl}
                    download={photo.fileName ?? undefined}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 transition-colors"
                >
                    <Download className="w-3.5 h-3.5" />
                    Download
                </a>
            </div>
        </div>
    );
};

const STLRenderer: AssetRenderer = {
    CardBody,
    DrawerPreview,
    EmptyState: { label: "No 3D models uploaded", icon: Box },
};

export default STLRenderer;
