/**
 * moduleRegistry.js — Phase 24 System Intelligence Panel
 *
 * Static registry of all platform modules with:
 *   - Module key, name, icon, description
 *   - Dependencies
 *   - Risk classification
 *   - Feature sub-items
 *
 * This file provides the DECLARATIVE source for module metadata.
 * Actual state (enabled/disabled/locked/flagged) is computed at runtime
 * by cross-referencing FeatureContext + CapabilityContext.
 *
 * PLANE: Org only
 */

export const MODULE_REGISTRY = [
    {
        key: "patients",
        name: "Patients",
        icon: "👤",
        description: "Patient records, demographics, medical history, and clinical notes.",
        dependency: null,
        features: [
            { key: "patients.read",   name: "View Patients",      risk: "low",      source: "admin" },
            { key: "patients.create", name: "Create Patients",     risk: "medium",   source: "admin" },
            { key: "patients.update", name: "Edit Patients",       risk: "medium",   source: "admin" },
            { key: "patients.delete", name: "Delete Patients",     risk: "critical", source: "admin" },
        ],
    },
    {
        key: "appointments",
        name: "Appointments",
        icon: "📅",
        description: "Scheduling, time slots, reminders, and appointment management.",
        dependency: "patients",
        features: [
            { key: "appointments.read",   name: "View Appointments",   risk: "low",    source: "admin" },
            { key: "appointments.create", name: "Book Appointments",    risk: "low",    source: "admin" },
            { key: "appointments.update", name: "Modify Appointments",  risk: "medium", source: "admin" },
            { key: "appointments.delete", name: "Cancel Appointments",  risk: "medium", source: "admin" },
        ],
    },
    {
        key: "calendar",
        name: "Calendar",
        icon: "🗓️",
        description: "Visual calendar interface with day/week/month views and drag scheduling.",
        dependency: "appointments",
        features: [
            { key: "calendar.read",   name: "View Calendar",  risk: "low", source: "admin" },
            { key: "calendar.manage", name: "Manage Calendar", risk: "low", source: "admin" },
        ],
    },
    {
        key: "treatments",
        name: "Clinical Treatments",
        icon: "🦷",
        description: "Treatment plans, procedures, dental charting, and clinical workflows.",
        dependency: "patients",
        features: [
            { key: "treatments.read",   name: "View Treatments",   risk: "low",    source: "admin" },
            { key: "treatments.create", name: "Create Treatments",  risk: "medium", source: "admin" },
            { key: "treatments.update", name: "Modify Treatments",  risk: "medium", source: "admin" },
        ],
    },
    {
        key: "orthodontics",
        name: "Orthodontics",
        icon: "🔬",
        description: "Orthodontic case management, 3D mesh analysis, and AI segmentation pipeline.",
        dependency: "patients",
        features: [
            { key: "orthodontics.read",     name: "View Cases",        risk: "low",      source: "plan" },
            { key: "orthodontics.create",   name: "Create Cases",      risk: "medium",   source: "plan" },
            { key: "orthodontics.aiAnalysis", name: "AI Segmentation", risk: "critical", source: "flag" },
        ],
    },
    {
        key: "finance",
        name: "Finance & Billing",
        icon: "💳",
        description: "Invoices, payments, accounting ledger, and financial reporting.",
        dependency: null,
        features: [
            { key: "accounting.read",   name: "View Finances",     risk: "medium",   source: "admin" },
            { key: "accounting.create", name: "Create Invoices",    risk: "medium",   source: "admin" },
            { key: "accounting.update", name: "Process Payments",   risk: "critical", source: "admin" },
        ],
    },
    {
        key: "inventory",
        name: "Inventory",
        icon: "📦",
        description: "Stock management, supply tracking, and procurement workflows.",
        dependency: null,
        features: [
            { key: "inventory.read",   name: "View Inventory",   risk: "low",    source: "admin" },
            { key: "inventory.create", name: "Add Stock",          risk: "low",    source: "admin" },
            { key: "inventory.update", name: "Update Inventory",   risk: "medium", source: "admin" },
        ],
    },
    {
        key: "lab",
        name: "Lab Management",
        icon: "🧪",
        description: "Laboratory orders, case tracking, and integration with external labs.",
        dependency: null,
        features: [
            { key: "lab.read",   name: "View Lab Orders",   risk: "low",  source: "plan" },
            { key: "lab.create", name: "Create Lab Orders",  risk: "low",  source: "plan" },
            { key: "lab.update", name: "Update Lab Status",  risk: "medium", source: "plan" },
        ],
    },
    {
        key: "communication",
        name: "Communication",
        icon: "💬",
        description: "Patient messaging, SMS/WhatsApp notifications, and communication logs.",
        dependency: "patients",
        features: [
            { key: "communication.read", name: "View Messages",  risk: "low",    source: "plan" },
            { key: "communication.send", name: "Send Messages",   risk: "medium", source: "plan" },
        ],
    },
    {
        key: "analytics",
        name: "Analytics & Reports",
        icon: "📊",
        description: "Business intelligence dashboards, custom reports, and data export.",
        dependency: null,
        features: [
            { key: "analytics.read",   name: "View Analytics",  risk: "low",    source: "plan" },
            { key: "analytics.export", name: "Export Reports",   risk: "medium", source: "plan" },
        ],
    },
    {
        key: "dashboard",
        name: "Dashboard",
        icon: "🏠",
        description: "Organization overview with KPIs, recent activity, and quick actions.",
        dependency: null,
        features: [
            { key: "dashboard.read",      name: "View Dashboard",    risk: "low", source: "system" },
            { key: "dashboard.customize", name: "Customize Layout",  risk: "low", source: "admin" },
        ],
    },
    {
        key: "security",
        name: "Security Center",
        icon: "🛡️",
        description: "Audit logs, access control, auth analytics, and policy enforcement.",
        dependency: null,
        features: [
            { key: "security.read",   name: "View Audit Logs",    risk: "critical", source: "admin" },
            { key: "security.manage", name: "Manage Security",     risk: "critical", source: "admin" },
        ],
    },
    {
        key: "portal",
        name: "Patient Portal",
        icon: "🌐",
        description: "Self-service patient portal for booking, invoices, and treatment history.",
        dependency: "patients",
        features: [
            { key: "portal.enabled", name: "Portal Access", risk: "medium", source: "plan" },
        ],
    },
    {
        key: "users",
        name: "Staff Management",
        icon: "👥",
        description: "User accounts, role assignment, branch association, and access control.",
        dependency: null,
        features: [
            { key: "users.read",   name: "View Staff",    risk: "low",      source: "admin" },
            { key: "users.create", name: "Add Staff",      risk: "medium",   source: "admin" },
            { key: "users.update", name: "Edit Staff",      risk: "medium",   source: "admin" },
            { key: "users.delete", name: "Remove Staff",    risk: "critical", source: "admin" },
        ],
    },
    {
        key: "branches",
        name: "Branches",
        icon: "🏢",
        description: "Multi-branch clinic management with per-branch settings and staff.",
        dependency: null,
        features: [
            { key: "branches.read",   name: "View Branches",   risk: "low",    source: "admin" },
            { key: "branches.create", name: "Add Branches",     risk: "medium", source: "plan" },
            { key: "branches.update", name: "Edit Branches",     risk: "medium", source: "admin" },
        ],
    },
];

