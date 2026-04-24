/**
 * LazyDicomViewer.tsx — 2D DICOM viewer for OPA / Lateral Ceph.
 *
 * Scope:
 *   ✅ Single-frame DICOM
 *   ✅ Window/Level (left drag) · Pan (middle drag) · Zoom (wheel / right drag)
 *   ✅ Export as PNG → uploads as a new Photo asset on the SAME case
 *   ❌ Multi-frame / CBCT / stack scrolling (rejected with clear error)
 *
 * Deps (install once):
 *   npm install cornerstone-core cornerstone-tools \
 *               cornerstone-wado-image-loader dicom-parser
 *
 * Modules are loaded via dynamic `import()` inside the effect so the
 * app keeps building even before the deps land. If resolution fails we
 * surface a friendly "viewer not available" state.
 */

import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
    Download, ImageDown, Loader2, AlertTriangle,
} from "lucide-react";
import { useUploadPhoto } from "../../../hooks/usePhotos";
import type { PhotoDTO } from "./types";

/** 20 MB ceiling on any DICOM decoded through this path. */
const MAX_DICOM_BYTES = 20 * 1024 * 1024;

/** Module-level guard so cornerstone-tools is initialised exactly once. */
const moduleInit = { done: false };

type CornerstoneApi = any; // cornerstone-core has weak / version-pinned types

export interface LazyDicomViewerProps {
    photo: PhotoDTO;
}

