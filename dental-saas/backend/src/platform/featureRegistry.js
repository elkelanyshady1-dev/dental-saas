/**
 * featureRegistry.js — Unified Feature & Module Registry (Single Source of Truth)
 *
 * TASK-ENTITLEMENT-SYSTEM-002 — Phase B.1 SSOT Consolidation
 *
 * PURPOSE:
 * This is the ONLY source of truth for module definitions in the entire system.
 * Both the **entitlement pipeline** and the **runtime module engine** derive all
 * configuration from this single registry.
 *
 * It serves THREE roles:
 *   1. **Entitlement**: Maps canonical module keys → PlanVersion schema keys,
 *      preventing schema mismatches (e.g. orthodontics → orthodonticsAdv).
 *   2. **Runtime**: Provides basePath, routeFactory, selfContained flags for
 *      the module loader (replaces the old MODULE_REGISTRY).
 *   3. **Capability**: Defines sub-feature permissions for RBAC integration.
 *
 * Every layer reads from this registry:
 *   planCapabilityBuilder → normalizeModules()
 *   requireEntitlement    → CORE_MODULES derived from registry
 *   requireModule         → MODULE_REGISTRY derived from registry
 *   moduleLoader          → MODULE_REGISTRY derived from registry
 *   moduleLifecycle       → MODULE_REGISTRY derived from registry
 *   unifiedCapabilityResolver → feature derivation
 *   Frontend FeatureProvider  → module keys for gating
 *
 * ADDING A NEW MODULE:
 *   1. Add schema field to PlanVersion.model.js → versionModulesSchema
 *   2. Add entry to FEATURE_REGISTRY below (including basePath + routeFactory)
 *   3. Deploy — all layers auto-resolve
 *
 * PLANE: Shared — used by both platform and org plane services.
 */

"use strict";

// ─── Route Imports — LAZY LOADED ─────────────────────────────────────────────
// Phase X: All route imports moved into routeFactory() lambdas below.
// This breaks the circular dependency chain:
//   featureRegistry → route files → middleware → featureRegistry
// Routes are loaded on first access (boot time via moduleLoader.js),
// which is AFTER this module is fully initialized.
// ─────────────────────────────────────────────────────────────────────────────


/**
 * @typedef {Object} FeatureDefinition
 * @property {string}   label       — Human-readable name for UI/logs
 * @property {string}   module      — Canonical module key used by requireEntitlement()
 * @property {string}   schemaKey   — Matching field name in PlanVersion.modules
 * @property {boolean}  isCore      — Core modules bypass entitlement checks
 * @property {string[]} plans       — Plan tiers that include this module
 * @property {Object}   [features]  — Sub-feature capabilities within this module
 *
 * ── Runtime Fields (Phase B.1) ───────────────────────────────────────────────
 * @property {string}   [basePath]      — URL path segment under /api/v1/org/
 * @property {Function} [routeFactory]  — Returns the Express Router for this module
 * @property {boolean}  [selfContained] — true if route file applies its own middleware
 * @property {string}   [category]      — "core" | "clinical" | "financial" | "intelligence" | "admin"
 * @property {string[]} [dependencies]  — Registry keys this module depends on
 * @property {string}   [description]   — Human-readable description for admin UI
 */

/**
 * FEATURE_REGISTRY — Single source of truth for all system modules.
 *
 * The `module` key is the canonical application key (used everywhere).
 * The `schemaKey` is the DB field in PlanVersion.modules (may differ).
 *
 * Runtime fields (basePath, routeFactory, selfContained) power the module loader.
 * If schemaKey is omitted, it defaults to the same as the module key.
 */
