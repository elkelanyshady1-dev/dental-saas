/**
 * usePortalAuth.js — Patient Portal Auth Hook
 *
 * Reads patientToken from localStorage, decodes it (jwt-decode),
 * and provides:
 *   - isAuthenticated — boolean
 *   - patient — decoded payload (id, email, name, etc)
 *   - logout — clears token + redirects to /portal/login
 *
 * Redirects to /portal/login if token is absent or expired/invalid.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function safeDecodeJwt(token) {
    try {
        const payload = token.split(".")[1];
        const decoded = JSON.parse(atob(payload));
        return decoded;
    } catch {
        return null;
    }
}

export function usePortalAuth() {
    const navigate = useNavigate();
    const [patient, setPatient] = useState(null);

    useEffect(() => {
        const token = localStorage.getItem("patientToken");
        if (!token) { navigate("/portal/login", { replace: true }); return; }

        const decoded = safeDecodeJwt(token);
        if (!decoded || decoded.type !== "patient" || (decoded.exp && decoded.exp * 1000 < Date.now())) {
            localStorage.removeItem("patientToken");
            navigate("/portal/login", { replace: true });
            return;
        }
        setPatient(decoded);
    }, [navigate]);

    const logout = useCallback(() => {
        localStorage.removeItem("patientToken");
        navigate("/portal/login", { replace: true });
    }, [navigate]);

    return { patient, isAuthenticated: !!patient, logout };
}
