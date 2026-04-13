/**
 * ConfirmDialog.jsx
 * Platform UI Primitive — Replaces window.confirm() across the platform.
 *
 * FULLY SELF-CONTAINED: uses only inline styles.
 * No dependency on plans.css, Tailwind, or any external CSS.
 * Portal-rendered to document.body — works in any context.
 *
 * Props:
 *   open          boolean                                     — controls visibility
 *   title         string                                      — modal heading
 *   description   string | ReactNode                         — body copy / warning message
 *   confirmLabel  string                 (default "Confirm") — destructive action label
 *   cancelLabel   string                 (default "Cancel")  — safe exit label
 *   intent        "warning" | "danger" | "primary"           — button + icon color
 *   loading       boolean               (default false)       — disables both buttons, shows spinner text
 *   onConfirm     () => void
 *   onCancel      () => void
 *
 * Accessibility:
 *   - role="dialog" + aria-modal + aria-labelledby
 *   - Escape key calls onCancel
 *   - Cancel button receives focus on open (safe default — requires explicit opt-in to confirm)
 *   - Backdrop click calls onCancel (unless loading)
 *
 * Usage:
 *   import { ConfirmDialog } from '@/platform/core/ui';
 *
 *   <ConfirmDialog
 *     open={showDeprecate}
 *     title="Deprecate Plan Version"
 *     description="New organizations will not be able to subscribe. Existing contracts are unaffected."
 *     confirmLabel="Deprecate"
 *     intent="warning"
 *     loading={actioning}
 *     onConfirm={handleConfirmDeprecate}
 *     onCancel={() => setShowDeprecate(false)}
 *   />
 */

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// ─── Intent → visual tokens ── (all inline, no CSS classes) ──────────────────
const INTENT = {
    warning: {
        iconEmoji: "⚠️",
        iconBg: "rgba(245,158,11,0.12)",
        iconColor: "#f59e0b",
        iconBorder: "rgba(245,158,11,0.25)",
        stripBg: "rgba(245,158,11,0.08)",
        stripBorder: "rgba(245,158,11,0.2)",
        stripColor: "#f59e0b",
        stripText: (
            <>
                <strong>Warning:</strong> This action affects plan availability for new subscriptions.
                Existing organization contracts will <strong>not</strong> be affected.
            </>
        ),
        confirmBg: "rgba(245,158,11,0.15)",
        confirmBgHover: "rgba(245,158,11,0.25)",
        confirmColor: "#f59e0b",
        confirmBorder: "rgba(245,158,11,0.35)",
    },
    danger: {
        iconEmoji: "🗑️",
        iconBg: "rgba(239,68,68,0.12)",
        iconColor: "#ef4444",
        iconBorder: "rgba(239,68,68,0.25)",
        stripBg: "rgba(239,68,68,0.08)",
        stripBorder: "rgba(239,68,68,0.2)",
        stripColor: "#ef4444",
        stripText: (
            <>
                <strong>Destructive action:</strong> This cannot be undone. Proceed with caution.
            </>
        ),
        confirmBg: "rgba(239,68,68,0.15)",
        confirmBgHover: "rgba(239,68,68,0.25)",
        confirmColor: "#ef4444",
        confirmBorder: "rgba(239,68,68,0.35)",
    },
    primary: {
        iconEmoji: "ℹ️",
        iconBg: "rgba(99,102,241,0.12)",
        iconColor: "#818cf8",
        iconBorder: "rgba(99,102,241,0.25)",
        stripBg: null,
        stripBorder: null,
        stripColor: null,
        stripText: null,
        confirmBg: "linear-gradient(135deg, #6366f1, #818cf8)",
        confirmBgHover: "linear-gradient(135deg, #4f46e5, #6366f1)",
        confirmColor: "#fff",
        confirmBorder: "transparent",
    },
};

