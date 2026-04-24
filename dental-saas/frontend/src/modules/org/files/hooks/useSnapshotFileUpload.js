/**
 * useSnapshotFileUpload.js — Snapshot Thumbnail Upload via File Module
 * Phase v27.1 — Frontend File Module + Snapshot Integration
 *
 * Uploads a snapshot thumbnail (PNG blob from html-to-image) via the
 * File module endpoint with category "snapshot". Returns the File
 * document _id so it can be stored alongside the snapshot record.
 *
 * INTEGRATION POINT:
 *   SnapshotEditor.tsx currently generates a base64 data URI via toPng()
 *   and includes it inline in the snapshot payload. This hook provides
 *   an alternative path: convert to Blob → upload via File module →
 *   store fileId instead of inline blob.
 *
 * Usage in SnapshotEditor:
 *   const { uploadSnapshotThumbnail } = useSnapshotFileUpload({ caseId });
 *
 *   // In handleSaveSnapshot:
 *   const dataUrl = await toPng(chartRef.current, { quality: 0.85 });
 *   const blob = dataURLtoBlob(dataUrl);
 *   const { fileId } = await uploadSnapshotThumbnail(blob, "snapshot-2024.png");
 *   // Include fileId in snapshot payload instead of base64
 *
 * PLANE: Organization
 */

import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QK } from "@/lib/query/queryKeys";
import { fileApi } from "../api/file.api";

/**
 * Convert a data URL (base64) to a Blob.
 * @param {string} dataUrl — e.g. "data:image/png;base64,..."
 * @returns {Blob}
 */
export function dataURLtoBlob(dataUrl) {
    const parts = dataUrl.split(",");
    const mime = parts[0].match(/:(.*?);/)?.[1] || "image/png";
    const bstr = atob(parts[1]);
    const n = bstr.length;
    const u8arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        u8arr[i] = bstr.charCodeAt(i);
    }
    return new Blob([u8arr], { type: mime });
}

/**
 * @param {Object} options
 * @param {string} [options.caseId] — Orthodontic case ID
 * @param {string} [options.patientId] — Patient ID
 * @param {string} [options.visitId] — Visit ID
 */
export function useSnapshotFileUpload({ caseId, patientId, visitId } = {}) {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({ blob, fileName }) => {
            const formData = new FormData();
            formData.append("file", blob, fileName || "snapshot.png");
            formData.append("category", "snapshot");
            if (caseId) formData.append("caseId", caseId);
            if (patientId) formData.append("patientId", patientId);
            if (visitId) formData.append("visitId", visitId);

            const res = await fileApi.upload(formData);
            const fileDoc = res.data?.data || res.data;
            return {
                fileId: fileDoc?._id || fileDoc?.id,
                file: fileDoc,
            };
        },

        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QK.files.all });
        },
    });

    /**
     * Upload a snapshot thumbnail blob.
     *
     * @param {Blob} blob — PNG blob (from toPng or canvas.toBlob)
     * @param {string} [fileName] — e.g. "snapshot-2024-01-15.png"
     * @returns {Promise<{ fileId: string, file: Object }>}
     */
    const uploadSnapshotThumbnail = useCallback(
        (blob, fileName) => mutation.mutateAsync({ blob, fileName }),
        [mutation]
    );

    /**
     * Convenience: upload from a data URL string (e.g. from toPng).
     *
     * @param {string} dataUrl — base64 data URI
     * @param {string} [fileName]
     * @returns {Promise<{ fileId: string, file: Object }>}
     */
    const uploadSnapshotFromDataUrl = useCallback(
        (dataUrl, fileName) => {
            const blob = dataURLtoBlob(dataUrl);
            return mutation.mutateAsync({ blob, fileName });
        },
        [mutation]
    );

    return {
        uploadSnapshotThumbnail,
        uploadSnapshotFromDataUrl,
        isUploading: mutation.isPending,
        isError: mutation.isError,
        error: mutation.error,
    };
}

export default useSnapshotFileUpload;
