/**
 * OrgTimeContext.jsx — Global Organization Time Engine (v1.0)
 *
 * Provides a live clock that updates every second, anchored to the
 * organization's configured IANA timezone.
 *
 * Implementation uses the native Intl.DateTimeFormat API — zero deps.
 *
 * USAGE:
 *   const { currentTime, currentDate, timezone } = useOrganizationTime();
 *   // currentTime → "09:45 AM"
 *   // currentDate → "Tuesday, April 2, 2026"
 *   // timezone    → "Africa/Cairo"
 *
 * RULE:  Never use new Date() directly in UI time displays.
 *        Always consume from this context.
 */

import {
    createContext, useContext,
    useState, useEffect, useMemo,
    useCallback,
} from "react";
import { useOrgBranding } from "./OrgBrandingContext";

const OrgTimeContext = createContext(null);
export const useOrganizationTime = () => useContext(OrgTimeContext);

// ── Formatting helpers (pure, no deps) ───────────────────────────────────────

/**
 * Format a Date to "HH:mm" (24h) in a given IANA timezone.
 * @param {Date} date
 * @param {string} tz
 * @returns {string}
 */
function formatTime(date, tz) {
    try {
        return new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            hour:   "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
        }).format(date);
    } catch {
        return new Intl.DateTimeFormat("en-US", {
            hour:   "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
        }).format(date);
    }
}

/**
 * Format a Date to "Tuesday, April 2, 2026" in the org timezone.
 * @param {Date} date
 * @param {string} tz
 * @returns {string}
 */
function formatDate(date, tz) {
    try {
        return new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            weekday: "long",
            day:     "numeric",
            month:   "long",
            year:    "numeric",
        }).format(date);
    } catch {
        return new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            day:     "numeric",
            month:   "long",
            year:    "numeric",
        }).format(date);
    }
}

/**
 * Short date format for compact display: "TUE, OCT 24, 2023"
 */
function formatDateShort(date, tz) {
    try {
        return new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            weekday: "short",
            day:     "numeric",
            month:   "short",
            year:    "numeric",
        }).format(date).toUpperCase();
    } catch {
        return "";
    }
}

/** Provider wraps OrgLayout — initialised once per session */
export function OrgTimeProvider({ children }) {
    const { timezone } = useOrgBranding();
    const tz = timezone || "UTC";

    const now = useCallback(() => new Date(), []);
    const [tick, setTick] = useState(now);

    // Update every second
    useEffect(() => {
        const id = setInterval(() => setTick(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    // Recompute formatted values only when tick or tz changes
    const currentTime      = useMemo(() => formatTime(tick, tz),      [tick, tz]);
    const currentDate      = useMemo(() => formatDate(tick, tz),      [tick, tz]);
    const currentDateShort = useMemo(() => formatDateShort(tick, tz), [tick, tz]);
    const timezone_        = tz;

    return (
        <OrgTimeContext.Provider value={{
            currentTime,
            currentDate,
            currentDateShort,
            timezone:    timezone_,
            rawDate:     tick,
            /** Format any date using the org timezone */
            formatInOrgTz: (date, opts) => {
                try {
                    return new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts }).format(date);
                } catch {
                    return new Intl.DateTimeFormat("en-US", opts).format(date);
                }
            },
        }}>
            {children}
        </OrgTimeContext.Provider>
    );
}
