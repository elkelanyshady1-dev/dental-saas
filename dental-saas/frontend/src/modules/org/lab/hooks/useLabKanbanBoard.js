/**
 * useLabKanbanBoard — local Kanban state with optimistic drag + echo filtering.
 *
 * ARCHITECTURE
 *   Server (React Query)           authoritative state
 *         ↓ sync effect
 *   localBoard (useState)          immediate UI
 *         ↑ moveCard / applyRemoteUpdate
 *   pendingMutations (Map)         in-flight ops we initiated locally
 *
 * CONFLICT RULES
 *   - Same user echo          → ignore (mutationId or (caseId,targetStatus) match)
 *   - Different user update   → apply to local board (even mid-drag)
 *   - Local pending + remote  → remote wins AFTER local mutation settles
 *   - Mutation error          → rollback (invalidate to rehydrate from server)
 *
 * STALENESS GUARD
 *   Pending mutations older than PENDING_TTL_MS are purged — if the server is
 *   slow or the client dropped the response, we don't block remote updates
 *   forever.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const KANBAN_COLUMNS = [
    "draft",
    "sent",
    "accepted",
    "in_production",
    "shipped",
    "delivered",
];

const PENDING_TTL_MS = 15 * 1000;

function emptyBoard() {
    const board = {};
    for (const col of KANBAN_COLUMNS) board[col] = [];
    return board;
}

/** Group a flat array of cases by status into a { status: [cases] } map. */
function groupCases(cases) {
    const board = emptyBoard();
    if (!Array.isArray(cases)) return board;
    for (const c of cases) {
        if (!c || !c.status) continue;
        if (!board[c.status]) board[c.status] = [];
        board[c.status].push(c);
    }
    return board;
}

/**
 * Merge a server-derived board with a local one, preserving any cards that are
 * currently in pendingMutations. Cards in pending keep their locally-moved
 * position. Cards not in pending are taken from the server snapshot.
 */
function mergeWithPending(serverBoard, pendingCaseIds, prevLocalBoard) {
    if (pendingCaseIds.size === 0) return serverBoard;

    const merged = {};
    for (const col of KANBAN_COLUMNS) {
        merged[col] = [];
    }
    const seen = new Set();

    // 1. Drop server-side copies of any pending cards (their canonical position
    //    is in the local board until mutation settles).
    for (const col of KANBAN_COLUMNS) {
        const src = serverBoard[col] || [];
        for (const c of src) {
            if (pendingCaseIds.has(c._id)) continue;
            merged[col].push(c);
            seen.add(c._id);
        }
    }

    // 2. Re-insert pending cards at their local column (with the freshest
    //    server payload merged in if we have one).
    const serverById = new Map();
    for (const col of KANBAN_COLUMNS) {
        for (const c of serverBoard[col] || []) serverById.set(c._id, c);
    }
    for (const col of KANBAN_COLUMNS) {
        for (const c of prevLocalBoard[col] || []) {
            if (!pendingCaseIds.has(c._id)) continue;
            if (seen.has(c._id)) continue;
            const fresh = serverById.get(c._id);
            merged[col].push(fresh ? { ...fresh, status: c.status } : c);
            seen.add(c._id);
        }
    }

    return merged;
}

/**
 * useLabKanbanBoard
 *
 * @param {{data: any[]|undefined}} opts — cases from a useQuery hook
 *        (either a flat array of case DTOs OR an object with a `.board` map).
 */
