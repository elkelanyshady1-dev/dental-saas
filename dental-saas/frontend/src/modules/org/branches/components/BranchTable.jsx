/**
 * BranchTable.jsx — Branches Display Table
 */
export default function BranchTable({ branches, onEdit, onDelete }) {
    if (!branches.length) {
        return (
            <div className="text-center py-16 text-gray-400">
                <p className="text-lg mb-1">No branches</p>
                <p className="text-sm">Add your first clinic branch to get started.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Branch</th>
                        <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Address</th>
                        <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Phone</th>
                        <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Type</th>
                        <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Chairs</th>
                        <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Status</th>
                        <th className="text-right px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {branches.map((b) => (
                        <tr key={b._id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-5 py-3.5">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                                        <span className="text-blue-600 text-sm font-bold">{(b.name?.[0] || "B").toUpperCase()}</span>
                                    </div>
                                    <span className="font-medium text-gray-800">{b.name}</span>
                                </div>
                            </td>
                            <td className="px-5 py-3.5 text-gray-500 max-w-[200px] truncate">{b.address || "—"}</td>
                            <td className="px-5 py-3.5 text-gray-500">{b.phone || "—"}</td>
                            {/* clinicType badge (v32.0) */}
                            <td className="px-5 py-3.5">
                                {b.clinicType === "ACADEMIC" ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                        🎓 Academic
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-600 border border-blue-100">
                                        🏥 Private
                                    </span>
                                )}
                            </td>
                            <td className="px-5 py-3.5">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600">
                                    {b.chairs?.length || 0} chairs
                                </span>
                            </td>
                            <td className="px-5 py-3.5">
                                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${b.isActive !== false ? "text-emerald-600" : "text-gray-400"}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${b.isActive !== false ? "bg-emerald-500" : "bg-gray-300"}`} />
                                    {b.isActive !== false ? "Active" : "Inactive"}
                                </span>
                            </td>
                            <td className="px-5 py-3.5 text-right">
                                <div className="flex items-center justify-end gap-2">
                                    {onEdit && (
                                        <button onClick={() => onEdit(b)}
                                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors">
                                            Edit
                                        </button>
                                    )}
                                    {onDelete && (
                                        <button onClick={() => onDelete(b._id)}
                                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 transition-colors">
                                            Deactivate
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
