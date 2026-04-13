/**
 * VersionDiffModal.jsx
 * Plan Version Diff Viewer
 *
 * Uses:
 * - platformApi (never raw fetch)
 * - design-system: Card, Button, Badge, DataTable
 *
 * IMPORTANT CONTRACT NOTES:
 * - DataTable requires `renderRow` — raw arrays are not accepted
 * - Badge.status only accepts: active | draft | deprecated | published | archived | inactive
 *   For semantic colours use Badge.variant: info | success | warning | danger | brand | default
 */

import React, { useState, useEffect } from "react";
import platformApi from "@/platform/auth/platformApi";
import { Card, Button, Badge, DataTable } from "@/design-system";

// ── Constants ─────────────────────────────────────────────────────────────────
const ARROW = "\u2192"; // →
const DASH = "\u2014"; // —

// ── Value formatter ───────────────────────────────────────────────────────────
function formatValue(v) {
    if (v === null || v === undefined) return DASH;
    if (typeof v === "boolean") return v ? "Enabled" : "Disabled";
    return String(v);
}

// ── Diff row builder ──────────────────────────────────────────────────────────
// Produces a flat array of { section, field, from, to } — one per changed field.
function buildRows(diff) {
    if (!diff) return [];
    const rows = [];

    diff.pricingChanges?.forEach((c) => {
        rows.push({
            section: "Pricing",
            field: `${c.regionCode} \u00b7 ${c.field}`,
            from: formatValue(c.from),
            to: formatValue(c.to),
            isAdded: c.from === null,
            isRemoved: c.to === null,
        });
    });

    diff.limitChanges?.forEach((c) => {
        rows.push({
            section: "Limits",
            field: c.field,
            from: formatValue(c.from),
            to: formatValue(c.to),
            isAdded: false,
            isRemoved: false,
        });
    });

    diff.moduleChanges?.forEach((c) => {
        rows.push({
            section: "Modules",
            field: c.module,
            from: formatValue(c.from),
            to: formatValue(c.to),
            isAdded: c.from === null || c.from === false,
            isRemoved: c.to === null || c.to === false,
        });
    });

    if (diff.trialChange) {
        const { from, to } = diff.trialChange;
        rows.push({
            section: "Policy",
            field: "Trial Days",
            from: from != null ? `${from}d` : DASH,
            to: to != null ? `${to}d` : DASH,
            isAdded: false,
            isRemoved: false,
        });
    }

    if (diff.inflationChange) {
        rows.push({
            section: "Policy",
            field: "Inflation Policy",
            from: JSON.stringify(diff.inflationChange.from),
            to: JSON.stringify(diff.inflationChange.to),
            isAdded: false,
            isRemoved: false,
        });
    }

    return rows;
}

