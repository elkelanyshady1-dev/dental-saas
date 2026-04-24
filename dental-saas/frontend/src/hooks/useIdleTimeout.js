/**
 * useIdleTimeout — Client-side inactivity auto-logout (P4.3)
 *
 * Complements the backend's 12h absolute-session timeout with a shorter
 * client-side idle timeout. After `timeoutMs` milliseconds without user
 * activity (mousemove / keydown / click / touchstart / scroll), the hook
 * invokes the supplied `onIdle` callback — typically the logout action
 * from AuthContext.
 *
 * Semantics:
 *   - Default: 30 minutes of inactivity triggers logout.
 *   - Timer resets on any tracked activity event.
 *   - Passive listeners — zero scroll-jank cost.
 *   - Cleans up all listeners + timer on unmount.
 *
 * This is a UX safeguard, NOT a security boundary. Security-relevant
 * session expiration is enforced server-side:
 *   - 15m access-token TTL
 *   - 12h absolute session via sessionStart claim (authMiddleware P4.1)
 *   - requireRecentAuth on high-risk mutations (P3/P5)
 *
 * If a malicious script neutralises this hook, the backend still stops
 * the session at the wall-clock ceiling. This hook exists to reduce
 * the window during which an unattended logged-in session on a shared
 * workstation can be abused.
 *
 * @module hooks/useIdleTimeout
 */

import { useEffect, useRef } from "react";

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "touchstart", "scroll"];

/**
 * @param {() => void} onIdle — called when the user is idle for `timeoutMs`.
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=30*60*1000] — inactivity threshold in ms.
 * @param {boolean} [opts.enabled=true] — set false to suspend tracking.
 */
export default function useIdleTimeout(onIdle, { timeoutMs = DEFAULT_TIMEOUT_MS, enabled = true } = {}) {
    // Keep the latest onIdle in a ref so we don't have to re-bind listeners
    // every render when the parent passes a fresh callback identity.
    const onIdleRef = useRef(onIdle);
    useEffect(() => {
        onIdleRef.current = onIdle;
    }, [onIdle]);

    useEffect(() => {
        if (!enabled) return undefined;

        let timerId;
        const schedule = () => {
            clearTimeout(timerId);
            timerId = setTimeout(() => {
                try {
                    onIdleRef.current?.();
                } catch {
                    // Swallow — logout implementations are expected to be
                    // resilient; a thrown error here would leak to window.
                }
            }, timeoutMs);
        };

        ACTIVITY_EVENTS.forEach((ev) => {
            window.addEventListener(ev, schedule, { passive: true });
        });

        schedule(); // Arm the initial timer on mount.

        return () => {
            clearTimeout(timerId);
            ACTIVITY_EVENTS.forEach((ev) => {
                window.removeEventListener(ev, schedule);
            });
        };
    }, [timeoutMs, enabled]);
}
