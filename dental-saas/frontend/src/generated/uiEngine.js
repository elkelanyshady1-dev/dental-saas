// ⚠️  AUTO-GENERATED FILE — DO NOT MANUALLY EDIT
// Regenerate with: npm run generate:ui  (from backend/ directory)
// Source of truth: backend/src/platform/uiManifest.js
// Generated at: 2026-03-31T05:00:00.000Z

/**
 * ROUTES — flat list of all org-plane routes derived from uiManifest.
 *
 * Each entry:
 *   path         — React Router path segment (relative to /org)
 *   page         — Page component name (registered in src/pages/org/index.js)
 *   permission   — RBAC permission key (null = no permission gate)
 *   module       — FeatureGate module key (null = always visible)
 *   featureGated — true if this route needs a <FeatureGate> wrapper
 *   hidden       — true if child route with no sidebar entry
 */
export const ROUTES = [
  { "path": "dashboard",          "page": "Dashboard",           "permission": null,                 "module": null,            "featureGated": false },
  { "path": "patients",           "page": "PatientsPage",        "permission": "patients.read",      "module": "patients",      "featureGated": false },
  { "path": "patients/:id",       "page": "PatientLayout",       "permission": "patients.read",      "module": "patients",      "featureGated": false, "hidden": true },
  { "path": "patients/new",       "page": "NewPatientPage",      "permission": "patients.create",    "module": "patients",      "featureGated": false, "hidden": true },
  { "path": "patients-workspace", "page": "PatientWorkspace",    "permission": "patients.read",      "module": "patients",      "featureGated": false, "hidden": true },
  { "path": "calendar",           "page": "CalendarPage",        "permission": "appointments.read",  "module": "appointments",  "featureGated": false },
  { "path": "appointments",       "page": "Appointments",        "permission": "appointments.read",  "module": "appointments",  "featureGated": false, "hidden": true },
  { "path": "treatments",         "page": "TreatmentsPage",      "permission": "treatments.read",    "module": "clinical",      "featureGated": false },
  { "path": "orthodontics",       "page": "OrthodonticCasesPage","permission": "orthodontics.read",  "module": "orthodontics",  "featureGated": true  },
  { "path": "orthodontics/:caseId","page": "OrthodonticCasePage","permission": "orthodontics.read",  "module": "orthodontics",  "featureGated": true,  "hidden": true },
  { "path": "finance",            "page": "Finance",             "permission": "accounting.read",    "module": "finance",       "featureGated": true  },
  { "path": "invoices",           "page": "OrgInvoicesPage",     "permission": "accounting.read",    "module": "finance",       "featureGated": true,  "hidden": true },
  { "path": "inventory",          "page": "Inventory",           "permission": "inventory.read",     "module": "inventory",     "featureGated": true  },
  { "path": "analytics",          "page": "Analytics",           "permission": "analytics.read",     "module": "analytics",     "featureGated": true  },
  { "path": "lab",                "page": "LabDashboard",        "permission": "lab.read",           "module": "lab",           "featureGated": true  },
  { "path": "settings",           "page": "Settings",            "permission": null,                 "module": null,            "featureGated": false },
  { "path": "profile",            "page": "ProfilePage",         "permission": null,                 "module": null,            "featureGated": false }
];

/**
 * SIDEBAR — ordered navigation items for AutoSidebar.
 *
 * Each entry:
 *   label      — Display label
 *   icon       — Heroicon component name (import from @heroicons/react/24/outline)
 *   route      — URL segment relative to /org
 *   permission — RBAC permission key (null = always visible when authenticated)
 *   module     — FeatureContext module key (null = always visible)
 *   category   — "core" | "clinical" | "financial" | "intelligence" | "admin" | "system"
 *   order      — Sort order (ascending)
 *   isCore     — true if module is always available regardless of plan
 *   plans      — plan tiers that include this entry
 */
export const SIDEBAR = [
  { "label": "Dashboard",    "icon": "HomeIcon",                    "route": "dashboard",    "permission": null,                "module": null,           "category": "core",          "order": 1,  "isCore": true,  "plans": ["basic","pro","enterprise"] },
  { "label": "Patients",     "icon": "UsersIcon",                   "route": "patients",     "permission": "patients.read",     "module": "patients",     "category": "core",          "order": 2,  "isCore": true,  "plans": ["basic","pro","enterprise"] },
  { "label": "Calendar",     "icon": "CalendarDaysIcon",            "route": "calendar",     "permission": "appointments.read", "module": "appointments", "category": "core",          "order": 3,  "isCore": true,  "plans": ["basic","pro","enterprise"] },
  { "label": "Treatments",   "icon": "ClipboardDocumentListIcon",   "route": "treatments",   "permission": "treatments.read",   "module": "clinical",     "category": "clinical",      "order": 4,  "isCore": true,  "plans": ["basic","pro","enterprise"] },
  { "label": "Orthodontics", "icon": "SparklesIcon",                "route": "orthodontics", "permission": "orthodontics.read", "module": "orthodontics", "category": "clinical",      "order": 5,  "isCore": false, "plans": ["pro","enterprise"]         },
  { "label": "Finance",      "icon": "CurrencyDollarIcon",          "route": "finance",      "permission": "accounting.read",   "module": "finance",      "category": "financial",     "order": 6,  "isCore": false, "plans": ["basic","pro","enterprise"] },
  { "label": "Inventory",    "icon": "CubeIcon",                    "route": "inventory",    "permission": "inventory.read",    "module": "inventory",    "category": "admin",         "order": 7,  "isCore": false, "plans": ["pro","enterprise"]         },
  { "label": "Analytics",    "icon": "ChartBarIcon",                "route": "analytics",    "permission": "analytics.read",    "module": "analytics",    "category": "intelligence",  "order": 8,  "isCore": false, "plans": ["pro","enterprise"]         },
  { "label": "Lab",          "icon": "BeakerIcon",                  "route": "lab",          "permission": "lab.read",          "module": "lab",          "category": "clinical",      "order": 9,  "isCore": false, "plans": ["pro","enterprise"]         },
  { "label": "Settings",     "icon": "Cog6ToothIcon",               "route": "settings",     "permission": null,                "module": null,           "category": "system",        "order": 90, "isCore": true,  "plans": ["basic","pro","enterprise"] },
  { "label": "Profile",      "icon": "UserCircleIcon",              "route": "profile",      "permission": null,                "module": null,           "category": "system",        "order": 91, "isCore": true,  "plans": ["basic","pro","enterprise"] }
];

/**
 * PAGES — deduplicated list of all page component names referenced in ROUTES.
 * Used by PageLoader.jsx for validation and dynamic import.
 */
export const PAGES = [
  "Dashboard",
  "PatientsPage",
  "PatientLayout",
  "NewPatientPage",
  "PatientWorkspace",
  "CalendarPage",
  "Appointments",
  "TreatmentsPage",
  "OrthodonticCasesPage",
  "OrthodonticCasePage",
  "Finance",
  "OrgInvoicesPage",
  "Inventory",
  "Analytics",
  "LabDashboard",
  "Settings",
  "ProfilePage"
];
