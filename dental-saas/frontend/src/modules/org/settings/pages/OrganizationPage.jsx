/**
 * OrganizationPage.jsx — Clinic Profile + Time & Locale Settings
 * Settings Hub: Organization → General
 *
 * Sections:
 *   1. Clinic Information (name, phone, email, website)
 *   2. Primary Office (address, city, state, zip)
 *   3. Time & Locale (timezone selector, autoDetect toggle, live preview)
 */
import React, { useState, useMemo } from "react";
import {
    HomeIcon,
    MapPinIcon,
    PhoneIcon,
    EnvelopeIcon,
    GlobeAltIcon,
    ClockIcon,
} from "@heroicons/react/24/outline";
import SettingsLayout from "@/components/settings/SettingsLayout";
import { useOrgBranding } from "@/context/OrgBrandingContext";
import { useOrganizationTime } from "@/context/OrgTimeContext";

// ═══════════════════════════════════════════════════════════════════
// Timezone Data — common IANA zones grouped by region
// ═══════════════════════════════════════════════════════════════════
const TIMEZONE_GROUPS = [
    {
        label: "Middle East & Africa",
        zones: [
            { value: "Africa/Cairo",          label: "Cairo (EET, UTC+2)" },
            { value: "Africa/Johannesburg",   label: "Johannesburg (SAST, UTC+2)" },
            { value: "Africa/Nairobi",        label: "Nairobi (EAT, UTC+3)" },
            { value: "Africa/Lagos",          label: "Lagos (WAT, UTC+1)" },
            { value: "Asia/Riyadh",           label: "Riyadh (AST, UTC+3)" },
            { value: "Asia/Dubai",            label: "Dubai (GST, UTC+4)" },
            { value: "Asia/Kuwait",           label: "Kuwait (AST, UTC+3)" },
            { value: "Asia/Beirut",           label: "Beirut (EET, UTC+2/3)" },
            { value: "Asia/Jerusalem",        label: "Jerusalem (IST, UTC+2/3)" },
            { value: "Asia/Baghdad",          label: "Baghdad (AST, UTC+3)" },
            { value: "Asia/Qatar",            label: "Qatar (AST, UTC+3)" },
        ],
    },
    {
        label: "Europe",
        zones: [
            { value: "Europe/London",         label: "London (GMT/BST)" },
            { value: "Europe/Paris",          label: "Paris (CET, UTC+1/2)" },
            { value: "Europe/Berlin",         label: "Berlin (CET, UTC+1/2)" },
            { value: "Europe/Istanbul",       label: "Istanbul (TRT, UTC+3)" },
            { value: "Europe/Moscow",         label: "Moscow (MSK, UTC+3)" },
        ],
    },
    {
        label: "Americas",
        zones: [
            { value: "America/New_York",      label: "New York (ET, UTC-5/4)" },
            { value: "America/Chicago",       label: "Chicago (CT, UTC-6/5)" },
            { value: "America/Los_Angeles",   label: "Los Angeles (PT, UTC-8/7)" },
            { value: "America/Sao_Paulo",     label: "São Paulo (BRT, UTC-3)" },
        ],
    },
    {
        label: "Asia & Pacific",
        zones: [
            { value: "Asia/Kolkata",          label: "India (IST, UTC+5:30)" },
            { value: "Asia/Singapore",        label: "Singapore (SGT, UTC+8)" },
            { value: "Asia/Tokyo",            label: "Tokyo (JST, UTC+9)" },
            { value: "Asia/Shanghai",         label: "Shanghai (CST, UTC+8)" },
            { value: "Australia/Sydney",      label: "Sydney (AEDT, UTC+10/11)" },
        ],
    },
    {
        label: "Universal",
        zones: [
            { value: "UTC",                   label: "UTC (Coordinated Universal Time)" },
        ],
    },
];

// ── Flatten for searching ──────────────────────────────────────────
const ALL_ZONES = TIMEZONE_GROUPS.flatMap(g => g.zones);

