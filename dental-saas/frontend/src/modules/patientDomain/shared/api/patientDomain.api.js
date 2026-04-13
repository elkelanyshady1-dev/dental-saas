/**
 * patientDomain.api.js — Isolated Portal + Staff API Layer (Phase 6)
 *
 * TWO separate instances with strict plane isolation:
 *
 *   portalApi  → Patient portal endpoints. Uses patientToken from localStorage.
 *                NEVER falls back to org/staff auth token.
 *
 *   staffApi   → Org-plane staff endpoints (branches, branding, notifications,
 *                command search). Uses the SAME token as the central api instance
 *                (org_access_token from sessionStorage) so it stays in sync with
 *                AuthContext's setAccessToken/clearAuth lifecycle.
 */

import axios from 'axios';

// ── Portal API Instance ────────────────────────────────────────────────────────
// Uses its own isolated token (patientToken). Zero-trust plane isolation.
const createPortalInstance = () => {
    const instance = axios.create({
        baseURL: import.meta.env.VITE_API_URL || '/api/v1',
        headers: { 'Content-Type': 'application/json' },
    });

    instance.interceptors.request.use(
        (config) => {
            const token = localStorage.getItem('patientToken');
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
            const orgId = localStorage.getItem('portalOrganizationId');
            if (orgId && !config.headers['X-Organization-Id']) {
                config.headers['X-Organization-Id'] = orgId;
            }
            return config;
        },
        (error) => Promise.reject(error)
    );

    instance.interceptors.response.use(
        (response) => response.data,
        (error) => {
            if (error.response?.status === 401) {
                localStorage.removeItem('patientToken');
                window.dispatchEvent(new CustomEvent('portal:auth:expired', {
                    detail: { tokenKey: 'patientToken' }
                }));
            }
            return Promise.reject(error.response?.data || error);
        }
    );

    return instance;
};

// ── Staff API Instance ─────────────────────────────────────────────────────────
// Used by org-plane components: OrgBrandingContext, BranchContext,
// OrgHeader (command search), notification hooks, useDashboardAction.
// Reads from the SAME token store as api.js (sessionStorage → org_access_token).
const TOKEN_KEY = 'org_access_token';

const createStaffInstance = () => {
    const instance = axios.create({
        baseURL: import.meta.env.VITE_API_URL || '/api/v1',
        headers: { 'Content-Type': 'application/json' },
        withCredentials: true,
    });

    instance.interceptors.request.use(
        (config) => {
            // Read from sessionStorage — same key as api.js setAccessToken()
            const token = sessionStorage.getItem(TOKEN_KEY);
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
            // Attach region code for multi-region routing
            const region = localStorage.getItem('regionCode');
            if (region) {
                config.headers['x-region-code'] = region;
            }
            return config;
        },
        (error) => Promise.reject(error)
    );

    instance.interceptors.response.use(
        (response) => response.data,
        (error) => {
            // Don't handle 401 here — let the component handle retries.
            // The central api.js interceptor handles token refresh.
            return Promise.reject(error.response?.data || error);
        }
    );

    return instance;
};

// Portal API — uses patientToken ONLY (no org auth fallback)
export const portalApi = createPortalInstance();

// Staff API — shares org_access_token with api.js
export const staffApi = createStaffInstance();
