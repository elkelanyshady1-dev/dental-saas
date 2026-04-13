/**
 * CapabilityDebugger.jsx — Developer Debug Panel (Phase 17 — Enhanced)
 *
 * Displays the current user's capabilities, features, modules, and
 * subscription status in a floating dev-tools panel. Now includes
 * a FULL permission resolution matrix showing RBAC × Entitlement × Final
 * for every SSOT permission key.
 *
 * ONLY renders in development mode (process.env.NODE_ENV !== "production").
 * Toggled via keyboard shortcut: Ctrl+Shift+D
 *
 * Phase 17 Enhancements:
 *   - Permission Matrix tab: RBAC × Entitlement × Final for every key
 *   - Version tracking: permissionVersion display
 *   - Entitlement sync status
 *   - Color-coded resolution matrix
 *
 * PLANE: Org only.
 */

import { useState, useEffect, useMemo } from "react";
import { useCapabilities } from "@/context/CapabilityContext";
import { useFeatures } from "@/context/FeatureContext";
import { useAuth } from "@/context/AuthContext";
import permissionKeysData from "@/generated/permissionKeys.json";

// Only render in development
const IS_DEV = process.env.NODE_ENV !== "production";

function DebugSection({ title, children, defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="border-b border-slate-700/50 last:border-0">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700/50 transition"
            >
                <span>{title}</span>
                <span className="text-[10px] text-slate-500">{open ? "▾" : "▸"}</span>
            </button>
            {open && <div className="px-3 pb-3">{children}</div>}
        </div>
    );
}

