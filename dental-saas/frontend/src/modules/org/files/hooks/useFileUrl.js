/**
 * useFileUrl.js — React Query Hook for Resolving File Signed URLs
 * Phase v27.1 — Frontend File Module
 *
 * Fetches a signed URL for a given file ID via the File module endpoint.
 * Signed URLs are short-lived (configurable server-side, default 60s),
 * so we use a short staleTime and let React Query handle re-fetching.
 *
 * Usage:
 *   const { url, isLoading } = useFileUrl(fileId);
 *   // url is the signed URL string, or null if not yet resolved
 *
 * SERVER STATE LAW:
 *   useQuery for reads — NO useState(apiData) — FORBIDDEN
 *
 * PLANE: Organization
 */

import { useQuery } from "@tanstack/react-query";
import { QK } from "@/lib/query/queryKeys";
import { fileApi } from "../api/file.api";

/**
 * @param {string|null|undefined} fileId — File document _id (null/undefined disables the query)
 * @param {Object} [options]
 * @param {boolean} [options.enabled] — Override enabled state (default: auto based on fileId)
 * @returns {{ url: string|null, isLoading: boolean, isError: boolean, error: any }}
 */
export function useFileUrl(fileId, options = {}) {
    const {
        enabled = !!fileId,
    } = options;

    const query = useQuery({
        queryKey: QK.files.url(fileId),
        queryFn: async () => {
            const res = await fileApi.getUrl(fileId);
            return res.data?.data?.url || res.data?.url || null;
        },
        enabled: enabled && !!fileId,
        staleTime: 45_000,  // Signed URLs expire server-side (default 60s); refetch before expiry
        gcTime: 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
    });

    return {
        url: query.data ?? null,
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        isError: query.isError,
        error: query.error,
    };
}

/**
 * useFileList — Fetch paginated file list with optional filters.
 *
 * @param {Object} filters — { category?, patientId?, caseId?, visitId?, page?, limit? }
 * @param {Object} [options]
 * @param {boolean} [options.enabled]
 */
export function useFileList(filters = {}, options = {}) {
    const { enabled = true } = options;

    const query = useQuery({
        queryKey: QK.files.list(filters),
        queryFn: async () => {
            const res = await fileApi.list(filters);
            return res.data?.data || res.data;
        },
        enabled,
        staleTime: 30_000,
        gcTime: 60_000,
        refetchOnWindowFocus: false,
    });

    return {
        files: query.data?.files || [],
        total: query.data?.total || 0,
        isLoading: query.isLoading,
        isError: query.isError,
        error: query.error,
    };
}

export default useFileUrl;
