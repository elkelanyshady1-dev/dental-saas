/**
 * ClinicalTimeline.tsx
 * Domain: orthodontic-cases
 * Layer: Frontend > Components > Clinical
 *
 * Renders the ordered list of clinical procedures for a single visit.
 * Procedures ONLY come from snapshot.procedures (SOURCE OF TRUTH).
 * NO static data. NO manual logs.
 */

import React from "react";
import { ProcedureDTO, formatProcedure, PROCEDURE_META } from "@hooks/useVisitDetail";

interface Props {
  procedures: ProcedureDTO[];
  snapshotCreatedAt: number | null;
  isLoading?: boolean;
}

const PHASE_COLORS: Record<string, string> = {
  "Bracket":    "#10b981",
  "Wire":       "#6366f1",
  "Elastic":    "#f97316",
  "Appliance":  "#0ea5e9",
  "Miniscrew":  "#64748b",
  "IPR":        "#d946ef",
  "Power Chain":"#ec4899",
  "Surgery":    "#dc2626",
  "Status":     "#14b8a6",
  "Alert":      "#f43f5e",
};

function formatTimestamp(ts: number | null): string {
  if (!ts) return "";
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ts));
}

// ── Procedure Card ─────────────────────────────────────────────────────────────

function ProcedureCard({ proc, index }: { proc: ProcedureDTO; index: number }) {
  const meta = PROCEDURE_META[proc.type] ?? { color: "#64748b", icon: "🔹", category: "Other" };
  const label = formatProcedure(proc);
  const time = formatTimestamp(proc.timestamp);

  return (
    <div
      className="procedure-card"
      style={{
        display:       "flex",
        alignItems:    "center",
        gap:           "12px",
        padding:       "12px 16px",
        background:    "rgba(255,255,255,0.04)",
        borderRadius:  "10px",
        border:        `1px solid rgba(255,255,255,0.07)`,
        borderLeft:    `3px solid ${meta.color}`,
        marginBottom:  "8px",
        transition:    "background 0.15s ease",
        cursor:        "default",
        animationDelay: `${index * 40}ms`,
      }}
    >
      {/* Icon badge */}
      <div style={{
        width:         "36px",
        height:        "36px",
        borderRadius:  "50%",
        display:       "flex",
        alignItems:    "center",
        justifyContent:"center",
        background:    `${meta.color}22`,
        fontSize:      "16px",
        flexShrink:    0,
      }}>
        {meta.icon}
      </div>

      {/* Label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13px", fontWeight: 500, color: "#f1f5f9", lineHeight: 1.4 }}>
          {label}
        </div>
        <div style={{ fontSize: "11px", color: meta.color, marginTop: "2px", opacity: 0.85 }}>
          {meta.category}
        </div>
      </div>

      {/* Time */}
      {time && (
        <div style={{ fontSize: "11px", color: "#64748b", flexShrink: 0 }}>
          {time}
        </div>
      )}
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────────────────

function EmptyProcedures() {
  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      alignItems:    "center",
      justifyContent:"center",
      padding:       "40px 20px",
      color:         "#475569",
      textAlign:     "center",
    }}>
      <div style={{ fontSize: "36px", marginBottom: "12px", opacity: 0.5 }}>🦷</div>
      <p style={{ margin: 0, fontSize: "13px", fontWeight: 500 }}>No procedures recorded</p>
      <p style={{ margin: "4px 0 0", fontSize: "12px" }}>
        This was the first visit — no prior state to compare against.
      </p>
    </div>
  );
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────

function ProcedureSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {[...Array(4)].map((_, i) => (
        <div key={i} style={{
          height: "60px",
          borderRadius: "10px",
          background: "rgba(255,255,255,0.04)",
          borderLeft: "3px solid rgba(255,255,255,0.1)",
          animation: "shimmer 1.5s infinite",
        }} />
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function ClinicalTimeline({ procedures, snapshotCreatedAt, isLoading }: Props) {
  if (isLoading) return <ProcedureSkeleton />;

  return (
    <div>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "16px",
      }}>
        <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Procedures
        </h3>
        <span style={{
          background: "rgba(99,102,241,0.15)",
          color: "#818cf8",
          borderRadius: "20px",
          padding: "2px 10px",
          fontSize: "12px",
          fontWeight: 600,
        }}>
          {procedures.length} recorded
        </span>
      </div>

      {/* Procedure list — derived ENTIRELY from snapshot.procedures */}
      {procedures.length === 0 ? (
        <EmptyProcedures />
      ) : (
        <div>
          {procedures.map((proc, i) => (
            <ProcedureCard key={proc.id ?? i} proc={proc} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
