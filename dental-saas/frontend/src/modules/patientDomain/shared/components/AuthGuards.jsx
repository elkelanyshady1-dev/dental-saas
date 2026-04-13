import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

/**
 * PortalAuthGuard
 * Specifically for external patients.
 * Checks for 'patientToken' and enforces type === 'patient'.
 */
export const PortalAuthGuard = ({ children }) => {
    const token = localStorage.getItem('patientToken');
    const location = useLocation();

    if (!token) {
        return <Navigate to="/portal/login" state={{ from: location }} replace />;
    }

    try {
        const decoded = jwtDecode(token);

        // Strict Type Separation
        if (decoded.type !== 'patient') {
            localStorage.removeItem('patientToken');
            return <Navigate to="/portal/login" replace />;
        }

        // Check expiry
        if (decoded.exp * 1000 < Date.now()) {
            localStorage.removeItem('patientToken');
            return <Navigate to="/portal/login" replace />;
        }

        return children;
    } catch (err) {
        localStorage.removeItem('patientToken');
        return <Navigate to="/portal/login" replace />;
    }
};

/**
 * StaffAuthGuard
 * Enhances existing staff auth with strict type 'org' enforcement for Patient Domain management.
 */
export const StaffAuthGuard = ({ children }) => {
    const token = sessionStorage.getItem('org_access_token');
    const location = useLocation();

    if (!token) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    try {
        const decoded = jwtDecode(token);

        if (decoded.type !== 'org' && decoded.type !== 'platform') {
            return <Navigate to="/login" replace />;
        }

        return children;
    } catch (err) {
        return <Navigate to="/login" replace />;
    }
};
