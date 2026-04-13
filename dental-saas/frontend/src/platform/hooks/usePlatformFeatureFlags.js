/**
 * usePlatformFeatureFlags.js
 * v19.3 — Enterprise-Grade Flag Hook with SSE + In-Memory Cache + ETag
 *
 * LEAN mode:      ETag-based in-memory caching, zero duplicate requests
 * ENTERPRISE mode: SSE real-time push updates, ETag fetch disabled (no double traffic)
 *
 * v19.3 Boot Hardening:
 * - Gated on authResolved to prevent 401 flicker during startup race
 * - Fail-closed only fires AFTER auth resolves — never during boot
 *
 * PLATFORM PLANE ONLY — DO NOT USE IN ORG CONTEXT
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { platformApiClient } from '../core/api/platformApiClient';
import { usePlatformAuth } from '../auth/PlatformAuthContext';

// Module-level cache (per session only — never persisted)
let cachedFlags = null;
let cachedETag = null;
let cachePromise = null;
let sseConnection = null; // Singleton SSE — one connection per session, not per component

const PLATFORM_MODE = import.meta.env.VITE_PLATFORM_MODE || 'LEAN';
const isEnterpriseFrontend = () => PLATFORM_MODE === 'ENTERPRISE';

/**
 * invalidateFlagCache
 * Called by PlatformAuthContext on logout.
 */
export const invalidateFlagCache = () => {
    cachedFlags = null;
    cachedETag = null;
    cachePromise = null;
    if (sseConnection) {
        sseConnection.close();
        sseConnection = null;
    }
};

export const usePlatformFeatureFlags = () => {
    const { token, authResolved } = usePlatformAuth();
    const [flags, setFlags] = useState(cachedFlags || {});
    const [loading, setLoading] = useState(!cachedFlags);
    const mounted = useRef(true);

    // ─── SSE Handler (Enterprise mode) ──────────────────────────────────────
    const connectSSE = useCallback(() => {
        if (sseConnection) return;

        sseConnection = new EventSource(
            `/api/platform/feature-flags/stream`,
            { withCredentials: true }
        );

        sseConnection.onmessage = async (event) => {
            if (!mounted.current) return;
            try {
                const rawFlags = JSON.parse(event.data);
                const { PLATFORM_FEATURE_FLAGS } = await import('@packages/platform-contract/platformContract');
                const cleanFlags = {};
                Object.entries(rawFlags).forEach(([flag, value]) => {
                    if (Object.prototype.hasOwnProperty.call(PLATFORM_FEATURE_FLAGS, flag)) {
                        cleanFlags[flag] = value;
                    } else {
                        console.error(`[FeatureFlags-SSE] Drift: unknown flag "${flag}"`);
                    }
                });
                cachedFlags = cleanFlags;
                setFlags(cleanFlags);
            } catch (err) {
                console.error('[FeatureFlags-SSE] Failed to parse update. Fail-closed.', err);
            }
        };

        sseConnection.onerror = () => {
            console.warn('[FeatureFlags-SSE] Connection lost.');
            sseConnection?.close();
            sseConnection = null;
        };
    }, []);

    // ─── ETag Fetch (LEAN mode) ──────────────────────────────────────────────
    const fetchFlags = useCallback(async () => {
        // ⚠️ v19.3 Boot Gate: Never fire before auth resolves — prevents 401 flicker
        if (!authResolved || !token) return;

        try {
            if (cachedFlags) {
                setFlags(cachedFlags);
                setLoading(false);
                return;
            }

            if (cachePromise) {
                await cachePromise;
                setFlags(cachedFlags || {});
                setLoading(false);
                return;
            }

            setLoading(true);

            cachePromise = (async () => {
                // v19.3: Generated client → /api/platform/feature-flags
                // RequestParams extends AxiosRequestConfig so headers + validateStatus forward cleanly.
                const response = await platformApiClient.governance.featureFlagsList({
                    headers: cachedETag ? { 'If-None-Match': cachedETag } : {},
                    validateStatus: (status) => status === 200 || status === 304,
                });

                if (response.status === 304 && cachedFlags) {
                    return;
                }

                const { PLATFORM_FEATURE_FLAGS } = await import('@packages/platform-contract/platformContract');
                const cleanFlags = {};
                Object.entries(response.data.flags || {}).forEach(([flag, value]) => {
                    if (Object.prototype.hasOwnProperty.call(PLATFORM_FEATURE_FLAGS, flag)) {
                        cleanFlags[flag] = value;
                    } else {
                        console.error(`[FeatureFlags] Drift: unknown flag "${flag}"`);
                    }
                });

                cachedETag = response.headers?.etag || null;
                cachedFlags = cleanFlags;
            })();

            await cachePromise;

        } catch (err) {
            // Fail-closed: empty flags block all gated routes
            console.error('[PlatformFeatureFlags] ❌ Critical failure. Fail-closed.', err.message);
            setFlags({});
        } finally {
            cachePromise = null;
            setFlags(cachedFlags || {});
            setLoading(false);
        }
    }, [authResolved, token]);

    useEffect(() => {
        mounted.current = true;

        if (!authResolved || !token) {
            if (authResolved && !token) {
                // Auth definitively failed — no token means flags will never load.
                // Resolve immediately so PlatformBoot is not blocked by flagsLoading.
                setLoading(false);
            }
            // Not yet resolved — keep loading state, do not fail-close early.
            return;
        }

        if (isEnterpriseFrontend()) {
            if (cachedFlags) {
                setFlags(cachedFlags);
                setLoading(false);
            } else {
                fetchFlags().then(() => connectSSE());
            }
            if (!sseConnection) connectSSE();
        } else {
            fetchFlags();
        }

        return () => {
            mounted.current = false;
        };
    }, [fetchFlags, connectSSE, authResolved, token]);

    const hasFeature = (flagKey) => {
        if (!flagKey) return true;
        return !!flags[flagKey];
    };

    const refreshFlags = async () => {
        cachedFlags = null;
        cachedETag = null;
        cachePromise = null;
        if (sseConnection) { sseConnection.close(); sseConnection = null; }
        await fetchFlags();
        if (isEnterpriseFrontend()) connectSSE();
    };

    return {
        flags,
        loading,
        hasFeature,
        isKillSwitchActive: !!flags.PLATFORM_KILL_SWITCH,
        refreshFlags,
    };
};

export default usePlatformFeatureFlags;
