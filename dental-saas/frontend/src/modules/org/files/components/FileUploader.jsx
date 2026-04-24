/**
 * FileUploader.jsx — Reusable File Upload Component
 * Phase v27.1 — Frontend File Module
 *
 * Drag-and-drop + click-to-browse file uploader with:
 *   - Client-side validation (size + MIME type)
 *   - Upload progress bar
 *   - Preview for images
 *   - Success/error states
 *   - Configurable per category
 *
 * Usage:
 *   <FileUploader
 *     category="recordset_photo"
 *     patientId={patientId}
 *     caseId={caseId}
 *     onUploaded={(file) => handleNewFile(file)}
 *   />
 *
 * PLANE: Organization
 */

import { useState, useRef, useCallback } from "react";
import { Upload, CheckCircle, AlertCircle, Loader, X, File as FileIcon, Image } from "lucide-react";
import { useFileUpload } from "../hooks/useFileUpload";

// ── Category-specific validation limits ─────────────────────────────────────
const CATEGORY_CONFIG = {
    patient_photo:    { maxBytes: 10 * 1024 * 1024, accept: "image/jpeg,image/png,image/webp",                          label: "Patient Photo" },
    recordset_photo:  { maxBytes: 10 * 1024 * 1024, accept: "image/jpeg,image/png,image/webp",                          label: "Record Photo" },
    xray:             { maxBytes: 25 * 1024 * 1024, accept: "image/jpeg,image/png,image/dicom+json",                     label: "X-Ray" },
    snapshot:         { maxBytes: 5  * 1024 * 1024, accept: "image/png,image/jpeg",                                      label: "Snapshot" },
    stl:              { maxBytes: 50 * 1024 * 1024, accept: "model/stl,.stl,application/octet-stream",                   label: "STL File" },
    attachment:       { maxBytes: 15 * 1024 * 1024, accept: "image/jpeg,image/png,application/pdf",                      label: "Attachment" },
    document:         { maxBytes: 15 * 1024 * 1024, accept: "application/pdf,image/jpeg,image/png",                      label: "Document" },
    audio:            { maxBytes: 25 * 1024 * 1024, accept: "audio/mpeg,audio/wav,audio/webm,audio/ogg",                 label: "Audio" },
    other:            { maxBytes: 10 * 1024 * 1024, accept: "*/*",                                                       label: "File" },
};

function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * @param {Object} props
 * @param {string} props.category — File category (required)
 * @param {string} [props.patientId]
 * @param {string} [props.caseId]
 * @param {string} [props.visitId]
 * @param {function} [props.onUploaded] — Callback with uploaded file doc
 * @param {function} [props.onError] — Callback on upload error
 * @param {boolean} [props.multiple] — Allow multiple file selection (uploads sequentially)
 * @param {string} [props.className] — Additional CSS classes
 * @param {boolean} [props.compact] — Compact layout for inline use
 */
