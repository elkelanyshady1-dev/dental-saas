/**
 * labWrite.service.js — Lab Domain Write Authority (CQRS Write Side)
 *
 * All mutations flow through here. Controllers are thin.
 * Events emitted AFTER successful DB writes.
 *
 * HARDENING (v2):
 *   - All responses go through lab.dto.js builders (INV-LAB-DTO-2).
 *   - Input validation on all mutation entry points.
 *   - Financial cost fields sanitized via formatCost (INV-LAB-DTO-3).
 *   - forceOverride backward transitions emit audit event.
 *
 * DOMAIN BOUNDARY:
 *   ✅ External lab cases/claims/messages/partners
 *   ❌ No accounting DB writes — pure event bridge
 *   ❌ No clinical editing
 *   ❌ No cross-org queries
 *
 * PLANE: Org only. Per-org DB via conn (req.dbConnection or dbManager).
 */

"use strict";

const { randomBytes }  = require("crypto");
const getModel    = require("../../../core/db/getModel");
const eventBus    = require("../../../core/eventBus");
const logger      = require("@utils/logger");

const LabPartnerDef = require("../models/labPartner.model");
const LabCaseDef    = require("../models/labCase.model");
const LabClaimDef   = require("../models/labClaim.model");
const LabMessageDef = require("../models/labMessage.model");

const {
    buildLabPartnerDetailDTO,
    buildLabCaseDetailDTO,
    buildLabClaimListDTO,
    buildLabMessageDTO,
    formatCost,
} = require("../../../dto/lab.dto");

function _models(conn) {
    return {
        Partner: getModel(conn, LabPartnerDef),
        Case:    getModel(conn, LabCaseDef),
        Claim:   getModel(conn, LabClaimDef),
        Message: getModel(conn, LabMessageDef),
    };
}

// ── Input validation helpers ──────────────────────────────────────────────────

function _requireField(data, field, label) {
    if (!data || data[field] === undefined || data[field] === null || data[field] === "") {
        const e = new Error(`${label || field} is required`);
        e.statusCode = 400;
        throw e;
    }
}

function _requirePositiveNumber(data, field, label) {
    const val = Number(data?.[field]);
    if (!Number.isFinite(val) || val < 0) {
        const e = new Error(`${label || field} must be a non-negative number`);
        e.statusCode = 400;
        throw e;
    }
}

// ── Lab Partners ──────────────────────────────────────────────────────────────

async function createPartner(conn, data, actorId) {
    _requireField(data, "name", "Lab partner name");

    const { Partner } = _models(conn);
    const partner = await Partner.create({
        name:           data.name,
        location:       data.location,
        specialties:    data.specialties    || [],
        turnaroundDays: data.turnaroundDays,
        contact:        data.contact        || {},
        status:         data.status         || "active",
        avatar:         data.avatar,
        notes:          data.notes,
    });
    logger.info({ event: "LAB_PARTNER_CREATED", partnerId: partner._id, actorId });
    return buildLabPartnerDetailDTO(partner.toObject());
}

async function updatePartner(conn, partnerId, data, actorId) {
    const { Partner } = _models(conn);
    const allowed = ["name", "location", "specialties", "turnaroundDays", "contact", "status", "avatar", "notes"];
    const update = {};
    for (const key of allowed) {
        if (data[key] !== undefined) update[key] = data[key];
    }
    const partner = await Partner.findByIdAndUpdate(partnerId, { $set: update }, { new: true }).lean();
    if (!partner) { const e = new Error("Lab partner not found"); e.statusCode = 404; throw e; }
    logger.info({ event: "LAB_PARTNER_UPDATED", partnerId, actorId });
    return buildLabPartnerDetailDTO(partner);
}

// ── Lab Cases ─────────────────────────────────────────────────────────────────

async function createCase(conn, data, actorId, orgId) {
    _requireField(data, "labId", "Lab partner ID");
    _requireField(data, "applianceType", "Appliance type");

    const { Partner, Case } = _models(conn);

    const partner = await Partner.findById(data.labId).lean();
    if (!partner) { const e = new Error("Lab partner not found"); e.statusCode = 404; throw e; }

    const caseCode = data.caseCode || `ORD-${randomBytes(4).toString("hex").slice(0, 6).toUpperCase()}`;

    const labCase = await Case.create({
        caseCode,
        patientId:        data.patientId,
        patientName:      data.patientName,
        labId:            data.labId,
        labName:          partner.name,
        applianceType:    data.applianceType,
        status:           "draft",
        prescription:     data.prescription,
        notes:            data.notes,
        expectedDelivery: data.expectedDelivery,
        cost:             formatCost(data.cost),
    });

    eventBus.emit("lab.case.created.v1", { orgId, caseId: labCase._id.toString(), caseCode, actorId });
    logger.info({ event: "LAB_CASE_CREATED", caseId: labCase._id, caseCode, actorId });
    return buildLabCaseDetailDTO(labCase.toObject());
}

const STATUS_ORDER = ["draft", "sent", "accepted", "in_production", "shipped", "delivered", "completed"];

