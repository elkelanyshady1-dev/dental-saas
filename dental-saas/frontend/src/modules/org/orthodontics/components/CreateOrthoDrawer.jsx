/**
 * CreateOrthoDrawer.jsx — Create Orthodontic Case Drawer
 *
 * ACTIVE_CASE_EXISTS Handling (Tasks 8 & 9):
 *   POST create → 409 ACTIVE_CASE_EXISTS
 *     ↓
 *   Fetch patient cases via listByPatient (Task 8 debug)
 *     ↓
 *   Find the active case (draft|diagnosis|treatment_planning|active)
 *     ↓
 *   Show "Open Existing Case" modal (Task 9)
 *     ↓
 *   Navigate to /org/orthodontics/:existingId
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/design-system";
import { useCreateOrthoCase } from "../hooks/useOrthodontics";
import { caseApi } from "@/org/modules/patients/components/orthodontic-chart/api/case.api";

const MALOCCLUSION_CLASSES = [
    { value: "CLASS_I",        label: "Class I" },
    { value: "CLASS_II_DIV_1", label: "Class II Div. 1" },
    { value: "CLASS_II_DIV_2", label: "Class II Div. 2" },
    { value: "CLASS_III",      label: "Class III" },
];

const ACTIVE_STATUSES = ["draft", "diagnosis", "treatment_planning", "active"];

export default function CreateOrthoDrawer({ onClose, onCreated }) {
    const navigate   = useNavigate();
    const createCase = useCreateOrthoCase();

    const [form, setForm] = useState({
        patientId: "", malocclusionClass: "CLASS_I",
        estimatedDurationMonths: "", notes: "",
    });
    const [error,        setError]        = useState(null);
    // — active case collision state —
    const [existingCase, setExistingCase] = useState(null); // { id, status, caseType }
    const [resolving,    setResolving]    = useState(false);

    const saving = createCase.isPending || resolving;
    const set    = (k, v) => setForm((p) => ({ ...p, [k]: v }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.patientId) { setError("Patient ID is required"); return; }
        setError(null); setExistingCase(null);

        createCase.mutate(
            {
                patientId:               form.patientId,
                malocclusionClass:       form.malocclusionClass,
                estimatedDurationMonths: form.estimatedDurationMonths
                    ? parseInt(form.estimatedDurationMonths)
                    : undefined,
                notes: form.notes || undefined,
            },
            {
                onSuccess: () => { onCreated?.(); onClose(); },
                onError: async (err) => {
                    const code       = err.response?.data?.error?.code;
                    const existingId = err.response?.data?.error?.existingId;

                    if (code === "ACTIVE_CASE_EXISTS") {
                        // Fetch cases to surface the conflicting case
                        setResolving(true);
                        try {
                            const { data: listRes } = await caseApi.listByPatient(form.patientId);
                            const activeCases = (listRes?.data ?? []).filter(
                                (c) => ACTIVE_STATUSES.includes(c.status)
                            );
                            const found = activeCases[0] ?? (existingId ? { id: existingId } : null);
                            if (found) {
                                setExistingCase(found);
                            } else {
                                console.warn("[CreateOrthoDrawer] ACTIVE_CASE_EXISTS but no active case in list.", { existingId, listRes });
                                setError("An active case exists for this patient but could not be loaded. Please refresh.");
                            }
                        } catch (fetchErr) {
                            console.error("[CreateOrthoDrawer] Failed to fetch patient cases after 409:", fetchErr);
                            setError("An active case exists but could not be loaded. Please refresh.");
                        } finally {
                            setResolving(false);
                        }
                    } else {
                        setError(err.response?.data?.error?.message || err.response?.data?.message || "Failed to create case");
                    }
                },
            }
        );
    };

    const handleOpenExisting = () => {
        if (existingCase?.id) {
            navigate(`/org/orthodontics/${existingCase.id}`);
            onClose();
        }
    };

    // ── Task 9: Active case collision modal ───────────────────────────────────
    const CollisionModal = existingCase && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4">
                <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none">⚠️</span>
                    <div>
                        <h3 className="font-bold text-gray-900 text-base">Active Case Exists</h3>
                        <p className="text-sm text-gray-500 mt-1">
                            This patient already has an active orthodontic case
                            {existingCase.status ? ` (${existingCase.status.replace(/_/g, " ")})` : ""}.
                            Only one active case is allowed per patient.
                        </p>
                    </div>
                </div>

                <div className="flex flex-col gap-2 mt-1">
                    <button
                        id="open-existing-case-btn"
                        onClick={handleOpenExisting}
                        className="w-full py-3 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition"
                    >
                        Open Existing Case
                    </button>
                    <button
                        id="create-new-case-anyway-btn"
                        disabled
                        title="Cannot create a second active case for the same patient"
                        className="w-full py-3 rounded-xl text-sm font-medium text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed opacity-60"
                    >
                        Create New Case Anyway
                    </button>
                    <button
                        id="cancel-collision-modal-btn"
                        onClick={() => { setExistingCase(null); setSaving(false); }}
                        className="w-full py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <>
            {CollisionModal}

            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
            <div className="fixed right-0 top-0 bottom-0 w-[400px] bg-white border-l border-gray-200 shadow-2xl z-50 flex flex-col">
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-base font-bold text-gray-800">New Orthodontic Case</h2>
                    <button
                        id="close-create-ortho-drawer-btn"
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg bg-gray-100 text-gray-400 hover:bg-gray-200 transition flex items-center justify-center text-sm"
                    >✕</button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
                    <Input
                        id="patient-id-input"
                        label="Patient ID"
                        value={form.patientId}
                        onChange={(e) => set("patientId", e.target.value)}
                        placeholder="Enter patient ID"
                        required
                    />

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Malocclusion Class</label>
                        <div className="grid grid-cols-2 gap-2">
                            {MALOCCLUSION_CLASSES.map((m) => (
                                <button
                                    key={m.value}
                                    type="button"
                                    id={`malocclusion-${m.value.toLowerCase()}-btn`}
                                    onClick={() => set("malocclusionClass", m.value)}
                                    className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition text-center ${
                                        form.malocclusionClass === m.value
                                            ? "bg-indigo-600 border-indigo-600 text-white"
                                            : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                                    }`}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <Input
                        label="Estimated Duration (months)"
                        type="number"
                        value={form.estimatedDurationMonths}
                        onChange={(e) => set("estimatedDurationMonths", e.target.value)}
                        placeholder="e.g. 18"
                    />

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Initial Notes</label>
                        <textarea
                            value={form.notes}
                            onChange={(e) => set("notes", e.target.value)}
                            rows={3}
                            placeholder="Clinical observations, treatment plan summary..."
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-600">
                            {error}
                        </div>
                    )}

                    {resolving && (
                        <div className="text-sm text-indigo-600 text-center animate-pulse">
                            Loading existing case…
                        </div>
                    )}
                </form>

                <div className="p-5 border-t border-gray-100 flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-3 rounded-xl text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition"
                    >
                        Cancel
                    </button>
                    <button
                        id="submit-create-case-btn"
                        onClick={handleSubmit}
                        disabled={saving || !form.patientId}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition disabled:opacity-40"
                    >
                        {saving ? "Creating…" : "Create Case"}
                    </button>
                </div>
            </div>
        </>
    );
}
