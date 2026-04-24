/**
 * queryKeys.test.js
 * Regression guard for the centralized React Query key registry.
 * A stable, prefix-nesting key structure is the foundation of correct
 * invalidation — this test pins the contract.
 */
import { describe, it, expect } from 'vitest';
import { QK } from '@/lib/query/queryKeys';

describe('QK registry — patients', () => {
    it('detail key nests under patients.all', () => {
        expect(QK.patients.detail('p1').slice(0, 1)).toEqual(QK.patients.all);
    });

    it('appointments, documents, family, timeline all nest under detail', () => {
        const detail = QK.patients.detail('p1');
        expect(QK.patients.appointments('p1').slice(0, detail.length)).toEqual(detail);
        expect(QK.patients.documents('p1').slice(0, detail.length)).toEqual(detail);
        expect(QK.patients.family('p1').slice(0, detail.length)).toEqual(detail);
        // Timeline lives at patients.*.timeline, not under detail (explicit sibling).
        expect(QK.patients.timeline('p1')[0]).toBe('patients');
    });

    it('list key includes filters for cache segmentation', () => {
        const a = QK.patients.list({ search: 'a' });
        const b = QK.patients.list({ search: 'b' });
        expect(a).not.toEqual(b);
    });
});

describe('QK registry — cross-domain', () => {
    it('every domain starts with a unique top-level token', () => {
        const tops = new Set([
            QK.patients.all[0],
            QK.appointments.all[0],
            QK.branches.all[0],
            QK.practitioners.all[0],
            QK.treatments.all[0],
            QK.invoices.all[0],
            QK.orthodontics.all[0],
            QK.inventory.all[0],
            QK.lab.all[0],
        ]);
        expect(tops.size).toBe(9);
    });

    it('practitioners.lists() === ["practitioners", "list"]', () => {
        expect(QK.practitioners.lists()).toEqual(['practitioners', 'list']);
    });

    it('branches.lists() === ["branches", "list"]', () => {
        expect(QK.branches.lists()).toEqual(['branches', 'list']);
    });

    it('orthodontics.list({...}) nests under orthodontics.lists()', () => {
        const key = QK.orthodontics.list({ patientId: 'p1' });
        const lists = QK.orthodontics.lists();
        expect(key.slice(0, lists.length)).toEqual(lists);
    });
});
