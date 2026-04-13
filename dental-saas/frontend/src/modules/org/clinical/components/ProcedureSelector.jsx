/**
 * ProcedureSelector.jsx — Dental Procedure Selection Component
 *
 * Loads available procedures from backend or uses a default set.
 * Used inside CreateTreatmentDrawer.
 */
import { useState, useEffect } from "react";
import { treatmentsApi } from "../api/treatments.api";

// Default procedure list (used as fallback if no backend endpoint)
const DEFAULT_PROCEDURES = [
    { id: "cleaning", name: "Cleaning & Scaling", category: "Preventive" },
    { id: "filling", name: "Composite Filling", category: "Restorative" },
    { id: "root_canal", name: "Root Canal Treatment", category: "Endodontic" },
    { id: "extraction", name: "Tooth Extraction", category: "Surgical" },
    { id: "crown", name: "Dental Crown", category: "Prosthetic" },
    { id: "bridge", name: "Dental Bridge", category: "Prosthetic" },
    { id: "veneer", name: "Porcelain Veneer", category: "Cosmetic" },
    { id: "whitening", name: "Teeth Whitening", category: "Cosmetic" },
    { id: "orthodontic", name: "Orthodontic Consultation", category: "Orthodontic" },
    { id: "implant", name: "Dental Implant", category: "Surgical" },
    { id: "denture", name: "Denture Fitting", category: "Prosthetic" },
    { id: "sealant", name: "Dental Sealant", category: "Preventive" },
    { id: "xray", name: "Dental X-Ray", category: "Diagnostic" },
    { id: "other", name: "Other Procedure", category: "General" },
];

// Group by category
function groupByCategory(procedures) {
    return procedures.reduce((acc, p) => {
        const cat = p.category || "General";
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(p);
        return acc;
    }, {});
}

export default function ProcedureSelector({ value, onChange }) {
    const [procedures, setProcedures] = useState(DEFAULT_PROCEDURES);
    const [search, setSearch] = useState("");

    useEffect(() => {
        treatmentsApi.getProcedures()
            .then((res) => {
                const data = res.data?.procedures || res.data || [];
                if (data.length > 0) setProcedures(data);
            })
            .catch(() => {
                // Use defaults silently
            });
    }, []);

    const filtered = procedures.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.category?.toLowerCase().includes(search.toLowerCase())
    );
    const grouped = groupByCategory(filtered);

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Procedure</label>

            {/* Search */}
            <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search procedures..."
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition"
            />

            {/* Selected display */}
            {value && (
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-sm font-semibold text-blue-700">{value}</span>
                    <button
                        onClick={() => onChange("")}
                        className="ml-auto text-blue-400 hover:text-blue-600 text-xs"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Grouped procedure grid */}
            <div className="max-h-48 overflow-y-auto space-y-3 border border-gray-100 rounded-xl p-2 bg-gray-50">
                {Object.entries(grouped).map(([cat, procs]) => (
                    <div key={cat}>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1 mb-1">{cat}</p>
                        <div className="grid grid-cols-2 gap-1">
                            {procs.map((p) => (
                                <button
                                    key={p.id || p.name}
                                    type="button"
                                    onClick={() => onChange(p.name)}
                                    className={`text-left px-3 py-2 rounded-xl text-xs font-medium transition ${
                                        value === p.name
                                            ? "bg-blue-600 text-white"
                                            : "bg-white text-gray-700 hover:bg-blue-50 hover:text-blue-700 border border-gray-100"
                                    }`}
                                >
                                    {p.name}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
                {filtered.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">No procedures found</p>
                )}
            </div>
        </div>
    );
}
