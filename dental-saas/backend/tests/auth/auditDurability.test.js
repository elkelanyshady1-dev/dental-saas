/**
 * auditDurability.test.js — H3/M7 audit durability contract
 *
 * Covers:
 *   H3 — on auditService failure, logAction enqueues an AUDIT_REPLAY event
 *        to EventOutbox instead of silently losing the record.
 *   M7 — mutations reaching the audit layer without an organizationId are
 *        REFUSED (no SYSTEM_ID fallback). The missing-org case was polluting
 *        the platform audit chain with org-plane writes.
 *
 * Uses jest.mock to stub auditService and EventOutbox so we can assert the
 * control flow without touching a real Mongo.
 */

"use strict";

jest.mock("../../src/services/auditService", () => ({
    createAuditRecord: jest.fn(),
}));
jest.mock("../../src/core/EventOutbox.model", () => {
    const create = jest.fn();
    return {
        default: { create },
        __mock: { create },
    };
});
// eventBus is imported by the interceptor but only used on the HAPPY path;
// stub to avoid pulling in real bus side effects.
jest.mock("../../src/core/eventBus", () => ({ emit: jest.fn() }));

const auditService = require("../../src/services/auditService");
const EventOutbox = require("../../src/core/EventOutbox.model").default;
const { logAction } = require("../../src/middleware/auditInterceptor");

function mockReq(overrides = {}) {
    return {
        method: "POST",
        originalUrl: "/api/v1/org/patients",
        ip: "127.0.0.1",
        headers: {},
        user: { _id: "u1", name: "U One", email: "u@x.z", roleId: { name: "admin" } },
        organizationId: "org-1",
        activeBranchId: "br-1",
        regionCode: "EG",
        requestId: "req-1",
        body: { name: "x" },
        ...overrides,
    };
}

beforeEach(() => {
    auditService.createAuditRecord.mockReset();
    EventOutbox.create.mockReset();
});

// ─── Happy path ──────────────────────────────────────────────────────────────

describe("auditInterceptor.logAction — happy path", () => {
    it("writes to auditService and does NOT touch the outbox", async () => {
        auditService.createAuditRecord.mockResolvedValue({ _id: "a1" });

        const req = mockReq();
        const record = await logAction(req, {
            action: "PATIENT_CREATED",
            entity: "Patient",
            entityId: "p1",
        });

        expect(auditService.createAuditRecord).toHaveBeenCalledTimes(1);
        expect(EventOutbox.create).not.toHaveBeenCalled();
        expect(record).toEqual({ _id: "a1" });
    });
});

// ─── H3 fallback ─────────────────────────────────────────────────────────────

describe("auditInterceptor.logAction — H3 outbox fallback", () => {
    it("enqueues AUDIT_REPLAY when auditService.createAuditRecord throws", async () => {
        auditService.createAuditRecord.mockRejectedValue(new Error("db down"));
        EventOutbox.create.mockResolvedValue({ _id: "outbox1" });

        const req = mockReq();
        const result = await logAction(req, {
            action: "PATIENT_CREATED",
            entity: "Patient",
            entityId: "p1",
        });

        expect(auditService.createAuditRecord).toHaveBeenCalledTimes(1);
        expect(EventOutbox.create).toHaveBeenCalledTimes(1);

        const [outboxDoc] = EventOutbox.create.mock.calls[0];
        expect(outboxDoc.eventType).toBe("AUDIT_REPLAY");
        expect(outboxDoc.emitter).toBe("auditInterceptor");
        expect(outboxDoc.payload).toMatchObject({
            action: "PATIENT_CREATED",
            entity: "Patient",
            entityId: "p1",
            organizationId: "org-1",
        });
        // Replay payload must NOT pre-compute prevHash — auditService resolves
        // it from the DB tail on every call. Guard against accidental leakage
        // of chain state from the enqueue site.
        expect(outboxDoc.payload.prevHash).toBeUndefined();
        expect(outboxDoc.payload.previousHash).toBeUndefined();
        expect(outboxDoc.payload.currentHash).toBeUndefined();

        expect(result).toBeNull();
    });

    it("does not throw even when the outbox write ALSO fails (defense in depth)", async () => {
        auditService.createAuditRecord.mockRejectedValue(new Error("primary down"));
        EventOutbox.create.mockRejectedValue(new Error("outbox down"));

        const req = mockReq();
        const result = await logAction(req, {
            action: "PATIENT_UPDATED",
            entity: "Patient",
            entityId: "p2",
        });

        // Both paths failed — the call must still return (not throw) so the
        // mutation response isn't affected. The failure is logged by the
        // interceptor itself.
        expect(result).toBeNull();
    });
});

// ─── M7 guard ────────────────────────────────────────────────────────────────

describe("auditInterceptor.logAction — M7 org-scope guard", () => {
    it("refuses to write when a mutation has no organizationId (NO SYSTEM_ID fallback)", async () => {
        const req = mockReq({ organizationId: undefined, user: { _id: "u1" } });

        const result = await logAction(req, {
            action: "PATIENT_CREATED",
            entity: "Patient",
            entityId: "p-orphan",
        });

        expect(auditService.createAuditRecord).not.toHaveBeenCalled();
        expect(EventOutbox.create).not.toHaveBeenCalled();
        expect(result).toBeNull();
    });

    it("does write for READ/HEAD-like calls with no orgId (non-mutation audit is not the scope of M7)", async () => {
        auditService.createAuditRecord.mockResolvedValue({ _id: "a2" });
        const req = mockReq({ method: "GET", organizationId: undefined });

        await logAction(req, { action: "PATIENT_VIEWED", entity: "Patient", entityId: "p3" });

        expect(auditService.createAuditRecord).toHaveBeenCalledTimes(1);
    });
});
