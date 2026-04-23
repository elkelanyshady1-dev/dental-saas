"use strict";

/**
 * treatmentPlanVersion.controller.js
 *
 * HTTP surface for the orthodontic treatment plan versioning system.
 *
 * SECURITY MODEL (per mutation):
 *   1. authorize(req, "orthodontics.full")       ← RBAC
 *   2. checkCaseOwnership(req, caseId)           ← Case-level ownership
 *   3. parseSafe(schema, req.body, label)        ← Zod DTO validation
 *   4. service call                              ← Business logic + transactions
 *
 * READ endpoints: RBAC only (no ownership check).
 *
 * organizationId is ALWAYS from req.context (JWT SSOT — never body).
 */

const mongoose = require("mongoose");

const svc                = require("../services/treatmentPlanVersion.service");
const { authorize }      = require("../../../utils/authorize");
const { checkCaseOwnership } = require("../utils/ownership.guard");
const { parseSafe }      = require("../../../core/validation/parseSafe");
const logger             = require("@utils/logger");
const getModel           = require("../../../core/db/getModel");
const PlanIdempotencyRecordDef = require("../models/PlanIdempotencyRecord.model");

const {
    buildPlanVersionDTO,
    buildPlanVersionListItemDTO,
    buildCompareDTO,
} = require("../clinical/dto/treatmentPlanVersion.dto");

const {
    createDraftSchema,
    editDraftSchema,
    createRevisionSchema,
    compareQuerySchema,
} = require("../clinical/validators/treatmentPlanVersion.validator");

const isValidId = (id) => mongoose.isValidObjectId(id);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _validationError(res, label, zodError) {
    return res.status(400).json({
        success: false,
        error: {
            code: "VALIDATION_ERROR",
            message: `Invalid ${label} payload`,
            details: zodError?.issues ?? [],
        },
    });
}

function _fail(res, err, fallbackCode) {
    const status = err?.statusCode || 500;
    logger.warn(`[PlanVersion] ${fallbackCode}: ${err?.message}`);
    return res.status(status).json({
        success: false,
        error: { code: err?.code || fallbackCode, message: err?.message || "Internal error" },
    });
}

// ─── Minimal idempotency — hardening §4 ──────────────────────────────────────
// Reads the Idempotency-Key request header; if a record exists for the same
// (organizationId, key) it replays the cached response without re-executing
// the write. Only applied to write endpoints. On first success we persist the
// response (24h TTL).
//
// This is DB-backed, per-org, and intentionally narrow — not a general-purpose
// middleware. It catches client-retry and double-submit, not deep replay attacks.

async function _idempotencyReplay({ req, action }) {
    const key = req.headers["idempotency-key"] || req.headers["Idempotency-Key"];
    if (!key || typeof key !== "string") return { key: null, replay: null };
    const Model = getModel(req.dbConnection, PlanIdempotencyRecordDef);
    const existing = await Model.findOne({
        key,
        action,
    }).lean();
    return { key, replay: existing || null };
}

