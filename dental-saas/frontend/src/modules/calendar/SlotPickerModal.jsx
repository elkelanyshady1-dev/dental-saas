import { useState, useEffect, useCallback } from "react";
import { getAvailability, createAppointment } from "../../services/appointmentService";

export default function SlotPickerModal({ branchId, chairId, dentistId, date, onClose, onCreated }) {
    const [slots, setSlots] = useState([]);
    const [slotDuration, setSlotDuration] = useState(15);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [selectedSlot, setSelectedSlot] = useState(null);
    const [duration, setDuration] = useState(null);
    const [patientId, setPatientId] = useState("");
    const [notes, setNotes] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [conflict, setConflict] = useState(null);

    const durations = [15, 30, 45, 60, 90, 120];

    /* ── Fetch availability ─────────────────────────────── */
    const loadSlots = useCallback(async () => {
        if (!branchId || !date) return;
        setLoading(true);
        setError(null);
        try {
            const res = await getAvailability(branchId, chairId, dentistId, date);
            setSlots(res.data.slots || []);
            setSlotDuration(res.data.slotDuration || 15);
            setDuration(res.data.slotDuration || 15);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to load availability");
        } finally {
            setLoading(false);
        }
    }, [branchId, chairId, dentistId, date]);

    useEffect(() => { loadSlots(); }, [loadSlots]);

    /* ── Submit appointment ─────────────────────────────── */
    const handleSubmit = async (force = false) => {
        if (!selectedSlot || !patientId) return;
        setSubmitting(true);
        setError(null);
        setConflict(null);

        try {
            await createAppointment({
                branchId,
                chairId,
                dentistId,
                patientId,
                date,
                startTime: selectedSlot,
                duration,
                notes,
                force,
            });
            onCreated?.();
            onClose();
        } catch (err) {
            const data = err.response?.data;
            if (data?.warning) {
                setConflict(data);
            } else {
                setError(data?.message || "Failed to create appointment");
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />

            <div className="fixed inset-x-0 top-[10%] mx-auto w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl z-50 flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="p-5 border-b border-slate-700/50 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-slate-200">New Appointment</h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 transition flex items-center justify-center text-sm"
                    >
                        ✕
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Patient ID */}
                    <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-1">Patient ID</label>
                        <input
                            type="text"
                            value={patientId}
                            onChange={(e) => setPatientId(e.target.value)}
                            placeholder="Enter patient ID"
                            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700/50 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
                        />
                    </div>

                    {/* Duration presets */}
                    <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-1.5">Duration</label>
                        <div className="flex flex-wrap gap-2">
                            {durations
                                .filter((d) => d % slotDuration === 0)
                                .map((d) => (
                                    <button
                                        key={d}
                                        onClick={() => setDuration(d)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 ${duration === d
                                                ? "bg-blue-600/20 border-blue-500/50 text-blue-400"
                                                : "bg-slate-800 border-slate-700/50 text-slate-400 hover:bg-slate-700"
                                            }`}
                                    >
                                        {d}m
                                    </button>
                                ))}
                        </div>
                    </div>

                    {/* Slot grid */}
                    <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-1.5">
                            Available Slots
                        </label>

                        {loading && (
                            <div className="flex items-center justify-center py-8">
                                <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                            </div>
                        )}

                        {!loading && (
                            <div className="grid grid-cols-4 gap-1.5 max-h-56 overflow-y-auto">
                                {slots.map((slot) => {
                                    const isOccupied = slot.occupied;
                                    const isSelected = selectedSlot === slot.start;
                                    return (
                                        <button
                                            key={slot.start}
                                            onClick={() => !isOccupied && setSelectedSlot(slot.start)}
                                            disabled={isOccupied}
                                            className={`px-2 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${isOccupied
                                                    ? "bg-slate-800/30 text-slate-600 cursor-not-allowed line-through"
                                                    : isSelected
                                                        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                                                        : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                                                }`}
                                        >
                                            {slot.start}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-1">Notes</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700/50 text-sm text-slate-200 placeholder:text-slate-600 resize-none focus:outline-none focus:border-blue-500/50"
                            placeholder="Optional notes..."
                        />
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400">
                            {error}
                        </div>
                    )}

                    {/* Conflict warning */}
                    {conflict && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-2">
                            <p className="text-xs text-amber-400 font-medium">⚠ {conflict.message}</p>
                            {conflict.conflicts?.dentist && (
                                <p className="text-[11px] text-amber-400/70">Dentist conflict detected</p>
                            )}
                            {conflict.conflicts?.chair && (
                                <p className="text-[11px] text-amber-400/70">Chair conflict detected</p>
                            )}
                            <button
                                onClick={() => handleSubmit(true)}
                                disabled={submitting}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600/20 border border-amber-500/50 text-amber-400 hover:bg-amber-600/30 transition disabled:opacity-50"
                            >
                                {submitting ? "..." : "Force Create"}
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-slate-700/50">
                    <button
                        onClick={() => handleSubmit(false)}
                        disabled={submitting || !selectedSlot || !patientId}
                        className="w-full py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-500 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20"
                    >
                        {submitting ? "Creating..." : "Create Appointment"}
                    </button>
                </div>
            </div>
        </>
    );
}
