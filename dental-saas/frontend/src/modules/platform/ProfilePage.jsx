import { useState, useEffect } from "react";
import api from "../../services/api";
import { User, Lock, Mail, Server } from "lucide-react";

export default function ProfilePage() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState({ name: "" });
    const [passData, setPassData] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });

    useEffect(() => {
        api.get("/platform/me")
            .then(res => {
                setUser(res.data);
                setFormData({ name: res.data.name });
            })
            .catch(err => console.error("Failed to fetch profile", err))
            .finally(() => setLoading(false));
    }, []);

    const handleProfileSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await api.put("/platform/me", formData);
            setUser(res.data.user);
            alert("Profile updated successfully");
        } catch (err) {
            alert(err.response?.data?.message || "Update failed");
        }
        setSaving(false);
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        if (passData.newPassword !== passData.confirmPassword) {
            alert("New passwords do not match");
            return;
        }
        setSaving(true);
        try {
            await api.put("/platform/change-password", {
                currentPassword: passData.currentPassword,
                newPassword: passData.newPassword
            });
            alert("Password updated successfully");
            setPassData({ currentPassword: "", newPassword: "", confirmPassword: "" });
        } catch (err) {
            alert(err.response?.data?.message || "Password update failed");
        }
        setSaving(false);
    };

    if (loading) return <div className="p-10 text-slate-500">Loading profile...</div>;

    return (
        <div className="p-10 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Platform Profile</h1>
                <p className="text-slate-500 mt-2">Manage your Super Admin account settings and security preferences.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Left Col - Account Info */}
                <div className="md:col-span-2 space-y-8">
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                            <User className="w-5 h-5 text-blue-600" />
                            <h2 className="text-lg font-semibold text-slate-900">Account Information</h2>
                        </div>
                        <div className="p-6">
                            <form onSubmit={handleProfileSave} className="space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">Full Name</label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            className="w-full border border-slate-300 rounded-lg px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">Email Address</label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <input
                                                type="email"
                                                value={user?.email || ""}
                                                disabled
                                                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2 text-slate-500 cursor-not-allowed"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        {saving ? "Saving..." : "Save Profile"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                            <Lock className="w-5 h-5 text-slate-600" />
                            <h2 className="text-lg font-semibold text-slate-900">Security Settings</h2>
                        </div>
                        <div className="p-6">
                            <form onSubmit={handlePasswordChange} className="space-y-6">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Current Password</label>
                                    <input
                                        type="password"
                                        value={passData.currentPassword}
                                        onChange={(e) => setPassData({ ...passData, currentPassword: e.target.value })}
                                        className="w-full max-w-sm border border-slate-300 rounded-lg px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-6 max-w-2xl">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">New Password</label>
                                        <input
                                            type="password"
                                            value={passData.newPassword}
                                            onChange={(e) => setPassData({ ...passData, newPassword: e.target.value })}
                                            className="w-full border border-slate-300 rounded-lg px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            required
                                            minLength={8}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">Confirm New Password</label>
                                        <input
                                            type="password"
                                            value={passData.confirmPassword}
                                            onChange={(e) => setPassData({ ...passData, confirmPassword: e.target.value })}
                                            className="w-full border border-slate-300 rounded-lg px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            required
                                            minLength={8}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        {saving ? "Updating..." : "Update Password"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>

                {/* Right Col - Meta & Preferences */}
                <div className="space-y-8">
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Server className="w-4 h-4 text-slate-500" /> System Meta
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <p className="text-xs text-slate-500 font-semibold uppercase">Role Access</p>
                                <span className="inline-block mt-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded capitalize border border-blue-200">
                                    {user?.role?.replace('_', ' ')}
                                </span>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 font-semibold uppercase">Account Created</p>
                                <p className="text-sm text-slate-900 font-medium mt-1">
                                    {new Date(user?.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 font-semibold uppercase">Status</p>
                                <div className="mt-1 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                    <span className="text-sm font-medium text-slate-900">Active Session</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
