/**
 * uiManifest.js — UI Engine Manifest (Pure Data, Zero Dependencies)
 *
 * STANDALONE — no module-alias, no mongoose, no DB connection.
 * This file is safe to require() from codegen scripts.
 *
 * It is the authoritative UI contract that the generator reads.
 * featureRegistry.js defers to this file for UI metadata (single source).
 *
 * USAGE:
 *   const { UI_MANIFEST } = require("./uiManifest");
 *
 * ADDING A NEW MODULE UI:
 *   1. Add the module to featureRegistry.js (runtime concern)
 *   2. Add a ui entry here (frontend contract)
 *   3. Run: npm run generate:ui  (from backend/)
 *
 * PLANE: Cross-plane codegen artifact — ORG PLANE UI only.
 */
"use strict";

/**
 * UI_MANIFEST — Complete frontend UI contract for the ORG plane.
 *
 * Each entry:
 *   key         — featureRegistry key (must match)
 *   label       — Module label
 *   module      — Canonical module key (for FeatureGate)
 *   plans       — Plan tiers (for informational display)
 *   isCore      — Bypasses plan gate
 *   ui          — UI descriptor:
 *     label      — Sidebar label
 *     icon       — Heroicon component name (@heroicons/react/24/outline)
 *     route      — React Router path segment (relative to /org, no leading slash)
 *     page       — Component name in src/pages/org/ index
 *     permission — RBAC permission key (null = no gate)
 *     module     — FeatureGate module key (null = always visible)
 *     category   — "core"|"clinical"|"financial"|"intelligence"|"admin"|"system"
 *     order      — Integer sort order for sidebar (ascending)
 *     hidden     — If true, no sidebar entry (default false)
 *     children   — Array of child route descriptors (same shape, hidden:true by default)
 */