const FEATURE_REGISTRY = Object.freeze({

    // ─── Core Modules (all plans) ────────────────────────────────────────────
    patients: Object.freeze({
        label: "Patients",
        module: "patients",
        schemaKey: "patients",
        isCore: true,
        plans: ["basic", "pro", "enterprise"],
        features: {
            view:           { permission: "patients.read" },
            create:         { permission: "patients.create" },
            update:         { permission: "patients.update" },
            delete:         { permission: "patients.delete" },
            intake:         { permission: "patients.update" },
            intelligence:   { permission: "patients.update", premium: true },
        },
        // ── Runtime ──
        basePath: "patients",
        category: "core",
        selfContained: false,
        dependencies: [],
        description: "Patient domain — registration, clinical records, documents",
        routeFactory: () => require("../modules/patientDomain/patientDomain.routes"),
        // ── UI Engine Contract ──
        ui: {
            label: "Patients",
            icon: "UsersIcon",
            route: "patients",
            page: "PatientsPage",
            permission: "patients.read",
            module: "patients",
            category: "core",
            order: 2,
            children: [
                {
                    label: "Patient Profile",
                    route: "patients/:id",
                    page: "PatientLayout",
                    permission: "patients.read",
                },
                {
                    label: "New Patient",
                    route: "patients/new",
                    page: "NewPatientPage",
                    permission: "patients.create",
                    hidden: true,   // nav-hidden; wired by child-route only
                },
            ],
        },
    }),

    appointments: Object.freeze({
        label: "Appointments",
        module: "appointments",
        schemaKey: "appointments",
        isCore: true,
        plans: ["basic", "pro", "enterprise"],
        features: {
            view:   { permission: "appointments.read" },
            create: { permission: "appointments.create" },
            manage: { permission: "appointments.update" },
        },
        // ✅ AUDIT-002 — Migrated from legacy app.js mount to featureRegistry routeFactory.
        // Entitlement gate now enforced via requireEntitlement("appointments") in routes.
        basePath: "appointments",
        category: "core",
        selfContained: false,
        dependencies: [],
        description: "Appointment management — scheduling, status tracking",
        routeFactory: () => require("../modules/appointmentDomain/routes/appointment.routes"),
        // ── UI Engine Contract ──
        ui: {
            label: "Calendar",
            icon: "CalendarDaysIcon",
            route: "calendar",
            page: "CalendarPage",
            permission: "appointments.read",
            module: "appointments",
            category: "core",
            order: 3,
            children: [
                {
                    label: "Appointments List",
                    route: "appointments",
                    page: "Appointments",
                    permission: "appointments.read",
                    hidden: true,
                },
            ],
        },
    }),

    users: Object.freeze({
        label: "User Management",
        module: "users",
        schemaKey: "users",
        isCore: true,
        plans: ["basic", "pro", "enterprise"],
        features: {},
        // ── Runtime ──
        basePath: "users",
        category: "core",
        selfContained: true,
        dependencies: [],
        description: "User management — org user CRUD, role assignment",
        routeFactory: () => require("../modules/users/routes/users.routes"),
    }),

    branches: Object.freeze({
        label: "Branch Management",
        module: "branches",
        schemaKey: "branches",
        isCore: true,
        plans: ["basic", "pro", "enterprise"],
        features: {},
        // ── Runtime ──
        basePath: "branches",
        category: "core",
        selfContained: true,
        dependencies: [],
        description: "Branch management — multi-location CRUD, timezone",
        routeFactory: () => require("../modules/branches/routes/branches.routes"),
    }),

    notifications: Object.freeze({
        label: "Notifications",
        module: "notifications",
        schemaKey: "notifications",
        isCore: true,
        plans: ["basic", "pro", "enterprise"],
        features: {},
        // ── Runtime ──
        basePath: "notifications",
        category: "core",
        selfContained: false,
        dependencies: [],
        description: "Notification domain — real-time alerts, bell, delivery",
        routeFactory: () => require("../modules/notificationDomain/notification.routes"),
    }),

    clinical: Object.freeze({
        label: "Clinical Operations",
        module: "clinical",
        schemaKey: "clinical",
        isCore: true,
        plans: ["basic", "pro", "enterprise"],
        features: {
            procedures: { permission: "procedures.read" },
            treatments: { permission: "treatments.read" },
        },
        // ── Runtime ── (No basePath — procedures/treatments mounted separately below)
        basePath: null,
        category: "clinical",
        selfContained: false,
        dependencies: [],
        description: "Clinical operations — procedures, treatments (meta-module)",
        routeFactory: null,
        // ── UI Engine Contract ──
        ui: {
            label: "Treatments",
            icon: "BeakerIcon",
            route: "treatments",
            page: "TreatmentsPage",
            permission: "treatments.read",
            module: "clinical",
            category: "clinical",
            order: 4,
        },
    }),

    settings: Object.freeze({
        label: "Settings",
        module: "settings",
        schemaKey: "settings",
        isCore: true,
        plans: ["basic", "pro", "enterprise"],
        features: {},
        // ── Runtime ── (No basePath — mounted via legacy routes in app.js)
        basePath: null,
        category: "core",
        selfContained: false,
        dependencies: [],
        description: "Organization settings",
        routeFactory: null,
        // ── UI Engine Contract ──
        ui: {
            label: "Settings",
            icon: "Cog6ToothIcon",
            route: "settings",
            page: "Settings",
            permission: null,    // accessible to all authenticated org users
            module: null,
            category: "system",
            order: 90,
        },
    }),

    // ─── Plan-Gated Modules ──────────────────────────────────────────────────

    finance: Object.freeze({
        label: "Finance",
        module: "finance",
        schemaKey: "finance",
        isCore: false,
        plans: ["basic", "pro", "enterprise"],
        features: {
            invoices:   { permission: "invoices.read" },
            payments:   { permission: "payments.read" },
            analytics:  { permission: "finance.analytics", premium: true },
        },
        // ── Runtime ── (finance itself has a basePath; invoices/payments are separate mounts)
        basePath: "finance",
        category: "financial",
        selfContained: true,
        dependencies: [],
        description: "Finance analytics — daily/monthly summaries, outstanding",
        routeFactory: () => require("../modules/billingDomain/analytics/routes/billingAnalytics.routes"),
        // ── UI Engine Contract ──
        ui: {
            label: "Finance",
            icon: "CurrencyDollarIcon",
            route: "finance",
            page: "Finance",
            permission: "accounting.read",
            module: "finance",
            category: "financial",
            order: 6,
            children: [
                {
                    label: "Invoices",
                    route: "invoices",
                    page: "OrgInvoicesPage",
                    permission: "accounting.read",
                    hidden: true,
                },
            ],
        },
    }),

    // ─── Accounting Analytics Domain (Phase 2) ───────────────────────────────
    // READ MODEL — Analytical layer consuming billingDomain event projections.
    // Strictly separated from billingDomain (write side).
    // Data flows: invoice.created / payment.received → eventBus → projections.
    accounting: Object.freeze({
        label: "Accounting Analytics",
        module: "accounting",
        schemaKey: "finance",                    // shares finance entitlement gate
        isCore: false,
        plans: ["basic", "pro", "enterprise"],
        features: {
            dailySummary:    { permission: "accounting.read" },
            monthlySummary:  { permission: "accounting.read" },
            reports:         { permission: "accounting.reports", premium: true },
        },
        // ── Runtime ──
        basePath: "accounting",
        category: "financial",
        selfContained: true,
        dependencies: ["finance"],
        description: "Accounting analytics — revenue summaries, cash flow, P&L (read model)",
        routeFactory: () => require("../modules/accountingDomain/routes/accountingAnalytics.routes"),
    }),

    orthodontics: Object.freeze({
        label: "Orthodontics",
        module: "orthodontics",
        schemaKey: "orthodonticsAdv",   // 🔴 CRITICAL MAPPING — PlanVersion uses "orthodonticsAdv"
        isCore: false,
        plans: ["pro", "enterprise"],
        features: {
            viewCases:      { permission: "orthodontics.read" },
            createCase:     { permission: "orthodontics.full" },
            updateCase:     { permission: "orthodontics.full" },
            monitoring:     { permission: "orthodontics.read" },  // Phase 30: portal.monitoring removed
            aiAnalysis:     { permission: "orthodontics.full", premium: true },  // Phase 30: ai.ortho_analysis removed
            alignerPlans:   { permission: "orthodontics.full" },
        },
        // ── Runtime ──
        basePath: "orthodontics",
        category: "intelligence",
        selfContained: true,
        dependencies: ["patients"],
        description: "Orthodontic cases — CRUD, scans, AI analysis, aligner plans",
        routeFactory: () => require("../modules/orthodontics/routes/orthodonticCase.routes"),
        // ── UI Engine Contract ──
        ui: {
            label: "Orthodontics",
            icon: "SparklesIcon",
            route: "orthodontics",
            page: "OrthodonticCasesPage",
            permission: "orthodontics.read",
            module: "orthodontics",
            category: "clinical",
            order: 5,
            children: [
                {
                    label: "Case Detail",
                    route: "orthodontics/:caseId",
                    page: "OrthodonticCasePage",
                    permission: "orthodontics.read",
                    hidden: true,
                },
            ],
        },
    }),

    analytics: Object.freeze({
        label: "Analytics",
        module: "analytics",
        schemaKey: "analytics",
        isCore: false,
        plans: ["pro", "enterprise"],
        features: {
            dashboard:      { permission: "analytics.read" },
            projections:    { permission: "analytics.read", premium: true },
        },
        // ── Runtime ──
        basePath: "analytics",
        category: "intelligence",
        selfContained: false,
        dependencies: [],
        description: "Analytics domain — role-aware intelligence, projections, KPIs",
        routeFactory: () => require("../modules/analyticsDomain/analytics.routes"),
        // ── UI Engine Contract ──
        ui: {
            label: "Analytics",
            icon: "ChartBarIcon",
            route: "analytics",
            page: "Analytics",
            permission: "analytics.read",
            module: "analytics",
            category: "intelligence",
            order: 8,
        },
    }),

    inventory: Object.freeze({
        label: "Inventory",
        module: "inventory",
        schemaKey: "inventory",
        isCore: false,
        plans: ["pro", "enterprise"],
        features: {
            view:        { permission: "inventory.read" },
            create:      { permission: "inventory.create" },
            manage:      { permission: "inventory.update" },
            orders:      { permission: "inventory.create" },
            dashboard:   { permission: "inventory.read" },
        },
        // ✅ TASK-INV-002 — Wired up: basePath + routeFactory activated
        basePath: "inventory",
        category: "admin",
        selfContained: false,
        dependencies: [],
        description: "Inventory management — stock tracking, movements, purchase orders, projections",
        routeFactory: () => require("../modules/inventoryDomain/routes/inventory.routes"),
        // ── UI Engine Contract ──
        ui: {
            label: "Inventory",
            icon: "CubeIcon",
            route: "inventory",
            page: "Inventory",
            permission: "inventory.read",
            module: "inventory",
            category: "admin",
            order: 7,
        },
    }),

    booking: Object.freeze({
        label: "Online Booking",
        module: "booking",
        schemaKey: "booking",
        isCore: false,
        plans: ["pro", "enterprise"],
        features: {
            slots:      { permission: "booking.read" },
            requests:   { permission: "booking.manage" },
        },
        // ── Runtime ──
        basePath: "booking",
        category: "clinical",
        selfContained: false,
        dependencies: ["patients"],
        description: "Booking domain — patient portal scheduling, slot management",
        routeFactory: () => require("../modules/booking/booking.routes"),
    }),

    lab: Object.freeze({
        label: "Lab Management",
        module: "lab",
        schemaKey: "lab",
        isCore: false,
        plans: ["pro", "enterprise"],
        features: {
            view:     { permission: "lab.read" },
            manage:   { permission: "lab.update" },
            cases:    { permission: "lab.read" },
            claims:   { permission: "lab.read" },
            messages: { permission: "lab.read" },
        },
        // ✅ TASK-LAB-002 — Wired up: combined router factory (labs + lab-cases + lab-claims)
        basePath: "_lab",   // internal mount; actual paths are /labs /lab-cases /lab-claims
        category: "clinical",
        selfContained: false,
        dependencies: ["patients"],
        description: "External lab management — partners, cases, claims, chat",
        routeFactory: () => require("../modules/labDomain/routes/lab.routes").createLabRouter(),
        // ── UI Engine Contract ──
        ui: {
            label: "Lab",
            icon: "BeakerIcon",
            route: "lab",
            page: "LabDashboard",
            permission: "lab.read",
            module: "lab",
            category: "clinical",
            order: 9,
        },
    }),

    communication: Object.freeze({
        label: "Communication",
        module: "communication",
        schemaKey: "communication",
        isCore: false,
        plans: ["pro", "enterprise"],
        features: {
            sms:        { permission: "communication.sms" },
            whatsapp:   { permission: "communication.whatsapp" },
            email:      { permission: "communication.email" },
        },
        // ── Runtime ── (No basePath — communication is infrastructure, not a mounted module)
        basePath: null,
        category: "admin",
        selfContained: false,
        dependencies: [],
        description: "Communication channels — SMS, WhatsApp, email",
        routeFactory: null,
    }),

    // ═══════════════════════════════════════════════════════════════════════════
    // RUNTIME-ONLY ENTRIES — These are routable modules that don't have their
    // own entitlement keys (they share parent module entitlements).
    // They exist here so MODULE_REGISTRY can mount them.
    // ═══════════════════════════════════════════════════════════════════════════

    procedures: Object.freeze({
        label: "Procedures",
        module: "clinical",
        schemaKey: "clinical",
        isCore: true,
        plans: ["basic", "pro", "enterprise"],
        features: {},
        basePath: "procedures",
        category: "clinical",
        selfContained: true,
        dependencies: [],
        description: "Procedure catalog — CRUD, category filter, pricing",
        routeFactory: () => require("../modules/procedures/routes/procedures.routes"),
    }),

    treatments: Object.freeze({
        label: "Treatments",
        module: "clinical",
        schemaKey: "clinical",
        isCore: true,
        plans: ["basic", "pro", "enterprise"],
        features: {},
        basePath: "treatments",
        category: "clinical",
        selfContained: true,
        dependencies: ["procedures"],
        description: "Treatment plans — patient treatment lifecycle",
        routeFactory: () => require("../modules/treatments/routes/treatments.routes"),
    }),

    // ─── Treatment Catalog — Clinical procedure definitions ──────────────────
    // DOMAIN BOUNDARY: This is an ISOLATED domain for clinical category/procedure
    // definitions. It is SEPARATE from:
    //   - `procedures`       (billing catalog — codes, prices, AED)
    //   - `treatments`       (patient treatment records — clinical history)
    //   - `appointments`     (scheduling — reads snapshot from this domain at booking)
    "treatment-catalog": Object.freeze({
        label: "Treatment Catalog",
        module: "clinical",
        schemaKey: "clinical",
        isCore: true,
        plans: ["basic", "pro", "enterprise"],
        features: {
            categories: { permission: "treatments.read" },
            procedures:  { permission: "treatments.read" },
        },
        basePath: "treatment-catalog",
        category: "clinical",
        selfContained: true,
        dependencies: [],
        description: "Treatment catalog — clinical categories and procedure definitions (isolated from billing)",
        routeFactory: () => require("../modules/treatment-catalog/interfaces/routes/treatment-catalog.routes"),
    }),

    // ─── Clinical Snapshots — Immutable per-visit dental chart snapshots ────────
    // DOMAIN BOUNDARY: Write-once visit records for the orthodontic engine.
    // Links OrthodonticCase + Appointment. NO billing data. NO file blobs.
    // Reads: OrthodonticCase (by caseId ref), Appointment (by appointmentId ref)
    // Writes: own ClinicalSnapshot collection only
    "clinical-snapshots": Object.freeze({
        label:    "Clinical Snapshots",
        module:   "orthodontics",      // shares orthodontics plan gate (pro/enterprise)
        schemaKey: "orthodonticsAdv",  // matches PlanVersion.modules.orthodonticsAdv
        isCore:   false,               // plan-gated — NOT a core module
        plans:    ["pro", "enterprise"],
        features: {
            snapshots: { permission: "orthodontics.read" },  // Phase 30: clinical.read removed
        },
        basePath:      "clinical-snapshots",
        category:      "clinical",
        selfContained: true,
        dependencies:  ["orthodontics"],
        description:   "Immutable per-visit dental chart snapshots — orthodontic case engine foundation",
        routeFactory:  () => require("../modules/orthodontics/clinical/routes/clinicalSnapshot.routes"),
    }),

    // ─── Cast Analysis — Study model space + Bolton + Ashley Howe ─────────────
    // DOMAIN BOUNDARY: Standalone write-once cast analysis records.
    // Linked to ClinicalSnapshot via optional snapshotId.
    // Engine: pure deterministic JS (no external dependencies).
    "cast-analysis": Object.freeze({
        label:    "Cast Analysis",
        module:   "orthodontics",
        schemaKey: "orthodonticsAdv",
        isCore:   false,
        plans:    ["pro", "enterprise"],
        features: {
            create: { permission: "orthodontics.full" },  // Phase 30: patients.write removed
            read:   { permission: "orthodontics.read" },  // Phase 30: patients.read → orthodontics.read for ortho-scoped reads
        },
        basePath:      "cast-analysis",
        category:      "clinical",
        selfContained: true,
        dependencies:  ["clinical-snapshots"],
        description:   "Cast analysis — space analysis, Bolton TSD, Ashley Howe index (write-once, deterministic engine)",
        routeFactory:  () => require("../modules/orthodontics/clinical/routes/castAnalysis.routes"),
    }),

    // ─── Orthodontic Cases — Aggregate root for the clinical case engine ─────────
    // DOMAIN BOUNDARY: Service Layer over the canonical OrthodonticCase model.
    // This module does NOT define a new model — it wraps orthodonticCase.model.js.
    // INVARIANT: One active case per patient per org (enforced in case.service.js).
    // Case creation happens via appointment flow — NO direct create API.
    "orthodontic-cases": Object.freeze({
        label:    "Orthodontic Cases",
        module:   "orthodontics",      // shares orthodontics plan gate (pro/enterprise)
        schemaKey: "orthodonticsAdv",  // matches PlanVersion.modules.orthodonticsAdv
        isCore:   false,               // plan-gated — NOT a core module
        plans:    ["pro", "enterprise"],
        features: {
            cases: { permission: "orthodontics.read" },  // Phase 30: clinical.read removed
        },
        basePath:      "orthodontic-cases",
        category:      "clinical",
        selfContained: true,
        dependencies:  ["orthodontics", "clinical-snapshots"],
        description:   "Orthodontic case lifecycle + phase system + visit timeline + snapshot engine (Phase 3)",
        routeFactory:  () => require("../modules/orthodontics/core/routes/case.routes"),
    }),

    // ─── Bonding Engine — Bracket & Tube lifecycle + OPG sync + TAD linkage ────
    // DOMAIN BOUNDARY: Per-tooth bonding records with full history (BONDED/REBONDED/DEBONDED).
    // Integrates with: clinical-snapshots (snapshotId), TAD Engine (linkedTadIds).
    // Upsert pattern: one record per tooth per case — no duplicates.
    bonding: Object.freeze({
        label:    "Bonding Engine",
        module:   "orthodontics",      // shares orthodontics plan gate
        schemaKey: "orthodonticsAdv",  // matches PlanVersion.modules.orthodonticsAdv
        isCore:   false,
        plans:    ["pro", "enterprise"],
        features: {
            apply:    { permission: "orthodontics.full" },   // Phase 30: bonding.manage removed
            debond:   { permission: "orthodontics.full" },   // Phase 30: bonding.manage removed
            read:     { permission: "orthodontics.read" },   // Phase 30: bonding.read removed
            settings: { permission: "orthodontics.full" },   // Phase 30: bonding.settings removed
        },
        basePath:      "bonding",
        category:      "clinical",
        selfContained: true,
        dependencies:  ["orthodontics", "clinical-snapshots"],
        description:   "Bonding Engine — bracket/tube lifecycle, OPG sync, TAD anchorage linking, debond analytics",
        routeFactory:  () => require("../modules/orthodontics/routes/bonding.routes"),
    }),

    // ─── Treatment Sequence Engine V1.5 — Clinical guidance layer ─────────────
    // DOMAIN BOUNDARY: SequencePlan per case + sequenceProgress on WorkflowSnapshot.
    // Guidance only — does NOT mutate bonding, TAD, or chart state.
    // V2 hooks: step.actions[] payload for AI/auto-detection (data stored, not executed).
    sequence: Object.freeze({
        label:    "Treatment Sequence Engine",
        module:   "orthodontics",
        schemaKey: "orthodonticsAdv",
        isCore:   false,
        plans:    ["pro", "enterprise"],
        features: {
            read:   { permission: "orthodontics.read" },
            manage: { permission: "orthodontics.full" },  // Phase 30: orthodontics.update removed
        },
        basePath:      "sequence",
        category:      "clinical",
        selfContained: true,
        dependencies:  ["orthodontics", "clinical-snapshots"],
        description:   "Treatment Sequence Engine V1.5 — guided clinical steps, per-case roadmap, snapshot progress tracking",
        routeFactory:  () => require("../modules/orthodontics/routes/sequence.routes"),
    }),

    // ─── TADs Engine — Miniscrew lifecycle, failure analytics, reinsertion tracking ──
    // DOMAIN BOUNDARY: Per-tooth miniscrew records with event-sourced history.
    // Integrates with: clinical-snapshots (snapshotId), Bonding Engine (linkedTadIds).
    // Status model: ACTIVE → NEEDS_REMOVAL | FAILED | REMOVED → REINSERTED (→ ACTIVE).
    tads: Object.freeze({
        label:    "TADs Engine",
        module:   "orthodontics",      // shares orthodontics plan gate
        schemaKey: "orthodonticsAdv",  // matches PlanVersion.modules.orthodonticsAdv
        isCore:   false,
        plans:    ["pro", "enterprise"],
        features: {
            read:     { permission: "orthodontics.read" },  // Phase 30: tads.read removed
            manage:   { permission: "orthodontics.full" },  // Phase 30: tads.manage removed
            settings: { permission: "orthodontics.full" },  // Phase 30: tads.settings removed
        },
        basePath:      "tads",
        category:      "clinical",
        selfContained: true,
        dependencies:  ["orthodontics", "clinical-snapshots"],
        description:   "TADs Engine — miniscrew lifecycle, failure rate analytics, reinsertion tracking, alert reminders",
        routeFactory:  () => require("../modules/orthodontics/routes/tad.routes"),
    }),

    // ─── Orthodontic TODO Engine — clinical action items across visits ────────
    // DOMAIN BOUNDARY: Per-case actionable items (wire bends, bracket repositions).
    // Todos persist across visits until resolved.
    // Suggestion engine: non-enforcing hints from tooth alignment + wire type.
    "ortho-todos": Object.freeze({
        label:    "Orthodontic TODO Engine",
        module:   "orthodontics",
        schemaKey: "orthodonticsAdv",
        isCore:   false,
        plans:    ["pro", "enterprise"],
        features: {
            read:   { permission: "orthodontics.read" },
            manage: { permission: "orthodontics.full" },  // Phase 30: orthodontics.update removed
        },
        basePath:      "ortho-todos",
        category:      "clinical",
        selfContained: true,
        dependencies:  ["orthodontics", "clinical-snapshots"],
        description:   "Orthodontic TODO Engine — clinical action items, visit-linked tasks, suggestion engine",
        routeFactory:  () => require("../modules/ortho-todos/routes/orthoTodo.routes"),
    }),

    clinicalEvents: Object.freeze({
        label:    "Clinical Event Engine",
        module:   "orthodontics",
        schemaKey: "orthodonticsAdv",
        isCore:   false,
        plans:    ["pro", "enterprise"],
        features: {
            read: { permission: "orthodontics.read" },
        },
        basePath:      "events",
        category:      "clinical",
        selfContained: true,
        dependencies:  ["orthodontics"],
        description:   "Unified Clinical Event Timeline — audit trail for bonding, TADs, sequence, and future clinical actions",
        routeFactory:  () => require("../modules/orthodontics/routes/clinicalEvent.routes"),
    }),

    // ─── Clinical Actions Engine — Phase 3 appliance persistence ─────────────
    // DOMAIN BOUNDARY: Archwires, elastics, powerchains, accessories, ligatures,
    //   IPR markers, and space markers. Each mutation persists to ClinicalAction
    //   collection and emits a granular ClinicalEvent for full audit trail.
    // Shares: orthodontics entitlement guard and per-org DB isolation.
    "clinical-actions": Object.freeze({
        label:    "Clinical Actions Engine",
        module:   "orthodontics",
        schemaKey: "orthodonticsAdv",
        isCore:   false,
        plans:    ["pro", "enterprise"],
        features: {
            read:   { permission: "orthodontics.read" },
            manage: { permission: "orthodontics.full" },  // Phase 30: orthodontics.manage removed
        },
        basePath:      "clinical-actions",
        category:      "clinical",
        selfContained: true,
        dependencies:  ["orthodontics", "clinical-snapshots"],
        description:   "Clinical Actions Engine — Phase 3 backend persistence for archwires, elastics, powerchains, accessories, ligatures, IPR, and space markers with full event audit trail",
        routeFactory:  () => require("../modules/orthodontics/routes/clinicalAction.routes"),
    }),

    // ─── Clinical State Engine — Phase 4 Event Replay ─────────────────────────
    // DOMAIN BOUNDARY: Derives current clinical state by replaying ClinicalEvents
    //   on top of a snapshot checkpoint. Enables deterministic state reconstruction
    //   without modifying snapshot documents.
    // Reads: ClinicalSnapshot (checkpoint) + ClinicalEvent (deltas)
    // Output: derivedState matches frontend chartReducer output
    "clinical-state": Object.freeze({
        label:    "Clinical State Engine",
        module:   "orthodontics",
        schemaKey: "orthodonticsAdv",
        isCore:   false,
        plans:    ["pro", "enterprise"],
        features: {
            read: { permission: "orthodontics.read" },
        },
        basePath:      "clinical-state",
        category:      "clinical",
        selfContained: true,
        dependencies:  ["orthodontics", "clinical-snapshots", "clinical-actions"],
        description:   "Clinical State Engine — Phase 4 event replay: derives current chart state from snapshot checkpoint + incremental clinical events",
        routeFactory:  () => require("../modules/orthodontics/routes/eventReplay.routes"),
    }),

    // ─── Visit Session — Phase 1 Foundation ──────────────────────────────────────
    // DOMAIN BOUNDARY: Visit Session lifecycle — opens/closes a clinical visit session.
    //   Enforces one-active-visit-per-case invariant at both service and DB level.
    //   Phase 1: visitId is optional on events/snapshots (additive, non-breaking).
    // Reads/Writes: VisitRecord
    "visit-session": Object.freeze({
        label:     "Visit Session",
        module:    "orthodontics",
        schemaKey: "orthodonticsAdv",
        isCore:    false,
        plans:     ["pro", "enterprise"],
        features: {
            read:  { permission: "orthodontics.read" },
            write: { permission: "orthodontics.full" },  // Phase 30: orthodontics.write removed
        },
        basePath:      "visit-sessions",
        category:      "clinical",
        selfContained: true,
        dependencies:  ["orthodontics", "clinical-snapshots"],
        description:   "Visit Session Foundation — Phase 1: start/end/cancel visit sessions with one-active-visit-per-case invariant",
        routeFactory:  () => require("../modules/orthodontics/routes/visitSession.routes"),
    }),

    invoices: Object.freeze({
        label: "Invoices",
        module: "finance",
        schemaKey: "finance",
        isCore: false,
        plans: ["basic", "pro", "enterprise"],
        features: {},
        basePath: "invoices",
        category: "financial",
        selfContained: true,
        dependencies: ["patients"],
        description: "Invoice management — create, void, status tracking",
        routeFactory: () => require("../modules/billingDomain/routes/invoices.routes"),
    }),

    payments: Object.freeze({
        label: "Payments",
        module: "finance",
        schemaKey: "finance",
        isCore: false,
        plans: ["basic", "pro", "enterprise"],
        features: {},
        basePath: "payments",
        category: "financial",
        selfContained: true,
        dependencies: ["patients"],
        description: "Payment processing — collections, refunds, methods",
        routeFactory: () => require("../modules/billingDomain/routes/payments.routes"),
    }),

    refunds: Object.freeze({
        label: "Refunds",
        module: "finance",
        schemaKey: "finance",
        isCore: false,
        plans: ["basic", "pro", "enterprise"],
        features: {},
        basePath: "refunds",
        category: "financial",
        selfContained: true,
        dependencies: ["patients", "payments"],
        description: "Refund processing — payment reversals with ledger integration",
        routeFactory: () => require("../modules/billingDomain/refunds/refund.routes"),
    }),

    bookingApproval: Object.freeze({
        label: "Booking Approval",
        module: "booking",
        schemaKey: "booking",
        isCore: false,
        plans: ["pro", "enterprise"],
        features: {},
        basePath: "booking-requests",
        category: "clinical",
        selfContained: false,
        dependencies: ["booking"],
        description: "Booking approval — staff-side request queue management",
        routeFactory: () => require("../modules/booking/bookingApproval.routes"),
    }),

    authorization: Object.freeze({
        label: "Authorization Introspection",
        module: "patients",          // Uses core domain access — always available
        schemaKey: "patients",
        isCore: true,
        plans: ["basic", "pro", "enterprise"],
        features: {},
        basePath: "me",
        category: "core",
        selfContained: false,
        dependencies: [],
        description: "Authentication & Authorization — permission introspection",
        routeFactory: () => require("../modules/authorization/authorization.routes"),
    }),

    // ✅ AUDIT-003 — Document Engine exposed via HTTP
    documents: Object.freeze({
        label: "Document Engine",
        module: "documents",
        schemaKey: "patients",       // Core access — always available
        isCore: true,
        plans: ["basic", "pro", "enterprise"],
        features: {
            render: { permission: "documents.read" },
        },
        basePath: "documents",
        category: "clinical",
        selfContained: false,
        dependencies: [],
        description: "Document Engine — template management, PDF rendering",
        routeFactory: () => require("../modules/documentEngineDomain/routes/document.routes"),
    }),

    // ═══════════════════════════════════════════════════════════════════════════
    // GOVERNANCE & ADMIN — Core infrastructure with distinct keys
    // ═══════════════════════════════════════════════════════════════════════════

    security: Object.freeze({
        label: "Security Control Center",
        module: "security",
        schemaKey: "patients",       // Uses core domain access — always available
        isCore: true,
        plans: ["basic", "pro", "enterprise"],
        features: {},
        // Phase H.3 — canonical Settings Hub path
        basePath: "settings/security",
        category: "admin",
        selfContained: false,
        dependencies: [],
        description: "Security Control Center — RBAC/PBAC introspection, alerts, metrics",
        routeFactory: () => require("../organization/security/security.routes"),
    }),

    featuresControl: Object.freeze({
        label: "Features Control",
        module: "featuresControl",
        schemaKey: "patients",       // Uses core domain access — always available
        isCore: true,
        plans: ["basic", "pro", "enterprise"],
        features: {},
        // Phase H.3 — canonical Settings Hub path
        basePath: "settings/features",
        category: "admin",
        selfContained: false,
        dependencies: [],
        description: "Features & Modules — toggle, inspect, conflict detection",
        routeFactory: () => require("../organization/featuresControl/featuresControl.routes"),
    }),

    audit: Object.freeze({
        label: "Audit Timeline",
        module: "audit",
        schemaKey: "patients",       // Uses core domain access — always available
        isCore: true,
        plans: ["basic", "pro", "enterprise"],
        features: {},
        basePath: "audit",
        category: "admin",
        selfContained: false,
        dependencies: [],
        description: "Audit timeline — entity trail, user activity, compliance export",
        routeFactory: () => require("../modules/audit/routes/auditTimeline.routes"),
    }),

    debug: Object.freeze({
        label: "Permission Debug",
        module: "debug",
        schemaKey: "patients",       // Uses core domain access — always available
        isCore: true,
        plans: ["basic", "pro", "enterprise"],
        features: {},
        basePath: "debug",
        category: "admin",
        selfContained: false,
        dependencies: [],
        description: "Permission debug — RBAC × Entitlement resolution matrix (dev only)",
        routeFactory: () => require("../core/auth/permissionDebug.routes"),
    }),

    // ═══════════════════════════════════════════════════════════════════════════
    // P3 GOVERNANCE — Internal boundary stubs (no HTTP surface)
    // Domains with basePath: null are internal orchestration/library domains.
    // Registered here to make plane boundaries explicit and governance-auditable.
    // The module loader skips basePath: null entries — they are governance-only.
    // ═══════════════════════════════════════════════════════════════════════════

    // AUDIT-009: stageDomain — clinical stage lifecycle (event-driven, no HTTP)
    stage: Object.freeze({
        label: "Stage Execution",
        module: "stage",
        schemaKey: null,
        isCore: false,
        plans: ["basic", "pro", "enterprise"],
        features: {},
        basePath: null,
        category: "clinical",
        selfContained: true,
        dependencies: ["patients"],
        description: "Stage execution engine — clinical treatment lifecycle orchestration (internal, event-driven)",
        routeFactory: null,
    }),

    // AUDIT-010: clinicalProtocolDomain — SCPE protocol library (shared aggregate root)
    clinicalProtocol: Object.freeze({
        label: "Clinical Protocols",
        module: "clinicalProtocol",
        schemaKey: null,
        isCore: false,
        plans: ["pro", "enterprise"],
        features: {},
        basePath: null,
        category: "clinical",
        selfContained: true,
        dependencies: ["patients", "orthodontics"],
        description: "Clinical protocol library — SCPE aggregate root, shared by patientDomain and orthodontics",
        routeFactory: null,
    }),

    // AUDIT-012: alignerProductionDomain — aligner production tracking (currently internal)
    alignerProduction: Object.freeze({
        label: "Aligner Production",
        module: "alignerProduction",
        schemaKey: null,
        isCore: false,
        plans: ["pro", "enterprise"],
        features: {},
        basePath: null,     // TODO: expose GET /aligners/:caseId/status in next cycle
        category: "clinical",
        selfContained: false,
        dependencies: ["orthodontics"],
        description: "Aligner production domain — production run tracking, triggered by orthodonticDomain events",
        routeFactory: null,
    }),

    // AUDIT-013: intelligenceDomain — AI engine bridge (queue-based, no HTTP surface)
    intelligence: Object.freeze({
        label: "AI Intelligence",
        module: "intelligence",
        schemaKey: null,
        isCore: false,
        plans: ["enterprise"],
        features: {},
        basePath: null,
        category: "intelligence",
        selfContained: true,
        dependencies: ["orthodontics"],
        description: "AI intelligence bridge — delegates to Python engine via BullMQ queue. No direct DB access.",
        routeFactory: null,
    }),

});

