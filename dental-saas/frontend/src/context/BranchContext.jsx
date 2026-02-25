import { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";

const BranchContext = createContext(null);

export const useBranch = () => useContext(BranchContext);

export function BranchProvider({ children }) {
    const { allowedBranches, hasFullBranchAccess, multiBranchView } = useAuth();
    const [selectedBranches, setSelectedBranches] = useState([]);

    /* ── Initialize on auth load ─────────────────────────── */
    useEffect(() => {
        if (hasFullBranchAccess) {
            // Unrestricted user — let calendar endpoint resolve
            setSelectedBranches([]);
        } else if (allowedBranches?.length > 0) {
            if (multiBranchView) {
                setSelectedBranches(allowedBranches.map((b) => (typeof b === "string" ? b : b._id || b)));
            } else {
                // Single branch only
                const first = allowedBranches[0];
                setSelectedBranches([typeof first === "string" ? first : first._id || first]);
            }
        }
    }, [allowedBranches, hasFullBranchAccess, multiBranchView]);

    /* ── Safe setter: enforce single-select when no multiBranch ── */
    const setBranches = (branches) => {
        if (!multiBranchView && branches.length > 1) {
            setSelectedBranches([branches[branches.length - 1]]);
        } else {
            setSelectedBranches(branches);
        }
    };

    const toggleBranch = (branchId) => {
        if (!multiBranchView) {
            setSelectedBranches([branchId]);
            return;
        }
        setSelectedBranches((prev) =>
            prev.includes(branchId) ? prev.filter((id) => id !== branchId) : [...prev, branchId]
        );
    };

    return (
        <BranchContext.Provider
            value={{
                selectedBranches,
                setSelectedBranches: setBranches,
                toggleBranch,
                multiBranchView,
            }}
        >
            {children}
        </BranchContext.Provider>
    );
}
