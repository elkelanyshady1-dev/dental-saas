/**
 * GlobalTimeContext.tsx — Shared clock for the clinical chart
 *
 * Provides a single `Date` that updates every second, shared across all
 * components that need the current time (VisitTimer, any timestamp display).
 *
 * Usage:
 *   // Wrap the clinical chart root:
 *   <TimeProvider><SnapshotEditor ... /></TimeProvider>
 *
 *   // Consume anywhere in the subtree:
 *   const now = useGlobalTime();  // Date, ticks every second
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

const GlobalTimeContext = createContext<Date>(new Date());

export function TimeProvider({ children }: { children: React.ReactNode }) {
  const [now, setNow] = useState(() => new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <GlobalTimeContext.Provider value={now}>
      {children}
    </GlobalTimeContext.Provider>
  );
}

/** Returns the current `Date`, refreshed every second by the nearest TimeProvider. */
export function useGlobalTime(): Date {
  return useContext(GlobalTimeContext);
}
