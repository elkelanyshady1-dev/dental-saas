import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { setAccessToken, setCsrfToken, publicApi } from "@/services/api";
import { Button, Input, Card } from "@/design-system";
import { 
    ShieldCheck, 
    Zap, 
    Layers, 
    CheckCircle2, 
    X, 
    ExternalLink, 
    Lock, 
    Mail, 
    Globe, 
    CreditCard,
    ArrowRight,
    ArrowLeft
} from "lucide-react";
import OrthoNoeLogo from "@/components/brand/OrthoNoeLogo";

// ─── Password Complexity ───────────────────────────────────────────────────
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const PASSWORD_RULES = [
    { test: (v) => v.length >= 8,             label: "At least 8 characters" },
    { test: (v) => /[A-Z]/.test(v),           label: "One uppercase letter" },
    { test: (v) => /\d/.test(v),              label: "One number" },
    { test: (v) => /[^A-Za-z0-9]/.test(v),    label: "One special character" },
];

const STEPS = [
    { key: "email", label: "Verify Email" },
    { key: "emailOtp", label: "Email Code" },
    { key: "plan", label: "Choose Plan" },
    { key: "details", label: "Account Details" },
];

const MODULE_LABELS = {
    patients: "Patient Management",
    appointments: "Appointment Scheduling",
    finance: "Financial Accounting",
    inventory: "Inventory Management",
    lab: "Laboratory Case Tracking",
    orthodonticsAdv: "Advanced Orthodontics",
    communication: "Patient Communications",
    analytics: "Analytics & Reporting",
    booking: "Online Booking",
};

const CURRENCY_SYMBOLS = {
    USD: "$", GBP: "£", EGP: "E£", SAR: "﷼", AED: "د.إ",
    KWD: "KD", QAR: "QR", BHD: "BD", OMR: "OMR",
};

function formatPrice(amount, currency) {
    if (amount == null) return null;
    const sym = CURRENCY_SYMBOLS[currency] || currency + " ";
    return `${sym}${Number(amount).toLocaleString()}`;
}

// ─── Modal Component for Terms/Privacy ──────────────────────────────────────
function LegalModal({ isOpen, onClose, title, content }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xl font-bold text-slate-900">{title}</h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
                <div className="p-8 overflow-y-auto prose prose-slate prose-sm max-w-none">
                    {content}
                </div>
                <div className="p-6 border-t border-slate-100 flex justify-end">
                    <Button onClick={onClose} className="w-auto px-8">Close</Button>
                </div>
            </div>
        </div>
    );
}