// ─── Derived Constants ──────────────────────────────────────────────────────

/**
 * CORE_MODULES — Set of module keys that bypass entitlement checks.
 * Derived from feature registry to prevent drift.
 */
const CORE_MODULES = new Set(
    Object.values(FEATURE_REGISTRY)
        .filter(def => def.isCore)
        .map(def => def.module)
);

/**
 * SCHEMA_KEY_MAP — Maps PlanVersion schema keys to canonical module keys.
 * Used by normalizeModules() to translate raw plan data.
 *
 * Example: { orthodonticsAdv: "orthodontics", patients: "patients" }
 *
 * NOTE: Uses a Set-like dedup to avoid overwriting when multiple entries
 * share the same schemaKey (e.g. procedures + treatments both use "clinical").
 */
const _schemaMap = {};
for (const def of Object.values(FEATURE_REGISTRY)) {
    // Only add once per schemaKey → module mapping
    if (!_schemaMap[def.schemaKey]) {
        _schemaMap[def.schemaKey] = def.module;
    }
}
const SCHEMA_KEY_MAP = Object.freeze(_schemaMap);

/**
 * MODULE_KEYS — Array of all canonical module keys (unique, deduped).
 */
const MODULE_KEYS = Object.freeze(
    [...new Set(Object.values(FEATURE_REGISTRY).map(def => def.module))]
);

