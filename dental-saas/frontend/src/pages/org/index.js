/**
 * src/pages/org/index.js — Org Plane Page Registry
 *
 * Part 8 of the Auto UI Engine (v1.0)
 *
 * ALL page components that the UI Engine can load MUST be registered here.
 * New modules → add entry → run `npm run generate:ui` → appears in UI.
 *
 * PageLoader.jsx imports from this file as:
 *   import * as OrgPages from "@/pages/org";
 *
 * RULES:
 *   ❌ No barrel re-exports from other planes (platform, portal)
 *   ✅ Named exports only — must match `page` field in uiManifest.js
 *   ✅ One export per route page
 *
 * PLANE: Org Plane only
 * MAINTAINED BY: generateUIEngine.js (auto-sync of PAGES array enforces this)
 */

// ── Core ───────────────────────────────────────────────────────────────────────
export { default as Dashboard }          from "@/pages/org/Dashboard";
export { default as ProfilePage }        from "@/modules/org/profile/pages/ProfilePage";
export { default as Settings }           from "@/pages/org/Settings";

// ── Patients ──────────────────────────────────────────────────────────────────
export { default as PatientsPage }       from "@/modules/org/patients/pages/PatientsPage";
export { default as PatientWorkspace }   from "@/modules/org/patients/pages/PatientWorkspace";
export { default as NewPatientPage }     from "@/org/modules/patients/NewPatientPage";
// PatientLayout is the nested layout component (children = tab routes)
export { default as PatientLayout }      from "@/org/modules/patients/PatientLayout";

// ── Calendar / Appointments ───────────────────────────────────────────────────
export { default as CalendarPage }       from "@/modules/org/calendar/pages/CalendarPage";
export { default as Appointments }       from "@/pages/org/Appointments";

// ── Clinical ──────────────────────────────────────────────────────────────────
export { default as TreatmentsPage }     from "@/modules/org/clinical/pages/TreatmentsPage";

// ── Orthodontics ──────────────────────────────────────────────────────────────
export { default as OrthodonticCasesPage } from "@/modules/org/orthodontics/pages/OrthodonticCasesPage";
export { default as OrthodonticCasePage }  from "@/modules/org/orthodontics/pages/OrthodonticCasePage";

// ── Finance ───────────────────────────────────────────────────────────────────
export { default as Finance }            from "@/pages/org/Finance";
export { default as OrgInvoicesPage }    from "@/modules/org/finance/pages/InvoicesPage";

// ── Inventory ─────────────────────────────────────────────────────────────────
export { default as Inventory }          from "@/pages/org/Inventory";

// ── Analytics ─────────────────────────────────────────────────────────────────
export { default as Analytics }          from "@/pages/org/Analytics";

// ── Lab ───────────────────────────────────────────────────────────────────────
export { default as LabDashboard }       from "@/modules/org/lab/pages/LabDashboard";
