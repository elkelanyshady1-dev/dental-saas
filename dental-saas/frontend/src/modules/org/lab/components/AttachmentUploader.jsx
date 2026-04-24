/**
 * AttachmentUploader — file upload with progress bar + retry + size guard.
 *
 * Invokes `onUpload(file, { onProgress })`. Any error surfaces with a retry
 * button that resends the last picked file.
 */

import { useCallback, useRef, useState } from "react";
import {
    PaperClipIcon,
    ExclamationCircleIcon,
    ArrowPathIcon,
    CheckCircleIcon,
} from "@heroicons/react/24/outline";

const DEFAULT_ACCEPT =
    ".pdf,.jpg,.jpeg,.png,.webp,.stl,.ply,.obj,.doc,.docx,.xls,.xlsx,.txt,.zip";
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export default function AttachmentUploader({
    onUpload,
    accept = DEFAULT_ACCEPT,
    maxBytes = MAX_BYTES,
    disabled = false,
    label = "Attach file",
}) {
    const inputRef = useRef(null);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState(null);
    const [completedName, setCompletedName] = useState(null);
    const [lastFile, setLastFile] = useState(null);

    const doUpload = useCallback(async (file) => {
        if (!file) return;
        if (file.size > maxBytes) {
            setError(`File too large — max ${(maxBytes / 1024 / 1024).toFixed(0)} MB`);
            return;
        }

        setLastFile(file);
        setError(null);
        setProgress(0);
        setCompletedName(null);
        setUploading(true);

        try {
            await onUpload(file, {
                onProgress: (e) => {
                    if (!e || !e.total) return;
                    setProgress(Math.round((e.loaded * 100) / e.total));
                },
            });
            setProgress(100);
            setCompletedName(file.name);
        } catch (err) {
            setError(err?.response?.data?.error?.message || err?.message || "Upload failed");
        } finally {
            setUploading(false);
        }
    }, [maxBytes, onUpload]);

    const handleChange = (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        doUpload(file);
    };

    const handleRetry = () => {
        if (lastFile) doUpload(lastFile);
    };

    return (
        <div className="inline-flex flex-col items-start w-full max-w-xs">
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                onChange={handleChange}
                className="hidden"
                disabled={disabled || uploading}
            />

            {/* Trigger row */}
            <div className="flex items-center gap-2 w-full">
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={disabled || uploading}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-brand-clinical transition-colors disabled:opacity-50"
                    title={label}
                >
                    <PaperClipIcon className="w-4 h-4" />
                    {uploading ? "Uploading…" : label}
                </button>

                {error && (
                    <button
                        type="button"
                        onClick={handleRetry}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-danger hover:text-danger/80"
                        title="Retry upload"
                    >
                        <ArrowPathIcon className="w-3.5 h-3.5" />
                        Retry
                    </button>
                )}
            </div>

            {/* Progress bar */}
            {uploading && (
                <div className="mt-1.5 w-full">
                    <div className="h-1 bg-surface-low rounded-full overflow-hidden">
                        <div
                            className="h-full bg-brand-clinical transition-[width] duration-150"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="mt-0.5 text-[10px] text-text-muted">{progress}%</p>
                </div>
            )}

            {/* Inline status */}
            {!uploading && error && (
                <p className="mt-1 text-[11px] text-danger flex items-center gap-1">
                    <ExclamationCircleIcon className="w-3 h-3" />
                    {error}
                </p>
            )}
            {!uploading && !error && completedName && (
                <p className="mt-1 text-[11px] text-success flex items-center gap-1">
                    <CheckCircleIcon className="w-3 h-3" />
                    Uploaded {completedName}
                </p>
            )}
        </div>
    );
}
