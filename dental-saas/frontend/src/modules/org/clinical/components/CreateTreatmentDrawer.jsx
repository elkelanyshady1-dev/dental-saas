/**
 * CreateTreatmentDrawer.jsx — New Treatment Record Creation
 *
 * Slide-in drawer with patient selector, procedure picker,
 * tooth number, doctor, status, notes, cost.
 */
import { useState } from "react";
import { treatmentsApi } from "../api/treatments.api";
import { useBranch } from "@/context/BranchContext";
import ProcedureSelector from "./ProcedureSelector";
import { Input } from "@/design-system";

const TOOTH_NUMBERS = [
    ...[...Array(16)].map((_, i) => i + 11),   // Upper right 11–18 + upper left 21–28
    ...[...Array(16)].map((_, i) => i + 31),   // Lower left 31–38 + lower right 41–48
].filter((n) => n % 10 >= 1 && n % 10 <= 8); // FDI system

export default function CreateTreatmentDrawer({ patientId = "", onClose, onCreated }) {
    const [form, setForm] = useState({
        patientId: patientId || "",
        procedureName: "",
        toothNumber: "",
        status: "planned",
        notes: "",
        cost: "",
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const set = (field, val) => setForm((p) => ({ ...p, [field]: val }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.patientId || !form.procedureName) {
            setError("Patient ID and procedure are required");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await treatmentsApi.create({
                patientId: form.patientId,
                procedureName: form.procedureName,
                toothNumber: form.toothNumber || undefined,
                status: form.status,
                notes: form.notes || undefined,
                cost: form.cost ? parseFloat(form.cost) : undefined,
            });
            onCreated?.();
        } catch (err) {
            setError(err.response?.data?.message || err.response?.data?.error?.message || "Failed to create treatment");
            setSaving(false);
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />

            <div className="fixed right-0 top-0 bottom-0 w-[460px] bg-white border-l border-gray-200 shadow-2xl z-50 flex flex-col animate-slide-up">
                {/* Header */}
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-base font-bold text-gray-800">New Treatment Record</h2>
                    <button onClick={onClose}
                        className="w-8 h-8 rounded-lg bg-gray-100 text-gray-400 hover:bg-gray-200 transition flex items-center justify-center text-sm">
                        ✕
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Patient (editable if not pre-filled) */}
                    {!patientId && (
                        <Input
                            label="Patient ID"
                            value={form.patientId}
                            onChange={(e) => set("patientId", e.target.value)}
                            placeholder="Enter patient ID"
                            required
                        />
                    )}

                    {/* Procedure */}
                    <ProcedureSelector
                        value={form.procedureName}
                        onChange={(v) => set("procedureName", v)}
                    />

                    {/* Tooth Number | Status */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tooth # (FDI)</label>
                            <select
                                value={form.toothNumber}
                                onChange={(e) => set("toothNumber", e.target.value)}
                                className="w-full h-14 rounded-xl border border-gray-200 px-4 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition"
                            >
                                <option value="">Select tooth</option>
                                {TOOTH_NUMBERS.map((n) => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                            <select
                                value={form.status}
                                onChange={(e) => set("status", e.target.value)}
                                className="w-full h-14 rounded-xl border border-gray-200 px-4 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition"
                            >
                                <option value="planned">Planned</option>
                                <option value="in_progress">In Progress</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                            </select>
                        </div>
                    </div>

                    {/* Cost */}
                    <Input
                        label="Cost (optional)"
                        type="number"
                        value={form.cost}
                        onChange={(e) => set("cost", e.target.value)}
                        placeholder="0.00"
                        step="0.01"
                    />

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Clinical Notes</label>
                        <textarea
                            value={form.notes}
                            onChange={(e) => set("notes", e.target.value)}
                            rows={4}
                            placeholder="Enter clinical observations, treatment notes..."
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition"
                        />
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-600">{error}</div>
                    )}
                </form>

                {/* Footer */}
                <div className="p-5 border-t border-gray-100">
                    <div className="flex gap-3">
                        <button type="button" onClick={onClose}
                            className="flex-1 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition border border-gray-200">
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={saving || !form.procedureName || !form.patientId}
                            className="flex-1 py-3 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition disabled:opacity-40"
                        >
                            {saving ? "Saving..." : "Create Treatment"}
                        </button>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes slideUp { from { transform: translateX(100%); } to { transform: translateX(0); } }
                .animate-slide-up { animation: slideUp 0.2s ease-out; }
            `}</style>
        </>
    );
}
