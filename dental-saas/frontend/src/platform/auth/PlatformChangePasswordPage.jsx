/**
 * PlatformChangePasswordPage.jsx
 *
 * Shown when user.mustChangePassword === true (new staff, temp password).
 * Requires the current temp password + a new password of 8+ chars.
 * On success: clears mustChangePassword flag via PUT /change-password,
 * then redirects to /platform/dashboard.
 *
 * The page is intentionally minimal — no sidebar, no layout shell.
 * Users with mustChangePassword must not bypass this before accessing platform.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Lock, Eye, EyeOff, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { usePlatformAuth } from "./PlatformAuthContext";
import platformApi from "./platformApi";

export default function PlatformChangePasswordPage() {
    const { user, platformLogout } = usePlatformAuth();
    const navigate = useNavigate();

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    const validate = () => {
        if (!currentPassword) return "Enter the temporary password you received.";
        if (newPassword.length < 8) return "New password must be at least 8 characters.";
        if (newPassword !== confirmPassword) return "Passwords do not match.";
        if (newPassword === currentPassword) return "New password must differ from the temporary password.";
        return null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const validationError = validate();
        if (validationError) { setError(validationError); return; }

        setLoading(true);
        setError(null);
        try {
            await platformApi.put("/change-password", { currentPassword, newPassword });
            setSuccess(true);
            // Redirect to dashboard after brief confirmation
            setTimeout(() => navigate("/platform/dashboard", { replace: true }), 1800);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to change password. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md">

                {/* Card */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

                    {/* Header strip */}
                    <div className="h-1 bg-gradient-to-r from-indigo-600 to-blue-500" />

                    <div className="px-8 py-8">
                        {/* Logo mark */}
                        <div className="flex items-center gap-3 mb-8">
                            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                                <Shield className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">DentalSaaS Platform</p>
                                <h1 className="text-lg font-bold text-slate-800 leading-tight">Set Your Password</h1>
                            </div>
                        </div>

                        {/* Notice */}
                        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-6">
                            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-amber-800 font-medium">
                                Your account was created with a temporary password. You must set a permanent password before continuing.
                            </p>
                        </div>

                        {success ? (
                            <div className="flex flex-col items-center gap-4 py-8 text-center">
                                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                                    <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                                </div>
                                <div>
                                    <p className="text-base font-bold text-slate-800">Password updated</p>
                                    <p className="text-sm text-slate-500 mt-1">Redirecting to dashboard…</p>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {/* Temp password */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                                        Temporary Password
                                    </label>
                                    <div className="relative">
                                        <input
                                            id="current-password"
                                            type={showCurrent ? "text" : "password"}
                                            value={currentPassword}
                                            onChange={(e) => setCurrentPassword(e.target.value)}
                                            placeholder="Enter the password you received"
                                            disabled={loading}
                                            className="w-full px-3 py-2.5 pr-10 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
                                        />
                                        <button type="button" onClick={() => setShowCurrent((v) => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                            {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* New password */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                                        New Password
                                    </label>
                                    <div className="relative">
                                        <input
                                            id="new-password"
                                            type={showNew ? "text" : "password"}
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="8+ characters"
                                            disabled={loading}
                                            className="w-full px-3 py-2.5 pr-10 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
                                        />
                                        <button type="button" onClick={() => setShowNew((v) => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                            {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Confirm */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                                        Confirm New Password
                                    </label>
                                    <input
                                        id="confirm-password"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Re-enter your new password"
                                        disabled={loading}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
                                    />
                                </div>

                                {/* Strength hint */}
                                {newPassword.length > 0 && (
                                    <div className="flex gap-1.5">
                                        {[1, 2, 3, 4].map((i) => (
                                            <div key={i} className={`flex-1 h-1 rounded-full transition-colors ${newPassword.length >= i * 3
                                                    ? i <= 2 ? "bg-amber-400" : "bg-emerald-500"
                                                    : "bg-slate-200"
                                                }`} />
                                        ))}
                                    </div>
                                )}

                                {error && (
                                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm font-medium">
                                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                                    className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed mt-2"
                                >
                                    {loading ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</>
                                    ) : (
                                        <><Lock className="w-4 h-4" /> Set Permanent Password</>
                                    )}
                                </button>
                            </form>
                        )}
                    </div>
                </div>

                {/* Sign out link */}
                <div className="text-center mt-4">
                    <button onClick={platformLogout} className="text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors">
                        Not you? Sign out
                    </button>
                </div>
            </div>
        </div>
    );
}
