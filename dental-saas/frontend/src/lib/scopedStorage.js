/**
 * scopedStorage.js — org-scoped localStorage key helper.
 *
 * Prevents cross-org draft/data leakage on shared clinic workstations where
 * multiple orgs may log in back-to-back under the same browser origin.
 *
 * Usage:
 *   import { useScopedKey } from '@/lib/scopedStorage';
 *   const key = useScopedKey();              // bound to current org
 *   const draftKey = key('chart_draft', caseId); // "org:<orgId>:chart_draft:<caseId>"
 *   localStorage.setItem(draftKey, ...);
 *
 * If no org is resolved yet (e.g. during first render before AuthContext
 * hydrates), keys fall back to a sentinel so drafts from an unauthenticated
 * shell never collide with real org data.
 */

import { useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';

const UNBOUND = '__unbound__';

export function scopeKey(orgId, ...parts) {
    const scoped = orgId ? String(orgId) : UNBOUND;
    return ['org', scoped, ...parts.map(String)].join(':');
}

export function useScopedKey() {
    const { organizationId } = useAuth() || {};
    return useCallback(
        (...parts) => scopeKey(organizationId, ...parts),
        [organizationId],
    );
}

export default useScopedKey;
