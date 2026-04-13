import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import api from "../services/api";
import { Button, Input, Card, FeatureItem, StatsBadge } from "@/design-system";

// ─── Org Selector Card ────────────────────────────────────────────────────────
function OrgCard({ org, onSelect, loading }) {
    const initials = org.name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() || "")
        .join("");

    return (
        <button
            id={`org-btn-${org.organizationId}`}
            type="button"
            disabled={loading}
            onClick={() => onSelect(org.organizationId)}
            className="group w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50"
            style={{
                borderColor: org.primaryColor || "#e2e8f0",
                "--tw-ring-color": org.primaryColor || "#3b82f6",
            }}
        >
            {/* Logo / Avatar */}
            <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 font-bold text-white text-sm shadow"
                style={{ background: org.primaryColor || "#3b82f6" }}
            >
                {org.logoUrl ? (
                    <img
                        src={org.logoUrl}
                        alt={org.name}
                        className="w-full h-full object-contain rounded-xl"
                    />
                ) : (
                    initials
                )}
            </div>

            {/* Name + slug */}
            <div className="flex-1 text-left">
                <div className="font-semibold text-slate-800 text-sm group-hover:text-blue-700 transition-colors">
                    {org.name}
                </div>
                {org.slug && (
                    <div className="text-xs text-slate-400 mt-0.5">@{org.slug}</div>
                )}
            </div>

            {/* Arrow */}
            <svg
                className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 5l7 7-7 7"
                />
            </svg>
        </button>
    );
}

