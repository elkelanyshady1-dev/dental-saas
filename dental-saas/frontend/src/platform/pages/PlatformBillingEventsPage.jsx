/**
 * PlatformBillingEventsPage.jsx
 * Feature 3 — Billing Event Replay Admin UI
 *
 * Route: /platform/billing/events
 *
 * Shows a paginated table of replayable BillingLedger entries.
 * Each row has a "Replay" button that opens a confirmation dialog
 * and then calls POST /api/platform/billing/events/:id/replay.
 *
 * Uses platformApi (never raw fetch).
 * Uses plans design tokens (plans.css classes).
 *
 * ADMIN SAFETY: Replay requires explicit checkbox + confirm.
 */
import React, { useState, useEffect, useCallback } from "react";
import platformApi from "@/platform/auth/platformApi";
import "../modules/plans/plans.css";
// Fix 2 + Fix 4: extracted panel with MANAGE_BILLING guard
import EventReplayPanel from "../modules/billing/components/EventReplayPanel";
import RequireCapability from "@/platform/core/guards/RequireCapability";

// ── Provider badge ────────────────────────────────────────────────────────────
const PROVIDER_CFG = {
    stripe: { label: "Stripe", bg: "rgba(99, 102,241,0.12)", color: "#818cf8", border: "rgba(99,102,241,0.25)" },
    paymob: { label: "Paymob", bg: "rgba(16, 185,129,0.12)", color: "#10b981", border: "rgba(16,185,129,0.25)" },
    paypal: { label: "PayPal", bg: "rgba(245,158, 11,0.12)", color: "#f59e0b", border: "rgba(245,158,11,0.25)" },
    internal: { label: "Internal", bg: "rgba(71,  85,105,0.12)", color: "#64748b", border: "rgba(71,85,105,0.25)" },
};

function ProviderBadge({ provider }) {
    const cfg = PROVIDER_CFG[provider] || PROVIDER_CFG.internal;
    return (
        <span style={{
            display: "inline-flex", alignItems: "center",
            padding: "0.15rem 0.55rem", borderRadius: "999px",
            fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.04em",
            background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
            textTransform: "uppercase"
        }}>
            {cfg.label}
        </span>
    );
}

// ── Event type badge ──────────────────────────────────────────────────────────
const EVT_COLORS = {
    "payment.succeeded": "#10b981",
    "payment.failed": "#ef4444",
    "invoice.refunded": "#f59e0b",
    "subscription.created": "#818cf8",
    "subscription.canceled": "#64748b",
};

