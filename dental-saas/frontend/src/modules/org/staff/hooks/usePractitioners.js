/**
 * usePractitioners.js — React Query hook for active practitioners
 *
 * Fetches users with `isPractitioner: true` from /org/users/practitioners.
 *
 * v32.0 — switched from role-based lookup to isPractitioner flag.
 * This allows admins and custom roles to appear as practitioners.
 *
 * Data shape: { _id, name, specialtyKey, specialty, avatarUrl, branchAccess[], hasFullBranchAccess }
 *
 * Used by:
 *  - PractitionerSelectorModal (calendar filter)
 *  - CreateAppointmentDrawer (doctor dropdown)
 *  - EditAppointmentDrawer (doctor dropdown)
 *
 * RULE: Server state — no useState(apiData), no refetch().
 *       Invalidate via queryClient.invalidateQueries(["org", "practitioners"])
 *       when a staff member's isPractitioner flag changes.
 */
import { useQuery } from "@tanstack/react-query";
import { staffApi } from "../api/staff.api";

// ── Specialty value → display label ───────────────────────────────────────────
const SPECIALTY_LABELS = {
    orthodontist:   "Orthodontist",
    general:        "General Dentist",
    periodontist:   "Periodontist",
    endodontist:    "Endodontist",
    pediatric:      "Pediatric Dentist",
    surgeon:        "Oral Surgeon",
    prosthodontist: "Prosthodontist",
    other:          "Specialist",
};

/**
 * @returns {import("@tanstack/react-query").UseQueryResult<Practitioner[]>}
 *
 * @typedef {Object} Practitioner
 * @property {string} _id
 * @property {string} name            - Full name
 * @property {string} specialtyKey    - Raw canonical value e.g. "orthodontist"
 * @property {string} specialty       - Display label e.g. "Orthodontist"
 * @property {string|null} avatarUrl
 * @property {string[]} branchAccess  - Array of branch ObjectId strings
 * @property {boolean} hasFullBranchAccess
 */
export function usePractitioners() {
    return useQuery({
        queryKey: ["org", "practitioners"],
        queryFn: async () => {
            const res = await staffApi.getPractitioners();
            const raw = res.data?.data?.practitioners || [];
            // Normalize specialty key → display label
            return raw.map(p => ({
                ...p,
                specialtyKey: p.specialty,
                specialty: SPECIALTY_LABELS[p.specialty] || p.specialty || "General Dentist",
            }));
        },
        staleTime: 5 * 60 * 1000, // 5 min — isPractitioner changes are rare
        gcTime: 10 * 60 * 1000,
    });
}

/**
 * Filter practitioners by branch access.
 * Handles both specific branch IDs (branchAccess[]) and full-access doctors.
 *
 * @param {Practitioner[]} practitioners
 * @param {string|null} branchId - The currently selected branch ID
 * @returns {Practitioner[]}
 */
export function filterPractitionersByBranch(practitioners, branchId) {
    if (!branchId) return practitioners; // No branch filter — show all
    return practitioners.filter(
        (doc) =>
            doc.hasFullBranchAccess ||
            doc.branchAccess?.includes(branchId)
    );
}