/**
 * Get all features flattened from module registry
 */
export function getAllFeatures() {
    const features = [];
    for (const mod of MODULE_REGISTRY) {
        for (const feat of mod.features) {
            features.push({
                ...feat,
                module: mod.name,
                moduleKey: mod.key,
            });
        }
    }
    return features;
}

/**
 * Sample roles for the entitlement matrix demo
 */
export const SAMPLE_ROLES = [
    { key: "admin",      name: "Admin" },
    { key: "doctor",     name: "Doctor" },
    { key: "receptionist", name: "Receptionist" },
    { key: "hygienist",  name: "Hygienist" },
    { key: "accountant", name: "Accountant" },
];

/**
 * Sample matrix data
 */
export const SAMPLE_MATRIX = {
    admin: {
        "patients.read": "granted", "patients.create": "granted", "patients.update": "granted", "patients.delete": "granted",
        "appointments.read": "granted", "appointments.create": "granted", "appointments.update": "granted",
        "treatments.read": "granted", "treatments.create": "granted",
        "accounting.read": "granted", "accounting.create": "granted",
        "security.read": "granted", "security.manage": "granted",
        "users.read": "granted", "users.create": "granted", "users.update": "granted",
        "branches.read": "granted", "branches.create": "granted",
        "inventory.read": "granted", "analytics.read": "granted",
    },
    doctor: {
        "patients.read": "granted", "patients.create": "granted", "patients.update": "granted", "patients.delete": false,
        "appointments.read": "granted", "appointments.create": "granted", "appointments.update": "granted",
        "treatments.read": "granted", "treatments.create": "granted",
        "accounting.read": "inherited",
        "security.read": false, "security.manage": false,
        "inventory.read": "inherited",
    },
    receptionist: {
        "patients.read": "granted", "patients.create": "granted", "patients.update": false,
        "appointments.read": "granted", "appointments.create": "granted", "appointments.update": "granted",
        "treatments.read": false,
        "accounting.read": "granted", "accounting.create": "granted",
        "security.read": false,
    },
    hygienist: {
        "patients.read": "granted", "patients.create": false, "patients.update": "granted",
        "appointments.read": "granted", "appointments.create": false,
        "treatments.read": "granted", "treatments.create": "granted",
    },
    accountant: {
        "patients.read": "inherited",
        "accounting.read": "granted", "accounting.create": "granted", "accounting.update": "granted",
        "analytics.read": "granted", "analytics.export": "granted",
    },
};
