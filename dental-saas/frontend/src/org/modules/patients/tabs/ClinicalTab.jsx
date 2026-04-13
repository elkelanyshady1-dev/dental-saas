import { AlertCircle, FileText, Activity } from 'lucide-react';
import { useOutletContext, useParams } from 'react-router-dom';
import { useState } from 'react';
import { patientsApi } from '../../../../modules/org/patients/api/patients.api';
import { toast } from 'sonner';

export default function ClinicalTab() {
    const { id } = useParams();
    const { aggregate, fetchAggregate } = useOutletContext();
    const [showNoteForm, setShowNoteForm] = useState(false);
    const [newNote, setNewNote] = useState('');
    const [submitting, setSubmitting] = useState(false);

    if (!aggregate) return null;
    const { clinical } = aggregate;

    const handleAddNote = async () => {
        if (!newNote.trim()) return;
        try {
            setSubmitting(true);
            await patientsApi.updateClinical(id, {
                notes: [...clinical.notes, { content: newNote, createdAt: new Date() }]
            });
            setNewNote('');
            setShowNoteForm(false);
            // Phase 4: Re-fetch aggregate after success
            await fetchAggregate(true);
        } catch (err) {
            console.error('Failed to add clinical note:', err);
            toast.error('Failed to save note. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Critical Alerts from Aggregate */}
            {clinical.alerts.length > 0 && (
                <div className="flex flex-col gap-3">
                    {clinical.alerts.map((alert, idx) => (
                        <div key={idx} className="flex items-center gap-3 bg-red-50 border border-red-100 p-4 rounded-2xl text-red-800">
                            <AlertCircle className="w-5 h-5" />
                            <div className="flex flex-col">
                                <span className="text-xs font-bold uppercase tracking-wider">{alert.type.replace(/_/g, ' ')}</span>
                                <span className="text-sm font-medium">{alert.data.join(', ')}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Risk Projection */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <Activity className="w-5 h-5 text-blue-600" />
                        <h3 className="text-lg font-bold text-slate-900">Risk Profile</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {clinical.riskFlags.length > 0 ? (
                            clinical.riskFlags.map(flag => (
                                <span key={flag} className="bg-orange-50 text-orange-700 px-3 py-1 rounded-full text-xs font-bold border border-orange-100">
                                    {flag}
                                </span>
                            ))
                        ) : (
                            <span className="text-slate-400 text-sm italic">No significant risks identified.</span>
                        )}
                    </div>
                </div>

                {/* Medical History Summary */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <FileText className="w-5 h-5 text-blue-600" />
                        <h3 className="text-lg font-bold text-slate-900">Clinical Background</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {Object.entries(clinical.medicalHistory).map(([key, value]) => {
                            if (typeof value === 'boolean') {
                                return (
                                    <div key={key} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                                        <span className="text-sm font-medium text-slate-600 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${value ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                            {value ? 'YES' : 'NO'}
                                        </span>
                                    </div>
                                );
                            }
                            return null;
                        })}
                    </div>
                </div>
            </div>

            {/* Clinical Notes */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900">Clinical Chronology</h3>
                    {!showNoteForm && (
                        <button
                            onClick={() => setShowNoteForm(true)}
                            className="text-sm font-bold text-blue-600 hover:text-blue-700"
                        >
                            + Add Entry
                        </button>
                    )}
                </div>

                {showNoteForm && (
                    <div className="p-6 bg-slate-50 border-b border-slate-100 animate-in fade-in slide-in-from-top-4 duration-300">
                        <textarea
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            placeholder="Enter clinical observation or treatment notes..."
                            className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm min-h-[120px]"
                            disabled={submitting}
                        />
                        <div className="flex justify-end gap-3 mt-4">
                            <button
                                onClick={() => setShowNoteForm(false)}
                                className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800"
                                disabled={submitting}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddNote}
                                disabled={submitting || !newNote.trim()}
                                className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-soft hover:bg-blue-700 disabled:opacity-50"
                            >
                                {submitting ? 'Recording...' : 'Record Entry'}
                            </button>
                        </div>
                    </div>
                )}

                <div className="divide-y divide-slate-100">
                    {clinical.notes.length > 0 ? (
                        clinical.notes.map((note, idx) => (
                            <div key={idx} className="p-6">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">
                                        {new Date(note.createdAt).toLocaleString()}
                                    </span>
                                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                        ID: {note.authorId}
                                    </span>
                                </div>
                                <p className="text-slate-700 text-sm leading-relaxed">{note.content}</p>
                            </div>
                        ))
                    ) : (
                        <div className="p-12 text-center text-slate-400">
                            No clinical entries found.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
