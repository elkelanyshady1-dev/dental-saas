/**
 * org.routes.partial.js — Org Route Registry (Phase 2)
 *
 * Centralized metadata for all org-plane routes.
 * NOT consumed by App.jsx yet — serves as the single source of truth
 * for route-to-permission mapping and future migration.
 *
 * USAGE (future):
 *   import { ORG_ROUTE_META } from "@/app/router/org.routes.partial";
 *   const meta = ORG_ROUTE_META["/org/patients"];
 *   if (meta.permission && !hasPermission(meta.permission)) { ... }
 *
 * PLANE: Org only.
 */

export const ORG_ROUTE_META = {
  // ─── Core ────────────────────────────────────────────────────────────────
  "/org/dashboard": {
    permission: null, // All authenticated org users
    label: "Dashboard",
  },
  "/org/profile": {
    permission: null, // All authenticated org users
    label: "My Profile",
  },

  // ─── Patient Domain ──────────────────────────────────────────────────────
  "/org/patients": {
    permission: "patients.read",
    label: "Patients",
  },
  "/org/patients/new": {
    permission: "patients.create",
    label: "New Patient",
  },
  "/org/patients-workspace": {
    permission: "patients.read",
    label: "Patient Workspace",
    hidden: true, // Not linked in sidebar
  },
  "/org/treatment-journey": {
    permission: "patients.read",
    label: "Treatment Journey",
    hidden: true,
  },

  // ─── Scheduling ──────────────────────────────────────────────────────────
  "/org/calendar": {
    permission: "appointments.read",
    label: "Calendar",
  },
  "/org/appointments": {
    permission: "appointments.read",
    label: "Appointments",
  },

  // ─── Clinical ────────────────────────────────────────────────────────────
  "/org/treatments": {
    permission: "treatments.read",
    module: "clinical",
    label: "Treatments",
  },
  "/org/orthodontics": {
    permission: "orthodontics.read",
    module: "orthodontics",
    label: "Orthodontics",
  },

  // ─── Finance ─────────────────────────────────────────────────────────────
  "/org/invoices": {
    permission: "accounting.read",
    module: "finance",
    label: "Invoices",
  },
  "/org/finance": {
    permission: "accounting.read",
    module: "finance",
    label: "Finance Overview",
  },

  // ─── Operations ──────────────────────────────────────────────────────────
  "/org/inventory": {
    permission: "inventory.read",
    module: "inventory",
    label: "Inventory",
  },
  "/org/analytics": {
    permission: "analytics.read",
    module: "analytics",
    label: "Analytics",
  },

  // ─── Settings Hub ────────────────────────────────────────────────────────
  "/org/settings": {
    permission: null, // Open to all org users — sub-pages have own guards
    label: "Settings",
  },
  "/org/settings/users": {
    permission: "users.read",
    label: "Staff Management",
  },
  "/org/settings/branches": {
    permission: "branches.read",
    label: "Branch Management",
  },
  "/org/settings/roles": {
    permission: "users.read",
    label: "Roles & Permissions",
  },
  "/org/settings/billing": {
    permission: "billing.read",
    label: "Billing & Subscription",
  },
  "/org/settings/support": {
    permission: "support.read",
    label: "Support Center",
  },

  // ─── Security & Features (Phase H.2 — now under Settings Hub) ────────────
  // ✅ Canonical routes — all under /org/settings/*
  "/org/settings/security": {
    permission: "security.manage",
    label: "Security",
  },
  "/org/settings/security/analytics": {
    permission: "security.manage",
    label: "Auth Analytics",
  },
  "/org/settings/features": {
    permission: "security.manage",
    label: "Features Control",
  },

  // ⚠️ Legacy redirects — DO NOT REMOVE — forward transparently to canonical routes above
  "/org/security": {
    permission: "security.manage",
    label: "Security (legacy redirect)",
    hidden: true,
    redirectTo: "/org/settings/security",
  },
  "/org/auth-analytics": {
    permission: "security.manage",
    label: "Auth Analytics (legacy redirect)",
    hidden: true,
    redirectTo: "/org/settings/security/analytics",
  },
  "/org/features-control": {
    permission: "security.manage",
    label: "Features Control (legacy redirect)",
    hidden: true,
    redirectTo: "/org/settings/features",
  },
};