function EventTypeBadge({ eventType }) {
    const color = EVT_COLORS[eventType] || "#94a3b8";
    return (
        <span style={{ fontSize: "0.75rem", color, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
            {eventType}
        </span>
    );
}

// ── Replay confirmation modal ─────────────────────────────────────────────────

function ReplayConfirmModal({ entry, onConfirm, onClose }) {
    const [confirmed, setConfirmed] = useState(false);
    const [replaying, setReplaying] = useState(false);
    const [error, setError] = useState("");

    const handleConfirm = async () => {
        setReplaying(true);
        setError("");
        try {
            await onConfirm(entry._id);
            onClose();
        } catch (err) {
            setError(err.response?.data?.message || err.message);
            setReplaying(false);
        }
    };

    return (
        <div className="plans-modal-overlay" id="replay-confirm-overlay" onClick={replaying ? undefined : onClose}>
            <div className="plans-diff-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
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
                    border: "1px solid rgba(51,65,85,0.4)", fontSize: "0.8rem"
                }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                        {[
                            ["Event", entry.eventType],
                            ["Provider", entry.provider],
                            ["Amount", `${entry.currency} ${(entry.amount || 0).toLocaleString()}`],
                            ["Recorded", new Date(entry.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })]
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

                {/* Confirmation checkbox */}
                <label style={{
                    display: "flex", alignItems: "flex-start", gap: "0.6rem",
                    cursor: "pointer", fontSize: "0.82rem", color: "#94a3b8",
                    marginBottom: "1.1rem", userSelect: "none"
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
                        disabled={!confirmed || replaying}
                        style={{
                            background: confirmed ? "linear-gradient(135deg, #7c3aed, #6d28d9)" : "rgba(100,116,139,0.3)",
                            borderColor: confirmed ? "#7c3aed" : "transparent",
                            cursor: (!confirmed || replaying) ? "not-allowed" : "pointer",
                            transition: "background 0.2s"
                        }}
                    >
                        {replaying ? "Replaying…" : "Confirm Replay"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PlatformBillingEventsPage() {
    const [entries, setEntries] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [replayTarget, setReplayTarget] = useState(null);

    // Filters
    const [filterProvider, setFilterProvider] = useState("");
    const [filterEventType, setFilterEventType] = useState("");

    const LIMIT = 50;

    const fetchEvents = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const params = { page, limit: LIMIT };
            if (filterProvider) params.provider = filterProvider;
            if (filterEventType) params.eventType = filterEventType;
            const { data } = await platformApi.get("/billing/events", { params });
            if (!data.success) throw new Error(data.message || "Failed to load events");
            setEntries(data.data.entries || []);
            setTotal(data.data.total || 0);
        } catch (err) {
            setError(err.response?.data?.message || err.message);
        } finally {
            setLoading(false);
        }
    }, [page, filterProvider, filterEventType]);

    useEffect(() => { fetchEvents(); }, [fetchEvents]);

    const handleReplayConfirm = async (entryId) => {
        const { data } = await platformApi.post(`/billing/events/${entryId}/replay`);
        if (!data.success) throw new Error(data.message || "Replay failed");
        setSuccess(`Event ${entryId} replayed successfully.`);
        fetchEvents();
    };

    const totalPages = Math.ceil(total / LIMIT);

    return (
        <div className="plans-page">
            {/* Header */}
            <div className="plans-header" style={{ marginBottom: "1.5rem" }}>
                <div>
                    <h1 className="plans-title">Billing Event Log</h1>
                    <p className="plans-subtitle">
                        Append-only ledger of financial events. Replay replayable events to re-sync state.
                    </p>
                </div>
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                    {/* Provider filter */}
                    <select
                        className="plans-input"
                        style={{ width: "auto", minWidth: 120 }}
                        value={filterProvider}
                        onChange={e => { setFilterProvider(e.target.value); setPage(1); }}
                        id="filter-provider"
                    >
                        <option value="">All Providers</option>
                        <option value="stripe">Stripe</option>
                        <option value="paymob">Paymob</option>
                        <option value="paypal">PayPal</option>
                        <option value="internal">Internal</option>
                    </select>

                    {/* Event type filter */}
                    <select
                        className="plans-input"
                        style={{ width: "auto", minWidth: 180 }}
                        value={filterEventType}
                        onChange={e => { setFilterEventType(e.target.value); setPage(1); }}
                        id="filter-event-type"
                    >
                        <option value="">All Event Types</option>
                        <option value="payment.succeeded">payment.succeeded</option>
                        <option value="payment.failed">payment.failed</option>
                        <option value="invoice.refunded">invoice.refunded</option>
                        <option value="subscription.created">subscription.created</option>
                        <option value="subscription.canceled">subscription.canceled</option>
                    </select>

                    <button className="plans-btn plans-btn-outline" onClick={fetchEvents} id="refresh-events-btn">
                        ↺ Refresh
                    </button>
                </div>
            </div>

            {/* Alerts */}
            {error && (
                <div className="plans-alert plans-alert-error">
                    {error}<button onClick={() => setError("")}>×</button>
                </div>
            )}
            {success && (
                <div className="plans-alert plans-alert-success">
                    {success}<button onClick={() => setSuccess("")}>×</button>
                </div>
            )}

            {/* Stats strip */}
            <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px,1fr))",
                gap: "0.75rem", marginBottom: "1.25rem"
            }}>
                {[
                    { label: "Total Events", value: total },
                    { label: "Shown", value: entries.length },
                    { label: "Page", value: `${page} / ${totalPages || 1}` },
                ].map(s => (
                    <div key={s.label} style={{
                        background: "rgba(30,41,59,0.92)", border: "1px solid rgba(99,102,241,0.22)",
                        borderRadius: "10px", padding: "0.875rem 1rem",
                    }}>
                        <div style={{ fontSize: "0.65rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3rem", fontWeight: 600 }}>{s.label}</div>
                        <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#f1f5f9" }}>{loading ? "…" : s.value}</div>
                    </div>
                ))}
            </div>

            {/* Events table — Fix 4: EventReplayPanel; Fix 2: MANAGE_BILLING guard on replay */}
            <div style={{
                background: "rgba(22,32,52,0.92)", border: "1px solid rgba(71,85,105,0.6)",
                borderRadius: "12px", overflow: "hidden", backdropFilter: "blur(16px)"
            }}>
                {loading ? (
                    <div className="plans-loading" style={{ padding: "2rem" }}>Loading billing events…</div>
                ) : (
                    <RequireCapability permission="MANAGE_BILLING" fallback={
                        <div className="plans-alert plans-alert-info" style={{ margin: "1.5rem" }}>
                            You need the <strong>MANAGE_BILLING</strong> capability to replay events.
                        </div>
                    }>
                        <EventReplayPanel
                            events={entries}
                            onReplay={handleReplayConfirm}
                        />
                    </RequireCapability>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "1.25rem" }}>
                    <button
                        className="plans-btn plans-btn-sm plans-btn-outline"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page <= 1}
                    >← Prev</button>
                    <span style={{ padding: "0.35rem 0.75rem", color: "#64748b", fontSize: "0.8rem" }}>
                        {page} / {totalPages}
                    </span>
                    <button
                        className="plans-btn plans-btn-sm plans-btn-outline"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                    >Next →</button>
                </div>
            )}

        </div>
    );
}
