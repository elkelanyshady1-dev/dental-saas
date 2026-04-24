/**
 * useCaseRecordSets.ts — CaseRecordSet list for the Photo SSOT UI.
 *
 * Returns CaseRecordSet ObjectIds (NOT legacy workflow string ids), so
 * drag-to-link from CasePhotosPanel targets valid recordSetIds that the
 * backend linkPhotoToRecordSet endpoint accepts.
 *
 * SERVER STATE LAW:
 *   ✅ useQuery only
 *   ❌ useState(apiData)
 */

import { useQuery } from "@tanstack/react-query";
import api from "@/services/api";
import { QK } from "@/lib/query/queryKeys";

export type CaseRecordSetType = "diagnostic" | "progress" | "final";

export interface CaseRecordSetDTO {
    /** CaseRecordSet._id as 24-char ObjectId string. Drag-drop target. */
    id: string;
    caseId: string;
    type: CaseRecordSetType | null;
    version: number;
    isCommitted: boolean;
    photoCount: number;
    snapshotId: string | null;
    createdAt: string | null;
    /** Pre-formatted human label — "Progress v2", etc. */
    label: string;
}

const isValidObjectId = (id: string | undefined): id is string =>
    typeof id === "string" && /^[a-f\d]{24}$/i.test(id);

export function useCaseRecordSets(caseId: string | undefined) {
    return useQuery<CaseRecordSetDTO[]>({
        queryKey: caseId ? QK.orthodontics.recordSets(caseId) : ["case-record-sets", "noop"],
        queryFn:  async () => {
            const res = await api.get(`/org/orthodontic-cases/${caseId}/record-sets`);
            return (res.data?.data ?? []) as CaseRecordSetDTO[];
        },
        enabled:  isValidObjectId(caseId),
        staleTime: 50_000,
        refetchOnWindowFocus: false,
        refetchOnMount: true,
    });
}
