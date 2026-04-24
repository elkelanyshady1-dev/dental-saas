/**
 * useRecordPhotoUpload.js — RecordSet Photo Upload via File Module
 * Phase v27.1 — Frontend File Module + RecordSet Integration
 *
 * Drop-in replacement for the legacy `orthodonticsApi.uploadPhoto(file)` flow.
 * Uploads via the File module endpoint (POST /org/files/upload) with category
 * "recordset_photo", returning both the File document _id (photoFileId) and
 * the signed URL for immediate display.
 *
 * BACKWARD COMPATIBILITY:
 *   The returned object includes both `fileId` and `url`, so the caller can
 *   store `photoFileId` (new) while immediately rendering via `url` (same UX).
 *
 * Usage in OrthoRecordsTab:
 *   const { uploadRecordPhoto, isUploading } = useRecordPhotoUpload({ caseId });
 *
 *   // In handleCompressionConfirm:
 *   const { fileId, url } = await uploadRecordPhoto(file);
 *   setRecords(prev => prev.map(r =>
 *     r.id === selectedPhoto.id ? { ...r, url, photoFileId: fileId, previewUrl: null } : r
 *   ));
 *
 * PLANE: Organization
 */

import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QK } from "@/lib/query/queryKeys";
import { fileApi } from "../api/file.api";

/**
 * @param {Object} options
 * @param {string} [options.caseId] — Orthodontic case ID
 * @param {string} [options.patientId] — Patient ID
 * @param {string} [options.visitId] — Visit ID
 */
export function useRecordPhotoUpload({ caseId, patientId, visitId } = {}) {
    const queryClient = useQueryClient();
    const [progress, setProgress] = useState(0);

    const mutation = useMutation({
        mutationFn: async (file) => {
            setProgress(0);

            const formData = new FormData();
            formData.append("file", file);
            formData.append("category", "recordset_photo");
            if (caseId) formData.append("caseId", caseId);
            if (patientId) formData.append("patientId", patientId);
            if (visitId) formData.append("visitId", visitId);

            // TODO: POLICY ENFORCEMENT
            // Upload currently allowed due to shadow mode.
            // Verify "files.create" permission before disabling shadow mode.
            let uploadRes;
            try {
                uploadRes = await fileApi.upload(formData, (e) => {
                    if (e.total) {
                        setProgress(Math.round((e.loaded / e.total) * 100));
                    }
                });
            } catch (error) {
                console.error("Upload failed:", error?.response?.data || error.message);
                throw error;
            }

            setProgress(100);

            const fileData = uploadRes?.data?.data;
            const fileId = fileData?.fileId || fileData?._id || null;
            const url = fileData?.url || null;

            if (!fileId || !url) {
                throw new Error("Upload succeeded but URL missing");
            }

            return { fileId, url, file: fileData };
        },

        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QK.files.all });
        },

        onSettled: () => {
            setProgress(0);
        },
    });

    /**
     * Upload a single photo file for a RecordSet record.
     * @param {File} file — The image file to upload
     * @returns {Promise<{ fileId: string, url: string|null, file: Object }>}
     */
    const uploadRecordPhoto = useCallback(
        (file) => mutation.mutateAsync(file),
        [mutation]
    );

    return {
        uploadRecordPhoto,
        progress,
        isUploading: mutation.isPending,
        isError: mutation.isError,
        error: mutation.error,
    };
}

export default useRecordPhotoUpload;
