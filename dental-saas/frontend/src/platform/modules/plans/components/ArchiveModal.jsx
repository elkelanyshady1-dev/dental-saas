/**
 * ArchiveModal.jsx
 * v2.0 — Archive Plan confirmation with impact preview
 *
 * Matches the "Archive Plan" mockup:
 *   - Red shield icon + title
 *   - Description: "You are about to archive the **{name}** tier."
 *   - 2-column impact grid: Active Impact + Policy Status
 *   - Safety note: "Subs continue unchanged..."
 *   - Cancel + Archive Anyway buttons
 *   - Footer with ACTION ID
 *
 * Props:
 *   versionTag     – e.g. "v2.0"
 *   templateName   – e.g. "Legacy Basic"
 *   usageCount     – number of affected orgs (0 = safe)
 *   onConfirm      – async ({ force? }) → deprecates the version
 *   onClose        – () → close modal
 */
import React, { useState } from "react";

export default function ArchiveModal({
    versionTag,
    templateName,
    usageCount = 0,
    onConfirm,
    onClose,
}) {
    const [archiving, setArchiving] = useState(false);
    const [error, setError] = useState("");
    const [forceRequired, setForceRequired] = useState(false);

    // Generate a pseudo action ID for audit trail
    const actionId = `ARC-PLN-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    const handleArchive = async (force = false) => {
        setArchiving(true);
        setError("");
        try {
            await onConfirm({ force });
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            if (err.response?.status === 409) {
                setForceRequired(true);
                setError(msg || "Active subscriptions prevent archival.");
            } else {
                setError(msg);
            }
        } finally {
            setArchiving(false);
        }
    };

    return (
        <div className="archive-overlay" onClick={archiving ? undefined : onClose}>
            <div className="archive-modal" onClick={e => e.stopPropagation()}>
                {/* Red stripe at top */}
                <div className="archive-stripe" />

                <div className="archive-body">
                    {/* Header — Shield icon + text */}
                    <div className="archive-header">
                        <div className="archive-icon-wrap">
                            <span className="archive-icon">🛡</span>
                        </div>
                        <div className="archive-header-text">
                            <h2 className="archive-title">Archive Plan</h2>
                            <p className="archive-subtitle">
                                You are about to archive the <strong>{templateName || "this"}</strong> tier
                                {versionTag && <> (<code style={{
                                    fontSize: "0.8rem",
                                    background: "var(--plan-surface-container, #eceef0)",
                                    padding: "0.1rem 0.4rem",
                                    borderRadius: "4px",
                                    color: "var(--plan-primary, #004ac6)",
                                }}>{versionTag}</code>)</>}.
                                This action will remove the plan from new sign-ups.
                            </p>
                        </div>
                    </div>

                    {/* Impact grid */}
                    <div className="archive-impact">
                        <div className="archive-impact-grid">
                            <div className="archive-impact-item">
                                <span className="archive-impact-label">Active Impact</span>
                                <div className="archive-impact-value">
                                    <span className="archive-impact-number">{usageCount.toLocaleString()}</span>
                                    <span className="archive-impact-unit">orgs</span>
                                </div>
                            </div>
                            <div className="archive-impact-item">
                                <span className="archive-impact-label">Policy Status</span>
                                <div className="archive-impact-status">
                                    <span className="archive-status-icon">✓</span>
                                    <span className="archive-status-text">Unchanged</span>
                                </div>
                            </div>
                        </div>

                        {/* Safety note */}
                        <div className="archive-safety-note">
                            <span className="archive-note-icon" style={{ color: "var(--plan-primary, #004ac6)" }}>ℹ</span>
                            <p className="archive-note-text">
                                Subs continue unchanged. Existing customers will remain on this plan
                                until they manually upgrade or cancel.
                            </p>
                        </div>
                    </div>

                    {/* Error alert */}
                    {error && (
                        <div className={`archive-alert ${forceRequired ? "archive-alert--warning" : "archive-alert--error"}`}>
                            <span>{forceRequired ? "⚠" : "✕"}</span>
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="archive-actions">
                        <button
                            className="archive-btn archive-btn--cancel"
                            onClick={onClose}
                            disabled={archiving}
                        >
                            Cancel
                        </button>
                        {!forceRequired ? (
                            <button
                                className="archive-btn archive-btn--confirm"
                                onClick={() => handleArchive(false)}
                                disabled={archiving}
                            >
                                {archiving ? "Archiving…" : "Archive Anyway"}
                            </button>
                        ) : (
                            <button
                                className="archive-btn archive-btn--force"
                                onClick={() => handleArchive(true)}
                                disabled={archiving}
                            >
                                {archiving ? "Force Archiving…" : "Force Archive"}
                            </button>
                        )}
                    </div>
                </div>

                {/* Footer — action ID */}
                <div className="archive-footer">
                    <span className="archive-footer-id">ACTION ID: {actionId}</span>
                    <div style={{ display: "flex", gap: "0.375rem" }}>
                        <span style={{
                            width: "0.375rem", height: "0.375rem",
                            borderRadius: "50%",
                            background: archiving ? "var(--plan-warning, #f59e0b)" : "var(--plan-success, #16a34a)",
                        }} />
                        <span style={{
                            width: "0.375rem", height: "0.375rem",
                            borderRadius: "50%",
                            background: error ? "var(--plan-error, #ba1a1a)" : "var(--plan-success, #16a34a)",
                        }} />
                    </div>
                </div>
            </div>
        </div>
    );
}
