/**
 * EventReplayPanel.jsx
 * Sprint 8 — Extracted Billing Event Replay Component
 *
 * Props:
 *   events       BillingLedger[]   — list of events to render
 *   onReplay     (entryId) => Promise<void>  — called when Replay is confirmed
 *
 * Guards:
 *   Replay button and modal require MANAGE_BILLING capability.
 *
 * Capability rule: capabilities.includes("MANAGE_BILLING") — no bracket access.
 */
import React, { useState } from "react";
import RequireCapability from "@/platform/core/guards/RequireCapability";
import platformApi from "@/platform/auth/platformApi";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EVT_COLORS = {
    "payment.succeeded": "#10b981",
    "payment.failed": "#ef4444",
    "invoice.refunded": "#f59e0b",
    "subscription.created": "#818cf8",
    "subscription.canceled": "#64748b",
    PAYMENT_SUCCEEDED: "#10b981",
    PAYMENT_FAILED: "#ef4444",
    REFUND_COMPLETED: "#f59e0b",
    CONTRACT_ACTIVATED: "#818cf8",
    CONTRACT_CANCELLED: "#64748b",
};

const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "2-digit",
        hour: "2-digit", minute: "2-digit",
    }) : "—";

// ─── Sub-components ───────────────────────────────────────────────────────────

function EventTypeBadge({ eventType }) {
    const color = EVT_COLORS[eventType] || "#94a3b8";
    return (
        <span style={{
            fontSize: "0.75rem", color, fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace",
        }}>
            {eventType}
        </span>
    );
}

