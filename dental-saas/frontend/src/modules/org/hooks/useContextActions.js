/**
 * useContextActions.js
 * v2.0 — Context-Aware GlobalActionBar Engine
 *
 * For a given contextKey:
 *  1. Reads the action definitions from actionRegistry
 *  2. Attempts to fetch allowed overrides from backend GET /org/context/actions
 *  3. Falls back gracefully to frontend RBAC (hasPermission) if backend fails
 *  4. Returns the final filtered list ready for rendering
 *
 * Returns:
 *   actions      {Array}   — filtered, ordered actions for this context
 *   isLoading    {boolean} — true during initial fetch
 *   contextKey   {string}  — current context (for animation keys)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import api from "@/services/api";
import { actionRegistry } from "@/modules/org/context/actionRegistry";

// Cache backend results per contextKey to avoid redundant network calls
const _backendCache = {};
// TTL: 2 minutes
const CACHE_TTL_MS = 2 * 60 * 1000;

export function useContextActions(contextKey) {
    const { permissions, loading: authLoading, user } = useAuth();
    const [backendAllowed, setBackendAllowed] = useState(null); // null = not loaded yet
    const [isLoading, setIsLoading] = useState(true);
    const abortRef = useRef(null);

    // Fetch backend action allowlist for this context
    const fetchFromBackend = useCallback(async (ctx) => {
        // Check cache first
        const cached = _backendCache[ctx];
        if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
            setBackendAllowed(cached.data);
            setIsLoading(false);
            return;
        }

        // Abort any in-flight request for a previous context
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();

        setIsLoading(true);
        try {
            const res = await api.get(`/org/context/actions`, {
                params: { context: ctx },
                signal: abortRef.current.signal,
            });
            const data = res?.data ?? res;
            // Backend returns: [{ key: "add_patient", allowed: true }, ...]
            const map = {};
            (Array.isArray(data) ? data : []).forEach(({ key, allowed }) => {
                map[key] = allowed;
            });
            _backendCache[ctx] = { data: map, ts: Date.now() };
            setBackendAllowed(map);
        } catch (err) {
            if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return;
            // Backend not available — fall back to frontend RBAC only
            setBackendAllowed(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Re-fetch when context changes (and auth has loaded)
    useEffect(() => {
        if (authLoading) return;
        fetchFromBackend(contextKey);
        return () => {
            if (abortRef.current) abortRef.current.abort();
        };
    }, [contextKey, authLoading, fetchFromBackend]);

    // When auth is still loading, keep isLoading true
    useEffect(() => {
        if (authLoading) setIsLoading(true);
    }, [authLoading]);

    /**
     * Resolve permission from the permissions object directly.
     * Replaces deprecated hasPermission() — same logic, no console warning.
     * @param {string} permKey  Dot-notation permission string e.g. "patients.create"
     * @returns {boolean}
     */
    const checkPermission = useCallback((permKey) => {
        if (!permKey || typeof permKey !== "string") return false;
        const [mod, action] = permKey.split(".");
        if (!mod || !action) return false;
        return !!permissions?.[mod]?.[action];
    }, [permissions]);

    /**
     * Resolve final allowed status for a single action.
     * Priority: backend > frontend RBAC > deny
     */
    const isAllowed = useCallback((action) => {
        // While still loading, optimistically allow to avoid "no permission" flash
        if (authLoading || isLoading) return true;

        // If user is missing entirely, deny
        if (!user) return false;

        // Backend overrides if available for this key
        if (backendAllowed !== null && action.key in backendAllowed) {
            return backendAllowed[action.key];
        }

        // Fallback: frontend RBAC via direct permissions object
        return checkPermission(action.perm);
    }, [authLoading, isLoading, user, backendAllowed, checkPermission]);

    /**
     * Build final action list for this context:
     * - Get definitions from registry (fallback to "default")
     * - Attach allowed status
     * - Keep full list (allowed=false shows as disabled, not hidden)
     */
    const actions = (actionRegistry[contextKey] ?? actionRegistry.default).map(action => ({
        ...action,
        allowed: isAllowed(action),
    }));

    return {
        actions,
        isLoading: authLoading || isLoading,
        contextKey,
    };
}
