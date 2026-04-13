// ⚠️  AUTO-GENERATED FILE — DO NOT MANUALLY EDIT
// Regenerate with: npm run generate:permission-keys (from backend/)
// Source of truth: backend/src/rbac/orgPermissions.js
// Generated at: 2026-03-31T01:21:00.000Z

/**
 * P — Typed permission constant map (mirrors backend P enum)
 *
 * Use this instead of raw strings in all useCapability() calls:
 *   ✅  useCapability(P.INVENTORY_READ)
 *   ❌  useCapability("inventory.read")
 */
export const P = Object.freeze({
  // Patient module
  PATIENTS_READ: "patients.read",
  PATIENTS_CREATE: "patients.create",
  PATIENTS_UPDATE: "patients.update",
  PATIENTS_DELETE: "patients.delete",

  // Appointments module
  APPOINTMENTS_READ: "appointments.read",
  APPOINTMENTS_CREATE: "appointments.create",
  APPOINTMENTS_UPDATE: "appointments.update",
  APPOINTMENTS_DELETE: "appointments.delete",

  // Recalls module
  RECALLS_READ: "recalls.read",
  RECALLS_CREATE: "recalls.create",
  RECALLS_UPDATE: "recalls.update",
  RECALLS_DELETE: "recalls.delete",

  // Families module
  FAMILIES_READ: "families.read",
  FAMILIES_CREATE: "families.create",
  FAMILIES_UPDATE: "families.update",
  FAMILIES_DELETE: "families.delete",

  // Accounting module
  ACCOUNTING_READ: "accounting.read",
  ACCOUNTING_CREATE: "accounting.create",
  ACCOUNTING_UPDATE: "accounting.update",
  ACCOUNTING_DELETE: "accounting.delete",
  ACCOUNTING_MANAGE: "accounting.manage",
  ACCOUNTING_REPORTS: "accounting.reports",

  // Orthodontics module
  ORTHODONTICS_READ: "orthodontics.read",
  ORTHODONTICS_CREATE: "orthodontics.create",
  ORTHODONTICS_UPDATE: "orthodontics.update",
  ORTHODONTICS_DELETE: "orthodontics.delete",

  // Calendar module
  CALENDAR_READ: "calendar.read",
  CALENDAR_MULTI_BRANCH: "calendar.multiBranchView",
  CALENDAR_SELF_FILTER: "calendar.selfFilterOnly",

  // Staff management
  STAFF_MANAGE: "staff.manage",

  // Users module
  USERS_READ: "users.read",
  USERS_CREATE: "users.create",
  USERS_UPDATE: "users.update",
  USERS_DELETE: "users.delete",

  // Branches module
  BRANCHES_READ: "branches.read",
  BRANCHES_CREATE: "branches.create",
  BRANCHES_UPDATE: "branches.update",
  BRANCHES_DELETE: "branches.delete",

  // Procedures module
  PROCEDURES_READ: "procedures.read",
  PROCEDURES_CREATE: "procedures.create",
  PROCEDURES_UPDATE: "procedures.update",
  PROCEDURES_DELETE: "procedures.delete",

  // Treatments module
  TREATMENTS_READ: "treatments.read",
  TREATMENTS_CREATE: "treatments.create",
  TREATMENTS_UPDATE: "treatments.update",
  TREATMENTS_DELETE: "treatments.delete",

  // Invoices module
  INVOICES_READ: "invoices.read",
  INVOICES_CREATE: "invoices.create",
  INVOICES_UPDATE: "invoices.update",
  INVOICES_DELETE: "invoices.delete",

  // Payments module
  PAYMENTS_READ: "payments.read",
  PAYMENTS_CREATE: "payments.create",
  PAYMENTS_UPDATE: "payments.update",
  PAYMENTS_DELETE: "payments.delete",

  // Patient Portal module
  PORTAL_READ: "portal.read",
  PORTAL_MANAGE: "portal.manage",
  MONITORING_REVIEW: "monitoring.review",

  // SaaS Subscription billing (NOT clinic finance)
  BILLING_READ: "billing.read",

  // Double-entry ledger
  LEDGER_READ: "ledger.read",

  // Refund engine
  REFUNDS_CREATE: "refunds.create",
  REFUNDS_READ: "refunds.read",

  // Security Control Center
  SECURITY_READ: "security.read",
  SECURITY_MANAGE: "security.manage",

  // Phase 22 — Inventory module
  INVENTORY_READ: "inventory.read",
  INVENTORY_CREATE: "inventory.create",
  INVENTORY_UPDATE: "inventory.update",
  INVENTORY_DELETE: "inventory.delete",

  // Phase 22 — Lab module
  LAB_READ: "lab.read",
  LAB_CREATE: "lab.create",
  LAB_UPDATE: "lab.update",
  LAB_DELETE: "lab.delete",

  // Phase 22 — Communication module
  COMMUNICATION_READ: "communication.read",
  COMMUNICATION_SEND: "communication.send",
  COMMUNICATION_MANAGE: "communication.manage",

  // Phase 22 — Analytics module
  ANALYTICS_READ: "analytics.read",
  ANALYTICS_EXPORT: "analytics.export",

  // Phase 22 — Dashboard module
  DASHBOARD_READ: "dashboard.read",
  DASHBOARD_MANAGE: "dashboard.manage",

  // Phase A — Support module
  SUPPORT_READ: "support.read",
  SUPPORT_CREATE: "support.create",
  SUPPORT_WRITE: "support.write",

  // Phase A — Storage module
  STORAGE_READ: "storage.read",

  // AUDIT-003 — Document Engine
  DOCUMENTS_READ: "documents.read",
  DOCUMENTS_CREATE: "documents.create",
  DOCUMENTS_MANAGE: "documents.manage",
});

