/**
 * ClinicalNotes.jsx — Patient Clinical Notes Component
 *
 * Displays and manages patient clinical notes from the aggregate.
 * Add / view note entries. Uses aggregate clinical endpoint.
 */
import { useState, useCallback } from "react";
import { treatmentsApi } from "../api/treatments.api";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";

export default function ClinicalNotes({ patientId, notes = [], onRefresh }) {
    const canUpdate = useCapability(P.TREATMENTS_UPDATE);
    const [showForm, setShowForm] = useState(false);
    const [content, setContent] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const handleAdd = useCallback(async () => {
        if (!content.trim()) return;
        setSaving(true);
        setError(null);
        try {
            await treatmentsApi.addNote(patientId, content.trim());
            setContent("");
            setShowForm(false);
            onRefresh?.();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to save note");
        } finally {
            setSaving(false);
        }
    }, [patientId, content, onRefresh]);

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-800">Clinical Notes</h3>
                {canUpdate && !showForm && (
                    <button
                        onClick={() => setShowForm(true)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition"
                    >
                        + Add Entry
                    </button>
                )}
            </div>

            {/* Add note form */}
            {showForm && (
                <div className="p-5 border-b border-gray-100 bg-gray-50/50 space-y-3">
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        rows={3}
                        placeholder="Enter clinical observation or treatment notes..."
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition"
                        disabled={saving}
                    />
                    {error && (
                        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5">{error}</p>
                    )}
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={() => { setShowForm(false); setContent(""); setError(null); }}
                            disabled={saving}
                            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800 font-medium transition"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleAdd}
                            disabled={saving || !content.trim()}
                            className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition shadow-lg shadow-blue-600/20 disabled:opacity-40"
                        >
                            {saving ? "Recording..." : "Record Entry"}
                        </button>
                    </div>
                </div>
            )}

            {/* Notes list */}
            <div className="divide-y divide-gray-50">
                {notes.length > 0 ? (
                    [...notes].reverse().map((note, idx) => (
                        <div key={idx} className="px-5 py-4 group hover:bg-gray-50/50 transition">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                    {note.createdAt ? new Date(note.createdAt).toLocaleString() : "—"}
                                </span>
                                {note.authorId && (
                                    <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">
                                        {note.authorId.toString().slice(-6)}
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-gray-700 leading-relaxed">{note.content}</p>
                        </div>
                    ))
                ) : (
                    <div className="px-5 py-10 text-center text-gray-400">
                        <p className="text-sm">No clinical entries yet.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
