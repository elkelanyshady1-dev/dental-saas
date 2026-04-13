/**
 * visitChannel.ts — Phase 6B: Visit Presence Realtime Channel
 *
 * ARCHITECTURE (matches eventEmitter.js zero-trust rules):
 *   ✅ Events carry visitId ONLY — no chart state, no patient data
 *   ✅ Frontend reacts by invalidating React Query → API refetch
 *   ✅ Uses getSocket() singleton (never creates a new socket)
 *   ❌ NEVER trust payload data directly — all truth from API
 *
 * EVENT FLOW:
 *   startVisit() ──backend──→ visit.presence.joined.v1  → invalidate active-visit query
 *   endVisit()   ──backend──→ visit.presence.left.v1    → invalidate active-visit query
 *
 * USAGE:
 *   useVisitPresenceSocket(visitId, {
 *     onOtherJoined: ({ doctorName }) => toast.warn(`${doctorName} is viewing this visit`),
 *     onLeft:        ()               => queryClient.invalidateQueries(...)
 *   });
 */

import { useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';

// ── Typed presence payload ─────────────────────────────────────────────────────
// Carries ONLY what the server schema allows (R7 whitelist enforced server-side).
export interface VisitPresencePayload {
  visitId:    string;
  doctorName: string | null;
  doctorId?:  string | null;
}

interface UseVisitPresenceSocketOptions {
  /** Called when ANOTHER doctor joins this visit room */
  onOtherJoined?: (payload: VisitPresencePayload) => void;
  /** Called when the OTHER doctor leaves this visit */
  onLeft?: (payload: Pick<VisitPresencePayload, 'visitId' | 'doctorName'>) => void;
  /** The current user's id — prevents reacting to own presence signals */
  currentUserId?: string | null;
}

/**
 * useVisitPresenceSocket
 *
 * Subscribes to visit presence events for a given visit.
 * When another doctor opens the same visit, onOtherJoined fires.
 * When they leave, onLeft fires.
 *
 * Both callbacks are STABLE-ref backed — the socket listener never restarts
 * on callback changes (avoids unsubscribe/resubscribe churn).
 *
 * @param visitId - The active visit's _id. Hook is no-op when null.
 * @param options - Callback handlers.
 */
export default function useVisitPresenceSocket(
  visitId: string | null | undefined,
  {
    onOtherJoined,
    onLeft,
    currentUserId,
  }: UseVisitPresenceSocketOptions = {}
): void {
  // Stable refs — capture latest callbacks without restaring the effect
  const onJoinedRef     = useRef(onOtherJoined);
  const onLeftRef       = useRef(onLeft);
  const currentUserRef  = useRef(currentUserId);

  useEffect(() => { onJoinedRef.current    = onOtherJoined; },  [onOtherJoined]);
  useEffect(() => { onLeftRef.current      = onLeft; },         [onLeft]);
  useEffect(() => { currentUserRef.current = currentUserId; },  [currentUserId]);

  useEffect(() => {
    if (!visitId) return;

    const socket = getSocket();
    if (!socket) return; // socket not initialized (pre-auth) — no-op

    const handleJoined = (payload: VisitPresencePayload) => {
      // Zero-trust: verify visitId matches and skip own signals
      if (payload.visitId !== visitId) return;
      if (payload.doctorId && payload.doctorId === currentUserRef.current) return;
      onJoinedRef.current?.(payload);
    };

    const handleLeft = (payload: Pick<VisitPresencePayload, 'visitId' | 'doctorName'>) => {
      if (payload.visitId !== visitId) return;
      onLeftRef.current?.(payload);
    };

    socket.on('visit.presence.joined.v1', handleJoined);
    socket.on('visit.presence.left.v1',   handleLeft);

    return () => {
      socket.off('visit.presence.joined.v1', handleJoined);
      socket.off('visit.presence.left.v1',   handleLeft);
    };
  }, [visitId]);
  // callbacks are NOT in deps — stable refs handle freshness
}
