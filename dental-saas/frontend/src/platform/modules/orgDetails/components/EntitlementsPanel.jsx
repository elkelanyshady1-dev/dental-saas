/**
 * EntitlementsPanel.jsx
 * Sprint 8 — Org Entitlements Viewer
 *
 * Shows which modules an organization is entitled to access,
 * limits from the active plan, and where each entitlement comes from.
 *
 * Props:
 *   orgId  string  — organization ID
 *
 * Endpoint: GET /api/platform/organizations/:orgId/entitlements
 *
 * Response shape (from entitlementResolver.service.js):
 *   { success, data: { modules: { patients: bool, ... }, limits: { maxUsers, maxBranches },
 *                      addons: [], capabilities: { ... }, source? } }
 */
import React, { useEffect, useState, useCallback } from "react";
import {
    Users, BarChart2, Calendar, DollarSign, ShieldCheck,
    Package, Settings, RefreshCw, Loader2, CheckCircle2, XCircle,
    GitBranch, Zap, AlertCircle
} from "lucide-react";
import platformApi from "@/platform/auth/platformApi";
import Card, { CardHeader } from "@/platform/core/ui/Card";

// ─── Module icon map ──────────────────────────────────────────────────────────
const MODULE_ICONS = {
    patients: Users,
    appointments: Calendar,
    finance: DollarSign,
    analytics: BarChart2,
    inventory: Package,
    compliance: ShieldCheck,
    lab: Zap,
    booking: Calendar,
    communication: Settings,
    orthodonticsadv: ShieldCheck,
    settings: Settings,
};

// ─── Source badge ─────────────────────────────────────────────────────────────
const SOURCE_CFG = {
    plan: { label: "Plan", bg: "rgba(16,185,129,0.1)", color: "#10b981", border: "rgba(16,185,129,0.25)" },
    override: { label: "Override", bg: "rgba(139,92,246,0.1)", color: "#8b5cf6", border: "rgba(139,92,246,0.25)" },
    addon: { label: "Add-on", bg: "rgba(59,130,246,0.1)", color: "#3b82f6", border: "rgba(59,130,246,0.25)" },
};

function SourceBadge({ source }) {
    const cfg = SOURCE_CFG[source] || { label: source || "Plan", bg: "rgba(100,116,139,0.1)", color: "#64748b", border: "rgba(100,116,139,0.2)" };
    return (
        <span style={{
            display: "inline-block", padding: "0.15rem 0.55rem",
            borderRadius: "999px", fontSize: "0.65rem", fontWeight: 700,
            letterSpacing: "0.06em", textTransform: "uppercase",
            background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
        }}>
            {cfg.label}
        </span>
    );
}

// ─── Module card ──────────────────────────────────────────────────────────────
function ModuleCard({ name, active, source }) {
    const Icon = MODULE_ICONS[name?.toLowerCase()] || Settings;
    const label = name.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()).trim();

    return (
        <div style={{
            display: "flex", alignItems: "flex-start", gap: "0.75rem",
            padding: "0.875rem", borderRadius: "10px",
            background: active ? "rgba(16,185,129,0.06)" : "rgba(15,23,42,0.4)",
            border: `1px solid ${active ? "rgba(16,185,129,0.2)" : "rgba(71,85,105,0.2)"}`,
            opacity: active ? 1 : 0.6,
            transition: "all 0.15s ease",
        }}>
            <div style={{
                padding: "0.5rem", borderRadius: "8px", flexShrink: 0,
                background: active ? "rgba(16,185,129,0.12)" : "rgba(71,85,105,0.12)",
                border: `1px solid ${active ? "rgba(16,185,129,0.3)" : "rgba(71,85,105,0.2)"}`,
            }}>
                <Icon size={14} style={{ color: active ? "#10b981" : "#64748b" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: active ? "#e2e8f0" : "#64748b" }}>
                        {label}
                    </span>
                    {active
                        ? <CheckCircle2 size={13} style={{ color: "#10b981", flexShrink: 0 }} />
                        : <XCircle size={13} style={{ color: "#334155", flexShrink: 0 }} />
                    }
                </div>
                <div style={{ marginTop: "0.3rem" }}>
                    <SourceBadge source={source} />
                </div>
            </div>
        </div>
    );
}

