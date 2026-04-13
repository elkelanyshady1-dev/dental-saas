import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { usePlatformAuth } from "./PlatformAuthContext";
import Button from "@/design-system/components/Button";
import Input from "@/design-system/components/Input";
import Card from "@/design-system/components/Card";
import FeatureItem from "@/design-system/components/FeatureItem";
import StatsBadge from "@/design-system/components/StatsBadge";

export default function PlatformLoginPage() {
    const { platformLogin, token, user } = usePlatformAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    // Redirect after successful login
    useEffect(() => {
        if (token && user) {
            if (user.mustChangePassword) {
                navigate("/platform/change-password", { replace: true });
            } else {
                navigate("/platform/dashboard", { replace: true });
            }
        }
    }, [token, user, navigate]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            await platformLogin({ email, password });
        } catch (err) {
            if (!err.response) {
                setError("Network error. Backend unreachable.");
            } else if (err.response.status === 401) {
                setError("Invalid email or password.");
            } else if (err.response.status === 500) {
                setError("Server error. Please contact administrator.");
            } else {
                setError("Unexpected error occurred.");
            }

            setPassword(""); // clear password only
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid grid-cols-[1.1fr_0.9fr] bg-[#F0F6FF] relative overflow-hidden font-sans">
            {/* LEFT SECTION (Branding unchanged for brevity) */}
            <div className="flex flex-col justify-center px-24 py-16 z-10 w-full h-full">
                <Link
                    to="/"
                    className="flex items-center gap-3 mb-4 w-max hover:opacity-80 transition-opacity"
                >
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Zm-1-14v3H8v2h3v3h2v-3h3v-2h-3V7h-2Z" />
                        </svg>
                    </div>
                    <div className="font-extrabold text-2xl text-slate-800 tracking-tight">
                        DentalSaaS Platform
                    </div>
                </Link>

                <h1 className="text-6xl font-bold leading-tight text-slate-900 mt-2">
                    Platform Admin<br />
                    <span className="text-blue-600">Control Center</span>
                </h1>

                <p className="mt-6 text-lg text-slate-600">
                    Oversee and Manage the Global DentalSaaS Infrastructure
                </p>
            </div>

            {/* RIGHT SECTION (Login) */}
            <div className="relative flex items-center justify-center z-10">
                <div className="absolute right-0 top-0 h-full w-[60%] bg-gradient-to-br from-blue-200 to-blue-400 rounded-l-[120px] opacity-20 z-0"></div>

                <div className="relative z-10">
                    <Card>
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-semibold text-slate-900 mb-1">
                                Sign In to Platform
                            </h2>
                            <p className="text-sm text-slate-500">
                                Superadmin Access Only
                            </p>
                        </div>

                        <form onSubmit={handleLogin} className="space-y-5">
                            {/* EMAIL */}
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                placeholder="email"
                            />

                            {/* PASSWORD WITH TOGGLE */}
                            <div className="relative">
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    placeholder="••••••••"
                                />

                                <button
                                    type="button"
                                    onClick={() => setShowPassword((prev) => !prev)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-blue-600 font-medium hover:text-blue-800"
                                >
                                    {showPassword ? "Hide" : "Show"}
                                </button>
                            </div>

                            {/* ERROR MESSAGE */}
                            {error && (
                                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm font-medium text-red-600 shadow-sm">
                                    {error}
                                </div>
                            )}

                            <Button type="submit" disabled={loading}>
                                {loading ? "Authenticating..." : "Login to Platform"}
                            </Button>
                        </form>

                        <p className="text-center mt-8 text-sm text-slate-500 font-medium">
                            Authorized personnel only.
                            <Link
                                to="/"
                                className="text-blue-600 hover:text-blue-700 font-bold ml-1"
                            >
                                Back to Home
                            </Link>
                        </p>
                    </Card>
                </div>
            </div>
        </div>
    );
}