const UI_MANIFEST = [

    // ─────────────────────────────────────────────────
    // CORE — available on all plans
    // ─────────────────────────────────────────────────

    {
        key: "dashboard",
        label: "Dashboard",
        module: "patients",    // core
        plans: ["basic", "pro", "enterprise"],
        isCore: true,
        ui: {
            label:      "Dashboard",
            icon:       "HomeIcon",
            route:      "dashboard",
            page:       "Dashboard",
            permission: null,
            module:     null,
            category:   "core",
            order:      1,
        },
    },

    {
        key: "patients",
        label: "Patients",
        module: "patients",
        plans: ["basic", "pro", "enterprise"],
        isCore: true,
        ui: {
            label:      "Patients",
            icon:       "UsersIcon",
            route:      "patients",
            page:       "PatientsPage",
            permission: "patients.read",
            module:     "patients",
            category:   "core",
            order:      2,
            children: [
                {
                    label:      "Patient Profile",
                    route:      "patients/:id",
                    page:       "PatientLayout",
                    permission: "patients.read",
                    hidden:     true,
                },
                {
                    label:      "New Patient",
                    route:      "patients/new",
                    page:       "NewPatientPage",
                    permission: "patients.create",
                    hidden:     true,
                },
                {
                    label:      "Patient Workspace",
                    route:      "patients-workspace",
                    page:       "PatientWorkspace",
                    permission: "patients.read",
                    hidden:     true,
                },
            ],
        },
    },

    {
        key: "appointments",
        label: "Calendar",
        module: "appointments",
        plans: ["basic", "pro", "enterprise"],
        isCore: true,
        ui: {
            label:      "Calendar",
            icon:       "CalendarDaysIcon",
            route:      "calendar",
            page:       "CalendarPage",
            permission: "appointments.read",
            module:     "appointments",
            category:   "core",
            order:      3,
            children: [
                {
                    label:      "Appointments List",
                    route:      "appointments",
                    page:       "Appointments",
                    permission: "appointments.read",
                    hidden:     true,
                },
            ],
        },
    },

    {
        key: "clinical",
        label: "Treatments",
        module: "clinical",
        plans: ["basic", "pro", "enterprise"],
        isCore: true,
        ui: {
            label:      "Treatments",
            icon:       "ClipboardDocumentListIcon",
            route:      "treatments",
            page:       "TreatmentsPage",
            permission: "treatments.read",
            module:     "clinical",
            category:   "clinical",
            order:      4,
        },
    },

    // ─────────────────────────────────────────────────
    // PLAN-GATED CLINICAL
    // ─────────────────────────────────────────────────

    {
        key: "orthodontics",
        label: "Orthodontics",
        module: "orthodontics",
        plans: ["pro", "enterprise"],
        isCore: false,
        ui: {
            label:      "Orthodontics",
            icon:       "SparklesIcon",
            route:      "orthodontics",
            page:       "OrthodonticCasesPage",
            permission: "orthodontics.read",
            module:     "orthodontics",
            category:   "clinical",
            order:      5,
            children: [
                {
                    label:      "Case Detail",
                    route:      "orthodontics/:caseId",
                    page:       "OrthodonticCasePage",
                    permission: "orthodontics.read",
                    hidden:     true,
                },
            ],
        },
    },

    // ─────────────────────────────────────────────────
    // FINANCIAL
    // ─────────────────────────────────────────────────

    {
        key: "finance",
        label: "Finance",
        module: "finance",
        plans: ["basic", "pro", "enterprise"],
        isCore: false,
        ui: {
            label:      "Finance",
            icon:       "CurrencyDollarIcon",
            route:      "finance",
            page:       "Finance",
            permission: "accounting.read",
            module:     "finance",
            category:   "financial",
            order:      6,
            children: [
                {
                    label:      "Invoices",
                    route:      "invoices",
                    page:       "OrgInvoicesPage",
                    permission: "accounting.read",
                    hidden:     true,
                },
            ],
        },
    },

    // ─────────────────────────────────────────────────
    // ADMIN
    // ─────────────────────────────────────────────────

    {
        key: "inventory",
        label: "Inventory",
        module: "inventory",
        plans: ["pro", "enterprise"],
        isCore: false,
        ui: {
            label:      "Inventory",
            icon:       "CubeIcon",
            route:      "inventory",
            page:       "Inventory",
            permission: "inventory.read",
            module:     "inventory",
            category:   "admin",
            order:      7,
        },
    },

    // ─────────────────────────────────────────────────
    // INTELLIGENCE
    // ─────────────────────────────────────────────────

    {
        key: "analytics",
        label: "Analytics",
        module: "analytics",
        plans: ["pro", "enterprise"],
        isCore: false,
        ui: {
            label:      "Analytics",
            icon:       "ChartBarIcon",
            route:      "analytics",
            page:       "Analytics",
            permission: "analytics.read",
            module:     "analytics",
            category:   "intelligence",
            order:      8,
        },
    },

    {
        key: "lab",
        label: "Lab",
        module: "lab",
        plans: ["pro", "enterprise"],
        isCore: false,
        ui: {
            label:      "Lab",
            icon:       "BeakerIcon",
            route:      "lab",
            page:       "LabDashboard",
            permission: "lab.read",
            module:     "lab",
            category:   "clinical",
            order:      9,
        },
    },

    // ─────────────────────────────────────────────────
    // SYSTEM — always at the bottom
    // ─────────────────────────────────────────────────

    {
        key: "settings",
        label: "Settings",
        module: "settings",
        plans: ["basic", "pro", "enterprise"],
        isCore: true,
        ui: {
            label:      "Settings",
            icon:       "Cog6ToothIcon",
            route:      "settings",
            page:       "Settings",
            permission: null,
            module:     null,
            category:   "system",
            order:      90,
        },
    },

    {
        key: "profile",
        label: "Profile",
        module: "users",
        plans: ["basic", "pro", "enterprise"],
        isCore: true,
        ui: {
            label:      "Profile",
            icon:       "UserCircleIcon",
            route:      "profile",
            page:       "ProfilePage",
            permission: null,
            module:     null,
            category:   "system",
            order:      91,
        },
    },
];

module.exports = { UI_MANIFEST };