// ═══════════════════════════════════════════════════════════════════════════════
// DYNAMICALLY GENERATED MODULE_REGISTRY — Runtime Module Engine
// ═══════════════════════════════════════════════════════════════════════════════
//
// This replaces the old `orgRuntime/moduleRegistry.js` file.
// Built from FEATURE_REGISTRY entries that have a `basePath` (routable modules).
//
// Shape preserved for backward compatibility:
//   key, featureKey, entitlementKey, allowedPlans, isCore,
//   mountPath, category, selfContained, dependencies,
//   description, routeFactory
// ═══════════════════════════════════════════════════════════════════════════════

const _moduleRegistryEntries = {};

for (const [registryKey, def] of Object.entries(FEATURE_REGISTRY)) {
    // Only include routable modules (those with basePath + routeFactory)
    if (!def.basePath || !def.routeFactory) continue;

    _moduleRegistryEntries[registryKey] = Object.freeze({
        key: def.module,
        featureKey: `module.${def.module}`,
        entitlementKey: def.module,
        allowedPlans: def.plans,
        isCore: def.isCore,
        mountPath: def.basePath,
        category: def.category || "other",
        selfContained: !!def.selfContained,
        dependencies: def.dependencies || [],
        description: def.description || def.label,
        routeFactory: def.routeFactory,
    });
}