async function updateCaseStatus(conn, caseId, newStatus, data, actorId, orgId) {
    const { Case, Message } = _models(conn);

    const labCase = await Case.findById(caseId);
    if (!labCase) { const e = new Error("Lab case not found"); e.statusCode = 404; throw e; }

    const currentIdx = STATUS_ORDER.indexOf(labCase.status);
    const newIdx     = STATUS_ORDER.indexOf(newStatus);
    if (newIdx === -1) { const e = new Error(`Invalid status: ${newStatus}`); e.statusCode = 400; throw e; }

    // Allow backwards only for admin override — enforce FSM by default
    if (newIdx < currentIdx && !data?.forceOverride) {
        const e = new Error(`Cannot move case backwards from "${labCase.status}" to "${newStatus}" without forceOverride.`);
        e.statusCode = 409; throw e;
    }

    // Audit log backwards transitions
    if (newIdx < currentIdx && data?.forceOverride) {
        logger.warn({
            event: "LAB_CASE_BACKWARD_TRANSITION",
            caseId, from: labCase.status, to: newStatus, actorId,
        }, "[labDomain] Backward status transition (admin override)");
    }

    labCase.status = newStatus;
    if (newStatus === "delivered" || newStatus === "completed") {
        labCase.actualDelivery = new Date();
    }
    if (data?.trackingNumber) labCase.trackingNumber = data.trackingNumber;
    if (data?.trackingCarrier) labCase.trackingCarrier = data.trackingCarrier;
    labCase.updatedAt = new Date();
    await labCase.save();

    // Append system message to chat
    await Message.create({
        caseId:     labCase._id,
        sender:     actorId,
        senderType: "clinic",
        message:    `Case status changed to "${newStatus.toUpperCase().replace("_", " ")}"`,
        isSystem:   true,
    });

    // Emit update event
    eventBus.emit("lab.case.updated.v1", {
        orgId,
        caseId:    caseId.toString(),
        caseCode:  labCase.caseCode,
        status:    newStatus,
        actorId,
    });

    // Emit completion event — triggers accounting bridge
    if (newStatus === "completed") {
        eventBus.emit("lab.case.completed.v1", {
            orgId,
            caseId: caseId.toString(),
            cost:   labCase.cost,
            labId:  labCase.labId?.toString(),
            labName: labCase.labName,
            actorId,
        });
    }

    logger.info({ event: "LAB_CASE_STATUS_UPDATED", caseId, newStatus, actorId });
    return buildLabCaseDetailDTO(labCase.toObject());
}

// ── Lab Claims ────────────────────────────────────────────────────────────────

async function createClaim(conn, data, actorId, orgId) {
    _requireField(data, "caseId", "Case ID");
    _requireField(data, "labId", "Lab ID");
    _requirePositiveNumber(data, "cost", "Claim cost");

    const { Claim } = _models(conn);

    const claim = await Claim.create({
        caseId:        data.caseId,
        caseCode:      data.caseCode,
        labId:         data.labId,
        labName:       data.labName,
        applianceType: data.applianceType,
        cost:          formatCost(data.cost),
        status:        "pending",
        serviceDate:   data.serviceDate || new Date(),
        notes:         data.notes,
    });

    eventBus.emit("lab.claim.created.v1", {
        orgId,
        claimId: claim._id.toString(),
        caseId:  data.caseId,
        cost:    formatCost(data.cost),
        actorId,
    });

    logger.info({ event: "LAB_CLAIM_CREATED", claimId: claim._id, actorId });
    return buildLabClaimListDTO(claim.toObject());
}

async function approveClaim(conn, claimId, actorId, orgId) {
    const { Claim } = _models(conn);
    const claim = await Claim.findById(claimId);
    if (!claim) { const e = new Error("Claim not found"); e.statusCode = 404; throw e; }
    if (claim.status !== "pending") { const e = new Error(`Claim is already ${claim.status}`); e.statusCode = 409; throw e; }

    claim.status     = "approved";
    claim.approvedBy = actorId;
    claim.approvedAt = new Date();
    await claim.save();

    // Notify accounting — NO direct DB write
    eventBus.emit("accounting.expense.created.v1", {
        orgId,
        amount:    claim.cost,
        source:    "lab",
        claimId:   claimId.toString(),
        labName:   claim.labName,
        caseCode:  claim.caseCode,
    });

    logger.info({ event: "LAB_CLAIM_APPROVED", claimId, actorId });
    return buildLabClaimListDTO(claim.toObject());
}

async function markClaimPaid(conn, claimId, actorId) {
    const { Claim } = _models(conn);
    const claim = await Claim.findById(claimId);
    if (!claim) { const e = new Error("Claim not found"); e.statusCode = 404; throw e; }
    if (claim.status !== "approved") { const e = new Error("Only approved claims can be marked paid"); e.statusCode = 409; throw e; }

    claim.status = "paid";
    claim.paidAt = new Date();
    await claim.save();
    logger.info({ event: "LAB_CLAIM_PAID", claimId, actorId });
    return buildLabClaimListDTO(claim.toObject());
}

// ── Messages ──────────────────────────────────────────────────────────────────

async function postMessage(conn, caseId, data, actorId, orgId) {
    _requireField(data, "message", "Message content");

    const { Message, Case } = _models(conn);

    const labCase = await Case.findById(caseId).lean();
    if (!labCase) { const e = new Error("Lab case not found"); e.statusCode = 404; throw e; }

    const msg = await Message.create({
        caseId,
        sender:      actorId,
        senderName:  data.senderName,
        senderType:  data.senderType || "clinic",
        message:     data.message,
        attachments: data.attachments || [],
        isSystem:    false,
    });

    eventBus.emit("lab.message.sent.v1", {
        orgId,
        caseId: caseId.toString(),
        messageId: msg._id.toString(),
    });

    return buildLabMessageDTO(msg.toObject());
}

module.exports = {
    createPartner,
    updatePartner,
    createCase,
    updateCaseStatus,
    createClaim,
    approveClaim,
    markClaimPaid,
    postMessage,
};
