/**
 * auditIntegrity.js
 * 
 * Audit Chain Verification Utility (v3.1)
 */

const AuditLog = require("../shared/models/AuditLog").default;
const { generateHash } = require("../services/auditService");

/**
 * verifyOrganizationChain
 * Recomputes hashes for all entries of an organization.
 */
async function verifyOrganizationChain(organizationId) {
    const logs = await AuditLog.find({ organizationId }).sort({ createdAt: 1 });

    let expectedPrevHash = "0";
    let violations = [];

    for (let i = 0; i < logs.length; i++) {
        const log = logs[i];

        // 1. Check previousHash link
        if (log.previousHash !== expectedPrevHash) {
            violations.push({
                index: i,
                id: log._id,
                issue: "Broken chain link",
                expected: expectedPrevHash,
                found: log.previousHash
            });
        }

        // 2. Recompute currentHash
        const recomputedHash = generateHash(log, log.previousHash);
        if (log.currentHash !== recomputedHash) {
            violations.push({
                index: i,
                id: log._id,
                issue: "Hash mismatch (data tampered)",
                expected: recomputedHash,
                found: log.currentHash
            });
        }

        expectedPrevHash = log.currentHash;
    }

    return {
        valid: violations.length === 0,
        violations,
        totalChecked: logs.length
    };
}

module.exports = {
    verifyOrganizationChain
};
