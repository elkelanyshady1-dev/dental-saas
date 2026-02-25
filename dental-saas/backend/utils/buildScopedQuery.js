/**
 * Builds a scoped query that enforces organizationId and branchId filters.
 *
 * Usage:
 *   const query = buildScopedQuery(req);
 *   const query = buildScopedQuery(req, { _id: req.params.id });
 *
 * @param {Object} req - Express request (must have req.organizationId and req.allowedBranches)
 * @param {Object} additionalFilters - Extra query conditions to merge
 * @returns {Object} MongoDB query object
 */
const buildScopedQuery = (req, additionalFilters = {}) => {
    const query = {
        organizationId: req.organizationId,
        ...additionalFilters,
    };

    // If allowedBranches is null → unrestricted (full access)
    // If allowedBranches is an array → restrict to those branches
    if (req.allowedBranches !== null && req.allowedBranches !== undefined) {
        query.branchId = { $in: req.allowedBranches };
    }

    return query;
};

module.exports = buildScopedQuery;
