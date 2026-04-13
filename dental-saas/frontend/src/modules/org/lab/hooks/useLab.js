/**
 * useLab.js — Lab Domain React Query Hooks
 *
 * RULES:
 *   11.1 — All server state via useQuery
 *   11.2 — All keys from QK.lab.*
 *   11.6 — staleTime / gcTime enforced
 *
 * PLANE: Org only.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { labApi } from "../api/lab.api";
import { QK }     from "@/lib/query/queryKeys";

const STALE  = 30 * 1000;
const GC     = 5 * 60 * 1000;
const RFW    = false;   // refetchOnWindowFocus — explicit invalidation only

// ── READ HOOKS ────────────────────────────────────────────────────────────────

export const useLabDashboard = () =>
    useQuery({ queryKey: QK.lab.dashboard(), queryFn: () => labApi.getDashboard().then(r => r.data),
               staleTime: STALE, gcTime: GC, refetchOnWindowFocus: RFW });

export const useLabPartners = (params = {}) =>
    useQuery({ queryKey: QK.lab.labs(params), queryFn: () => labApi.getLabs(params).then(r => r.data),
               staleTime: STALE, gcTime: GC, refetchOnWindowFocus: RFW });

export const useLabPartner = (id) =>
    useQuery({ queryKey: QK.lab.labDetail(id), queryFn: () => labApi.getLab(id).then(r => r.data),
               enabled: !!id, staleTime: STALE, gcTime: GC, refetchOnWindowFocus: RFW });

export const useLabCases = (params = {}) =>
    useQuery({ queryKey: QK.lab.cases(params), queryFn: () => labApi.getCases(params).then(r => r.data),
               staleTime: STALE, gcTime: GC, refetchOnWindowFocus: RFW });

export const useLabKanban = () =>
    useQuery({ queryKey: QK.lab.kanban(), queryFn: () => labApi.getKanban().then(r => r.data),
               staleTime: STALE, gcTime: GC, refetchOnWindowFocus: RFW });

export const useLabPriority = () =>
    useQuery({ queryKey: QK.lab.priority(), queryFn: () => labApi.getPriority().then(r => r.data),
               staleTime: STALE, gcTime: GC, refetchOnWindowFocus: RFW });

export const useLabCase = (id) =>
    useQuery({ queryKey: QK.lab.caseDetail(id), queryFn: () => labApi.getCase(id).then(r => r.data),
               enabled: !!id, staleTime: STALE, gcTime: GC, refetchOnWindowFocus: RFW });

export const useLabMessages = (caseId) =>
    useQuery({ queryKey: QK.lab.messages(caseId), queryFn: () => labApi.getMessages(caseId).then(r => r.data),
               enabled: !!caseId, staleTime: 10 * 1000, gcTime: GC, refetchOnWindowFocus: RFW });

export const useLabClaims = (params = {}) =>
    useQuery({ queryKey: QK.lab.claims(params), queryFn: () => labApi.getClaims(params).then(r => r.data),
               staleTime: STALE, gcTime: GC, refetchOnWindowFocus: RFW });

// ── MUTATION HOOKS ────────────────────────────────────────────────────────────

function useInvalidateAll() {
    const qc = useQueryClient();
    return () => qc.invalidateQueries({ queryKey: QK.lab.all });
}

function useInvalidateCase(id) {
    const qc = useQueryClient();
    return () => {
        qc.invalidateQueries({ queryKey: QK.lab.caseDetail(id) });
        qc.invalidateQueries({ queryKey: QK.lab.kanban() });
        qc.invalidateQueries({ queryKey: QK.lab.cases({}) });
    };
}

export const useCreateLabPartner = () => {
    const inv = useInvalidateAll();
    return useMutation({ mutationFn: (d) => labApi.createLab(d).then(r => r.data), onSuccess: inv });
};

export const useUpdateLabPartner = () => {
    const inv = useInvalidateAll();
    return useMutation({ mutationFn: ({ id, data }) => labApi.updateLab(id, data).then(r => r.data), onSuccess: inv });
};

export const useCreateLabCase = () => {
    const inv = useInvalidateAll();
    return useMutation({ mutationFn: (d) => labApi.createCase(d).then(r => r.data), onSuccess: inv });
};

export const useUpdateCaseStatus = (caseId) => {
    const inv = useInvalidateCase(caseId);
    return useMutation({ mutationFn: (d) => labApi.updateStatus(caseId, d).then(r => r.data), onSuccess: inv });
};

export const usePostMessage = (caseId) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (d)   => labApi.postMessage(caseId, d).then(r => r.data),
        onSuccess:  ()    => qc.invalidateQueries({ queryKey: QK.lab.messages(caseId) }),
    });
};

export const useCreateClaim = () => {
    const inv = useInvalidateAll();
    return useMutation({ mutationFn: (d) => labApi.createClaim(d).then(r => r.data), onSuccess: inv });
};

export const useApproveClaim = () => {
    const inv = useInvalidateAll();
    return useMutation({ mutationFn: (id) => labApi.approveClaim(id).then(r => r.data), onSuccess: inv });
};

export const useMarkClaimPaid = () => {
    const inv = useInvalidateAll();
    return useMutation({ mutationFn: (id) => labApi.markClaimPaid(id).then(r => r.data), onSuccess: inv });
};
