import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Card from "../components/ui/Card";
import FeatureItem from "../components/ui/FeatureItem";
import StatsBadge from "../components/ui/StatsBadge";

export default function PlatformLoginPage() {
    const { platformLogin, token, user } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (token && user) {
            navigate(user.role ? "/platform/dashboard" : "/calendar", { replace: true });
        }
    }, [token, user, navigate]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await platformLogin({ email, password });
            navigate("/platform/dashboard");
        } catch (err) {
            setError(err.response?.data?.message || "Login failed");
            setPassword(""); // Clear only password on failure
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid grid-cols-[1.1fr_0.9fr] bg-[#F0F6FF] relative overflow-hidden font-sans">
            {/* Background Layers */}
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-300 opacity-20 rounded-full blur-3xl z-0"></div>
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-400 opacity-10 rounded-full blur-3xl z-0"></div>

            {/* LEFT COLUMN (Branding Section) */}
            <div className="flex flex-col justify-center px-24 py-16 z-10 w-full h-full">
                {/* Logo section */}
                <Link to="/" className="flex items-center gap-3 mb-4 w-max hover:opacity-80 transition-opacity">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                        <svg className="w-6 h-6 text-white relative" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Zm-1-14v3H8v2h3v3h2v-3h3v-2h-3V7h-2Z" />
                        </svg>
                    </div>
                    <div className="font-extrabold text-2xl text-slate-800 tracking-tight">DentalSaaS Platform</div>
                </Link>

                {/* Headline */}
                <h1 className="text-6xl font-bold leading-tight text-slate-900 mt-2">
                    Platform Admin<br />
                    <span className="text-blue-600">Control Center</span>
                </h1>

                {/* Subtitle */}
                <p className="mt-6 text-lg text-slate-600">
                    Oversee and Manage the Global DentalSaaS Infrastructure
                </p>

                {/* Feature list */}
                <div className="mt-10 space-y-6">
                    <FeatureItem
                        icon={<svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" /></svg>}
                        title="Manage Clinics"
                    />
                    <FeatureItem
                        icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>}
                        title="Global Analytics"
                    />
                    <FeatureItem
                        icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                        title="Billing & Subscriptions"
                    />
                    <FeatureItem
                        icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
                        title="Platform Security"
                    />
                </div>

                {/* Stats row */}
                <div className="mt-16 bg-white rounded-2xl shadow-xl px-10 py-6 flex gap-12 w-max">
                    <StatsBadge
                        icon={<svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
                        number="100+"
                        label="Regions Activity"
                    />
                    <StatsBadge
                        icon={<svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                        number="5M+"
                        label="API Requests"
                    />
                    <StatsBadge
                        icon={<svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
                        number="99.9%"
                        label="Platform Uptime"
                    />
                </div>
            </div>

            {/* RIGHT COLUMN (Login Section) */}
            <div className="relative flex items-center justify-center z-10">
                {/* Curved background shape behind card */}
                <div className="absolute right-0 top-0 h-full w-[60%] bg-gradient-to-br from-blue-200 to-blue-400 rounded-l-[120px] opacity-20 z-0"></div>

                <div className="relative z-10">
                    <Card>
                        <div className="flex justify-center mb-6 mt-1">
                            <Link to="/" className="flex items-center justify-center gap-2 bg-slate-50 px-4 py-2 rounded-full shadow-sm border border-slate-100 hover:bg-slate-100 transition-colors">
                                <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white relative" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Zm-1-14v3H8v2h3v3h2v-3h3v-2h-3V7h-2Z" />
                                    </svg>
                                </div>
                                <span className="font-extrabold text-slate-800 text-[15px]">DentalSaaS Platform</span>
                            </Link>
                        </div>

                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-semibold text-slate-900 mb-1">Sign In to Platform</h2>
                            <p className="text-sm text-slate-500">Superadmin Access Only</p>
                        </div>

                        <form onSubmit={handleLogin} className="space-y-5">
                            <div className="space-y-2">
                                <Input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    placeholder="superadmin@dentalsaas.com"
                                    icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
                                />
                            </div>

                            <div className="space-y-2">
                                <Input
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
                                    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    {error}
                                </div>
                            )}

                            <div className="pt-2">
                                <Button type="submit" disabled={loading}>
                                    {loading ? "Authenticating..." : "Login to Platform"}
                                </Button>
                            </div>
                        </form>

                        <p className="text-center mt-8 text-sm text-slate-500 font-medium">
                            Authorized personnel only. <a href="/" className="text-blue-600 hover:text-blue-700 font-bold ml-1">Back to Home</a>
                        </p>
                    </Card>
                </div>
            </div>
        </div>
    );
}