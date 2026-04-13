/**
 * toast.js — Centralized Toast Notification Dispatcher
 *
 * SINGLE SOURCE OF TRUTH for all user-facing notifications.
 * All planes (org, platform, portal) MUST use this module.
 *
 * API:
 *   import { showToast } from "@/utils/toast";
 *   showToast.success("Saved!");
 *   showToast.error("Failed to load");
 *   showToast.info("Processing...");
 *   showToast.warning("Are you sure?");
 *   showToast.promise(asyncFn, { loading, success, error });
 *
 * DO NOT import react-hot-toast directly in components.
 * DO NOT create inline Toast components with useState.
 */
import React from "react";
import toast from "react-hot-toast";

// ── Icon Components (React.createElement — safe for .js extension) ────────────
const SuccessIcon = () => React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 20 20", fill: "none" },
    React.createElement("circle", { cx: "10", cy: "10", r: "10", fill: "#10b981", opacity: "0.15" }),
    React.createElement("path", { d: "M6 10.5l2.5 2.5 5-5", stroke: "#10b981", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" })
);

const ErrorIcon = () => React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 20 20", fill: "none" },
    React.createElement("circle", { cx: "10", cy: "10", r: "10", fill: "#ef4444", opacity: "0.15" }),
    React.createElement("path", { d: "M7 7l6 6M13 7l-6 6", stroke: "#ef4444", strokeWidth: "2", strokeLinecap: "round" })
);

const InfoIcon = () => React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 20 20", fill: "none" },
    React.createElement("circle", { cx: "10", cy: "10", r: "10", fill: "#3b82f6", opacity: "0.15" }),
    React.createElement("path", { d: "M10 9v4M10 7h.01", stroke: "#3b82f6", strokeWidth: "2", strokeLinecap: "round" })
);

const WarningIcon = () => React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 20 20", fill: "none" },
    React.createElement("circle", { cx: "10", cy: "10", r: "10", fill: "#f59e0b", opacity: "0.15" }),
    React.createElement("path", { d: "M10 7v4M10 13h.01", stroke: "#f59e0b", strokeWidth: "2", strokeLinecap: "round" })
);


// ── Core Dispatcher ──────────────────────────────────────────────────────────

export const showToast = {
    /**
     * Success toast — green accent
     * @param {string} message
     * @param {object} [options]
     */
    success(message, options = {}) {
        return toast.success(message, {
            icon: React.createElement(SuccessIcon),
            ...options,
        });
    },

    /**
     * Error toast — red accent
     * @param {string} message
     * @param {object} [options]
     */
    error(message, options = {}) {
        return toast.error(message, {
            icon: React.createElement(ErrorIcon),
            duration: 5000,
            ...options,
        });
    },

    /**
     * Info toast — blue accent
     * @param {string} message
     * @param {object} [options]
     */
    info(message, options = {}) {
        return toast(message, {
            icon: React.createElement(InfoIcon),
            ...options,
        });
    },

    /**
     * Warning toast — amber accent
     * @param {string} message
     * @param {object} [options]
     */
    warning(message, options = {}) {
        return toast(message, {
            icon: React.createElement(WarningIcon),
            duration: 5000,
            ...options,
        });
    },

    /**
     * Promise toast — loading → success/error automatically
     * @param {Promise} promise
     * @param {{ loading: string, success: string, error: string|Function }} messages
     * @param {object} [options]
     */
    promise(promise, messages, options = {}) {
        return toast.promise(promise, messages, options);
    },

    /**
     * Loading toast — returns dismiss ID
     * @param {string} message
     * @returns {string} toastId — use showToast.dismiss(id) to close
     */
    loading(message) {
        return toast.loading(message);
    },

    /**
     * Dismiss a specific toast or all toasts
     * @param {string} [toastId] — if omitted, dismiss all
     */
    dismiss(toastId) {
        if (toastId) {
            toast.dismiss(toastId);
        } else {
            toast.dismiss();
        }
    },
};

export default showToast;