/**
 * ALL_PERMISSIONS — flat array of every registered permission string.
 * Used by permissionValidator.js and debug panels.
 */
export const ALL_PERMISSIONS = Object.freeze([
  "patients.read",
  "patients.create",
  "patients.update",
  "patients.delete",
  "appointments.read",
  "appointments.create",
  "appointments.update",
  "appointments.delete",
  "recalls.read",
  "recalls.create",
  "recalls.update",
  "recalls.delete",
  "families.read",
  "families.create",
  "families.update",
  "families.delete",
  "accounting.read",
  "accounting.create",
  "accounting.update",
  "accounting.delete",
  "accounting.manage",
  "accounting.reports",
  "orthodontics.read",
  "orthodontics.create",
  "orthodontics.update",
  "orthodontics.delete",
  "calendar.read",
  "calendar.multiBranchView",
  "calendar.selfFilterOnly",
  "staff.manage",
  "users.read",
  "users.create",
  "users.update",
  "users.delete",
  "branches.read",
  "branches.create",
  "branches.update",
  "branches.delete",
  "procedures.read",
  "procedures.create",
  "procedures.update",
  "procedures.delete",
  "treatments.read",
  "treatments.create",
  "treatments.update",
  "treatments.delete",
  "invoices.read",
  "invoices.create",
  "invoices.update",
  "invoices.delete",
  "payments.read",
  "payments.create",
  "payments.update",
  "payments.delete",
  "portal.read",
  "portal.manage",
  "monitoring.review",
  "billing.read",
  "ledger.read",
  "refunds.create",
  "refunds.read",
  "security.read",
  "security.manage",
  "inventory.read",
  "inventory.create",
  "inventory.update",
  "inventory.delete",
  "lab.read",
  "lab.create",
  "lab.update",
  "lab.delete",
  "communication.read",
  "communication.send",
  "communication.manage",
  "analytics.read",
  "analytics.export",
  "dashboard.read",
  "dashboard.manage",
  "support.read",
  "support.create",
  "support.write",
  "storage.read",
  "documents.read",
  "documents.create",
  "documents.manage",
]);

/**
 * PermissionSet — O(1) membership check set.
 * Used by permissionValidator at runtime.
 */
export const PermissionSet = new Set(ALL_PERMISSIONS);
