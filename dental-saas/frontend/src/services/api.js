/**
 * CORE HTTP CLIENT (SINGLE SOURCE) — services/api.js
 *
 * All domain APIs MUST be co-located in:
 *   modules/org/<domain>/api/
 *
 * This file is ONLY responsible for:
 *   - axios instance
 *   - auth headers
 *   - token refresh
 *
 * Used across entire app (22+ consumers).
 * DO NOT move or split without full dependency audit.
 */
// ORG PLANE ONLY — DO NOT IMPORT IN PLATFORM CONTEXT
import axios from "axios";

// ── Token Storage ─────────────────────────────────────────────────────────────
// The token lives in a module-level variable for O(1) in-process access.
// On module load we seed from sessionStorage so page refreshes don't lose auth.
// sessionStorage is preferred over localStorage: auto-clears when tab closes,
// reducing the exposure window of a leaked token.

const TOKEN_KEY  = "org_access_token";
const CSRF_KEY   = "org_csrf_token";
const BRANCH_KEY = "org_active_branch";
const ORG_ID_KEY = "org_organization_id";  // Rule 21: Org-plane session context

let _accessToken    = sessionStorage.getItem(TOKEN_KEY)  || "";
let _csrfToken      = sessionStorage.getItem(CSRF_KEY)   || "";
let _activeBranchId = sessionStorage.getItem(BRANCH_KEY) || "";
let _organizationId = sessionStorage.getItem(ORG_ID_KEY) || "";

export const setAccessToken = (token) => {
    _accessToken = token || "";
    if (_accessToken) {
        sessionStorage.setItem(TOKEN_KEY, _accessToken);
    } else {
        sessionStorage.removeItem(TOKEN_KEY);
    }
};

export const setCsrfToken = (token) => {
    _csrfToken = token || "";
    if (_csrfToken) {
        sessionStorage.setItem(CSRF_KEY, _csrfToken);
    } else {
        sessionStorage.removeItem(CSRF_KEY);
    }
};

/**
 * setActiveBranchId — Set the active branch context for all subsequent requests.
 * Call this whenever the user selects/switches a branch.
 * Uses sessionStorage: auto-clears when tab closes (tab-scoped branch selection).
 *
 * The backend reads this as the `x-branch-id` header in branchContext.middleware.js.
 * Without this header, mutations return 400; the backend falls back to
 * req.user.primaryBranchId for GET requests.
 *
 * @param {string} branchId — MongoDB ObjectId string of the active branch
 */
export const setActiveBranchId = (branchId) => {
    _activeBranchId = branchId || "";
    if (_activeBranchId) {
        sessionStorage.setItem(BRANCH_KEY, _activeBranchId);
    } else {
        sessionStorage.removeItem(BRANCH_KEY);
    }
};

export const getActiveBranchId = () => _activeBranchId;

/**
 * setOrganizationId — Persist the authenticated org ID for client-side use.
 * Called once at login and restored on page refresh via profile endpoint.
 *
 * ⚠️  SECURITY NOTE: This value is NEVER injected into request bodies.
 * The backend reads organizationId exclusively from the verified JWT payload
 * via orgProtect.js → req.organizationId. This variable is for frontend-only
 * display, filtering, and analytics use (e.g. org-scoped socket rooms).
 *
 * Uses sessionStorage: auto-clears when tab closes (same as token).
 *
 * @param {string} orgId — MongoDB ObjectId string of the organization
 */
export const setOrganizationId = (orgId) => {
    _organizationId = orgId || "";
    if (_organizationId) {
        sessionStorage.setItem(ORG_ID_KEY, _organizationId);
    } else {
        sessionStorage.removeItem(ORG_ID_KEY);
    }
};

export const getOrganizationId = () => _organizationId;

export const getAccessToken = () => _accessToken;

/**
 * clearAuth — Wipe all auth state (token + CSRF + branch context + org context).
 * Called when the system determines there is definitively no valid session.
 */
export const clearAuth = () => {
    setAccessToken("");
    setCsrfToken("");
    setActiveBranchId(""); // Branch selection is tied to session
    setOrganizationId(""); // Org context is tied to session
};

