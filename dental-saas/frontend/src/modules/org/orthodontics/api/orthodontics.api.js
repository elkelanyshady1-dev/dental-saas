/**
 * orthodontics.api.js — ALIAS (Phase 6: frontend module migration)
 *
 * Canonical source: src/org/modules/patients/components/orthodontic-chart/api/case.api.ts
 *
 * This file re-exports `caseApi` as `orthodonticsApi` so existing components
 * (CaseNotes, CreateOrthoDrawer, ScanUploader, useOrthodontics, OrthodonticCasesPage)
 * continue to work without import changes.
 *
 * Scheduled for deletion: when the entire src/modules/org/orthodontics/ directory
 * is removed and its pages/components are migrated to the canonical orthodontic-chart module.
 *
 * @see src/org/modules/patients/components/orthodontic-chart/api/case.api.ts
 */
import { caseApi } from "@/org/modules/patients/components/orthodontic-chart/api/case.api";

export const orthodonticsApi = caseApi;
