/**
 * portalAccess.api.js — Portal Access API Service (Phase 6)
 *
 * Endpoints:
 *   - verifyAccessToken: public (magic link + setup link verification)
 *   - completeSetup: public (onboarding completion)
 *
 * Uses portalApi with X-Organization-Id header for org scoping.
 * Token is NOT required for these endpoints — they're pre-auth.
 */

import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

// Dedicated instance for public access routes — no auth required
const publicPortalApi = axios.create({
    baseURL: BASE_URL,
    headers: { 'Content-Type': 'application/json' },
});

// Strip to .data
publicPortalApi.interceptors.response.use(
    (res) => res.data,
    (err) => Promise.reject(err.response?.data || err)
);

export const portalAccessApi = {
    /**
     * Verify a magic link or setup link token.
     * @param {{ token: string, organizationId: string }} params
     * @returns {Promise<{ type: string, token?: string, setupToken?: string, patient?: object }>}
     */
    verifyToken: ({ token, organizationId }) =>
        publicPortalApi.post('/portal/access/verify', { token }, {
            headers: { 'X-Organization-Id': organizationId },
        }),

    /**
     * Complete patient onboarding after setup link verification.
     * @param {{ setupToken: string, password?: string, medicalHistory?: object, organizationId: string }} params
     * @returns {Promise<{ success: boolean, token: string, isNewUser: boolean }>}
     */
    completeSetup: ({ setupToken, password, medicalHistory, organizationId }) =>
        publicPortalApi.post('/portal/setup/complete', { setupToken, password, medicalHistory }, {
            headers: { 'X-Organization-Id': organizationId },
        }),
};
