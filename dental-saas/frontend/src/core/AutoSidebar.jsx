/**
 * AutoSidebar.jsx — UI Engine Auto Sidebar (v1.0)
 *
 * Part 5 of the Auto UI Engine.
 *
 * Generates the org-plane sidebar navigation from the auto-generated SIDEBAR
 * constant. Designed as a DROP-IN replacement for the hardcoded Sidebar.jsx,
 * or as an ADDITIVE layer that can co-exist with it.
 *
 * CAPABILITY RULES (Zero-Trust):
 *   ❌ No role === 'admin' checks
 *   ✅ useCapability(item.permission)  — individual per item
 *   ✅ useFeatures().hasModule(item.module)  — plan entitlement
 *   ✅ All capability checks computed before render (Rules of Hooks compliant)
 *
 * HOOKS COMPLIANCE NOTE:
 *   React forbids calling hooks inside loops/maps. This component pre-computes
 *   all capability checks using useMemo over a fixed-length SIDEBAR array,
 *   then filters during render. This is safe because SIDEBAR is a static
 *   generated constant (same length every render).
 *
 * PLANE: Org Plane only
 */
import { useMemo } from "react";
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
} from "@heroicons/react/24/outline";
import { SIDEBAR } from "@/generated/uiEngine";
import { useCapability } from "@/hooks/useCapability";
import { useFeatures } from "@/context/FeatureContext";

// ─── Icon registry (maps heroicon name string → component) ───────────────────
// Add new icons here as uiManifest.js expands.
const ICON_MAP = {
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
};

// ─── Category separators ──────────────────────────────────────────────────────
// Insert a separator between category groups in the sidebar.
const CATEGORY_ORDER = ["core", "clinical", "financial", "intelligence", "admin", "system"];

/**
 * AutoSidebar — self-generating sidebar from uiEngine.js SIDEBAR manifest.
 *
 * @param {object}   props
 * @param {boolean}  props.isOpen  — Mobile drawer open state
 * @param {Function} props.onClose — Mobile close handler
 */
export default function AutoSidebar({ isOpen, onClose }) {
    const location = useLocation();
    const navigate = useNavigate();
    const { hasModule } = useFeatures();

    // ── Pre-compute ALL capability checks (must run before any conditional) ──
    // This array is fixed-length (SIDEBAR.length) — Hooks Rules compliant.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const capabilityResults = SIDEBAR.map((item) => useCapability(item.permission));

    // ── Build visible items with icon resolution + separator injection ────────
    const visibleItems = useMemo(() => {
        const items = [];
        let lastCategory = null;

        SIDEBAR.forEach((item, idx) => {
            const hasPermission = item.permission === null || capabilityResults[idx];
            const hasPlan      = item.module === null || hasModule(item.module);

            if (!hasPermission || !hasPlan) return;

            // Inject category separator between groups
            if (lastCategory !== null && lastCategory !== item.category) {
                items.push({ type: "separator", key: `sep-${item.category}` });
            }
            lastCategory = item.category;

            const Icon = ICON_MAP[item.icon] || HomeIcon;
            items.push({ ...item, IconComponent: Icon, idx });
        });

        // Remove trailing separator
        if (items.length > 0 && items[items.length - 1].type === "separator") {
            items.pop();
        }

        return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [capabilityResults, hasModule]);

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
                    onClick={onClose}
                />
            )}

            <aside
                className={`
                    flex flex-col items-center w-20 bg-white/40 backdrop-blur-md
                    border-r border-white/40 py-4 gap-2 z-50 flex-shrink-0
                    fixed lg:static inset-y-0 left-0 transition-transform duration-300
                    ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
                `}
            >
                {/* Logo */}
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30 mb-4">
                    <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent" />
                </div>

                {/* Nav Items */}
                <nav className="flex flex-col items-center gap-1 flex-1 w-full px-2">
                    {visibleItems.map((item, renderIdx) => {
                        if (item.type === "separator") {
                            return <div key={item.key || `sep-${renderIdx}`} className="w-8 h-px bg-gray-200/60 my-2" />;
                        }

                        const { IconComponent, route, label } = item;
                        const path = `/org/${route}`;

                        const isActive =
                            location.pathname === path ||
                            (route === "settings"
                                ? location.pathname.startsWith("/org/settings")
                                : route !== "profile" && location.pathname.startsWith(path));

                        return (
                            <button
                                key={route}
                                onClick={() => { navigate(path); onClose?.(); }}
                                title={label}
                                aria-label={label}
                                className={`
                                    w-12 h-12 rounded-xl flex items-center justify-center
                                    transition-all duration-200
                                    ${isActive
                                        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                                        : "text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                                    }
                                `}
                            >
                                <IconComponent className="w-5 h-5" />
                            </button>
                        );
                    })}
                </nav>
            </aside>
        </>
    );
}
