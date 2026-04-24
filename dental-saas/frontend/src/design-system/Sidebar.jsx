/**
 * Sidebar (Design System v4.0 — Light Theme)
 *
 * Layout: persistent left rail, w-20 on mobile (icon-only), w-64 on md+.
 * ALL existing RBAC / module-gate / routing logic is FULLY PRESERVED.
 * Only visual layer is changed to match the new light design system.
 */
import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
    HomeIcon,
    UsersIcon,
    CalendarDaysIcon,
    ClipboardDocumentListIcon,
    CurrencyDollarIcon,
    CubeIcon,
    ChartBarIcon,
    Cog6ToothIcon,
    BeakerIcon,
    SparklesIcon,
    UserCircleIcon,
    LanguageIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { useFeatures } from "@/context/FeatureContext";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { useOrgBranding } from "@/context/OrgBrandingContext";
import { BRAND } from "@/config/brand";

const STORAGE_KEY = "org:sidebar:collapsed";

export default function Sidebar({ isOpen, onClose }) {
    const location  = useLocation();
    const navigate  = useNavigate();
    const { hasModule } = useFeatures();
    const { orgName, logoUrl } = useOrgBranding();

    // ── Collapse state (persisted to localStorage) ────────────────────────
    const [collapsed, setCollapsed] = useState(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored === null ? true : stored === "true";
        } catch { return true; }
    });

    const toggleCollapse = () => {
        setCollapsed(prev => {
            const next = !prev;
            try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /**/ }
            return next;
        });
    };

    // Auto-collapse on narrow desktop viewports (< 1280px)
    useEffect(() => {
        const check = () => {
            if (window.innerWidth < 1280 && !collapsed) {
                setCollapsed(true);
                try { localStorage.setItem(STORAGE_KEY, "true"); } catch { /**/ }
            }
        };
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── RBAC permission checks ────────────────────────────────────────────
    const canPatients     = useCapability(P.PATIENTS_READ);
    const canAppointments = useCapability(P.APPOINTMENTS_READ);
    const canTreatments   = useCapability(P.TREATMENTS_READ);
    const canOrtho        = useCapability(P.ORTHODONTICS_READ);
    const canFinance      = useCapability(P.ACCOUNTING_READ);
    const canInventory    = useCapability(P.INVENTORY_READ);
    const canAnalytics    = useCapability(P.ACCOUNTING_READ);

    // ── Nav item definitions ──────────────────────────────────────────────
    const NAV_ITEMS = useMemo(() => [
        // CORE
        { icon: HomeIcon,                  path: "/org/dashboard",    label: "Dashboard" },
        { icon: SparklesIcon,              path: "/org/orthodontics", label: "Orthodontic", visible: canOrtho,        module: "orthodontics" },
        { icon: BeakerIcon,                path: "/org/lab",          label: "Lab",          visible: canTreatments,   module: "clinical" },
        { icon: CalendarDaysIcon,          path: "/org/calendar",     label: "Calendar",     visible: canAppointments, module: "appointments" },
        { icon: UsersIcon,                 path: "/org/patients",     label: "Patients",     visible: canPatients,     module: "patients" },
        { icon: CurrencyDollarIcon,        path: "/org/invoices",     label: "Finance",      visible: canFinance,      module: "finance" },
        { icon: CubeIcon,                  path: "/org/inventory",    label: "Inventory",    visible: canInventory,    module: "inventory" },
        { icon: ChartBarIcon,              path: "/org/analytics",    label: "Analytics",    visible: canAnalytics,    module: "analytics" },

        { type: "separator" },

        // SYSTEM
        { icon: Cog6ToothIcon,  path: "/org/settings", label: "Settings", bottom: true },
        { icon: LanguageIcon,   path: "/org/profile",  label: "Language",  bottom: true },
    ], [canPatients, canAppointments, canTreatments, canOrtho,
        canFinance, canInventory, canAnalytics]);

    // ── RBAC + module filter ──────────────────────────────────────────────
    const visibleItems = useMemo(() =>
        NAV_ITEMS.filter(item => {
            if (item.type === "separator") return true;
            if (item.visible === false) return false;
            if (item.module && !hasModule(item.module)) return false;
            return true;
        }),
    [NAV_ITEMS, hasModule]);

    // ── Collapse consecutive separators ──────────────────────────────────
    const cleanItems = useMemo(() => {
        const filtered = [];
        for (let i = 0; i < visibleItems.length; i++) {
            const item = visibleItems[i];
            if (item.type === "separator") {
                if (filtered.length === 0) continue;
                if (i === visibleItems.length - 1) continue;
                if (filtered[filtered.length - 1]?.type === "separator") continue;
            }
            filtered.push(item);
        }
        if (filtered.length > 0 && filtered[filtered.length - 1]?.type === "separator") {
            filtered.pop();
        }
        return filtered;
    }, [visibleItems]);

    const mainItems   = cleanItems.filter(i => !i.bottom && i.type !== "separator");
    const bottomItems = cleanItems.filter(i => i.bottom);

    const NavItem = ({ item }) => {
        const { icon: Icon, path, label } = item;
        const isActive = location.pathname === path
            || (path === "/org/settings"
                ? location.pathname.startsWith("/org/settings")
                : (path !== "/org/profile" && location.pathname.startsWith(path)));

        return (
            <div className="relative group">
                <button
                    key={path}
                    onClick={() => { navigate(path); onClose?.(); }}
                    title={collapsed ? label : undefined}
                    className={`
                        flex items-center gap-3 w-full rounded-xl transition-all duration-200
                        ${collapsed ? "px-3 py-3 justify-center" : "px-4 py-3"}
                        ${isActive
                            ? "bg-white text-indigo-600 shadow-sm"
                            : "text-slate-400 hover:bg-slate-100 hover:text-indigo-500"
                        }
                    `}
                >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {!collapsed && (
                        <span className="text-xs font-medium truncate">{label}</span>
                    )}
                </button>

                {/* Tooltip — only shown when sidebar is collapsed */}
                {collapsed && (
                    <span className="
                        pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3
                        bg-slate-900 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg
                        whitespace-nowrap shadow-lg
                        opacity-0 group-hover:opacity-100 transition-opacity duration-150
                        z-[9999]
                    ">
                        {label}
                    </span>
                )}
            </div>
        );
    };

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
                    onClick={onClose}
                />
            )}

            <aside className={`
                relative flex flex-col h-full border-r border-slate-100 p-4 bg-slate-50 z-50 flex-shrink-0
                fixed lg:static inset-y-0 left-0 transition-all duration-300 ease-in-out overflow-visible
                ${collapsed ? "w-16" : "w-56"}
                ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
            `}>

                {/* ── Logo / Org Brand + Collapse Toggle ── */}
                <div className={`mb-8 flex items-center flex-shrink-0 ${collapsed ? "justify-center px-0" : "px-2 gap-3"}`}>
                    <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
                        {logoUrl ? (
                            <img
                                src={logoUrl}
                                alt="org"
                                className="w-7 h-7 object-contain rounded-lg"
                                onError={e => { e.target.style.display = "none"; }}
                            />
                        ) : (
                            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                        )}
                    </div>
                    {!collapsed && (
                        <div className="flex-1 min-w-0 flex items-center justify-between">
                            <div className="min-w-0">
                                <p className="text-sm font-bold tracking-tight text-slate-900 leading-none truncate">
                                    {orgName || BRAND.name}
                                </p>
                                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-1">
                                    Clinical Excellence
                                </p>
                            </div>
                            {/* Collapse button — visible only on lg+ */}
                            <button
                                onClick={toggleCollapse}
                                className="hidden lg:flex ml-2 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors flex-shrink-0"
                                title="Collapse sidebar"
                            >
                                <ChevronLeftIcon className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}
                    {/* Expand button when collapsed — shown centered */}
                    {collapsed && (
                        <button
                            onClick={toggleCollapse}
                            className="hidden lg:flex absolute -right-3 top-7 w-6 h-6 bg-white border border-slate-200 rounded-full shadow-sm items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-colors z-10"
                            title="Expand sidebar"
                        >
                            <ChevronRightIcon className="w-3 h-3" />
                        </button>
                    )}
                </div>

                {/* ── Main Nav ─────────────────────────── */}
                <nav className="flex-1 space-y-1 overflow-y-auto">
                    {mainItems.map((item, idx) =>
                        <NavItem key={item.path || idx} item={item} />
                    )}
                </nav>

                {/* ── Bottom: Settings + Language ──────── */}
                <div className="mt-auto pt-4 border-t border-slate-100 space-y-1">
                    {bottomItems.map((item, idx) =>
                        <NavItem key={item.path || idx} item={item} />
                    )}
                </div>
            </aside>
        </>
    );
}
