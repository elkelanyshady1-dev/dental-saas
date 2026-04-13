/**
 * CalendarSettingsPage.jsx — Clinical Scheduling Settings
 *
 * Sections:
 *   1. Workspace Defaults  (default view, clinic, start/end hour, slot interval)
 *   2. Status Indicators   (color swatches per appointment status)
 *   3. Weekly Availability (day rows with start/end times + breaks)
 *   4. Notification Channels (email, SMS, desktop push toggles)
 *   5. Alert Triggers      (per-event toggles grid)
 *   6. Quiet Hours         (time range, override)
 *   7. Chair Assignments   (branch + operatory selection)
 *
 * Architecture:
 *   useState-driven local settings object (no API calls — settings persistence
 *   would come from a useSaveCalendarSettings mutation in a follow-up phase).
 *   Permission: appointments.read (calendar module)
 *   DTO: N/A (local form state only; save button wired to mutation stub)
 *
 * Design System: "Clinical Curator" — surface tokens, Manrope/Inter, no raw borders.
 *
 * @module modules/org/calendar/pages/CalendarSettingsPage
 */

import { useState } from "react";

// ─── Design tokens ────────────────────────────────────────────────────────────
const STATUS_CONFIG = [
    { key: "open",        label: "Open",        color: "#c3c6d7", textColor: "text-[#737686]",    name: "Slate"   },
    { key: "confirmed",   label: "Confirmed",   color: "#3b82f6", textColor: "text-blue-600",     name: "Blue"    },
    { key: "checked_in",  label: "Checked In",  color: "#10b981", textColor: "text-emerald-600",  name: "Emerald" },
    { key: "in_progress", label: "In Progress", color: "#6366f1", textColor: "text-indigo-600",   name: "Indigo"  },
    { key: "completed",   label: "Completed",   color: "#64748b", textColor: "text-slate-600",    name: "Slate"   },
    { key: "delayed",     label: "Delayed",     color: "#f59e0b", textColor: "text-amber-600",    name: "Amber"   },
    { key: "postponed",   label: "Postponed",   color: "#f97316", textColor: "text-orange-600",   name: "Orange"  },
    { key: "canceled",    label: "Canceled",    color: "#ef4444", textColor: "text-red-600",      name: "Red"     },
    { key: "no_show",     label: "No Show",     color: "#7f1d1d", textColor: "text-red-900",      name: "Dark Red"},
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const NAV_ITEMS = [
    { id: "workspace",      label: "Workspace Defaults", icon: "domain"             },
    { id: "availability",   label: "Availability",        icon: "event_available"    },
    { id: "status",         label: "Status Indicators",   icon: "palette"            },
    { id: "notifications",  label: "Notifications",       icon: "notifications_active"},
    { id: "quiet",          label: "Quiet Hours",         icon: "bedtime"            },
    { id: "chairs",         label: "Chair Assignments",   icon: "chair"              },
];

// ─── Toggle component ─────────────────────────────────────────────────────────
function Toggle({ checked, onChange, id }) {
    return (
        <button
            id={id}
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#004ac6]/40
                ${checked ? "bg-[#004ac6]" : "bg-[#e0e3e5]"}`}
        >
            <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200
                    ${checked ? "translate-x-6" : "translate-x-1"}`}
            />
        </button>
    );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ id, icon, title, subtitle, children }) {
    return (
        <section
            id={id}
            className="bg-white rounded-2xl border border-[#c3c6d7]/10 shadow-[0_12px_32px_-4px_rgba(25,28,30,0.06)] overflow-hidden"
        >
            <div className="px-8 py-6 bg-[#f2f4f6]/40 border-b border-[#c3c6d7]/10 flex items-center gap-4">
                <div className="w-9 h-9 rounded-xl bg-[#004ac6]/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[#004ac6] text-xl">{icon}</span>
                </div>
                <div>
                    <h2 className="text-base font-extrabold text-[#191c1e] font-headline">{title}</h2>
                    {subtitle && <p className="text-xs text-[#737686] mt-0.5">{subtitle}</p>}
                </div>
            </div>
            <div className="p-8">{children}</div>
        </section>
    );
}

