/**
 * ConfirmModal.jsx
 * Sprint 7.2 — Enterprise Confirmation Modal
 *
 * Replaces all window.confirm() calls across billing/finance UI.
 * Supports an optional financial breakdown panel for destructive actions.
 *
 * Props:
 *   isOpen      boolean
 *   onConfirm   () => void
 *   onCancel    () => void
 *   title       string
 *   message     string
 *   confirmLabel string   (default "Confirm")
 *   cancelLabel  string   (default "Cancel")
 *   intent       "danger" | "warning" | "primary"
 *   loading      boolean
 *   breakdown    { label, value }[]  — optional financial detail rows
 *   fraudFlag    boolean             — shows red fraud alert header
 */

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ShieldAlert, Loader2, X } from "lucide-react";

const INTENT_MAP = {
    danger: { confirm: "bg-red-600 hover:bg-red-700 text-white", icon: "text-red-500", bg: "bg-red-50 border-red-200" },
    warning: { confirm: "bg-amber-500 hover:bg-amber-600 text-white", icon: "text-amber-500", bg: "bg-amber-50 border-amber-200" },
    primary: { confirm: "bg-slate-900 hover:bg-slate-700 text-white", icon: "text-blue-500", bg: "bg-blue-50 border-blue-200" },
};

export default function ConfirmModal({
    isOpen,
    onConfirm,
    onCancel,
    title = "Confirm Action",
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    intent = "primary",
    loading = false,
    breakdown = [],
    fraudFlag = false,
}) {
    const cancelRef = useRef(null);
    const cfg = INTENT_MAP[intent] || INTENT_MAP.primary;

    // Trap focus + close on Escape
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e) => { if (e.key === "Escape") onCancel(); };
        document.addEventListener("keydown", handleKey);
        cancelRef.current?.focus();
        return () => document.removeEventListener("keydown", handleKey);
    }, [isOpen, onCancel]);

    if (!isOpen) return null;

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
                onClick={onCancel}
                aria-hidden="true"
            />

            {/* Panel */}
            <div className="relative w-full max-w-md mx-4 bg-bg-card rounded-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                {/* Fraud alert banner */}
                {fraudFlag && (
                    <div className="flex items-center gap-3 bg-red-600 px-6 py-3">
                        <ShieldAlert className="w-4 h-4 text-white flex-shrink-0" />
                        <p className="text-xs font-black text-white uppercase tracking-widest">
                            Velocity guard flagged — high-risk refund
                        </p>
                    </div>
                )}

                {/* Header */}
                <div className={`flex items-start gap-4 px-6 pt-6 pb-4 ${fraudFlag ? "" : ""}`}>
                    <div className={`p-2.5 rounded-2xl border ${cfg.bg} flex-shrink-0`}>
                        <AlertTriangle className={`w-5 h-5 ${cfg.icon}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 id="confirm-modal-title" className="text-base font-black text-slate-900 tracking-tight mb-1">
                            {title}
                        </h2>
                        {message && (
                            <p className="text-sm text-slate-500 font-medium leading-relaxed">{message}</p>
                        )}
                    </div>
                    <button
                        onClick={onCancel}
                        className="p-1.5 rounded-xl text-slate-300 hover:text-slate-500 hover:bg-slate-50 transition-colors flex-shrink-0"
                        aria-label="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Financial breakdown */}
                {breakdown.length > 0 && (
                    <div className="mx-6 mb-4 bg-slate-50 border border-slate-100 rounded-2xl overflow-hidden">
                        <div className="px-4 py-2 bg-slate-100/60 border-b border-slate-100">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                Financial Summary
                            </p>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {breakdown.map(({ label, value, highlight }) => (
                                <div key={label} className="flex justify-between items-center px-4 py-3">
                                    <span className="text-xs font-bold text-slate-500">{label}</span>
                                    <span className={`text-sm font-black ${highlight ? "text-slate-900" : "text-slate-700"}`}>
                                        {value}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 px-6 pb-6">
                    <button
                        id="confirm-modal-cancel"
                        ref={cancelRef}
                        onClick={onCancel}
                        disabled={loading}
                        className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-700 text-sm font-black uppercase tracking-wider hover:bg-slate-50 disabled:opacity-50 transition-colors"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        id="confirm-modal-confirm"
                        onClick={onConfirm}
                        disabled={loading}
                        className={`flex-1 py-3 rounded-2xl text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 transition-colors ${cfg.confirm}`}
                    >
                        {loading
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                            : confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
