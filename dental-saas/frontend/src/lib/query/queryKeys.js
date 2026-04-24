/**
 * queryKeys.js — Centralized Query Key Registry (Org Plane)
 *
 * Single source of truth for ALL React Query keys across the org frontend.
 * Prevents key duplication, enables predictable invalidation, and
 * provides a consistent hierarchical key structure.
 *
 * Key Architecture:
 *   [domain] → [scope] → [filters/id]
 *
 *   Example: ["patients", "list", { search: "ahmed", page: 1 }]
 *            ["patients", "detail", "abc123"]
 *
 * Usage:
 *   import { QK } from "@/lib/query/queryKeys";
 *   useQuery({ queryKey: QK.patients.list(filters), ... });
 *
 * Invalidation patterns:
 *   qc.invalidateQueries({ queryKey: QK.patients.all })     → all patient queries
 *   qc.invalidateQueries({ queryKey: QK.patients.lists() }) → all patient lists
 *   qc.invalidateQueries({ queryKey: QK.patients.detail(id) }) → one patient
 */

// ── Patients ──────────────────────────────────────────────────────────────

const patients = {
    all:      ['patients'],
    lists:    ()        => [...patients.all, 'list'],
    list:     (filters) => [...patients.lists(), filters],
    details:  ()        => [...patients.all, 'detail'],
    detail:   (id)      => [...patients.details(), id],
    timeline: (id)      => [...patients.all, 'timeline', id],
    family:   (id)      => [...patients.detail(id), 'family'],
};

// ── Appointments ──────────────────────────────────────────────────────────

const appointments = {
    all:          ['appointments'],
    lists:        ()        => [...appointments.all, 'list'],
    list:         (filters) => [...appointments.lists(), filters],
    details:      ()        => [...appointments.all, 'detail'],
    detail:       (id)      => [...appointments.details(), id],
    calendar:     (params)  => [...appointments.all, 'calendar', params],
    availability: (params)  => [...appointments.all, 'availability', params],
};

// ── Treatments ────────────────────────────────────────────────────────────

const treatments = {
    all:        ['treatments'],
    lists:      ()        => [...treatments.all, 'list'],
    list:       (filters) => [...treatments.lists(), filters],
    details:    ()        => [...treatments.all, 'detail'],
    detail:     (id)      => [...treatments.details(), id],
    procedures: ()        => ['procedures'],
    notes:      (patientId) => ['clinical-notes', patientId],
};

// ── Invoices / Finance ────────────────────────────────────────────────────

const invoices = {
    all:       ['invoices'],
    lists:     ()        => [...invoices.all, 'list'],
    list:      (filters) => [...invoices.lists(), filters],
    details:   ()        => [...invoices.all, 'detail'],
    detail:    (id)      => [...invoices.details(), id],
    revenue:   ()        => [...invoices.all, 'revenue'],
    summary:   (params)  => [...invoices.revenue(), 'summary', params],
    breakdown: (params)  => [...invoices.revenue(), 'breakdown', params],
};

// ── Accounting (CQRS READ side — accountingDomain projection) ─────────────
// ✅ Phase 4 — STRICTLY separate from invoices keys.
// All analytics/chart queries MUST use these keys, NOT QK.invoices.

const accounting = {
    all:     ['accounting'],
    daily:   (params) => [...accounting.all, 'daily',   params],
    monthly: (params) => [...accounting.all, 'monthly', params],
    health:  ()       => [...accounting.all, 'health'],
};

// ── Orthodontics ──────────────────────────────────────────────────────────

const orthodontics = {
    all:       ['orthodontic-cases'],
    lists:     ()        => [...orthodontics.all, 'list'],
    list:      (filters) => [...orthodontics.lists(), filters],
    details:   ()        => [...orthodontics.all, 'detail'],
    detail:    (id)      => [...orthodontics.details(), id],
    scans:     (caseId)  => [...orthodontics.detail(caseId), 'scans'],
    // Situation Room — single aggregation key. Parameterless: the backend
    // derives scope from JWT, so the cache is per-user automatically.
    dashboard: ()        => [...orthodontics.all, 'dashboard'],

    // ── Phase 1+2 — Case Assets (Photo SSOT) ──────────────────────────────
    // Logical pool scoped per case. Record-set / visit pools derive from the
    // photo list on the client; backend filtering happens via link arrays
    // already present on each Photo doc.
    photos:      (caseId)             => [...orthodontics.detail(caseId), 'photos'],
    photo:       (caseId, photoId)    => [...orthodontics.photos(caseId), photoId],
    recordSets:  (caseId)             => [...orthodontics.detail(caseId), 'record-sets'],
    recordSet:   (caseId, recordSetId)=> [...orthodontics.recordSets(caseId), recordSetId],
    visits:      (caseId)             => [...orthodontics.detail(caseId), 'visits'],
};

// ── Settings Hub: Billing ─────────────────────────────────────────────────

const settingsBilling = {
    all:          ['settings-billing'],
    subscription: () => [...settingsBilling.all, 'subscription'],
    invoiceLists: () => [...settingsBilling.all, 'invoices'],
    invoices:     (params) => [...settingsBilling.invoiceLists(), params],
    usage:        () => [...settingsBilling.all, 'usage'],
};

// ── Settings Hub: Support ─────────────────────────────────────────────────

const settingsSupport = {
    all:     ['settings-support'],
    lists:   ()        => [...settingsSupport.all, 'list'],
    list:    (params)  => [...settingsSupport.lists(), params],
    details: ()        => [...settingsSupport.all, 'detail'],
    detail:  (id)      => [...settingsSupport.details(), id],
};

// ── Inventory ────────────────────────────────────────────────────
// TASK-INV-002 — CQRS read keys. Dashboard/alerts read from projections.

const inventory = {
    all:       ['inventory'],
    lists:     ()        => [...inventory.all, 'list'],
    list:      (filters) => [...inventory.lists(), filters],
    details:   ()        => [...inventory.all, 'detail'],
    detail:    (id)      => [...inventory.details(), id],
    movements: (id)      => [...inventory.detail(id), 'movements'],
    dashboard: ()        => [...inventory.all, 'dashboard'],
    alerts:    ()        => [...inventory.all, 'alerts'],
    orders:    (filters) => [...inventory.all, 'purchase-orders', filters],
};

// ── Lab Domain ───────────────────────────────────────────────────
// TASK-LAB-002

const lab = {
    all:       ['lab'],
    dashboard: ()        => [...lab.all, 'dashboard'],
    labs:      (filters) => [...lab.all, 'labs', filters],
    labDetail: (id)      => [...lab.all, 'labs', id],
    cases:     (filters) => [...lab.all, 'cases', filters],
    kanban:    ()        => [...lab.all, 'kanban'],
    priority:  ()        => [...lab.all, 'priority'],
    caseDetail:(id)      => [...lab.all, 'cases', id],
    messages:  (id)      => [...lab.all, 'cases', id, 'messages'],
    claims:    (filters) => [...lab.all, 'claims', filters],
};

// ── Exported Registry ─────────────────────────────────────────────────────

export const QK = Object.freeze({
    patients,
    appointments,
    treatments,
    invoices,
    accounting,
    orthodontics,
    inventory,
    lab,
    settingsBilling,
    settingsSupport,
});

export default QK;

