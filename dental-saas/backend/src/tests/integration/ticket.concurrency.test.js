/**
 * ticket.concurrency.test.js — Phase 3 E1 concurrency lock test
 *
 * Validates the optimistic-concurrency guard added to
 * `supportMessage.service.createMessage` for the org-plane TicketMessage
 * collection path. The specific regression being prevented:
 *
 *   Tab A reads ticket at version=5, drafts a reply, POSTs.
 *   Tab B reads ticket at version=5, drafts a different reply, POSTs.
 *   Without a version guard, both would commit — the Ticket metadata
 *   ($inc version, $inc threadMessageCount, $set lastMessageAt) is a
 *   write with side effects, NOT append-only, so silent interleaving
 *   would drift `threadMessageCount` away from the truth and hide a
 *   stale view from the losing client.
 *
 * With the guard:
 *   - One writer's CAS `{_id, version: expectedVersion}` matches → commits.
 *   - The other's filter matches 0 rows → the transaction aborts, the
 *     TicketMessage insert rolls back, and the caller sees
 *     `VERSION_CONFLICT` with the current version.
 *
 * What this test asserts:
 *   1. expectedVersion is required (API contract)
 *   2. expectedVersion must be a valid non-negative integer
 *   3. Happy path: v0 → v1 → v2 with correct expectedVersion chain
 *   4. Stale expectedVersion → 409 VERSION_CONFLICT with currentVersion
 *   5. Parallel race: two simultaneous creates with the SAME
 *      expectedVersion → exactly one commits, one 409s, and the DB
 *      state is consistent (count advanced by exactly 1, not 2)
 *   6. TicketMessage row is rolled back on the losing transaction
 */

"use strict";

const mongoose = require("mongoose");
const Ticket = require("@shared/models/Ticket").default;
const TicketMessage = require("@modules/supportDomain/models/TicketMessage.model").default;
const supportMessage = require("@modules/supportDomain/services/supportMessage.service");

function makeReq(orgId, userId, plane = "org") {
    return {
        context: { organizationId: orgId, userId, plane },
        user: { _id: userId, organizationId: orgId },
        dbConnection: mongoose.connection,
    };
}

async function seedTicket({ orgId, userId }) {
    return Ticket.create({
        organizationId: orgId,
        regionCode: "MEA",
        createdBy: userId,
        category: "technical",
        priority: "MEDIUM",
        status: "OPEN",
        subject: "Concurrency test ticket",
        description: "Seed for E1 concurrency guard tests",
        slaDeadline: new Date(Date.now() + 86_400_000),
        escalationLevel: 1,
    });
}

