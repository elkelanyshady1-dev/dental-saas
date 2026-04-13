/**
 * RequireOrgPermission.jsx
 * Organization Plane — Permission Route Guard
 *
 * Wraps org route elements to enforce permission-based access control.
 * Uses the existing usePermission() hook from @/org/hooks/usePermission.
 *
 * USAGE
 *   <Route
 *     path="/org/patients"
 *     element={
 *       <RequireOrgPermission permission="patients.read">
 *         <PatientsPage />
 *       </RequireOrgPermission>
 *     }
 *   />
 *
 * PLANE: Org-plane only. Do NOT use in platform-plane contexts.
 *   Platform uses RequireCapability from platform/core/guards/.
 */

import React from "react";
import { useCapability } from "@/hooks/useCapability";
import { useAuth } from "@/context/AuthContext";
import { Link } from "react-router-dom";

/**
 * RequireOrgPermission
 *
 * @param {Object} props
 * @param {string}   props.permission   — Dot-notation permission string e.g. "patients.read"
 * @param {string}   [props.fallbackMessage] — Custom denial message
 * @param {React.ReactNode} props.children  — Protected content
 */
export default function RequireOrgPermission({
    permission,
    fallbackMessage,
    children,
}) {
    const allowed = useCapability(permission);
    const { loading } = useAuth();

    // While auth is still loading, render nothing (prevents flash)
    if (loading) return null;

    if (!allowed) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
                    <svg
                        className="w-8 h-8 text-red-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                        />
                    </svg>
                </div>
                <h2 className="text-lg font-bold text-slate-800 mb-1">
                    Access Restricted
                </h2>
                <p className="text-sm text-slate-500 max-w-md">
                    {fallbackMessage ||
                        `You don't have the "${permission}" permission required to access this section. Contact your clinic administrator.`}
                </p>
                <Link
                    to="/org/dashboard"
                    className="mt-6 px-5 py-2 text-sm font-semibold text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition"
                >
                    Go to Dashboard
                </Link>
            </div>
        );
    }

    return children;
}
