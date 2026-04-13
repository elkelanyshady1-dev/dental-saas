/**
 * AlignerPhotoUploader.jsx — Patient Progress Photo Upload
 *
 * Allows patient to upload aligner progress photos.
 * Endpoint: POST /portal/photos (multipart/form-data)
 * Used inside PortalTreatmentsPage.
 *
 * Plane isolation: no modules/org/* imports.
 */
import { useState, useRef, useCallback } from "react";
import { portalApiService } from "../api/portal.api";
import { Camera, Upload, CheckCircle, AlertCircle, Loader, X } from "lucide-react";

const ACCEPTED = "image/jpeg,image/png,image/webp,image/heic";
const MAX_SIZE  = 10 * 1024 * 1024; // 10 MB

export default function AlignerPhotoUploader({ treatmentId, onUploaded }) {
    const [previews,  setPreviews]  = useState([]); // { file, url }[]
    const [progress,  setProgress]  = useState(0);
    const [state,     setState]     = useState("idle"); // idle | uploading | done | error
    const [error,     setError]     = useState(null);
    const fileRef = useRef(null);

    const addFiles = (files) => {
        const valid = Array.from(files).filter((f) => {
            if (!f.type.startsWith("image/")) { setError(`${f.name}: not an image`); return false; }
            if (f.size > MAX_SIZE) { setError(`${f.name}: exceeds 10 MB limit`); return false; }
            return true;
        });
        if (!valid.length) return;
        setError(null);
        setPreviews((prev) => [
            ...prev,
            ...valid.map((f) => ({ file: f, url: URL.createObjectURL(f) })),
        ]);
    };

    const removePreview = (idx) => {
        URL.revokeObjectURL(previews[idx].url);
        setPreviews((p) => p.filter((_, i) => i !== idx));
    };

    const handleUpload = useCallback(async () => {
        if (!previews.length) return;
        setState("uploading"); setProgress(0); setError(null);
        try {
            for (let i = 0; i < previews.length; i++) {
                const fd = new FormData();
                fd.append("photo", previews[i].file);
                if (treatmentId) fd.append("treatmentId", treatmentId);
                fd.append("photoType", "progress");
                await portalApiService.uploadPhoto(fd, (e) => {
                    if (e.total) {
                        const overall = ((i / previews.length) + (e.loaded / e.total / previews.length)) * 100;
                        setProgress(Math.round(overall));
                    }
                });
            }
            setProgress(100);
            setState("done");
            previews.forEach((p) => URL.revokeObjectURL(p.url));
            setPreviews([]);
            onUploaded?.();
        } catch (err) {
            setState("error");
            setError(err?.message || err?.error || "Upload failed. Please try again.");
        }
    }, [previews, treatmentId, onUploaded]);

    return (
        <div className="space-y-4">
            {/* Drop zone */}
            {state !== "uploading" && (
                <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                    onClick={() => fileRef.current?.click()}
                    className="border-2 border-dashed border-slate-200 rounded-[24px] p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-blue-300 hover:bg-blue-50/20 transition group"
                >
                    <input ref={fileRef} type="file" accept={ACCEPTED} multiple className="hidden"
                        onChange={(e) => addFiles(e.target.files)} />
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center group-hover:scale-105 transition">
                        <Camera className="w-6 h-6 text-blue-500" />
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-bold text-slate-700">Add progress photos</p>
                        <p className="text-xs text-slate-400 mt-0.5">JPG, PNG, WebP up to 10 MB · drag & drop or click</p>
                    </div>
                </div>
            )}

            {/* Preview grid */}
            {previews.length > 0 && state !== "uploading" && (
                <div className="grid grid-cols-3 gap-2">
                    {previews.map((p, i) => (
                        <div key={i} className="relative aspect-square rounded-2xl overflow-hidden border border-slate-100 group">
                            <img src={p.url} alt={`preview-${i}`} className="w-full h-full object-cover" />
                            <button onClick={(e) => { e.stopPropagation(); removePreview(i); }}
                                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Upload progress */}
            {state === "uploading" && (
                <div className="space-y-2 px-2">
                    <div className="flex items-center gap-2">
                        <Loader className="w-4 h-4 text-blue-500 animate-spin" />
                        <p className="text-sm font-semibold text-slate-700">Uploading photos...</p>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                        <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-xs text-right text-slate-400">{progress}%</p>
                </div>
            )}

            {/* Done */}
            {state === "done" && (
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
                    <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    <p className="text-sm font-semibold text-emerald-700">Photos uploaded successfully!</p>
                    <button onClick={() => setState("idle")} className="ml-auto text-xs text-emerald-600 hover:underline">Upload more</button>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <p className="text-sm text-red-600">{error}</p>
                    <button onClick={() => { setError(null); setState("idle"); }} className="ml-auto text-xs text-red-500 hover:underline">Dismiss</button>
                </div>
            )}

            {/* Upload button */}
            {previews.length > 0 && state === "idle" && (
                <button onClick={handleUpload}
                    className="w-full py-3 rounded-2xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 shadow-lg shadow-blue-200 transition flex items-center justify-center gap-2">
                    <Upload className="w-4 h-4" />
                    Upload {previews.length} Photo{previews.length > 1 ? "s" : ""}
                </button>
            )}
        </div>
    );
}
