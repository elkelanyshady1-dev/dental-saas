/**
 * VisitDetailsPage.tsx
 * Domain: orthodontic-cases
 * Layer: Frontend > Pages
 *
 * Full visit detail view for the Clinical Case Engine.
 * Connects to: GET /orthodontic-cases/:caseId/timeline/:visitId
 *
 * ARCHITECTURE RULES:
 *   ✅ Uses useQuery via useVisitDetail hook (NOT useEffect+fetch)
 *   ✅ Procedures sourced ONLY from snapshot.procedures (SOURCE OF TRUTH)
 *   ✅ Read-only — no edit controls on snapshot data
 *   ✅ "View in Chart" button navigates to snapshot viewer with snapshotId
 */

import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useVisitDetail } from "@hooks/useVisitDetail";
import { ClinicalTimeline }  from "@components/orthodontics/visit/ClinicalTimeline";
import { VisitSummaryCards } from "@components/orthodontics/visit/VisitSummaryCards";
import { AttachmentsGrid }   from "@components/orthodontics/visit/AttachmentsGrid";
import { NotesCard }         from "@components/orthodontics/visit/NotesCard";

// ── Phase color map ──────────────────────────────────────────────────────────
const PHASE_GRADIENTS: Record<string, string> = {
  bonding:          "linear-gradient(135deg, #065f46 0%, #0f172a 100%)",
  active:           "linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)",
  retention:        "linear-gradient(135deg, #451a03 0%, #0f172a 100%)",
  "post-treatment": "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
};

const PHASE_ACCENT: Record<string, string> = {
  bonding:          "#10b981",
  active:           "#6366f1",
  retention:        "#f59e0b",
  "post-treatment": "#64748b",
};

