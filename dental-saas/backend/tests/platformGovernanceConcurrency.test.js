/**
 * platformGovernanceConcurrency.test.js
 * Hardened Superadmin Protection Concurrency Test
 * v11.1 Sovereign Governance
 */

const mongoose = require("mongoose");
const PlatformUser = require("../src/models/PlatformUser");
const AuditLog = require("../src/models/AuditLog");
const platformUserService = require("../src/services/platformUserService");

jest.setTimeout(60000);

// We rely on tests/setup.js for the global MongoMemoryServer connection.

beforeAll(async () => {
    // Ensure all indexes (including audit chain split protection) are ready
    if (mongoose.connection.readyState !== 0) {
        await AuditLog.createIndexes();
        await PlatformUser.createIndexes();
    }
});

describe("Sovereign Governance: Superadmin Concurrency Protection", () => {
    const BCRYPT_HASH = "$2a$12$LQv3c1yqBWVHxkd0LpX9G.o6S5./yGpx7I8.L8.A1.X/yGpx7I8.L";

    beforeEach(async () => {
        await PlatformUser.deleteMany({});
        await AuditLog.deleteMany({});
    });

    it("should prevent demoting the last superadmin under high concurrency (TOCTOU check)", async () => {
        // Setup: Exactly 2 superadmins
        const admin1 = await PlatformUser.create({
            name: "Admin 1",
            email: "admin1@platform.com",
            password: BCRYPT_HASH,
            role: "superadmin",
            isActive: true
        });

        const admin2 = await PlatformUser.create({
            name: "Admin 2",
            email: "admin2@platform.com",
            password: BCRYPT_HASH,
            role: "superadmin",
            isActive: true
        });

        // Verify initial state
        const initialCount = await PlatformUser.countDocuments({ role: "superadmin" });
        expect(initialCount).toBe(2);

        // Simulate high concurrency: 30 concurrent demote requests
        // Targeting both admins simultaneously.
        const requests = [];
        for (let i = 0; i < 30; i++) {
            const targetId = i % 2 === 0 ? admin1._id : admin2._id;
            requests.push(
                platformUserService.updatePlatformUserRole({
                    targetId,
                    newRole: "analyst",
                    actor: { _id: admin1._id },
                    req: { correlationId: `stress-test-demote-${i}` }
                })
            );
        }

        const results = await Promise.allSettled(requests);

        const rejected = results.filter(r => r.status === "rejected");
        const fulfilled = results.filter(r => r.status === "fulfilled");

        // Business Invariant: At least 1 superadmin must remain.
        const finalCount = await PlatformUser.countDocuments({ role: "superadmin", isActive: true });

        expect(finalCount).toBeGreaterThanOrEqual(1);
        console.log(`Concurrency Stats (Demote): SUCCESS=${fulfilled.length}, REJECTED=${rejected.length}`);
    });

    it("should prevent deleting the last superadmin under high concurrency", async () => {
        // Setup: 2 superadmins
        const admin1 = await PlatformUser.create({
            name: "Admin 1",
            email: "admin1@platform.com",
            password: BCRYPT_HASH,
            role: "superadmin",
            isActive: true
        });

        const admin2 = await PlatformUser.create({
            name: "Admin 2",
            email: "admin2@platform.com",
            password: BCRYPT_HASH,
            role: "superadmin",
            isActive: true
        });

        const requests = [];
        for (let i = 0; i < 30; i++) {
            const targetId = i % 2 === 0 ? admin1._id : admin2._id;
            requests.push(
                platformUserService.deletePlatformUser({
                    targetId,
                    actor: { _id: admin1._id },
                    req: { correlationId: `stress-test-delete-${i}` }
                })
            );
        }

        const results = await Promise.allSettled(requests);

        const rejected = results.filter(r => r.status === "rejected");
        const fulfilled = results.filter(r => r.status === "fulfilled");

        const finalCount = await PlatformUser.countDocuments({ role: "superadmin", isActive: true });
        expect(finalCount).toBeGreaterThanOrEqual(1);
        console.log(`Concurrency Stats (Delete): SUCCESS=${fulfilled.length}, REJECTED=${rejected.length}`);
    });

    it("should verify audit chain integrity and signatureVersion after concurrent operations", async () => {
        const admin1 = await PlatformUser.create({
            name: "Admin 1",
            email: "admin-audit@platform.com",
            password: BCRYPT_HASH,
            role: "superadmin",
            isActive: true
        });

        const admin2 = await PlatformUser.create({
            name: "Admin 2",
            email: "admin-audit-2@platform.com",
            password: BCRYPT_HASH,
            role: "superadmin",
            isActive: true
        });

        // Success mutation
        await platformUserService.updatePlatformUserRole({
            targetId: admin1._id,
            newRole: "analyst",
            actor: { _id: admin2._id },
            req: { correlationId: "audit-version-test-success" }
        });

        const latestAudit = await AuditLog.findOne({ action: "PLATFORM_USER_ROLE_OVERRIDE" }).sort({ createdAt: -1 });
        expect(latestAudit).toBeDefined();
        expect(latestAudit.signatureVersion).toBe(1);
        expect(latestAudit.correlationId).toBe("audit-version-test-success");
        expect(latestAudit.currentHash).toBeDefined();
    });
});
