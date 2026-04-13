/**
 * useRouteContext.js
 * v2.0 — Context-Aware GlobalActionBar Engine
 *
 * Derives the current "context key" from the URL pathname.
 * The contextKey is used to look up which actions to display
 * in OrgGlobalActionBar via the actionRegistry.
 *
 * Returns:
 *   contextKey  {string}  — key into actionRegistry
 *   patientId   {string|null} — present if on patient_profile
 */

import { useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";

// Route pattern → context key mappings
// Ordered most-specific first
const ROUTE_PATTERNS = [
    { pattern: /^\/org\/patients\/[^/]+/, key: "patient_profile" },
    { pattern: /^\/org\/patients/, key: "patients" },
    { pattern: /^\/org\/appointments/, key: "appointments" },
    { pattern: /^\/org\/finance/, key: "finance" },
    { pattern: /^\/org\/calendar/, key: "calendar" },
    { pattern: /^\/org\/analytics/, key: "analytics" },
    { pattern: /^\/org\/inventory/, key: "inventory" },
    { pattern: /^\/org\/settings/, key: "settings" },
    { pattern: /^\/org\/dashboard/, key: "dashboard" },
    // Catch-all org routes → default
    { pattern: /^\/org/, key: "default" },
];

export function useRouteContext() {
    const { pathname } = useLocation();

    const contextKey = useMemo(() => {
        for (const { pattern, key } of ROUTE_PATTERNS) {
            if (pattern.test(pathname)) return key;
        }
        return "default";
    }, [pathname]);

    // Extract :id from patient profile route for future use
    const patientIdMatch = pathname.match(/^\/org\/patients\/([^/]+)/);
    const patientId = patientIdMatch ? patientIdMatch[1] : null;

    return { contextKey, patientId, pathname };
}