/**
 * MODULE_REGISTRY — Runtime module definitions generated from FEATURE_REGISTRY.
 *
 * IMPORTANT: This is DERIVED — never edit directly. Add/modify entries in
 * FEATURE_REGISTRY above. This object is frozen at boot time.
 */
const MODULE_REGISTRY = Object.freeze(_moduleRegistryEntries);

/**
 * CORE_MODULE_KEYS — Set of registry keys that are core (bypass module check).
 */
const CORE_MODULE_KEYS = new Set(
    Object.entries(MODULE_REGISTRY)
        .filter(([, def]) => def.isCore)
        .map(([registryKey]) => registryKey)
);

/**
 * PLAN_GATED_KEYS — Set of registry keys that require plan validation.
 */
const PLAN_GATED_KEYS = new Set(
    Object.entries(MODULE_REGISTRY)
        .filter(([, def]) => !def.isCore)
        .map(([registryKey]) => registryKey)
);

/**
 * SELF_CONTAINED_KEYS — Set of registry keys with self-contained middleware.
 */
const SELF_CONTAINED_KEYS = new Set(
    Object.entries(MODULE_REGISTRY)
        .filter(([, def]) => def.selfContained)
        .map(([registryKey]) => registryKey)
);

/**
 * MODULE_CATEGORIES — Derived category → module key mapping.
 */
