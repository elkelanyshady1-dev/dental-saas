/**
 * InlinePatientEditor.jsx — Autosave Inline Profile Fields
 * v1.0
 *
 * Renders quick-fill cards for fields most commonly missing from
 * incomplete quick-created patient records:
 *   - Date of Birth
 *   - Address
 *   - Emergency Contact (name + phone + relation)
 *   - Insurance (provider + policy number)
 *
 * Each field group:
 *   1. Shows current value (or "Not set") in read mode
 *   2. Switches to edit mode on click
 *   3. Autosaves on blur or Enter key
 *   4. Shows a green ✓ save confirmation for 2s
 *   5. Re-fetches aggregate after save so profileCompletion updates
 *
 * Architecture compliance:
 *   - organizationId NEVER sent from frontend (comes from JWT)
 *   - Uses existing PUT /v1/patient/domain/:id
 */
import { useState, useCallback, useRef } from "react";
import { patientsApi } from "../../../../modules/org/patients/api/patients.api";

// ─── Shared primitives ─────────────────────────────────────────────────────

const SAVED_TOAST_MS = 2000;

function formatDate(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function SaveIndicator({ state }) {
    if (state === "saving")
        return <span className="text-[10px] font-bold text-blue-500 flex items-center gap-1"><div className="w-3 h-3 border border-blue-400/30 border-t-blue-500 rounded-full animate-spin" /> Saving…</span>;
    if (state === "saved")
        return <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">✓ Saved</span>;
    if (state === "error")
        return <span className="text-[10px] font-bold text-red-500">Save failed</span>;
    return null;
}

// ─── Reusable inline text input field ─────────────────────────────────────

function InlineTextCard({ icon, label, value, placeholder, onSave, type = "text", children }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
    const timerRef = useRef(null);
    const inputRef = useRef(null);

    const startEdit = () => {
        setDraft(value || "");
        setEditing(true);
        setSaveState("idle");
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const handleSave = useCallback(async () => {
        if (draft === (value || "")) { setEditing(false); return; }
        setSaveState("saving");
        try {
            await onSave(draft);
            setSaveState("saved");
            setEditing(false);
            timerRef.current = setTimeout(() => setSaveState("idle"), SAVED_TOAST_MS);
        } catch {
            setSaveState("error");
        }
    }, [draft, value, onSave]);

    const handleKeyDown = (e) => {
        if (e.key === "Enter") handleSave();
        if (e.key === "Escape") { setEditing(false); setSaveState("idle"); }
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 hover:border-slate-200 transition-all group shadow-sm">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className="text-base">{icon}</span>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
                </div>
                <SaveIndicator state={saveState} />
            </div>

            {editing ? (
                <div className="flex gap-2">
                    {children ? children({ draft, setDraft, handleKeyDown, ref: inputRef }) : (
                        <input
                            ref={inputRef}
                            type={type}
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={handleSave}
                            placeholder={placeholder}
                            className="flex-1 text-sm font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                        />
                    )}
                    <button
                        onMouseDown={e => { e.preventDefault(); handleSave(); }}
                        className="px-3 py-2 text-xs font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all flex-shrink-0"
                    >
                        ✓
                    </button>
                </div>
            ) : (
                <button
                    onClick={startEdit}
                    className="w-full text-left"
                >
                    {value ? (
                        <p className="text-sm font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">
                            {type === "date" ? formatDate(value) : value}
                        </p>
                    ) : (
                        <p className="text-sm font-medium text-slate-300 italic group-hover:text-blue-400 transition-colors">
                            {placeholder || "Click to add…"}
                        </p>
                    )}
                </button>
            )}
        </div>
    );
}

// ─── Emergency Contact Card ────────────────────────────────────────────────

function EmergencyContactCard({ value = {}, onSave }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState({ name: "", phone: "", relation: "" });
    const [saveState, setSaveState] = useState("idle");

    const startEdit = () => {
        setDraft({ name: value.name || "", phone: value.phone || "", relation: value.relation || "" });
        setEditing(true);
        setSaveState("idle");
    };

    const handleSave = async () => {
        if (!draft.name && !draft.phone) { setEditing(false); return; }
        setSaveState("saving");
        try {
            await onSave(draft);
            setSaveState("saved");
            setEditing(false);
            setTimeout(() => setSaveState("idle"), SAVED_TOAST_MS);
        } catch {
            setSaveState("error");
        }
    };

    const hasContact = value.name || value.phone;

    return (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 hover:border-slate-200 transition-all group shadow-sm">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className="text-base">🚨</span>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Emergency Contact</span>
                </div>
                <SaveIndicator state={saveState} />
            </div>

            {editing ? (
                <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            autoFocus
                            type="text"
                            placeholder="Contact name"
                            value={draft.name}
                            onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
                            className="text-sm font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 w-full"
                        />
                        <input
                            type="tel"
                            placeholder="Phone number"
                            value={draft.phone}
                            onChange={e => setDraft(p => ({ ...p, phone: e.target.value }))}
                            className="text-sm font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 w-full"
                        />
                    </div>
                    <div className="flex gap-2">
                        <select
                            value={draft.relation}
                            onChange={e => setDraft(p => ({ ...p, relation: e.target.value }))}
                            className="flex-1 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        >
                            <option value="">Relationship…</option>
                            <option value="spouse">Spouse</option>
                            <option value="parent">Parent</option>
                            <option value="child">Child</option>
                            <option value="sibling">Sibling</option>
                            <option value="friend">Friend</option>
                            <option value="other">Other</option>
                        </select>
                        <button
                            onClick={handleSave}
                            className="px-4 py-2 text-xs font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all flex-shrink-0"
                        >
                            Save
                        </button>
                        <button
                            onClick={() => { setEditing(false); setSaveState("idle"); }}
                            className="px-3 py-2 text-xs font-semibold text-slate-500 rounded-xl hover:bg-slate-100 transition-all"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <button onClick={startEdit} className="w-full text-left">
                    {hasContact ? (
                        <div className="space-y-0.5">
                            <p className="text-sm font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">{value.name}</p>
                            <p className="text-xs text-slate-400">{value.phone}{value.relation ? ` · ${value.relation}` : ""}</p>
                        </div>
                    ) : (
                        <p className="text-sm font-medium text-slate-300 italic group-hover:text-blue-400 transition-colors">Click to add emergency contact…</p>
                    )}
                </button>
            )}
        </div>
    );
}

// ─── Insurance Card ────────────────────────────────────────────────────────

function InsuranceCard({ value = {}, onSave }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState({ provider: "", policyNumber: "" });
    const [saveState, setSaveState] = useState("idle");

    const startEdit = () => {
        setDraft({ provider: value.provider || "", policyNumber: value.policyNumber || "" });
        setEditing(true);
        setSaveState("idle");
    };

    const handleSave = async () => {
        setSaveState("saving");
        try {
            await onSave(draft);
            setSaveState("saved");
            setEditing(false);
            setTimeout(() => setSaveState("idle"), SAVED_TOAST_MS);
        } catch {
            setSaveState("error");
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 hover:border-slate-200 transition-all group shadow-sm">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className="text-base">🛡️</span>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Insurance</span>
                </div>
                <SaveIndicator state={saveState} />
            </div>

            {editing ? (
                <div className="space-y-2">
                    <input
                        autoFocus
                        type="text"
                        placeholder="Insurance provider name"
                        value={draft.provider}
                        onChange={e => setDraft(p => ({ ...p, provider: e.target.value }))}
                        className="text-sm font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-full"
                    />
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Policy number"
                            value={draft.policyNumber}
                            onChange={e => setDraft(p => ({ ...p, policyNumber: e.target.value }))}
                            className="flex-1 text-sm font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        />
                        <button
                            onClick={handleSave}
                            className="px-4 py-2 text-xs font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all flex-shrink-0"
                        >
                            Save
                        </button>
                        <button
                            onClick={() => { setEditing(false); setSaveState("idle"); }}
                            className="px-3 py-2 text-xs font-semibold text-slate-500 rounded-xl hover:bg-slate-100 transition-all"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <button onClick={startEdit} className="w-full text-left">
                    {value.provider ? (
                        <div className="space-y-0.5">
                            <p className="text-sm font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">{value.provider}</p>
                            {value.policyNumber && <p className="text-xs text-slate-400">Policy: {value.policyNumber}</p>}
                        </div>
                    ) : (
                        <p className="text-sm font-medium text-slate-300 italic group-hover:text-blue-400 transition-colors">Click to add insurance…</p>
                    )}
                </button>
            )}
        </div>
    );
}

// ─── Main Export ───────────────────────────────────────────────────────────

/**
 * InlinePatientEditor
 *
 * Props:
 *   patientId      string
 *   core           { dob, address, emergencyContact, insurance, version, ... }
 *   onRefresh      () => void — re-fetch aggregate after any save
 */
export default function InlinePatientEditor({ patientId, core, onRefresh }) {
    const save = useCallback(async (fields) => {
        await patientsApi.update(patientId, {
            ...fields,
            expectedVersion: core.version,
        });
        onRefresh?.();
    }, [patientId, core.version, onRefresh]);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                </div>
                <div>
                    <p className="text-sm font-bold text-slate-700">Quick Fill</p>
                    <p className="text-[11px] text-slate-400">Click any field to edit — saves automatically</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Date of Birth */}
                <InlineTextCard
                    icon="🎂"
                    label="Date of Birth"
                    value={core.dob}
                    placeholder="Select date of birth"
                    type="date"
                    onSave={(v) => save({ dateOfBirth: v })}
                />

                {/* Address */}
                <InlineTextCard
                    icon="📍"
                    label="Address"
                    value={core.address}
                    placeholder="Enter full address…"
                    onSave={(v) => save({ address: v })}
                />

                {/* Emergency Contact */}
                <EmergencyContactCard
                    value={core.emergencyContact}
                    onSave={(v) => save({ emergencyContact: v })}
                />

                {/* Insurance */}
                <InsuranceCard
                    value={core.insurance}
                    onSave={(v) => save({ insurance: v })}
                />
            </div>
        </div>
    );
}