// ─── Main Login Page ──────────────────────────────────────────────────────────
export default function LoginPage() {
    const { login, smartLogin, completeSmartLogin } = useAuth();
    const navigate = useNavigate();

    // Form state
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [clinicCode, setClinicCode] = useState("");
    const [showClinicCode, setShowClinicCode] = useState(false);

    // Smart-login state
    const [orgOptions, setOrgOptions] = useState([]);
    const [showOrgSelector, setShowOrgSelector] = useState(false);
    const [selectingOrg, setSelectingOrg] = useState(false);

    // UX state
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    // ── Smart Login (primary path) ─────────────────────────────
    const handleSmartSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const data = await smartLogin({ email, password });

            if (data.type === "SINGLE_ORG") {
                // Session is FULLY initialized inside smartLogin():
                // token stored, CSRF stored, profile fetched, socket connected.
                // Navigate immediately — DO NOT call completeSmartLogin again.
                navigate("/org/dashboard", { replace: true });
                return;
            }

            if (data.type === "MULTI_ORG") {
                setOrgOptions(data.orgs);
                setShowOrgSelector(true);
            }
        } catch (err) {
            setError(err.response?.data?.message || err.message || "Login failed");
            setPassword("");
        } finally {
            setLoading(false);
        }
    };

    // ── Legacy Clinic Code Login ───────────────────────────────
    const handleLegacySubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            await login({ clinicCode, email, password });
            navigate("/org/dashboard", { replace: true });
        } catch (err) {
            setError(err.response?.data?.message || err.message || "Login failed");
            setPassword("");
        } finally {
            setLoading(false);
        }
    };

    // ── Select Org (step 2 of multi-org) ──────────────────────
    const handleSelectOrg = async (organizationId) => {
        setSelectingOrg(true);
        setError(null);

        try {
            const res = await api.post("/auth/select-org", {
                email,
                password,
                organizationId,
            });
            const { token, csrfToken } = res.data?.data || {};
            if (!token) throw new Error("No token received from server");
            // completeSmartLogin stores token + csrfToken, fetches profile, connects socket
            await completeSmartLogin(token, csrfToken);
            navigate("/org/dashboard", { replace: true });
        } catch (err) {
            setError(err.response?.data?.message || err.message || "Failed to connect to this clinic");
            setSelectingOrg(false);
        }
    };

    const handleBackToLogin = () => {
        setShowOrgSelector(false);
        setOrgOptions([]);
        setError(null);
        setPassword("");
    };

    const activeForm = showClinicCode ? handleLegacySubmit : handleSmartSubmit;

    return (
        <div className="min-h-screen grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr] bg-[#F0F6FF] relative overflow-hidden font-sans">
            {/* Background Layers */}
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-300 opacity-20 rounded-full blur-3xl z-0" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-400 opacity-10 rounded-full blur-3xl z-0" />

            {/* LEFT COLUMN (Branding Section) — hidden on mobile */}
            <div className="hidden md:flex flex-col justify-center px-24 py-16 z-10 w-full h-full">
                <Link to="/" className="flex items-center gap-3 mb-4 w-max hover:opacity-80 transition-opacity">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div className="font-extrabold text-2xl text-slate-800 tracking-tight">DentalSaaS Platform</div>
                </Link>

                <h1 className="text-6xl font-bold leading-tight text-slate-900 mt-2">
                    Welcome Back to<br />
                    <span className="text-blue-600">DentalSaaS</span>
                </h1>

                <p className="mt-6 text-lg text-slate-600">Powering Modern Dental Clinics Worldwide</p>

                <div className="mt-10 space-y-6">
                    <FeatureItem
                        icon={<svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" /></svg>}
                        title="Manage Patients"
                    />
                    <FeatureItem
                        icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                        title="Smart Appointments"
                    />
                    <FeatureItem
                        icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                        title="Billing & Analytics"
                    />
                    <FeatureItem
                        icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
                        title="Secure & HIPAA Compliant"
                    />
                </div>

                <div className="mt-16 bg-white rounded-2xl shadow-xl px-10 py-6 flex gap-12 w-max">
                    <StatsBadge
                        icon={<svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
                        number="250+"
                        label="Clinics"
                    />
                    <StatsBadge
                        icon={<svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
                        number="10k+"
                        label="Patients"
                    />
                    <StatsBadge
                        icon={<svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
                        number="99.9%"
                        label="Secure & Reliable"
                    />
                </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="relative flex items-center justify-center z-10">
                <div className="absolute right-0 top-0 h-full w-[60%] bg-gradient-to-br from-blue-200 to-blue-400 rounded-l-[120px] opacity-20 z-0" />

                <div className="relative z-10 w-full max-w-md px-4">
                    <Card>
                        {/* Logo in card */}
                        <div className="flex justify-center mb-6 mt-1">
                            <Link to="/" className="flex items-center justify-center gap-2 bg-slate-50 px-4 py-2 rounded-full shadow-sm border border-slate-100 hover:bg-slate-100 transition-colors">
                                <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <span className="font-extrabold text-slate-800 text-[15px]">DentalSaaS Platform</span>
                            </Link>
                        </div>

                        {/* ── ORG SELECTOR PANEL ──────────────────── */}
                        {showOrgSelector ? (
                            <div id="org-selector-panel">
                                <div className="text-center mb-6">
                                    <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
                                        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                        </svg>
                                    </div>
                                    <h2 className="text-xl font-semibold text-slate-900">Select Your Clinic</h2>
                                    <p className="text-sm text-slate-500 mt-1">
                                        You have access to {orgOptions.length} clinics
                                    </p>
                                </div>

                                {error && (
                                    <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm font-medium text-red-600 flex items-center gap-2">
                                        <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        {error}
                                    </div>
                                )}

                                <div className="space-y-3">
                                    {orgOptions.map((org) => (
                                        <OrgCard
                                            key={org.organizationId}
                                            org={org}
                                            onSelect={handleSelectOrg}
                                            loading={selectingOrg}
                                        />
                                    ))}
                                </div>

                                <button
                                    type="button"
                                    onClick={handleBackToLogin}
                                    className="mt-6 w-full text-center text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors flex items-center justify-center gap-1"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                                    </svg>
                                    Back to login
                                </button>
                            </div>
                        ) : (
                            /* ── LOGIN FORM ─────────────────────────── */
                            <>
                                <div className="text-center mb-8">
                                    <h2 className="text-2xl font-semibold text-slate-900 mb-1">Sign In to Your Clinic</h2>
                                    <p className="text-sm text-slate-500">Secure • Fast • Reliable</p>
                                </div>

                                <form id="login-form" onSubmit={activeForm} className="space-y-5">
                                    {/* Clinic Code — optional, collapsed by default */}
                                    {showClinicCode && (
                                        <div className="space-y-2">
                                            <Input
                                                id="clinic-code-input"
                                                type="text"
                                                name="clinicCode"
                                                value={clinicCode}
                                                onChange={(e) => setClinicCode(e.target.value)}
                                                required={showClinicCode}
                                                placeholder="Clinic Code (e.g. apex)"
                                                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
                                            />
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <Input
                                            id="email-input"
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                            placeholder="admin@clinic.com"
                                            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Input
                                            id="password-input"
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                            placeholder="••••••••"
                                            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
                                        />
                                    </div>

                                    <div className="flex flex-row justify-between items-center text-sm pt-1">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300" />
                                            <span className="text-slate-600 font-medium">Remember me</span>
                                        </label>
                                        <a href="#" className="font-bold text-blue-600 hover:text-blue-700 transition-colors">
                                            Forgot Password?
                                        </a>
                                    </div>

                                    {error && (
                                        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm font-medium text-red-600 flex items-center gap-2 shadow-sm">
                                            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            {error}
                                        </div>
                                    )}

                                    <div className="pt-2">
                                        <Button id="login-submit-btn" type="submit" disabled={loading}>
                                            {loading ? "Signing in..." : "Sign In to Dashboard"}
                                        </Button>
                                    </div>
                                </form>

                                {/* Clinic code toggle */}
                                <div className="mt-5 text-center">
                                    <button
                                        type="button"
                                        id="toggle-clinic-code"
                                        onClick={() => {
                                            setShowClinicCode((v) => !v);
                                            setError(null);
                                        }}
                                        className="text-xs text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-2"
                                    >
                                        {showClinicCode ? "Hide clinic code" : "Sign in with clinic code instead"}
                                    </button>
                                </div>

                                <div className="flex items-center gap-4 mt-6 mb-6">
                                    <div className="flex-1 border-t border-slate-200" />
                                    <div className="text-sm font-medium text-slate-400">Or sign in with</div>
                                    <div className="flex-1 border-t border-slate-200" />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <button className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 h-12 hover:bg-slate-50 transition font-semibold text-slate-700">
                                        <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                                        Google
                                    </button>
                                    <button className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 h-12 hover:bg-slate-50 transition font-semibold text-slate-700">
                                        <svg className="w-5 h-5" viewBox="0 0 21 21"><path fill="#f25022" d="M0 0h10v10H0z" /><path fill="#7fba00" d="M11 0h10v10H11z" /><path fill="#00a4ef" d="M0 11h10v10H0z" /><path fill="#ffb900" d="M11 11h10v10H11z" /></svg>
                                        Microsoft
                                    </button>
                                </div>

                                <p className="text-center mt-8 text-sm text-slate-500 font-medium">
                                    Don't have an account?{" "}
                                    <Link to="/signup" className="text-blue-600 hover:text-blue-700 font-bold ml-1">
                                        Sign Up
                                    </Link>
                                </p>
                            </>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
}
