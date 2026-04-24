import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patientsApi } from '../api/patients.api';
import { QK } from '@/lib/query';

export function usePatientDocuments(patientId, params = {}, options = {}) {
    const { enabled = true } = options;

    const query = useQuery({
        queryKey: [...QK.patients.documents(patientId), params],
        queryFn: async () => {
            const res = await patientsApi.getDocuments(patientId, params);
            return res.data?.data || res.data?.documents || res.data || [];
        },
        enabled: !!patientId && enabled,
        staleTime: 30_000,
    });

    return {
        documents: Array.isArray(query.data) ? query.data : [],
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        isError: query.isError,
        error: query.error,
    };
}

export function useUploadPatientDocument(patientId) {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async (formData) => {
            const res = await patientsApi.uploadDocument(patientId, formData);
            return res.data?.data || res.data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: QK.patients.documents(patientId) });
            qc.invalidateQueries({ queryKey: QK.patients.detail(patientId) });
        },
    });
}

export function useDeletePatientDocument(patientId) {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async (docId) => {
            const res = await patientsApi.deleteDocument(docId);
            return res.data?.data || res.data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: QK.patients.documents(patientId) });
            qc.invalidateQueries({ queryKey: QK.patients.detail(patientId) });
        },
    });
}