async function _idempotencyStore({ req, key, action, response, statusCode }) {
    if (!key) return;
    try {
        const Model = getModel(req.dbConnection, PlanIdempotencyRecordDef);
        await Model.create({
            key,
            action,
            response,
            statusCode,
        });
    } catch (err) {
        // Duplicate-key (race between two retries): safe to ignore — the
        // other request's record is authoritative and our write would be
        // redundant anyway.
        if (err.code !== 11000) {
            logger.warn(`[PlanVersion] idempotency store failed: ${err.message}`);
        }
    }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

async function list(req, res) {
    try {
        authorize(req, "orthodontics.read");
        const { caseId } = req.params;
        if (!isValidId(caseId)) return _validationError(res, "caseId", { issues: [{ message: "caseId must be a valid ObjectId" }] });
        const docs = await svc.listVersions(req, { caseId });
        return res.json({ success: true, data: docs.map(buildPlanVersionListItemDTO) });
    } catch (err) { return _fail(res, err, "PLAN_VERSION_LIST_ERROR"); }
}

async function getActive(req, res) {
    try {
        authorize(req, "orthodontics.read");
        const { caseId } = req.params;
        if (!isValidId(caseId)) return _validationError(res, "caseId", { issues: [{ message: "caseId must be a valid ObjectId" }] });
        const doc = await svc.getActiveVersion(req, { caseId });
        return res.json({ success: true, data: doc ? buildPlanVersionDTO(doc) : null });
    } catch (err) { return _fail(res, err, "PLAN_VERSION_ACTIVE_ERROR"); }
}

async function getApproved(req, res) {
    try {
        authorize(req, "orthodontics.read");
        const { caseId } = req.params;
        if (!isValidId(caseId)) return _validationError(res, "caseId", { issues: [{ message: "caseId must be a valid ObjectId" }] });
        const doc = await svc.getApprovedVersion(req, { caseId });
        return res.json({ success: true, data: doc ? buildPlanVersionDTO(doc) : null });
    } catch (err) { return _fail(res, err, "PLAN_VERSION_APPROVED_ERROR"); }
}

async function getOne(req, res) {
    try {
        authorize(req, "orthodontics.read");
        const { versionId } = req.params;
        if (!isValidId(versionId)) return _validationError(res, "versionId", { issues: [{ message: "versionId must be a valid ObjectId" }] });
        const doc = await svc.getVersion(req, { versionId });
        if (!doc) return res.status(404).json({ success: false, error: { code: "VERSION_NOT_FOUND", message: "Plan version not found" } });
        return res.json({ success: true, data: buildPlanVersionDTO(doc) });
    } catch (err) { return _fail(res, err, "PLAN_VERSION_GET_ERROR"); }
}

async function compare(req, res) {
    try {
        authorize(req, "orthodontics.read");
        const { caseId } = req.params;
        if (!isValidId(caseId)) return _validationError(res, "caseId", { issues: [{ message: "caseId must be a valid ObjectId" }] });
        const parsed = parseSafe(compareQuerySchema, req.query, "planVersionCompareQuery");
        if (!parsed.success) return _validationError(res, "compare query", parsed.error);
        const result = await svc.compareVersions(req, {
            caseId,
            fromVersionId: parsed.data.from,
            toVersionId:   parsed.data.to,
        });
        return res.json({ success: true, data: buildCompareDTO(result) });
    } catch (err) { return _fail(res, err, "PLAN_VERSION_COMPARE_ERROR"); }
}

// ─── Writes ───────────────────────────────────────────────────────────────────

async function createDraft(req, res) {
    try {
        authorize(req, "orthodontics.full");
        const { caseId } = req.params;
        if (!isValidId(caseId)) return _validationError(res, "caseId", { issues: [{ message: "caseId must be a valid ObjectId" }] });

        const parsed = parseSafe(createDraftSchema, req.body, "planVersionCreateDraft");
        if (!parsed.success) return _validationError(res, "createDraft body", parsed.error);

        await checkCaseOwnership(req, caseId);

        // §4 — idempotency replay
        const { key, replay } = await _idempotencyReplay({ req, action: "CREATE_DRAFT" });
        if (replay) return res.status(replay.statusCode).json(replay.response);

        const created = await svc.createDraft(req, {
            caseId,
            recordSetId: parsed.data.recordSetId,
            payload:     parsed.data.payload,
            assets:      parsed.data.assets,
            userId:      req.context.userId,
        });
        const body = { success: true, data: buildPlanVersionDTO(created) };
        await _idempotencyStore({ req, key, action: "CREATE_DRAFT", response: body, statusCode: 201 });
        return res.status(201).json(body);
    } catch (err) { return _fail(res, err, "PLAN_VERSION_CREATE_DRAFT_ERROR"); }
}

async function editDraft(req, res) {
    try {
        authorize(req, "orthodontics.full");
        const { caseId, versionId } = req.params;
        if (!isValidId(caseId) || !isValidId(versionId)) {
            return _validationError(res, "params", { issues: [{ message: "caseId/versionId must be valid ObjectIds" }] });
        }

        const parsed = parseSafe(editDraftSchema, req.body, "planVersionEditDraft");
        if (!parsed.success) return _validationError(res, "editDraft body", parsed.error);

        await checkCaseOwnership(req, caseId);

        const updated = await svc.editDraft(req, {
            versionId,
            payload:             parsed.data.payload,
            assets:              parsed.data.assets,
            expectedVersionLock: parsed.data.expectedVersionLock,
            userId:              req.context.userId,
        });
        return res.json({ success: true, data: buildPlanVersionDTO(updated) });
    } catch (err) { return _fail(res, err, "PLAN_VERSION_EDIT_DRAFT_ERROR"); }
}

async function deleteDraft(req, res) {
    try {
        authorize(req, "orthodontics.full");
        const { caseId, versionId } = req.params;
        if (!isValidId(caseId) || !isValidId(versionId)) {
            return _validationError(res, "params", { issues: [{ message: "caseId/versionId must be valid ObjectIds" }] });
        }

        await checkCaseOwnership(req, caseId);

        const result = await svc.deleteDraft(req, { versionId, userId: req.context.userId });
        return res.json({ success: true, data: result });
    } catch (err) { return _fail(res, err, "PLAN_VERSION_DELETE_DRAFT_ERROR"); }
}

async function approve(req, res) {
    try {
        authorize(req, "orthodontics.full");
        const { caseId, versionId } = req.params;
        if (!isValidId(caseId) || !isValidId(versionId)) {
            return _validationError(res, "params", { issues: [{ message: "caseId/versionId must be valid ObjectIds" }] });
        }

        await checkCaseOwnership(req, caseId);

        // §4 — idempotency replay (in addition to service-level deterministic guard §1.1)
        const { key, replay } = await _idempotencyReplay({ req, action: "APPROVE" });
        if (replay) return res.status(replay.statusCode).json(replay.response);

        const approved = await svc.approvePlan(req, { versionId, userId: req.context.userId });
        const body = { success: true, data: buildPlanVersionDTO(approved) };
        await _idempotencyStore({ req, key, action: "APPROVE", response: body, statusCode: 200 });
        return res.json(body);
    } catch (err) { return _fail(res, err, "PLAN_VERSION_APPROVE_ERROR"); }
}

async function indexHealth(req, res) {
    try {
        authorize(req, "orthodontics.read");
        const result = await svc.ensureTreatmentPlanIndexes(req.dbConnection);
        const status = result.ok ? 200 : 500;
        return res.status(status).json({
            success: result.ok,
            data: { ok: !!result.ok, missing: result.missing || [] },
        });
    } catch (err) { return _fail(res, err, "PLAN_VERSION_INDEX_HEALTH_ERROR"); }
}

async function createRevision(req, res) {
    try {
        authorize(req, "orthodontics.full");
        const { caseId } = req.params;
        if (!isValidId(caseId)) return _validationError(res, "caseId", { issues: [{ message: "caseId must be a valid ObjectId" }] });

        const parsed = parseSafe(createRevisionSchema, req.body, "planVersionCreateRevision");
        if (!parsed.success) return _validationError(res, "createRevision body", parsed.error);

        await checkCaseOwnership(req, caseId);

        // §4 — idempotency replay
        const { key, replay } = await _idempotencyReplay({ req, action: "CREATE_REVISION" });
        if (replay) return res.status(replay.statusCode).json(replay.response);

        const created = await svc.createRevision(req, {
            caseId,
            recordSetId:   parsed.data.recordSetId,
            payload:       parsed.data.payload,
            changeSummary: parsed.data.changeSummary,
            assets:        parsed.data.assets,
            userId:        req.context.userId,
        });
        const body = { success: true, data: buildPlanVersionDTO(created) };
        await _idempotencyStore({ req, key, action: "CREATE_REVISION", response: body, statusCode: 201 });
        return res.status(201).json(body);
    } catch (err) { return _fail(res, err, "PLAN_VERSION_CREATE_REVISION_ERROR"); }
}

module.exports = {
    list,
    getActive,
    getApproved,
    getOne,
    compare,
    createDraft,
    editDraft,
    deleteDraft,
    approve,
    createRevision,
    indexHealth,
};
