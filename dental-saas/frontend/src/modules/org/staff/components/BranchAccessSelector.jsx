/**
 * BranchAccessSelector.jsx — Multi-branch checkbox selector (Staff module copy)
 * Self-contained: fetches branches internally.
 */
import { useState, useEffect } from "react";
import api from "@/services/api";

export default function BranchAccessSelector({ selected = [], onChange }) {
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/org/branches")
            .then((res) => {
                const data = res.data?.data?.branches || res.data?.branches || res.data || [];
                setBranches(Array.isArray(data) ? data : []);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const toggle = (branchId) => {
        const next = selected.includes(branchId)
            ? selected.filter((id) => id !== branchId)
            : [...selected, branchId];
        onChange(next);
    };

    if (loading) {
        return <div className="text-xs text-gray-400 py-2">Loading branches...</div>;
    }

    return (
        <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
                Branch Access
            </label>
            <div className="space-y-2 max-h-40 overflow-y-auto bg-gray-50 rounded-xl p-3 border border-gray-100">
                {branches.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No branches configured</p>
                ) : (
                    branches.map((b) => (
                        <label key={b._id} className="flex items-center gap-2.5 cursor-pointer hover:bg-white rounded-lg px-2 py-1 transition">
                            <input
                                type="checkbox"
                                checked={selected.includes(b._id)}
                                onChange={() => toggle(b._id)}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">{b.name}</span>
                            {!b.isActive && (
                                <span className="text-[10px] text-gray-400 font-medium">(inactive)</span>
                            )}
                        </label>
                    ))
                )}
            </div>
        </div>
    );
}