// ═══════════════════════════════════════════════════════════════════
// Time & Locale Card
// ═══════════════════════════════════════════════════════════════════
function TimeLocaleCard() {
    const { timezone: orgTz, autoDetectTimezone, updateTimezone } = useOrgBranding();
    const { currentTime, currentDate, timezone: activeTz } = useOrganizationTime() || {};

    const [autoDetect, setAutoDetect]   = useState(autoDetectTimezone ?? true);
    const [selectedTz, setSelectedTz]  = useState(orgTz || "Africa/Cairo");
    const [search, setSearch]          = useState("");
    const [saving, setSaving]          = useState(false);
    const [toast, setToast]            = useState(null);

    // Preview time in selected (not yet saved) timezone
    const previewTime = useMemo(() => {
        const tz = autoDetect
            ? (Intl.DateTimeFormat().resolvedOptions().timeZone || selectedTz)
            : selectedTz;
        try {
            return new Intl.DateTimeFormat("en-US", {
                timeZone: tz,
                weekday: "short",
                month:   "short",
                day:     "numeric",
                year:    "numeric",
                hour:    "2-digit",
                minute:  "2-digit",
                hour12:  true,
            }).format(new Date());
        } catch { return "—"; }
    }, [autoDetect, selectedTz]);

    const filteredGroups = useMemo(() => {
        if (!search.trim()) return TIMEZONE_GROUPS;
        const q = search.toLowerCase();
        return TIMEZONE_GROUPS
            .map(g => ({
                ...g,
                zones: g.zones.filter(z =>
                    z.label.toLowerCase().includes(q) ||
                    z.value.toLowerCase().includes(q)
                ),
            }))
            .filter(g => g.zones.length > 0);
    }, [search]);

    const handleSave = async () => {
        const tzToSave = autoDetect
            ? (Intl.DateTimeFormat().resolvedOptions().timeZone || selectedTz)
            : selectedTz;
        setSaving(true);
        try {
            await updateTimezone(tzToSave, autoDetect);
            setToast({ type: "success", msg: "Timezone saved successfully" });
        } catch {
            setToast({ type: "error", msg: "Failed to save. Please try again." });
        } finally {
            setSaving(false);
            setTimeout(() => setToast(null), 3000);
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 space-y-8">
            {/* Section header */}
            <div>
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <ClockIcon className="w-4 h-4 ml-0.5" />
                    Time & Locale
                </h2>
                <p className="text-sm text-slate-400 mt-1.5">
                    Controls the live clock in the header and time formatting across the system.
                </p>
            </div>

            {/* Live preview banner */}
            <div className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-indigo-50 border border-indigo-100">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <ClockIcon className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                    <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Live Preview</p>
                    <p className="text-base font-bold text-indigo-900 mt-0.5 tabular-nums">{previewTime}</p>
                    <p className="text-xs text-indigo-400 mt-0.5">
                        Active timezone: <span className="font-mono font-semibold">{activeTz || selectedTz}</span>
                    </p>
                </div>
            </div>

            {/* Auto-detect toggle */}
            <div className="flex items-center justify-between py-4 border-b border-gray-50">
                <div>
                    <p className="text-sm font-bold text-slate-700">Auto-detect Timezone</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                        Uses your browser's timezone automatically. Disable to set manually.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setAutoDetect(v => !v)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ${
                        autoDetect ? "bg-indigo-600" : "bg-slate-200"
                    }`}
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                            autoDetect ? "translate-x-6" : "translate-x-1"
                        }`}
                    />
                </button>
            </div>

            {/* Manual timezone selector */}
            <div className={`space-y-4 transition-all ${autoDetect ? "opacity-40 pointer-events-none" : "opacity-100"}`}>
                <label className="block text-sm font-bold text-slate-700">
                    Select Timezone
                </label>

                {/* Search */}
                <div className="relative">
                    <input
                        type="search"
                        placeholder="Search timezone… (e.g. Cairo, London, UTC)"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        disabled={autoDetect}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all placeholder:text-slate-400"
                    />
                </div>

                {/* Grouped dropdown list */}
                <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-100 shadow-inner bg-slate-50 divide-y divide-slate-50">
                    {filteredGroups.map(group => (
                        <div key={group.label}>
                            <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-100 sticky top-0">
                                {group.label}
                            </div>
                            {group.zones.map(zone => (
                                <button
                                    key={zone.value}
                                    type="button"
                                    onClick={() => setSelectedTz(zone.value)}
                                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between ${
                                        selectedTz === zone.value
                                            ? "bg-indigo-50 text-indigo-700 font-semibold"
                                            : "text-slate-600 hover:bg-white"
                                    }`}
                                >
                                    <span>{zone.label}</span>
                                    {selectedTz === zone.value && (
                                        <span className="text-[10px] font-bold text-indigo-400 bg-indigo-50 px-2 py-0.5 rounded-full">Selected</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    ))}
                    {filteredGroups.length === 0 && (
                        <div className="px-4 py-6 text-center text-sm text-slate-400 italic">
                            No timezones found for "{search}"
                        </div>
                    )}
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <div className={`px-4 py-3 rounded-xl text-sm font-semibold ${
                    toast.type === "success"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-red-50 text-red-600 border border-red-200"
                }`}>
                    {toast.msg}
                </div>
            )}

            {/* Save button */}
            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all disabled:opacity-50"
                >
                    {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    {saving ? "Saving…" : "Save Timezone"}
                </button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════
export default function OrganizationPage() {
    return (
        <SettingsLayout
            title="Organization Details"
            description="Manage your clinic's identity, contact information, and time settings."
            breadcrumb="Organization"
        >
            <div className="space-y-8">
                {/* ── Clinic Info ── */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 space-y-10">
                    <div className="space-y-6">
                        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <HomeIcon className="w-4 h-4 ml-0.5" />
                            Clinic Information
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Field label="Legal Entity Name" placeholder="e.g. Test Clinic LLC" />
                            <Field label="Phone Number" placeholder="+x xxx xxx xxxx" icon={PhoneIcon} />
                            <Field label="Email Address" placeholder="office@clinic.com" icon={EnvelopeIcon} />
                            <Field label="Website URL" placeholder="https://clinic.com" icon={GlobeAltIcon} />
                        </div>
                    </div>

                    <hr className="border-gray-50" />

                    <div className="space-y-6">
                        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <MapPinIcon className="w-4 h-4 ml-0.5" />
                            Primary Office
                        </h2>
                        <div className="space-y-6">
                            <Field label="Street Address" placeholder="123 Dental Lane" />
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                                <Field label="City" placeholder="Cairo" />
                                <Field label="State / Province" placeholder="Maadi" />
                                <Field label="Zip Code" placeholder="11728" />
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                        <button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-blue-500/20 transition-all">
                            Save Changes
                        </button>
                    </div>
                </div>

                {/* ── Time & Locale ── */}
                <TimeLocaleCard />

                <div className="h-10" />
            </div>
        </SettingsLayout>
    );
}

function Field({ label, placeholder, icon: Icon }) {
    return (
        <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">{label}</label>
            <div className="relative group">
                <input
                    type="text"
                    placeholder={placeholder}
                    className={`w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all font-sans ${Icon ? "pl-11" : ""}`}
                />
                {Icon && (
                    <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-colors group-focus-within:text-blue-500" />
                )}
            </div>
        </div>
    );
}
