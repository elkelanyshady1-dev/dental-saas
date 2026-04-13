/**
 * CaseNotes.jsx — Orthodontic Case Notes Component
 *
 * Add / view clinical notes on an ortho case.
 * PATCH /v1/orthodontic-cases/:id
 *
 * Architecture: React Query (useAddCaseNote mutation)
 * Cache invalidation auto-refreshes the case detail — notes are never stale.
 */
import { useState } from "react";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { useAddCaseNote } from "../hooks/useOrthodontics";

export default function CaseNotes({ caseId, notes = [] }) {
    const canUpdate = useCapability(P.ORTHODONTICS_UPDATE);
    const [showForm, setShowForm] = useState(false);
    const [content, setContent]  = useState("");

    const addNote = useAddCaseNote();

    const handleAdd = () => {
        if (!content.trim()) return;
        addNote.mutate(
            { caseId, content: content.trim() },
            {
                onSuccess: () => { setContent(""); setShowForm(false); },
            }
        );
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-800">Case Notes</h3>
                {canUpdate && !showForm && (
                    <button onClick={() => setShowForm(true)}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition">
                        + Add Note
                    </button>
                )}
            </div>

            {showForm && (
                <div className="p-5 border-b border-gray-100 bg-gray-50/50 space-y-3">
                    <textarea value={content} onChange={(e) => setContent(e.target.value)}
                        rows={3} disabled={addNote.isPending}
                        placeholder="Enter clinical observation, treatment decision, or progress note..."
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition" />
                    {addNote.isError && (
                        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5">
                            {addNote.error?.response?.data?.message || "Failed to save note"}
                        </p>
                    )}
                    <div className="flex justify-end gap-2">
                        <button onClick={() => { setShowForm(false); setContent(""); }} disabled={addNote.isPending}
                            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium transition">
                            Cancel
                        </button>
                        <button onClick={handleAdd} disabled={addNote.isPending || !content.trim()}
                            className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition disabled:opacity-40">
                            {addNote.isPending ? "Saving..." : "Add Note"}
                        </button>
                    </div>
                </div>
            )}

            <div className="divide-y divide-gray-50">
                {notes.length > 0 ? (
                    [...notes].reverse().map((note, idx) => (
                        <div key={idx} className="px-5 py-4 hover:bg-gray-50/50 transition group">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                    {note.createdAt ? new Date(note.createdAt).toLocaleString() : "—"}
                                </span>
                                {note.authorId && (
                                    <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">
                                        {String(note.authorId).slice(-6)}
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-gray-700 leading-relaxed">{note.content}</p>
                        </div>
                    ))
                ) : (
                    <div className="px-5 py-10 text-center text-gray-400">
                        <p className="text-sm">No case notes yet.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
