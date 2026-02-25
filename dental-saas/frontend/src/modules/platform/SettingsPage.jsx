import { useState, useEffect } from "react";
import api from "../../services/api";
import { Settings, Shield, Clock, CreditCard } from "lucide-react";

export default function SettingsPage() {
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        api.get("/platform/settings")
            .then(res => setConfig(res.data))
            .catch(err => console.error("Failed to fetch settings", err))
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await api.put("/platform/settings", config);
            setConfig(res.data);
            alert("Settings updated successfully");
        } catch (err) {
            alert(err.response?.data?.message || "Failed to update settings");
        }
        setSaving(false);
    };

    if (loading) return <div className="p-10 text-slate-500">Loading platform settings...</div>;
    if (!config) return <div className="p-10 text-red-500">Failed to load configuration.</div>;

    return (
        <div className="p-10 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Platform Settings</h1>
                <p className="text-slate-500 mt-2">Manage global system configurations, billing rules, and security policies.</p>
            </div>

            <form onSubmit={handleSave} className="space-y-8">

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                    {/* General Settings */}
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                            <Settings className="w-5 h-5 text-blue-600" />
                            <h2 className="text-lg font-semibold text-slate-900">General Configuration</h2>
                        </div>
                        <div className="p-6 space-y-6 flex-1">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Platform Name</label>
                                <input
                                    type="text"
                                    value={config.platformName}
                                    onChange={(e) => setConfig({ ...config, platformName: e.target.value })}
                                    className="w-full border border-slate-300 rounded-lg px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Support Email</label>
                                <input
                                    type="email"
                                    value={config.supportEmail}
                                    onChange={(e) => setConfig({ ...config, supportEmail: e.target.value })}
                                    className="w-full border border-slate-300 rounded-lg px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Default Currency</label>
                                    <input
                                        type="text"
                                        value={config.defaultCurrency}
                                        onChange={(e) => setConfig({ ...config, defaultCurrency: e.target.value.toUpperCase() })}
                                        className="w-full border border-slate-300 rounded-lg px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                                        maxLength={3}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Default Trial Days</label>
                                    <input
                                        type="number"
                                        value={config.defaultTrialDays}
                                        onChange={(e) => setConfig({ ...config, defaultTrialDays: Number(e.target.value) })}
                                        className="w-full border border-slate-300 rounded-lg px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        min={0}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Billing & Subscription */}
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                            <CreditCard className="w-5 h-5 text-emerald-600" />
                            <h2 className="text-lg font-semibold text-slate-900">Billing & Retry Policies</h2>
                        </div>
                        <div className="p-6 space-y-6 flex-1">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Retry Attempts</label>
                                    <input
                                        type="number"
                                        value={config.retryAttempts}
                                        onChange={(e) => setConfig({ ...config, retryAttempts: Number(e.target.value) })}
                                        className="w-full border border-slate-300 rounded-lg px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        min={0}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Retry Interval (Days)</label>
                                    <input
                                        type="number"
                                        value={config.retryIntervalDays}
                                        onChange={(e) => setConfig({ ...config, retryIntervalDays: Number(e.target.value) })}
                                        className="w-full border border-slate-300 rounded-lg px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        min={1}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Grace Period (Days)</label>
                                    <input
                                        type="number"
                                        value={config.gracePeriodDays}
                                        onChange={(e) => setConfig({ ...config, gracePeriodDays: Number(e.target.value) })}
                                        className="w-full border border-slate-300 rounded-lg px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        min={0}
                                    />
                                </div>
                                <div className="flex items-center mt-6">
                                    <label className="flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={config.autoSuspend}
                                            onChange={(e) => setConfig({ ...config, autoSuspend: e.target.checked })}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                        <span className="ml-3 text-sm font-semibold text-slate-700">Auto-Suspend Orgs</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Organization Policies */}
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                            <Clock className="w-5 h-5 text-indigo-600" />
                            <h2 className="text-lg font-semibold text-slate-900">Organization Policies</h2>
                        </div>
                        <div className="p-6 space-y-6 flex-1">
                            <label className="flex items-center cursor-pointer p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={config.allowTrialExtension}
                                    onChange={(e) => setConfig({ ...config, allowTrialExtension: e.target.checked })}
                                    className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 focus:ring-2"
                                />
                                <div className="ml-3">
                                    <span className="block text-sm font-semibold text-slate-900">Allow Trial Extensions</span>
                                    <span className="block text-xs text-slate-500">Enable superadmins to manually extend trial periods.</span>
                                </div>
                            </label>

                            <label className="flex items-center cursor-pointer p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={config.allowPlanDowngrade}
                                    onChange={(e) => setConfig({ ...config, allowPlanDowngrade: e.target.checked })}
                                    className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 focus:ring-2"
                                />
                                <div className="ml-3">
                                    <span className="block text-sm font-semibold text-slate-900">Allow Plan Downgrade</span>
                                    <span className="block text-xs text-slate-500">Permit organizations to schedule plan downgrades.</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Security Rules */}
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                            <Shield className="w-5 h-5 text-red-600" />
                            <h2 className="text-lg font-semibold text-slate-900">Security Rules</h2>
                        </div>
                        <div className="p-6 space-y-6 flex-1">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Session Timeout (Minutes)</label>
                                <input
                                    type="number"
                                    value={config.sessionTimeoutMinutes}
                                    onChange={(e) => setConfig({ ...config, sessionTimeoutMinutes: Number(e.target.value) })}
                                    className="w-full border border-slate-300 rounded-lg px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    min={5}
                                />
                                <p className="text-xs text-slate-500 mt-1">Platform user sessions will expire after this duration of inactivity.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Max Login Attempts</label>
                                <input
                                    type="number"
                                    value={config.maxLoginAttempts}
                                    onChange={(e) => setConfig({ ...config, maxLoginAttempts: Number(e.target.value) })}
                                    className="w-full border border-slate-300 rounded-lg px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    min={3}
                                />
                                <p className="text-xs text-slate-500 mt-1">Number of failed attempts before temporary lockout.</p>
                            </div>
                        </div>
                    </div>

                </div>

                <div className="flex justify-end pt-4">
                    <button
                        type="submit"
                        disabled={saving}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-xl shadow-sm transition-colors disabled:opacity-50 text-lg"
                    >
                        {saving ? "Saving Changes..." : "Save Configuration"}
                    </button>
                </div>
            </form>
        </div>
    );
}
