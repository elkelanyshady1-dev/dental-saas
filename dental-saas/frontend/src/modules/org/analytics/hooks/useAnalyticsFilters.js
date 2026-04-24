/**
 * useAnalyticsFilters.js — local-only filter state for the Insights page.
 *
 * Server state lives in React Query (not in this hook). This only tracks
 * the user-controlled inputs and exposes a stable `filters` object that
 * feeds the hooks' query keys.
 */
import { useMemo, useState, useCallback } from "react";

function defaultRange() {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 29); // 30-day window
    return {
        from: startOfDay(from).toISOString(),
        to: endOfDay(to).toISOString(),
    };
}

function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}
function endOfDay(d) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}

export function useAnalyticsFilters() {
    const [range, setRange] = useState(defaultRange);
    const [granularity, setGranularity] = useState("day");
    const [branchId, setBranchId] = useState(""); // "" = ALL
    const [timezone, setTimezone] = useState(
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    );

    const setPreset = useCallback((days) => {
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - (days - 1));
        setRange({
            from: startOfDay(from).toISOString(),
            to: endOfDay(to).toISOString(),
        });
        if (days <= 31) setGranularity("day");
        else if (days <= 120) setGranularity("week");
        else setGranularity("month");
    }, []);

    const filters = useMemo(() => ({
        from: range.from,
        to: range.to,
        branchId: branchId || undefined,
        granularity,
        timezone,
    }), [range.from, range.to, branchId, granularity, timezone]);

    return {
        filters,
        range,
        granularity,
        branchId,
        timezone,
        setRange,
        setGranularity,
        setBranchId,
        setTimezone,
        setPreset,
    };
}