// ─── Limit card ──────────────────────────────────────────────────────────────
function LimitCard({ label, value, Icon }) {
    const display = value === null || value === undefined ? "—" : value.toLocaleString();
    return (
        <div style={{
            padding: "1rem", borderRadius: "10px",
            background: "rgba(15,23,42,0.6)", border: "1px solid rgba(71,85,105,0.25)",
            display: "flex", alignItems: "center", gap: "0.75rem",
        }}>
            <div style={{
                padding: "0.5rem", borderRadius: "8px",
                background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
                flexShrink: 0,
            }}>
                <Icon size={14} style={{ color: "#818cf8" }} />
            </div>
            <div>
                <div style={{ fontSize: "0.65rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                    {label}
                </div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#c7d2fe", lineHeight: 1.2 }}>
                    {display}
                </div>
            </div>
        </div>
    );
}

// ─── Normalize modules from backend response ──────────────────────────────────
// Backend shape: { patients: true, appointments: false, finance: true, ... }
// We need: [{ name, active, source }]
function normalizeModules(entitlements) {
    if (!entitlements) return [];

    // Already normalized array  { name, active, source }
    if (Array.isArray(entitlements.modules)) {
        return entitlements.modules;
    }

    // Object map { moduleName: boolean } — actual backend shape
    if (entitlements.modules && typeof entitlements.modules === "object") {
        const source = entitlements.source || "plan";
        return Object.entries(entitlements.modules)
            .filter(([name]) => name !== "communication") // handle communication sub-object separately
            .map(([name, value]) => ({
                name,
                active: typeof value === "object" ? Boolean(value?.enabled) : Boolean(value),
                source,
            }));
    }

    // Fallback: activeModules shape (legacy)
    if (entitlements.activeModules && typeof entitlements.activeModules === "object") {
        const source = entitlements.source || "plan";
        return Object.entries(entitlements.activeModules).map(([name, active]) => ({
            name,
            active: Boolean(active),
            source,
        }));
    }

    return [];
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function EntitlementsPanel({ orgId }) {
    const [entitlements, setEntitlements] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchEntitlements = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await platformApi.get(`/organizations/${orgId}/entitlements`);
            // Response: { success, data: { modules, limits, addons, capabilities } }
            setEntitlements(res.data?.data || res.data || null);
        } catch (err) {
            setError(err.response?.data?.error || err.response?.data?.message || "Failed to load entitlements");
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => { fetchEntitlements(); }, [fetchEntitlements]);

    const modules = normalizeModules(entitlements);
    const limits = entitlements?.limits || {};
    const activeCount = modules.filter(m => m.active).length;
    const inactiveCount = modules.filter(m => !m.active).length;

    return (
        <Card>
            {/* ── Header ── */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
                <CardHeader title="Entitlements" icon={ShieldCheck} />
                <button
                    onClick={fetchEntitlements}
                    title="Refresh"
                    style={{
                        padding: "0.375rem", borderRadius: "8px",
                        background: "transparent", border: "1px solid transparent",
                        color: "#64748b", cursor: "pointer", display: "flex",
                        alignItems: "center", transition: "all 0.15s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(71,85,105,0.15)"; e.currentTarget.style.color = "#94a3b8"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#64748b"; }}
                >
                    <RefreshCw size={14} />
                </button>
            </div>

            {/* ── Loading ── */}
            {loading && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem 0", gap: "0.5rem", color: "#64748b" }}>
                    <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                    <span style={{ fontSize: "0.85rem" }}>Loading entitlements…</span>
                </div>
            )}

            {/* ── Error ── */}
            {!loading && error && (
                <div style={{ padding: "1.5rem", textAlign: "center" }}>
                    <AlertCircle size={24} style={{ color: "#ef4444", margin: "0 auto 0.75rem" }} />
                    <p style={{ fontSize: "0.85rem", color: "#94a3b8", marginBottom: "1rem" }}>{error}</p>
                    <button
                        onClick={fetchEntitlements}
                        style={{
                            display: "inline-flex", alignItems: "center", gap: "0.4rem",
                            padding: "0.5rem 1.125rem", borderRadius: "8px",
                            background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)",
                            color: "#818cf8", fontSize: "0.8rem", fontWeight: 600,
                            cursor: "pointer", transition: "all 0.15s",
                        }}
                    >
                        <RefreshCw size={12} /> Retry
                    </button>
                </div>
            )}

            {/* ── No contract / empty ── */}
            {!loading && !error && modules.length === 0 && (
                <div style={{ padding: "2.5rem", textAlign: "center" }}>
                    <ShieldCheck size={28} style={{ color: "#1e293b", margin: "0 auto 0.75rem" }} />
                    <p style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 600 }}>No entitlement data available</p>
                    <p style={{ fontSize: "0.75rem", color: "#475569", marginTop: "0.25rem" }}>
                        This organization may not have an active contract yet.
                    </p>
                </div>
            )}

            {/* ── Content ── */}
            {!loading && !error && modules.length > 0 && (
                <>
                    {/* Summary strip */}
                    <div style={{
                        display: "flex", alignItems: "center", gap: "1.25rem",
                        padding: "0.875rem 1rem", borderRadius: "10px",
                        background: "rgba(15,23,42,0.5)", border: "1px solid rgba(71,85,105,0.2)",
                        marginBottom: "1.25rem",
                    }}>
                        <div>
                            <div style={{ fontSize: "0.6rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>Active</div>
                            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#10b981", lineHeight: 1 }}>{activeCount}</div>
                        </div>
                        <div style={{ width: 1, height: 32, background: "rgba(71,85,105,0.3)" }} />
                        <div>
                            <div style={{ fontSize: "0.6rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>Inactive</div>
                            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#475569", lineHeight: 1 }}>{inactiveCount}</div>
                        </div>
                        <div style={{ width: 1, height: 32, background: "rgba(71,85,105,0.3)" }} />
                        <div>
                            <div style={{ fontSize: "0.6rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>Source</div>
                            <SourceBadge source={entitlements?.source || "plan"} />
                        </div>
                        {entitlements?.effectiveTo && (
                            <>
                                <div style={{ width: 1, height: 32, background: "rgba(71,85,105,0.3)" }} />
                                <div>
                                    <div style={{ fontSize: "0.6rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>Expires</div>
                                    <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#94a3b8" }}>
                                        {new Date(entitlements.effectiveTo).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* ── Limits ── */}
                    {(limits.maxUsers != null || limits.maxBranches != null) && (
                        <>
                            <div style={{ fontSize: "0.68rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: "0.625rem" }}>
                                Plan Limits
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.625rem", marginBottom: "1.25rem" }}>
                                {limits.maxUsers != null && (
                                    <LimitCard label="Max Users" value={limits.maxUsers} Icon={Users} />
                                )}
                                {limits.maxBranches != null && (
                                    <LimitCard label="Max Branches" value={limits.maxBranches} Icon={GitBranch} />
                                )}
                            </div>
                        </>
                    )}

                    {/* ── Modules grid ── */}
                    <div style={{ fontSize: "0.68rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: "0.625rem" }}>
                        Modules
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.5rem" }}>
                        {modules.map(m => (
                            <ModuleCard key={m.name} name={m.name} active={m.active} source={m.source} />
                        ))}
                    </div>
                </>
            )}
        </Card>
    );
}
