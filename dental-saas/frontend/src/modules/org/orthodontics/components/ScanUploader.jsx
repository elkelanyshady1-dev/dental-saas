/**
 * ScanUploader.jsx — STL/PLY Scan Upload Component
 *
 * Drag-and-drop or file browse for STL/PLY files.
 * Shows upload progress bar and triggers AI analysis.
 *
 * Architecture: React Query mutations (useUploadScan + useRequestAnalysis)
 * Cache invalidation is handled automatically in the mutation hooks.
 */
import { useState, useRef, useCallback } from "react";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { Upload, CheckCircle, AlertCircle, Loader } from "lucide-react";
import { useUploadScan, useRequestAnalysis } from "../hooks/useOrthodontics";

const ACCEPTED = ".stl,.ply,.obj";
const ACCEPTED_TYPES = ["stl", "ply", "obj"];

function getExt(name = "") { return name.split(".").pop().toLowerCase(); }

export default function ScanUploader({ caseId }) {
    const canUpdate = useCapability(P.ORTHODONTICS_UPDATE);
    const [dragging, setDragging] = useState(false);
    const [progress, setProgress] = useState(0);
    const [state,    setState]    = useState("idle"); // idle | uploading | analyzing | done | error
    const [error,    setError]    = useState(null);
    const [scanName, setScanName] = useState(null);
    const fileRef = useRef(null);

    const uploadScan      = useUploadScan();
    const requestAnalysis = useRequestAnalysis();

    const upload = useCallback(async (file) => {
        if (!file) return;
        const ext = getExt(file.name);
        if (!ACCEPTED_TYPES.includes(ext)) {
            setError(`Unsupported file type: .${ext}. Accepted: STL, PLY, OBJ`);
            return;
        }
        const fd = new FormData();
        fd.append("scan", file);
        fd.append("scanType", ext.toUpperCase());

        setScanName(file.name);
        setState("uploading");
        setProgress(0);
        setError(null);

        uploadScan.mutate(
            {
                caseId,
                formData: fd,
                onUploadProgress: (e) => {
                    if (e.total) setProgress(Math.round((e.loaded / e.total) * 90));
                },
            },
            {
                onSuccess: (scan) => {
                    setProgress(90);
                    setState("analyzing");
                    const scanId = scan?._id;
                    if (scanId) {
                        requestAnalysis.mutate(
                            { caseId, scanId },
                            {
                                onSuccess: () => { setProgress(100); setState("done"); },
                                onError:   () => { setProgress(100); setState("done"); }, // analysis failure is non-fatal
                            }
                        );
                    } else {
                        setProgress(100);
                        setState("done");
                    }
                },
                onError: (err) => {
                    setState("error");
                    setError(err.response?.data?.message || "Upload failed");
                },
            }
        );
    }, [caseId, uploadScan, requestAnalysis]);

    const handleDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) upload(file);
    };

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) upload(file);
    };

    if (!canUpdate) return null;

    return (
        <div className="space-y-3">
            {/* Drop zone */}
            <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => state === "idle" && fileRef.current?.click()}
                className={`relative rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center gap-3 py-10 px-6
                    ${dragging ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30"}
                    ${state !== "idle" ? "cursor-default" : ""}
                `}
            >
                <input ref={fileRef} type="file" accept={ACCEPTED} className="hidden" onChange={handleFileChange} />

                {state === "idle" && (
                    <>
                        <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center">
                            <Upload className="w-6 h-6 text-indigo-500" />
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-semibold text-gray-700">
                                {dragging ? "Drop scan here" : "Upload 3D Scan"}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">STL, PLY, OBJ — drag & drop or click</p>
                        </div>
                    </>
                )}

                {(state === "uploading" || state === "analyzing") && (
                    <div className="w-full max-w-xs space-y-3">
                        <div className="flex items-center gap-2">
                            <Loader className="w-4 h-4 text-indigo-500 animate-spin flex-shrink-0" />
                            <p className="text-sm font-semibold text-gray-700 truncate">
                                {state === "uploading" ? `Uploading ${scanName}...` : "AI segmentation running..."}
                            </p>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                            <div
                                className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <p className="text-xs text-right text-gray-400">{progress}%</p>
                    </div>
                )}

                {state === "done" && (
                    <div className="flex flex-col items-center gap-2">
                        <CheckCircle className="w-10 h-10 text-emerald-500" />
                        <p className="text-sm font-semibold text-emerald-700">Scan uploaded & AI analysis started</p>
                        <button onClick={(e) => { e.stopPropagation(); setState("idle"); setProgress(0); setScanName(null); }}
                            className="text-xs text-gray-400 hover:text-gray-600 underline mt-1">
                            Upload another scan
                        </button>
                    </div>
                )}

                {state === "error" && (
                    <div className="flex flex-col items-center gap-2">
                        <AlertCircle className="w-10 h-10 text-red-400" />
                        <p className="text-sm font-semibold text-red-600">{error}</p>
                        <button onClick={(e) => { e.stopPropagation(); setState("idle"); setProgress(0); setError(null); }}
                            className="text-xs text-gray-400 hover:text-gray-600 underline mt-1">
                            Try again
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