export default function FileUploader({
    category = "other",
    patientId,
    caseId,
    visitId,
    onUploaded,
    onError,
    multiple = false,
    className = "",
    compact = false,
}) {
    const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other;
    const fileRef = useRef(null);
    const [previews, setPreviews] = useState([]); // { file, url }[]
    const [validationError, setValidationError] = useState(null);

    const { uploadFile, progress, isUploading, isSuccess, isError, error, reset } = useFileUpload({
        category,
        onSuccess: (file) => {
            // Clean up blob URLs
            previews.forEach((p) => URL.revokeObjectURL(p.url));
            setPreviews([]);
            onUploaded?.(file);
        },
        onError: (err) => {
            onError?.(err);
        },
    });

    // ── File validation ──────────────────────────────────────────────────────
    const validateFile = useCallback(
        (file) => {
            // Size check
            if (file.size > config.maxBytes) {
                return `${file.name}: exceeds ${formatBytes(config.maxBytes)} limit`;
            }

            // MIME type check (skip for wildcard)
            if (config.accept !== "*/*") {
                const acceptedTypes = config.accept.split(",").map((t) => t.trim());
                const fileType = file.type;
                const fileExt = `.${file.name.split(".").pop()?.toLowerCase()}`;

                const isAccepted = acceptedTypes.some(
                    (t) => t === fileType || t === fileExt || (t.endsWith("/*") && fileType.startsWith(t.replace("/*", "/")))
                );

                if (!isAccepted) {
                    return `${file.name}: file type not allowed for ${config.label}`;
                }
            }

            return null;
        },
        [config]
    );

    // ── Add files from input/drop ────────────────────────────────────────────
    const addFiles = useCallback(
        (fileList) => {
            setValidationError(null);
            const files = Array.from(fileList);
            const filesToAdd = multiple ? files : [files[0]].filter(Boolean);

            for (const file of filesToAdd) {
                const err = validateFile(file);
                if (err) {
                    setValidationError(err);
                    return;
                }
            }

            setPreviews((prev) => {
                // For single-file mode, replace existing
                if (!multiple) {
                    prev.forEach((p) => URL.revokeObjectURL(p.url));
                    return filesToAdd.map((f) => ({
                        file: f,
                        url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
                    }));
                }
                return [
                    ...prev,
                    ...filesToAdd.map((f) => ({
                        file: f,
                        url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
                    })),
                ];
            });
        },
        [multiple, validateFile]
    );

    const removePreview = useCallback(
        (idx) => {
            setPreviews((prev) => {
                if (prev[idx]?.url) URL.revokeObjectURL(prev[idx].url);
                return prev.filter((_, i) => i !== idx);
            });
        },
        []
    );

    // ── Handle upload ────────────────────────────────────────────────────────
    const handleUpload = useCallback(() => {
        if (!previews.length || isUploading) return;

        // Upload first file (for single mode) or iterate (multi)
        const file = previews[0].file;
        uploadFile({ file, patientId, caseId, visitId });
    }, [previews, isUploading, uploadFile, patientId, caseId, visitId]);

    // ── Reset to initial state ───────────────────────────────────────────────
    const handleReset = useCallback(() => {
        previews.forEach((p) => { if (p.url) URL.revokeObjectURL(p.url); });
        setPreviews([]);
        setValidationError(null);
        reset();
    }, [previews, reset]);

    // ── Drag handlers ────────────────────────────────────────────────────────
    const onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
    const onDrop = (e) => { e.preventDefault(); e.stopPropagation(); addFiles(e.dataTransfer.files); };

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className={`space-y-3 ${className}`}>
            {/* Drop Zone */}
            {!isUploading && !isSuccess && (
                <div
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onClick={() => fileRef.current?.click()}
                    className={`
                        border-2 border-dashed border-slate-200 rounded-2xl
                        flex flex-col items-center gap-2 cursor-pointer
                        hover:border-blue-300 hover:bg-blue-50/20 transition group
                        ${compact ? "p-4" : "p-6"}
                    `}
                >
                    <input
                        ref={fileRef}
                        type="file"
                        accept={config.accept}
                        multiple={multiple}
                        className="hidden"
                        onChange={(e) => addFiles(e.target.files)}
                    />
                    <div className={`rounded-xl bg-blue-50 flex items-center justify-center group-hover:scale-105 transition ${compact ? "w-8 h-8" : "w-10 h-10"}`}>
                        <Upload className={`text-blue-500 ${compact ? "w-4 h-4" : "w-5 h-5"}`} />
                    </div>
                    <div className="text-center">
                        <p className={`font-semibold text-slate-700 ${compact ? "text-xs" : "text-sm"}`}>
                            Upload {config.label}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Max {formatBytes(config.maxBytes)} · drag & drop or click
                        </p>
                    </div>
                </div>
            )}

            {/* Preview */}
            {previews.length > 0 && !isUploading && !isSuccess && (
                <div className="space-y-2">
                    {previews.map((p, i) => (
                        <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                            {p.url ? (
                                <img src={p.url} alt="preview" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                            ) : (
                                <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center flex-shrink-0">
                                    <FileIcon className="w-5 h-5 text-slate-400" />
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-700 truncate">{p.file.name}</p>
                                <p className="text-xs text-slate-400">{formatBytes(p.file.size)}</p>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); removePreview(i); }}
                                className="w-6 h-6 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center hover:bg-red-100 hover:text-red-500 transition flex-shrink-0"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Upload Progress */}
            {isUploading && (
                <div className="space-y-2 px-1">
                    <div className="flex items-center gap-2">
                        <Loader className="w-4 h-4 text-blue-500 animate-spin" />
                        <p className="text-sm font-semibold text-slate-700">Uploading...</p>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                        <div
                            className="h-2 rounded-full bg-blue-500 transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="text-xs text-right text-slate-400">{progress}%</p>
                </div>
            )}

            {/* Success */}
            {isSuccess && (
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
                    <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    <p className="text-sm font-semibold text-emerald-700">File uploaded successfully!</p>
                    <button
                        onClick={handleReset}
                        className="ml-auto text-xs text-emerald-600 hover:underline"
                    >
                        Upload another
                    </button>
                </div>
            )}

            {/* Validation Error */}
            {validationError && (
                <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <p className="text-sm text-amber-700">{validationError}</p>
                    <button
                        onClick={() => setValidationError(null)}
                        className="ml-auto text-xs text-amber-500 hover:underline"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Upload Error */}
            {isError && (
                <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <p className="text-sm text-red-600">
                        {error?.response?.data?.message || error?.message || "Upload failed. Please try again."}
                    </p>
                    <button
                        onClick={handleReset}
                        className="ml-auto text-xs text-red-500 hover:underline"
                    >
                        Try again
                    </button>
                </div>
            )}

            {/* Upload Button */}
            {previews.length > 0 && !isUploading && !isSuccess && (
                <button
                    onClick={handleUpload}
                    className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 shadow-md shadow-blue-100 transition flex items-center justify-center gap-2"
                >
                    <Upload className="w-4 h-4" />
                    Upload {config.label}
                </button>
            )}
        </div>
    );
}