const api = axios.create({
    baseURL: "/api/v1",
    headers: { "Content-Type": "application/json" },
    withCredentials: true, // Critical for sending refresh cookie
});

/**
 * publicApi — for non-versioned endpoints mounted at /api/public/*.
 * These routes are NOT on v1Router (no auth middleware, no org context).
 * Used by: Signup, Pricing, Home (public marketing pages).
 */
export const publicApi = axios.create({
    baseURL: "/api",
    headers: { "Content-Type": "application/json" },
});

/* ── Request: attach Bearer token & CSRF + Request Correlation ID ───────────── */
api.interceptors.request.use((config) => {
    // Primary: in-process module variable (fastest, most current)
    // Fallback: sessionStorage (handles page refresh race)
    const token = _accessToken
        || sessionStorage.getItem(TOKEN_KEY)
        || "";

    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        // Keep module variable in sync if we had to fall back to storage
        if (!_accessToken) {
            _accessToken = token;
        }
    } else if (import.meta.env.DEV) {
        // Diagnostic: surface token-less requests in dev console
        console.warn("[api][NO_TOKEN]", config.method?.toUpperCase(), config.url);
    }
    if (_csrfToken) {
        config.headers["x-csrf-token"] = _csrfToken;
    }
    // ── Branch Context Injection ──────────────────────────────────────────────
    // Backend branchContext.middleware.js reads x-branch-id to set req.branchId.
    // Required for all mutations (POST/PUT/PATCH/DELETE → 400 without it).
    // Falls back to req.user.primaryBranchId on GETs if header absent.
    const activeBranch = _activeBranchId || sessionStorage.getItem(BRANCH_KEY) || "";
    if (activeBranch) {
        config.headers["x-branch-id"] = activeBranch;
        // Keep module variable in sync if we had to fall back to storage
        if (!_activeBranchId) {
            _activeBranchId = activeBranch;
        }
    }
    const region = sessionStorage.getItem("regionCode"); // BUG-10: aligned with sessionStorage
    if (region) {
        config.headers["x-region-code"] = region;
    }
    // ── Request correlation — unique UUID per request ─────────────────────────
    const requestId = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    config.headers["X-Request-ID"] = requestId;

    return config;
});

/* ── Response: auto-refresh on 401 ─────────────────────── */
let isRefreshing = false;
let refreshSubscribers = [];

function subscribeTokenRefresh(cb) {
    refreshSubscribers.push(cb);
}

function onRefreshed(token, csrfToken) {
    refreshSubscribers.forEach(cb => cb(token, csrfToken, null));
    refreshSubscribers = [];
}

// BUG-8 FIX: Reject all queued subscribers on refresh failure.
// Previously, queued promises were never resolved or rejected when
// the refresh attempt failed, causing hung HTTP calls.
function onRefreshFailed(error) {
    refreshSubscribers.forEach(cb => cb(null, null, error));
    refreshSubscribers = [];
}

/**
 * Notify the AuthContext that the session is dead.
 * Does NOT redirect — lets AuthContext handle navigation via React Router.
 */
