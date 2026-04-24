/**
 * scopedStorage.test.js
 * Unit tests for the org-scoped localStorage key helper.
 */
import { describe, it, expect } from 'vitest';
import { scopeKey } from '@/lib/scopedStorage';

describe('scopeKey', () => {
    it('prefixes with org:<orgId>:', () => {
        expect(scopeKey('abc', 'chart_draft', 'case-1')).toBe('org:abc:chart_draft:case-1');
    });

    it('falls back to __unbound__ when orgId missing', () => {
        expect(scopeKey(null, 'chart_draft', 'case-1')).toBe('org:__unbound__:chart_draft:case-1');
        expect(scopeKey(undefined, 'visit_notes_draft', 'v-1')).toBe('org:__unbound__:visit_notes_draft:v-1');
    });

    it('keys from different orgs never collide', () => {
        const a = scopeKey('org-A', 'chart_draft', 'case-1');
        const b = scopeKey('org-B', 'chart_draft', 'case-1');
        expect(a).not.toBe(b);
    });
});
