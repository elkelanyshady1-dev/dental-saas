/**
 * actionRegistry.js — Context-Aware Global Action Bar Config
 * v2.0 — Enterprise Architecture
 *
 * Maps route contexts to their allowed quick-actions.
 * Each entry is pure data — no imports, no side effects.
 *
 * Action shape:
 *   key      {string}  — unique action identifier, used by useDashboardAction
 *   icon     {string}  — heroicon name (resolved by ICON_MAP in OrgGlobalActionBar)
 *   label    {string}  — tooltip / aria-label
 *   perm     {string}  — "module.action" checked against hasPermission()
 *   shortcut {string?} — optional keyboard hint (display only)
 *   primary  {bool?}   — renders CTA-style (filled blue)
 *   color    {string}  — Tailwind classes for icon + bg + border
 */

export const ACTION_COLORS = {
    blue: "text-blue-300    bg-blue-500/20    border-blue-400/20",
    emerald: "text-emerald-300 bg-emerald-500/20  border-emerald-400/20",
    rose: "text-rose-300    bg-rose-500/20     border-rose-400/20",
    amber: "text-amber-300   bg-amber-500/20    border-amber-400/20",
    indigo: "text-indigo-300  bg-indigo-500/20   border-indigo-400/20",
    cyan: "text-cyan-300    bg-cyan-500/20     border-cyan-400/20",
    purple: "text-purple-300  bg-purple-500/20   border-purple-400/20",
    sky: "text-sky-300     bg-sky-600/20      border-sky-500/20",
    white: "text-white       bg-blue-500        border-blue-400/50",
    violet: "text-violet-300  bg-violet-500/20   border-violet-400/20",
    teal: "text-teal-300    bg-teal-500/20     border-teal-400/20",
    orange: "text-orange-300  bg-orange-500/20   border-orange-400/20",
};

export const actionRegistry = {

    /**
     * /org/dashboard
     * High-level quick actions for the daily workflow overview
     */
    dashboard: [
        { key: "send_sms", icon: "ChatBubbleLeftEllipsis", label: "Send SMS", perm: "patients.read", shortcut: "⌘S", color: "indigo" },
        { key: "add_task", icon: "ClipboardDocumentList", label: "Add Task", perm: "calendar.read", color: "amber" },
        { key: "add_appointment", icon: "Calendar", label: "Add Appointment", perm: "appointments.create", shortcut: "⌘A", color: "sky" },
        { key: "add_patient", icon: "UserPlus", label: "Add Patient", perm: "patients.create", shortcut: "⌘P", color: "white", primary: true },
    ],

    /**
     * /org/patients (list view)
     * Patient management actions
     */
    patients: [
        { key: "import_csv", icon: "ArrowUpTray", label: "Import CSV", perm: "patients.create", color: "violet" },
        { key: "send_sms", icon: "ChatBubbleLeftEllipsis", label: "Send Bulk SMS", perm: "patients.read", color: "indigo" },
        { key: "add_patient", icon: "UserPlus", label: "Add Patient", perm: "patients.create", shortcut: "⌘P", color: "white", primary: true },
    ],

    /**
     * /org/patients/:id (single patient profile)
     * Clinical and billing actions for a specific patient
     */
    patient_profile: [
        { key: "add_prescription", icon: "PencilSquare", label: "Prescription", perm: "treatments.update", color: "cyan" },
        { key: "add_treatment", icon: "DocumentPlus", label: "Add Treatment", perm: "treatments.create", shortcut: "⌘T", color: "purple" },
        { key: "new_invoice", icon: "CurrencyDollar", label: "New Invoice", perm: "accounting.create", color: "emerald" },
        { key: "add_appointment", icon: "Calendar", label: "New Appointment", perm: "appointments.create", shortcut: "⌘A", color: "sky" },
    ],

    /**
     * /org/appointments
     */
    appointments: [
        { key: "send_sms", icon: "ChatBubbleLeftEllipsis", label: "Send SMS", perm: "patients.read", color: "indigo" },
        { key: "add_appointment", icon: "Calendar", label: "New Appointment", perm: "appointments.create", shortcut: "⌘A", color: "white", primary: true },
    ],

    /**
     * /org/finance
     */
    finance: [
        { key: "add_expense", icon: "CircleStack", label: "Add Expense", perm: "accounting.create", color: "rose" },
        { key: "add_income", icon: "CurrencyDollar", label: "Add Income", perm: "accounting.create", color: "white", primary: true },
    ],

    /**
     * /org/calendar
     */
    calendar: [
        { key: "add_appointment", icon: "Calendar", label: "New Appointment", perm: "appointments.create", shortcut: "⌘A", color: "white", primary: true },
    ],

    /**
     * /org/analytics
     */
    analytics: [
        { key: "export_report", icon: "ArrowDownTray", label: "Export Report", perm: "accounting.read", color: "teal" },
    ],

    /**
     * /org/inventory
     */
    inventory: [
        { key: "add_stock", icon: "Plus", label: "Add Stock", perm: "inventory.create", color: "emerald" },
        { key: "import_csv", icon: "ArrowUpTray", label: "Import CSV", perm: "inventory.create", color: "violet" },
    ],

    /**
     * /org/settings
     */
    settings: [
        { key: "save_settings", icon: "CheckCircle", label: "Save Changes", perm: "branches.update", color: "white", primary: true },
    ],

    /**
     * Fallback — shown when no context matches
     */
    default: [
        { key: "send_sms", icon: "ChatBubbleLeftEllipsis", label: "Send SMS", perm: "patients.read", color: "indigo" },
        { key: "add_appointment", icon: "Calendar", label: "Add Appointment", perm: "appointments.create", shortcut: "⌘A", color: "sky" },
        { key: "add_patient", icon: "UserPlus", label: "Add Patient", perm: "patients.create", shortcut: "⌘P", color: "white", primary: true },
    ],
};
