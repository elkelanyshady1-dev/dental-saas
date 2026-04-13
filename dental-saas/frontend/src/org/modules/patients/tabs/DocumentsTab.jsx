/**
 * DocumentsTab.jsx — Patient Document Vault (Enhanced)
 * Supports upload, view, and delete functionality.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { File, Upload, Trash2, Download, Eye } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { patientsApi } from "@/modules/org/patients/api/patients.api";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";

const FILE_ICONS = {
    pdf: "bg-red-50 text-red-500",
    jpg: "bg-blue-50 text-blue-500",
    jpeg: "bg-blue-50 text-blue-500",
    png: "bg-purple-50 text-purple-500",
    dcm: "bg-teal-50 text-teal-500",
    stl: "bg-amber-50 text-amber-500",
    default: "bg-gray-50 text-gray-500",
};

export default function DocumentsTab() {
    const { aggregate } = useOutletContext();
    const canUpdate = useCapability(P.PATIENTS_UPDATE);
    const canDelete = useCapability(P.PATIENTS_DELETE);
    const fileInputRef = useRef(null);

    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    const fetchDocuments = useCallback(async () => {
        if (!aggregate?._id) return;
        setLoading(true);
        try {
            const res = await patientsApi.getDocuments(aggregate._id);
            setDocuments(res.data?.data || res.data?.documents || res.data || []);
        } catch (err) {
            console.error("Failed to load documents:", err);
        } finally {
            setLoading(false);
        }
    }, [aggregate?._id]);

    useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

    const handleUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !aggregate?._id) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("patientId", aggregate._id);
            await patientsApi.uploadDocument(aggregate._id, formData);
            fetchDocuments();
        } catch (err) {
            console.error("Upload failed:", err);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleDelete = async (docId) => {
        if (!window.confirm("Delete this document?")) return;
        try {
            await patientsApi.deleteDocument(docId);
            fetchDocuments();
        } catch (err) {
            console.error("Delete failed:", err);
        }
    };

    if (!aggregate) return null;

    const getExtension = (name) => (name || "").split(".").pop().toLowerCase();

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">Document Vault</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            X-Rays, Scans & Legal Consent Forms — {documents.length} files
                        </p>
                    </div>
                    {canUpdate && (
                        <>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png,.dcm,.stl,.doc,.docx"
                                onChange={handleUpload}
                                className="hidden"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition disabled:opacity-50"
                            >
                                <Upload className="w-4 h-4" />
                                {uploading ? "Uploading..." : "Upload File"}
                            </button>
                        </>
                    )}
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                ) : documents.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">
                        <File className="w-8 h-8 mx-auto mb-3 opacity-20" />
                        <p className="text-sm">No files uploaded yet.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {documents.map((doc) => {
                            const ext = getExtension(doc.originalName || doc.fileName || "");
                            const iconStyle = FILE_ICONS[ext] || FILE_ICONS.default;

                            return (
                                <div key={doc._id} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50/50 transition group">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconStyle}`}>
                                        <File className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-slate-800 truncate">
                                            {doc.originalName || doc.fileName || "Document"}
                                        </p>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            {ext.toUpperCase()} • {doc.size ? `${(doc.size / 1024).toFixed(1)} KB` : "—"}
                                            {doc.createdAt && ` • ${new Date(doc.createdAt).toLocaleDateString()}`}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {doc.url && (
                                            <a href={doc.url} target="_blank" rel="noreferrer"
                                                className="p-2 rounded-lg hover:bg-blue-50 text-blue-500 transition" title="View">
                                                <Eye className="w-4 h-4" />
                                            </a>
                                        )}
                                        {canDelete && (
                                            <button onClick={() => handleDelete(doc._id)}
                                                className="p-2 rounded-lg hover:bg-red-50 text-red-400 transition" title="Delete">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
