/**
 * useCaseVisits.ts — VisitRecord list for the Photo SSOT UI.
 *
 * Wraps the existing GET /orthodontic-cases/:id/timeline endpoint so the
 * Case Photo Pool can render ALL visits as drop targets — not only the
 * ones a given photo is already linked to. Prevents the "invisible drop
 * target" bug where users can't see a visit they haven't linked to yet.
 *
 * SERVER STATE LAW:
 *   ✅ useQuery only
 *   ❌ useState(apiData)
 */

import { useQuery } from "@tanstack/react-query";
import api from "@/services/api";
import { QK } from "@/lib/query/queryKeys";

export interface CaseVisitDTO {
    /** VisitRecord._id as 24-char ObjectId string. Drag-drop target. */
    id: string;
    visitNumber: number | null;
    visitDate: string | null;
    type: string | null;
    thumbnail: string | null;
    /** Pre-formatted human label for the sidebar row. */
    label: string;
}

const isValidObjectId = (id: string | undefined): id is string =>
    typeof id === "string" && /^[a-f\d]{24}$/i.test(id);

function formatLabel(v: { visitNumber?: number | null; visitDate?: string | null }): string {
    const num = v.visitNumber ?? null;
    if (v.visitDate) {
        const d = new Date(v.visitDate);
        const dateStr = Number.isNaN(d.getTime())
            ? v.visitDate
            : d.toLocaleDateString();
        return num ? `Visit ${num} · ${dateStr}` : `Visit · ${dateStr}`;
    }
    return num ? `Visit ${num}` : "Visit";
}

export function useCaseVisits(caseId: string | undefined) {
    return useQuery<CaseVisitDTO[]>({
        queryKey: caseId ? QK.orthodontics.visits(caseId) : ["case-visits", "noop"],
        queryFn:  async () => {
            const res = await api.get(`/org/orthodontic-cases/${caseId}/timeline`);
            const rows: Array<{
                visitId?: string;
                visitNumber?: number;
                visitDate?: string | null;
                type?: string | null;
                thumbnail?: string | null;
            }> = res.data?.data ?? [];

            return rows
                .filter((r) => isValidObjectId(r.visitId))
                .map<CaseVisitDTO>((r) => ({
                    id:          r.visitId as string,
                    visitNumber: r.visitNumber ?? null,
                    visitDate:   typeof r.visitDate === "number"
                        ? new Date(r.visitDate).toISOString()
                        : (r.visitDate ?? null),
                    type:        r.type ?? null,
                    thumbnail:   r.thumbnail ?? null,
                    label:       formatLabel({ visitNumber: r.visitNumber ?? null, visitDate: (typeof r.visitDate === "number" ? new Date(r.visitDate).toISOString() : (r.visitDate ?? null)) }),
                }));
        },
        enabled:  isValidObjectId(caseId),
        staleTime: 50_000,
        refetchOnWindowFocus: false,
        refetchOnMount: true,
    });
}
