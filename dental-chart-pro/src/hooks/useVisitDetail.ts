/**
 * useVisitDetail.ts
 * Domain: orthodontic-cases (Phase 3.5 — Audit + Visit Page)
 * Layer: Frontend > Hooks (Server State)
 *
 * React Query hook for the VisitDetailsPage.
 * Fetches: VisitRecord + ClinicalSnapshot + CasePhase from a single endpoint.
 *
 * SYSTEM RULE §9:
 *   ❌ FORBIDDEN: useEffect(() => fetch(...), []) — raw fetch violates system rules
 *   ✅ REQUIRED:  useQuery() + staleTime + enabled guard
 */

import { useQuery } from "@tanstack/react-query";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000/api/v1";

function getAuthHeaders(): Record<string, string> {
  const token = sessionStorage.getItem("org_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProcedureType =
  | "bonding" | "debonding" | "rebonding" | "extraction"
  | "wire_placement" | "wire_change" | "wire_removal"
  | "elastic_placement" | "elastic_removal"
  | "appliance_placement" | "appliance_removal"
  | "miniscrew_placement" | "miniscrew_removal"
  | "powerchain_placement" | "powerchain_removal"
  | "ipr" | "tooth_status_change" | "tooth_alert";

export interface ProcedureDTO {
  id:        string | null;
  type:      ProcedureType | string;
  target:    { toothId: number } | null;
  metadata:  Record<string, unknown> | null;
  timestamp: number | null;
}

export interface SnapshotSummary {
  id:            string;
  caseId:        string | null;
  appointmentId: string | null;
  procedures:    ProcedureDTO[];
  notes:         { text?: string; tags?: string[]; warnings?: string[] } | string;
  attachments:   { url: string; type: string; name: string | null; fileName?: string }[];
  thumbnail:     string | null;
  createdAt:     number | null;
}

export interface VisitRecordSummary {
  id:            string;
  caseId:        string | null;
  phaseId:       string | null;
  appointmentId: string | null;
  snapshotId:    string | null;
  visitNumber:   number;
  notes:         string;
  attachments:   { url: string; type: string; name: string | null; size: number | null }[];
  createdAt:     number | null;
}

export interface CasePhaseSummary {
  id:          string;
  name:        string;
  order:       number;
  status:      "pending" | "active" | "completed";
  startedAt:   number | null;
  completedAt: number | null;
}

export interface VisitDetailData {
  visit:    VisitRecordSummary;
  phase:    CasePhaseSummary | null;
  snapshot: SnapshotSummary | null;
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchVisitDetail(caseId: string, visitId: string): Promise<VisitDetailData> {
  const res = await fetch(`${BASE_URL}/orthodontic-cases/${caseId}/timeline/${visitId}`, {
    headers: getAuthHeaders(),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    const err = new Error(json?.error?.message ?? `HTTP ${res.status}`);
    (err as any).statusCode = res.status;
    throw err;
  }
  return json.data as VisitDetailData;
}

// ── Procedure Formatter ───────────────────────────────────────────────────────
// Corrected from prompt: uses proc.target.toothId (not proc.tooth)
// and proc.metadata fields from our actual procedureGenerator.service.js

export function formatProcedure(proc: ProcedureDTO): string {
  const tooth = proc.target?.toothId ?? null;
  const toothLabel = tooth != null ? ` (tooth ${tooth})` : "";
  const meta = proc.metadata ?? {};

  switch (proc.type) {
    case "bonding":
      return `Bonded bracket${toothLabel}${meta.brand ? ` — ${meta.brand}` : ""}`;
    case "debonding":
      return `Debonded bracket${toothLabel}`;
    case "rebonding":
      return `Rebonded bracket${toothLabel}${meta.newBrand ? ` — ${meta.newBrand}` : ""}`;
    case "extraction":
      return `Extraction${toothLabel}`;
    case "wire_placement": {
      const arch = meta.arch ? ` (${meta.arch})` : "";
      return `Wire placed${arch} — ${meta.material ?? "?"} ${meta.size ?? "?"}`;
    }
    case "wire_change": {
      const arch = meta.arch ? ` (${meta.arch})` : "";
      return `Wire changed${arch}: ${meta.prevMaterial ?? "?"} → ${meta.newMaterial ?? "?"}${meta.newSize ? ` ${meta.newSize}` : ""}`;
    }
    case "wire_removal":
      return `Wire removed${meta.arch ? ` (${meta.arch})` : ""}`;
    case "elastic_placement":
      return `Elastic placed — ${meta.type ?? "?"} ${meta.size ?? ""}`.trim();
    case "elastic_removal":
      return `Elastic removed`;
    case "appliance_placement":
      return `Appliance placed — ${meta.type ?? ""}`;
    case "appliance_removal":
      return `Appliance removed — ${meta.type ?? ""}`;
    case "miniscrew_placement":
      return `Miniscrew placed${toothLabel}`;
    case "miniscrew_removal":
      return `Miniscrew removed${toothLabel}`;
    case "powerchain_placement":
      return `Power chain placed${meta.isUpper != null ? ` (${meta.isUpper ? "upper" : "lower"})` : ""}`;
    case "powerchain_removal":
      return `Power chain removed`;
    case "ipr":
      return `IPR performed${toothLabel}${meta.value ? ` — ${meta.value}mm` : ""}`;
    case "tooth_alert":
      return `Alert${toothLabel}: ${meta.note ?? ""}`;
    case "tooth_status_change":
      return `Status change${toothLabel}: ${meta.prevStatus ?? "?"} → ${meta.newStatus ?? "?"}`;
    default:
      return proc.type.replace(/_/g, " ");
  }
}

// ── Icon / Color map ──────────────────────────────────────────────────────────

export const PROCEDURE_META: Record<string, { color: string; icon: string; category: string }> = {
  bonding:              { color: "#10b981", icon: "🦷", category: "Bracket" },
  debonding:            { color: "#ef4444", icon: "❌", category: "Bracket" },
  rebonding:            { color: "#f59e0b", icon: "🔄", category: "Bracket" },
  extraction:           { color: "#dc2626", icon: "⚠️", category: "Surgery" },
  wire_placement:       { color: "#6366f1", icon: "〰️", category: "Wire" },
  wire_change:          { color: "#8b5cf6", icon: "🔁", category: "Wire" },
  wire_removal:         { color: "#7c3aed", icon: "➖", category: "Wire" },
  elastic_placement:    { color: "#f97316", icon: "⭕", category: "Elastic" },
  elastic_removal:      { color: "#ea580c", icon: "🔵", category: "Elastic" },
  appliance_placement:  { color: "#0ea5e9", icon: "🔧", category: "Appliance" },
  appliance_removal:    { color: "#0284c7", icon: "🔩", category: "Appliance" },
  miniscrew_placement:  { color: "#64748b", icon: "📌", category: "Miniscrew" },
  miniscrew_removal:    { color: "#475569", icon: "📍", category: "Miniscrew" },
  ipr:                  { color: "#d946ef", icon: "📐", category: "IPR" },
  powerchain_placement: { color: "#ec4899", icon: "🔗", category: "Power Chain" },
  powerchain_removal:   { color: "#db2777", icon: "⛓️", category: "Power Chain" },
  tooth_status_change:  { color: "#14b8a6", icon: "📋", category: "Status" },
  tooth_alert:          { color: "#f43f5e", icon: "🚨", category: "Alert" },
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVisitDetail(caseId: string | null, visitId: string | null) {
  const query = useQuery({
    queryKey: ["visit-detail", caseId, visitId],
    queryFn:  () => fetchVisitDetail(caseId!, visitId!),
    enabled:  !!caseId && !!visitId,
    staleTime: 60_000,     // Visit records are immutable — long stale
    gcTime:    5 * 60_000, // Keep in cache for 5 min after unmount
  });

  const data = query.data ?? null;

  return {
    visit:     data?.visit    ?? null,
    phase:     data?.phase    ?? null,
    snapshot:  data?.snapshot ?? null,
    // Extracted convenience: procedures come ONLY from snapshot
    procedures: data?.snapshot?.procedures ?? [],
    isLoading:  query.isLoading,
    isError:    query.isError,
    error:      query.error,
  };
}
