import { useAuth } from "../context/AuthContext";
import { useBranch } from "../context/BranchContext";

export default function TopBar() {
    const { user, logout, allowedBranches, hasFullBranchAccess } = useAuth();
    const { selectedBranches, toggleBranch, multiBranchView } = useBranch();

    /* Build branch list for selector */
    const branchList = hasFullBranchAccess ? [] : allowedBranches;

    return (
        <header className="h-14 bg-slate-900/80 backdrop-blur-md border-b border-slate-700/50 flex items-center justify-between px-6">
            {/* Branch selector */}
            <div className="flex items-center gap-2">
                {branchList.length > 0 && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500 mr-1">Branch:</span>
                        {branchList.map((b) => {
                            const id = typeof b === "string" ? b : b._id || b;
                            const name = typeof b === "object" && b.name ? b.name : id.slice(-4);
                            const active = selectedBranches.includes(id);
                            return (
                                <button
                                    key={id}
                                    onClick={() => toggleBranch(id)}
                                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${active
                                        ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                                        : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                                        }`}
                                >
                                    {name}
                                </button>
                            );
                        })}
                        {multiBranchView && (
                            <span className="text-[10px] text-slate-600 ml-1">multi</span>
                        )}
                    </div>
                )}
                {hasFullBranchAccess && (
                    <span className="text-xs text-emerald-500/70">All branches</span>
                )}
            </div>

            {/* User menu */}
            <div className="flex items-center gap-4">
                <div className="flex flex-col items-end">
                    <span className="text-sm font-bold text-white leading-none">{user?.name || "User"}</span>
                    {user?.organization?.slug && (
                        <span className="text-[10px] text-blue-400 font-mono tracking-wider mt-1 uppercase">
                            ID: {user.organization.slug}
                        </span>
                    )}
                </div>
                <button
                    onClick={logout}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-400 hover:bg-red-600/20 hover:text-red-400 transition-all duration-200"
                >
                    Logout
                </button>
            </div>
        </header>
    );
}