export default function ConfirmDialog({
    open,
    title = "Confirm Action",
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    intent = "primary",
    loading = false,
    onConfirm,
    onCancel,
}) {
    const cancelRef = useRef(null);
    const cfg = INTENT[intent] || INTENT.primary;

    // Keyboard: Escape → cancel
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === "Escape" && !loading) onCancel(); };
        document.addEventListener("keydown", onKey);
        cancelRef.current?.focus();
        return () => document.removeEventListener("keydown", onKey);
    }, [open, loading, onCancel]);

    if (!open) return null;

    const s = {
        overlay: {
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1200,
        },
        backdrop: {
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
            cursor: loading ? "default" : "pointer",
        },
        panel: {
            position: "relative",
            zIndex: 1,
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: "16px",
            padding: "1.75rem",
            maxWidth: 440,
            width: "calc(100% - 2rem)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            animation: "confirmDialogIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
        },
        header: {
            display: "flex",
            alignItems: "flex-start",
            gap: "0.875rem",
            marginBottom: "1rem",
        },
        iconWrap: {
            flexShrink: 0,
            width: 40,
            height: 40,
            borderRadius: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.15rem",
            background: cfg.iconBg,
            border: `1px solid ${cfg.iconBorder}`,
        },
        headerText: { flex: 1, minWidth: 0 },
        title: { margin: "0 0 0.3rem", fontSize: "1rem", fontWeight: 700, color: "#f1f5f9", fontFamily: "'Inter', 'Segoe UI', sans-serif" },
        desc: { margin: 0, fontSize: "0.855rem", color: "#94a3b8", lineHeight: 1.55, fontFamily: "'Inter', 'Segoe UI', sans-serif" },
        closeBtn: {
            flexShrink: 0,
            background: "none",
            border: "none",
            color: "#475569",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: "1.2rem",
            lineHeight: 1,
            padding: "0.1rem 0.3rem",
            borderRadius: "4px",
        },
        strip: {
            padding: "0.6rem 0.875rem",
            marginBottom: "1.1rem",
            borderRadius: "8px",
            background: cfg.stripBg,
            border: `1px solid ${cfg.stripBorder}`,
            fontSize: "0.79rem",
            color: cfg.stripColor,
            lineHeight: 1.5,
            fontFamily: "'Inter', 'Segoe UI', sans-serif",
        },
        actions: {
            display: "flex",
            gap: "0.75rem",
            justifyContent: "flex-end",
            marginTop: "1.25rem",
        },
        cancelBtn: {
            padding: "0.575rem 1.2rem",
            borderRadius: "8px",
            border: "1px solid #334155",
            background: "transparent",
            color: "#94a3b8",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.5 : 1,
            transition: "border-color 0.15s, color 0.15s",
            fontFamily: "'Inter', 'Segoe UI', sans-serif",
        },
        confirmBtn: {
            padding: "0.575rem 1.2rem",
            borderRadius: "8px",
            border: `1px solid ${cfg.confirmBorder}`,
            background: cfg.confirmBg,
            color: cfg.confirmColor,
            fontSize: "0.875rem",
            fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
            transition: "opacity 0.15s",
            fontFamily: "'Inter', 'Segoe UI', sans-serif",
        },
    };

    return createPortal(
        <>
            {/* Scoped keyframe — injected once via <style> */}
            <style>{`
                @keyframes confirmDialogIn {
                    from { opacity: 0; transform: scale(0.94) translateY(-10px); }
                    to   { opacity: 1; transform: scale(1)    translateY(0);     }
                }
            `}</style>

            <div role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" style={s.overlay}>

                {/* Backdrop */}
                <div aria-hidden="true" onClick={loading ? undefined : onCancel} style={s.backdrop} />

                {/* Panel */}
                <div style={s.panel}>

                    {/* ── Header ── */}
                    <div style={s.header}>
                        <div style={s.iconWrap}>{cfg.iconEmoji}</div>

                        <div style={s.headerText}>
                            <h3 id="confirm-dialog-title" style={s.title}>{title}</h3>
                            {description && <p style={s.desc}>{description}</p>}
                        </div>

                        <button
                            onClick={loading ? undefined : onCancel}
                            disabled={loading}
                            aria-label="Close"
                            style={s.closeBtn}
                        >
                            ×
                        </button>
                    </div>

                    {/* ── Intent strip (warning / danger context) ── */}
                    {intent !== "primary" && cfg.stripText && (
                        <div style={s.strip}>{cfg.stripText}</div>
                    )}

                    {/* ── Actions ── */}
                    <div style={s.actions}>
                        <button
                            id="confirm-dialog-cancel"
                            ref={cancelRef}
                            onClick={onCancel}
                            disabled={loading}
                            style={s.cancelBtn}
                        >
                            {cancelLabel}
                        </button>
                        <button
                            id="confirm-dialog-confirm"
                            onClick={onConfirm}
                            disabled={loading}
                            style={s.confirmBtn}
                        >
                            {loading ? "Working…" : confirmLabel}
                        </button>
                    </div>

                </div>
            </div>
        </>,
        document.body
    );
}
