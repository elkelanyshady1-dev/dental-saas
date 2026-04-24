import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import api, { publicApi } from "@/services/api";
import { Button, Input, Card } from "@/design-system";
import { 
    ShieldCheck, 
    Zap, 
    ArrowRight, 
    Lock, 
    Mail, 
    ChevronRight,
    Sparkles,
    KeyRound,
    Search
} from "lucide-react";
import OrthoNoeLogo from "@/components/brand/OrthoNoeLogo";
import { BRAND } from "@/config/brand";

// ─── Google SVG Icon ─────────────────────────────────────────────────────────
const GoogleIcon = () => (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
);

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
            className="group w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-slate-100 bg-white transition-all duration-200 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/10 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
            <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 font-bold text-white text-sm shadow-inner transition-transform group-hover:scale-110"
                style={{ background: org.primaryColor || "#3b82f6" }}
            >
                {org.logoUrl ? (
                    <img src={org.logoUrl} alt={org.name} className="w-full h-full object-contain rounded-xl" />
                ) : (
                    initials
                )}
            </div>
            <div className="flex-1 text-left">
                <div className="font-bold text-slate-800 text-[15px] group-hover:text-blue-700 transition-colors tracking-tight">
                    {org.name}
                </div>
                {org.slug && (
                    <div className="text-xs text-slate-400 font-medium">@{org.slug}</div>
                )}
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-transform group-hover:translate-x-1" />
        </button>
    );
}

