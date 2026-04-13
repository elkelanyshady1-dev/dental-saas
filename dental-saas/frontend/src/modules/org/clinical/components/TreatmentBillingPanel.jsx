/**
 * TreatmentBillingPanel.jsx — Create Invoice from Treatment (Phase 4 — Fixed)
 *
 * ✅ Phase 4 FE fixes applied:
 *   - Cross-domain import REMOVED: no longer imports invoicesApi from finance module
 *   - usePermission → useCapability("invoices.create") (Step 4+5)
 *   - Invoice creation delegated to parent via onCreateInvoice callback (Step 6)
 *
 * PLANE BOUNDARY: clinical module MUST NOT import from finance module.
 * Parent is responsible for wiring invoice creation logic.
 */
import { useState } from "react";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { CreditCard } from "lucide-react";

/**
 * @param {object} props
 * @param {object}   props.treatment        — Treatment record
 * @param {object}   props.patient          — Patient record
 * @param {Function} props.onCreateInvoice  — Callback: parent handles invoice API call
 *                                            Receives: { patientId, treatmentId, amount, description }
 */
export default function TreatmentBillingPanel({ treatment, patient, onCreateInvoice }) {
    // ✅ Step 4+5 — usePermission removed → useCapability; key: accounting.create → invoices.create
    const canCreate = useCapability(P.INVOICES_CREATE);

    const [creating, setCreating] = useState(false);
    const [error,    setError]    = useState(null);
    const [success,  setSuccess]  = useState(false);

    if (!canCreate) return null;

    const handleCreateInvoice = async () => {
        if (!treatment?._id || !patient?._id) {
            setError("Treatment and patient are required");
            return;
        }
        setCreating(true);
        setError(null);
        try {
            // ✅ Step 6 — No direct API call here; delegate to parent via callback
            await onCreateInvoice?.({
                patientId:   patient._id,
                treatmentId: treatment._id,
                amount:      treatment.cost || 0,
                description: treatment.procedureName || treatment.procedure || "Treatment",
            });
            setSuccess(true);
        } catch (err) {
            setError(err?.message || "Failed to create invoice");
        } finally {
            setCreating(false);
        }
    };

    if (success) {
        return (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-semibold">
                <span>✓</span> Invoice created successfully
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {treatment?.cost > 0 && (
                <p className="text-xs text-gray-500">
                    Treatment cost: <span className="font-semibold text-gray-800">{treatment.cost} {treatment.currency || ""}</span>
                </p>
            )}
            {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5">{error}</p>
            )}
            <button
                onClick={handleCreateInvoice}
                disabled={creating}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition disabled:opacity-40"
            >
                <CreditCard className="w-4 h-4" />
                {creating ? "Creating Invoice..." : "Generate Invoice"}
            </button>
        </div>
    );
}
