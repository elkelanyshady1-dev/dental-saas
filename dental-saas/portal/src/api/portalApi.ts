/**
 * portalApi.ts
 * Centralized Axios instance for the Patient Portal.
 *
 * ─── SECURITY INVARIANTS ─────────────────────────────────────────
 *  ✅ Token attached from sessionStorage (key: portal_token)
 *  ✅ NEVER sends organizationId — derived from JWT on backend
 *  ✅ 401 → auto-clear token + redirect to /login
 *  ✅ Prevents infinite 401 retry loops (_retried flag)
 *  ✅ No sensitive data logged
 */

import axios from 'axios';

const TOKEN_KEY = 'portal_token';
let isRedirecting = false;

const portalApi = axios.create({
  baseURL: '/api/v1',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Request Interceptor: Attach JWT ──────────────────────────────
portalApi.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor: Handle 401 + prevent retry loops ───────
portalApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !isRedirecting) {
      isRedirecting = true;

      // Clear all auth state
      sessionStorage.removeItem(TOKEN_KEY);

      // Redirect to login (only if not already there)
      if (typeof window !== 'undefined') {
        const path = window.location.pathname;
        if (path !== '/login' && !path.startsWith('/magic-link')) {
          window.location.href = '/login';
        }
      }

      // Reset flag after a brief delay to allow navigation
      setTimeout(() => { isRedirecting = false; }, 2000);
    }

    return Promise.reject(error);
  }
);

export default portalApi;