// ─── Benefit Item ──────────────────────────────────────────────────────────
function BenefitItem({ icon, title, description, color = "blue" }) {
    const colorClasses = {
        blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        amber: "bg-amber-500/10 text-amber-400 border-amber-500/20"
    };

    return (
        <div className="flex gap-4 group">
            <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 duration-300 ${colorClasses[color]}`}>
                {icon}
            </div>
            <div>
                <h4 className="font-bold text-white mb-1">{title}</h4>
                <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
            </div>
        </div>
    );
}

// ─── Step Progress Bar (Aligned & Connected) ──────────────────────────────
function StepProgress({ currentIndex }) {
    return (
        <div className="relative mb-12">
            {/* Background Line */}
            <div className="absolute top-5 left-0 w-full h-[2px] bg-slate-100 z-0" />
            
            {/* Active Progress Line */}
            <div 
                className="absolute top-5 left-0 h-[2px] bg-blue-600 transition-all duration-500 z-0" 
                style={{ width: `${(currentIndex / (STEPS.length - 1)) * 100}%` }}
            />

            <div className="relative z-10 flex items-start justify-between">
                {STEPS.map((step, idx) => {
                    const isActive = idx === currentIndex;
                    const isCompleted = idx < currentIndex;
                    
                    return (
                        <div key={step.key} className="flex flex-col items-center flex-1">
                            <div className={`
                                w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold transition-all duration-300
                                ${isCompleted ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" :
                                  isActive ? "bg-blue-600 text-white shadow-xl shadow-blue-500/30 ring-4 ring-blue-50" :
                                  "bg-white text-slate-400 border-2 border-slate-100"}
                            `}>
                                {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
                            </div>
                            <span className={`mt-3 text-[10px] font-black uppercase tracking-wider text-center max-w-[80px] leading-tight ${
                                isActive ? "text-blue-600" : isCompleted ? "text-emerald-600" : "text-slate-400"
                            }`}>
                                {step.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Form Steps ─────────────────────────────────────────────────────────────

function EmailStep({ formData, onChange, onNext, loading, error }) {
    return (
        <form onSubmit={(e) => { e.preventDefault(); onNext(); }} className="space-y-6">
            <div className="space-y-2">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Get Started</h2>
                <p className="text-slate-500 text-[15px]">Enter your business email to begin setting up your clinic.</p>
            </div>

            <div className="space-y-4">
                <Input
                    label="Business Email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={onChange}
                    required
                    placeholder="dr.doe@ortho.com"
                    icon={<Mail className="w-4 h-4 text-slate-400" />}
                />
            </div>

            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm font-semibold border border-red-100 animate-in fade-in slide-in-from-top-2">
                    {error}
                </div>
            )}

            <Button type="submit" disabled={loading} className="h-14 text-[16px] font-bold">
                {loading ? "Sending verification..." : "Verify Email"}
                {!loading && <ArrowRight className="w-5 h-5 ml-2" />}
            </Button>
        </form>
    );
}

function OtpStep({ formData, onChange, onNext, onBack, onResend, loading, error, expiresIn, resendLoading }) {
    const [countdown, setCountdown] = useState(expiresIn || 600);
    
    useEffect(() => {
        setCountdown(expiresIn || 600);
    }, [expiresIn]);

    useEffect(() => {
        if (countdown <= 0) return;
        const timer = setInterval(() => setCountdown(c => c - 1), 1000);
        return () => clearInterval(timer);
    }, [countdown]);

    useEffect(() => {
        if (formData.otp.length === 6 && !loading) onNext();
    }, [formData.otp, loading, onNext]);

    const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

    return (
        <form onSubmit={(e) => { e.preventDefault(); onNext(); }} className="space-y-6">
            <div className="space-y-2">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Phone OTP</h2>
                <p className="text-slate-500 text-[15px]">
                    Enter the 6-digit code sent to <span className="font-bold text-slate-900">{formData.phoneNumber}</span>
                </p>
            </div>

            <div className="flex justify-center">
                <input
                    type="text"
                    inputMode="numeric"
                    name="otp"
                    value={formData.otp}
                    onChange={(e) => onChange({ target: { name: "otp", value: e.target.value.replace(/\D/g, "").slice(0, 6) } })}
                    required
                    maxLength={6}
                    placeholder="0 0 0 0 0 0"
                    autoFocus
                    className="w-full h-20 rounded-2xl border-2 border-slate-100 px-4 text-slate-900 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 text-center text-4xl tracking-[0.4em] font-black transition-all"
                />
            </div>

            <div className="flex flex-col items-center gap-4">
                {countdown > 0 ? (
                    <p className="text-sm font-bold text-slate-400">
                        Expires in <span className="text-blue-600">{formatTime(countdown)}</span>
                    </p>
                ) : (
                    <button type="button" onClick={onResend} disabled={resendLoading} className="text-sm font-bold text-blue-600 hover:underline">
                        {resendLoading ? "Resending..." : "Resend Phone Code"}
                    </button>
                )}
            </div>

            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm font-semibold border border-red-100">
                    {error}
                </div>
            )}

            <Button type="submit" disabled={loading || countdown <= 0 || formData.otp.length < 6} className="h-14">
                {loading ? "Verifying..." : "Verify Code"}
            </Button>

            <button type="button" onClick={onBack} className="w-full text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors">
                Change phone number
            </button>
        </form>
    );
}

function EmailOtpStep({ formData, onChange, onNext, onResend, loading, error, resendLoading }) {
    const [countdown, setCountdown] = useState(600);
    
    useEffect(() => {
        if (countdown <= 0) return;
        const timer = setInterval(() => setCountdown(c => c - 1), 1000);
        return () => clearInterval(timer);
    }, [countdown]);

    useEffect(() => {
        if (formData.emailOtp.length === 6 && !loading) onNext();
    }, [formData.emailOtp, loading, onNext]);

    const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

    return (
        <form onSubmit={(e) => { e.preventDefault(); onNext(); }} className="space-y-6">
            <div className="space-y-2">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Email Verification</h2>
                <p className="text-slate-500 text-[15px]">
                    We've sent a code to <span className="font-bold text-slate-900">{formData.email}</span>
                </p>
            </div>

            <div className="flex justify-center">
                <input
                    type="text"
                    inputMode="numeric"
                    name="emailOtp"
                    value={formData.emailOtp}
                    onChange={(e) => onChange({ target: { name: "emailOtp", value: e.target.value.replace(/\D/g, "").slice(0, 6) } })}
                    required
                    maxLength={6}
                    placeholder="0 0 0 0 0 0"
                    autoFocus
                    className="w-full h-20 rounded-2xl border-2 border-slate-100 px-4 text-slate-900 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 text-center text-4xl tracking-[0.4em] font-black transition-all"
                />
            </div>

            <div className="text-center">
                <button type="button" onClick={() => { onResend(); setCountdown(600); }} disabled={resendLoading} className="text-sm font-bold text-blue-600 hover:underline">
                    {resendLoading ? "Resending..." : countdown > 0 ? `Resend available in ${formatTime(countdown)}` : "Resend Email Code"}
                </button>
            </div>

            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm font-semibold border border-red-100">
                    {error}
                </div>
            )}

            <Button type="submit" disabled={loading || formData.emailOtp.length < 6} className="h-14">
                {loading ? "Verifying..." : "Confirm Email"}
            </Button>
        </form>
    );
}

function PlanStep({ plans, currency, isAnnual, onToggleInterval, onSelectPlan, detectedCountry, loading, error }) {
    if (loading) return <div className="space-y-4 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-24 bg-slate-100 rounded-3xl" />)}</div>;

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Select Base Plan</h2>
                <p className="text-slate-500 text-[15px]">
                    Optimized pricing detected for <span className="font-bold text-blue-600">{detectedCountry}</span>
                </p>
            </div>

            <div className="flex items-center justify-center p-1 bg-slate-100 rounded-2xl w-max mx-auto">
                <button onClick={() => !isAnnual && onToggleInterval()} className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${!isAnnual ? "bg-white text-blue-600 shadow-sm" : "text-slate-400"}`}>Monthly</button>
                <button onClick={() => isAnnual && onToggleInterval()} className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${isAnnual ? "bg-white text-blue-600 shadow-sm" : "text-slate-400"}`}>Annual (2 Months Free)</button>
            </div>

            <div className="grid gap-4">
                {plans.map(plan => (
                    <button
                        key={plan.id}
                        onClick={() => onSelectPlan(plan)}
                        className="p-6 rounded-3xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50/30 text-left transition-all group"
                    >
                        <div className="flex justify-between items-center mb-1">
                            <h3 className="font-black text-slate-900 group-hover:text-blue-600">{plan.name}</h3>
                            <span className="text-xl font-black text-slate-900">{formatPrice(isAnnual ? plan.annualPrice : plan.monthlyPrice, currency)}<span className="text-xs text-slate-400 ml-1">/mo</span></span>
                        </div>
                        <p className="text-xs text-slate-500">{plan.description}</p>
                    </button>
                ))}
            </div>
        </div>
    );
}

function DetailsStep({ formData, onChange, onSubmit, onBack, loading, error, selectedPlan, openTerms, openPrivacy }) {
    const pw = formData.password;
    const passwordValid = PASSWORD_REGEX.test(pw);
    const [accepted, setAccepted] = useState(false);

    return (
        <form onSubmit={(e) => { e.preventDefault(); if(accepted) onSubmit(e); }} className="space-y-6">
            <div className="space-y-2">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Final Setup</h2>
                <p className="text-slate-500 text-[15px]">Last step to launch your <span className="font-bold text-blue-600">{selectedPlan?.name}</span> clinic.</p>
            </div>

            <div className="grid gap-4">
                <Input
                    label="Clinic/Organization Name"
                    name="organizationName"
                    value={formData.organizationName}
                    onChange={onChange}
                    required
                    placeholder="e.g. Apex Orthodontics"
                    icon={<Layers className="w-4 h-4 text-slate-400" />}
                />
                <Input
                    label="Lead Practitioner Name"
                    name="fullName"
                    value={formData.fullName}
                    onChange={onChange}
                    required
                    placeholder="Dr. Sarah Johnson"
                    icon={<CheckCircle2 className="w-4 h-4 text-slate-400" />}
                />
                <div>
                    <Input
                        label="Secure Password"
                        type="password"
                        name="password"
                        value={formData.password}
                        onChange={onChange}
                        required
                        placeholder="••••••••"
                        icon={<Lock className="w-4 h-4 text-slate-400" />}
                    />
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        {PASSWORD_RULES.map((rule, idx) => {
                            const passed = rule.test(pw);
                            return (
                                <div key={idx} className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider ${passed ? "text-emerald-500" : "text-slate-300"}`}>
                                    {passed ? <CheckCircle2 className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-slate-200" />}
                                    {rule.label}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                        type="checkbox"
                        checked={accepted}
                        onChange={(e) => setAccepted(e.target.checked)}
                        className="mt-1 w-5 h-5 rounded-lg border-2 border-slate-200 text-blue-600 focus:ring-blue-100 transition-all cursor-pointer"
                    />
                    <span className="text-sm text-slate-600 leading-snug">
                        I agree to the 
                        <button type="button" onClick={openTerms} className="mx-1 text-blue-600 font-bold hover:underline">Terms of Service</button>
                        and 
                        <button type="button" onClick={openPrivacy} className="ml-1 text-blue-600 font-bold hover:underline">Privacy Policy</button>.
                        I understand these contain clinical disclaimers for AI use.
                    </span>
                </label>
            </div>

            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm font-semibold border border-red-100">
                    {error}
                </div>
            )}

            <Button type="submit" disabled={loading || !passwordValid || !accepted} className="h-14 font-black text-lg">
                {loading ? "Launching Clinic..." : "Claim My Dashboard"}
            </Button>

            <button type="button" onClick={onBack} className="w-full text-sm font-bold text-slate-400">← Change plan</button>
        </form>
    );
}

