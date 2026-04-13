/**
 * PortalMagicLinkPage.jsx — Magic Link Landing (Phase 6)
 *
 * Route: /portal/magic-link?token=xxx&org=yyy
 *
 * Flow:
 *   1. Extract token + org from URL params
 *   2. Call POST /portal/access/verify
 *   3. On magic_link: auto-login → redirect to dashboard
 *   4. On setup_link: redirect to /portal/setup with state
 *   5. On error: show message
 *
 * Public page — no auth guard.
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { portalAccessApi } from "../services/portalAccess.api";

const BrandIcon = () => (
    <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" rx="3" width="18" height="18" />
        <path d="M8 12h8M12 8v8" />
    </svg>
);

export default function PortalMagicLinkPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState("verifying"); // verifying | success | error
    const [error, setError] = useState(null);

    const token = searchParams.get("token");
    const org = searchParams.get("org");

    useEffect(() => {
        if (!token || !org) {
            setStatus("error");
            setError("Invalid link. Please request a new one from your clinic.");
            return;
        }

        const verify = async () => {
            try {
                const result = await portalAccessApi.verifyToken({
                    token,
                    organizationId: org,
                });

                const data = result.data || result;

                if (data.type === "magic_link" && data.token) {
                    // Auto-login
                    localStorage.setItem("patientToken", data.token);
                    localStorage.setItem("portalOrganizationId", org);
                    setStatus("success");
                    setTimeout(() => navigate("/portal/dashboard", { replace: true }), 1200);
                } else if (data.type === "setup_link") {
                    // Redirect to setup page
                    localStorage.setItem("portalOrganizationId", org);
                    navigate("/portal/setup", {
                        replace: true,
                        state: {
                            setupToken: data.setupToken,
                            patient: data.patient,
                            organizationId: org,
                        },
                    });
                } else {
                    setStatus("error");
                    setError("Unexpected response. Please contact your clinic.");
                }
            } catch (err) {
                setStatus("error");
                setError(
                    err?.error?.message || err?.message || "Link is invalid or expired. Please request a new one from your clinic."
                );
            }
        };

        verify();
    }, [token, org, navigate]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center px-4">
            <div className="max-w-md w-full">
                {/* Logo */}
                <div className="flex items-center justify-center gap-3 mb-10">
                    <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
                        <BrandIcon />
                    </div>
                    <span className="text-white font-bold text-2xl tracking-tight">DentalSaaS</span>
                </div>

                {/* Status card */}
                <div className="bg-white rounded-3xl shadow-2xl p-10 text-center">
                    {status === "verifying" && (
                        <>
                            <div className="w-16 h-16 mx-auto mb-6 relative">
                                <div className="w-full h-full border-4 border-blue-100 rounded-full" />
                                <div className="absolute inset-0 w-full h-full border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                            <h2 className="text-xl font-bold text-slate-900 mb-2">Verifying your link...</h2>
                            <p className="text-slate-500 text-sm">Please wait while we securely validate your access.</p>
                        </>
                    )}

                    {status === "success" && (
                        <>
                            <div className="w-16 h-16 mx-auto mb-6 bg-emerald-100 rounded-full flex items-center justify-center">
                                <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-bold text-slate-900 mb-2">Welcome back!</h2>
                            <p className="text-slate-500 text-sm">Redirecting to your dashboard...</p>
                        </>
                    )}

                    {status === "error" && (
                        <>
                            <div className="w-16 h-16 mx-auto mb-6 bg-red-100 rounded-full flex items-center justify-center">
                                <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <path strokeLinecap="round" d="M12 8v4m0 4h.01" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-bold text-slate-900 mb-2">Link Expired</h2>
                            <p className="text-slate-500 text-sm mb-6">{error}</p>
                            <button
                                onClick={() => navigate("/portal/login")}
                                className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition shadow-lg shadow-blue-200"
                            >
                                Go to Login
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