function emitSessionExpired() {
    window.dispatchEvent(new Event("auth-session-expired"));
}
api.interceptors.response.use(
    (res) => {
        // ── CSRF AUTO-SYNC ────────────────────────────────────────────────────
        // If the backend rotates the CSRF token in any response (e.g. after
        // privilege escalation, branch switch, or changePassword), pick it up
        // automatically so the next request uses the correct pair.
        // Checks both JSON body and x-csrf-token header to cover all patterns.
        // Guards with !== _csrfToken to avoid redundant sessionStorage writes
        // on every response.
        const rotatedCsrf =
            res?.data?.csrfToken ||
            res?.headers?.["x-csrf-token"] ||
            "";

        if (rotatedCsrf && rotatedCsrf !== _csrfToken) {
            setCsrfToken(rotatedCsrf);
            if (import.meta.env.DEV) {
                console.debug("[api] CSRF token auto-synced from response");
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        return res;
    },

    async (err) => {
        const originalRequest = err.config;

        if (!err.response) {
            return Promise.reject(err);
        }

        const status  = err.response.status;
        const errMsg  = err.response.data?.error?.message
            || err.response.data?.message
            || "";

        // ═══════════════════════════════════════════════════════════════════
        // GUARD 1: Never attempt refresh for the refresh endpoint itself.
        // This prevents infinite loops when the refresh cookie is missing
        // or the session has been revoked server-side.
        // ═══════════════════════════════════════════════════════════════════
        if (originalRequest.url?.includes("/auth/refresh")) {
            clearAuth();
            emitSessionExpired();
            return Promise.reject(err);
        }

        // ═══════════════════════════════════════════════════════════════════
        // GUARD 1.5: Never attempt refresh on PRE-AUTH credential endpoints.
        // A 401 from login/smart-login/select-org means WRONG CREDENTIALS,
        // not an expired session. Attempting a refresh here is wrong and
        // produces the misleading "Invalid refresh token" error on screen.
        // ═══════════════════════════════════════════════════════════════════
        const PRE_AUTH_ENDPOINTS = [
            "/auth/login",
            "/auth/smart-login",
            "/auth/select-org",
            "/platform/login",
        ];
        if (PRE_AUTH_ENDPOINTS.some(ep => originalRequest.url?.includes(ep))) {
            // Reject silently — the caller (LoginPage / AuthContext) surfaces
            // the correct "Invalid credentials" message from the response body.
            return Promise.reject(err);
        }

        // ═══════════════════════════════════════════════════════════════════
        // GUARD 2: \"No token provided\" = no auth header was sent.
        // This happens on first load with empty sessionStorage.
        // DO NOT redirect here — let AuthContext handle it via loading state.
        // Just clear and reject silently.
        // ═══════════════════════════════════════════════════════════════════
        if (status === 401 && errMsg === "No token provided") {
            clearAuth();
            // Do NOT redirect — AuthContext.initAuth catch block handles this.
            return Promise.reject(err);
        }

        // ═══════════════════════════════════════════════════════════════════
        // GUARD 3: "No refresh token" from the refresh endpoint.
        // The HttpOnly cookie doesn't exist — user has never logged in
        // or cookie expired. No point retrying.
        // ═══════════════════════════════════════════════════════════════════
        if (status === 401 && errMsg === "No refresh token") {
            clearAuth();
            emitSessionExpired();
            return Promise.reject(err);
        }


        // ═══════════════════════════════════════════════════════════════════
        // Normal 401 — try silent token refresh via HttpOnly cookie
        // ═══════════════════════════════════════════════════════════════════
        if (status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            if (!isRefreshing) {
                isRefreshing = true;

                try {
                    // CRITICAL: Refresh cookie path is "/api/auth" (set by backend).
                    // Must call "/api/auth/refresh" — NOT "/api/v1/auth/refresh" —
                    // because cookie path matching is prefix-based.
                    // BUG-1 FIX: Send organizationId for O(1) backend lookup
                    const res = await axios.post("/api/auth/refresh", {
                        organizationId: _organizationId || sessionStorage.getItem(ORG_ID_KEY) || undefined,
                    }, {
                        withCredentials: true,
                        headers: {
                            "x-csrf-token": _csrfToken,
                            "x-region-code": sessionStorage.getItem("regionCode") // BUG-10: aligned
                        }
                    });
                    const { token, csrfToken } = res.data;

                    setAccessToken(token);
                    setCsrfToken(csrfToken);

                    // Notify the socket singleton to reconnect with the new token.
                    // The socket is a separate module — we use a custom DOM event to
                    // avoid a circular import. socket.js listens for 'auth-token-refreshed'.
                    if (typeof window !== "undefined") {
                        window.dispatchEvent(
                            new CustomEvent("auth-token-refreshed", { detail: { token } })
                        );
                    }

                    isRefreshing = false;
                    onRefreshed(token, csrfToken);

                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    originalRequest.headers["x-csrf-token"] = csrfToken;
                    return api(originalRequest);
                } catch (refreshError) {
                    isRefreshing = false;
                    onRefreshFailed(refreshError); // BUG-8 FIX: reject queued subscribers
                    clearAuth();
                    emitSessionExpired();
                    return Promise.reject(refreshError);
                }
            }

            // Queue the request while another refresh is in flight
            return new Promise((resolve, reject) => {
                subscribeTokenRefresh((token, csrfToken, error) => {
                    if (error) {
                        return reject(error); // BUG-8 FIX: don't hang on failure
                    }
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    originalRequest.headers["x-csrf-token"] = csrfToken;
                    resolve(api(originalRequest));
                });
            });
        }

        return Promise.reject(err);
    }
);

// ── Response error logging — expose requestId for support tracing ──────────────
// Wraps the existing error interceptor — does not replace it.
api.interceptors.response.use(
    (res) => res,
    (error) => {
        const requestId = error.response?.data?.requestId
            || error.response?.headers?.["x-request-id"]
            || null;

        if (requestId) {
            console.error("[api] Request failed", {
                requestId,
                status: error.response?.status,
                url: error.config?.url,
                method: error.config?.method?.toUpperCase(),
                message: error.response?.data?.message || error.message,
            });
        }

        return Promise.reject(error);
    }
);

// ── Global Toast Notification Interceptor ─────────────────────────────────────
// Automatically shows user-facing toast notifications for ALL API errors.
//
// FLAGS:
//   config.silent      = true  → suppress ALL toast for this request
//   config.showSuccess = true  → show success toast on 2xx response
//   config.successMsg  = "..." → custom success message
//
// RULES:
//   - 401 errors are SUPPRESSED (auth flow handles them via redirect)
//   - Business error codes (e.g., PLAN_IN_USE) get specific messages
//   - Backend `message` is always preferred over generic fallbacks
//   - Network errors get a special "check connection" message
api.interceptors.response.use(
    (res) => {
        // Optional success toast (opt-in per request)
        if (res.config?.showSuccess) {
            import("../utils/toast").then(({ showToast }) => {
                showToast.success(res.config.successMsg || "Operation successful");
            });
        }
        return res;
    },
    (error) => {
        const isSilent = error.config?.silent;

        if (!isSilent) {
            import("../utils/toast").then(({ showToast }) => {
                // Network error — no response at all
                if (!error.response) {
                    showToast.error("Network error — please check your connection.");
                    return;
                }

                const status = error.response.status;
                const data   = error.response.data;
                const code   = data?.error?.code || data?.code;
                const message =
                    data?.error?.message ||
                    data?.message ||
                    error.message ||
                    "Unexpected error occurred";

                // ── Suppress auth-related toasts (auth flow handles them) ────
                if (status === 401) return;

                // ── Business-specific error codes ────────────────────────────
                const codeMessages = {
                    PLAN_IN_USE:           "This plan is used by active subscriptions.",
                    DUPLICATE_ENTRY:       "This record already exists.",
                    INSUFFICIENT_QUOTA:    "You have reached your plan limit.",
                    SUBSCRIPTION_REQUIRED: "An active subscription is required.",
                    REGION_LOCKED:         "This operation is not available in your region.",
                    // Step 5: Entitlement 403 — specific message, no retry
                    FEATURE_NOT_ENABLED:   message || "This feature is not enabled for your organization. Contact your administrator.",
                    DEPENDENCY_NOT_MET:    message || "A required module dependency is not enabled.",
                };

                if (code && codeMessages[code]) {
                    showToast.error(codeMessages[code]);
                    return;
                }

                // ── Status-based fallback ────────────────────────────────────
                switch (status) {
                    case 400:
                        showToast.error(message || "Invalid request");
                        break;
                    case 403:
                        showToast.error(message || "You don't have permission for this action.");
                        break;
                    case 404:
                        showToast.error("Resource not found.");
                        break;
                    case 409:
                        showToast.error(message || "Conflict — resource was already modified.");
                        break;
                    case 422:
                        showToast.error(message || "Validation failed.");
                        break;
                    case 429:
                        showToast.warning("Too many requests. Please slow down.");
                        break;
                    case 500:
                    case 502:
                    case 503:
                        showToast.error("Server error — please try again later.");
                        break;
                    default:
                        showToast.error(message);
                }
            });
        }

        return Promise.reject(error);
    }
);

export default api;

