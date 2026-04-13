/**
 * CreatePatientModal.jsx — Quick Patient Registration Modal
 *
 * Lightweight alternative to the full NewPatientPage.
 * For inline patient creation from within the patient directory.
 */
import { useState } from "react";
import { Input } from "@/design-system";
import { patientsApi } from "../api/patients.api";
import { useBranch } from "@/context/BranchContext";

export default function CreatePatientModal({ onCreated, onClose }) {
    const { activeBranchId } = useBranch();
    const [form, setForm] = useState({
        nameEnglish: "", nameArabic: "", phone: "",
        gender: "male", dob: "",
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const set = (field, value) => setForm((p) => ({ ...p, [field]: value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!activeBranchId) {
            setError("Select a branch from the header before creating a patient");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const res = await patientsApi.create({
                ...form,
                primaryBranchId: activeBranchId,
                allowedBranchIds: [activeBranchId],
            });
            onCreated?.(res.data?.data || res.data);
        } catch (err) {
            setError(err.response?.data?.message || err.response?.data?.error?.message || "Failed to create patient");
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-800">Register Patient</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
                </div>

                {!activeBranchId && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-sm text-amber-700 font-medium">
                        ⚠ Select a branch from the header first
                    </div>
                )}

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-600">{error}</div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Name (English)" value={form.nameEnglish} onChange={(e) => set("nameEnglish", e.target.value)} required />
                        <Input label="Name (Arabic)" value={form.nameArabic} onChange={(e) => set("nameArabic", e.target.value)} />
                    </div>
                    <Input label="Phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} required />

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Gender</label>
                            <select
                                value={form.gender}
                                onChange={(e) => set("gender", e.target.value)}
                                className="w-full h-14 rounded-xl border border-slate-200 px-4 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                            >
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                            </select>
                        </div>
                        <Input label="Date of Birth" type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose}
                            className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving || !activeBranchId}
                            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition disabled:opacity-50">
                            {saving ? "Registering..." : "Register Patient"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
