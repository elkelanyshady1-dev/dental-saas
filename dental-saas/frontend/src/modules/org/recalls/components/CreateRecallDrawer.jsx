/**
 * CreateRecallDrawer — Staff-facing form to schedule a new recall.
 *
 * Mirrors CreateAppointmentDrawer's drawer shell (right-aligned panel,
 * backdrop blur, header with close, scrollable body, sticky submit row)
 * but only collects the recall-specific fields the backend requires:
 *
 *   - patient   (search → select)
 *   - dueDate   (date picker)
 *   - reason    (free text, optional)
 *
 * branchId is set server-side from req.activeBranchId — no need to pick.
 *
 * Submit goes through useCreateRecall() (optimistic insert + invalidate).
 * Errors fall through to the global toast interceptor by default; only
 * structured business codes are surfaced inline via apiError.
 */

import { useState, useEffect } from "react";
import { patientsApi } from "@/modules/org/patients/api/patients.api";
import { useCreateRecall } from "../hooks/useRecalls";

function todayISODate() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function plusDaysISODate(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

export default function CreateRecallDrawer({ onClose, onCreated }) {
    const [patient, setPatient] = useState(null);
    // Sensible default — six months from today, common dental recall cadence.
    const [dueDate, setDueDate] = useState(plusDaysISODate(180));
    const [reason, setReason] = useState("");
    const [apiError, setApiError] = useState(null);

    const { mutate: createRecall, isPending } = useCreateRecall();

    const valid = !!patient && !!dueDate && new Date(dueDate) >= new Date(todayISODate());

    const handleSubmit = (e) => {
        e?.preventDefault();
        setApiError(null);
        if (!valid) return;
        createRecall(
            {
                patientId: patient._id,
                // ISO start of selected day so backend receives an unambiguous instant
                dueDate: new Date(`${dueDate}T00:00:00`).toISOString(),
                reason: reason.trim() || undefined,
            },
            {
                onSuccess: () => onCreated?.(),
                onError: (err) => {
                    const body = err?.response?.data;
                    setApiError({
                        code: body?.error?.code || "UNKNOWN",
                        message:
                            body?.error?.message ||
                            body?.message ||
                            "Failed to create recall",
                    });
                },
            }
        );
    };

    return (
        <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true" aria-label="Create recall">
            <div
                className="absolute inset-0 bg-[#191c1e]/20 backdrop-blur-sm transition-opacity duration-300"
                onClick={onClose}
            />

            <div className="relative w-full max-w-md bg-white h-full shadow-[0_12px_32px_-4px_rgba(25,28,30,0.15)] flex flex-col overflow-hidden">
                <div className="px-8 py-6 border-b border-[#c3c6d7]/30 flex justify-between items-center flex-shrink-0">
                    <div>
                        <h2 className="font-headline text-2xl font-extrabold text-[#191c1e] tracking-tight">
                            New Recall
                        </h2>
                        <p className="text-[#434655] text-sm mt-0.5">
                            Bring a patient back for a follow-up.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="material-symbols-outlined p-2 hover:bg-[#eceef0] rounded-full transition-colors text-[#434655]"
                    >
                        close
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
                        {/* Patient */}
                        <section className="space-y-2">
                            <label className="block text-sm font-bold text-[#191c1e] tracking-tight">
                                Patient
                            </label>
                            <PatientPicker selected={patient} onSelect={setPatient} />
                        </section>

                        {/* Due date */}
                        <section className="space-y-2">
                            <label
                                htmlFor="recall-due-date"
                                className="block text-xs font-bold text-[#434655] uppercase tracking-wider"
                            >
                                Due Date
                            </label>
                            <input
                                id="recall-due-date"
                                type="date"
                                value={dueDate}
                                min={todayISODate()}
                                onChange={(e) => setDueDate(e.target.value)}
                                className="w-full px-3 py-3 bg-[#f2f4f6] border-none rounded-xl text-sm font-medium text-[#191c1e] focus:ring-2 focus:ring-[#004ac6]/20"
                            />
                        </section>

                        {/* Reason */}
                        <section className="space-y-2">
                            <label
                                htmlFor="recall-reason"
                                className="block text-xs font-bold text-[#434655] uppercase tracking-wider"
                            >
                                Reason <span className="text-[#737686] normal-case font-normal">(optional)</span>
                            </label>
                            <textarea
                                id="recall-reason"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                rows={3}
                                maxLength={1000}
                                placeholder="e.g. 6-month checkup, ortho follow-up"
                                className="w-full px-3 py-3 bg-[#f2f4f6] border-none rounded-xl text-sm text-[#191c1e] focus:ring-2 focus:ring-[#004ac6]/20 resize-none"
                            />
                            <div className="text-[10px] text-[#737686] text-right">
                                {reason.length}/1000
                            </div>
                        </section>

                        {apiError && (
                            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                                <strong className="font-semibold">{apiError.code}:</strong> {apiError.message}
                            </div>
                        )}
                    </div>

                    <div className="px-8 py-4 border-t border-[#c3c6d7]/30 flex items-center justify-end gap-3 flex-shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-sm font-medium px-4 py-2 rounded-lg border border-[#c3c6d7]/60 text-[#434655] hover:bg-[#f6f7fb] transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!valid || isPending}
                            className="text-sm font-medium px-4 py-2 rounded-lg bg-[#004ac6] text-white hover:bg-[#003ba0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isPending ? "Creating…" : "Create Recall"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Inline patient picker ─────────────────────────────────────────────────
// Mirrors the PatientSearch behavior in CreateAppointmentDrawer but trimmed
// to the fields recalls care about (name + phone/email). Keeps the recall
// drawer self-contained and avoids cross-module coupling for now.

function PatientPicker({ selected, onSelect }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (query.length < 2) {
            setResults([]);
            setOpen(false);
            return;
        }
        const t = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await patientsApi.search({ q: query });
                setResults(res.data?.data || []);
                setOpen(true);
            } finally {
                setLoading(false);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [query]);

    if (selected) {
        return (
            <div className="bg-[#f2f4f6] rounded-xl p-3 flex items-center gap-3 border border-[#c3c6d7]/20">
                <div className="h-10 w-10 rounded-full bg-[#004ac6]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-extrabold text-[#004ac6]">
                        {(selected.displayName || selected.name || "?")[0]}
                    </span>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-[#0f172a] truncate">
                        {selected.displayName || selected.name}
                    </div>
                    <div className="text-xs text-[#737686] truncate">
                        {selected.phone || selected.email || "—"}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => onSelect(null)}
                    className="text-xs font-medium text-[#004ac6] hover:underline"
                >
                    Change
                </button>
            </div>
        );
    }

    return (
        <div className="relative">
            <span
                className="material-symbols-outlined absolute left-3 top-3 text-[#737686]"
                style={{ fontSize: "18px" }}
                aria-hidden="true"
            >
                person_search
            </span>
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or phone…"
                className="w-full pl-10 pr-3 py-3 bg-[#f2f4f6] border-none rounded-xl text-sm font-medium text-[#191c1e] focus:ring-2 focus:ring-[#004ac6]/20"
            />

            {open && (
                <div className="absolute z-10 mt-2 w-full bg-white border border-[#c3c6d7]/40 rounded-xl shadow-lg max-h-72 overflow-y-auto">
                    {loading && (
                        <div className="px-4 py-3 text-xs text-[#737686]">Searching…</div>
                    )}
                    {!loading && results.length === 0 && (
                        <div className="px-4 py-3 text-xs text-[#737686]">
                            No patients matched.
                        </div>
                    )}
                    {results.map((p) => (
                        <button
                            key={p._id}
                            type="button"
                            onClick={() => {
                                onSelect({
                                    _id: p._id,
                                    displayName: p.displayName || p.name,
                                    name: p.displayName || p.name,
                                    phone: p.phone,
                                    email: p.email,
                                });
                                setOpen(false);
                                setQuery("");
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-[#f6f7fb] transition-colors border-b border-[#c3c6d7]/20 last:border-b-0"
                        >
                            <div className="text-sm font-medium text-[#0f172a]">
                                {p.displayName || p.name}
                            </div>
                            <div className="text-xs text-[#737686]">
                                {p.phone || p.email || "—"}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