describe("supportMessage.createMessage — E1 optimistic concurrency", () => {
    let orgId;
    let userA;
    let ticket;

    beforeEach(async () => {
        orgId = new mongoose.Types.ObjectId();
        userA = new mongoose.Types.ObjectId();
        ticket = await seedTicket({ orgId, userId: userA });
    });

    // ── Contract: expectedVersion is required ────────────────────────

    test("rejects when expectedVersion is omitted", async () => {
        const req = makeReq(orgId, userA);
        await expect(
            supportMessage.createMessage({
                req,
                ticketId: ticket._id,
                message: "no version",
                // expectedVersion intentionally missing
            })
        ).rejects.toMatchObject({
            code: "EXPECTED_VERSION_REQUIRED",
            status: 400,
        });
    });

    test("rejects when expectedVersion is a non-integer", async () => {
        const req = makeReq(orgId, userA);
        await expect(
            supportMessage.createMessage({
                req,
                ticketId: ticket._id,
                message: "bad version",
                expectedVersion: "not-a-number",
            })
        ).rejects.toMatchObject({
            code: "EXPECTED_VERSION_INVALID",
            status: 400,
        });
    });

    test("rejects when expectedVersion is negative", async () => {
        const req = makeReq(orgId, userA);
        await expect(
            supportMessage.createMessage({
                req,
                ticketId: ticket._id,
                message: "negative",
                expectedVersion: -1,
            })
        ).rejects.toMatchObject({
            code: "EXPECTED_VERSION_INVALID",
            status: 400,
        });
    });

    // ── Happy path: version chain ────────────────────────────────────

    test("happy path: v0 → v1 → v2 advances ticket version and counter monotonically", async () => {
        const req = makeReq(orgId, userA);

        await supportMessage.createMessage({
            req,
            ticketId: ticket._id,
            message: "first",
            expectedVersion: 0,
        });

        const afterFirst = await Ticket.findById(ticket._id).lean();
        expect(afterFirst.version).toBe(1);
        expect(afterFirst.threadMessageCount).toBe(1);

        await supportMessage.createMessage({
            req,
            ticketId: ticket._id,
            message: "second",
            expectedVersion: 1,
        });

        const afterSecond = await Ticket.findById(ticket._id).lean();
        expect(afterSecond.version).toBe(2);
        expect(afterSecond.threadMessageCount).toBe(2);
    });

    // ── Stale version path ──────────────────────────────────────────

    test("stale expectedVersion → 409 VERSION_CONFLICT with currentVersion", async () => {
        const req = makeReq(orgId, userA);

        // Advance ticket to version 1
        await supportMessage.createMessage({
            req,
            ticketId: ticket._id,
            message: "advance",
            expectedVersion: 0,
        });

        // Second caller still thinks we're at v0 → must 409
        await expect(
            supportMessage.createMessage({
                req,
                ticketId: ticket._id,
                message: "stale write",
                expectedVersion: 0,
            })
        ).rejects.toMatchObject({
            code: "VERSION_CONFLICT",
            status: 409,
            currentVersion: 1,
        });

        // And critically: the losing write did NOT leave a stray TicketMessage
        // row behind (the transaction rolled back).
        const rows = await TicketMessage.find({ ticketId: ticket._id }).lean();
        expect(rows.length).toBe(1);
        expect(rows[0].message).toBe("advance");

        const reloaded = await Ticket.findById(ticket._id).lean();
        expect(reloaded.version).toBe(1);
        expect(reloaded.threadMessageCount).toBe(1);
    });

    // ── Same body, correct version (anti-spam still fires) ──────────

    test("legitimate retry with same body at correct version → DUPLICATE_MESSAGE, version frozen", async () => {
        const req = makeReq(orgId, userA);

        // v0 → v1 via first send
        await supportMessage.createMessage({
            req,
            ticketId: ticket._id,
            message: "please help",
            expectedVersion: 0,
        });

        const beforeRetry = await Ticket.findById(ticket._id).lean();
        expect(beforeRetry.version).toBe(1);
        expect(beforeRetry.threadMessageCount).toBe(1);

        // Legit click-spam: user hits Send twice. Correct expectedVersion
        // (client read v1 after the first response), same body. Anti-spam
        // must fire BEFORE the CAS so we reject cheaply without touching
        // the Ticket document at all.
        await expect(
            supportMessage.createMessage({
                req,
                ticketId: ticket._id,
                message: "please help",
                expectedVersion: 1,
            })
        ).rejects.toMatchObject({ code: "DUPLICATE_MESSAGE", status: 409 });

        // Version and counter MUST be unchanged — the rejection happened
        // before any $inc hit the Ticket doc.
        const afterRetry = await Ticket.findById(ticket._id).lean();
        expect(afterRetry.version).toBe(1);
        expect(afterRetry.threadMessageCount).toBe(1);
    });

    // ── lastMessageAt monotonicity ──────────────────────────────────

    test("lastMessageAt advances monotonically with each successful create", async () => {
        const req = makeReq(orgId, userA);

        const t0 = await Ticket.findById(ticket._id).lean();
        expect(t0.lastMessageAt).toBeFalsy(); // unset on a fresh ticket

        await supportMessage.createMessage({
            req,
            ticketId: ticket._id,
            message: "first",
            expectedVersion: 0,
        });
        const t1 = await Ticket.findById(ticket._id).lean();
        expect(t1.lastMessageAt).toBeDefined();
        expect(t1.lastMessageAt).not.toBeNull();

        // Force a measurable gap so the comparison is unambiguous
        // regardless of DB clock resolution.
        await new Promise((r) => setTimeout(r, 10));

        await supportMessage.createMessage({
            req,
            ticketId: ticket._id,
            message: "second",
            expectedVersion: 1,
        });
        const t2 = await Ticket.findById(ticket._id).lean();
        expect(t2.lastMessageAt.getTime()).toBeGreaterThan(t1.lastMessageAt.getTime());
    });

    // ── Rollback integrity (independent of CAS) ─────────────────────

    test("failure between insert and update rolls back the TicketMessage row", async () => {
        const req = makeReq(orgId, userA);

        // Force the Ticket.updateOne that runs INSIDE the transaction to
        // throw. This proves the rollback path is real — not just that
        // the CAS filter returns 0 matches. Without a real transaction,
        // the TicketMessage insert would remain behind.
        const spy = jest
            .spyOn(Ticket, "updateOne")
            .mockImplementationOnce(() => {
                throw new Error("FORCED_FAILURE_AFTER_INSERT");
            });

        try {
            await expect(
                supportMessage.createMessage({
                    req,
                    ticketId: ticket._id,
                    message: "will be rolled back",
                    expectedVersion: 0,
                })
            ).rejects.toThrow("FORCED_FAILURE_AFTER_INSERT");
        } finally {
            spy.mockRestore();
        }

        // The insert that ran before the forced throw MUST be gone.
        const rows = await TicketMessage.find({ ticketId: ticket._id }).lean();
        expect(rows.length).toBe(0);

        // Ticket metadata is untouched.
        const reloaded = await Ticket.findById(ticket._id).lean();
        expect(reloaded.version).toBe(0);
        expect(reloaded.threadMessageCount).toBe(0);
        expect(reloaded.lastMessageAt).toBeFalsy();
    });

    // ── Parallel race ────────────────────────────────────────────────

    test("parallel race: two creates with same expectedVersion → one commits, one 409s, DB consistent", async () => {
        const req = makeReq(orgId, userA);

        // Fire both writes at the same version. Promise.allSettled so we
        // can inspect both outcomes regardless of which one wins the race.
        // Different message bodies avoid the anti-spam DUPLICATE_MESSAGE
        // guard — we want to isolate the version-conflict path here.
        const [resA, resB] = await Promise.allSettled([
            supportMessage.createMessage({
                req,
                ticketId: ticket._id,
                message: "racer A",
                expectedVersion: 0,
            }),
            supportMessage.createMessage({
                req,
                ticketId: ticket._id,
                message: "racer B",
                expectedVersion: 0,
            }),
        ]);

        const outcomes = [resA, resB];
        const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
        const rejected = outcomes.filter((o) => o.status === "rejected");

        // Exactly one winner, exactly one loser.
        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(1);

        // The loser MUST be VERSION_CONFLICT — not DUPLICATE_MESSAGE,
        // not a generic 500, not a write conflict surfaced raw.
        expect(rejected[0].reason).toMatchObject({
            code: "VERSION_CONFLICT",
            status: 409,
            currentVersion: 1,
        });

        // DB state: exactly one new TicketMessage row, version advanced by 1.
        const rows = await TicketMessage.find({ ticketId: ticket._id }).lean();
        expect(rows.length).toBe(1);

        const reloaded = await Ticket.findById(ticket._id).lean();
        expect(reloaded.version).toBe(1);
        expect(reloaded.threadMessageCount).toBe(1);

        // Sanity: the surviving row matches whichever racer the fulfilled
        // promise was — no silent cross-contamination.
        const winnerMessage = fulfilled[0].value.message;
        expect(rows[0].message).toBe(winnerMessage);
        expect(["racer A", "racer B"]).toContain(winnerMessage);

        // Error-shape contract lock — the 409 body that flows to the FE
        // MUST carry a numeric currentVersion so the client can refresh
        // state and retry. No stringy/null fallbacks.
        const loserErr = rejected[0].reason;
        expect(loserErr.code).toBe("VERSION_CONFLICT");
        expect(loserErr.status).toBe(409);
        expect(typeof loserErr.currentVersion).toBe("number");
        expect(loserErr.currentVersion).toBe(1);
    });

    // ── Multi-writer race: 3 concurrent creates at the same version ──

    test("3-writer race at same expectedVersion → exactly 1 success, 2 conflicts, state linear", async () => {
        const req = makeReq(orgId, userA);

        // Three racers, three distinct bodies (so anti-spam never fires
        // and isolates the CAS path).
        const results = await Promise.allSettled([
            supportMessage.createMessage({
                req,
                ticketId: ticket._id,
                message: "racer 1",
                expectedVersion: 0,
            }),
            supportMessage.createMessage({
                req,
                ticketId: ticket._id,
                message: "racer 2",
                expectedVersion: 0,
            }),
            supportMessage.createMessage({
                req,
                ticketId: ticket._id,
                message: "racer 3",
                expectedVersion: 0,
            }),
        ]);

        const fulfilled = results.filter((r) => r.status === "fulfilled");
        const rejected = results.filter((r) => r.status === "rejected");

        // Exactly one winner even with 3 racers — no partial double-commit.
        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(2);

        // Both losers are VERSION_CONFLICT (not write-conflict, not 500).
        for (const r of rejected) {
            expect(r.reason).toMatchObject({
                code: "VERSION_CONFLICT",
                status: 409,
            });
            expect(typeof r.reason.currentVersion).toBe("number");
            expect(r.reason.currentVersion).toBe(1);
        }

        // DB state: one row, version 1, counter 1. Linear.
        const rows = await TicketMessage.find({ ticketId: ticket._id }).lean();
        expect(rows.length).toBe(1);
        const reloaded = await Ticket.findById(ticket._id).lean();
        expect(reloaded.version).toBe(1);
        expect(reloaded.threadMessageCount).toBe(1);
    });
});
