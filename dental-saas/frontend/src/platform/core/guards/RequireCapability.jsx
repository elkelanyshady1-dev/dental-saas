import React from 'react';
import { Navigate } from "react-router-dom";
import { usePlatformCapabilities } from "../../hooks/usePlatformCapabilities";
import { usePlatformFeatureFlags } from "../../hooks/usePlatformFeatureFlags";

/**
 * RequireCapability (Dual Gate v18.0 Hardened)
 * Deterministic route guard enforcing both Capability and optional Feature Flag.
 * v20.2 — Removed diagnostic console.log / console.warn calls.
 */
const RequireCapability = ({ permission, flag, children }) => {
    const { hasCapability, loading: capsLoading } = usePlatformCapabilities();
    const { hasFeature, loading: flagsLoading } = usePlatformFeatureFlags();

    if (capsLoading || flagsLoading) return null;

    // Gate 1: Capability Enforcement
    if (!hasCapability(permission)) {
        return <Navigate to="/platform/unauthorized" replace />;
    }

    // Gate 2: Feature Flag Enforcement (if defined)
    if (flag && !hasFeature(flag)) {
        return <Navigate to="/platform/unauthorized" replace />;
    }

    return children;
};

export default RequireCapability;
