/**
 * observabilityService.js
 * Platform Billing Observability — API Client
 *
 * Thin wrapper around platformApi for the observability endpoints.
 * All auth is handled by platformApi (session token + interceptors).
 *
 * PLANE: Platform
 */

import platformApi from "@/platform/auth/platformApi";

export const observabilityService = {
    /** GET /api/platform/observability/dashboard?windowHours=N */
    getDashboard: (windowHours = 24) =>
        platformApi
            .get("/observability/dashboard", { params: { windowHours } })
            .then((r) => r.data),

    /** GET /api/platform/observability/feed?limit=N */
    getFeed: (limit = 50) =>
        platformApi
            .get("/observability/feed", { params: { limit } })
            .then((r) => r.data),
};

export default observabilityService;
