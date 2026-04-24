/**
 * SupportConfigPage.jsx — Per-Org Support Configuration (Plan E14)
 *
 * Configures the SupportSettings singleton:
 *   - SLA hours by priority (CRITICAL / HIGH / MEDIUM / LOW, 1–720)
 *   - Escalation targets (up to 5, level 1–5, role or email)
 *   - Allowed ticket categories
 *   - Auto-close after N days (1–365)
 *   - Tickets-per-day cap (1–10000)
 *   - Reopen window (0–90 days)
 *
 * NOT the ticket list/create — that lives at SupportPage.jsx.
 *
 * Version-guarded PATCH via useSupportConfig. Permission: support.write.
 *
 * @module modules/org/settings/pages/SupportConfigPage
 */

import { useState, useMemo } from "react";
import {
    ClockIcon,
    BoltIcon,
    TagIcon,
    CalendarDaysIcon,
    ArrowPathIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    PlusIcon,
    TrashIcon,
} from "@heroicons/react/24/outline";

import SettingsBreadcrumb from "@/components/settings/SettingsBreadcrumb";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { useSupportConfig, usePatchSupportConfig } from "../hooks/useSupportConfig";

const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const KNOWN_CATEGORIES = [
    "technical", "billing", "security", "subscription",
    "dispute", "refund_request", "feature_request", "other",
];