export function useLabKanbanBoard({ cases } = {}) {
    const [localBoard, setLocalBoard]             = useState(() => emptyBoard());
    const [pending, setPending]                   = useState(() => new Map());
    const pendingRef                              = useRef(pending);
    pendingRef.current                            = pending;

    // Derive a canonical server board from the input. Accepts:
    //   - an array of cases
    //   - an object with .board map (from /kanban endpoint)
    const serverBoard = useMemo(() => {
        if (!cases) return null;
        if (Array.isArray(cases)) return groupCases(cases);
        if (typeof cases === "object" && cases.board) {
            // Defensive copy — ensure every known column exists.
            const out = emptyBoard();
            for (const col of KANBAN_COLUMNS) {
                out[col] = Array.isArray(cases.board[col]) ? cases.board[col] : [];
            }
            return out;
        }
        return null;
    }, [cases]);

    // Sync server → local, preserving cards that have pending local mutations.
    useEffect(() => {
        if (!serverBoard) return;
        const pendingCaseIds = new Set(pendingRef.current.keys());
        setLocalBoard((prev) => mergeWithPending(serverBoard, pendingCaseIds, prev));
    }, [serverBoard]);

    // Age-out stale pending entries so we don't ignore socket updates forever.
    useEffect(() => {
        if (pending.size === 0) return;
        const timer = setInterval(() => {
            const now = Date.now();
            setPending((prev) => {
                let changed = false;
                const next = new Map(prev);
                for (const [id, op] of prev) {
                    if (now - op.startedAt > PENDING_TTL_MS) {
                        next.delete(id);
                        changed = true;
                    }
                }
                return changed ? next : prev;
            });
        }, 2000);
        return () => clearInterval(timer);
    }, [pending.size]);

    // ── Board mutators ────────────────────────────────────────────────────

    /**
     * Optimistically move a card and register the pending mutation.
     * Returns the mutationId the caller passes to the server call so we can
     * correlate the echo later.
     */
    const moveCard = useCallback((caseId, fromCol, toCol) => {
        if (!caseId || !toCol || fromCol === toCol) return null;
        const mutationId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        setLocalBoard((prev) => {
            const next = {};
            for (const col of KANBAN_COLUMNS) next[col] = prev[col] ? [...prev[col]] : [];
            let card = null;
            for (const col of KANBAN_COLUMNS) {
                const idx = next[col].findIndex((c) => c._id === caseId);
                if (idx >= 0) {
                    card = { ...next[col][idx], status: toCol };
                    next[col].splice(idx, 1);
                    break;
                }
            }
            if (!card) return prev;
            next[toCol] = [card, ...(next[toCol] || [])];
            return next;
        });

        setPending((prev) => {
            const next = new Map(prev);
            next.set(caseId, {
                mutationId,
                fromCol,
                toCol,
                startedAt: Date.now(),
            });
            return next;
        });

        return mutationId;
    }, []);

    /** Clear a pending entry once the server confirms. */
    const confirmMutation = useCallback((caseId, mutationId) => {
        setPending((prev) => {
            const existing = prev.get(caseId);
            if (!existing) return prev;
            if (mutationId && existing.mutationId !== mutationId) return prev;
            const next = new Map(prev);
            next.delete(caseId);
            return next;
        });
    }, []);

    /**
     * Server rejected the mutation. Clear pending; caller is expected to
     * invalidate the server query so the next sync rehydrates the board.
     */
    const rollback = useCallback((caseId) => {
        setPending((prev) => {
            if (!prev.has(caseId)) return prev;
            const next = new Map(prev);
            next.delete(caseId);
            return next;
        });
    }, []);

    /**
     * Apply a remote (socket) status change. Returns true if the update was
     * applied, false if it was swallowed as an own-echo.
     */
    const applyRemoteUpdate = useCallback((caseId, newStatus, opts = {}) => {
        if (!caseId || !newStatus) return false;
        const pendingOp = pendingRef.current.get(caseId);

        // Echo detection — if we have a pending op AND either
        //   (a) the wire carries our mutationId, OR
        //   (b) the target status matches our local target
        // treat it as our own echo and drop it.
        if (pendingOp) {
            if (opts.mutationId && opts.mutationId === pendingOp.mutationId) return false;
            if (pendingOp.toCol === newStatus) return false;
            // Conflict: different target than our pending move. Remote wins.
        }

        setLocalBoard((prev) => {
            const next = {};
            for (const col of KANBAN_COLUMNS) next[col] = prev[col] ? [...prev[col]] : [];
            let card = null;
            for (const col of KANBAN_COLUMNS) {
                const idx = next[col].findIndex((c) => c._id === caseId);
                if (idx >= 0) {
                    card = { ...next[col][idx], status: newStatus };
                    next[col].splice(idx, 1);
                    break;
                }
            }
            if (!card) return prev; // Unknown card — wait for next server sync.
            next[newStatus] = [card, ...(next[newStatus] || [])];
            return next;
        });
        return true;
    }, []);

    /** Remove a card from the board entirely (archive). */
    const removeCard = useCallback((caseId) => {
        setLocalBoard((prev) => {
            const next = {};
            let found = false;
            for (const col of KANBAN_COLUMNS) {
                const src = prev[col] || [];
                const filtered = src.filter((c) => c._id !== caseId);
                if (filtered.length !== src.length) found = true;
                next[col] = filtered;
            }
            return found ? next : prev;
        });
        setPending((prev) => {
            if (!prev.has(caseId)) return prev;
            const next = new Map(prev);
            next.delete(caseId);
            return next;
        });
    }, []);

    const isPending = useCallback(
        (caseId) => pending.has(caseId),
        [pending]
    );

    return {
        localBoard,
        columns: KANBAN_COLUMNS,
        pending,
        isPending,
        moveCard,
        confirmMutation,
        rollback,
        applyRemoteUpdate,
        removeCard,
    };
}
