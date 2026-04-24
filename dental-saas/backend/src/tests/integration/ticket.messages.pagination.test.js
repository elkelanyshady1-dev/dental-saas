/**
 * ticket.messages.pagination.test.js — Phase 3 E5 lock test
 *
 * Verifies:
 *   - createMessage writes to the TicketMessage collection and bumps
 *     `Ticket.threadMessageCount` + `lastMessageAt` atomically.
 *   - listMessages returns correctly ordered, non-duplicated pages via
 *     cursor pagination across multiple pages.
 *   - Anti-spam duplicate guard rejects immediate identical reposts.
 *   - Ownership guard returns 404 when a foreign user tries to list.
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
    const t = await Ticket.create({
        organizationId: orgId,
        regionCode: "MEA",
        createdBy: userId,
        category: "technical",
        priority: "MEDIUM",
        status: "OPEN",
        subject: "Paginated thread ticket",
        description: "Seed for pagination test",
        slaDeadline: new Date(Date.now() + 86_400_000),
        escalationLevel: 1,
    });
    return t;
}

describe("TicketMessage — service (Phase 3 E5)", () => {
    let orgId;
    let userA;
    let userB;
    let ticket;

    beforeEach(async () => {
        orgId = new mongoose.Types.ObjectId();
        userA = new mongoose.Types.ObjectId();
        userB = new mongoose.Types.ObjectId();
        ticket = await seedTicket({ orgId, userId: userA });
    });

    test("createMessage persists a row and bumps ticket metadata atomically", async () => {
        const req = makeReq(orgId, userA);
        const created = await supportMessage.createMessage({
            req,
            ticketId: ticket._id,
            message: "Hello world",
            expectedVersion: ticket.version || 0,
        });

        expect(created._id).toBeDefined();
        expect(created.sender).toBe("ORG_USER");

        const persisted = await TicketMessage.findById(created._id).lean();
        expect(persisted).not.toBeNull();

        const reloaded = await Ticket.findById(ticket._id).lean();
        expect(reloaded.threadMessageCount).toBe(1);
        expect(reloaded.lastMessageAt).toBeTruthy();
        expect(new Date(reloaded.lastMessageAt).getTime()).toBe(
            new Date(persisted.createdAt).getTime()
        );
    });

    test("listMessages paginates 30 messages in stable createdAt order", async () => {
        const req = makeReq(orgId, userA);

        // Insert 30 messages with monotonically increasing createdAt. We
        // bypass the anti-spam guard by alternating content.
        const rows = Array.from({ length: 30 }, (_, i) => ({
            ticketId: ticket._id,
            organizationId: orgId,
            sender: "ORG_USER",
            senderId: userA,
            message: `msg ${i.toString().padStart(2, "0")}`,
            createdAt: new Date(Date.now() + i * 1000),
        }));
        await TicketMessage.insertMany(rows);

        const page1 = await supportMessage.listMessages({
            req,
            ticketId: ticket._id,
            limit: 10,
        });
        expect(page1.items.length).toBe(10);
        expect(page1.hasMore).toBe(true);
        expect(page1.nextCursor).toBeTruthy();
        expect(page1.items.map((m) => m.message)).toEqual(
            rows.slice(0, 10).map((r) => r.message)
        );

        const page2 = await supportMessage.listMessages({
            req,
            ticketId: ticket._id,
            limit: 10,
            cursor: page1.nextCursor,
        });
        expect(page2.items.length).toBe(10);
        expect(page2.hasMore).toBe(true);
        expect(page2.items[0].message).toBe("msg 10");

        const page3 = await supportMessage.listMessages({
            req,
            ticketId: ticket._id,
            limit: 10,
            cursor: page2.nextCursor,
        });
        expect(page3.items.length).toBe(10);
        expect(page3.hasMore).toBe(false);
        expect(page3.nextCursor).toBeNull();

        // No duplicates across pages.
        const all = [...page1.items, ...page2.items, ...page3.items].map((m) => m._id);
        expect(new Set(all).size).toBe(30);
    });

    test("anti-spam rejects an immediate identical repost by the same sender", async () => {
        const req = makeReq(orgId, userA);
        // v0 → v1 via first send
        await supportMessage.createMessage({
            req,
            ticketId: ticket._id,
            message: "same",
            expectedVersion: 0,
        });
        // Second send races against v1; anti-spam fires before the CAS, so
        // we still get DUPLICATE_MESSAGE even with the correct expectedVersion.
        await expect(
            supportMessage.createMessage({
                req,
                ticketId: ticket._id,
                message: "same",
                expectedVersion: 1,
            })
        ).rejects.toMatchObject({ code: "DUPLICATE_MESSAGE", status: 409 });

        // Distinct message is fine — v1 → v2.
        await expect(
            supportMessage.createMessage({
                req,
                ticketId: ticket._id,
                message: "different",
                expectedVersion: 1,
            })
        ).resolves.toBeDefined();
    });

    test("ownership guard: foreign user gets 404 when listing", async () => {
        await supportMessage.createMessage({
            req: makeReq(orgId, userA),
            ticketId: ticket._id,
            message: "only A sees this",
            expectedVersion: 0,
        });

        const reqB = makeReq(orgId, userB);
        await expect(
            supportMessage.listMessages({ req: reqB, ticketId: ticket._id, limit: 10 })
        ).rejects.toMatchObject({ code: "TICKET_NOT_FOUND", status: 404 });
    });

    test("ownership guard: foreign user gets 404 when posting", async () => {
        const reqB = makeReq(orgId, userB);
        await expect(
            supportMessage.createMessage({
                req: reqB,
                ticketId: ticket._id,
                message: "intrusion",
                expectedVersion: 0,
            })
        ).rejects.toMatchObject({ code: "TICKET_NOT_FOUND", status: 404 });
    });
});
