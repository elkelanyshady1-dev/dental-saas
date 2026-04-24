/**
 * NotesCard.tsx
 * Shows clinical notes (from snapshot) and administrative notes (from VisitRecord).
 * Clinical notes are READ-ONLY (snapshot immutability).
 */

import React from "react";
import { SnapshotSummary, VisitRecordSummary } from "@hooks/useVisitDetail";

interface Props {
  snapshot: SnapshotSummary | null;
  visit:    VisitRecordSummary | null;
}

function extractClinicalNotes(snapshot: SnapshotSummary | null): { text: string; tags: string[]; warnings: string[] } {
  if (!snapshot) return { text: "", tags: [], warnings: [] };
  const notes = snapshot.notes;
  if (typeof notes === "string") return { text: notes, tags: [], warnings: [] };
  return {
    text:     notes?.text     ?? "",
    tags:     notes?.tags     ?? [],
    warnings: notes?.warnings ?? [],
  };
}

export function NotesCard({ snapshot, visit }: Props) {
  const clinicalNotes = extractClinicalNotes(snapshot);
  const adminNotes    = visit?.notes ?? "";

  const hasAnything = clinicalNotes.text || adminNotes || clinicalNotes.warnings.length;

  return (
    <div style={{
      background:   "rgba(255,255,255,0.04)",
      border:       "1px solid rgba(255,255,255,0.08)",
      borderRadius: "12px",
      padding:      "20px",
    }}>
      <h3 style={{
        margin: "0 0 16px",
        fontSize: "14px",
        fontWeight: 600,
        color: "#94a3b8",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}>
        Notes
      </h3>

      {!hasAnything && (
        <p style={{ margin: 0, fontSize: "13px", color: "#475569", fontStyle: "italic" }}>
          No notes recorded for this visit.
        </p>
      )}

      {/* Clinical warnings */}
      {clinicalNotes.warnings.length > 0 && (
        <div style={{ marginBottom: "14px" }}>
          {clinicalNotes.warnings.map((w, i) => (
            <div key={i} style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
              padding: "8px 12px",
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: "8px",
              marginBottom: "6px",
            }}>
              <span style={{ color: "#ef4444", flexShrink: 0, fontSize: "13px" }}>⚠️</span>
              <span style={{ fontSize: "13px", color: "#fca5a5", lineHeight: 1.5 }}>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Clinical notes (from snapshot — immutable) */}
      {clinicalNotes.text && (
        <div style={{ marginBottom: "14px" }}>
          <div style={{ fontSize: "11px", color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
            Clinical Notes
            <span style={{
              marginLeft: "8px",
              background: "rgba(99,102,241,0.15)",
              color: "#818cf8",
              borderRadius: "20px",
              padding: "1px 8px",
              fontSize: "10px",
            }}>IMMUTABLE</span>
          </div>
          <p style={{
            margin: 0,
            fontSize: "13px",
            color: "#cbd5e1",
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
          }}>
            {clinicalNotes.text}
          </p>
        </div>
      )}

      {/* Tags */}
      {clinicalNotes.tags.length > 0 && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
          {clinicalNotes.tags.map((tag, i) => (
            <span key={i} style={{
              background: "rgba(99,102,241,0.15)",
              color: "#818cf8",
              borderRadius: "20px",
              padding: "2px 10px",
              fontSize: "11px",
              fontWeight: 500,
            }}>
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Administrative notes (from VisitRecord) */}
      {adminNotes && (
        <div>
          <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
            Administrative Notes
          </div>
          <p style={{
            margin: 0,
            fontSize: "13px",
            color: "#94a3b8",
            lineHeight: 1.7,
            fontStyle: "italic",
            whiteSpace: "pre-wrap",
          }}>
            {adminNotes}
          </p>
        </div>
      )}
    </div>
  );
}