// ── Loading skeleton ──────────────────────────────────────────────────────────
function PageSkeleton() {
  return (
    <div style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header skeleton */}
      <div style={{ height: "140px", borderRadius: "16px", background: "rgba(255,255,255,0.04)", marginBottom: "24px", animation: "shimmer 1.5s infinite" }} />
      {/* Grid skeleton */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "20px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ height: "200px", borderRadius: "12px", background: "rgba(255,255,255,0.04)", animation: "shimmer 1.5s infinite" }} />
          <div style={{ height: "160px", borderRadius: "12px", background: "rgba(255,255,255,0.04)", animation: "shimmer 1.5s infinite" }} />
        </div>
        <div style={{ height: "420px", borderRadius: "12px", background: "rgba(255,255,255,0.04)", animation: "shimmer 1.5s infinite" }} />
      </div>
    </div>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────
function ErrorState({ message }: { message: string }) {
  const navigate = useNavigate();
  return (
    <div style={{
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      minHeight:      "400px",
      padding:        "40px",
      color:          "#ef4444",
      textAlign:      "center",
    }}>
      <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
      <h2 style={{ margin: "0 0 8px", fontSize: "20px", fontWeight: 600 }}>Visit not found</h2>
      <p style={{ margin: "0 0 20px", fontSize: "14px", color: "#94a3b8" }}>{message}</p>
      <button
        onClick={() => navigate(-1)}
        style={{
          padding:       "10px 20px",
          background:    "rgba(99,102,241,0.15)",
          color:         "#818cf8",
          border:        "1px solid rgba(99,102,241,0.3)",
          borderRadius:  "8px",
          cursor:        "pointer",
          fontSize:      "14px",
          fontWeight:    500,
        }}
      >
        ← Go Back
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function VisitDetailsPage() {
  const { caseId, visitId } = useParams<{ caseId: string; visitId: string }>();
  const navigate = useNavigate();
  const { visit, phase, snapshot, procedures, isLoading, isError, error } = useVisitDetail(caseId ?? null, visitId ?? null);

  if (isLoading) return <PageSkeleton />;
  if (isError || (!isLoading && !visit)) {
    return <ErrorState message={(error as Error)?.message ?? "Could not load visit data"} />;
  }

  const phaseName    = phase?.name ?? "active";
  const headerBg     = PHASE_GRADIENTS[phaseName] ?? PHASE_GRADIENTS["active"];
  const accentColor  = PHASE_ACCENT[phaseName] ?? "#6366f1";
  const visitDate    = visit?.createdAt
    ? new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(new Date(visit.createdAt))
    : "—";

  return (
    <div style={{
      minHeight:   "100vh",
      background:  "#0b1120",
      color:       "#f1f5f9",
      fontFamily:  "'Inter', 'Segoe UI', system-ui, sans-serif",
    }}>
      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div style={{
        background:    headerBg,
        borderBottom:  "1px solid rgba(255,255,255,0.08)",
        padding:       "28px 32px",
      }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          {/* Breadcrumb nav */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <button
              onClick={() => navigate(-1)}
              style={{
                display:        "flex",
                alignItems:     "center",
                gap:            "6px",
                background:     "transparent",
                border:         "none",
                color:          "#64748b",
                cursor:         "pointer",
                fontSize:       "13px",
                padding:        "0",
                transition:     "color 0.15s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#64748b"; }}
              aria-label="Go back to case timeline"
            >
              ← Case Timeline
            </button>
            <span style={{ color: "#374151", fontSize: "13px" }}>/</span>
            <span style={{ fontSize: "13px", color: "#94a3b8" }}>
              Visit #{visit?.visitNumber ?? "—"}
            </span>
          </div>

          {/* Title row */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
            <div>
              <h1 style={{ margin: "0 0 6px", fontSize: "26px", fontWeight: 700, lineHeight: 1.3 }}>
                Visit #{visit?.visitNumber ?? "—"}
                <span style={{
                  marginLeft:    "12px",
                  fontSize:      "14px",
                  fontWeight:    500,
                  background:    `${accentColor}20`,
                  color:         accentColor,
                  border:        `1px solid ${accentColor}40`,
                  borderRadius:  "20px",
                  padding:       "2px 12px",
                  verticalAlign: "middle",
                  textTransform: "capitalize",
                }}>
                  {phaseName} phase
                </span>
              </h1>
              <p style={{ margin: 0, fontSize: "14px", color: "#94a3b8" }}>{visitDate}</p>
            </div>

            {/* "View in Chart" CTA — snapshot viewer navigation */}
            {snapshot?.id && (
              <button
                id="view-snapshot-btn"
                onClick={() => navigate(`/orthodontic-chart?snapshotId=${snapshot.id}`)}
                style={{
                  display:       "flex",
                  alignItems:    "center",
                  gap:           "8px",
                  padding:       "10px 20px",
                  background:    accentColor,
                  color:         "#fff",
                  border:        "none",
                  borderRadius:  "10px",
                  cursor:        "pointer",
                  fontSize:      "13px",
                  fontWeight:    600,
                  whiteSpace:    "nowrap",
                  transition:    "opacity 0.15s ease, transform 0.15s ease",
                  flexShrink:    0,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.85"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
                title="Open the dental chart viewer for this snapshot (read-only)"
              >
                🦷 View in Chart
              </button>
            )}
          </div>

          {/* Procedure count badge */}
          {procedures.length > 0 && (
            <div style={{ display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}>
              <span style={{
                background:   "rgba(255,255,255,0.07)",
                borderRadius: "20px",
                padding:      "3px 12px",
                fontSize:     "12px",
                color:        "#cbd5e1",
              }}>
                {procedures.length} procedure{procedures.length !== 1 ? "s" : ""} recorded
              </span>
              {snapshot?.attachments && snapshot.attachments.length > 0 && (
                <span style={{
                  background:   "rgba(255,255,255,0.07)",
                  borderRadius: "20px",
                  padding:      "3px 12px",
                  fontSize:     "12px",
                  color:        "#cbd5e1",
                }}>
                  {snapshot.attachments.length} attachment{snapshot.attachments.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── BODY ────────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "28px 32px" }}>
        {/* Thumbnail preview strip */}
        {snapshot?.thumbnail && (
          <div style={{
            marginBottom:  "24px",
            borderRadius:  "12px",
            overflow:      "hidden",
            border:        "1px solid rgba(255,255,255,0.08)",
            maxHeight:     "200px",
            position:      "relative",
          }}>
            <img
              src={snapshot.thumbnail}
              alt="Dental chart snapshot thumbnail"
              style={{ width: "100%", objectFit: "cover", display: "block" }}
            />
            <div style={{
              position:   "absolute",
              top:        "10px",
              right:      "10px",
              background: "rgba(0,0,0,0.6)",
              borderRadius:"6px",
              padding:    "4px 10px",
              fontSize:   "11px",
              color:      "#94a3b8",
            }}>
              📷 Chart snapshot
            </div>
          </div>
        )}

        {/* 2-column layout */}
        <div style={{
          display:             "grid",
          gridTemplateColumns: "380px 1fr",
          gap:                 "20px",
          alignItems:          "start",
        }}>
          {/* ── LEFT COLUMN ────────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Visit metadata cards */}
            <VisitSummaryCards visit={visit} phase={phase} isLoading={isLoading} />

            {/* Notes */}
            <NotesCard snapshot={snapshot} visit={visit} />
          </div>

          {/* ── RIGHT COLUMN ───────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Clinical timeline (procedures from snapshot) */}
            <div style={{
              background:   "rgba(255,255,255,0.04)",
              border:       "1px solid rgba(255,255,255,0.08)",
              borderRadius: "12px",
              padding:      "20px",
            }}>
              <ClinicalTimeline
                procedures={procedures}
                snapshotCreatedAt={snapshot?.createdAt ?? null}
                isLoading={isLoading}
              />
            </div>

            {/* Attachments */}
            <AttachmentsGrid
              attachments={(() => {
                const snapAttachments = snapshot?.attachments ?? [];
                const visitAttachments = visit?.attachments ?? [];
                // Merge — snapshot is source of truth, visit adds coordinator attachments
                const urlSet = new Set(snapAttachments.map((a) => a.url));
                const merged = [...snapAttachments, ...visitAttachments.filter((a) => !urlSet.has(a.url))];
                return merged;
              })()}
              snapshotId={snapshot?.id ?? null}
            />
          </div>
        </div>

        {/* ── IMMUTABILITY NOTICE ─────────────────────────────────────────── */}
        <div style={{
          marginTop:   "28px",
          padding:     "12px 16px",
          background:  "rgba(99,102,241,0.06)",
          border:      "1px solid rgba(99,102,241,0.15)",
          borderRadius:"10px",
          display:     "flex",
          alignItems:  "center",
          gap:         "10px",
        }}>
          <span style={{ fontSize: "16px" }}>🔒</span>
          <p style={{ margin: 0, fontSize: "12px", color: "#64748b", lineHeight: 1.5 }}>
            <strong style={{ color: "#818cf8" }}>Snapshot immutability:</strong>{" "}
            All clinical data on this page is read-only. Procedures are auto-derived from the
            dental chart state recorded at visit time. No modifications are possible.
          </p>
        </div>
      </div>

      {/* ── GLOBAL SHIMMER ANIMATION ─────────────────────────────────────── */}
      <style>{`
        @keyframes shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.7; }
          100% { opacity: 0.4; }
        }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}

export default VisitDetailsPage;
