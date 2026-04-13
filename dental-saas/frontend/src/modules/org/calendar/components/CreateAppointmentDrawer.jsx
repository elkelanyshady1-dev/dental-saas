import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { patientsApi } from "../../patients/api/patients.api";
import { appointmentsApi } from "../api/appointments.api";
import { branchesApi } from "../../branches/api/branches.api";
import { formatTime24, durationMins } from "../utils/calendarUtils";

const DURATIONS = [15, 30, 45, 60, 90, 120];

const TREATMENT_TYPES = [
    {
        id: "consultation",
        label: "Consultation",
        icon: "medical_services",
    },
    {
        id: "cleaning",
        label: "Cleaning",
        icon: "clean_hands",
    },
    {
        id: "orthodontics",
        label: "Orthodontics",
        icon: "dentistry",
    },
    {
        id: "emergency",
        label: "Emergency",
        icon: "emergency",
        danger: true,
    },
];

/**
 * CreateAppointmentDrawer.jsx — Scheduling Engine (v13.3)
 * Aligned with OralCare Pro Figma design system.
 */
export default function CreateAppointmentDrawer({
    branches = [],
    practitioners = [],
    initialSelection = {},
    onClose,
    onCreated
}) {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const sel = initialSelection || {};

    // ── Form State ────────────────────────────────────────────────────────────
    const [patient, setPatient]       = useState(null);
    const [branchId, setBranchId]     = useState(sel.branchId || branches[0]?.branchId || "");
    const [doctorId, setDoctorId]     = useState(sel.practitionerId || practitioners[0]?._id || "");
    const [chairId, setChairId]       = useState(sel.chairId || "");
    const [date, setDate]             = useState(
        sel.startTime
            ? new Date(sel.startTime).toISOString().split("T")[0]
            : new Date().toISOString().split("T")[0]
    );
    const [startTime, setStartTime]   = useState(
        sel.startTime ? formatTime24(sel.startTime) : "09:00"
    );
    const [duration, setDuration]     = useState(
        sel.startTime && sel.endTime
            ? durationMins(new Date(sel.startTime), new Date(sel.endTime))
            : 45
    );
    const [type, setType]             = useState("cleaning");
    const [notes, setNotes]           = useState("");
    const [showSuccess, setShowSuccess] = useState(false);
    const [apiError, setApiError]     = useState(null);   // { code, message, isConflict }
    const [pendingForce, setPendingForce] = useState(null); // payload awaiting force=true

    // ── Derived ───────────────────────────────────────────────────────────────
    // ── Data Fetching ─────────────────────────────────────────────────────────
    const { data: branchRes, isLoading: branchLoading } = useQuery({
        queryKey: ["branch", branchId],
        queryFn: () => branchesApi.get(branchId),
        enabled: !!branchId,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
    const branchData = branchRes?.data?.data;

    // Dedicated chairs endpoint — returns only active chairs, with _id normalized server-side
    const { data: chairsRes, isLoading: chairsLoading } = useQuery({
        queryKey: ["branch-chairs", branchId],
        queryFn: () => branchesApi.getChairs(branchId),
        enabled: !!branchId,
        staleTime: 1000 * 60 * 5,
    });

    // ── Derived ───────────────────────────────────────────────────────────────
    const endTime = useMemo(() => {
        const [h, m] = startTime.split(":").map(Number);
        const end = new Date(date);
        end.setHours(h, m + duration, 0, 0);
        return formatTime24(end);
    }, [startTime, duration, date]);

    const activeBranch = branches.find(b => b.branchId === branchId);

    // Resolve chairs: dedicated endpoint (server-filtered) → branchData embedded → calendar prop fallback
    const rawChairsFromEndpoint = chairsRes?.data?.data || chairsRes?.data || [];
    const activeChairsRaw = rawChairsFromEndpoint.length > 0
        ? rawChairsFromEndpoint
        : (branchData?.chairs?.filter(c => c.isActive !== false) || activeBranch?.chairs || []);

    const availableChairs = activeChairsRaw.map(c => ({
        chairId: (c._id || c.id || c.chairId)?.toString(),
        chairName: c.name || c.chairName || "Chair",
    })).filter(c => !!c.chairId);

    const chairsIsLoading = chairsLoading && availableChairs.length === 0;

    // Phase 4 — pre-flight filter: only show doctors that pass ALL 4 validation rules
    // Mirrors backend validatePractitioner so invalid options never enter the dropdown.
    // Backend is still the hard gate — this is UX-only.
    const availableDoctors = practitioners.filter(
        doc =>
            doc.isPractitioner !== false &&              // isPractitioner (default safe: if undefined, allow)
            (doc.hasFullBranchAccess ||
            !branchId ||
            doc.branchAccess?.includes(branchId?.toString()))
    );

    // Auto-select the first chair of the newly selected branch.
    // We depend on branchId and the resolved availableChairs length so the
    // effect fires both on branch change and when the async fetch completes.
    useEffect(() => {
        if (availableChairs.length > 0) {
            // If current chairId is not in the new branch's chair list, reset it.
            const stillValid = availableChairs.some(c => c.chairId === chairId);
            if (!stillValid) {
                setChairId(availableChairs[0].chairId);
            }
        } else {
            setChairId("");
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [branchId, availableChairs.length]);

    // Auto-select first available doctor when branch changes
    useEffect(() => {
        if (!doctorId && availableDoctors.length > 0) {
            setDoctorId(availableDoctors[0]._id);
        }
        // If current doctor no longer available for new branch, clear selection
        if (doctorId && availableDoctors.length > 0) {
            const stillAvailable = availableDoctors.some(d => d._id === doctorId);
            if (!stillAvailable) setDoctorId("");
        }
    }, [branchId, availableDoctors.length]);

    // ── Domain error code → user-friendly message ─────────────────────────────
    const PRACTITIONER_ERROR_MESSAGES = {
        INVALID_PRACTITIONER:          "This user is not registered as a practitioner. Update their profile first.",
        PRACTITIONER_INACTIVE:         "This doctor's account is inactive. Reactivate them before scheduling.",
        PRACTITIONER_NO_SPECIALTY:     "This doctor has no specialty set. Edit their profile and add a specialty.",
        PRACTITIONER_NO_BRANCH_ACCESS: "This doctor does not have access to the selected branch.",
        PRACTITIONER_NOT_FOUND:        "Doctor not found — they may have been deleted.",
        // v32.0 Academic Branch Model
        CARE_TYPE_BRANCH_MISMATCH:     "This patient's care type (Academic/Private) does not match the selected branch type. Change the branch or select a different patient.",
    };

    // ── Mutation ──────────────────────────────────────────────────────────────
    const { mutate: createAppointment, isPending } = useMutation({
        mutationFn: (data) => appointmentsApi.create(data),
        onSuccess: () => {
            setApiError(null);
            setPendingForce(null);
            setShowSuccess(true);
            setTimeout(() => {
                queryClient.invalidateQueries(["appointments"]);
                onCreated?.();
                onClose();
            }, 1200);
        },
        onError: (err) => {
            const res = err?.response;
            const status = res?.status;
            const body = res?.data;

            // ── 409 Scheduling conflict — offer force override ────────────────
            if (status === 409 && body?.warning) {
                const conflictDetail = [];
                if (body.conflicts?.dentist) conflictDetail.push("the selected doctor");
                if (body.conflicts?.chair) conflictDetail.push("the selected chair");
                setApiError({
                    code: "SCHEDULING_CONFLICT",
                    message: `This slot overlaps an existing appointment for ${conflictDetail.join(" and ") || "this resource"}. Override anyway?`,
                    isConflict: true,
                });
                // Store the payload so force=true can replay it
                setPendingForce((prev) => ({ ...prev, force: true }));
                return;
            }

            // ── Structured domain errors (validatePractitioner) ───────────────
            const code = body?.error?.code;
            const backendMsg = body?.error?.message;

            if (code && PRACTITIONER_ERROR_MESSAGES[code]) {
                setApiError({ code, message: PRACTITIONER_ERROR_MESSAGES[code] });
                return;
            }

            // ── Generic fallback ─────────────────────────────────────────────
            setApiError({
                code: "UNKNOWN",
                message: backendMsg || body?.message || "Something went wrong. Please try again.",
            });
        },
    });

    const buildPayload = (force = false) => ({
        patientId: patient._id,
        branchId,
        chairId: chairId || availableChairs[0]?.chairId,
        dentistId: doctorId,
        date,
        startTime,
        duration,
        type,
        notes,
        ...(force ? { force: true } : {}),
    });

    const handleSubmit = (e) => {
        e?.preventDefault();
        setApiError(null);
        if (!patient || !branchId || !doctorId) return;
        createAppointment(buildPayload(false));
    };

    const handleForceCreate = () => {
        setApiError(null);
        createAppointment(buildPayload(true));
    };

    return (
        <div className="fixed inset-0 z-[100] flex justify-end">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-[#191c1e]/20 backdrop-blur-sm transition-opacity duration-300"
                onClick={onClose}
            />

            {/* Drawer Panel */}
            <div className="relative w-full max-w-xl bg-white h-full shadow-[0_12px_32px_-4px_rgba(25,28,30,0.15)] flex flex-col overflow-hidden">

                {/* ── Header ─────────────────────────────────────────────────── */}
                <div className="px-8 py-6 border-b border-[#c3c6d7]/30 flex justify-between items-center flex-shrink-0">
                    <div>
                        <h2 className="font-headline text-2xl font-extrabold text-[#191c1e] tracking-tight">
                            New Appointment
                        </h2>
                        <p className="text-[#434655] text-sm mt-0.5">
                            Schedule a patient visit into the workflow.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="material-symbols-outlined p-2 hover:bg-[#eceef0] rounded-full transition-colors text-[#434655]"
                    >
                        close
                    </button>
                </div>

                {/* ── Scrollable Body ────────────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8 scrollbar-hide">

                    {/* 1 ── Patient Search & Card */}
                    <section className="space-y-4">
                        <label className="block text-sm font-bold text-[#191c1e] tracking-tight">
                            Patient Information
                        </label>

                        <PatientSearch onSelect={setPatient} selectedPatient={patient} />
                    </section>

                    {/* 2 ── Branch, Doctor, Chair */}
                    <section className="grid grid-cols-2 gap-4">
                        {/* Branch */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-[#434655] uppercase tracking-wider">
                                Branch
                            </label>
                            <div className="relative">
                                <select
                                    value={branchId}
                                    onChange={e => setBranchId(e.target.value)}
                                    className="w-full pl-3 pr-10 py-3 bg-[#f2f4f6] border-none rounded-xl appearance-none text-sm font-medium text-[#191c1e] focus:ring-2 focus:ring-[#004ac6]/20 cursor-pointer"
                                >
                                    {branches.length > 0
                                        ? branches.map(b => (
                                            <option key={b.branchId} value={b.branchId}>{b.branchName}</option>
                                        ))
                                        : <option value="">No branches</option>
                                    }
                                </select>
                                <span className="material-symbols-outlined absolute right-3 top-3 text-[#737686] pointer-events-none text-[18px]">
                                    expand_more
                                </span>
                            </div>
                        </div>

                        {/* Doctor */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-[#434655] uppercase tracking-wider">
                                Assigned Doctor
                            </label>
                            <div className="relative">
                                <select
                                    value={doctorId}
                                    onChange={e => setDoctorId(e.target.value)}
                                    disabled={availableDoctors.length === 0}
                                    className="w-full pl-3 pr-10 py-3 bg-[#f2f4f6] border-none rounded-xl appearance-none text-sm font-medium text-[#191c1e] focus:ring-2 focus:ring-[#004ac6]/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {availableDoctors.length > 0 ? (
                                        <>
                                            <option value="">Select Doctor</option>
                                            {availableDoctors.map(doc => (
                                                <option key={doc._id} value={doc._id}>
                                                    Dr. {doc.name}
                                                    {doc.specialty && doc.specialty !== "General Dentist"
                                                        ? ` — ${doc.specialty}`
                                                        : ""}
                                                </option>
                                            ))}
                                        </>
                                    ) : (
                                        <option value="">No doctors for this branch</option>
                                    )}
                                </select>
                                <span className="material-symbols-outlined absolute right-3 top-3 text-[#737686] pointer-events-none text-[18px]">
                                    expand_more
                                </span>
                            </div>
                        </div>

                        {/* Chair Selection */}
                        <div className="space-y-2 col-span-2">
                            <label className="block text-xs font-bold text-[#434655] uppercase tracking-wider">
                                Treatment Chair
                            </label>
                            <div className="flex gap-2 flex-wrap">
                                {chairsIsLoading ? (
                                    /* Loading skeleton while chairs fetch is in-flight */
                                    [1, 2, 3].map(i => (
                                        <div
                                            key={i}
                                            className="flex-1 py-2.5 rounded-lg bg-[#f2f4f6] animate-pulse h-9"
                                        />
                                    ))
                                ) : availableChairs.length > 0 ? (
                                    availableChairs.map(chair => (
                                        <button
                                            key={chair.chairId}
                                            type="button"
                                            onClick={() => setChairId(chair.chairId)}
                                            className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 border-2 ${
                                                chairId === chair.chairId
                                                    ? "border-[#004ac6] bg-[#004ac6]/5 text-[#004ac6]"
                                                    : "border-transparent bg-[#f2f4f6] text-[#434655] hover:bg-[#e6e8ea]"
                                            }`}
                                        >
                                            {chair.chairName}
                                        </button>
                                    ))
                                ) : (
                                    /* No chairs — link navigates within the SPA (no page reload) */
                                    <p className="text-xs text-[#737686] italic py-2">
                                        No chairs configured for this branch.{" "}
                                        <button
                                            type="button"
                                            onClick={() => { onClose(); navigate("/org/branches"); }}
                                            className="text-[#004ac6] underline font-medium hover:opacity-70 transition-opacity"
                                        >
                                            Configure in Branch Settings →
                                        </button>
                                    </p>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* 3 ── Date & Time */}
                    <section className="space-y-4">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-bold text-[#191c1e] tracking-tight">
                                Schedule Timing
                            </label>
                            <span className="text-xs text-[#004ac6] font-bold cursor-pointer hover:opacity-70 transition-opacity">
                                View Availability Grid
                            </span>
                        </div>

                        <div className="grid grid-cols-7 gap-2">
                            <input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="col-span-4 bg-[#f2f4f6] border-none rounded-xl py-3 px-4 text-sm font-medium text-[#191c1e] focus:ring-2 focus:ring-[#004ac6]/20"
                            />
                            <input
                                type="time"
                                value={startTime}
                                onChange={e => setStartTime(e.target.value)}
                                className="col-span-3 bg-[#f2f4f6] border-none rounded-xl py-3 px-4 text-sm font-medium text-[#191c1e] focus:ring-2 focus:ring-[#004ac6]/20"
                            />
                        </div>

                        {/* Duration Chips */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <p className="text-xs font-medium text-[#434655]">Duration</p>
                                <p className="text-xs text-[#737686]">
                                    Ends at <span className="font-bold text-[#191c1e]">{endTime}</span>
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {DURATIONS.map(d => (
                                    <button
                                        key={d}
                                        type="button"
                                        onClick={() => setDuration(d)}
                                        className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                                            duration === d
                                                ? "bg-[#004ac6] text-white font-bold shadow-md"
                                                : "bg-[#eceef0] text-[#434655] hover:bg-[#e6e8ea]"
                                        }`}
                                    >
                                        {d}m
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* 4 ── Treatment Type */}
                    <section className="space-y-3">
                        <label className="block text-sm font-bold text-[#191c1e] tracking-tight">
                            Treatment Type
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            {TREATMENT_TYPES.map(t => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setType(t.id)}
                                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-200 ${
                                        type === t.id
                                            ? "border-[#004ac6] bg-[#004ac6]/5"
                                            : "border-[#c3c6d7]/30 hover:bg-[#f2f4f6]"
                                    }`}
                                >
                                    <span
                                        className="material-symbols-outlined text-[20px]"
                                        style={{
                                            fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                                            color: t.danger
                                                ? (type === t.id ? "#ba1a1a" : "#ba1a1a")
                                                : "#004ac6",
                                        }}
                                    >
                                        {t.icon}
                                    </span>
                                    <span className="text-xs font-bold text-[#191c1e]">{t.label}</span>
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* 5 ── Clinical Notes */}
                    <section className="space-y-2">
                        <label className="block text-sm font-bold text-[#191c1e] tracking-tight">
                            Clinical Notes <span className="text-[#737686] font-normal">(Internal)</span>
                        </label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={3}
                            className="w-full bg-[#f2f4f6] border-none rounded-xl text-sm p-4 text-[#191c1e] placeholder:text-[#737686] focus:ring-2 focus:ring-[#004ac6]/20 resize-none transition-all duration-200"
                            placeholder="Add specific patient needs or pre-op requirements..."
                        />
                    </section>
                </div>

                {/* ── Footer ─────────────────────────────────────────────────── */}
                <div className="px-8 py-6 border-t border-[#c3c6d7]/30 bg-white flex gap-4 flex-shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-4 px-6 rounded-xl border border-[#c3c6d7] font-bold text-[#434655] hover:bg-[#f2f4f6] transition-colors text-sm"
                    >
                        Discard
                    </button>
                    <button
                        type="button"
                        disabled={isPending || !patient}
                        onClick={handleSubmit}
                        className={`flex-[2] py-4 px-6 rounded-xl bg-gradient-to-r from-[#004ac6] to-[#2563eb] text-white font-extrabold flex items-center justify-center gap-3 shadow-lg shadow-[#004ac6]/25 relative overflow-hidden group transition-all duration-300
                            ${(!patient || isPending) ? "opacity-50 cursor-not-allowed" : "hover:shadow-xl hover:shadow-[#004ac6]/30 hover:-translate-y-0.5 active:translate-y-0"}`}
                    >
                        {/* Hover glow */}
                        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />

                        {isPending ? (
                            <>
                                <span className="relative z-10 text-sm">Creating Appointment...</span>
                                <svg className="animate-spin h-5 w-5 text-white z-10 flex-shrink-0" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" fill="currentColor" />
                                </svg>
                            </>
                        ) : (
                            <span className="relative z-10 text-sm">Create Appointment</span>
                        )}
                    </button>
                </div>

                {/* ── API / Domain Error Banner ───────────────────────────────── */}
                {apiError && (
                    <div className={`mx-8 mb-4 rounded-2xl border px-4 py-3.5 flex flex-col gap-2 ${
                        apiError.isConflict
                            ? "bg-amber-50 border-amber-200"
                            : "bg-red-50 border-red-200"
                    }`}>
                        <div className="flex items-start gap-3">
                            <span className={`material-symbols-outlined text-[20px] flex-shrink-0 mt-0.5 ${
                                apiError.isConflict ? "text-amber-500" : "text-red-500"
                            }`}>
                                {apiError.isConflict ? "warning" : "block"}
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-bold ${
                                    apiError.isConflict ? "text-amber-800" : "text-red-800"
                                }`}>
                                    {apiError.isConflict ? "Scheduling Conflict" : "Cannot Schedule"}
                                </p>
                                <p className={`text-xs mt-0.5 leading-relaxed ${
                                    apiError.isConflict ? "text-amber-700" : "text-red-700"
                                }`}>
                                    {apiError.message}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setApiError(null)}
                                className="material-symbols-outlined text-[16px] text-gray-400 hover:text-gray-600 flex-shrink-0"
                            >
                                close
                            </button>
                        </div>

                        {/* Force override CTA — only for 409 conflicts */}
                        {apiError.isConflict && (
                            <button
                                type="button"
                                disabled={isPending}
                                onClick={handleForceCreate}
                                className="mt-1 w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition-colors disabled:opacity-50"
                            >
                                {isPending ? "Overriding..." : "Override & Create Anyway"}
                            </button>
                        )}
                    </div>
                )}

                {/* ── Success Toast ──────────────────────────────────────────── */}
                {showSuccess && (
                    <div className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-[#191c1e] text-white px-6 py-3 rounded-full flex items-center gap-3 shadow-2xl animate-in slide-in-from-bottom-4 duration-300 whitespace-nowrap">
                        <span
                            className="material-symbols-outlined text-green-400"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                            check_circle
                        </span>
                        <span className="text-sm font-bold">Appointment created!</span>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Patient Search Sub-Component ──────────────────────────────────────────────
function PatientSearch({ onSelect, selectedPatient }) {
    const [query, setQuery]     = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen]       = useState(false);

    useEffect(() => {
        if (query.length < 2) { setResults([]); setOpen(false); return; }
        const timeout = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await patientsApi.search({ q: query });
                setResults(res.data?.data || []);
                setOpen(true);
            } finally { setLoading(false); }
        }, 300);
        return () => clearTimeout(timeout);
    }, [query]);

    // ── Selected State: Patient Card ──────────────────────────────────────────
    if (selectedPatient) {
        return (
            <div className="space-y-3">
                {/* Search bar stays visible to allow change */}
                <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-3.5 text-[#737686] text-[18px]">
                        person_search
                    </span>
                    <input
                        type="text"
                        value={selectedPatient.displayName}
                        readOnly
                        className="w-full pl-12 pr-28 py-3.5 bg-[#f2f4f6] border-none rounded-xl text-sm font-medium text-[#191c1e] focus:ring-2 focus:ring-[#004ac6]/20 cursor-default"
                    />
                    <div className="absolute right-4 top-3 flex items-center gap-2">
                        <span className="bg-[#10b981] text-[10px] font-bold text-white px-2 py-1 rounded-full uppercase tracking-wide">
                            Verified
                        </span>
                    </div>
                </div>

                {/* Patient Card */}
                <div className="bg-[#f2f4f6] rounded-2xl p-5 flex items-center gap-4 border border-[#c3c6d7]/20">
                    <div className="h-14 w-14 rounded-full overflow-hidden bg-[#004ac6]/10 flex items-center justify-center ring-2 ring-white flex-shrink-0">
                        {selectedPatient.avatarUrl
                            ? <img src={selectedPatient.avatarUrl} className="w-full h-full object-cover" alt="" />
                            : <span className="text-xl font-extrabold text-[#004ac6]">{selectedPatient.displayName?.[0]}</span>
                        }
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-[#191c1e] truncate">{selectedPatient.displayName}</h4>
                            {/* v32.0 Academic Care Type badge */}
                            {selectedPatient.careType === "ACADEMIC" && (
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">
                                    🎓 ACADEMIC
                                </span>
                            )}
                        </div>
                        <div className="flex gap-4 mt-1 flex-wrap">
                            {selectedPatient.age && (
                                <span className="text-xs text-[#434655] flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[14px]">cake</span>
                                    {selectedPatient.age}y
                                </span>
                            )}
                            {(selectedPatient.phone || selectedPatient.email) && (
                                <span className="text-xs text-[#434655] flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[14px]">call</span>
                                    {selectedPatient.phone || selectedPatient.email}
                                </span>
                            )}
                        </div>
                        {/* v32.0 Academic mismatch pre-flight warning */}
                        {selectedPatient.careType === "ACADEMIC" && (
                            <p className="text-[10px] text-purple-700 font-semibold mt-1.5 flex items-center gap-1">
                                <span>⚠️</span>
                                Academic patient — ensure the selected branch is also Academic, otherwise scheduling will be blocked.
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => onSelect(null)}
                        className="text-[#004ac6] text-xs font-bold hover:underline flex-shrink-0 transition-opacity hover:opacity-70"
                    >
                        Change
                    </button>
                </div>
            </div>
        );
    }

    // ── Empty State: Search Input ─────────────────────────────────────────────
    return (
        <div className="relative">
            <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-3.5 text-[#737686] text-[18px]">
                    person_search
                </span>
                <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search by name, ID or phone..."
                    className="w-full pl-12 pr-4 py-3.5 bg-[#f2f4f6] border-none rounded-xl focus:ring-2 focus:ring-[#004ac6]/20 text-sm font-medium text-[#191c1e] placeholder:text-[#737686] transition-all"
                />
                {loading && (
                    <div className="absolute right-4 top-4 w-4 h-4 border-2 border-[#004ac6]/20 border-t-[#004ac6] rounded-full animate-spin" />
                )}
            </div>

            {/* Dropdown Results */}
            {open && results.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-[#c3c6d7]/30 shadow-lg z-[110] overflow-hidden">
                    {results.map(p => (
                        <button
                            key={p._id}
                            type="button"
                            onClick={() => { onSelect(p); setOpen(false); setQuery(""); }}
                            className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[#f2f4f6] text-left transition-colors border-b border-[#c3c6d7]/20 last:border-none"
                        >
                            <div className="w-9 h-9 rounded-xl bg-[#004ac6]/10 text-[#004ac6] flex items-center justify-center font-bold text-sm flex-shrink-0">
                                {p.displayName?.[0]}
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-[#191c1e] truncate">{p.displayName}</p>
                                <p className="text-xs text-[#737686] truncate">{p.phone || p.email || "No contact"}</p>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* No results */}
            {open && results.length === 0 && !loading && query.length >= 2 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-[#c3c6d7]/30 shadow-lg z-[110] p-6 text-center">
                    <span className="material-symbols-outlined text-[#737686] text-3xl block mb-2">person_off</span>
                    <p className="text-sm font-medium text-[#434655]">No patients found for "<span className="font-bold">{query}</span>"</p>
                </div>
            )}
        </div>
    );
}
