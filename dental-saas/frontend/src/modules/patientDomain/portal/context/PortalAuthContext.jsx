/**
 * PortalAuthContext.jsx — Patient Portal Auth State (Phase 6)
 *
 * Single source of truth for portal authentication.
 *
 * Provides:
 *   - patient: decoded JWT payload
 *   - isAuthenticated: boolean
 *   - features: permission flags from PatientUser.portalPermissions
 *   - loginWithToken(token): store + decode JWT
 *   - logout(): clear token + redirect
 *
 * Listens for:
 *   - portal:auth:expired event from API layer (auto-logout on 401)
 */

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const PortalAuthContext = createContext(null);

function safeDecodeJwt(token) {
    try {
        const payload = token.split(".")[1];
        return JSON.parse(atob(payload));
    } catch {
        return null;
    }
}

export function PortalAuthProvider({ children }) {
    const [patient, setPatient] = useState(null);
    const [features, setFeatures] = useState({});
    const navigate = useNavigate();

    // ── Initialize from localStorage ─────────────────────────────────────
    useEffect(() => {
        const token = localStorage.getItem("patientToken");
        if (!token) return;

        const decoded = safeDecodeJwt(token);
        if (!decoded || decoded.type !== "patient") {
            localStorage.removeItem("patientToken");
            return;
        }

        // Check expiry
        if (decoded.exp && decoded.exp * 1000 < Date.now()) {
            localStorage.removeItem("patientToken");
            return;
        }

        setPatient(decoded);
        setFeatures(decoded.features || {});
    }, []);

    // ── Listen for auth:expired events from API layer ────────────────────
    useEffect(() => {
        const handleExpired = () => {
            localStorage.removeItem("patientToken");
            setPatient(null);
            setFeatures({});
            navigate("/portal/login", { replace: true });
        };

        window.addEventListener("portal:auth:expired", handleExpired);
        return () => window.removeEventListener("portal:auth:expired", handleExpired);
    }, [navigate]);

    // ── Login ────────────────────────────────────────────────────────────
    const loginWithToken = useCallback((token) => {
        localStorage.setItem("patientToken", token);
        const decoded = safeDecodeJwt(token);
        setPatient(decoded);
        setFeatures(decoded?.features || {});
    }, []);

    // ── Logout ───────────────────────────────────────────────────────────
    const logout = useCallback(() => {
        localStorage.removeItem("patientToken");
        setPatient(null);
        setFeatures({});
        navigate("/portal/login", { replace: true });
    }, [navigate]);

    const value = {
        patient,
        isAuthenticated: !!patient,
        features,
        loginWithToken,
        logout,
    };

    return (
        <PortalAuthContext.Provider value={value}>
            {children}
        </PortalAuthContext.Provider>
    );
}

export function usePortalAuthContext() {
    const ctx = useContext(PortalAuthContext);
    if (!ctx) {
        throw new Error("usePortalAuthContext must be used within a PortalAuthProvider");
    }
    return ctx;
}
