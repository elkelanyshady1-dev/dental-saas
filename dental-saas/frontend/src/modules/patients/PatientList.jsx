import { useState, useEffect, useCallback } from "react";
import { getPatients } from "../../services/patientService";
import { useNavigate } from "react-router-dom";

export default function PatientList() {
    const navigate = useNavigate();
    const [patients, setPatients] = useState([]);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, pages: 1 });
    const [loading, setLoading] = useState(true);

    const limit = 20;

    const loadPatients = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getPatients({ search, page, limit });
            setPatients(res.data.data || res.data.patients || []);
            setPagination(res.data.pagination || { total: 0, pages: 1 });
        } catch {
            setPatients([]);
        } finally {
            setLoading(false);
        }
    }, [search, page]);

    useEffect(() => { loadPatients(); }, [loadPatients]);

    /* Reset page on search change */
    useEffect(() => { setPage(1); }, [search]);

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-200">Patients</h2>
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search patients..."
                    className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 border border-slate-700/50 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 w-64"
                />
            </div>

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-16">
                    <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
            )}

            {/* Table */}
            {!loading && (
                <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-700/50">
                                <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Patient</th>
                                <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Phone</th>
                                <th className="text-left px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Family</th>
                            </tr>
                        </thead>
                        <tbody>
                            {patients.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="text-center py-12 text-slate-500 text-sm">
                                        No patients found
                                    </td>
                                </tr>
                            )}
                            {patients.map((p) => (
                                <tr
                                    key={p._id}
                                    onClick={() => navigate(`/patients/${p._id}`)}
                                    className="border-b border-slate-800/50 hover:bg-slate-800/40 cursor-pointer transition"
                                >
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            {p.profilePhoto ? (
                                                <img
                                                    src={p.profilePhoto}
                                                    alt=""
                                                    className="w-8 h-8 rounded-full object-cover border border-slate-700/50"
                                                />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-400">
                                                    {(p.firstName?.[0] || "").toUpperCase()}
                                                </div>
                                            )}
                                            <span className="text-sm text-slate-300">
                                                {p.firstName} {p.lastName}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-slate-400">{p.phone || "—"}</td>
                                    <td className="px-4 py-3">
                                        {p.familyId ? (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                                Family
                                            </span>
                                        ) : (
                                            <span className="text-slate-600 text-xs">—</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination */}
            {pagination.pages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="px-3 py-1.5 rounded-lg text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 transition disabled:opacity-40"
                    >
                        Prev
                    </button>
                    <span className="text-xs text-slate-500">
                        {page} / {pagination.pages}
                    </span>
                    <button
                        onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                        disabled={page >= pagination.pages}
                        className="px-3 py-1.5 rounded-lg text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 transition disabled:opacity-40"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}
