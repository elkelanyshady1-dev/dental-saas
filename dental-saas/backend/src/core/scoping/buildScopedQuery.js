/**
 * buildScopedQuery.js
 * 
 * Centralized Visibility Governance Layer (v4.2)
 * Enforces per-tenant and per-doctor data isolation.
 *
 * NOTE: This utility builds MongoDB query FILTER objects only.
 * It does NOT execute queries — callers are responsible for
 * using the correct per-org model via getModel(req.dbConnection, Def).
 */

/**
 * buildScopedQuery
 * Enforces visibility logic based on user.dataScope.level.
 * 
 * @param {Object} params
 * @param {Object} params.user         - Authenticated user object (must have organizationId and dataScope)
 * @param {string} params.resourceType - Domain type (patient, appointment, clinicalCase, invoice, payment)
 * @returns {Object} MongoDB query filter
 */
function buildScopedQuery({ user, resourceType }) {
    if (!user || !user.organizationId) {
        throw new Error("Scoping Error: Authenticated user context required.");
    }

    // Always enforce organization boundary
    const query = { organizationId: user.organizationId };

    // Default to 'organization' scope if not defined (backward compatibility)
    const scope = user.dataScope || { level: "organization" };

    switch (scope.level) {
        case "organization":
            return query;

        case "branch":
            if (!scope.branches || scope.branches.length === 0) {
                throw new Error("Branch scope misconfigured: No branches assigned.");
            }
            query.branchId = { $in: scope.branches };
            return query;

        case "personal":
            switch (resourceType) {
                case "patient":
                    // Matches field added in v4.2 schema extension
                    query.visibleToDoctors = user._id;
                    break;

                case "appointment":
                    // Maps doctorId to dentistId in appointment.model.js
                    query.dentistId = user._id;
                    break;

                case "clinicalCase":
                    // Matches field added in v4.2 schema extension
                    query.responsibleDoctorId = user._id;
                    break;

                case "invoice":
                    // Maps issuedBy to issuedByUserId in patientInvoice.model.js
                    query.issuedByUserId = user._id;
                    break;

                case "payment":
                    // Maps issuedBy to collectedByUserId in patientPayment.model.js
                    query.collectedByUserId = user._id;
                    break;

                default:
                    throw new Error(`Unsupported personal scope resource: ${resourceType}`);
            }
            return query;

        default:
            return query; // Fallback to org isolation
    }
}

module.exports = { buildScopedQuery };
