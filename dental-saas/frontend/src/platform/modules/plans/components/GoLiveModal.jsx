/**
 * GoLiveModal.jsx
 * v2.0 — Publish Confirmation with before→after change diffs
 *
 * Matches the "Go Live" mockup:
 *   - Blue progress bar at top
 *   - Centered rocket icon
 *   - "Go Live" title
 *   - Plan Changes section with old→new value diffs
 *   - Organizations affected (big number + chart icon)
 *   - Safety note about renewal cycles
 *   - Cancel + Go Live buttons
 *
 * Props:
 *   versionId      – PlanVersion ObjectId
 *   versionTag     – e.g. "v2.4"
 *   templateCode   – e.g. "professional"
 *   diffSummary    – [{ section, fields: [field], oldValues: {}, newValues: {} }]
 *   onConfirm      – async () → called on Go Live click
 *   onClose        – () → close modal
 */
import React, { useState, useEffect } from "react";
import platformApi from "../../../auth/platformApi";

export default function GoLiveModal({
    versionId,
    versionTag,
    templateCode,
    diffSummary = [],
    onConfirm,
    onClose,
}) {
    const [loading, setLoading] = useState(true);
    const [impact, setImpact] = useState(null);
    const [confirmed, setConfirmed] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [error, setError] = useState("");

    // Fetch revenue impact data
    useEffect(() => {
        if (!versionId) return;
        let cancelled = false;
        setLoading(true);
        setError("");
        platformApi.get(`/plan-versions/${versionId}/revenue-impact`)
            .then(({ data }) => {
                if (!data.success) throw new Error(data.message || "Failed to load impact");
                if (!cancelled) setImpact(data.data);
            })
            .catch(err => {
                if (!cancelled) {
                    // Graceful fallback — modal still usable without impact data
                    setImpact({ organizations: 0, currentRevenue: 0 });
                }
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [versionId]);

    const handleConfirm = async () => {
        setPublishing(true);
        setError("");
        try {
            await onConfirm();
        } catch (err) {
            setError(err.response?.data?.message || err.message);
            setPublishing(false);
        }
    };

    const orgsAffected = impact?.organizations ?? impact?.organizationsAffected ?? 0;

    // Build change rows from diffSummary
    const changeRows = [];
    if (diffSummary?.length > 0) {
        for (const diff of diffSummary) {
            for (const field of (diff.fields || [])) {
                const oldVal = diff.oldValues?.[field];
                const newVal = diff.newValues?.[field];
                changeRows.push({
                    label: field,
                    oldValue: oldVal != null ? String(oldVal) : undefined,
                    newValue: newVal != null ? String(newVal) : undefined,
                });
            }
        }
    }

    // Progress bar: 0% → 50% (loading) → 100% (ready)
    const progress = loading ? 50 : 100;

    return (
        <div className="golive-overlay" onClick={publishing ? undefined : onClose}>
            <div className="golive-modal" onClick={e => e.stopPropagation()}>
                {/* Blue progress bar */}
                <div className="golive-progress">
                    <div className="golive-progress-fill" style={{ width: `${progress}%` }} />
                </div>

                <div className="golive-body">
                    {/* Header — Centered icon + title */}
                    <div className="golive-header">
                        <div className="golive-icon-wrap">
                            <span className="golive-icon">🚀</span>
                        </div>
                        <h2 className="golive-title">Go Live</h2>
                        <p className="golive-subtitle">
                            Confirm and publish these changes to the production environment.
                        </p>
                    </div>

                    {loading && (
                        <div className="golive-loading">Analyzing impact…</div>
                    )}

                    {!loading && (
                        <>
                            {/* Plan Changes — before→after diffs */}
                            {changeRows.length > 0 && (
                                <div className="golive-section">
                                    <div className="golive-section-header">
                                        <span className="golive-section-icon">⇄</span>
                                        <span className="golive-section-title">Plan Changes</span>
                                    </div>
                                    <div className="golive-changes">
                                        {changeRows.map((row, i) => (
                                            <div key={i} className="golive-change-row">
                                                <span className="golive-change-label">{row.label}</span>
                                                <div className="golive-change-values" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                                    {row.oldValue && (
                                                        <span style={{
                                                            fontSize: "0.75rem",
                                                            color: "var(--plan-outline, #737686)",
                                                            textDecoration: "line-through",
                                                        }}>
                                                            {row.oldValue}
                                                        </span>
                                                    )}
                                                    {row.oldValue && row.newValue && (
                                                        <span style={{ color: "var(--plan-outline, #737686)", fontSize: "0.75rem" }}>→</span>
                                                    )}
                                                    {row.newValue && (
                                                        <span style={{
                                                            fontSize: "0.85rem",
                                                            fontWeight: 700,
                                                            color: "var(--plan-on-surface, #191c1e)",
                                                        }}>
                                                            {row.newValue}
                                                        </span>
                                                    )}
                                                    {!row.oldValue && !row.newValue && (
                                                        <span className="golive-change-badge">Modified</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Organizations affected — big number card */}
                            <div className="golive-impact">
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div className="golive-impact-content">
                                        <span className="golive-impact-number">{orgsAffected.toLocaleString()}</span>
                                        <span className="golive-impact-label">Organizations affected</span>
                                    </div>
                                    <div style={{
                                        width: "3rem", height: "3rem",
                                        background: "rgba(0,74,198,0.08)",
                                        borderRadius: "var(--plan-radius-md, 0.75rem)",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        fontSize: "1.5rem",
                                    }}>
                                        📊
                                    </div>
                                </div>
                            </div>

                            {/* Safety note */}
                            <div className="golive-info">
                                <span className="golive-info-icon" style={{ color: "var(--plan-primary, #004ac6)" }}>ℹ</span>
                                <p className="golive-info-text">
                                    <strong>Note:</strong> Existing subscriptions will maintain their current pricing structure
                                    until their next renewal cycle. New sign-ups will see the updated configuration immediately.
                                </p>
                            </div>

                            {/* Confirmation checkbox */}
                            <label className="golive-confirm-label">
                                <input
                                    className="golive-confirm-checkbox"
                                    type="checkbox"
                                    checked={confirmed}
                                    onChange={e => setConfirmed(e.target.checked)}
                                    disabled={publishing}
                                />
                                I understand the impact and confirm I want to publish.
                            </label>

                            {/* Error */}
                            {error && (
                                <div className="golive-alert golive-alert--error">{error}</div>
                            )}

                            {/* Actions */}
                            <div className="golive-actions">
                                <button
                                    className="golive-btn golive-btn--cancel"
                                    onClick={onClose}
                                    disabled={publishing}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="golive-btn golive-btn--confirm"
                                    onClick={handleConfirm}
                                    disabled={!confirmed || publishing}
                                >
                                    {publishing ? "Publishing…" : "Go Live"}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
