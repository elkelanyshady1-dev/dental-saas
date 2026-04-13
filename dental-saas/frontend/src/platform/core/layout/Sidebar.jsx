import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { PLATFORM_FEATURES } from "@/platform/core/routing/platformFeatureRegistry";
import { usePlatformFeatureFlags } from "@/platform/hooks/usePlatformFeatureFlags";
import platformApi from "@/platform/auth/platformApi";

// ─── Alert Badge Hook ────────────────────────────────────────────────────────
// Lightweight 30s poll of guardian overview — only for sidebar badge count.
// Uses the same platformApi client (auth included automatically).

function useGuardianAlertCount(capabilities) {
    const [alertCount, setAlertCount] = useState(0);
    const isAdmin = Array.isArray(capabilities) && capabilities.includes("MANAGE_PLATFORM_SETTINGS");

    useEffect(() => {
        if (!isAdmin) return;

        const fetch = async () => {
            try {
                const res = await platformApi.get("/guardian/overview");
                setAlertCount(res.data?.data?.summary?.totalAlerts || 0);
            } catch {
                // Silently fail — badge is non-critical
            }
        };

        fetch();
        const interval = setInterval(fetch, 30000);
        return () => clearInterval(interval);
    }, [isAdmin]);

    return { alertCount, isAdmin };
}

// ─── Pending Requests Badge Hook ────────────────────────────────────────
// Polls GET /refunds every 60s to get pending refund count for sidebar badge.

function usePendingRequestsCount(capabilities) {
    const [pendingCount, setPendingCount] = useState(0);
    const canManage = Array.isArray(capabilities) && capabilities.includes("MANAGE_SUBSCRIPTIONS");

    useEffect(() => {
        if (!canManage) return;

        const fetch = async () => {
            try {
                const res = await platformApi.get("/refunds?all=0&limit=1");
                setPendingCount(res.data?.pendingCount || 0);
            } catch {
                // Silently fail — badge is non-critical
            }
        };

        fetch();
        const interval = setInterval(fetch, 60000);
        return () => clearInterval(interval);
    }, [canManage]);

    return pendingCount;
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export function Sidebar({ capabilities, loading }) {
    const location = useLocation();
    const { hasFeature, loading: flagsLoading } = usePlatformFeatureFlags();
    const { alertCount, isAdmin } = useGuardianAlertCount(capabilities);
    const pendingRequestsCount = usePendingRequestsCount(capabilities);

    const isPending = loading || flagsLoading;

    const NavItem = ({ to, icon: Icon, label, capability, featureFlag, badge }) => {
        // Guard against missing capability OR disabled feature flag
        if (capability && !(Array.isArray(capabilities) && capabilities.includes(capability))) return null;
        if (featureFlag && !hasFeature(featureFlag)) return null;

        const isActive = location.pathname.includes(to);

        return (
            <Link
                to={to}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all group ${isActive
                    ? 'bg-sidebar-active text-white shadow-md shadow-blue-500/20'
                    : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'
                    }`}
            >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-sidebar-text-muted group-hover:text-blue-400'}`} />
                <span className="flex-1">{label}</span>
                {badge > 0 && (
                    <span className="ml-auto flex items-center justify-center w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full shadow-lg shadow-red-900/50 animate-pulse">
                        {badge > 9 ? "9+" : badge}
                    </span>
                )}
            </Link>
        );
    };

    const Section = ({ title, features }) => {
        const visibleFeatures = features.filter(f => {
            const hasCap = !f.capability || (Array.isArray(capabilities) && capabilities.includes(f.capability));
            const hasFlag = !f.featureFlag || hasFeature(f.featureFlag);
            return hasCap && hasFlag;
        });

        if (visibleFeatures.length === 0) return null;

        return (
            <div className="mb-6">
                <p className="px-4 mb-2 text-[10px] font-bold uppercase tracking-widest text-sidebar-text-muted">
                    {title}
                </p>
                <nav className="space-y-1">
                    {visibleFeatures.map(feature => (
                        <NavItem
                            key={feature.key}
                            to={`/platform/${feature.path}`}
                            icon={feature.icon}
                            label={feature.label}
                            capability={feature.capability}
                            featureFlag={feature.featureFlag}
                            badge={
                                feature.key === "GUARDIAN_DASHBOARD" && isAdmin
                                    ? alertCount
                                    : feature.key === "REQUESTS_INBOX"
                                        ? pendingRequestsCount
                                        : 0
                            }
                        />
                    ))}
                </nav>
            </div>
        );
    };

    // Group features by section
    const sections = PLATFORM_FEATURES.reduce((acc, feature) => {
        if (!feature.showInSidebar) return acc;
        const section = feature.section || 'General';
        if (!acc[section]) acc[section] = [];
        acc[section].push(feature);
        return acc;
    }, {});

    return (
        <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col shrink-0">
            <div className="p-6">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center font-black text-white">
                        P
                    </div>
                    <span className="font-bold text-white tracking-tight text-lg">Cockpit</span>
                </div>

                {isPending ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-3">
                        <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Resolving Context…</span>
                    </div>
                ) : (
                    <>
                        {Object.entries(sections).map(([title, features]) => (
                            <Section key={title} title={title} features={features} />
                        ))}
                    </>
                )}
            </div>

            <div className="mt-auto p-4 border-t border-sidebar-border">
                <div className="px-4 py-3 bg-sidebar-hover rounded-xl">
                    <p className="text-[10px] font-bold text-sidebar-text-muted uppercase tracking-widest">System Integrity</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${alertCount > 0 ? "bg-red-500 animate-pulse" : "bg-emerald-500 animate-pulse"}`} />
                        <p className={`text-[10px] font-mono uppercase tracking-wider ${alertCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
                            {alertCount > 0 ? `${alertCount} alert${alertCount !== 1 ? "s" : ""} active` : "Sovereign-v16.0"}
                        </p>
                    </div>
                </div>
            </div>
        </aside>
    );
}
