import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

/**
 * /auth/google/callback
 * 
 * This page handles the redirect from the Google OAuth backend callback.
 * It reads the token and csrf from the URL query params, stores them,
 * and redirects to the intended destination.
 */
export default function GoogleCallbackPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { completeSmartLogin } = useAuth();

    useEffect(() => {
        const token = searchParams.get("token");
        const csrf = searchParams.get("csrf");
        const redirect = searchParams.get("redirect") || "/org/dashboard";
        const error = searchParams.get("error");

        if (error) {
            navigate(`/login?error=${error}`, { replace: true });
            return;
        }

        if (token && csrf) {
            completeSmartLogin(token, csrf)
                .then(() => {
                    navigate(redirect, { replace: true });
                })
                .catch(() => {
                    navigate("/login?error=google_auth_failed", { replace: true });
                });
        } else {
            navigate("/login?error=missing_token", { replace: true });
        }
    }, [searchParams, navigate, completeSmartLogin]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-white">
            <div className="text-center animate-in fade-in duration-500">
                <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-blue-50 flex items-center justify-center">
                    <svg className="w-8 h-8 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                </div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Authenticating...</h2>
                <p className="text-sm text-slate-400 mt-2 font-medium">Completing Google sign-in</p>
            </div>
        </div>
    );
}
