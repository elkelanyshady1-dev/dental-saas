import React from 'react';
import { Navigate } from 'react-router-dom';
import usePlatformFeatureFlags from '../../hooks/usePlatformFeatureFlags';

/**
 * RequireFeatureFlag (v16.0)
 * Composite guard that checks if a specific system-level feature flag is active.
 * Used in conjunction with RequireCapability.
 */
const RequireFeatureFlag = ({ flag, children }) => {
    const { hasFeature, loading } = usePlatformFeatureFlags();

    if (loading) return null;

    if (flag && !hasFeature(flag)) {
        // Feature is disabled globally or regionally
        return <Navigate to="/platform/unauthorized" replace />;
    }

    return children;
};

export default RequireFeatureFlag;
