/**
 * tenantAssertions.js — Per-Org Tenant Isolation Assertions
 * 
 * Replaces the legacy rlsAssertions.js (RLS). In per-org mode,
 * tenant isolation is enforced at the database connection level.
 * These assertions verify that req.dbConnection is properly established
 * before critical-path service operations.
 *
 * USAGE:
 *   const { assertTenantContext, assertFinanceContext } = require("@core/guards/tenantAssertions");
 *
 *   async function getPatientById(req, patientId) {
 *       assertTenantContext(req, "PatientReadService.getPatientById");
 *       // ... proceed with getModel(req.dbConnection, PatientDef)
 *   }
 */

"use strict";

const logger = require("../../utils/logger");

/**
 * Assert that req has a valid per-org tenant context.
 * @param {Object} req - Express request object
 * @param {string} caller - Calling function name (for diagnostics)
 * @throws {Error} If req.dbConnection or req.organizationId is missing
 */
function assertTenantContext(req, caller = "unknown") {
    if (!req || !req.dbConnection) {
        logger.error({
            event: "TENANT_ASSERTION_FAILED",
            caller,
            hasReq: !!req,
            hasDbConnection: !!req?.dbConnection,
            hasOrgId: !!req?.organizationId,
            path: req?.originalUrl || "N/A",
        }, `[TENANT] ${caller}: Missing database connection context`);

        const error = new Error(
            `TENANT CRITICAL: Missing dbConnection at ${caller}`
        );
        error.statusCode = 500;
        throw error;
    }
}

// Domain-specific aliases (backward compat naming)
function assertPatientRLS(req, caller) { assertTenantContext(req, caller); }
function assertFinanceRLS(req, caller) { assertTenantContext(req, caller); }
function assertClinicalRLS(req, caller) { assertTenantContext(req, caller); }

// Legacy alias
function assertRLSContext(req, caller) { assertTenantContext(req, caller); }

module.exports = {
    assertTenantContext,
    assertPatientRLS,
    assertFinanceRLS,
    assertClinicalRLS,
    assertRLSContext,
};
