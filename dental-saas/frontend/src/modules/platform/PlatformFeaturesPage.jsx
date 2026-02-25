import { useState, useEffect } from "react";
import { Plus, Search, Check, AlertCircle, Edit, Trash2, Power, AlertTriangle, Play, Shield } from "lucide-react";
import api from "../../services/api";

export default function PlatformFeaturesPage() {
    const [features, setFeatures] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [selectedFeature, setSelectedFeature] = useState(null);

    // Form state
    const [formData, setFormData] = useState({
        key: "",
        name: "",
        description: "",
        category: "clinical",
        defaultEnabled: false,
        isCore: false,
        allowedPlans: [],
        allowedRoles: []
    });

    const [isSubmitting, setIsSubmitting] = useState(false);

    // Override state
    const [overrideOrgId, setOverrideOrgId] = useState("");
    const [overrideState, setOverrideState] = useState(false);
    const [overrideFeatureKey, setOverrideFeatureKey] = useState("");

    useEffect(() => {
        fetchFeatures();
    }, []);

    const fetchFeatures = async () => {
        try {
            setLoading(true);
            const { data } = await api.get("/platform/features");
            setFeatures(data);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to load features");
        } finally {
            setLoading(false);
        }
    };

    const handleTogglePlan = (plan) => {
        setFormData(prev => ({
            ...prev,
            allowedPlans: prev.allowedPlans.includes(plan)
                ? prev.allowedPlans.filter(p => p !== plan)
                : [...prev.allowedPlans, plan]
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError("");

        try {
            if (selectedFeature) {
                await api.put(`/platform/features/${selectedFeature._id}`, formData);
            } else {
                await api.post("/platform/features", formData);
            }
            setIsAddOpen(false);
            fetchFeatures();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to save feature");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOverrideSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.patch(`/platform/org/${overrideOrgId}/feature/${overrideFeatureKey}`, {
                enabled: overrideState
            });
            alert("Override applied successfully");
            setOverrideFeatureKey("");
        } catch (err) {
            alert(err.response?.data?.message || "Failed to apply override");
        }
    };

    const handleResetOverride = async (featureKey) => {
        if (!overrideOrgId) return alert("Please enter Organization ID first");
        try {
            await api.patch(`/platform/org/${overrideOrgId}/feature/${featureKey}`, {
                resetOverride: true
            });
            alert("Override reset successfully");
        } catch (err) {
            alert(err.response?.data?.message || "Failed to reset override");
        }
    };

    const openEdit = (feat) => {
        setSelectedFeature(feat);
        setFormData({
            key: feat.key,
            name: feat.name,
            description: feat.description,
            category: feat.category,
            defaultEnabled: feat.defaultEnabled,
            isCore: feat.isCore,
            allowedPlans: feat.allowedPlans || [],
            allowedRoles: feat.allowedRoles || []
        });
        setIsAddOpen(true);
    };

    const formatCategory = (cat) => cat.charAt(0).toUpperCase() + cat.slice(1);

    const filteredFeatures = features.filter(f =>
        f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="max-w-7xl mx-auto py-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">Global Feature Engine</h1>
                    <p className="text-slate-400 text-sm mt-1">Manage platform-wide feature flags, plan constraints, and overrides.</p>
                </div>
                <button
                    onClick={() => {
                        setSelectedFeature(null);
                        setFormData({
                            key: "", name: "", description: "", category: "clinical",
                            defaultEnabled: false, isCore: false, allowedPlans: ["enterprise"]
                        });
                        setIsAddOpen(true);
                    }}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                    <Plus className="w-5 h-5" />
                    New Feature
                </button>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl mb-6 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p>{error}</p>
                </div>
            )}

            {/* Quick Override Tool */}
            <div className="bg-[#1e2330] border border-slate-800 rounded-xl p-6 mb-8 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-blue-400" />
                    Organization Override Tool
                </h3>
                <form onSubmit={handleOverrideSubmit} className="flex flex-col md:flex-row items-end gap-4">
                    <div className="flex-1 w-full">
                        <label className="block text-sm font-medium text-slate-300 mb-1">Organization ID</label>
                        <input
                            type="text"
                            value={overrideOrgId}
                            onChange={(e) => setOverrideOrgId(e.target.value)}
                            placeholder="e.g. 60f1..."
                            className="w-full bg-[#0b0f19] border border-slate-700 text-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none"
                            required
                        />
                    </div>
                    <div className="flex-1 w-full">
                        <label className="block text-sm font-medium text-slate-300 mb-1">Feature Key</label>
                        <select
                            value={overrideFeatureKey}
                            onChange={(e) => setOverrideFeatureKey(e.target.value)}
                            className="w-full bg-[#0b0f19] border border-slate-700 text-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none"
                            required
                        >
                            <option value="">Select Feature...</option>
                            {features.map(f => (
                                <option key={f.key} value={f.key}>{f.name} ({f.key})</option>
                            ))}
                        </select>
                    </div>
                    <div className="w-full md:w-auto">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1 px-1">
                            <input
                                type="checkbox"
                                checked={overrideState}
                                onChange={(e) => setOverrideState(e.target.checked)}
                                className="rounded bg-[#0b0f19] border-slate-700 text-blue-500 focus:ring-blue-500"
                            />
                            Enable Feature
                        </label>
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-colors w-full md:w-auto"
                            >
                                Apply Override
                            </button>
                            {overrideFeatureKey && (
                                <button
                                    type="button"
                                    onClick={() => handleResetOverride(overrideFeatureKey)}
                                    className="bg-red-500/20 text-red-400 hover:bg-red-500/30 px-4 py-2 rounded-lg font-medium transition-colors border border-red-500/20"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            </div>

            {/* List */}
            <div className="mb-6 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
                <input
                    type="text"
                    placeholder="Search features..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-[#1e2330] border border-slate-800 text-slate-200 rounded-xl pl-10 pr-4 py-3 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-shadow"
                />
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredFeatures.map((feat) => (
                        <div key={feat.key} className="bg-[#1e2330] border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors flex flex-col h-full shadow-sm">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                                        {feat.name}
                                        {feat.isCore && (
                                            <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded uppercase tracking-wide border border-red-500/20">Core</span>
                                        )}
                                    </h3>
                                    <p className="text-slate-500 text-xs font-mono mt-1">{feat.key}</p>
                                </div>
                                <button
                                    onClick={() => openEdit(feat)}
                                    className="text-slate-400 hover:text-blue-400 p-1 transition-colors"
                                >
                                    <Edit className="w-4 h-4" />
                                </button>
                            </div>

                            <p className="text-slate-400 text-sm mb-4 flex-grow line-clamp-2">{feat.description}</p>

                            <div className="space-y-3 mt-auto pt-4 border-t border-slate-800/50">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500">Category</span>
                                    <span className="text-slate-300 bg-slate-800 px-2 py-1 rounded text-xs">{formatCategory(feat.category)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500">Default</span>
                                    <span className={`flex items-center gap-1 font-medium ${feat.defaultEnabled ? 'text-green-400' : 'text-slate-500'}`}>
                                        {feat.defaultEnabled ? <><Check className="w-3 h-3" /> Enabled</> : <><Power className="w-3 h-3" /> Disabled</>}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500">Plans</span>
                                    <div className="flex gap-1">
                                        {["basic", "pro", "enterprise"].map(p => (
                                            <div
                                                key={p}
                                                className={`w-2 h-2 rounded-full ${feat.allowedPlans.includes(p) ? 'bg-blue-500' : 'bg-slate-700'}`}
                                                title={p}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    {filteredFeatures.length === 0 && (
                        <div className="col-span-full py-12 text-center text-slate-500">
                            No features found matching "{searchTerm}"
                        </div>
                    )}
                </div>
            )}

            {/* Add/Edit Modal */}
            {isAddOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#1e2330] rounded-2xl w-full max-w-2xl border border-slate-700 shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white">
                                {selectedFeature ? "Edit Feature" : "Create New Feature"}
                            </h2>
                            <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-white">
                                &times;
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="col-span-2 md:col-span-1">
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Display Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full bg-[#0b0f19] border border-slate-700 text-slate-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                        placeholder="e.g. Ortho Module"
                                    />
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Feature Key</label>
                                    <input
                                        type="text"
                                        required
                                        disabled={!!selectedFeature}
                                        value={formData.key}
                                        onChange={e => setFormData({ ...formData, key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                                        className="w-full bg-[#0b0f19] border border-slate-700 text-slate-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 font-mono text-sm"
                                        placeholder="e.g. orthoModule"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Description</label>
                                <textarea
                                    required
                                    rows="2"
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full bg-[#0b0f19] border border-slate-700 text-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                                    placeholder="Brief description of what this feature controls..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Category</label>
                                    <select
                                        value={formData.category}
                                        onChange={e => setFormData({ ...formData, category: e.target.value })}
                                        className="w-full bg-[#0b0f19] border border-slate-700 text-slate-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    >
                                        <option value="clinical">Clinical</option>
                                        <option value="financial">Financial</option>
                                        <option value="ai">AI</option>
                                        <option value="integration">Integration</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Allowed Plans</label>
                                    <div className="flex bg-[#0b0f19] border border-slate-700 rounded-lg p-1">
                                        {["basic", "pro", "enterprise"].map(plan => (
                                            <button
                                                key={plan}
                                                type="button"
                                                onClick={() => handleTogglePlan(plan)}
                                                className={`flex-1 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${formData.allowedPlans.includes(plan)
                                                        ? 'bg-blue-600 text-white shadow-sm'
                                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                                    }`}
                                            >
                                                {plan}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-[#0b0f19] p-4 rounded-xl border border-slate-800 space-y-4">
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <div className="flex hidden sm:block h-6 items-center">
                                        <input
                                            type="checkbox"
                                            checked={formData.defaultEnabled}
                                            onChange={e => setFormData({ ...formData, defaultEnabled: e.target.checked })}
                                            className="w-4 h-4 rounded bg-slate-800 border-slate-600 text-blue-600 focus:ring-blue-500 mt-1"
                                        />
                                    </div>
                                    <div>
                                        <span className="text-sm font-medium text-slate-200">Default Enabled</span>
                                        <p className="text-xs text-slate-500 mt-0.5">If checked, this feature is active by default for all eligible organizations.</p>
                                    </div>
                                </label>

                                <label className="flex items-start gap-3 cursor-pointer pt-4 border-t border-slate-800/50">
                                    <div className="flex hidden sm:block h-6 items-center">
                                        <input
                                            type="checkbox"
                                            disabled={!!selectedFeature}
                                            checked={formData.isCore}
                                            onChange={e => setFormData({ ...formData, isCore: e.target.checked })}
                                            className="w-4 h-4 rounded bg-slate-800 border-slate-600 text-red-500 focus:ring-red-500 focus:ring-offset-slate-900 mt-1 disabled:opacity-50"
                                        />
                                    </div>
                                    <div>
                                        <span className="text-sm font-medium text-red-400 flex items-center gap-1">Core System Module <AlertTriangle className="w-3 h-3" /></span>
                                        <p className="text-xs text-slate-500 mt-0.5">Marking as core forces this feature ON for everyone regardless of plan or rules. Cannot be disabled.</p>
                                    </div>
                                </label>
                            </div>

                            <div className="pt-4 flex justify-end gap-3 border-t border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setIsAddOpen(false)}
                                    className="px-5 py-2.5 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting || formData.allowedPlans.length === 0}
                                    className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting ? (
                                        <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> Saving...</>
                                    ) : (
                                        <><Save className="w-4 h-4" /> Save Feature</>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

// Need Save icon
import { Save } from "lucide-react";
