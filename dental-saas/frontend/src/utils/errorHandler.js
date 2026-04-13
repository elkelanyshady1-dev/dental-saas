/**
 * errorHandler.js — Centralized Error Normalizer (Org Plane)
 *
 * Provides a single function to extract user-friendly error messages
 * from any error shape (Axios, Zod, native JS, custom backend errors).
 *
 * Usage:
 *   import { normalizeError, handleMutationError } from "@/utils/errorHandler";
 *
 *   // In a catch block:
 *   const error = normalizeError(err);
 *   toast.error(error.message);
 *
 *   // In a React Query mutation:
 *   useMutation({
 *     ...
 *     onError: handleMutationError,
 *   });
 *
 * Org-plane only. No organizationId is leaked.
 */

/**
 * Normalize any error into a consistent shape.
 *
 * @param {unknown} err — Anything thrown or rejected
 * @returns {{ message: string, code: string|null, status: number|null, fields: Record<string, string>|null }}
 */
export function normalizeError(err) {
    // ── 1. Axios response error (most common) ─────────────────────────────
    if (err?.response?.data) {
        const data = err.response.data;
        const message =
            data.error?.message ||
            data.message ||
            data.error ||
            `Request failed (${err.response.status})`;

        // Zod validation errors from backend return { errors: [...] }
        const fields = data.errors?.reduce?.((acc, e) => {
            const field = e.path?.join?.(".") || e.field || "unknown";
            acc[field] = e.message;
            return acc;
        }, {}) || null;

        return {
            message: typeof message === "string" ? message : "An error occurred",
            code: data.error?.code || data.code || null,
            status: err.response.status,
            fields,
        };
    }

    // ── 2. Axios network error (no response) ───────────────────────────────
    if (err?.request && !err.response) {
        return {
            message: "Network error — please check your connection and try again.",
            code: "NETWORK_ERROR",
            status: null,
            fields: null,
        };
    }

    // ── 3. Native Error object ─────────────────────────────────────────────
    if (err instanceof Error) {
        return {
            message: err.message || "An unexpected error occurred",
            code: null,
            status: null,
            fields: null,
        };
    }

    // ── 4. String error ────────────────────────────────────────────────────
    if (typeof err === "string") {
        return {
            message: err,
            code: null,
            status: null,
            fields: null,
        };
    }

    // ── 5. Unknown shape ───────────────────────────────────────────────────
    return {
        message: "An unexpected error occurred. Please try again.",
        code: "UNKNOWN",
        status: null,
        fields: null,
    };
}

/**
 * Convenience handler for React Query mutation onError callbacks.
 * Uses the centralized showToast dispatcher.
 *
 * @param {unknown} err
 */
export function handleMutationError(err) {
    const { message } = normalizeError(err);
    // Lazy import to avoid circular deps during module init
    import("./toast").then(({ showToast }) => {
        showToast.error(message);
    });
}

/**
 * parseError — Simplified alias for normalizeError.
 * Returns { status, message, code } for use in interceptors.
 *
 * @param {unknown} error
 * @returns {{ status: number|null, message: string, code: string|null }}
 */
export function parseError(error) {
    const normalized = normalizeError(error);
    return {
        status: normalized.status,
        message: normalized.message,
        code: normalized.code,
    };
}