// ─── Main Login Page — Email-First Auth ──────────────────────────────────────
export default function LoginPage() {
    const { login, smartLogin, completeSmartLogin } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // Auth mode: "magic" (default), "password"
    const [authMode, setAuthMode] = useState("magic");

    // Form state
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [clinicCode, setClinicCode] = useState("");
    const [showClinicCode, setShowClinicCode] = useState(false);

    // Magic link state
    const [magicSent, setMagicSent] = useState(false);
    const [magicLoading, setMagicLoading] = useState(false);

    // Smart-login state
    const [orgOptions, setOrgOptions] = useState([]);
    const [showOrgSelector, setShowOrgSelector] = useState(false);
    const [selectingOrg, setSelectingOrg] = useState(false);

    // UX state
    const [error, setError] = useState(searchParams.get("error") ? "Authentication failed. Please try again." : null);
    const [loading, setLoading] = useState(false);

    // ── Magic Link ─────────────────────────────────────────────
    const handleMagicLink = async (e) => {
        e.preventDefault();
        setMagicLoading(true);
        setError(null);

        try {
            await publicApi.post("/auth/magic-link", { email });
            setMagicSent(true);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to send magic link.");
        } finally {
            setMagicLoading(false);
        }
    };

    // ── Smart Login (password path) ─────────────────────────────
    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const data = await smartLogin({ email, password });

            if (data.type === "SINGLE_ORG") {
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

    // ── Legacy Clinic Code Login ────────────────────────────────
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

    // ── Google Login ─────────────────────────────────────────
    const handleGoogleLogin = () => {
        const backendUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";
        window.location.href = `${backendUrl.replace(/\/api$/, "")}/api/auth/google`;
    };

    const activeForm = showClinicCode ? handleLegacySubmit : handlePasswordSubmit;

    return (
        <div className="min-h-screen grid lg:grid-cols-[1fr_1.2fr] bg-white font-sans overflow-hidden">
            
            {/* LEFT COLUMN: BRAND & VALUE */}
            <div className="hidden lg:flex flex-col justify-between p-16 bg-slate-900 relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.15),transparent)] pointer-events-none" />
                
                <Link to="/" className="flex items-center gap-3 relative z-10 transition-opacity hover:opacity-80">
                    <OrthoNoeLogo className="w-10 h-10" variant="mono-light" />
                    <span className="text-2xl font-black text-white tracking-tighter">{BRAND.name}</span>
                </Link>

                <div className="relative z-10 max-w-lg">
                    <div className="inline-flex items-center gap-2 bg-blue-500/10 text-blue-400 px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase mb-8 border border-white/5">
                        <Lock className="w-4 h-4" />
                        Secure Practitioner Access
                    </div>
                    
                    <h1 className="text-[52px] font-black text-white leading-[1.05] mb-8 tracking-tight">
                        Experience <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">Clinical </span> <br />
                        Excellence.
                    </h1>

                    <div className="space-y-6">
                        <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm shadow-xl">
                            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0">
                                <Zap className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-white font-bold text-sm">Real-time Synchronization</p>
                                <p className="text-slate-400 text-xs">Clinical state mirrored across all branches instantly.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm shadow-xl">
                            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shrink-0">
                                <ShieldCheck className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-white font-bold text-sm">HIPAA & GDPR Compliant</p>
                                <p className="text-slate-400 text-xs">Patient records hardened by AES-256 cloud encryption.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 text-[10px] font-bold text-slate-500 tracking-[0.2em] uppercase">
                    {BRAND.copyright}
                </div>
            </div>

            {/* RIGHT COLUMN: LOGIN FORM */}
            <div className="flex flex-col justify-center items-center px-6 py-12 lg:px-20 relative">
                {/* Mobile Logo */}
                <div className="flex lg:hidden justify-center mb-12">
                    <Link to="/" className="flex items-center gap-2">
                        <OrthoNoeLogo className="w-8 h-8" />
                        <span className="text-xl font-black text-slate-900 tracking-tight">{BRAND.name}</span>
                    </Link>
                </div>

                <Card className="w-full max-w-md shadow-2xl shadow-slate-200/50 rounded-3xl border-slate-100 p-8 md:p-10 animate-in fade-in zoom-in-95 duration-500">
                    {/* Logo in card */}
                    <div className="flex justify-center mb-10">
                        <Link to="/" className="flex flex-col items-center gap-2 group">
                            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center transition-transform group-hover:scale-110">
                                <OrthoNoeLogo className="w-10 h-10" />
                            </div>
                            <span className="font-black text-slate-900 text-lg tracking-tighter">{BRAND.name}</span>
                        </Link>
                    </div>

                    {showOrgSelector ? (
                        /* ── ORG SELECTOR ────────────────────────── */
                        <div id="org-selector-panel" className="animate-in slide-in-from-right-4 duration-300">
                            <div className="text-center mb-8">
                                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Select Clinic</h2>
                                <p className="text-sm font-medium text-slate-400 mt-1">You belong to multiple organizations.</p>
                            </div>

                            {error && (
                                <div className="mb-6 bg-red-50 text-red-600 p-4 rounded-2xl text-xs font-bold border border-red-100">
                                    {error}
                                </div>
                            )}

                            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
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
                                className="mt-8 w-full py-4 rounded-2xl border-2 border-slate-100 text-sm font-black text-slate-500 hover:text-slate-900 hover:border-slate-200 transition-all flex items-center justify-center gap-2"
                            >
                                <ChevronRight className="w-4 h-4 rotate-180" />
                                Back to login
                            </button>
                        </div>

                    ) : magicSent ? (
                        /* ── MAGIC LINK SENT ────────────────────── */
                        <div className="text-center animate-in fade-in zoom-in-95 duration-500">
                            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-emerald-50 flex items-center justify-center">
                                <Mail className="w-8 h-8 text-emerald-600" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Check Your Email</h2>
                            <p className="text-sm text-slate-500 mb-2">
                                We've sent a magic sign-in link to
                            </p>
                            <p className="text-sm font-black text-blue-600 mb-6">{email}</p>
                            <p className="text-xs text-slate-400 mb-8">
                                The link expires in 10 minutes. Click it to sign in instantly.
                            </p>

                            <div className="space-y-3">
                                <button
                                    type="button"
                                    onClick={() => { setMagicSent(false); setAuthMode("password"); }}
                                    className="w-full py-3.5 rounded-2xl border-2 border-slate-100 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                                >
                                    <KeyRound className="w-4 h-4" />
                                    Use password instead
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMagicSent(false)}
                                    className="w-full text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors py-2"
                                >
                                    Try a different email
                                </button>
                            </div>
                        </div>

                    ) : (
                        /* ── LOGIN FORM ─────────────────────────── */
                        <div className="animate-in slide-in-from-left-4 duration-300">
                            <div className="text-center mb-8">
                                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Welcome Back</h2>
                                <p className="text-sm font-medium text-slate-400 mt-1">Sign in to manage your practice.</p>
                            </div>

                            {/* ── Auth Mode Toggle ────────────────── */}
                            <div className="flex items-center p-1 bg-slate-50 rounded-2xl mb-6">
                                <button
                                    type="button"
                                    onClick={() => { setAuthMode("magic"); setError(null); }}
                                    className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                                        authMode === "magic"
                                            ? "bg-white text-blue-600 shadow-sm"
                                            : "text-slate-400 hover:text-slate-600"
                                    }`}
                                >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    Magic Link
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setAuthMode("password"); setError(null); }}
                                    className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                                        authMode === "password"
                                            ? "bg-white text-blue-600 shadow-sm"
                                            : "text-slate-400 hover:text-slate-600"
                                    }`}
                                >
                                    <KeyRound className="w-3.5 h-3.5" />
                                    Password
                                </button>
                            </div>

                            {authMode === "magic" ? (
                                /* ── MAGIC LINK FORM ─────────────── */
                                <form id="magic-link-form" onSubmit={handleMagicLink} className="space-y-5">
                                    <Input
                                        id="email-input"
                                        label="Practitioner Email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        placeholder="doctor@clinic.com"
                                        icon={<Mail className="w-4 h-4 text-slate-400" />}
                                    />

                                    {error && (
                                        <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-xs font-bold border border-red-100 flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0" />
                                            {error}
                                        </div>
                                    )}

                                    <Button id="magic-submit-btn" type="submit" disabled={magicLoading} className="h-14 font-black text-lg">
                                        {magicLoading ? "Sending..." : "Send Magic Link"}
                                        {!magicLoading && <Sparkles className="w-5 h-5 ml-2" />}
                                    </Button>
                                </form>
                            ) : (
                                /* ── PASSWORD FORM ────────────────── */
                                <form id="login-form" onSubmit={activeForm} className="space-y-5">
                                    {showClinicCode && (
                                        <Input
                                            id="clinic-code-input"
                                            label="Clinic Identifier"
                                            name="clinicCode"
                                            value={clinicCode}
                                            onChange={(e) => setClinicCode(e.target.value)}
                                            required={showClinicCode}
                                            placeholder="e.g. city-ortho"
                                            icon={<Search className="w-4 h-4 text-slate-400" />}
                                        />
                                    )}

                                    <Input
                                        id="email-input"
                                        label="Practitioner Email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        placeholder="doctor@clinic.com"
                                        icon={<Mail className="w-4 h-4 text-slate-400" />}
                                    />

                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center px-1">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Password</label>
                                            <Link to="/forgot-password" id="forgot-password-link" className="text-xs font-black text-blue-600 hover:underline">Reset?</Link>
                                        </div>
                                        <Input
                                            id="password-input"
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                            placeholder="••••••••"
                                            icon={<Lock className="w-4 h-4 text-slate-400" />}
                                        />
                                    </div>

                                    {error && (
                                        <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-xs font-bold border border-red-100 flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0" />
                                            {error}
                                        </div>
                                    )}

                                    <Button id="login-submit-btn" type="submit" disabled={loading} className="h-14 font-black text-lg">
                                        {loading ? "Authenticating..." : "Sign In"}
                                        {!loading && <ArrowRight className="w-5 h-5 ml-2" />}
                                    </Button>

                                    <div className="text-center">
                                        <button
                                            type="button"
                                            id="toggle-clinic-code"
                                            onClick={() => {
                                                setShowClinicCode((v) => !v);
                                                setError(null);
                                            }}
                                            className="text-[11px] font-black text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-widest underline underline-offset-4"
                                        >
                                            {showClinicCode ? "Hide Identifier" : "Sign in with Clinic Identifier"}
                                        </button>
                                    </div>
                                </form>
                            )}

                            {/* ── Divider ─────────────────────────── */}
                            <div className="flex items-center gap-4 my-8">
                                <div className="flex-1 h-px bg-slate-100" />
                                <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Or Continue With</span>
                                <div className="flex-1 h-px bg-slate-100" />
                            </div>

                            {/* ── Google Auth ─────────────────────── */}
                            <button
                                id="google-login-btn"
                                type="button"
                                onClick={handleGoogleLogin}
                                className="w-full flex items-center justify-center gap-3 rounded-2xl border-2 border-slate-100 h-14 hover:bg-slate-50 hover:border-slate-200 transition-all font-bold text-slate-700 text-sm"
                            >
                                <GoogleIcon />
                                Continue with Google
                            </button>

                            {/* ── Footer links ────────────────────── */}
                            <div className="mt-10 bg-slate-50 p-4 rounded-2xl flex items-center justify-between">
                                <p className="text-xs font-bold text-slate-500">New practice?</p>
                                <Link to="/signup" className="text-xs font-black text-blue-600 hover:underline">Start 30-Day Free Trial</Link>
                            </div>

                            <div className="mt-8 flex items-center justify-center gap-4 border-t border-slate-100 pt-6">
                                <Link to="/terms" className="text-[10px] font-bold text-slate-400 hover:text-blue-600 uppercase tracking-widest">Terms</Link>
                                <span className="w-1 h-1 rounded-full bg-slate-200" />
                                <Link to="/privacy" className="text-[10px] font-bold text-slate-400 hover:text-blue-600 uppercase tracking-widest">Privacy</Link>
                            </div>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