// ── Section wrapper ──────────────────────────────────────────────────────────
// IconCmp is used in JSX below — linter false-positive on aliased destructured
// JSX components.
// eslint-disable-next-line no-unused-vars
function Section({ icon: IconCmp, title, description, children }) {
    return (
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <IconCmp className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-gray-800">{title}</h3>
                    {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
                </div>
            </div>
            <div className="p-6 space-y-4">{children}</div>
        </div>
    );
}

// ═════════════════════════════════════════════════════════════════════════════
export default function SupportConfigPage() {
    const canRead  = useCapability(P.SUPPORT_READ);
    const canWrite = useCapability(P.SUPPORT_WRITE);

    const { data: settings, isLoading, isError, error } = useSupportConfig();
    const patch = usePatchSupportConfig();

    // Reseed form during render when the server version changes
    // (React docs pattern for deriving state from props).
    const [form, setForm] = useState(null);
    const [seededVersion, setSeededVersion] = useState(null);
    const [banner, setBanner] = useState(null);

    if (settings && settings.version !== seededVersion) {
        setSeededVersion(settings.version ?? 0);
        setForm(cloneForm(settings));
    }

    const dirty = useMemo(() => {
        if (!form || !settings) return false;
        return JSON.stringify(cloneForm(settings)) !== JSON.stringify(form);
    }, [form, settings]);

    if (!canRead) {
        return (
            <div className="p-8">
                <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
                    <p className="text-sm text-red-600 font-medium">
                        You don't have permission to view support configuration.
                    </p>
                </div>
            </div>
        );
    }

    if (isLoading || !form) {
        return (
            <div className="p-8 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    if (isError) {
        return (
            <div className="p-8">
                <div className="rounded-2xl bg-red-50 border border-red-200 p-6">
                    <p className="text-sm text-red-600 font-semibold">Failed to load support configuration.</p>
                    <p className="text-xs text-red-500 mt-1">{error?.message || "Unknown error."}</p>
                </div>
            </div>
        );
    }

    // ── Submit ───────────────────────────────────────────────────────────
    const handleSave = async () => {
        setBanner(null);
        const payload = buildPatchPayload(settings, form);
        if (!payload) {
            setBanner({ type: "error", text: "Nothing to save." });
            return;
        }
        payload.expectedVersion = settings.version ?? 0;

        try {
            await patch.mutateAsync(payload);
            setBanner({ type: "success", text: "Support configuration saved." });
        } catch (err) {
            const code = err?.response?.data?.error?.code;
            if (code === "VERSION_CONFLICT") {
                setBanner({
                    type: "conflict",
                    text: "These settings were updated elsewhere — we reloaded the latest version. Please review and retry.",
                });
                return;
            }
            if (code === "VALIDATION_ERROR") {
                const details = err?.response?.data?.error?.details;
                const first = Array.isArray(details) && details[0]?.message;
                setBanner({ type: "error", text: first || "Invalid configuration." });
                return;
            }
            setBanner({ type: "error", text: err?.response?.data?.error?.message || "Failed to save." });
        }
    };

    return (
        <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
            <SettingsBreadcrumb current="Support Configuration" />

            <header>
                <h1 className="text-2xl font-bold text-gray-800">Support Configuration</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Configure SLA deadlines, escalation targets, and ticket policies for your organization.
                </p>
                <p className="text-[11px] text-gray-400 mt-1">Version {settings.version ?? 0}</p>
            </header>

            {banner && (
                <div
                    className={`rounded-xl px-4 py-3 text-sm flex items-start gap-2 border ${
                        banner.type === "success"
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : banner.type === "conflict"
                                ? "bg-amber-50 border-amber-200 text-amber-700"
                                : "bg-red-50 border-red-200 text-red-600"
                    }`}
                >
                    {banner.type === "success" ? (
                        <CheckCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    ) : (
                        <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    )}
                    <span>{banner.text}</span>
                </div>
            )}

            {/* ── SLA Hours by Priority ─────────────────────────────────── */}
            <Section
                icon={ClockIcon}
                title="SLA Hours by Priority"
                description="Hours from ticket creation until the SLA deadline is breached. 1–720 (up to 30 days)."
            >
                <div className="grid grid-cols-4 gap-4">
                    {PRIORITIES.map((p) => (
                        <div key={p}>
                            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">{p}</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    min={1}
                                    max={720}
                                    value={form.slaHoursByPriority[p]}
                                    disabled={!canWrite}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            slaHoursByPriority: {
                                                ...f.slaHoursByPriority,
                                                [p]: parseInt(e.target.value, 10) || 1,
                                            },
                                        }))
                                    }
                                    className="w-full pl-3 pr-10 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">hrs</span>
                            </div>
                        </div>
                    ))}
                </div>
            </Section>

            {/* ── Escalation Targets ────────────────────────────────────── */}
            <Section
                icon={BoltIcon}
                title="Escalation Targets"
                description="Up to 5 escalation tiers. Each target must specify a role or email."
            >
                <div className="space-y-2">
                    {form.escalationTargets.map((target, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <div className="w-20">
                                <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Level</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={5}
                                    value={target.level}
                                    disabled={!canWrite}
                                    onChange={(e) =>
                                        setForm((f) => updateEscalation(f, i, { level: parseInt(e.target.value, 10) || 1 }))
                                    }
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Role</label>
                                <input
                                    type="text"
                                    placeholder="supervisor"
                                    value={target.role || ""}
                                    disabled={!canWrite}
                                    onChange={(e) => setForm((f) => updateEscalation(f, i, { role: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Email</label>
                                <input
                                    type="email"
                                    placeholder="manager@clinic.test"
                                    value={target.email || ""}
                                    disabled={!canWrite}
                                    onChange={(e) => setForm((f) => updateEscalation(f, i, { email: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
                                />
                            </div>
                            <button
                                type="button"
                                disabled={!canWrite}
                                onClick={() => setForm((f) => ({ ...f, escalationTargets: f.escalationTargets.filter((_, j) => j !== i) }))}
                                className="self-end p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-40"
                            >
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                    {canWrite && form.escalationTargets.length < 5 && (
                        <button
                            type="button"
                            onClick={() =>
                                setForm((f) => ({
                                    ...f,
                                    escalationTargets: [
                                        ...f.escalationTargets,
                                        { level: f.escalationTargets.length + 1, role: "", email: "" },
                                    ],
                                }))
                            }
                            className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition pt-1"
                        >
                            <PlusIcon className="w-3.5 h-3.5" /> Add escalation target
                        </button>
                    )}
                </div>
            </Section>

            {/* ── Allowed Categories ────────────────────────────────────── */}
            <Section
                icon={TagIcon}
                title="Allowed Categories"
                description="Ticket categories users can pick when creating a support request."
            >
                <div className="flex flex-wrap gap-2">
                    {KNOWN_CATEGORIES.map((c) => {
                        const selected = form.allowedCategories.includes(c);
                        return (
                            <button
                                key={c}
                                type="button"
                                disabled={!canWrite}
                                onClick={() => setForm((f) => toggleCategory(f, c))}
                                className={`px-3 py-2 rounded-lg text-xs font-semibold border transition ${
                                    selected
                                        ? "bg-blue-600 border-blue-600 text-white"
                                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                                }`}
                            >
                                {c.replace("_", " ")}
                            </button>
                        );
                    })}
                </div>
                {form.allowedCategories.length === 0 && (
                    <p className="text-xs text-red-500">At least one category must remain enabled.</p>
                )}
            </Section>

            {/* ── Scalars ───────────────────────────────────────────────── */}
            <Section icon={CalendarDaysIcon} title="Ticket Policies" description="Lifecycle and throttling settings.">
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                            Auto-close after (days)
                        </label>
                        <input
                            type="number"
                            min={1}
                            max={365}
                            value={form.autoCloseAfterDays}
                            disabled={!canWrite}
                            onChange={(e) => setForm((f) => ({ ...f, autoCloseAfterDays: parseInt(e.target.value, 10) || 1 }))}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">Resolved tickets auto-close after N days of inactivity.</p>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                            Tickets per day cap
                        </label>
                        <input
                            type="number"
                            min={1}
                            max={10000}
                            value={form.ticketsPerDayCap}
                            disabled={!canWrite}
                            onChange={(e) => setForm((f) => ({ ...f, ticketsPerDayCap: parseInt(e.target.value, 10) || 1 }))}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">Org-wide daily ceiling enforced by rate limiter.</p>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                            Reopen window (days)
                        </label>
                        <input
                            type="number"
                            min={0}
                            max={90}
                            value={form.reopenWindowDays}
                            disabled={!canWrite}
                            onChange={(e) => setForm((f) => ({ ...f, reopenWindowDays: parseInt(e.target.value, 10) || 0 }))}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">0 disables reopens entirely.</p>
                    </div>
                </div>
            </Section>

            {/* ── Save bar ──────────────────────────────────────────────── */}
            {canWrite && (
                <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-gray-200 -mx-6 lg:-mx-8 px-6 lg:px-8 py-4 flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                        {dirty ? "You have unsaved changes." : "All changes saved."}
                    </p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            disabled={!dirty || patch.isPending}
                            onClick={() => setForm(cloneForm(settings))}
                            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition disabled:opacity-40"
                        >
                            <ArrowPathIcon className="inline w-4 h-4 mr-1" />
                            Discard
                        </button>
                        <button
                            type="button"
                            disabled={!dirty || patch.isPending || form.allowedCategories.length === 0}
                            onClick={handleSave}
                            className="px-5 py-2.5 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition disabled:opacity-40 flex items-center gap-2"
                        >
                            {patch.isPending && (
                                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            )}
                            {patch.isPending ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════════

function cloneForm(settings) {
    const sla = settings.slaHoursByPriority || {};
    return {
        slaHoursByPriority: {
            CRITICAL: sla.CRITICAL ?? 4,
            HIGH:     sla.HIGH ?? 12,
            MEDIUM:   sla.MEDIUM ?? 24,
            LOW:      sla.LOW ?? 48,
        },
        escalationTargets: Array.isArray(settings.escalationTargets)
            ? settings.escalationTargets.map((t) => ({
                level: t.level ?? 1,
                role: t.role ?? "",
                email: t.email ?? "",
            }))
            : [],
        allowedCategories: Array.isArray(settings.allowedCategories)
            ? [...settings.allowedCategories]
            : [],
        autoCloseAfterDays: settings.autoCloseAfterDays ?? 14,
        ticketsPerDayCap: settings.ticketsPerDayCap ?? 100,
        reopenWindowDays: settings.reopenWindowDays ?? 7,
    };
}

function updateEscalation(f, index, patch) {
    return {
        ...f,
        escalationTargets: f.escalationTargets.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    };
}

function toggleCategory(f, code) {
    const has = f.allowedCategories.includes(code);
    return {
        ...f,
        allowedCategories: has ? f.allowedCategories.filter((c) => c !== code) : [...f.allowedCategories, code],
    };
}

function buildPatchPayload(settings, form) {
    const out = {};
    const server = cloneForm(settings);
    const keys = [
        "slaHoursByPriority",
        "escalationTargets",
        "allowedCategories",
        "autoCloseAfterDays",
        "ticketsPerDayCap",
        "reopenWindowDays",
    ];
    for (const k of keys) {
        if (JSON.stringify(server[k]) !== JSON.stringify(form[k])) {
            // Strip empty role/email to satisfy backend ".refine(role||email)"
            if (k === "escalationTargets") {
                out[k] = form[k].map((t) => {
                    const rec = { level: t.level };
                    if (t.role && t.role.trim()) rec.role = t.role.trim();
                    if (t.email && t.email.trim()) rec.email = t.email.trim();
                    return rec;
                });
                continue;
            }
            out[k] = form[k];
        }
    }
    return Object.keys(out).length ? out : null;
}
