/**
 * VisitSummaryCards.tsx
 * Shows visit metadata: visit number, date, phase, appointment link.
 */

import React from "react";
import { VisitRecordSummary, CasePhaseSummary } from "@hooks/useVisitDetail";

const PHASE_COLORS: Record<string, string> = {
  bonding:          "#10b981",
  active:           "#6366f1",
  retention:        "#f59e0b",
  "post-treatment": "#64748b",
};

const PHASE_ICONS: Record<string, string> = {
  bonding:          "🔩",
  active:           "⚡",
  retention:        "🛡️",
  "post-treatment": "✅",
};

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short" }).format(new Date(ts));
}

interface CardProps {
  label: string;
  value: React.ReactNode;
  icon?: string;
  accent?: string;
}

function SummaryCard({ label, value, icon, accent = "#6366f1" }: CardProps) {
  return (
    <div style={{
      background:   "rgba(255,255,255,0.04)",
      border:       "1px solid rgba(255,255,255,0.08)",
      borderRadius: "12px",
      padding:      "16px 20px",
      display:      "flex",
      alignItems:   "center",
      gap:          "14px",
    }}>
      {icon && (
        <div style={{
          width:          "42px",
          height:         "42px",
          borderRadius:   "10px",
          background:     `${accent}20`,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          fontSize:       "20px",
          flexShrink:     0,
        }}>
          {icon}
        </div>
      )}
      <div>
        <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "3px" }}>
          {label}
        </div>
        <div style={{ fontSize: "15px", fontWeight: 600, color: "#f1f5f9" }}>
          {value}
        </div>
      </div>
    </div>
  );
}

interface Props {
  visit:     VisitRecordSummary | null;
  phase:     CasePhaseSummary   | null;
  isLoading?: boolean;
}

export function VisitSummaryCards({ visit, phase, isLoading }: Props) {
  if (isLoading) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ height: "80px", borderRadius: "12px", background: "rgba(255,255,255,0.04)", animation: "shimmer 1.5s infinite" }} />
        ))}
      </div>
    );
  }

  if (!visit) return null;

  const phaseName = phase?.name ?? "—";
  const phaseAccent = PHASE_COLORS[phaseName] ?? "#6366f1";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
      <SummaryCard
        label="Visit Number"
        value={`#${visit.visitNumber}`}
        icon="📅"
        accent="#6366f1"
      />
      <SummaryCard
        label="Date"
        value={formatDate(visit.createdAt)}
        icon="🕐"
        accent="#0ea5e9"
      />
      <SummaryCard
        label="Phase"
        value={
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ color: phaseAccent }}>{PHASE_ICONS[phaseName] ?? "📌"}</span>
            <span style={{ textTransform: "capitalize" }}>{phaseName}</span>
          </span>
        }
        icon={undefined}
        accent={phaseAccent}
      />
      <SummaryCard
        label="Phase Status"
        value={
          <span style={{
            color: phase?.status === "active" ? "#10b981" : phase?.status === "completed" ? "#94a3b8" : "#f59e0b",
            textTransform: "capitalize",
          }}>
            {phase?.status ?? "—"}
          </span>
        }
        icon="🔄"
        accent="#14b8a6"
      />
    </div>
  );
}
