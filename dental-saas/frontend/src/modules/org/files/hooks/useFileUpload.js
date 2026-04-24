/**
 * useFileUpload.js — React Query Mutation Hook for File Uploads
 * Phase v27.1 — Frontend File Module
 *
 * Wraps the file upload API in a useMutation hook with:
 *   - Upload progress tracking
 *   - Automatic query invalidation (files list + related domain)
 *   - Error surfacing via global toast interceptor
 *
 * Usage:
 *   const { uploadFile, progress, isUploading } = useFileUpload({
 *       category: "recordset_photo",
 *       onSuccess: (file) => { ... },
 *   });
 *
 *   uploadFile({ file, patientId, caseId });
 *
 * SERVER STATE LAW:
 *   useMutation for writes → invalidateQueries on success
 *   NO useState(apiData) — FORBIDDEN
 *
 * PLANE: Organization
 */

import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QK } from "@/lib/query/queryKeys";
import { fileApi } from "../api/file.api";

/**
 * @param {Object} options
 * @param {string} options.category — File category (e.g. "recordset_photo", "xray", "snapshot")
 * @param {function} [options.onSuccess] — Callback with created file document
 * @param {function} [options.onError] — Callback with error
 */
export function useFileUpload({ category, onSuccess, onError } = {}) {
    const queryClient = useQueryClient();
    const [progress, setProgress] = useState(0);

    const mutation = useMutation({
        mutationFn: async ({ file, patientId, caseId, visitId }) => {
            setProgress(0);

            const formData = new FormData();
            formData.append("file", file);
            formData.append("category", category);
            if (patientId) formData.append("patientId", patientId);
            if (caseId) formData.append("caseId", caseId);
            if (visitId) formData.append("visitId", visitId);

            const res = await fileApi.upload(formData, (e) => {
                if (e.total) {
                    setProgress(Math.round((e.loaded / e.total) * 100));
                }
            });

            setProgress(100);
            return res.data?.data || res.data;
        },

        onSuccess: (data) => {
            // Invalidate file list queries so any file listings refresh
            queryClient.invalidateQueries({ queryKey: QK.files.all });
            onSuccess?.(data);
        },

        onError: (err) => {
            setProgress(0);
            onError?.(err);
        },
    });

    const uploadFile = useCallback(
        (payload) => mutation.mutate(payload),
        [mutation]
    );

    const reset = useCallback(() => {
        setProgress(0);
        mutation.reset();
    }, [mutation]);

    return {
        uploadFile,
        uploadFileAsync: mutation.mutateAsync,
        progress,
        isUploading: mutation.isPending,
        isSuccess: mutation.isSuccess,
        isError: mutation.isError,
        error: mutation.error,
        reset,
    };
}

export default useFileUpload;
