/**
 * useOrgCapabilities.js
 * Sprint 3 — Unified Capability Resolver (Frontend Hook)
 *
 * PURPOSE:
 * Fetches the unified capability snapshot for the current org from the backend.
 * Returns a single { capabilities, loading, error } object for use in guards and
 * feature gating throughout the org-plane frontend.
 *
 * Backend: GET /api/v1/org/capabilities
 * Data shape:
 *   {
 *     modules:  { patients: true, analytics: false, ... }
 *     limits:   { maxUsers: 10, maxBranches: 3 }
 *     features: { ai_diagnosis_beta: true, ... }
 *     addons:   ["extra_sms_5000"]
 *   }
 *
 * USAGE:
 *   const { capabilities, loading } = useOrgCapabilities();
 *   if (!capabilities?.modules?.analytics) return <UpgradeBanner />;
 *
 * TRANSITION — during the migration from old guards, both patterns are valid:
 *   OLD (still works): req.planCapabilities.modules.analytics
 *   NEW (preferred):   capabilities.modules.analytics  (via this hook)
 *
 * PLANE: Org-plane only.
 * DO NOT import in platform-plane contexts.
 */

import { useEffect, useState, useCallback } from "react";
import api from "@/services/api";

/**
 * useOrgCapabilities
 *
 * @param {object} [options]
 * @param {boolean} [options.refetchOnFocus=false]  Refetch when window regains focus
 *
 * @returns {{
 *   capabilities: object|null,
 *   loading: boolean,
 *   error: Error|null,
 *   refetch: function
 * }}
 */
export function useOrgCapabilities({ refetchOnFocus = false } = {}) {
    const [capabilities, setCapabilities] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchCapabilities = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get("/org/capabilities");
            setCapabilities(res.data?.data ?? null);
        } catch (err) {
            // Non-blocking — surface error but don't crash the page
            setError(err);
            setCapabilities(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCapabilities();
    }, [fetchCapabilities]);

    // Optional: refetch on window focus (useful after admin applies an override)
    useEffect(() => {
        if (!refetchOnFocus) return;
        const onFocus = () => fetchCapabilities();
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [refetchOnFocus, fetchCapabilities]);

    return { capabilities, loading, error, refetch: fetchCapabilities };
}

// ── Convenience selector helpers ─────────────────────────────────────────────
/**
 * hasModule(capabilities, moduleKey)
 * Returns false when capabilities is null (loading) or module is disabled.
 */
export function hasModule(capabilities, moduleKey) {
    return Boolean(capabilities?.modules?.[moduleKey]);
}

/**
 * hasFeature(capabilities, featureKey)
 * Returns false when capabilities is null (loading) or feature flag is off.
 */
export function hasFeature(capabilities, featureKey) {
    return Boolean(capabilities?.features?.[featureKey]);
}
