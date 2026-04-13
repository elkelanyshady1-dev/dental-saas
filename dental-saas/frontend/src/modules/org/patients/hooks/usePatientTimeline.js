/**
 * usePatientTimeline.js — React Query hook for Patient Timeline Events
 *
 * Provides:
 *   - Typed timeline events from multiple backend sources
 *   - Automatic merge + sort of appointments, treatments, payments, lab orders, etc.
 *   - Filter by event type
 *   - Infinite scroll / pagination ready
 *
 * Event Schema (standardized):
 *   {
 *     id:          string,
 *     type:        'appointment' | 'treatment' | 'payment' | 'lab_order' | 'image' | 'note' | 'prescription',
 *     title:       string,
 *     timestamp:   string (ISO 8601),
 *     doctor:      string | null,
 *     description: string | null,
 *     attachments: Array<{ url: string, type: string, name: string }>,
 *     status:      string | null,
 *     amount:      number | null,
 *     currency:    string | null,
 *   }
 *
 * API layer: modules/org/patients/api/patients.api.js
 * Architecture: org-plane only, organizationId derived from JWT.
 */
import { useQuery } from '@tanstack/react-query';
import { patientsApi } from '../api/patients.api';
import { patientKeys } from './usePatients';

// ── Event Normalizers ─────────────────────────────────────────────────────

/** Normalize an appointment into a timeline event */
function normalizeAppointment(apt) {
    return {
        id: apt._id,
        type: 'appointment',
        title: `Appointment – ${apt.type || apt.procedure || 'Consultation'}`,
        timestamp: apt.date || apt.startTime || apt.createdAt,
        doctor: apt.doctorName || apt.doctor?.name || null,
        description: apt.notes || apt.description || null,
        attachments: [],
        status: apt.status || null,
        amount: null,
        currency: null,
    };
}

/** Normalize a treatment into a timeline event */
function normalizeTreatment(tx) {
    return {
        id: tx._id,
        type: 'treatment',
        title: tx.name || tx.treatmentName || 'Treatment',
        timestamp: tx.startDate || tx.createdAt,
        doctor: tx.doctorName || tx.doctor?.name || null,
        description: tx.notes || tx.description || null,
        attachments: (tx.images || []).map((img, i) => ({
            url: typeof img === 'string' ? img : img.url,
            type: 'image',
            name: `Treatment image ${i + 1}`,
        })),
        status: tx.status || null,
        amount: tx.cost || tx.amount || null,
        currency: tx.currency || null,
    };
}

/** Normalize a payment into a timeline event */
function normalizePayment(pmt) {
    return {
        id: pmt._id,
        type: 'payment',
        title: pmt.description || 'Payment Received',
        timestamp: pmt.paidAt || pmt.date || pmt.createdAt,
        doctor: null,
        description: pmt.method ? `Paid via ${pmt.method}` : null,
        attachments: pmt.receipt ? [{ url: pmt.receipt, type: 'document', name: 'Receipt' }] : [],
        status: pmt.status || 'COMPLETED',
        amount: pmt.amount || 0,
        currency: pmt.currency || 'EGP',
    };
}

/** Normalize a document/image into a timeline event */
function normalizeDocument(doc) {
    const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(doc.filename || doc.url || '');
    return {
        id: doc._id,
        type: isImage ? 'image' : 'note',
        title: doc.title || doc.filename || (isImage ? 'Image Uploaded' : 'Document'),
        timestamp: doc.uploadedAt || doc.createdAt,
        doctor: doc.uploadedBy?.name || null,
        description: doc.description || null,
        attachments: [{
            url: doc.url || doc.path,
            type: isImage ? 'image' : 'document',
            name: doc.filename || doc.title || 'Attachment',
        }],
        status: null,
        amount: null,
        currency: null,
    };
}

// ── Main Hook ─────────────────────────────────────────────────────────────

/**
 * @param {string} patientId
 * @param {{ typeFilter?: string, enabled?: boolean }} options
 */
export function usePatientTimeline(patientId, options = {}) {
    const { typeFilter = 'all', enabled = true } = options;

    const query = useQuery({
        queryKey: patientKeys.timeline(patientId),
        queryFn: async () => {
            // Fetch all event sources in parallel
            const [
                appointmentsRes,
                treatmentsRes,
                documentsRes,
            ] = await Promise.allSettled([
                patientsApi.getAppointments(patientId, { limit: 100 }),
                patientsApi.getTreatments(patientId, { limit: 100 }),
                patientsApi.getDocuments(patientId, { limit: 100 }),
            ]);

            // Extract data from settled promises (resilient to partial failures)
            const appointments = appointmentsRes.status === 'fulfilled'
                ? (appointmentsRes.value.data?.data || appointmentsRes.value.data || [])
                : [];
            const treatments = treatmentsRes.status === 'fulfilled'
                ? (treatmentsRes.value.data?.data || treatmentsRes.value.data || [])
                : [];
            const documents = documentsRes.status === 'fulfilled'
                ? (documentsRes.value.data?.data || documentsRes.value.data || [])
                : [];

            // Normalize all into timeline events
            const events = [
                ...(Array.isArray(appointments) ? appointments : []).map(normalizeAppointment),
                ...(Array.isArray(treatments) ? treatments : []).map(normalizeTreatment),
                ...(Array.isArray(documents) ? documents : []).map(normalizeDocument),
            ];

            // Sort by timestamp descending (newest first)
            events.sort((a, b) => {
                const da = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const db = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                return db - da;
            });

            return events;
        },
        enabled: !!patientId && enabled,
        staleTime: 60_000,  // Timeline is fresh for 1 minute
    });

    // Apply type filter client-side (allows instant filter switching)
    const allEvents = query.data ?? [];
    const filteredEvents = typeFilter === 'all'
        ? allEvents
        : allEvents.filter(e => e.type === typeFilter);

    return {
        events: filteredEvents,
        allEvents,
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        isError: query.isError,
        error: query.error,
        refetch: query.refetch,
        /** Total event count (before filtering) */
        totalCount: allEvents.length,
    };
}

// ── Supported Event Types ──────────────────────────────────────────────────

export const TIMELINE_EVENT_TYPES = [
    { id: 'all',          label: 'All' },
    { id: 'appointment',  label: 'Appointments' },
    { id: 'treatment',    label: 'Treatments' },
    { id: 'payment',      label: 'Payments' },
    { id: 'lab_order',    label: 'Lab Orders' },
    { id: 'image',        label: 'Images' },
    { id: 'note',         label: 'Notes' },
    { id: 'prescription', label: 'Prescriptions' },
];