// ── DataTable renderRow ───────────────────────────────────────────────────────
// DataTable expects renderRow(row, idx) → <tr>
// Colours: isAdded = green-tinted, isRemoved = red-tinted, changed = default
function DiffRow({ row, idx }) {
    const toColor = row.isAdded ? "#10b981"
        : row.isRemoved ? "#ef4444"
            : "#e2e8f0";

    const rowBg = row.isAdded ? "rgba(16,185,129,0.05)"
        : row.isRemoved ? "rgba(239,68,68,0.05)"
            : "transparent";

    return (
        <tr
            key={idx}
            style={{
                borderBottom: "1px solid rgba(51,65,85,0.18)",
                background: rowBg,
            }}
        >
            {/* Section */}
            <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.68rem", color: "#6366f1", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                {row.section}
            </td>
            {/* Field */}
            <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.78rem", color: "#94a3b8" }}>
                {row.field}
            </td>
            {/* Before */}
            <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.78rem", color: "#475569", fontFamily: "'JetBrains Mono', monospace" }}>
                {row.from}
            </td>
            {/* Arrow */}
            <td style={{ padding: "0.5rem 0.4rem", fontSize: "0.75rem", color: "#334155", textAlign: "center" }}>
                {ARROW}
            </td>
            {/* After */}
            <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.78rem", fontFamily: "'JetBrains Mono', monospace", color: toColor, fontWeight: 600 }}>
                {row.to}
            </td>
        </tr>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function VersionDiffModal({ templateVersions = [], onClose }) {
    const [versionAId, setVersionAId] = useState("");
    const [versionBId, setVersionBId] = useState("");
    const [diff, setDiff] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Auto-select newest-vs-previous on open
    useEffect(() => {
        if (templateVersions.length >= 2) {
            setVersionAId(templateVersions[1]?._id ?? "");
            setVersionBId(templateVersions[0]?._id ?? "");
        }
    }, [templateVersions]);

    const canCompare = !!(versionAId && versionBId && versionAId !== versionBId);

    async function runDiff() {
        if (!canCompare) return;
        setLoading(true);
        setError("");
        setDiff(null);
        try {
            const { data } = await platformApi.get(
                `/plan-versions/diff?versionAId=${versionAId}&versionBId=${versionBId}`
            );
            if (!data.success) throw new Error(data.message || "Diff request failed");
            setDiff(data.data);
        } catch (err) {
            setError(err.response?.data?.message || err.message || "Unknown error");
        } finally {
            setLoading(false);
        }
    }

    const rows = buildRows(diff);

    return (
        <div className="plans-modal-overlay" id="version-diff-overlay" onClick={onClose}>
            <Card
                variant="dark"
                className="plans-diff-modal"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: 700, width: "95vw", padding: "1.5rem" }}
            >
                {/* ── Header ─────────────────────────────────────────────── */}
                <div className="plans-modal-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
                    <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#f1f5f9" }}>
                        Compare Versions
                    </h3>
                    <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
                        {"\u00d7"}{/* × */}
                    </Button>
                </div>

                {/* ── Version selectors ──────────────────────────────────── */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "0.75rem", alignItems: "center", marginBottom: "1rem" }}>
                    <div>
                        <label style={{ display: "block", fontSize: "0.7rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.3rem" }}>
                            Version A (baseline)
                        </label>
                        <select
                            id="diff-version-a"
                            className="plans-input"
                            value={versionAId}
                            onChange={(e) => setVersionAId(e.target.value)}
                        >
                            <option value="">— select —</option>
                            {templateVersions.map((v) => (
                                <option key={v._id} value={v._id}>
                                    {v.versionTag} — {v.label || "unlabelled"}
                                </option>
                            ))}
                        </select>
                    </div>

                    <span style={{ textAlign: "center", paddingTop: "1.25rem", color: "#334155", fontSize: "1.1rem" }}>
                        {ARROW}
                    </span>

                    <div>
                        <label style={{ display: "block", fontSize: "0.7rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.3rem" }}>
                            Version B (target)
                        </label>
                        <select
                            id="diff-version-b"
                            className="plans-input"
                            value={versionBId}
                            onChange={(e) => setVersionBId(e.target.value)}
                        >
                            <option value="">— select —</option>
                            {templateVersions.map((v) => (
                                <option key={v._id} value={v._id}>
                                    {v.versionTag} — {v.label || "unlabelled"}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* ── Actions ────────────────────────────────────────────── */}
                <div className="plans-modal-actions" style={{ marginBottom: "1rem" }}>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        id="run-diff-btn"
                        onClick={runDiff}
                        loading={loading}
                        disabled={!canCompare || loading}
                    >
                        {loading ? "Comparing\u2026" : "Compare"}
                    </Button>
                </div>

                {/* ── Error banner — NOT using Badge (Badge is for labels, not messages) ── */}
                {error && (
                    <div
                        style={{
                            padding: "0.65rem 1rem",
                            borderRadius: "0.5rem",
                            background: "rgba(239,68,68,0.08)",
                            border: "1px solid rgba(239,68,68,0.25)",
                            color: "#f87171",
                            fontSize: "0.82rem",
                            marginBottom: "1rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                        }}
                    >
                        <span>{error}</span>
                        <button
                            onClick={() => setError("")}
                            style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "1rem", padding: "0 0.25rem" }}
                            aria-label="Dismiss error"
                        >
                            {"\u00d7"}
                        </button>
                    </div>
                )}

                {/* ── Results ────────────────────────────────────────────── */}
                {diff && (
                    <>
                        {/* Summary strip */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.875rem" }}>
                            {/* Badge.variant works for semantic colours; Badge.status is only for PlanVersion statuses */}
                            <Badge variant="brand">
                                {diff.versionA?.versionTag ?? "A"} {ARROW} {diff.versionB?.versionTag ?? "B"}
                            </Badge>
                            <Badge variant={rows.length > 0 ? "warning" : "success"}>
                                {rows.length === 0
                                    ? "Identical"
                                    : `${rows.length} change${rows.length !== 1 ? "s" : ""}`}
                            </Badge>
                        </div>

                        {/* DataTable — MUST provide renderRow */}
                        <DataTable
                            columns={["Section", "Field", "Before (A)", "", "After (B)"]}
                            rows={rows}
                            emptyMessage="No differences found between these versions."
                            renderRow={(row, idx) => <DiffRow key={idx} row={row} idx={idx} />}
                        />
                    </>
                )}
            </Card>
        </div>
    );
}