// ─── Field label ──────────────────────────────────────────────────────────────
function FieldLabel({ children }) {
    return (
        <label className="block text-[10px] font-black text-[#737686] uppercase tracking-widest mb-2">
            {children}
        </label>
    );
}

// ─── Select field ──────────────────────────────────────────────────────────────
function SelectField({ value, onChange, children, id }) {
    return (
        <div className="relative">
            <select
                id={id}
                value={value}
                onChange={e => onChange(e.target.value)}
                className="w-full appearance-none bg-[#f2f4f6] border-none rounded-xl py-3 pl-4 pr-10 text-sm font-semibold text-[#191c1e] focus:outline-none focus:ring-2 focus:ring-[#004ac6]/20 cursor-pointer transition-colors hover:bg-[#eceef0]"
            >
                {children}
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[#737686] text-base pointer-events-none">
                expand_more
            </span>
        </div>
    );
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export default function CalendarSettingsPage() {
    const [activeNav, setActiveNav]   = useState("workspace");
    const [saved, setSaved]           = useState(false);

    // ── Workspace defaults ──────────────────────────────────────────────────
    const [defaults, setDefaults] = useState({
        clinic:     "Downtown Clinic",
        view:       "Week",
        startHour:  "08:00",
        endHour:    "19:00",
        slotMins:   "15",
    });

    // ── Availability ────────────────────────────────────────────────────────
    const [schedule, setSchedule] = useState(
        DAYS.map((day, i) => ({
            day,
            active: i < 5,
            start:  "08:00",
            end:    i === 2 ? "13:00" : "17:00", // Wednesday half-day
        }))
    );
    const [breaks, setBreaks] = useState([
        { id: 1, label: "Staff Lunch Break", from: "12:30", to: "13:30", days: [0,1,3,4] },
    ]);

    // ── Notifications ───────────────────────────────────────────────────────
    const [channels, setChannels] = useState({
        email:   true,
        sms:     false,
        desktop: true,
    });
    const [triggers, setTriggers] = useState({
        booked:       true,
        rescheduled:  true,
        cancelled:    true,
        checked_in:   true,
        no_show:      true,
        reminder:     true,
        confirmation: true,
        arrival:      true,
    });
    const [remindBuffer, setRemindBuffer] = useState("48h");

    // ── Quiet Hours ─────────────────────────────────────────────────────────
    const [quiet, setQuiet] = useState({
        active:       true,
        from:         "20:00",
        to:           "07:00",
        emergencyOverride: true,
    });

    // ── Chair assignments ───────────────────────────────────────────────────
    const [branch,       setBranch]       = useState("Northside Medical Center");
    const [selectedChair, setSelectedChair] = useState("CH-04");
    const [autoAssign,   setAutoAssign]   = useState(true);

    // ── Save stub ───────────────────────────────────────────────────────────
    function handleSave() {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    }

    // ─── Day schedule row ─────────────────────────────────────────────────
    function DayRow({ row, index }) {
        function update(field, val) {
            setSchedule(s => s.map((r, i) => i === index ? { ...r, [field]: val } : r));
        }
        return (
            <div
                className={`flex items-center gap-4 p-4 rounded-xl transition-colors group
                    ${row.active ? "hover:bg-[#f7f9fb]" : "opacity-40"}`}
            >
                {/* Day toggle */}
                <div className="flex items-center gap-3 w-36 flex-shrink-0">
                    <Toggle
                        id={`day-toggle-${index}`}
                        checked={row.active}
                        onChange={v => update("active", v)}
                    />
                    <span className={`text-sm font-bold ${row.active ? "text-[#191c1e]" : "text-[#737686]"}`}>
                        {row.day}
                    </span>
                </div>

                {/* Time range */}
                {row.active ? (
                    <div className="flex items-center gap-3 flex-1">
                        <div className="flex items-center bg-[#f2f4f6] rounded-xl px-4 py-2.5 gap-2">
                            <span className="text-[10px] font-black text-[#737686] uppercase">Start</span>
                            <input
                                type="time"
                                value={row.start}
                                onChange={e => update("start", e.target.value)}
                                className="bg-transparent border-none p-0 text-sm font-bold text-[#191c1e] focus:ring-0 w-20"
                            />
                        </div>
                        <div className="w-4 h-px bg-[#c3c6d7]" />
                        <div className="flex items-center bg-[#f2f4f6] rounded-xl px-4 py-2.5 gap-2">
                            <span className="text-[10px] font-black text-[#737686] uppercase">End</span>
                            <input
                                type="time"
                                value={row.end}
                                onChange={e => update("end", e.target.value)}
                                className="bg-transparent border-none p-0 text-sm font-bold text-[#191c1e] focus:ring-0 w-20"
                            />
                        </div>
                        <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                title="Copy to all active days"
                                onClick={() => setSchedule(s => s.map(r => r.active ? { ...r, start: row.start, end: row.end } : r))}
                                className="p-2 text-[#737686] hover:text-[#004ac6] rounded-lg hover:bg-[#004ac6]/5 transition-colors"
                            >
                                <span className="material-symbols-outlined text-lg">content_copy</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <p className="text-xs text-[#737686] italic flex-1">Day off</p>
                )}
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-[#f7f9fb]">

            {/* ── Left Settings Nav ──────────────────────────────────────────── */}
            <aside className="w-64 flex-shrink-0 sticky top-0 h-screen flex flex-col bg-white border-r border-[#c3c6d7]/15 shadow-[4px_0_24px_-4px_rgba(25,28,30,0.04)]">
                <div className="px-6 pt-8 pb-6 border-b border-[#c3c6d7]/10">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-8 h-8 rounded-lg bg-[#004ac6] flex items-center justify-center">
                            <span className="material-symbols-outlined text-white text-base">event_repeat</span>
                        </div>
                        <h1 className="text-lg font-extrabold text-[#191c1e] font-headline leading-tight">Calendar Settings</h1>
                    </div>
                    <p className="text-[10px] text-[#737686] ml-11">Clinical scheduling preferences</p>
                </div>

                <nav className="flex-1 py-4 space-y-0.5 px-3 overflow-y-auto">
                    {NAV_ITEMS.map(item => (
                        <button
                            key={item.id}
                            id={`nav-${item.id}`}
                            onClick={() => {
                                setActiveNav(item.id);
                                document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all text-left
                                ${activeNav === item.id
                                    ? "bg-[#004ac6]/8 text-[#004ac6] font-bold"
                                    : "text-[#434655] hover:bg-[#f2f4f6] font-medium"
                                }`}
                        >
                            <span
                                className="material-symbols-outlined text-xl"
                                style={activeNav === item.id ? { fontVariationSettings: "'FILL' 1" } : {}}
                            >
                                {item.icon}
                            </span>
                            {item.label}
                        </button>
                    ))}
                </nav>

                {/* Save CTA */}
                <div className="p-4 border-t border-[#c3c6d7]/10">
                    <button
                        id="save-settings-btn"
                        onClick={handleSave}
                        className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2
                            ${saved
                                ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                                : "bg-[#004ac6] text-white shadow-lg shadow-[#004ac6]/25 hover:bg-[#003ea8]"
                            }`}
                    >
                        <span className="material-symbols-outlined text-base">
                            {saved ? "check_circle" : "save"}
                        </span>
                        {saved ? "Saved!" : "Save Changes"}
                    </button>
                    <button
                        id="discard-settings-btn"
                        className="w-full mt-2 py-2.5 rounded-xl text-sm text-[#737686] hover:text-[#191c1e] font-medium transition-colors"
                    >
                        Discard
                    </button>
                </div>
            </aside>

            {/* ── Main Content ───────────────────────────────────────────────── */}
            <main className="flex-1 overflow-y-auto">
                <div className="max-w-4xl mx-auto px-8 py-10 space-y-8">

                    {/* Page header */}
                    <header className="mb-2">
                        <h1 className="text-3xl font-extrabold text-[#191c1e] font-headline tracking-tight">
                            Calendar Settings
                        </h1>
                        <p className="text-sm text-[#737686] mt-1.5">
                            Customize how your clinical schedule operates and communicates.
                        </p>
                        {/* Last saved indicator */}
                        <p className="text-[10px] text-[#c3c6d7] mt-1 font-medium">
                            Last synced: Today at 09:42 AM · Workspace ID: STJ-992-KLD
                        </p>
                    </header>

                    {/* ── 1. Workspace Defaults ─────────────────────────────────── */}
                    <Section id="workspace" icon="domain" title="Workspace Defaults" subtitle="Default view, clinic, and operating hours">
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <FieldLabel>Default Clinic</FieldLabel>
                                <SelectField
                                    id="default-clinic"
                                    value={defaults.clinic}
                                    onChange={v => setDefaults(d => ({ ...d, clinic: v }))}
                                >
                                    <option>Downtown Clinic</option>
                                    <option>North Branch</option>
                                    <option>Northside Medical Center</option>
                                </SelectField>
                            </div>
                            <div>
                                <FieldLabel>Default Calendar View</FieldLabel>
                                <SelectField
                                    id="default-view"
                                    value={defaults.view}
                                    onChange={v => setDefaults(d => ({ ...d, view: v }))}
                                >
                                    <option value="Day">Day</option>
                                    <option value="Week">Week</option>
                                    <option value="Month">Month</option>
                                </SelectField>
                            </div>
                            <div>
                                <FieldLabel>Operating Start Hour</FieldLabel>
                                <SelectField
                                    id="start-hour"
                                    value={defaults.startHour}
                                    onChange={v => setDefaults(d => ({ ...d, startHour: v }))}
                                >
                                    {["07:00","08:00","09:00"].map(h => (
                                        <option key={h} value={h}>{h}</option>
                                    ))}
                                </SelectField>
                            </div>
                            <div>
                                <FieldLabel>Operating End Hour</FieldLabel>
                                <SelectField
                                    id="end-hour"
                                    value={defaults.endHour}
                                    onChange={v => setDefaults(d => ({ ...d, endHour: v }))}
                                >
                                    {["17:00","18:00","19:00","20:00"].map(h => (
                                        <option key={h} value={h}>{h}</option>
                                    ))}
                                </SelectField>
                            </div>
                            <div>
                                <FieldLabel>Appointment Slot Interval</FieldLabel>
                                <SelectField
                                    id="slot-interval"
                                    value={defaults.slotMins}
                                    onChange={v => setDefaults(d => ({ ...d, slotMins: v }))}
                                >
                                    <option value="10">10 minutes</option>
                                    <option value="15">15 minutes</option>
                                    <option value="20">20 minutes</option>
                                    <option value="30">30 minutes</option>
                                </SelectField>
                            </div>
                        </div>
                    </Section>

                    {/* ── 2. Weekly Availability ────────────────────────────────── */}
                    <Section id="availability" icon="event_available" title="Weekly Availability" subtitle="Configure clinical hours and recurring breaks per day">
                        <div className="space-y-1 mb-6">
                            {schedule.map((row, i) => (
                                <DayRow key={row.day} row={row} index={i} />
                            ))}
                        </div>

                        {/* Recurring Breaks */}
                        <div className="border-t border-[#c3c6d7]/15 pt-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <p className="text-sm font-bold text-[#191c1e]">Recurring Breaks</p>
                                    <p className="text-xs text-[#737686]">Applied consistently across selected days</p>
                                </div>
                                <button
                                    id="add-break-btn"
                                    onClick={() => setBreaks(b => [...b, {
                                        id: Date.now(),
                                        label: "New Break",
                                        from: "12:00",
                                        to:   "13:00",
                                        days: [0,1,2,3,4],
                                    }])}
                                    className="flex items-center gap-1.5 text-[#004ac6] text-xs font-bold bg-[#004ac6]/5 px-3 py-2 rounded-lg hover:bg-[#004ac6]/10 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-base">add</span>
                                    Add Break
                                </button>
                            </div>

                            <div className="space-y-3">
                                {breaks.map((brk, bi) => (
                                    <div
                                        key={brk.id}
                                        className="flex items-center gap-4 bg-[#f2f4f6]/60 rounded-xl px-4 py-3 border border-[#c3c6d7]/10"
                                    >
                                        <span className="material-symbols-outlined text-[#737686] text-lg">coffee</span>
                                        <input
                                            value={brk.label}
                                            onChange={e => setBreaks(b => b.map((x, i) => i === bi ? { ...x, label: e.target.value } : x))}
                                            className="text-sm font-bold bg-transparent border-none focus:ring-0 text-[#191c1e] w-40 p-0"
                                            placeholder="Break label"
                                        />
                                        <div className="flex items-center gap-2 ml-auto">
                                            <div className="bg-white rounded-lg border border-[#c3c6d7]/20 px-3 py-1.5 text-sm font-bold text-[#191c1e]">
                                                {brk.from}
                                            </div>
                                            <span className="text-[#c3c6d7]">—</span>
                                            <div className="bg-white rounded-lg border border-[#c3c6d7]/20 px-3 py-1.5 text-sm font-bold text-[#191c1e]">
                                                {brk.to}
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            {["M","T","W","T","F"].map((d, di) => (
                                                <button
                                                    key={di}
                                                    onClick={() => setBreaks(b => b.map((x, i) => i === bi
                                                        ? { ...x, days: x.days.includes(di) ? x.days.filter(d => d !== di) : [...x.days, di] }
                                                        : x
                                                    ))}
                                                    className={`w-7 h-7 rounded-full text-[10px] font-black transition-colors
                                                        ${brk.days.includes(di)
                                                            ? "bg-[#004ac6] text-white"
                                                            : "bg-[#c3c6d7]/20 text-[#737686] hover:bg-[#c3c6d7]/40"}`}
                                                >
                                                    {d}
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            onClick={() => setBreaks(b => b.filter((_, i) => i !== bi))}
                                            className="text-[#737686] hover:text-[#ba1a1a] transition-colors ml-1"
                                        >
                                            <span className="material-symbols-outlined text-lg">delete</span>
                                        </button>
                                    </div>
                                ))}
                                {breaks.length === 0 && (
                                    <p className="text-xs text-[#c3c6d7] text-center py-4 font-medium">
                                        No recurring breaks configured
                                    </p>
                                )}
                            </div>
                        </div>
                    </Section>

                    {/* ── 3. Status Indicators ──────────────────────────────────── */}
                    <Section id="status" icon="palette" title="Status Indicators" subtitle="Visual color codes for each appointment state on the calendar">
                        <div className="grid grid-cols-3 gap-4">
                            {STATUS_CONFIG.map(s => (
                                <div
                                    key={s.key}
                                    id={`status-${s.key}`}
                                    className="flex items-center justify-between p-4 bg-[#f7f9fb] rounded-xl border border-[#c3c6d7]/10 hover:border-[#004ac6]/20 hover:bg-white cursor-pointer group transition-all"
                                >
                                    <div>
                                        <p className="text-xs font-black text-[#737686] uppercase tracking-wider">{s.label}</p>
                                        <p className={`text-sm font-bold mt-0.5 ${s.textColor}`}>{s.name}</p>
                                    </div>
                                    <div
                                        className="w-8 h-8 rounded-full ring-2 ring-white shadow-md group-hover:scale-110 transition-transform"
                                        style={{ backgroundColor: s.color }}
                                    />
                                </div>
                            ))}
                        </div>
                        <p className="text-[10px] text-[#c3c6d7] mt-4 font-medium">
                            * Custom color picker coming in Phase 15. Colors are currently system-enforced.
                        </p>
                    </Section>

                    {/* ── 4. Notifications ──────────────────────────────────────── */}
                    <Section id="notifications" icon="notifications_active" title="Notifications" subtitle="Configure how you and your patients receive appointment-related alerts">

                        {/* Primary Channels */}
                        <div className="mb-8">
                            <p className="text-xs font-black text-[#737686] uppercase tracking-widest mb-4">Primary Channels</p>
                            <div className="space-y-5">
                                {[
                                    { key: "email",   label: "Email Notifications",  desc: "Appointment summaries and updates via email",           icon: "mail"              },
                                    { key: "sms",     label: "SMS Alerts",           desc: "Real-time text messages for immediate changes",        icon: "sms"               },
                                    { key: "desktop", label: "Desktop Push",         desc: "Browser notifications when you're in the dashboard",   icon: "notifications"     },
                                ].map(ch => (
                                    <div key={ch.key} className="flex items-center justify-between group">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-xl bg-[#f2f4f6] flex items-center justify-center flex-shrink-0">
                                                <span className="material-symbols-outlined text-[#737686] text-lg">{ch.icon}</span>
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-[#191c1e] group-hover:text-[#004ac6] transition-colors">{ch.label}</p>
                                                <p className="text-xs text-[#737686]">{ch.desc}</p>
                                            </div>
                                        </div>
                                        <Toggle
                                            id={`channel-${ch.key}`}
                                            checked={channels[ch.key]}
                                            onChange={v => setChannels(c => ({ ...c, [ch.key]: v }))}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Alert Triggers */}
                        <div className="border-t border-[#c3c6d7]/15 pt-6 mb-8">
                            <p className="text-xs font-black text-[#737686] uppercase tracking-widest mb-4">Alert Triggers</p>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { key: "booked",       label: "New Appointment Booked"   },
                                    { key: "rescheduled",  label: "Appointment Rescheduled"  },
                                    { key: "cancelled",    label: "Appointment Cancelled"     },
                                    { key: "checked_in",   label: "Patient Checked-in"        },
                                    { key: "no_show",      label: "Patient No-Show"           },
                                    { key: "reminder",     label: "Patient Reminders"         },
                                    { key: "confirmation", label: "SMS Confirmation"          },
                                    { key: "arrival",      label: "Patient Arrival Alerts"    },
                                ].map(t => (
                                    <div
                                        key={t.key}
                                        className="flex items-center justify-between p-3.5 bg-[#f7f9fb] rounded-xl border border-transparent hover:border-[#c3c6d7]/20 transition-all"
                                    >
                                        <span className="text-sm font-medium text-[#191c1e]">{t.label}</span>
                                        <Toggle
                                            id={`trigger-${t.key}`}
                                            checked={triggers[t.key]}
                                            onChange={v => setTriggers(tr => ({ ...tr, [t.key]: v }))}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Reminder Buffer */}
                        <div className="border-t border-[#c3c6d7]/15 pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-bold text-[#191c1e]">Patient Reminder Buffer</p>
                                    <p className="text-xs text-[#737686]">How far in advance to send patient reminders</p>
                                </div>
                                <div className="w-44">
                                    <SelectField
                                        id="remind-buffer"
                                        value={remindBuffer}
                                        onChange={setRemindBuffer}
                                    >
                                        <option value="24h">24 hours before</option>
                                        <option value="48h">48 hours before</option>
                                        <option value="1w">1 week before</option>
                                    </SelectField>
                                </div>
                            </div>
                        </div>

                        {/* Info strip */}
                        <div className="mt-6 bg-[#f2f4f6] rounded-xl p-4 flex items-start gap-3">
                            <span className="material-symbols-outlined text-[#495c95] text-lg flex-shrink-0 mt-0.5">info</span>
                            <p className="text-[11px] leading-relaxed text-[#737686]">
                                Changes here affect global notification pipelines for <strong className="text-[#191c1e]">all branches</strong> in your workspace.
                                Staff-level overrides can be configured per practitioner in the Profile module.
                            </p>
                        </div>
                    </Section>

                    {/* ── 5. Quiet Hours ────────────────────────────────────────── */}
                    <Section id="quiet" icon="bedtime" title="Quiet Hours" subtitle="Silence non-urgent notifications during off-duty hours">
                        <div className="grid grid-cols-2 gap-8">
                            <div className="space-y-5">
                                <div className="flex items-center justify-between p-4 bg-[#f2f4f6]/60 rounded-xl">
                                    <div>
                                        <p className="text-sm font-bold text-[#191c1e]">Enable Quiet Hours</p>
                                        <p className="text-xs text-[#737686]">Silence all non-urgent alerts</p>
                                    </div>
                                    <Toggle
                                        id="quiet-active"
                                        checked={quiet.active}
                                        onChange={v => setQuiet(q => ({ ...q, active: v }))}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <FieldLabel>From</FieldLabel>
                                        <input
                                            id="quiet-from"
                                            type="time"
                                            value={quiet.from}
                                            onChange={e => setQuiet(q => ({ ...q, from: e.target.value }))}
                                            disabled={!quiet.active}
                                            className="w-full bg-[#f2f4f6] border-none rounded-xl py-3 px-4 text-sm font-bold text-[#191c1e] focus:ring-2 focus:ring-[#004ac6]/20 disabled:opacity-40"
                                        />
                                    </div>
                                    <div>
                                        <FieldLabel>To</FieldLabel>
                                        <input
                                            id="quiet-to"
                                            type="time"
                                            value={quiet.to}
                                            onChange={e => setQuiet(q => ({ ...q, to: e.target.value }))}
                                            disabled={!quiet.active}
                                            className="w-full bg-[#f2f4f6] border-none rounded-xl py-3 px-4 text-sm font-bold text-[#191c1e] focus:ring-2 focus:ring-[#004ac6]/20 disabled:opacity-40"
                                        />
                                    </div>
                                </div>

                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <input
                                        id="quiet-override"
                                        type="checkbox"
                                        checked={quiet.emergencyOverride}
                                        onChange={e => setQuiet(q => ({ ...q, emergencyOverride: e.target.checked }))}
                                        className="w-4 h-4 rounded text-[#004ac6] border-[#c3c6d7] focus:ring-[#004ac6]/20"
                                    />
                                    <span className="text-sm font-medium text-[#434655] group-hover:text-[#191c1e] transition-colors">
                                        Override for emergency alerts
                                    </span>
                                </label>
                            </div>

                            {/* Visual guide card */}
                            <div className="bg-gradient-to-br from-[#004ac6] to-[#003ea8] rounded-2xl p-6 text-white relative overflow-hidden">
                                <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-white/10 rounded-full blur-xl" />
                                <span className="material-symbols-outlined text-3xl mb-3 block relative z-10">lightbulb</span>
                                <h4 className="font-headline font-bold text-base mb-2 relative z-10">Pro Tip</h4>
                                <p className="text-blue-100 text-xs leading-relaxed relative z-10">
                                    Reducing SMS frequency for routine "New Appointment" events saves costs for high-volume clinics.
                                    Use email for non-urgent confirmations.
                                </p>
                            </div>
                        </div>
                    </Section>

                    {/* ── 6. Chair Assignments ──────────────────────────────────── */}
                    <Section id="chairs" icon="chair" title="Chair Assignments" subtitle="Set your primary operatory and auto-assignment rules">
                        <div className="grid grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div>
                                    <FieldLabel>Primary Branch</FieldLabel>
                                    <SelectField
                                        id="primary-branch"
                                        value={branch}
                                        onChange={setBranch}
                                    >
                                        <option>Northside Medical Center</option>
                                        <option>Downtown Clinic</option>
                                        <option>North Branch</option>
                                    </SelectField>
                                </div>

                                <div>
                                    <FieldLabel>Default Operatory Chair</FieldLabel>
                                    <div className="grid grid-cols-3 gap-3">
                                        {["CH-03","CH-04","CH-05","CH-06","CH-07","CH-08"].map(c => (
                                            <button
                                                key={c}
                                                id={`chair-${c}`}
                                                onClick={() => setSelectedChair(c)}
                                                className={`p-4 rounded-xl border-2 flex flex-col items-center gap-1 transition-all
                                                    ${selectedChair === c
                                                        ? "border-[#004ac6] bg-[#004ac6]/5 shadow-[0_0_0_3px_rgba(0,74,198,0.08)]"
                                                        : "border-[#c3c6d7]/20 bg-[#f7f9fb] hover:border-[#c3c6d7]/40"}`}
                                            >
                                                <span className={`text-lg font-black ${selectedChair === c ? "text-[#004ac6]" : "text-[#737686]"}`}>
                                                    {c}
                                                </span>
                                                <span className={`text-[9px] font-bold uppercase ${selectedChair === c ? "text-[#004ac6]" : "text-[#c3c6d7]"}`}>
                                                    {selectedChair === c ? "Assigned" : "Select"}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 bg-[#f2f4f6]/60 rounded-xl">
                                    <div>
                                        <p className="text-sm font-bold text-[#191c1e]">Auto-Assign Overflow</p>
                                        <p className="text-xs text-[#737686]">Move bookings to next available chair if primary is occupied</p>
                                    </div>
                                    <Toggle
                                        id="auto-assign"
                                        checked={autoAssign}
                                        onChange={setAutoAssign}
                                    />
                                </div>

                                <div className="bg-[#f7f9fb] rounded-xl p-4 border border-[#c3c6d7]/10">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="material-symbols-outlined text-[#004ac6] text-base">info</span>
                                        <span className="text-xs font-bold text-[#191c1e]">Current Assignment</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-[#004ac6]/10 flex items-center justify-center">
                                            <span className="text-sm font-black text-[#004ac6]">{selectedChair}</span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-[#191c1e]">{branch}</p>
                                            <p className="text-[10px] text-emerald-600 font-bold">● Available</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-[#f2f4f6] rounded-xl p-4 border border-[#c3c6d7]/10">
                                    <p className="text-[11px] leading-relaxed text-[#737686]">
                                        System will automatically assign available operatory chairs if the primary is occupied
                                        by maintenance or hygiene when <strong className="text-[#191c1e]">Auto-Assign Overflow</strong> is enabled.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </Section>

                    {/* Footer */}
                    <footer className="flex items-center justify-between py-6 border-t border-[#c3c6d7]/15">
                        <p className="text-xs text-[#c3c6d7] font-medium">
                            Last synced: Today at 09:42 AM · Workspace ID: STJ-992-KLD
                        </p>
                        <div className="flex items-center gap-3">
                            <button
                                id="footer-discard-btn"
                                className="text-sm font-bold text-[#737686] hover:text-[#191c1e] transition-colors px-4 py-2"
                            >
                                Discard Changes
                            </button>
                            <button
                                id="footer-save-btn"
                                onClick={handleSave}
                                className={`text-sm font-bold px-8 py-3 rounded-xl transition-all active:scale-95
                                    ${saved
                                        ? "bg-emerald-500 text-white"
                                        : "bg-[#004ac6] text-white hover:bg-[#003ea8] shadow-[0_4px_16px_-2px_rgba(0,74,198,0.3)]"
                                    }`}
                            >
                                {saved ? "✓ Saved" : "Update Workspace"}
                            </button>
                        </div>
                    </footer>

                </div>
            </main>
        </div>
    );
}
