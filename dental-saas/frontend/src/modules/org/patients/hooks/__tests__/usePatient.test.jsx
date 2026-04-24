/**
 * Seed tests for patient-domain React Query hooks.
 * Verifies query keys, hook shape, and basic data flow.
 *
 * These are the first frontend tests for the patient domain (C11) — they
 * seed the infra so additional hook + component tests can follow the same
 * pattern: QueryClient wrapper + axios mock via vi.mock().
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QK } from '@/lib/query';

// Mock the api service so hooks don't hit the network.
vi.mock('@/services/api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    },
}));

import api from '@/services/api';
import { usePatient } from '../usePatient';
import { usePatientAppointments } from '../usePatientAppointments';
import { usePatientDocuments } from '../usePatientDocuments';

function wrapper({ children }) {
    const qc = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 0 } },
    });
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('Patient query-key registry', () => {
    it('detail key is stable and nests under patients.all', () => {
        const key = QK.patients.detail('abc');
        expect(key).toEqual(['patients', 'detail', 'abc']);
    });

    it('appointments key nests under detail so invalidating detail invalidates appointments', () => {
        const detail = QK.patients.detail('abc');
        const appts = QK.patients.appointments('abc');
        expect(appts.slice(0, detail.length)).toEqual(detail);
    });

    it('documents key nests under detail', () => {
        const detail = QK.patients.detail('abc');
        const docs = QK.patients.documents('abc');
        expect(docs.slice(0, detail.length)).toEqual(detail);
    });
});

describe('usePatient', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns aggregate data on successful fetch', async () => {
        api.get.mockResolvedValueOnce({ data: { data: { _id: 'abc', core: { nameEnglish: 'Jane' } } } });

        const { result } = renderHook(() => usePatient('abc'), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.aggregate).toMatchObject({ _id: 'abc' });
        expect(result.current.patient).toBe(result.current.aggregate);
    });

    it('does not fetch when id is empty', () => {
        renderHook(() => usePatient(''), { wrapper });
        expect(api.get).not.toHaveBeenCalled();
    });
});

describe('usePatientAppointments', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns the appointments array unwrapped from the common response shapes', async () => {
        api.get.mockResolvedValueOnce({ data: { data: [{ _id: 'a1' }, { _id: 'a2' }] } });

        const { result } = renderHook(() => usePatientAppointments('abc'), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.appointments).toHaveLength(2);
    });

    it('returns [] when API returns nothing sensible', async () => {
        api.get.mockResolvedValueOnce({ data: null });

        const { result } = renderHook(() => usePatientAppointments('abc'), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.appointments).toEqual([]);
    });
});

describe('usePatientDocuments', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns the documents array', async () => {
        api.get.mockResolvedValueOnce({ data: { data: [{ _id: 'd1', originalName: 'x.pdf' }] } });

        const { result } = renderHook(() => usePatientDocuments('abc'), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.documents).toHaveLength(1);
        expect(result.current.documents[0].originalName).toBe('x.pdf');
    });
});
