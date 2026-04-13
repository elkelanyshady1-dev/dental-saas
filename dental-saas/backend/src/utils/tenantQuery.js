/**
 * Reusable Tenant Query Scoping
 * Guarantees organizationId and isActive: true filters are applied.
 */
function buildTenantFilter(req, baseQuery = {}) {
    const filter = {
        ...baseQuery,
        organizationId: req.organizationId,
        isActive: true
    };
    return filter;
}

module.exports = buildTenantFilter;
