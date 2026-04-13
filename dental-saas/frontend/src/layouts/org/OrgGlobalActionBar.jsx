/**
 * OrgGlobalActionBar.jsx (v4.0) — Context-Aware Enterprise Action Bar
 *
 * ✅ Actions change per route (dashboard / patients / finance / …)
 * ✅ RBAC-filtered: backend-first, frontend fallback
 * ✅ Loading skeleton — no "no permission" flash
 * ✅ Solid enterprise dark background
 * ✅ Plugin-ready (add context + actions in actionRegistry.js only)
 *
 * Props:
 *   onAddPatient {function} — opens global PatientDrawer
 */

import { useNavigate } from "react-router-dom";
import {
    UserPlusIcon,
    CalendarIcon,
    ClipboardDocumentListIcon,
    PencilSquareIcon,
    ChatBubbleLeftEllipsisIcon,
    DocumentPlusIcon,
    CircleStackIcon,
    CurrencyDollarIcon,
    LinkIcon,
    ArrowUpTrayIcon,
    ArrowDownTrayIcon,
    CheckCircleIcon,
    PlusIcon,
} from "@heroicons/react/24/outline";

import { useRouteContext } from "@/modules/org/hooks/useRouteContext";
import { useContextActions } from "@/modules/org/hooks/useContextActions";
import { ACTION_COLORS } from "@/modules/org/context/actionRegistry";


// ── Icon map: string name → HeroIcon component ─────────────────────────────
// Add new icons here when you add new actions to actionRegistry.js
const ICON_MAP = {
    UserPlus: UserPlusIcon,
    Calendar: CalendarIcon,
    ClipboardDocumentList: ClipboardDocumentListIcon,
    PencilSquare: PencilSquareIcon,
    ChatBubbleLeftEllipsis: ChatBubbleLeftEllipsisIcon,
    DocumentPlus: DocumentPlusIcon,
    CircleStack: CircleStackIcon,
    CurrencyDollar: CurrencyDollarIcon,
    Link: LinkIcon,
    ArrowUpTray: ArrowUpTrayIcon,
    ArrowDownTray: ArrowDownTrayIcon,
    CheckCircle: CheckCircleIcon,
    Plus: PlusIcon,
};

// ── Context label map: contextKey → human-readable breadcrumb ─────────────
const CONTEXT_LABELS = {
    dashboard: "Dashboard",
    patients: "Patients",
    patient_profile: "Patient",
    appointments: "Appointments",
    finance: "Finance",
    calendar: "Calendar",
    analytics: "Analytics",
    inventory: "Inventory",
    settings: "Settings",
    default: "",
};

// ── Loading skeleton ──────────────────────────────────────────────────────
function SkeletonButton() {
    return (
        <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 animate-pulse flex-shrink-0" />
    );
}

