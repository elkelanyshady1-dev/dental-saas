import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Home, Activity, DollarSign, ShieldAlert, Users, Server, Mail, Search, AlertTriangle, ToggleLeft } from "lucide-react";
import { PlatformAnalyticsProvider, usePlatformAnalytics } from "./PlatformAnalyticsContext";
import Breadcrumbs from "./components/navigation/Breadcrumbs";
import { NotificationBell } from "./components/navigation/NotificationBell";
import { AdminDropdown } from "./components/navigation/AdminDropdown";
import GlobalSearch from "./components/navigation/GlobalSearch";

const ROLE_DEFAULTS = {
    superadmin: ["*"],
    finance_admin: ["platform.analytics.revenue"],
    operations_admin: ["platform.analytics.organizations", "platform.analytics.clinical"],
    analyst: ["platform.analytics.revenue", "platform.analytics.organizations", "platform.analytics.clinical"]
};

const formatCurrency = (val) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val || 0);

function TopCommandBar({ user, handleLogout }) {
    const { stats, loading } = usePlatformAnalytics();

    return (
        <header className="h-[72px] bg-white border-b border-gray-200 flex items-center justify-between px-6 z-30 shrink-0">
            {/* Branding / Cockpit Left */}
            <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center shadow-sm">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Zm-1-14v3H8v2h3v3h2v-3h3v-2h-3V7h-2Z" /></svg>
                </div>
                <div className="flex flex-col">
                    <h1 className="text-lg font-bold text-gray-900 leading-tight">Platform Command</h1>
                    <span className="text-[10px] uppercase font-bold text-blue-600 tracking-wider">Enterprise Console</span>
                </div>
            </div>

            {/* Global KPIs (Center) */}
            {!loading && stats && (
                <div className="flex items-center gap-6">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase font-bold text-gray-400">MRR</span>
                        <span className="text-sm font-black text-gray-800">{formatCurrency(stats.mrr)}</span>
                    </div>
                    <div className="w-px h-8 bg-gray-200"></div>
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase font-bold text-gray-400">ARR</span>
                        <span className="text-sm font-black text-indigo-600">{formatCurrency(stats.arr)}</span>
                    </div>
                    <div className="w-px h-8 bg-gray-200"></div>
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase font-bold text-amber-500">Risk</span>
                        <span className="text-sm font-black text-amber-600">{formatCurrency(stats.revenueAtRisk)}</span>
                    </div>
                    <div className="w-px h-8 bg-gray-200"></div>
                    <div className="flex flex-col items-end gap-1 flex-row">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">{stats.activeSubscriptions || 0} Active</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-100">{stats.suspendedSubscriptions || 0} Suspended</span>
                    </div>
                    {stats.mrr > 0 && (stats.revenueAtRisk / stats.mrr) > 0.15 && (
                        <div className="ml-2 px-3 py-1 bg-red-100 text-red-800 text-[10px] font-bold rounded animate-pulse border border-red-300 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            HIGH RISK
                        </div>
                    )}
                </div>
            )}

            {/* User Meta (Right) */}
            <div className="flex items-center gap-6">
                <NotificationBell />
                <AdminDropdown user={user} />
            </div>
        </header>
    );
}

function Sidebar({ user, hasPermission }) {
    const location = useLocation();

    // Permissions
    const canViewOrganizations = hasPermission("platform.analytics.organizations");
    const canViewRevenue = hasPermission("platform.analytics.revenue");
    const canViewUsers = user?.role === "superadmin";

    const getLinkClasses = (path) => {
        const isActive = location.pathname.includes(path);
        return `flex items-center gap-3 px-4 py-2 rounded-md text-sm transition-colors ${isActive
            ? "bg-slate-800 text-white"
            : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`;
    };

    const SectionHeader = ({ title }) => (
        <p className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider px-4 mt-6 mb-2">
            {title}
        </p>
    );

    return (
        <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col shrink-0 overflow-y-auto">
            <div className="px-4 mt-6 mb-2">
                <GlobalSearch />
            </div>
            <nav className="p-4 space-y-1">
                <SectionHeader title="Platform Command" />
                <Link to="/platform/dashboard" className={getLinkClasses("dashboard")}>
                    <Home className="w-4 h-4" />
                    Overview
                </Link>

                {canViewRevenue && (
                    <>
                        <Link to="/platform/revenue" className={getLinkClasses("revenue")}>
                            <DollarSign className="w-4 h-4" />
                            Revenue Intelligence
                        </Link>
                        <Link to="/platform/dunning" className={getLinkClasses("dunning")}>
                            <AlertTriangle className="w-4 h-4" />
                            Dunning Monitor
                        </Link>
                    </>
                )}

                {(canViewOrganizations || canViewRevenue) && (
                    <>
                        <SectionHeader title="Organization Governance" />
                        <Link to="/platform/organizations" className={getLinkClasses("organizations")}>
                            <Users className="w-4 h-4" />
                            Organizations
                        </Link>
                        <Link to="/platform/analytics" className={getLinkClasses("analytics")}>
                            <Activity className="w-4 h-4" />
                            Tenant Telemetry
                        </Link>
                    </>
                )}

                {canViewUsers && (
                    <>
                        <SectionHeader title="Platform Governance" />
                        <Link to="/platform/users" className={getLinkClasses("users")}>
                            <ShieldAlert className="w-4 h-4" />
                            Platform Users
                        </Link>
                        <Link to="/platform/features" className={getLinkClasses("features")}>
                            <ToggleLeft className="w-4 h-4" />
                            Feature Engine
                        </Link>
                        <Link to="/platform/audit-logs" className={getLinkClasses("audit-logs")}>
                            <Activity className="w-4 h-4" />
                            Audit Logs
                        </Link>
                    </>
                )}

                {canViewUsers && (
                    <>
                        <SectionHeader title="System Intelligence" />
                        <Link to="/platform/system/cron" className={getLinkClasses("/platform/system/cron")}>
                            <Server className="w-4 h-4" />
                            Cron Monitor
                        </Link>
                        <Link to="/platform/system/email" className={getLinkClasses("/platform/system/email")}>
                            <Mail className="w-4 h-4" />
                            Email Logs
                        </Link>
                    </>
                )}
            </nav>
        </aside>
    );
}

function LayoutContent() {
    const { logout, user } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate("/platform/login");
    };

    const hasPlatformPermission = (perm) => {
        if (!user || !user.role) return false;
        if (user.role === "superadmin") return true;

        const perms = ROLE_DEFAULTS[user.role] || [];
        return perms.includes("*") || perms.includes(perm);
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-800">
            <TopCommandBar user={user} handleLogout={handleLogout} />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar user={user} hasPermission={hasPlatformPermission} />
                <main className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
                    <div className="px-8 py-6 bg-white border-b border-gray-100 shrink-0">
                        <Breadcrumbs hasPermission={hasPlatformPermission} />
                    </div>
                    <div className="flex-1 p-8">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}

export default function PlatformLayout() {
    return (
        <PlatformAnalyticsProvider>
            <LayoutContent />
        </PlatformAnalyticsProvider>
    );
}
