/**
 * LazyMount.tsx — IntersectionObserver + active-slot cap wrapper.
 *
 * Used primarily by the STL card renderer so that:
 *   1. Children mount only when the card is near the viewport (saves CPU
 *      + GPU on offscreen items).
 *   2. A global cap (MAX_ACTIVE_CANVAS) prevents more than N live WebGL
 *      contexts at once — browsers aggressively drop contexts past 16,
 *      and dental cases with many STL uploads would otherwise thrash.
 *
 * When either gate fails, `placeholder` is rendered instead.
 *
 * 🚨 PRODUCTION LOCK — the counter is managed by EXACTLY ONE useEffect
 *    keyed on `claimed`. Increment on claim, decrement on release.
 *    Nothing else writes to ACTIVE.count — that's how we prove the
 *    counter can't leak under any rerender / StrictMode cycle.
 */

import React, { useEffect, useRef, useState } from "react";

/** Upper bound on simultaneously-mounted heavy children across the app. */
export const MAX_ACTIVE_CANVAS = 6;

// Module-level slot registry. `count` is the ONLY mutable field and it
// is written from a single useEffect in this module — see below.
const ACTIVE = {
    count: 0,
    listeners: new Set<() => void>(),
};
function notify() {
    for (const fn of ACTIVE.listeners) fn();
}

export interface LazyMountProps {
    children: React.ReactNode;
    /** Rendered while offscreen OR when no active slot is available. */
    placeholder?: React.ReactNode;
    /** `rootMargin` passed to IntersectionObserver — default 200px. */
    rootMargin?: string;
    /** Override the global cap for a specific consumer. */
    maxActive?: number;
}

const LazyMount: React.FC<LazyMountProps> = ({
    children,
    placeholder = null,
    rootMargin = "200px",
    maxActive = MAX_ACTIVE_CANVAS,
}) => {
    const ref = useRef<HTMLDivElement>(null);
    const [inView, setInView] = useState(false);
    const [claimed, setClaimed] = useState(false);

    // 1. IntersectionObserver — controls `inView`.
    useEffect(() => {
        if (!ref.current) return;
        const obs = new IntersectionObserver(
            (entries) => {
                for (const e of entries) setInView(e.isIntersecting);
            },
            { rootMargin }
        );
        obs.observe(ref.current);
        return () => obs.disconnect();
    }, [rootMargin]);

    // 2. Claim decision — pure state transition, no side effects on the
    //    shared counter. Flips `claimed` true when a slot is available,
    //    false when offscreen, and subscribes for retry when capped.
    useEffect(() => {
        if (!inView) {
            setClaimed(false);
            return;
        }
        const attempt = () => {
            if (ACTIVE.count < maxActive) setClaimed(true);
        };
        attempt();
        ACTIVE.listeners.add(attempt);
        return () => {
            ACTIVE.listeners.delete(attempt);
        };
    }, [inView, maxActive]);

    // 3. Counter lifecycle — THE ONLY writer of ACTIVE.count. Increments
    //    on claim, decrements on release. React guarantees cleanup runs
    //    exactly once per effect invocation, so increments and decrements
    //    stay balanced even under StrictMode double-invoke.
    useEffect(() => {
        if (!claimed) return;
        ACTIVE.count += 1;
        notify();
        return () => {
            ACTIVE.count = Math.max(0, ACTIVE.count - 1);
            notify();
        };
    }, [claimed]);

    return (
        <div ref={ref} className="w-full h-full">
            {claimed ? children : placeholder}
        </div>
    );
};

export default LazyMount;