function Badge({ active, label }) {
    return (
        <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold mr-1 mb-1 ${
                active
                    ? "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50"
                    : "bg-red-900/30 text-red-400 border border-red-800/30"
            }`}
        >
            {active ? "✓" : "✕"} {label}
        </span>
    );
}

/** Single row in the permission matrix */
function MatrixRow({ permKey, rbac, entitlement, final }) {
    return (
        <div className="flex items-center justify-between text-[10px] py-0.5 border-b border-slate-800/30 last:border-0">
            <span className="text-slate-400 truncate max-w-[45%] font-mono">{permKey}</span>
            <div className="flex items-center gap-2">
                <span className={rbac ? "text-emerald-400" : "text-red-400"}>
                    R:{rbac ? "✅" : "❌"}
                </span>
                <span className={entitlement ? "text-emerald-400" : "text-amber-400"}>
                    E:{entitlement ? "✅" : "⛔"}
                </span>
                <span className={final ? "text-emerald-300 font-bold" : "text-red-400 font-bold"}>
                    {final ? "✅" : "❌"}
                </span>
            </div>
        </div>
    );
}

export default function CapabilityDebugger() {
    const [visible, setVisible] = useState(false);
    const [activeTab, setActiveTab] = useState("overview"); // overview | matrix
    const capabilities = useCapabilities();
    const { modules, features, subscriptionStatus, isSubscriptionActive } = useFeatures();
    const { user, roleName } = useAuth();

    // Keyboard toggle: Ctrl+Shift+D
    useEffect(() => {
        if (!IS_DEV) return;

        const handler = (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === "D") {
                e.preventDefault();
                setVisible((v) => !v);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    // Sorted capability list
    const capabilityList = useMemo(() => {
        return Object.entries(capabilities || {}).sort(([a], [b]) => a.localeCompare(b));
    }, [capabilities]);

    // Module list
    const moduleList = useMemo(() => {
        return Object.entries(modules || {}).sort(([a], [b]) => a.localeCompare(b));
    }, [modules]);

    // Feature list
    const featureList = useMemo(() => {
        return Object.entries(features || {}).sort(([a], [b]) => a.localeCompare(b));
    }, [features]);

    // Phase 17: Full permission resolution matrix
    const permissionMatrix = useMemo(() => {
        const allKeys = permissionKeysData?.permissionKeys || [];
        return allKeys.map((key) => {
            const [mod] = key.split(".");
            const rbac = capabilities?.[key] === true;
            const entitlement = modules?.[mod] !== undefined ? !!modules[mod] : true;
            const final = rbac && entitlement;
            return { key, module: mod, rbac, entitlement, final };
        });
    }, [capabilities, modules]);

    // Summary stats
    const matrixStats = useMemo(() => {
        const total = permissionMatrix.length;
        const rbacGranted = permissionMatrix.filter((m) => m.rbac).length;
        const entBlocked = permissionMatrix.filter((m) => !m.entitlement).length;
        const finalGranted = permissionMatrix.filter((m) => m.final).length;
        return { total, rbacGranted, entBlocked, finalGranted };
    }, [permissionMatrix]);

    if (!IS_DEV || !visible) return null;

    return (
        <div
            className="fixed bottom-4 right-4 w-96 max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-700/60 bg-slate-900/95 backdrop-blur-xl shadow-2xl text-white z-[9999] select-none"
            style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace, sans-serif" }}
        >
            {/* Header */}
            <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl border-b border-slate-700/50 px-3 py-2 flex items-center justify-between z-10">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-violet-600 text-white px-1.5 py-0.5 rounded font-black">
                        RBAC v3
                    </span>
                    <span className="text-xs font-bold text-slate-200">Debug Panel</span>
                </div>
                <button
                    onClick={() => setVisible(false)}
                    className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-700 transition text-xs"
                >
                    ✕
                </button>
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-slate-700/50">
                <button
                    onClick={() => setActiveTab("overview")}
                    className={`flex-1 px-3 py-1.5 text-[10px] font-bold transition ${
                        activeTab === "overview"
                            ? "text-violet-300 border-b-2 border-violet-500"
                            : "text-slate-500 hover:text-slate-300"
                    }`}
                >
                    Overview
                </button>
                <button
                    onClick={() => setActiveTab("matrix")}
                    className={`flex-1 px-3 py-1.5 text-[10px] font-bold transition ${
                        activeTab === "matrix"
                            ? "text-violet-300 border-b-2 border-violet-500"
                            : "text-slate-500 hover:text-slate-300"
                    }`}
                >
                    Permission Matrix ({matrixStats.finalGranted}/{matrixStats.total})
                </button>
            </div>

            {/* Overview Tab */}
            {activeTab === "overview" && (
                <>
                    {/* User Info */}
                    <DebugSection title="👤 User" defaultOpen={true}>
                        <div className="space-y-1.5 text-[11px]">
                            <div className="flex justify-between">
                                <span className="text-slate-400">Name</span>
                                <span className="text-slate-200 font-medium truncate max-w-[60%]">{user?.name || "—"}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Role</span>
                                <span className="text-amber-300 font-bold">{roleName || "—"}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Email</span>
                                <span className="text-slate-200 truncate max-w-[60%]">{user?.email || "—"}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Org ID</span>
                                <span className="text-slate-500 font-mono text-[9px]">
                                    {(user?.organizationId || "—").toString().slice(-8)}
                                </span>
                            </div>
                        </div>
                    </DebugSection>

                    {/* Subscription */}
                    <DebugSection title="💳 Subscription" defaultOpen={true}>
                        <div className="space-y-1.5 text-[11px]">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400">Status</span>
                                <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        isSubscriptionActive
                                            ? "bg-emerald-900/50 text-emerald-300"
                                            : "bg-red-900/50 text-red-300"
                                    }`}
                                >
                                    {subscriptionStatus.toUpperCase()}
                                </span>
                            </div>
                        </div>
                    </DebugSection>

                    {/* Resolution Summary (Phase 17) */}
                    <DebugSection title="📊 Resolution Summary" defaultOpen={true}>
                        <div className="space-y-1.5 text-[11px]">
                            <div className="flex justify-between">
                                <span className="text-slate-400">SSOT Keys</span>
                                <span className="text-slate-200 font-bold">{matrixStats.total}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">RBAC Granted</span>
                                <span className="text-emerald-300 font-bold">{matrixStats.rbacGranted}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Entitlement Blocked</span>
                                <span className="text-amber-300 font-bold">{matrixStats.entBlocked}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Final Granted</span>
                                <span className={`font-bold ${matrixStats.finalGranted > 0 ? "text-emerald-300" : "text-red-400"}`}>
                                    {matrixStats.finalGranted}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Perm Version</span>
                                <span className="text-violet-300 font-bold">v{permissionKeysData?._permissionVersion || "?"}</span>
                            </div>
                        </div>
                    </DebugSection>

                    {/* Capabilities (RBAC) */}
                    <DebugSection title={`🔑 Capabilities (${capabilityList.length})`}>
                        {capabilityList.length === 0 ? (
                            <p className="text-[10px] text-slate-500 italic">No capabilities loaded</p>
                        ) : (
                            <div className="flex flex-wrap gap-0.5">
                                {capabilityList.map(([key, val]) => (
                                    <Badge key={key} active={!!val} label={key} />
                                ))}
                            </div>
                        )}
                    </DebugSection>

                    {/* Modules (Entitlements) */}
                    <DebugSection title={`📦 Modules (${moduleList.length})`}>
                        {moduleList.length === 0 ? (
                            <p className="text-[10px] text-slate-500 italic">No modules loaded</p>
                        ) : (
                            <div className="flex flex-wrap gap-0.5">
                                {moduleList.map(([name, enabled]) => (
                                    <Badge key={name} active={enabled} label={name} />
                                ))}
                            </div>
                        )}
                    </DebugSection>

                    {/* Features */}
                    <DebugSection title={`🚩 Features (${featureList.length})`}>
                        {featureList.length === 0 ? (
                            <p className="text-[10px] text-slate-500 italic">No features configured</p>
                        ) : (
                            <div className="flex flex-wrap gap-0.5">
                                {featureList.map(([key, enabled]) => (
                                    <Badge key={key} active={enabled} label={key} />
                                ))}
                            </div>
                        )}
                    </DebugSection>
                </>
            )}

            {/* Permission Matrix Tab (Phase 17) */}
            {activeTab === "matrix" && (
                <div className="px-3 py-2">
                    {/* Legend */}
                    <div className="flex items-center gap-3 mb-2 text-[9px] text-slate-500">
                        <span>R = RBAC</span>
                        <span>E = Entitlement</span>
                        <span>Final = R ∧ E</span>
                    </div>

                    {/* Matrix rows grouped by module */}
                    {Object.entries(permissionKeysData?.modules || {}).map(([mod, actions]) => {
                        const modEntries = permissionMatrix.filter((m) => m.module === mod);
                        const modAllGranted = modEntries.every((m) => m.final);
                        const modNoneGranted = modEntries.every((m) => !m.final);

                        return (
                            <div key={mod} className="mb-2">
                                <div className="flex items-center justify-between mb-0.5">
                                    <span className={`text-[10px] font-bold ${
                                        modAllGranted ? "text-emerald-300" :
                                        modNoneGranted ? "text-red-400" : "text-amber-300"
                                    }`}>
                                        {modAllGranted ? "●" : modNoneGranted ? "○" : "◐"} {mod}
                                    </span>
                                    <span className="text-[9px] text-slate-600">
                                        {modEntries.filter((m) => m.final).length}/{modEntries.length}
                                    </span>
                                </div>
                                {modEntries.map((entry) => (
                                    <MatrixRow
                                        key={entry.key}
                                        permKey={entry.key}
                                        rbac={entry.rbac}
                                        entitlement={entry.entitlement}
                                        final={entry.final}
                                    />
                                ))}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Footer */}
            <div className="px-3 py-2 border-t border-slate-700/50 text-center">
                <span className="text-[9px] text-slate-600">
                    Ctrl+Shift+D to toggle · DEV only · Phase 17
                </span>
            </div>
        </div>
    );
}
