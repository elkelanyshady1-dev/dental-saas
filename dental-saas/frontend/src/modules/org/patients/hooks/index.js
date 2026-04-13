/**
 * Patient Domain Hooks — Barrel Export
 *
 * All patient-related React Query hooks in one place.
 *
 * Usage:
 *   import { usePatients, usePatient, usePatientTimeline } from '@/modules/org/patients/hooks';
 */

// ── List & Directory ──────────────────────────────────────────────────────
export {
    patientKeys,
    usePatients,
    useCreatePatient,
    useQuickCreatePatient,
    useDeletePatient,
    useBulkPatientAction,
} from './usePatients';

// ── Single Patient Profile ────────────────────────────────────────────────
export {
    usePatient,
    useUpdatePatient,
    usePatchPatient,
    useUpdateClinical,
    useFamilyMembers,
    useLinkFamily,
    useAddTag,
    useRemoveTag,
} from './usePatient';

// ── Timeline ──────────────────────────────────────────────────────────────
export {
    usePatientTimeline,
    TIMELINE_EVENT_TYPES,
} from './usePatientTimeline';

// ── Provider ──────────────────────────────────────────────────────────────
export { QueryProvider, queryClient } from './QueryProvider';