// ─── Main Page Redesign ───────────────────────────────────────────────────

export default function SignupPage() {
    const navigate = useNavigate();
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    
    // Legal Modals
    const [legalModal, setLegalModal] = useState({ open: false, title: "", content: null });

    const openLegal = (type) => {
        const content = type === "terms" ? (
            <div className="space-y-4">
                <p><strong>1. Introduction</strong>: OrthoNoe is a cloud-based orthodontic management platform...</p>
                <p><strong>2. Clinical Disclaimer</strong>: The platform's AI tools (CephAI, 3D Scan Analysis) are decision-support only and do not replace professional judgment.</p>
                <p><strong>3. Data Isolation</strong>: We use a database-per-tenant architecture ensuring complete privacy.</p>
                <p><strong>4. Billing</strong>: Subscriptions are billed upfront; usage fees are billed in arrears.</p>
                <p><strong>Full document available in your dashboard post-signup.</strong></p>
            </div>
        ) : (
            <div className="space-y-4">
                <p><strong>1. Data Security</strong>: All clinical records are encrypted with AES-256 and stored in compliant cloud infrastructure.</p>
                <p><strong>2. Patient Privacy</strong>: Clinics act as data controllers; OrthoNoe acts as the data processor.</p>
                <p><strong>3. Audit Logs</strong>: Every clinical action is timestamped and logged for forensic auditing.</p>
                <p><strong>Detailed privacy practices are HIPAA/GDPR aligned.</strong></p>
            </div>
        );
        setLegalModal({ open: true, title: type === "terms" ? "Terms of Service" : "Privacy Policy", content });
    };

    const [formData, setFormData] = useState({
        email: "",
        phoneNumber: "",
        otp: "",
        emailOtp: "",
        organizationName: "",
        fullName: "",
        password: "",
    });

    const [otpExpiresIn, setOtpExpiresIn] = useState(600);
    const [pricingToken, setPricingToken] = useState(null);
    const [detectedCountry, setDetectedCountry] = useState(null);
    const [detectedRegion, setDetectedRegion] = useState(null);
    const [plans, setPlans] = useState([]);
    const [planCurrency, setPlanCurrency] = useState("USD");
    const [isAnnual, setIsAnnual] = useState(true);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [plansLoading, setPlansLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // ── Logic Handlers (Preserved from original) ──────────────────────────

    const handleRequestEmailOtp = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await publicApi.post("/public/request-otp", {
                email: formData.email,
            });
            if (res.data.success) {
                setStep(1);
            }
        } catch (err) {
            setError(err.response?.data?.message || "Failed to send verification code.");
        } finally {
            setLoading(false);
        }
    }, [formData.email]);

    const handleVerifyEmailOtp = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await publicApi.post("/public/verify-email-otp", {
                email: formData.email,
                otp: formData.emailOtp,
            });
            if (res.data.success) {
                // Detect country from email domain or API response
                setDetectedCountry(res.data.country || "Global");
                setDetectedRegion(res.data.region);
                setStep(2);
                setPlansLoading(true);
                try {
                    const planRes = await publicApi.get(`/public/plans?country=${res.data.country || "Global"}`, {
                        headers: pricingToken ? { "X-Pricing-Token": pricingToken } : {},
                    });
                    if (planRes.data.success) {
                        setPlans(planRes.data.data || []);
                        setPlanCurrency(planRes.data.currency || "USD");
                    }
                } catch {
                    setError("Regional pricing load failed. Please retry.");
                } finally {
                    setPlansLoading(false);
                }
            }
        } catch (err) {
            setError(err.response?.data?.message || "Invalid email code.");
        } finally {
            setLoading(false);
        }
    }, [formData.email, formData.emailOtp, pricingToken]);


    const handleSelectPlan = (plan) => { setSelectedPlan(plan); setStep(3); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const idempotencyKey = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
            const res = await publicApi.post("/public/signup", {
                ...formData,
                pricingToken,
                selectedPlanCode: selectedPlan?.code || null
            }, { headers: { "Idempotency-Key": idempotencyKey } });

            if (res.data.success) {
                setSuccess(true);
                setLoading(false);
                const clinicCode = res.data.data?.slug || res.data.data?.clinicCode;
                if (clinicCode) {
                    try {
                        const loginRes = await api.post("/auth/login", {
                            clinicCode,
                            email: formData.email,
                            password: formData.password,
                        });
                        setAccessToken(loginRes.data.token);
                        setCsrfToken(loginRes.data.csrfToken);
                        setTimeout(() => navigate("/org/dashboard", { replace: true }), 2000);
                    } catch { navigate("/login"); }
                } else { navigate("/login"); }
            }
        } catch (err) {
            setError(err.response?.data?.message || "Final account creation failed.");
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-700">
                <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-8">
                    <CheckCircle2 className="w-12 h-12" />
                </div>
                <h1 className="text-4xl font-black text-slate-900 mb-2">Welcome to OrthoNoe!</h1>
                <p className="text-slate-500 font-medium text-lg">Your workspace is being provisioned. This usually takes <span className="text-blue-600 font-bold">15-30 seconds</span>.</p>
                <div className="mt-10 w-48 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 animate-progress" style={{ width: "60%" }} />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen grid lg:grid-cols-[1fr_1.2fr] bg-white font-sans overflow-hidden">
            
            {/* LEFT COLUMN: BRAND & PROOF */}
            <div className="hidden lg:flex flex-col justify-between p-16 bg-slate-900 relative overflow-hidden">
                {/* Background Decor */}
                <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.15),transparent)] pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />

                <Link to="/" className="flex items-center gap-3 relative z-10 transition-opacity hover:opacity-80">
                    <OrthoNoeLogo className="w-10 h-10" variant="mono-light" />
                    <span className="text-2xl font-black text-white tracking-tighter">OrthoNoe</span>
                </Link>

                <div className="relative z-10 max-w-lg">
                    <h1 className="text-[52px] font-black text-white leading-[1.05] mb-8 tracking-tight">
                        Transforming <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">Orthodontic</span> <br />
                        Practice.
                    </h1>
                    
                    <div className="space-y-10">
                        <BenefitItem 
                            icon={<Zap className="w-6 h-6" />}
                            title="CephAI Automated Tracing"
                            description="Instant landmark detection and analysis using state-of-the-art HRNet-W32 architecture."
                        />
                        <BenefitItem 
                            icon={<Layers className="w-6 h-6" />}
                            color="emerald"
                            title="3D Clinical Workflows"
                            description="Deep integration with STL model viewers and visit-centric treatment planning."
                        />
                        <BenefitItem 
                            icon={<ShieldCheck className="w-6 h-6" />}
                            color="amber"
                            title="Enterprise-Grade Security"
                            description="Zero-trust architecture with database-per-tenant isolation for absolute privacy."
                        />
                    </div>
                </div>

                <div className="relative z-10 pt-12 border-t border-white/10 flex items-center justify-between">
                    <div className="flex -space-x-3">
                        {[1,2,3,4].map(i => <div key={i} className="w-10 h-10 rounded-full border-2 border-slate-900 bg-slate-800 flex items-center justify-center text-[10px] font-bold text-white shadow-xl">DR</div>)}
                        <div className="w-10 h-10 rounded-full border-2 border-slate-900 bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white shadow-xl">+500</div>
                    </div>
                    <div className="text-right">
                        <p className="text-white font-bold text-sm">Trusted by Clinics</p>
                        <p className="text-slate-400 text-xs">Across 12 Global Regions</p>
                    </div>
                </div>
            </div>

            {/* RIGHT COLUMN: FORM WIZARD */}
            <div className="flex flex-col min-h-screen overflow-y-auto px-6 py-12 lg:px-20 lg:py-24 relative">
                {/* Mobile Logo */}
                <div className="flex lg:hidden justify-center mb-12">
                    <Link to="/" className="flex items-center gap-2">
                        <OrthoNoeLogo className="w-8 h-8" />
                        <span className="text-xl font-black text-slate-900 tracking-tight">OrthoNoe</span>
                    </Link>
                </div>

                <div className="max-w-md w-full mx-auto">
                    <StepProgress currentIndex={step} />

                    <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                        {step === 0 && <EmailStep formData={formData} onChange={handleChange} onNext={handleRequestEmailOtp} loading={loading} error={error} />}
                        {step === 1 && <EmailOtpStep formData={formData} onChange={handleChange} onNext={handleVerifyEmailOtp} onResend={handleRequestEmailOtp} loading={loading} error={error} />}
                        {step === 2 && <PlanStep plans={plans} currency={planCurrency} isAnnual={isAnnual} onToggleInterval={() => setIsAnnual(!isAnnual)} onSelectPlan={handleSelectPlan} detectedCountry={detectedCountry} loading={plansLoading} error={error} />}
                        {step === 3 && <DetailsStep formData={formData} onChange={handleChange} onSubmit={handleSubmit} onBack={() => setStep(2)} loading={loading} error={error} selectedPlan={selectedPlan} openTerms={() => openLegal("terms")} openPrivacy={() => openLegal("privacy")} />}
                    </div>

                    <div className="mt-12 pt-8 border-t border-slate-100 flex items-center justify-between">
                        <p className="text-sm font-bold text-slate-500">Already Have an account?</p>
                        <Link to="/login" className="px-6 py-2.5 rounded-xl border-2 border-slate-100 font-bold text-sm text-slate-900 hover:bg-slate-50 transition-colors">Sign In</Link>
                    </div>
                </div>

                <p className="mt-12 text-center text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em]">
                    &copy; {new Date().getFullYear()} OrthoNoe Platform Inc. Security First.
                </p>
            </div>

            {/* LEGAL MODAL */}
            <LegalModal 
                isOpen={legalModal.open} 
                onClose={() => setLegalModal(p => ({ ...p, open: false }))} 
                title={legalModal.title} 
                content={legalModal.content} 
            />
        </div>
    );
}