const MODULE_CATEGORIES = {};
for (const [registryKey, def] of Object.entries(MODULE_REGISTRY)) {
    const cat = def.category || "other";
    if (!MODULE_CATEGORIES[cat]) MODULE_CATEGORIES[cat] = [];
    MODULE_CATEGORIES[cat].push(registryKey);
}
Object.freeze(MODULE_CATEGORIES);

// ─── Accessor Functions ─────────────────────────────────────────────────────

/**
 * getModule — Returns a module definition by its registry key.
 * @param {string} key — registry key (e.g., "patients", "orthodontics")
 * @returns {Object|null}
 */
function getModule(key) {
    return MODULE_REGISTRY[key] ?? null;
}

/**
 * listModuleKeys — Returns all module keys in the runtime registry.
 * @returns {string[]}
 */
function listModuleKeys() {
    return Object.keys(MODULE_REGISTRY);
}

/**
 * getModulesByCategory — Returns all module definitions grouped by category.
 * @returns {Object.<string, Object[]>}
 */
function getModulesByCategory() {
    const result = {};
    for (const [, def] of Object.entries(MODULE_REGISTRY)) {
        const cat = def.category || "other";
        if (!result[cat]) result[cat] = [];
        result[cat].push(def);
    }
    return result;
}

/**
 * getModuleByMountPath — Returns the module definition for a given mount path.
 * @param {string} mountPath
 * @returns {Object|null}
 */
