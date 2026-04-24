/**
 * DocumentRenderer — PDF / Word / PowerPoint rendering.
 *
 * U-CAP §6 — Documents include PDF (iframe preview), Word (.doc/.docx,
 * download-only), and PowerPoint (.ppt/.pptx, download-only). The card
 * icon + label differentiate by mimeType; the tab-bar grouping stays at
 * `fileType: "pdf"` so the panel only has one renderer to pick.
 */

import React from "react";
import { FileText, FileType, Presentation, Download } from "lucide-react";
import type { AssetRenderer } from "./types";
import { assetName, formatBytes } from "./utils";

type DocKind = "pdf" | "word" | "powerpoint";

/**
 * Classify a document by its mimeType (preferred) or filename extension.
 * Pure function — no side effects, no fileType inference: the caller
 * already resolved fileType === "pdf" upstream; this just picks an icon.
 */
function _docKind(mimeType: string | null | undefined, fileName: string | null | undefined): DocKind {
    const mime = (mimeType ?? "").toLowerCase();
    const name = (fileName ?? "").toLowerCase();
    if (mime.includes("msword") || mime.includes("wordprocessingml") || name.endsWith(".doc") || name.endsWith(".docx")) {
        return "word";
    }
    if (mime.includes("ms-powerpoint") || mime.includes("presentationml") || name.endsWith(".ppt") || name.endsWith(".pptx")) {
        return "powerpoint";
    }
    return "pdf";
}

const KIND_META: Record<DocKind, { label: string; Icon: React.ComponentType<{ className?: string }>; color: string }> = {
    pdf:        { label: "PDF",  Icon: FileText,     color: "text-rose-500"    },
    word:       { label: "DOC",  Icon: FileType,     color: "text-sky-600"     },
    powerpoint: { label: "PPT",  Icon: Presentation, color: "text-orange-500"  },
};

const CardBody: AssetRenderer["CardBody"] = ({ photo }) => {
    const kind = _docKind(photo.mimeType, photo.fileName);
    const meta = KIND_META[kind];
    const Icon = meta.Icon;
    const size = formatBytes(photo.metadata.sizeBytes);
    return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-white gap-1 px-3 relative">
            <Icon className={`w-10 h-10 ${meta.color}`} />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                {meta.label}
            </span>
            <span className="text-[11px] text-slate-700 truncate max-w-full text-center">
                {assetName(photo)}
            </span>
            {size ? (
                <span className="text-[10px] text-slate-400">{size}</span>
            ) : null}
            <span className="absolute bottom-2 left-0 right-0 text-center text-[10px] font-semibold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                {kind === "pdf" ? "Click to preview" : "Download to open"}
            </span>
        </div>
    );
};

const DrawerPreview: AssetRenderer["DrawerPreview"] = ({ photo }) => {
    const kind = _docKind(photo.mimeType, photo.fileName);
    const meta = KIND_META[kind];
    const Icon = meta.Icon;

    if (!photo.signedUrl) {
        return (
            <div className="w-full rounded-xl bg-white border border-slate-200 shadow-sm px-6 py-8 flex flex-col items-center text-center text-slate-600">
                <Icon className={`w-10 h-10 mb-2 ${meta.color}`} />
                <p className="text-sm font-semibold text-slate-800">{meta.label} document</p>
                <p className="text-xs text-slate-500 mt-1">Preview unavailable.</p>
            </div>
        );
    }

    // Word/PPT — no reliable iframe preview. Offer a download prompt
    // instead; browsers will open Office files in the user's native app.
    if (kind !== "pdf") {
        return (
            <div className="w-full rounded-xl bg-white border border-slate-200 shadow-sm px-6 py-8 flex flex-col items-center text-center text-slate-600">
                <Icon className={`w-10 h-10 mb-2 ${meta.color}`} />
                <p className="text-sm font-semibold text-slate-800">{meta.label} document</p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    {kind === "word"
                        ? "Microsoft Word files open in your desktop app."
                        : "PowerPoint decks open in your desktop app."}
                </p>
                <a
                    href={photo.signedUrl}
                    download={photo.fileName ?? undefined}
                    className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                >
                    <Download className="w-3.5 h-3.5" />
                    Download file
                </a>
            </div>
        );
    }

    return (
        <div className="w-full space-y-3">
            <iframe
                src={photo.signedUrl}
                title={photo.fileName ?? "PDF preview"}
                className="w-full h-80 rounded-xl bg-white shadow-sm border border-slate-200"
            />
            <div className="flex justify-end">
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

const DocumentRenderer: AssetRenderer = {
    CardBody,
    DrawerPreview,
    EmptyState: { label: "No documents uploaded", icon: FileText },
};

export default DocumentRenderer;
