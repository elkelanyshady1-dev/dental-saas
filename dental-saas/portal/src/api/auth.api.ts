/**
 * auth.api.ts
 * Patient Portal Authentication API
 *
 * All endpoints go through portalApi (centralized).
 * Public routes use organizationContext middleware on backend.
 */

import portalApi from './portalApi';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface OtpVerifyPayload {
  email: string;
  otp: string;
}

export const authApi = {
  /** Email + password login */
  login: async (payload: LoginPayload) => {
    const res = await portalApi.post('/portal/auth/login', payload);
    return res.data as { success: boolean; data: { token: string } };
  },

  /** Request magic link via email */
  requestMagicLink: async (email: string) => {
    const res = await portalApi.post('/portal/auth/magic-link/request', { email });
    return res.data as { success: boolean; message: string };
  },

  /** Verify magic link token → JWT */
  verifyMagicLink: async (token: string) => {
    const res = await portalApi.post('/portal/auth/magic-link/verify', { token });
    return res.data as { success: boolean; data: { token: string } };
  },

  /** Request OTP via email */
  requestOtp: async (email: string) => {
    const res = await portalApi.post('/portal/auth/otp/request', { email });
    return res.data as { success: boolean; message: string };
  },

  /** Verify OTP → JWT */
  verifyOtp: async (payload: OtpVerifyPayload) => {
    const res = await portalApi.post('/portal/auth/otp/verify', payload);
    return res.data as { success: boolean; data: { token: string } };
  },

  /** Logout (invalidates all tokens server-side) */
  logout: async () => {
    const res = await portalApi.post('/portal/auth/logout');
    return res.data as { success: boolean; message: string };
  },
};