function getModuleByMountPath(mountPath) {
    for (const [, def] of Object.entries(MODULE_REGISTRY)) {
        if (def.mountPath === mountPath) return def;
    }
    return null;
}

/**
 * getRegistryManifest — Returns a serializable manifest for frontend consumption.
 * Strips routeFactory (function refs) and returns pure data.
 * @returns {Object[]}
 */
function getRegistryManifest() {
    return Object.entries(MODULE_REGISTRY).map(([registryKey, def]) => ({
        registryKey,
        key: def.key,
        mountPath: def.mountPath,
        category: def.category,
        description: def.description,
        isCore: def.isCore,
        allowedPlans: def.allowedPlans,
        dependencies: def.dependencies || [],
        selfContained: def.selfContained || false,
    }));
}

/**
 * getUIManifest — Returns UI-annotated module entries for the UI Engine generator.
 *
 * Only includes FEATURE_REGISTRY entries that have a `ui` block.
 * Strips routeFactory and returns pure serializable JSON.
 *
 * Shape per entry:
 *   {
 *     key         — featureRegistry key (e.g. "patients")
 *     label       — Human-readable label (from FEATURE_REGISTRY.label)
 *     module      — Canonical module key
 *     plans       — Array of plan tiers
 *     isCore      — Boolean
 *     ui          — Full ui descriptor block
 *   }
 *
 * @returns {Object[]}
 */
