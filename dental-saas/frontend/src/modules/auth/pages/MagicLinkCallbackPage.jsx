import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { publicApi } from "@/services/api";
import OrthoNoeLogo from "@/components/brand/OrthoNoeLogo";

/**
 * /auth/magic
 * 
 * Handles incoming magic link clicks. Sends the token to the backend,
 * receives JWT session, and redirects to the dashboard.
 */
export default function MagicLinkCallbackPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { completeSmartLogin } = useAuth();
    const [status, setStatus] = useState("verifying"); // verifying | error
    const [errorMsg, setErrorMsg] = useState("");

    useEffect(() => {
        const token = searchParams.get("token");
        const redirect = searchParams.get("redirect") || "/org/dashboard";

        if (!token) {
            setStatus("error");
            setErrorMsg("Invalid magic link — no token provided.");
            return;
        }

        (async () => {
            try {
                const res = await publicApi.get(`/auth/magic-login?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(redirect)}`);
                const data = res.data;

                if (data.type === "MULTI_ORG") {
                    navigate(`/login?type=multi_org&magic=1`, { replace: true });
                    return;
                }

                if (data.accessToken) {
                    await completeSmartLogin(data.accessToken, null);
                    navigate(data.redirect || redirect, { replace: true });
                } else {
                    setStatus("error");
                    setErrorMsg("Failed to authenticate. Please try again.");
                }
            } catch (err) {
                setStatus("error");
                const msg = err.response?.data?.message || "The magic link is invalid or has expired.";
                setErrorMsg(msg);
            }
        })();
    }, [searchParams, navigate, completeSmartLogin]);

    if (status === "error") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white px-6">
                <div className="text-center max-w-sm animate-in fade-in duration-500">
                    <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-50 flex items-center justify-center">
                        <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight mb-2">Link Expired or Invalid</h2>
                    <p className="text-sm text-slate-500 mb-8">{errorMsg}</p>
                    <button
                        onClick={() => navigate("/login", { replace: true })}
                        className="px-8 py-3.5 bg-blue-600 text-white rounded-2xl font-bold text-sm hover:bg-blue-700 transition-colors"
                    >
                        Back to Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-white">
            <div className="text-center animate-in fade-in duration-500">
                <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-blue-50 flex items-center justify-center">
                    <OrthoNoeLogo className="w-10 h-10 animate-pulse" />
                </div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Verifying Magic Link...</h2>
                <p className="text-sm text-slate-400 mt-2 font-medium">Please wait while we sign you in.</p>
            </div>
        </div>
    );
}
