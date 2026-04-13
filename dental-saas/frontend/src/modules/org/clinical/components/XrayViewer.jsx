/**
 * XrayViewer.jsx — Patient X-Ray / Imaging Viewer
 *
 * Displays uploaded patient documents (PDF, X-ray images: JPG, PNG, DCM).
 * Provides zoom, rotate and full-screen controls.
 * Loaded from GET /v1/documents?patientId=
 */
import { useState, useEffect, useRef } from "react";
import { treatmentsApi } from "../api/treatments.api";
import { ZoomIn, ZoomOut, RotateCw, Maximize, FileX, Loader } from "lucide-react";

const IMAGE_TYPES = ["jpg", "jpeg", "png", "webp", "dcm", "tiff"];
const DOC_TYPES = ["pdf"];

function getExt(name = "") {
    return name.split(".").pop().toLowerCase();
}

function isImage(name) { return IMAGE_TYPES.includes(getExt(name)); }
function isPDF(name) { return DOC_TYPES.includes(getExt(name)); }

export default function XrayViewer({ patientId }) {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const viewerRef = useRef(null);

    useEffect(() => {
        if (!patientId) return;
        setLoading(true);
        treatmentsApi.getDocuments(patientId)
            .then((res) => {
                const docs = res.data?.documents || res.data?.data || res.data || [];
                setDocuments(docs);
                // Auto-select first image
                const firstImg = docs.find((d) => isImage(d.name || d.fileName || ""));
                if (firstImg) setSelected(firstImg);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [patientId]);

    const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 4));
    const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.25));
    const handleRotate = () => setRotation((r) => (r + 90) % 360);
    const handleReset = () => { setZoom(1); setRotation(0); };

    const handleFullscreen = () => {
        if (viewerRef.current?.requestFullscreen) {
            viewerRef.current.requestFullscreen();
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-10">
                <Loader className="w-5 h-5 text-blue-500 animate-spin" />
            </div>
        );
    }

    const imageDocs = documents.filter((d) => isImage(d.name || d.fileName || ""));
    const otherDocs = documents.filter((d) => !isImage(d.name || d.fileName || ""));

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            {selected && (
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={handleZoomOut} title="Zoom Out"
                        className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition">
                        <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-semibold text-gray-500 min-w-[48px] text-center">
                        {Math.round(zoom * 100)}%
                    </span>
                    <button onClick={handleZoomIn} title="Zoom In"
                        className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition">
                        <ZoomIn className="w-4 h-4" />
                    </button>
                    <button onClick={handleRotate} title="Rotate"
                        className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition">
                        <RotateCw className="w-4 h-4" />
                    </button>
                    <button onClick={handleReset}
                        className="px-3 py-1.5 rounded-xl text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition">
                        Reset
                    </button>
                    <button onClick={handleFullscreen} title="Fullscreen"
                        className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition ml-auto">
                        <Maximize className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Main Viewer */}
            {imageDocs.length > 0 && selected ? (
                <div
                    ref={viewerRef}
                    className="bg-black rounded-2xl border border-gray-200 overflow-hidden flex items-center justify-center"
                    style={{ minHeight: "320px", maxHeight: "520px" }}
                >
                    <img
                        src={selected.url || selected.fileUrl || selected.path}
                        alt={selected.name || "X-ray"}
                        style={{
                            transform: `scale(${zoom}) rotate(${rotation}deg)`,
                            transition: "transform 0.2s ease",
                            maxWidth: "100%",
                            maxHeight: "520px",
                            objectFit: "contain",
                        }}
                    />
                </div>
            ) : imageDocs.length === 0 && documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <FileX className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">No imaging documents uploaded</p>
                </div>
            ) : null}

            {/* Image Thumbnails */}
            {imageDocs.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                    {imageDocs.map((doc, i) => (
                        <button
                            key={i}
                            onClick={() => { setSelected(doc); handleReset(); }}
                            className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition ${
                                selected === doc ? "border-blue-500" : "border-gray-200 hover:border-gray-400"
                            }`}
                        >
                            <img
                                src={doc.url || doc.fileUrl || doc.path}
                                alt={doc.name}
                                className="w-full h-full object-cover"
                            />
                        </button>
                    ))}
                </div>
            )}

            {/* Non-image documents (PDFs etc.) */}
            {otherDocs.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Other Documents</p>
                    {otherDocs.map((doc, i) => (
                        <a
                            key={i}
                            href={doc.url || doc.fileUrl || doc.path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-xl transition text-sm text-gray-700 font-medium"
                        >
                            <span className="text-lg">{isPDF(doc.name) ? "📄" : "📎"}</span>
                            {doc.name || doc.fileName || `Document ${i + 1}`}
                            <span className="ml-auto text-xs text-blue-500 font-semibold">Open ↗</span>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}