function ReplayConfirmModal({ entry, onConfirm, onClose }) {
    const [confirmed, setConfirmed] = useState(false);
    const [replaying, setReplaying] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState(null); // "success" | "duplicate" | null

    const handleConfirm = async () => {
        setReplaying(true);
        setError("");
        setResult(null);
        try {
            const { data } = await platformApi.post(
                `/billing/events/${entry._id}/replay`,
                { providerEventId: entry.providerEventId || entry._id }
            );
            if (!data.success) throw new Error(data.message || "Replay failed");
            setResult(data.data?.alreadyProcessed ? "duplicate" : "success");
            setTimeout(onClose, 1800);
            await onConfirm(entry._id);
        } catch (err) {
            setError(err.response?.data?.message || err.message);
            setReplaying(false);
        }
    };

    return (
        <div
            className="plans-modal-overlay"
            id="replay-confirm-overlay"
            onClick={replaying ? undefined : onClose}
        >
            <div
                className="plans-diff-modal"
                onClick={e => e.stopPropagation()}
                style={{ maxWidth: 480 }}
            >
                <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span>♻️</span> Confirm Event Replay
                </h3>
                <p className="plans-modal-info" style={{ marginBottom: "1.25rem" }}>
                    You are about to replay ledger entry{" "}
                    <code className="plans-code-badge">{entry._id}</code>.
                    This re-runs the state logic for a <strong>{entry.eventType}</strong> event.
                    No payment charges are made.
                </p>

                {/* Entry summary */}
                <div style={{
                    background: "rgba(15,23,42,0.5)", borderRadius: "0.5rem",
                    padding: "0.875rem 1rem", marginBottom: "1rem",
                    border: "1px solid rgba(51,65,85,0.4)", fontSize: "0.8rem",
                }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                        {[
                            ["Event", entry.eventType],
                            ["Provider", entry.provider || "—"],
                            ["Amount", `${entry.currency || ""} ${(entry.amount || 0).toLocaleString()}`],
                            ["Event ID", entry.providerEventId ? String(entry.providerEventId).slice(-12) : "—"],
                            ["Occurred", fmtDate(entry.occurredAt || entry.createdAt)],
                        ].map(([k, v]) => (
                            <div key={k}>
                                <div style={{ color: "#475569", fontSize: "0.68rem", textTransform: "uppercase", marginBottom: "0.15rem" }}>{k}</div>
                                <div style={{ color: "#e2e8f0", fontWeight: 600 }}>{v}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="plans-alert plans-alert-info" style={{ marginBottom: "1rem" }}>
                    ⚠ Replay is idempotent — if the event was already processed, the system will detect the duplicate and skip re-processing.
                </div>

                {/* Result states */}
                {result === "success" && (
                    <div className="plans-alert plans-alert-success" style={{ marginBottom: "1rem" }}>
                        ✅ Event replayed successfully.
                    </div>
                )}
                {result === "duplicate" && (
                    <div className="plans-alert plans-alert-info" style={{ marginBottom: "1rem" }}>
                        ℹ Already processed — no duplicate action taken.
                    </div>
                )}

                {/* Confirm checkbox */}
                <label style={{
                    display: "flex", alignItems: "flex-start", gap: "0.6rem",
                    cursor: "pointer", fontSize: "0.82rem", color: "#94a3b8",
                    marginBottom: "1.1rem", userSelect: "none",
                }}>
                    <input
                        id="replay-confirm-checkbox"
                        type="checkbox"
                        checked={confirmed}
                        onChange={e => setConfirmed(e.target.checked)}
                        disabled={replaying}
                        style={{ marginTop: "0.1rem", accentColor: "#7c3aed", cursor: "pointer" }}
                    />
                    I understand this re-runs billing state logic and have verified this event should be replayed.
                </label>

                {error && (
                    <div className="plans-alert plans-alert-error" style={{ marginBottom: "1rem" }}>{error}</div>
                )}

                <div className="plans-modal-actions">
                    <button className="plans-btn plans-btn-outline" onClick={onClose} disabled={replaying}>Cancel</button>
                    <button
                        id="confirm-replay-btn"
                        className="plans-btn plans-btn-primary"
                        onClick={handleConfirm}
                        disabled={!confirmed || replaying || !!result}
                        style={{
                            background: (confirmed && !result) ? "linear-gradient(135deg, #7c3aed, #6d28d9)" : "rgba(100,116,139,0.3)",
                            borderColor: (confirmed && !result) ? "#7c3aed" : "transparent",
                            cursor: (!confirmed || replaying) ? "not-allowed" : "pointer",
                            transition: "background 0.2s",
                        }}
                    >
                        {replaying ? "Replaying…" : "Confirm Replay"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * EventReplayPanel
 *
 * @param {Object[]} events         — array of BillingLedger entries
 * @param {Function} onReplay       — (entryId) => Promise<void>  called after successful replay
 */
export default function EventReplayPanel({ events = [], onReplay }) {
    const [replayTarget, setReplayTarget] = useState(null);

    if (events.length === 0) {
        return (
            <div className="plans-empty-state" style={{ margin: "2rem" }}>
                <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📋</div>
                No billing events found.
            </div>
        );
    }

    return (
        <>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                    <tr style={{ borderBottom: "1px solid rgba(30,41,59,0.8)" }}>
                        {["Event", "Provider", "Event ID", "Occurred", "Action"].map(h => (
                            <th key={h} style={{
                                textAlign: "left", padding: "0.6rem 1rem",
                                fontSize: "0.65rem", textTransform: "uppercase",
                                letterSpacing: "0.05em", color: "#94a3b8",
                                fontWeight: 600, background: "rgba(15,23,42,0.5)",
                            }}>
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {events.map((entry, idx) => (
                        <tr
                            key={entry._id}
                            id={`replay-event-row-${entry._id}`}
                            style={{
                                borderBottom: idx < events.length - 1 ? "1px solid rgba(30,41,59,0.4)" : "none",
                                transition: "background 0.1s",
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(51,65,85,0.1)"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                            {/* eventType */}
                            <td style={{ padding: "0.75rem 1rem" }}>
                                <EventTypeBadge eventType={entry.eventType} />
                                {entry.metadata?.replayOf && (
                                    <span style={{ marginLeft: "0.4rem", fontSize: "0.6rem", color: "#475569", fontStyle: "italic" }}>replay</span>
                                )}
                            </td>

                            {/* provider */}
                            <td style={{ padding: "0.75rem 1rem", fontSize: "0.75rem", color: "#64748b" }}>
                                {entry.provider || "—"}
                            </td>

                            {/* providerEventId */}
                            <td style={{ padding: "0.75rem 1rem", fontSize: "0.7rem", color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>
                                {entry.providerEventId ? String(entry.providerEventId).slice(-12) : "—"}
                            </td>

                            {/* occurredAt */}
                            <td style={{ padding: "0.75rem 1rem", fontSize: "0.75rem", color: "#64748b" }}>
                                {fmtDate(entry.occurredAt || entry.createdAt)}
                            </td>

                            {/* Replay button — guarded by MANAGE_BILLING */}
                            <td style={{ padding: "0.75rem 1rem" }}>
                                <RequireCapability permission="MANAGE_BILLING" silent>
                                    <button
                                        id={`replay-btn-${entry._id}`}
                                        className="plans-btn plans-btn-sm plans-btn-outline"
                                        onClick={() => setReplayTarget(entry)}
                                        title="Replay this billing event"
                                    >
                                        ♻ Replay
                                    </button>
                                </RequireCapability>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Replay confirmation modal */}
            {replayTarget && (
                <ReplayConfirmModal
                    entry={replayTarget}
                    onConfirm={async (entryId) => {
                        setReplayTarget(null);
                        await onReplay?.(entryId);
                    }}
                    onClose={() => setReplayTarget(null)}
                />
            )}
        </>
    );
}
