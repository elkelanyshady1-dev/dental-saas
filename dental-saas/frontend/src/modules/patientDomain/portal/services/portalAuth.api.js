/**
 * portalAuth.api.js
 * Portal Authentication API service.
 * Uses portalApi instance (patientToken) — NOT the org api instance.
 * organizationId is NEVER sent, derived from JWT.
 */

import { portalApi } from "@/modules/patientDomain/shared/api/patientDomain.api";

const BASE = "/portal/auth";

export const portalAuthApi = {
    /** Email + password login */
    login: ({ email, password }) => portalApi.post(`${BASE}/login`, { email, password }),

    /** Request magic link */
    requestMagicLink: ({ email }) => portalApi.post(`${BASE}/magic-link/request`, { email }),

    /** Verify magic link token */
    verifyMagicLink: ({ token }) => portalApi.post(`${BASE}/magic-link/verify`, { token }),

    /** Request OTP */
    requestOtp: ({ email }) => portalApi.post(`${BASE}/otp/request`, { email }),

    /** Verify OTP */
    verifyOtp: ({ email, otp }) => portalApi.post(`${BASE}/otp/verify`, { email, otp }),

    /** Logout (invalidates all tokens) */
    logout: () => portalApi.post(`${BASE}/logout`),
};
