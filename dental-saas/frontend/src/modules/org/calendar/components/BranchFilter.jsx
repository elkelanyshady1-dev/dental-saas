/**
 * BranchFilter.jsx — Branch Selector for Calendar Filtering
 */
import { useState, useEffect } from "react";
import { branchesApi } from "@/modules/org/branches/api/branches.api";

export default function BranchFilter({ value, onChange }) {
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        branchesApi.list()
            .then((res) => {
                // axios wraps the response: res.data = { success, data: [...] }
                // Defensively extract the array regardless of server response shape
                const payload = res?.data;
                const list =
                    Array.isArray(payload)             ? payload :
                    Array.isArray(payload?.data)       ? payload.data :
                    Array.isArray(payload?.branches)   ? payload.branches :
                    Array.isArray(payload?.data?.branches) ? payload.data.branches :
                    [];
                setBranches(list);
            })
            .catch(() => setBranches([]))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="relative group">
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-14 pl-12 pr-10 rounded-2xl text-xs font-black uppercase tracking-widest bg-surface-low border-none text-text-primary focus:ring-2 focus:ring-brand-primary/10 transition-all duration-300 appearance-none min-w-[200px] cursor-pointer"
            >
                <option value="">Global Network</option>
                {loading ? (
                    <option disabled>Loading...</option>
                ) : (
                    branches.map((b) => (
                        <option key={b._id} value={b._id}>{b.name}</option>
                    ))
                )}
            </select>
            <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40 group-hover:opacity-100 transition-opacity">🏢</div>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
            </div>
        </div>
    );
}
