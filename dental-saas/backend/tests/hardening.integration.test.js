/**
 * hardening.integration.test.js
 * v11.0 Hardening Verification
 */

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const Ticket = require("../src/models/Ticket");
const StripeEvent = require("../src/models/StripeEvent");
const AuditLog = require("../src/models/AuditLog");
const ticketService = require("../src/modules/supportDomain/services/ticket.service");
const auditService = require("../src/services/auditService");

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

describe("v11.0 Hardening: State Machine", () => {
    it("should prevent illegal transition (CLOSED -> OPEN)", async () => {
        const ticket = await Ticket.create({
            organizationId: new mongoose.Types.ObjectId(),
            submittedByUserId: new mongoose.Types.ObjectId(),
            category: "TECHNICAL",
            subject: "Test",
            description: "Test",
            status: "CLOSED",
            slaDeadline: new Date()
        });

        await expect(
            ticketService.transitionStatus(ticket._id, "OPEN", new mongoose.Types.ObjectId(), "system")
        ).rejects.toThrow("Illegal transition from CLOSED to OPEN");
    });

    it("should recalculate SLA on priority change", async () => {
        const ticket = await Ticket.create({
            organizationId: new mongoose.Types.ObjectId(),
            submittedByUserId: new mongoose.Types.ObjectId(),
            category: "TECHNICAL",
            subject: "Test",
            description: "Test",
            priority: "LOW",
            slaDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000)
        });

        const updated = await ticketService.updatePriority(ticket._id, "CRITICAL", new mongoose.Types.ObjectId(), "system");

        const diffHours = (updated.slaDeadline - Date.now()) / (1000 * 60 * 60);
        expect(diffHours).toBeGreaterThan(3.9);
        expect(diffHours).toBeLessThan(4.1);
    });
});

describe("v11.0 Hardening: Audit Chain Concurrency", () => {
    it("should prevent duplicate previousHash (Chain Split)", async () => {
        const orgId = new mongoose.Types.ObjectId();

        // Ensure indices are created
        await AuditLog.createIndexes();

        const baseAudit = await auditService.createAuditRecord({
            organizationId: orgId,
            branchId: new mongoose.Types.ObjectId(),
            actorId: new mongoose.Types.ObjectId(),
            action: "INITIAL"
        });

        const prevHash = baseAudit.currentHash;

        // Simulate two concurrent appends reading the same prevHash
        const promise1 = auditService.createAuditRecord({
            organizationId: orgId,
            branchId: new mongoose.Types.ObjectId(),
            actorId: new mongoose.Types.ObjectId(),
            action: "APPEND_1"
        });

        const promise2 = auditService.createAuditRecord({
            organizationId: orgId,
            branchId: new mongoose.Types.ObjectId(),
            actorId: new mongoose.Types.ObjectId(),
            action: "APPEND_2"
        });

        // One must fail due to unique index on { organizationId, previousHash }
        const results = await Promise.allSettled([promise1, promise2]);
        const rejected = results.filter(r => r.status === "rejected");

        expect(rejected.length).toBe(1);
        expect(rejected[0].reason.message).toContain("Audit log concurrency violation");
    });
});