function getUIManifest() {
    return Object.entries(FEATURE_REGISTRY)
        .filter(([, def]) => Boolean(def.ui))
        .map(([key, def]) => ({
            key,
            label: def.label,
            module: def.module,
            plans: def.plans,
            isCore: def.isCore,
            ui: def.ui,
        }))
        .sort((a, b) => (a.ui.order ?? 99) - (b.ui.order ?? 99));
}

// ─── Helper Functions (Entitlement Pipeline) ────────────────────────────────

/**
 * normalizeModules — Translates raw PlanVersion.modules into canonical module keys.
 *
 * Handles:
 *   - Schema key mismatches (orthodonticsAdv → orthodontics)
 *   - Communication subdocument (communication.enabled → communication: true)
 *   - Unknown keys (passed through with warning in dev)
 *
 * @param {Object} rawModules — Raw PlanVersion.modules document (Mongoose lean)
 * @returns {Object} Normalized module map { [canonicalKey]: boolean }
 */
function normalizeModules(rawModules = {}) {
    const normalized = {};

    // Pass 1: Registry-driven normalization (schema → canonical)
    // Use a Set to track canonical keys we've already processed
    const processedCanonical = new Set();

    for (const [, def] of Object.entries(FEATURE_REGISTRY)) {
        const canonicalKey = def.module;

        // Skip if we've already handled this canonical key
        // (multiple registry entries may share the same module key)
        if (processedCanonical.has(canonicalKey)) continue;
        processedCanonical.add(canonicalKey);

        const schemaKey = def.schemaKey || canonicalKey;
        const rawValue = rawModules[schemaKey];

        // Handle communication subdocument { enabled: true, smsQuota: ... }
        if (schemaKey === "communication" && typeof rawValue === "object" && rawValue !== null) {
            normalized[canonicalKey] = Boolean(rawValue.enabled);
        } else {
            normalized[canonicalKey] = Boolean(rawValue);
        }
    }

    return normalized;
}

/**
 * buildFeatureCapabilities — Derives sub-feature capabilities from module state.
 *
 * For each enabled module, all its features are enabled.
 * For disabled modules, all features are false.
 *
 * Output shape: { "orthodontics.viewCases": true, "orthodontics.aiAnalysis": true, ... }
 *
 * @param {Object} modules — Normalized module map from normalizeModules()
 * @returns {Object} Feature capability map
 */
function buildFeatureCapabilities(modules = {}) {
    const features = {};
    const processedCanonical = new Set();

    for (const [, def] of Object.entries(FEATURE_REGISTRY)) {
        const canonicalKey = def.module;

        // Only process features once per canonical module
        if (processedCanonical.has(canonicalKey)) continue;
        processedCanonical.add(canonicalKey);

        const moduleEnabled = Boolean(modules[canonicalKey]);

        if (def.features) {
            for (const featureKey of Object.keys(def.features)) {
                features[`${canonicalKey}.${featureKey}`] = moduleEnabled;
            }
        }
    }

    return features;
}

/**
 * getModuleDef — Returns the feature definition for a module key.
 * @param {string} moduleKey
 * @returns {FeatureDefinition|null}
 */
function getModuleDef(moduleKey) {
    return FEATURE_REGISTRY[moduleKey] ?? null;
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    // Entitlement pipeline
    FEATURE_REGISTRY,
    CORE_MODULES,
    SCHEMA_KEY_MAP,
    MODULE_KEYS,
    normalizeModules,
    buildFeatureCapabilities,
    getModuleDef,

    // Runtime module engine (replaces orgRuntime/moduleRegistry.js)
    MODULE_REGISTRY,
    CORE_MODULE_KEYS,
    PLAN_GATED_KEYS,
    SELF_CONTAINED_KEYS,
    MODULE_CATEGORIES,
    getModule,
    listModuleKeys,
    getModulesByCategory,
    getModuleByMountPath,
    getRegistryManifest,

    // UI Engine manifest (for generateUIEngine.js generator)
    getUIManifest,
};
