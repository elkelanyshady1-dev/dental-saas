/**
 * ticket.ownership.test.js — Phase 3 lock test (E4)
 *
 * Locks the org-plane ownership rule: a user MUST only be able to read or
 * mutate tickets they created. Cross-user access returns 404 (never 403)
 * so existence is not leaked.
 */

"use strict";

const mongoose = require("mongoose");
const Ticket = require("@shared/models/Ticket").default;
const orgSupportBridge = require("@services/bridges/orgSupportBridge.service");

function makeReq(orgId, userId, roleName = "OrgStaff") {
    return {
        context: { organizationId: orgId, userId, roleName, plane: "org" },
        user: {
            _id: userId,
            organizationId: orgId,
            roleName,
            regionCode: "MEA",
        },
        headers: {},
        ip: "127.0.0.1",
        dbConnection: mongoose.connection,
    };
}

async function seedTicket({ orgId, userId, subject = "T" }) {
    return Ticket.create({
        organizationId: orgId,
        regionCode: "MEA",
        createdBy: userId,
        category: "technical",
        priority: "MEDIUM",
        status: "OPEN",
        subject,
        description: "ownership test",
        slaDeadline: new Date(Date.now() + 86_400_000),
        escalationLevel: 1,
    });
}

describe("Ticket ownership isolation (Phase 3 E4)", () => {
    let orgId;
    let userA;
    let userB;

    beforeEach(() => {
        orgId = new mongoose.Types.ObjectId();
        userA = new mongoose.Types.ObjectId();
        userB = new mongoose.Types.ObjectId();
    });

    test("user B cannot fetch user A's ticket — returns 404", async () => {
        const ticket = await seedTicket({ orgId, userId: userA });

        await expect(
            orgSupportBridge.getTicketDetail(makeReq(orgId, userB), String(ticket._id))
        ).rejects.toMatchObject({ status: 404 });
    });

    test("user B cannot comment on user A's ticket — returns 404", async () => {
        const ticket = await seedTicket({ orgId, userId: userA });

        await expect(
            orgSupportBridge.addComment(
                makeReq(orgId, userB),
                String(ticket._id),
                { message: "intrusion", expectedVersion: 0 }
            )
        ).rejects.toMatchObject({ status: 404 });
    });

    test("listTickets for user B excludes user A's tickets", async () => {
        await seedTicket({ orgId, userId: userA, subject: "A1" });
        await seedTicket({ orgId, userId: userA, subject: "A2" });
        const ownB = await seedTicket({ orgId, userId: userB, subject: "B1" });

        const list = await orgSupportBridge.listTickets(makeReq(orgId, userB), { limit: 50 });
        const ids = list.map((t) => String(t._id || t.id));
        expect(ids).toContain(String(ownB._id));
        expect(ids.length).toBe(1);
    });

    test("user A can still access their own ticket", async () => {
        const ticket = await seedTicket({ orgId, userId: userA });
        const dto = await orgSupportBridge.getTicketDetail(
            makeReq(orgId, userA),
            String(ticket._id)
        );
        expect(dto).toBeTruthy();
    });
});
