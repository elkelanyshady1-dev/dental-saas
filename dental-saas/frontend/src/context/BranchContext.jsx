import { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import api, { setActiveBranchId as syncBranchIdToApi } from "../services/api";

const BranchContext = createContext(null);

export const useBranch = () => useContext(BranchContext);

/**
 * BranchContext (v2.0)
 * Manages both the list of authorized branches and the "Active Context" branch.
 * Persists activeBranchId in localStorage to maintain context across reloads.
 */
export function BranchProvider({ children }) {
    const { user, hasFullBranchAccess, multiBranchView } = useAuth();

    // Global branch list with full metadata
    const [branches, setBranches] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // Single active branch context (Digital Twin requirement)
    const [activeBranchId, setActiveBranchId] = useState(() => {
        const stored = localStorage.getItem("activeBranchId") || null;
        // ── Critical: prime api.js sessionStorage so mutations don't get 400 ──
        // BranchContext uses localStorage (cross-tab persistence) but api.js
        // reads from sessionStorage. Sync on every cold mount.
        if (stored) syncBranchIdToApi(stored);
        return stored;
    });

    // Multi-select for calendar/reports
    const [selectedBranches, setSelectedBranches] = useState([]);

    /* ── 1. Fetch Branches & Initialize Context ────────────────── */
    useEffect(() => {
        if (!user) {
            setBranches([]);
            return;
        }

        const loadBranches = async () => {
            setIsLoading(true);
            try {
                const res = await api.get("/org/context/branches");
                const list = Array.isArray(res) ? res : res.data || [];
                console.log("[BranchContext] Loaded Branches:", list);
                setBranches(list);

                // Initialize Active Branch
                const storedId = localStorage.getItem("activeBranchId");
                const isValid = list.some(b => b._id === storedId);

                if (!storedId || !isValid) {
                    if (list.length > 0) {
                        const firstId = list[0]._id;
                        setActiveBranchId(firstId);
                        localStorage.setItem("activeBranchId", firstId);
                        syncBranchIdToApi(firstId); // keep api.js sessionStorage in sync
                    }
                } else if (storedId && isValid) {
                    // storedId is already validated — ensure api.js is primed
                    syncBranchIdToApi(storedId);
                }
            } catch (err) {
                console.error("[BranchContext] Failed to load authorized branches:", err);
            } finally {
                setIsLoading(false);
            }
        };

        loadBranches();
    }, [user]);

    /* ── 2. Sync selectedBranches for Multi-View ────────────────── */
    useEffect(() => {
        if (!branches.length) return;

        if (hasFullBranchAccess) {
            setSelectedBranches([]); // Backend resolves all
        } else {
            if (multiBranchView) {
                setSelectedBranches(branches.map(b => b._id));
            } else {
                setSelectedBranches(activeBranchId ? [activeBranchId] : [branches[0]._id]);
            }
        }
    }, [branches, hasFullBranchAccess, multiBranchView, activeBranchId]);

    /* ── 3. Action: Switch Context ────────────────────────────── */
    const switchActiveBranch = async (branchId) => {
        try {
            // Signal intent to backend for audit logging & session context
            await api.post("/org/context/switch", { branchId });

            setActiveBranchId(branchId);
            localStorage.setItem("activeBranchId", branchId);
            syncBranchIdToApi(branchId); // ← sync api.js sessionStorage (prevents 400 on mutations)

            // If not in multi-view, sync selection
            if (!multiBranchView) {
                setSelectedBranches([branchId]);
            }

            return true;
        } catch (err) {
            console.error("[BranchContext] Context switch ignored by server:", err);
            return false;
        }
    };

    const toggleBranch = (branchId) => {
        if (!multiBranchView) {
            switchActiveBranch(branchId);
            return;
        }
        setSelectedBranches((prev) =>
            prev.includes(branchId) ? prev.filter((id) => id !== branchId) : [...prev, branchId]
        );
    };

    return (
        <BranchContext.Provider
            value={{
                branches,
                activeBranchId,
                activeBranch: branches.find(b => b._id === activeBranchId) || null,
                setActiveBranchId: switchActiveBranch,
                selectedBranches,
                setSelectedBranches,
                toggleBranch,
                multiBranchView,
                isLoading
            }}
        >
            {children}
        </BranchContext.Provider>
    );
}
