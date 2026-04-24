/**
 * communicationQueryKeys.js — Centralized React Query Keys for Communication Logs
 *
 * PLANE: Platform (infrastructure observability)
 *
 * Keys for the dispatcher-era CommunicationLog dashboard. Factory pattern —
 * every variant parameter (hours, limit) is an object key so React Query's
 * structural equality treats distinct windows as distinct caches.
 *
 * Usage:
 *   import { COMMUNICATION_QUERY_KEYS as CK } from "@/lib/query/communicationQueryKeys";
 *   useQuery({ queryKey: CK.summary(24), ... });
 *   queryClient.invalidateQueries({ queryKey: CK.all });  // wipe entire domain
 */

export const COMMUNICATION_QUERY_KEYS = {
    /** Root — matches every communication query (dashboard-wide invalidation) */
    all: ["communication"],

    /** /api/platform/communication/logs/summary?hours=N */
    summary: (hours) => ["communication", "summary", { hours }],

    /** /api/platform/communication/logs/recent?hours=N&limit=N */
    recent: (hours, limit) => ["communication", "recent", { hours, limit }],

    /** /api/platform/communication/logs/failures?hours=N&limit=N */
    failures: (hours, limit) => ["communication", "failures", { hours, limit }],

    /** /api/platform/communication/logs/stats?hours=N */
    stats: (hours) => ["communication", "stats", { hours }],
};

export default COMMUNICATION_QUERY_KEYS;
