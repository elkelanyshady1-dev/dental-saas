/**
 * analytics.dto.js — Analytics Domain DTO Builder
 *
 * Wraps analytics service output in a standard envelope.
 * Prevents raw service response leaking internal fields.
 *
 * PLANE: Org only.
 */

"use strict";

/**
 * buildAnalyticsDTO — shapes analytics data for API response.
 * Analytics data is already aggregated by the service — this builder
 * ensures consistent envelope and prevents internal field leakage.
 */
function buildAnalyticsDTO(raw) {
    if (!raw) return {};

    return {
        appointments:  raw.appointments  ?? null,
        patients:      raw.patients      ?? null,
        revenue:       raw.revenue       ?? null,
        treatments:    raw.treatments    ?? null,
        occupancy:     raw.occupancy     ?? null,
        staff:         raw.staff         ?? null,
        projections:   raw.projections   ?? null,
        period:        raw.period        ?? null,
    };
}

module.exports = { buildAnalyticsDTO };
