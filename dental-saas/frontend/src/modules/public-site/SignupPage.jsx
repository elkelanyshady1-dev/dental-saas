import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../services/api";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Card from "../../components/ui/Card";

export default function SignupPage() {
    useEffect(() => {
        document.title = "Sign Up | Start Your 14-Day Free Trial";
    }, []);
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        organizationName: "",
        fullName: "",
        email: "",
        password: "",
        phoneNumber: "",
        country: ""
    });
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // Debug log as requested in STEP 2
        console.log("Signup Request Payload:", formData);

        try {
            const res = await api.post("/public/signup", formData);
            if (res.data.success) {
                // If we had a VerifyPhonePage, we'd navigate there. 
                // For now, redirect to login with a message
                alert(res.data.message);
                navigate("/login", { state: { message: res.data.message } });
            }
        } catch (err) {
            setError(err.response?.data?.message || "Signup failed. Please check your inputs.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center py-12 px-6">
            <div className="max-w-md w-full">
                <Card>
                    <div className="text-center mb-8">
                        <h2 className="text-3xl font-black text-slate-900 mb-2">Create Your Account</h2>
                        <p className="text-slate-500 font-medium">Start your 14-day free trial today.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <Input
                            label="Organization Name"
                            name="organizationName"
                            value={formData.organizationName}
                            onChange={handleChange}
                            required
                            placeholder="e.g. Acme Dental"
                        />
                        <div className="space-y-1.5">
                            <label className="block text-sm font-semibold text-slate-700">Country <span className="text-red-500">*</span></label>
                            <select
                                name="country"
                                value={formData.country}
                                onChange={handleChange}
                                required
                                className="w-full bg-white border border-slate-300 text-slate-800 rounded-xl px-4 py-2.5 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                            >
                                <option value="">Select a country</option>
                                <option value="Egypt">Egypt</option>
                                <option value="Saudi Arabia">Saudi Arabia</option>
                                <option value="UAE">UAE</option>
                                <option value="Kuwait">Kuwait</option>
                                <option value="Qatar">Qatar</option>
                                <option value="Bahrain">Bahrain</option>
                                <option value="Oman">Oman</option>
                                <option value="UK">UK</option>
                                <option value="USA">USA</option>
                            </select>
                        </div>
                        <div className="border-t border-slate-100 my-4"></div>
                        <Input
                            label="Full Name"
                            name="fullName"
                            value={formData.fullName}
                            onChange={handleChange}
                            required
                            placeholder="Dr. John Doe"
                        />
                        <Input
                            label="Email Address"
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                            placeholder="john@example.com"
                        />
                        <Input
                            label="Password"
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            required
                            placeholder="••••••••"
                        />
                        <Input
                            label="Phone Number"
                            name="phoneNumber"
                            value={formData.phoneNumber}
                            onChange={handleChange}
                            required
                            placeholder="+1234567890"
                            description="Format: +[CountryCode][Number]"
                        />

                        {error && (
                            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium border border-red-100">
                                {error}
                            </div>
                        )}

                        <div className="pt-4">
                            <Button type="submit" disabled={loading}>
                                {loading ? "Creating Account..." : "Start Free Trial"}
                            </Button>
                        </div>
                    </form>

                    <p className="text-center mt-6 text-sm text-slate-500 font-medium">
                        Already have an account? <Link to="/login" className="text-blue-600 font-bold hover:underline">Sign In</Link>
                    </p>
                </Card>
            </div>
        </div>
    );
}