// ── Main component ────────────────────────────────────────────────────────
const OrgGlobalActionBar = ({ onAddPatient }) => {
    const navigate = useNavigate();
    const { contextKey } = useRouteContext();
    const { actions, isLoading } = useContextActions(contextKey);

    const contextLabel = CONTEXT_LABELS[contextKey] ?? "";

    /**
     * Centralized action handler.
     * Extend this switch when adding new action keys to actionRegistry.js.
     */
    const handleAction = (key) => {
        switch (key) {
            // Patient actions
            case "add_patient":
                if (onAddPatient) { onAddPatient(); break; }
                navigate("/org/patients/new");
                break;
            case "import_csv":
                navigate("/org/patients?action=import");
                break;

            // Appointment actions
            case "add_appointment":
                navigate("/org/calendar?action=new_appointment");
                break;

            // Clinical actions
            case "add_treatment":
                navigate(window.location.pathname + "?action=new_treatment");
                break;
            case "add_prescription":
                navigate(window.location.pathname + "?action=new_prescription");
                break;

            // Finance actions
            case "add_income":
            case "new_invoice":
                navigate("/org/finance?new=income");
                break;
            case "add_expense":
                navigate("/org/finance?new=expense");
                break;

            // Communication
            case "send_sms":
                navigate("/org/patients?action=sms");
                break;

            // Analytics
            case "export_report":
                navigate("/org/analytics?export=1");
                break;

            // Tasks
            case "add_task":
                navigate("/org/calendar?action=new_task");
                break;

            // Inventory
            case "add_stock":
                navigate("/org/inventory?action=add");
                break;

            // Settings
            case "save_settings":
                window.dispatchEvent(new CustomEvent("org:save-settings"));
                break;

            default:
                console.warn(`[ActionBar] Unhandled action key: "${key}"`);
        }
    };

    return (
        <div className="h-full bg-[#0f1f3d] border-b border-white/10 shadow-sm flex items-center px-6 gap-4">

            {/* ── Left: Context breadcrumb label ── */}
            <div className="flex items-center gap-2 flex-shrink-0 min-w-[100px]">
                {contextLabel && (
                    <span
                        key={contextKey}
                        className="text-xs font-bold text-white/40 uppercase tracking-widest animate-fade-in"
                    >
                        {contextLabel}
                    </span>
                )}
            </div>

            {/* ── Divider ── */}
            <div className="w-px h-5 bg-white/10 flex-shrink-0" />

            {/* ── Right: Dynamic action buttons ── */}
            <div className="flex items-center justify-end flex-1 gap-2.5">

                {/* Loading skeleton — shown while auth or backend resolves */}
                {isLoading && (
                    <>
                        <SkeletonButton />
                        <SkeletonButton />
                        <SkeletonButton />
                    </>
                )}

                {/* Live actions — animate in when context switches */}
                {!isLoading && actions.map((action) => {
                    const Icon = ICON_MAP[action.icon];
                    if (!Icon) return null; // graceful: skip unmapped icons

                    const colorClasses = ACTION_COLORS[action.color] ?? ACTION_COLORS.blue;
                    const allowed = action.allowed;

                    return (
                        <button
                            key={`${contextKey}-${action.key}`}
                            onClick={() => allowed && handleAction(action.key)}
                            disabled={!allowed}
                            title={`${action.label}${action.shortcut ? ` (${action.shortcut})` : ""}`}
                            aria-label={action.label}
                            className={`
                                relative group w-10 h-10 rounded-full flex items-center justify-center
                                border transition-all duration-200 flex-shrink-0
                                ${colorClasses}
                                ${action.primary
                                    ? "shadow-md shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-105"
                                    : "hover:brightness-125 hover:scale-105"
                                }
                                ${!allowed
                                    ? "opacity-30 cursor-not-allowed"
                                    : "cursor-pointer"
                                }
                            `}
                        >
                            <Icon className="w-4 h-4" />

                            {/* Keyboard shortcut badge */}
                            {action.shortcut && (
                                <span className="
                                    pointer-events-none absolute -bottom-1 -right-1
                                    text-[9px] bg-black/75 border border-white/15 text-white
                                    px-1 py-px rounded
                                    opacity-0 group-hover:opacity-100
                                    transition-opacity whitespace-nowrap z-10 font-mono
                                ">
                                    {action.shortcut}
                                </span>
                            )}

                            {/* Label tooltip on hover */}
                            <span className="
                                pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2
                                text-[10px] font-semibold
                                bg-[#1a2f5e]/95 border border-white/10 text-white/80
                                px-2.5 py-1 rounded-lg shadow-lg
                                opacity-0 group-hover:opacity-100
                                transition-opacity whitespace-nowrap z-10
                            ">
                                {action.label}
                            </span>

                            {/* RBAC-denied tooltip — only shows when auth is done AND denied */}
                            {!allowed && (
                                <span className="
                                    pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2
                                    text-[9px] bg-red-900/90 border border-red-500/30 text-red-300
                                    px-2 py-0.5 rounded
                                    opacity-0 group-hover:opacity-100
                                    transition-opacity whitespace-nowrap z-10
                                ">
                                    No permission
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default OrgGlobalActionBar;