const LazyDicomViewer: React.FC<LazyDicomViewerProps> = ({ photo }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const cornerstoneRef = useRef<CornerstoneApi | null>(null);

    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [errorMsg, setErrorMsg] = useState("");
    const [exporting, setExporting] = useState(false);

    const upload = useUploadPhoto(photo.caseId);

    // ── File-size pre-flight (advisory; drawer can't block upload earlier) ──
    useEffect(() => {
        if (photo.metadata?.sizeBytes && photo.metadata.sizeBytes > MAX_DICOM_BYTES) {
            setStatus("error");
            setErrorMsg("File exceeds the 20 MB DICOM preview limit.");
        }
    }, [photo.metadata?.sizeBytes]);

    // ── Viewer mount + teardown ──────────────────────────────────────────
    useEffect(() => {
        if (!photo.signedUrl || !containerRef.current) return;
        if (status === "error") return; // pre-flight already failed

        const element = containerRef.current;
        let cancelled = false;
        let activeCornerstone: CornerstoneApi | null = null;

        (async () => {
            try {
                // Dynamic imports keep the heavy bundle (and any "module not
                // found" error before `npm install`) isolated to this path.
                const [
                    cornerstoneMod,
                    cornerstoneToolsMod,
                    loaderMod,
                    parserMod,
                ] = await Promise.all([
                    import(/* @vite-ignore */ "cornerstone-core"),
                    import(/* @vite-ignore */ "cornerstone-tools"),
                    import(/* @vite-ignore */ "cornerstone-wado-image-loader"),
                    import(/* @vite-ignore */ "dicom-parser"),
                ]);

                if (cancelled) return;

                const cornerstone      = (cornerstoneMod as any).default ?? cornerstoneMod;
                const cornerstoneTools = (cornerstoneToolsMod as any).default ?? cornerstoneToolsMod;
                const loader           = (loaderMod as any).default ?? loaderMod;
                const dicomParser      = (parserMod as any).default ?? parserMod;

                if (!moduleInit.done) {
                    loader.external.cornerstone = cornerstone;
                    loader.external.dicomParser = dicomParser;
                    loader.configure({ useWebWorkers: false });
                    cornerstoneTools.external.cornerstone = cornerstone;
                    cornerstoneTools.init();
                    cornerstoneTools.addTool(cornerstoneTools.WwwcTool);
                    cornerstoneTools.addTool(cornerstoneTools.PanTool);
                    cornerstoneTools.addTool(cornerstoneTools.ZoomTool);
                    moduleInit.done = true;
                }

                cornerstone.enable(element);
                activeCornerstone = cornerstone;
                cornerstoneRef.current = cornerstone;

                const imageId = `wadouri:${photo.signedUrl}`;
                const image = await cornerstone.loadAndCacheImage(imageId);
                if (cancelled) return;

                if (image.numberOfFrames && image.numberOfFrames > 1) {
                    setStatus("error");
                    setErrorMsg("This scan is not supported (multi-frame).");
                    return;
                }

                cornerstone.displayImage(element, image);

                // 🚨 PRODUCTION LOCK — per-element tool activation.
                //    `setToolActive` is GLOBAL (affects every enabled
                //    element). `setToolActiveForElement` scopes binding
                //    to THIS viewer so mounting a second DICOM drawer
                //    doesn't hijack the first one's mouse handling.
                cornerstoneTools.setToolActiveForElement(element, "Wwwc", { mouseButtonMask: 1 });
                cornerstoneTools.setToolActiveForElement(element, "Pan",  { mouseButtonMask: 4 });
                cornerstoneTools.setToolActiveForElement(element, "Zoom", { mouseButtonMask: 2 });

                setStatus("ready");
            } catch (err: any) {
                if (cancelled) return;
                const raw = String(err?.message ?? err ?? "");
                const missingDeps = /cannot find module|failed to resolve|fetch.*failed/i.test(raw);
                setStatus("error");
                setErrorMsg(
                    missingDeps
                        ? "DICOM viewer unavailable — run `npm install cornerstone-core cornerstone-tools cornerstone-wado-image-loader dicom-parser`"
                        : raw || "Failed to load DICOM"
                );
            }
        })();

        return () => {
            cancelled = true;
            if (activeCornerstone) {
                try { activeCornerstone.disable(element); } catch { /* noop */ }
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [photo.signedUrl]);

    // ── Export: canvas → PNG → uploadPhoto ───────────────────────────────
    //
    // 🚨 EXPORT HARDENING
    //   - `exporting` state blocks spam clicks while an export is in flight.
    //   - Canvases wider than MAX_EXPORT_WIDTH (2000px) are downscaled via
    //     an offscreen canvas; Cornerstone mirrors the device pixel ratio
    //     and has been seen producing 8k × 6k canvases on HiDPI monitors.
    //   - Anything wider than HARD_EXPORT_LIMIT (4000px) is rejected loudly
    //     instead of silently downscaling — an extra guard against pathologically
    //     large render states that signal a broken viewer state.
    //   - Origin pointer attaches as structured `source`, not free-text tags.
    const MAX_EXPORT_WIDTH   = 2000;
    const HARD_EXPORT_LIMIT  = 4000;

    const handleExport = async () => {
        // Spam-click guard — `exporting` or an in-flight upload blocks re-entry.
        if (exporting || upload.isPending) return;
        if (status !== "ready" || !containerRef.current || !cornerstoneRef.current) return;
        setExporting(true);
        try {
            const enabled = cornerstoneRef.current.getEnabledElement(containerRef.current);
            const sourceCanvas: HTMLCanvasElement | undefined = enabled?.canvas;
            if (!sourceCanvas) throw new Error("Canvas unavailable");

            // Hard guard — a render this big is almost certainly bugged;
            // refuse rather than pretend we can encode it.
            if (sourceCanvas.width > HARD_EXPORT_LIMIT || sourceCanvas.height > HARD_EXPORT_LIMIT) {
                throw new Error(
                    `Canvas too large to export (${sourceCanvas.width}×${sourceCanvas.height}). ` +
                    `Refresh the viewer and try again.`
                );
            }

            // Scale down when the live canvas exceeds MAX_EXPORT_WIDTH.
            // Preserves aspect ratio; never upscales a small canvas.
            const srcW = sourceCanvas.width;
            const srcH = sourceCanvas.height;
            const scale = srcW > MAX_EXPORT_WIDTH ? MAX_EXPORT_WIDTH / srcW : 1;
            const dstW = Math.max(1, Math.round(srcW * scale));
            const dstH = Math.max(1, Math.round(srcH * scale));

            const exportCanvas = document.createElement("canvas");
            exportCanvas.width  = dstW;
            exportCanvas.height = dstH;
            const ctx = exportCanvas.getContext("2d");
            if (!ctx) throw new Error("2D context unavailable");
            ctx.drawImage(sourceCanvas, 0, 0, dstW, dstH);

            const blob = await new Promise<Blob>((resolve, reject) => {
                exportCanvas.toBlob(
                    (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
                    "image/png"
                );
            });

            const baseName = (photo.fileName ?? "dicom-export").replace(/\.(dcm|dicom)$/i, "");
            const file = new File([blob], `${baseName}.png`, { type: "image/png" });

            await upload.mutateAsync({
                file,
                metadata: {
                    type: "intraoral",
                    source: { type: "dicom", originalPhotoId: photo.id },
                },
            });

            toast.success("Exported to Photos");
        } catch (err: any) {
            // Always surface — never swallow a failed export.
            const msg = err?.message ?? "Export failed";
            // eslint-disable-next-line no-console
            console.error("[LazyDicomViewer] export failed", err);
            toast.error(msg);
        } finally {
            setExporting(false);
        }
    };

    // ── Render ───────────────────────────────────────────────────────────
    if (status === "error") {
        return (
            <div className="w-full rounded-xl bg-white border border-slate-200 shadow-sm px-6 py-8 flex flex-col items-center text-center text-slate-600">
                <AlertTriangle className="w-10 h-10 mb-2 text-rose-500" />
                <p className="text-sm font-semibold text-slate-800">{errorMsg}</p>
                {photo.signedUrl && (
                    <a
                        href={photo.signedUrl}
                        download={photo.fileName ?? undefined}
                        className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                    >
                        <Download className="w-3.5 h-3.5" />
                        Download file
                    </a>
                )}
            </div>
        );
    }

    return (
        <div className="w-full space-y-3">
            <div className="relative w-full h-[500px] rounded-xl bg-black overflow-hidden">
                <div ref={containerRef} className="w-full h-full" />
                {status === "loading" && (
                    <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        Loading DICOM…
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500">
                <span>LMB: Window/Level · MMB: Pan · RMB: Zoom</span>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleExport}
                        disabled={status !== "ready" || exporting || upload.isPending}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
                    >
                        {exporting || upload.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <ImageDown className="w-3.5 h-3.5" />
                        )}
                        Export as Image
                    </button>
                    {photo.signedUrl && (
                        <a
                            href={photo.signedUrl}
                            download={photo.fileName ?? undefined}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 transition-colors"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Download
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LazyDicomViewer;
