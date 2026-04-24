/**
 * FilePreview.jsx — File Preview / Signed URL Resolver Component
 * Phase v27.1 — Frontend File Module
 *
 * Resolves a file's signed URL via useFileUrl and renders:
 *   - Images: <img> with lazy loading
 *   - Other: download link with file icon
 *
 * Backward compatible: accepts either fileId (new) OR legacy url (old).
 * If both provided, fileId takes priority.
 *
 * Usage:
 *   <FilePreview fileId={record.photoFileId} />
 *   <FilePreview url={record.url} />                    ← legacy fallback
 *   <FilePreview fileId={record.photoFileId} url={record.url} />  ← hybrid
 *
 * PLANE: Organization
 */

import { useState } from "react";
import { Image as ImageIcon, FileText, Download, Loader, AlertCircle } from "lucide-react";
import { useFileUrl } from "../hooks/useFileUrl";

const IMAGE_MIME_PREFIXES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg"];

/**
 * @param {Object} props
 * @param {string} [props.fileId] — File document _id (new path — resolves signed URL)
 * @param {string} [props.url] — Legacy direct URL (fallback)
 * @param {string} [props.fileName] — Display name
 * @param {string} [props.mimeType] — MIME type for rendering decision
 * @param {string} [props.alt] — Alt text for images
 * @param {string} [props.className] — Container CSS classes
 * @param {string} [props.imgClassName] — <img> CSS classes
 * @param {function} [props.onClick] — Click handler (e.g., open fullscreen)
 * @param {"cover"|"contain"|"fill"} [props.objectFit] — Image object-fit
 * @param {boolean} [props.showDownload] — Show download button
 */
export default function FilePreview({
    fileId,
    url: legacyUrl,
    fileName,
    mimeType,
    alt,
    className = "",
    imgClassName = "",
    onClick,
    objectFit = "cover",
    showDownload = false,
}) {
    const [imgError, setImgError] = useState(false);

    // ── Resolve URL: fileId → signed URL, or fallback to legacy URL ──────
    const { url: signedUrl, isLoading, isError } = useFileUrl(fileId);
    const resolvedUrl = signedUrl || legacyUrl || null;

    // ── Determine if content is an image ─────────────────────────────────
    const isImage =
        mimeType
            ? IMAGE_MIME_PREFIXES.some((p) => mimeType.startsWith(p.split("/")[0]))
            : resolvedUrl
                ? /\.(jpe?g|png|webp|gif|svg)(\?|$)/i.test(resolvedUrl)
                : false;

    // ── Loading state ────────────────────────────────────────────────────
    if (fileId && isLoading) {
        return (
            <div className={`flex items-center justify-center bg-slate-50 rounded-xl ${className}`}>
                <Loader className="w-5 h-5 text-slate-300 animate-spin" />
            </div>
        );
    }

    // ── Error state ──────────────────────────────────────────────────────
    if (fileId && isError && !legacyUrl) {
        return (
            <div className={`flex items-center justify-center bg-red-50 rounded-xl ${className}`}>
                <AlertCircle className="w-5 h-5 text-red-300" />
            </div>
        );
    }

    // ── No URL available ─────────────────────────────────────────────────
    if (!resolvedUrl) {
        return (
            <div className={`flex items-center justify-center bg-slate-100 rounded-xl ${className}`}>
                <ImageIcon className="w-5 h-5 text-slate-300" />
            </div>
        );
    }

    // ── Image preview ────────────────────────────────────────────────────
    if (isImage && !imgError) {
        return (
            <div className={`relative group ${className}`}>
                <img
                    src={resolvedUrl}
                    alt={alt || fileName || "File preview"}
                    loading="lazy"
                    onError={() => setImgError(true)}
                    onClick={onClick}
                    className={`
                        w-full h-full rounded-xl
                        ${objectFit === "cover" ? "object-cover" : objectFit === "contain" ? "object-contain" : "object-fill"}
                        ${onClick ? "cursor-pointer" : ""}
                        ${imgClassName}
                    `}
                />
                {showDownload && (
                    <a
                        href={resolvedUrl}
                        download={fileName}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="absolute bottom-2 right-2 w-7 h-7 rounded-lg bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                    >
                        <Download className="w-3.5 h-3.5" />
                    </a>
                )}
            </div>
        );
    }

    // ── Non-image file preview ───────────────────────────────────────────
    return (
        <div className={`flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100 ${className}`}>
            <div className="w-9 h-9 rounded-lg bg-slate-200 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">
                    {fileName || "File"}
                </p>
                {mimeType && (
                    <p className="text-xs text-slate-400">{mimeType}</p>
                )}
            </div>
            <a
                href={resolvedUrl}
                download={fileName}
                target="_blank"
                rel="noopener noreferrer"
                className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center hover:bg-blue-100 transition flex-shrink-0"
            >
                <Download className="w-3.5 h-3.5" />
            </a>
        </div>
    );
}
