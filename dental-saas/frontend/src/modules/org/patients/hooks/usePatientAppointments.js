import { useQuery } from '@tanstack/react-query';
import { patientsApi } from '../api/patients.api';
import { QK } from '@/lib/query';

export function usePatientAppointments(patientId, params = {}, options = {}) {
    const { enabled = true } = options;

    const query = useQuery({
        queryKey: [...QK.patients.appointments(patientId), params],
        queryFn: async () => {
            const res = await patientsApi.getAppointments(patientId, params);
            return res.data?.data || res.data?.appointments || res.data || [];
        },
        enabled: !!patientId && enabled,
        staleTime: 30_000,
    });

    return {
        appointments: Array.isArray(query.data) ? query.data : [],
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        isError: query.isError,
        error: query.error,
    };
}
