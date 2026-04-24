/**
 * PortalSetupPage.jsx — Patient Onboarding (Phase 6)
 *
 * Route: /portal/setup
 * Access: Via setup link → PortalMagicLinkPage redirects here with state
 *
 * Flow:
 *   1. Read setupToken + patient data from location.state
 *   2. Show pre-filled form (name, phone, email from backend)
 *   3. Patient sets password + fills medical history
 *   4. Submit → POST /portal/setup/complete
 *   5. Auto-login with returned JWT → redirect to dashboard
 *
 * Public page — no auth guard.
 */

import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { portalAccessApi } from "../services/portalAccess.api";
import { BRAND } from "@/config/brand";

const CHRONIC_OPTIONS = [
    "Diabetes", "Hypertension", "Heart Disease", "Asthma",
    "Epilepsy", "Thyroid Disorder", "Bleeding Disorder", "Hepatitis",
];

const ALLERGY_OPTIONS = [
    "Penicillin", "Aspirin", "Latex", "Local Anesthesia",
    "Ibuprofen", "Sulfa Drugs", "Other",
];

export default function PortalSetupPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { setupToken, patient, organizationId } = location.state || {};

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPwd, setShowPwd] = useState(false);
    const [chronicConditions, setChronicConditions] = useState([]);
    const [allergies, setAllergies] = useState([]);
    const [medications, setMedications] = useState("");
    const [smoking, setSmoking] = useState(false);
    const [pregnancy, setPregnancy] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [step, setStep] = useState(1); // 1: password, 2: medical history

    // Guard: Must have arrived via magic link verification
    useEffect(() => {
        if (!setupToken || !organizationId) {
            navigate("/portal/login", { replace: true });
        }
    }, [setupToken, organizationId, navigate]);

    const toggleItem = (list, setter, item) => {
        setter(prev => prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        // Validation
        if (password && password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }
        if (password && password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setLoading(true);
        try {
            const medicalHistory = {
                chronicConditions,
                allergies,
                medications: medications.split(",").map(m => m.trim()).filter(Boolean),
                smoking,
                pregnancy,
            };

            const result = await portalAccessApi.completeSetup({
                setupToken,
                password: password || undefined,
                medicalHistory: Object.values(medicalHistory).some(v => Array.isArray(v) ? v.length > 0 : v) ? medicalHistory : undefined,
                organizationId,
            });

            const data = result.data || result;

            if (data.token) {
                localStorage.setItem("patientToken", data.token);
                localStorage.setItem("portalOrganizationId", organizationId);
                navigate("/portal/dashboard", { replace: true });
            }
        } catch (err) {
            setError(err?.error?.message || err?.message || "Setup failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    if (!setupToken) return null;

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center px-4 py-12">
            <div className="max-w-lg w-full">
                {/* Logo */}
                <div className="flex items-center justify-center gap-3 mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
                        <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" rx="3" width="18" height="18" />
                            <path d="M8 12h8M12 8v8" />
                        </svg>
                    </div>
                    <span className="text-white font-bold text-2xl tracking-tight">{BRAND.name}</span>
                </div>

                {/* Setup Card */}
                <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
                    {/* Progress bar */}
                    <div className="flex">
                        <div className={`h-1.5 transition-all duration-500 ${step >= 1 ? "bg-blue-500" : "bg-slate-100"}`} style={{ width: "50%" }} />
                        <div className={`h-1.5 transition-all duration-500 ${step >= 2 ? "bg-blue-500" : "bg-slate-100"}`} style={{ width: "50%" }} />
                    </div>

                    <div className="p-8 xl:p-10">
                        {/* Welcome */}
                        <div className="mb-8">
                            <h2 className="text-2xl font-bold text-slate-900">
                                {step === 1 ? "Welcome to Your Portal" : "Medical History"}
                            </h2>
                            <p className="text-sm text-slate-500 mt-1">
                                {step === 1
                                    ? `Hi ${patient?.name || "there"}! Let's set up your account.`
                                    : "Help us provide better care by sharing your medical info."
                                }
                            </p>
                        </div>

                        {/* Patient info card */}
                        {step === 1 && patient && (
                            <div className="bg-blue-50 rounded-2xl p-5 mb-6 border border-blue-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
                                        {(patient.name || "P").charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-900">{patient.name}</p>
                                        <p className="text-xs text-slate-500">{patient.phone} · {patient.email}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <form onSubmit={step === 2 ? handleSubmit : (e) => { e.preventDefault(); setStep(2); }}>
                            {/* Step 1: Password */}
                            {step === 1 && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                                            Create Password <span className="text-slate-400 font-normal">(optional)</span>
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showPwd ? "text" : "password"}
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="Min. 8 characters"
                                                className="w-full h-[52px] rounded-lg border border-slate-200 px-4 text-slate-900 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition pr-12"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPwd(!showPwd)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                                            >
                                                {showPwd ? "Hide" : "Show"}
                                            </button>
                                        </div>
                                    </div>

                                    {password && (
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Confirm Password</label>
                                            <input
                                                type="password"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                placeholder="Re-enter password"
                                                className="w-full h-[52px] rounded-lg border border-slate-200 px-4 text-slate-900 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                                            />
                                        </div>
                                    )}

                                    <p className="text-xs text-slate-400">
                                        You can also use magic link to login without a password.
                                    </p>
                                </div>
                            )}

                            {/* Step 2: Medical History */}
                            {step === 2 && (
                                <div className="space-y-6">
                                    {/* Chronic Conditions */}
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-3">Chronic Conditions</label>
                                        <div className="flex flex-wrap gap-2">
                                            {CHRONIC_OPTIONS.map((c) => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    onClick={() => toggleItem(chronicConditions, setChronicConditions, c)}
                                                    className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition ${
                                                        chronicConditions.includes(c)
                                                            ? "bg-blue-600 text-white border-blue-600"
                                                            : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                                                    }`}
                                                >
                                                    {c}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Allergies */}
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-3">Drug Allergies</label>
                                        <div className="flex flex-wrap gap-2">
                                            {ALLERGY_OPTIONS.map((a) => (
                                                <button
                                                    key={a}
                                                    type="button"
                                                    onClick={() => toggleItem(allergies, setAllergies, a)}
                                                    className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition ${
                                                        allergies.includes(a)
                                                            ? "bg-red-500 text-white border-red-500"
                                                            : "bg-white text-slate-600 border-slate-200 hover:border-red-300"
                                                    }`}
                                                >
                                                    {a}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Medications */}
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Current Medications</label>
                                        <input
                                            type="text"
                                            value={medications}
                                            onChange={(e) => setMedications(e.target.value)}
                                            placeholder="e.g. Metformin, Aspirin (comma separated)"
                                            className="w-full h-[48px] rounded-lg border border-slate-200 px-4 text-slate-900 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                                        />
                                    </div>

                                    {/* Toggle row */}
                                    <div className="flex gap-6">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={smoking} onChange={() => setSmoking(!smoking)}
                                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                                            <span className="text-sm text-slate-600">Smoker</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={pregnancy} onChange={() => setPregnancy(!pregnancy)}
                                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                                            <span className="text-sm text-slate-600">Pregnant</span>
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* Error */}
                            {error && (
                                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm font-medium text-red-600 flex items-center gap-2">
                                    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 8v4m0 4h.01" />
                                    </svg>
                                    {error}
                                </div>
                            )}

                            {/* Navigation */}
                            <div className="flex gap-3 mt-8">
                                {step === 2 && (
                                    <button
                                        type="button"
                                        onClick={() => setStep(1)}
                                        className="flex-1 py-3.5 rounded-xl border-2 border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition"
                                    >
                                        Back
                                    </button>
                                )}
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-3.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? "Setting up..." : step === 1 ? "Continue" : "Complete Setup"}
                                </button>
                            </div>

                            {step === 2 && (
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full mt-3 text-sm text-slate-400 hover:text-slate-600 font-medium transition"
                                    onClick={() => {
                                        setChronicConditions([]);
                                        setAllergies([]);
                                        setMedications("");
                                        setSmoking(false);
                                        setPregnancy(false);
                                    }}
                                >
                                    Skip medical history for now
                                </button>
                            )}
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
