/**
 * recall.dto.js — Recall Data Transfer Object Builder
 *
 * SINGLE SOURCE OF TRUTH for recall response shape.
 *
 * Rules (per CLAUDE.md §4):
 *   1. Every recall response MUST go through buildRecallDto.
 *   2. Raw Mongoose docs MUST NOT leave the controller.
 *   3. Populated refs (patientId, branchId) are flattened into
 *      `patient` / `branch` subobjects so the frontend consumes a
 *      stable shape regardless of query-level populate choices.
 *
 * Visibility:
 *   No role-gated fields today. If recalls grow financial flags
 *   (paid reminder upcharges, etc.), add role filtering here —
 *   mirroring appointment.dto.js.
 */

"use strict";

const { enforce } = require("../schemas/contractEnforcer");
const { recallResponseSchema } = require("../schemas/recall.response.schema");

function _idToString(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "string") return v;
    if (typeof v.toString === "function") return v.toString();
    return null;
}

function _toPlain(doc) {
    if (!doc) return doc;
    if (typeof doc.toObject === "function") return doc.toObject();
    return doc;
}

/**
 * _serializeRef
 * Mongoose populate() substitutes the FK with the referenced document OR
 * leaves it as an ObjectId when not populated. We normalize both paths to
 * { _id, ...subset } so the DTO is stable.
 */
function _serializeRef(field, subset) {
    if (!field) return null;
    if (typeof field === "string") return { _id: field };
    if (typeof field === "object" && field._id) {
        const out = { _id: _idToString(field._id) };
        for (const k of subset) {
            if (field[k] !== undefined) out[k] = field[k];
        }
        return out;
    }
    return { _id: _idToString(field) };
}

function buildRecallDto(doc, _ctx = {}) {
    const p = _toPlain(doc);
    if (!p) return null;

    // patientId / branchId may be ObjectId OR populated object.
    const patient = _serializeRef(p.patientId, ["name", "phone", "email"]);
    const branch = _serializeRef(p.branchId, ["name"]);

    const dto = {
        _id: _idToString(p._id),
        organizationId: _idToString(p.organizationId),
        branchId: _idToString(
            typeof p.branchId === "object" && p.branchId?._id
                ? p.branchId._id
                : p.branchId
        ),
        patientId: _idToString(
            typeof p.patientId === "object" && p.patientId?._id
                ? p.patientId._id
                : p.patientId
        ),
        dueDate: p.dueDate || null,
        reason: p.reason || "",
        status: p.status || "pending",
        patient,
        branch,
        createdAt: p.createdAt || null,
        updatedAt: p.updatedAt || null,
    };

    return enforce(dto, recallResponseSchema, "buildRecallDto");
}

function buildRecallListDto(docs) {
    if (!Array.isArray(docs)) return [];
    return docs.map((d) => buildRecallDto(d));
}

module.exports = {
    buildRecallDto,
    buildRecallListDto,
};
