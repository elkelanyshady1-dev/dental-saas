/**
 * tests/bootstrapCollections.js
 * MongoDB Collection Bootstrap for Transaction-Safe Tests
 *
 * PURPOSE:
 * Ensures all collections exist in the MongoDB replica set catalog BEFORE
 * any test transaction opens.
 *
 * WHY THIS IS REQUIRED:
 * MongoDB replica set transactions have a hard constraint:
 *   "You cannot create a collection inside a multi-document transaction."
 *
 * If a service tries to write to a collection that doesn't exist yet while
 * inside a transaction, MongoDB throws:
 *   MongoServerError: Unable to write to collection 'test.users'
 *   due to catalog changes; please retry the operation
 *
 * SOLUTION:
 * Call Model.syncIndexes() on every model before tests run.
 * syncIndexes() creates the collection + its indexes AND registers the
 * collection in mongoose.connection.collections (so setup.js cleanup works).
 *
 * USAGE:
 *   // In setup.js or a test file's beforeAll:
 *   const bootstrapCollections = require("./bootstrapCollections");
 *   beforeAll(async () => {
 *     await bootstrapCollections();
 *   });
 *
 * SAFETY GUARD:
 * After bootstrapping, verifies that all critical collections exist in the
 * mongoose.connection.collections registry. Throws if any are missing.
 *
 * PLANE: Test Infrastructure
 */

"use strict";

const mongoose = require("mongoose");

// ─── Model Imports ────────────────────────────────────────────────────────────
// Import every model that is written to inside a MongoDB transaction.
// Add new models here when new transactional services are introduced.
const Organization = require("../src/shared/models/Organization");
const User = require("../src/shared/models/User");
const OrgContract = require("../src/platform/billing/models/OrgContract.model");
const BillingLedger = require("../src/platform/billing/models/BillingLedger.model");
const BillingTimeline = require("../src/platform/billing/models/BillingTimeline.model");
const PlatformInvoice = require("../src/platform/billing/models/PlatformInvoice.model");
const OrganizationEntitlement = require("../src/platform/billing/models/OrganizationEntitlement.model");
const PlanTemplate = require("../src/platform/billing/models/PlanTemplate.model");
const PlanVersion = require("../src/platform/billing/models/PlanVersion.model");
// Sprint 2: Atomic invoice sequence counter
const InvoiceSequence = require("../src/platform/billing/models/InvoiceSequence.model");

// Non-billing models also written inside transactions
let Branch;
let AuditLog;
try { Branch = require("../src/shared/models/Branch"); } catch (_) { }
try { AuditLog = require("../src/shared/models/AuditLog"); } catch (_) { }

// ─── REQUIRED_COLLECTIONS safety guard ────────────────────────────────────────
// These collections MUST exist after bootstrap. If any are missing, bootstrap
// failed and tests will get catalog errors.
const REQUIRED_COLLECTIONS = [
    "organizations",
    "users",
    "orgcontracts",
    "billingledger",
    "billingtimeline",
    "platforminvoices",
    "organizationentitlements",
    "plantemplates",
    "planversions",
    "invoicesequences",
];

/**
 * bootstrapCollections
 *
 * Runs syncIndexes() on every transactional model to ensure collections exist
 * in the MongoDB catalog and are registered in mongoose.connection.collections.
 *
 * Should be called once in beforeAll before any test transaction opens.
 *
 * @returns {Promise<void>}
 * @throws {Error} if any required collection is missing after bootstrap
 */
async function bootstrapCollections() {
    const models = [
        Organization,
        User,
        OrgContract,
        BillingLedger,
        BillingTimeline,
        PlatformInvoice,
        OrganizationEntitlement,
        PlanTemplate,
        PlanVersion,
        InvoiceSequence,
    ];

    // Include optional models if they loaded successfully
    if (Branch) models.push(Branch);
    if (AuditLog) models.push(AuditLog);

    // syncIndexes() is idempotent — safe to call even if collection already exists.
    // It creates the collection, creates/updates indexes, and crucially registers
    // the collection in mongoose.connection.collections.
    await Promise.all(models.map(m => m.syncIndexes()));

    // ─── Safety Guard ─────────────────────────────────────────────────────────
    // Verify all critical collections are now registered. If any are missing,
    // throw immediately — missing collections will cause MongoServerError inside
    // subsequent transactions.
    const registered = Object.keys(mongoose.connection.collections);
    const missing = REQUIRED_COLLECTIONS.filter(name => !registered.includes(name));

    if (missing.length > 0) {
        throw new Error(
            `[bootstrapCollections] FATAL: The following collections were not created:\n` +
            `  ${missing.join(", ")}\n` +
            `This will cause MongoServerError inside transactions. ` +
            `Add the corresponding model to bootstrapCollections.js.`
        );
    }
}

module.exports = bootstrapCollections;
