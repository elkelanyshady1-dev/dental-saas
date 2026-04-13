/**
 * platformApi.js
 * v2.1 — Isolated Platform API Client + Request Correlation
 *
 * PLATFORM PLANE ONLY — DO NOT IMPORT IN ORG CONTEXT
 *
 * Every request receives a unique X-Request-ID header generated client-side.
 * The backend echoes this ID in all responses (X-Request-ID header) and error
 * bodies (requestId field) so support teams can trace any failure end-to-end.
 *
 * v2.1: Stores requestId in window.__lastRequestId after every response so
 * ErrorBoundaries can correlate a React crash to the request that caused it.
 *
 * Dev:  Vite proxy forwards /api/* -> http://localhost:5000 (see vite.config.js)
 * Prod: Nginx/reverse-proxy forwards /api/* -> backend
 */
import axios from "axios";
import { showToast } from "../../utils/toast";

const platformApi = axios.create({
    baseURL: "/api/platform",
    withCredentials: true,
    headers: {
        "Content-Type": "application/json",
    },
});

// ── Request interceptor: inject X-Request-ID ──────────────────────────────────
// A fresh UUID is generated for every outgoing request.
// crypto.randomUUID() is available in all modern browsers (Chrome 92+, FF 95+, Safari 15.4+).
platformApi.interceptors.request.use((config) => {
    const requestId = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;  // fallback

    config.headers["X-Request-ID"] = requestId;

    // Stash on config so response interceptors can read the sent ID
    // without reparsing echoed headers from the server.
    config._requestId = requestId;

    return config;
});

// ── Response interceptors: capture requestId for error boundaries + DevTools ──
// On every response (success + error) store the requestId in window.__lastRequestId.
// The ErrorBoundary reads this when a React crash occurs so the crash can be
// correlated to the triggering backend request without the user copying headers.
platformApi.interceptors.response.use(
    (res) => {
        // Success path: prefer server-echoed header, fall back to sent ID
        const requestId = res.headers?.["x-request-id"]
            || res.config?._requestId
            || null;

        if (requestId && typeof window !== "undefined") {
            window.__lastRequestId = requestId;
        }

        return res;
    },
    (error) => {
        const requestId = error.response?.data?.requestId
            || error.response?.headers?.["x-request-id"]
            || error.config?._requestId
            || null;

        // Store so ErrorBoundary has it available even when the request itself crashed
        if (requestId && typeof window !== "undefined") {
            window.__lastRequestId = requestId;
        }

        // Always log structured failure details — catches url:undefined bugs early
        console.error("[platformApi] Request failed", {
            requestId: requestId || "(none)",
            status: error.response?.status,
            url: error.config?.url ?? "(undefined — check endpoint param)",
            method: error.config?.method?.toUpperCase(),
            message: error.response?.data?.message || error.message,
        });

        return Promise.reject(error);
    }
);

export default platformApi;

// ── Global Toast Notification Interceptor ─────────────────────────────────────
// NOTE: Auth refresh (401 handling, isRefreshing queue, _isRefreshRequest flag)
// is owned entirely by PlatformAuthContext.jsx, which registers interceptors on
// the platformApi instance at mount time and ejects them on unmount.
// DO NOT add auth logic here — it will create duplicate/conflicting interceptors.
platformApi.interceptors.response.use(
    (res) => {
        if (res.config?.showSuccess) {
            showToast.success(res.config.successMsg || "Operation successful");
        }
        return res;
    },
    (error) => {
        const originalRequest = error.config;
        const isSilent = originalRequest?.silent;

        if (!isSilent) {
            if (!error.response) {
                showToast.error("Network error — please check your connection.");
            } else {
                const status  = error.response.status;
                const data    = error.response.data;
                const code    = data?.error?.code || data?.code;
                const message = data?.error?.message || data?.message || error.message || "Unexpected error occurred";

                // Business error codes
                const codeMessages = {
                    PLAN_IN_USE:           "This plan is used by active subscriptions.",
                    DUPLICATE_ENTRY:       "This record already exists.",
                    INSUFFICIENT_QUOTA:    "You have reached your plan limit.",
                    SUBSCRIPTION_REQUIRED: "An active subscription is required.",
                    ORG_ARCHIVED:          "This organization has been archived.",
                };

                if (code && codeMessages[code]) {
                    showToast.error(codeMessages[code]);
                } else {
                    switch (status) {
                        case 400: showToast.error(message || "Invalid request"); break;
                        case 401: /* Handled by PlatformAuthContext interceptor */ break;
                        case 403: showToast.error("You don't have permission for this action."); break;
                        case 404: showToast.error("Resource not found."); break;
                        case 409: showToast.error(message || "Conflict — resource was already modified."); break;
                        case 422: showToast.error(message || "Validation failed."); break;
                        case 429: showToast.warning("Too many requests. Please slow down."); break;
                        case 500: case 502: case 503: showToast.error("Server error — please try again later."); break;
                        default: showToast.error(message);
                    }
                }
            }
        }
        return Promise.reject(error);
    }
);


/**
 * safeRequest — defensive wrapper around platformApi with endpoint validation.
 *
 * Usage:
 *   import { safeRequest } from '../auth/platformApi';
 *   const res = await safeRequest('GET', '/billing/ledger');
 *
 * Why: platformApiClient.request({ url }) silently drops the URL because the
 * generated HttpClient destructures 'path', not 'url'. This helper ensures
 * the endpoint is always present before the request fires.
 */
export function safeRequest(method, endpoint, config = {}) {
    if (!endpoint || typeof endpoint !== "string") {
        const msg = `[platformApi] Missing or invalid endpoint (got: ${JSON.stringify(endpoint)})`;
        console.error(msg, { method, endpoint });
        return Promise.reject(new Error(msg));
    }
    return platformApi.request({ method, url: endpoint, ...config });
}

