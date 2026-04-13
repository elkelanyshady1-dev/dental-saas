/**
 * indexValidator.js
 * Core Infrastructure — Startup Index Enforcement Check
 *
 * Validates that critical indexes exist on key collections at boot time.
 * Logs warnings for missing indexes that could cause full collection scans.
 *
 * ARCHITECTURE:
 *   - Runs ONCE at startup (called from server.js or db.js after connect)
 *   - Non-blocking — logs warnings, does NOT prevent boot
 *   - Org-aware — checks a sample org connection if available
 *   - Skips in test environment to avoid noise
 *
 * WHY:
 *   Missing indexes on organizationId, patientId, or createdAt in a multi-tenant
 *   system can cause catastrophic full collection scans. A 100K patient collection
 *   without an organizationId index turns every query into a COLLSCAN.
 *
 * PLANE: Core Infrastructure
 */

"use strict";

const logger = require("@utils/logger");

/**
 * CRITICAL_INDEXES
 * Map of collection name → required index key patterns.
 *
 * Format: { collectionName: [ { keyPattern }, ... ] }
 *
 * A "key pattern" is the index key object, e.g. { organizationId: 1 }.
 * We check if ANY existing index covers these fields (compound is OK).
 */
const CRITICAL_INDEXES = {
    patients: [
        { field: "organizationId", description: "Tenant isolation" },
        { field: "createdAt", description: "Time-series queries" },
    ],
    appointments: [
        { field: "organizationId", description: "Tenant isolation" },
        { field: "patientId", description: "Patient lookup" },
        { field: "startTime", description: "Calendar queries" },
    ],
    clinicalrecords: [
        { field: "organizationId", description: "Tenant isolation" },
        { field: "patientId", description: "Patient record lookup" },
    ],
    patientinvoices: [
        { field: "organizationId", description: "Tenant isolation" },
        { field: "patientId", description: "Patient billing lookup" },
        { field: "createdAt", description: "Time-series queries" },
    ],
    patientpayments: [
        { field: "organizationId", description: "Tenant isolation" },
        { field: "patientId", description: "Patient payment lookup" },
    ],
    users: [
        { field: "organizationId", description: "Tenant isolation" },
        { field: "email", description: "Login lookup" },
    ],
    auditlogs: [
        { field: "organizationId", description: "Tenant isolation" },
        { field: "createdAt", description: "Audit timeline" },
    ],
    treatments: [
        { field: "organizationId", description: "Tenant isolation" },
        { field: "patientId", description: "Patient treatment lookup" },
    ],
    notifications: [
        { field: "organizationId", description: "Tenant isolation" },
    ],
};

/**
 * validateIndexes
 * Checks that critical indexes exist on the given connection.
 *
 * @param {mongoose.Connection} connection — The database connection to check
 * @param {string} [label="default"] — Label for logging (e.g., org ID or "platform")
 * @returns {Promise<{ passed: number, warnings: number, errors: string[] }>}
 */
async function validateIndexes(connection, label = "default") {
    // Skip in test to avoid noise
    if (process.env.NODE_ENV === "test") {
        return { passed: 0, warnings: 0, errors: [] };
    }

    const results = { passed: 0, warnings: 0, errors: [] };
    const db = connection.db;

    if (!db) {
        logger.warn(
            { label, source: "indexValidator" },
            "[IndexValidator] Cannot validate indexes — connection.db not available yet"
        );
        return results;
    }

    logger.info(
        { label, collections: Object.keys(CRITICAL_INDEXES).length, source: "indexValidator" },
        "[IndexValidator] Starting index validation for %s (%d collections)",
    );

    for (const [collectionName, requiredFields] of Object.entries(CRITICAL_INDEXES)) {
        try {
            // Check if collection exists
            const collections = await db.listCollections({ name: collectionName }).toArray();
            if (collections.length === 0) {
                // Collection doesn't exist yet — skip silently
                continue;
            }

            // Get existing indexes
            const existingIndexes = await db.collection(collectionName).indexes();
            const indexedFields = new Set();

            for (const idx of existingIndexes) {
                // Each index key can have multiple fields (compound index)
                for (const field of Object.keys(idx.key)) {
                    indexedFields.add(field);
                }
            }

            // Check each required field
            for (const { field, description } of requiredFields) {
                if (indexedFields.has(field)) {
                    results.passed++;
                } else {
                    results.warnings++;
                    const msg = `Missing index on ${collectionName}.${field} (${description})`;
                    results.errors.push(msg);

                    logger.warn(
                        {
                            collection: collectionName,
                            field,
                            description,
                            label,
                            existingIndexes: existingIndexes.map(i => Object.keys(i.key).join("+")),
                            source: "indexValidator",
                        },
                        `[IndexValidator] ⚠ ${msg}`
                    );
                }
            }
        } catch (err) {
            // Don't fail boot due to index check errors
            logger.warn(
                { collection: collectionName, err: err.message, label, source: "indexValidator" },
                "[IndexValidator] Could not check indexes for %s: %s"
            );
        }
    }

    if (results.warnings === 0) {
        logger.info(
            { passed: results.passed, label, source: "indexValidator" },
            "[IndexValidator] ✅ All critical indexes verified (%d checks passed)"
        );
    } else {
        logger.warn(
            {
                passed: results.passed,
                warnings: results.warnings,
                errors: results.errors,
                label,
                source: "indexValidator",
            },
            "[IndexValidator] ⚠ %d missing indexes detected — queries may be slow"
        );
    }

    return results;
}

module.exports = {
    validateIndexes,
    CRITICAL_INDEXES,
};
