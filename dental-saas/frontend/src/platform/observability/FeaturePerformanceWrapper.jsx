import React, { useEffect, useRef } from 'react';
import platformLogger from './platformEventLogger';

/**
 * FeaturePerformanceWrapper (v16.0)
 * Measures mount-to-idle duration for platform features and dispatches telemetry.
 */
const FeaturePerformanceWrapper = ({ featureKey, children }) => {
    const startTime = useRef(performance.now());

    useEffect(() => {
        // Compute duration on mount idle
        const endTime = performance.now();
        const duration = Math.round(endTime - startTime.current);

        // Deterministic delay to ensure browser idle
        const timeoutId = setTimeout(() => {
            platformLogger.logPerformance({
                featureKey,
                loadDuration: duration
            });
        }, 10);

        return () => clearTimeout(timeoutId);
    }, [featureKey]);

    return <>{children}</>;
};

export default FeaturePerformanceWrapper;
