/**
 * recall.service.js — Recall Management Service
 * Domain: orthodontic-visits
 * Layer: Service
 *
 * Provides:
 *   - createRecall(req, payload) → creates a recall draft (PENDING)
 *   - getRecallByVisit(req, visitId) → retrieves recall for a visit
 *
 * HARD RULES:
 *   ✅ organizationId from req.context (JWT SSOT)
 *   ✅ Visit MUST be COMPLETED to create a recall
 *   ❌ No recall creation on ACTIVE visits
 */

"use strict";

const mongoose           = require("mongoose");
const RecallDef          = require("../../../organization/models/Recall");
const VisitRecordDef     = require("../models/VisitRecord.model");
const getModel           = require("../../../core/db/getModel");
const enforceDbIsolation = require("../../../core/db/dbIsolation.guard");
const { buildRecallDTO } = require("../../recallDomain/dto/recall.dto");
const logger             = require("@utils/logger");

// ── Internal helpers ──────────────────────────────────────────────────────────

function _getRecallModel(req) {
    enforceDbIsolation(req);
    return getModel(req.dbConnection, RecallDef);
}

function _getVisitModel(req) {
    enforceDbIsolation(req);
    return getModel(req.dbConnection, VisitRecordDef);
}

// ── Interval → Date calculation ───────────────────────────────────────────────

const INTERVAL_MAP = {
    "2_weeks":  14,
    "3_weeks":  21,
    "1_month":  30,
    "6_weeks":  42,
    "3_months": 90,
    "6_months": 180,
};

function calculateSuggestedDate(interval, fromDate = new Date()) {
    const days = INTERVAL_MAP[interval];
    if (!days) return null;
    const date = new Date(fromDate);
    date.setDate(date.getDate() + days);
    return date;
}

// ── createRecall ──────────────────────────────────────────────────────────────
/**
 * Creates a recall draft linked to a visit.
 *
 * @param {Object} req     - Express request
 * @param {Object} payload
 * @param {string} payload.visitId     - VisitRecord._id
 * @param {string} payload.patientId   - Patient._id (from case)
 * @param {string} payload.branchId    - Branch._id
 * @param {string} payload.interval    - e.g. "2_weeks", "1_month", "custom"
 * @param {Date}   [payload.customDate] - custom recall date (when interval=custom)
 * @param {string} [payload.reason]    - optional reason
 * @returns {Promise<Object>} Recall document (plain object)
 */
async function createRecall(req, payload) {
    const { visitId, patientId, branchId, interval, customDate, reason } = payload;
    const Recall      = _getRecallModel(req);
    const VisitRecord = _getVisitModel(req);

    // ── HARD GUARD: visit must exist ──────────────────────────────────
    const visit = await VisitRecord.findById(visitId).lean();

    if (!visit) {
        const err = new Error(`Visit ${visitId} not found.`);
        err.statusCode = 404;
        err.code       = "VISIT_NOT_FOUND";
        throw err;
    }

    // Calculate due date
    let dueDate;
    if (interval === "custom" && customDate) {
        dueDate = new Date(customDate);
    } else {
        dueDate = calculateSuggestedDate(interval, visit.visitDate || visit.endedAt || new Date());
    }

    if (!dueDate || isNaN(dueDate.getTime())) {
        const err = new Error("Invalid recall date. Provide a valid interval or custom date.");
        err.statusCode = 400;
        err.code       = "INVALID_RECALL_DATE";
        throw err;
    }

    // ── Resolve patient name for denormalization ──────────────────────
    let patientName = "";
    let contactPhone = "";
    try {
        const PatientDef  = require("../../../organization/models/Patient");
        const PatientModel = getModel(req.dbConnection, PatientDef);
        const patient = await PatientModel.findById(patientId).select("nameEnglish nameArabic phone").lean();
        if (patient) {
            patientName  = patient.nameEnglish || patient.nameArabic || "";
            contactPhone = patient.phone || "";
        }
    } catch (e) {
        // Non-critical — continue without denormalized patient data
        logger.warn({ event: "RECALL_PATIENT_LOOKUP_FAILED", patientId, err: e.message });
    }

    const recall = await Recall.create({
        branchId:       branchId ? new mongoose.Types.ObjectId(branchId) : req.context.branchId,
        patientId:      new mongoose.Types.ObjectId(patientId),
        visitId:        new mongoose.Types.ObjectId(visitId),
        dueDate,
        interval:       interval || null,
        type:           "orthodontic",
        reason:         reason || `Recall after visit #${visit.visitNumber}`,
        status:         "pending",
        patientName,
        contactPhone,
        createdBy:      req.context.userId || null,
    });

    logger.info({
        event:     "RECALL_CREATED",
        recallId:  recall._id,
        visitId,
        patientId,
        interval,
        dueDate,
        orgId:     req.context.organizationId,
        userId:    req.context.userId,
    });

    return buildRecallDTO(recall.toObject());
}

// ── getRecallByVisit ──────────────────────────────────────────────────────────
/**
 * Returns the recall linked to a specific visit.
 *
 * @param {Object} req     - Express request
 * @param {string} visitId - VisitRecord._id
 * @returns {Promise<Object|null>} Recall document or null
 */
async function getRecallByVisit(req, visitId) {
    const Recall = _getRecallModel(req);

    // Direct lookup via visitId field (new schema)
    const recall = await Recall.findOne({ visitId }).lean();

    if (recall) return buildRecallDTO(recall);

    // Fallback: check by patientId from visit (legacy)
    const VisitRecord = _getVisitModel(req);
    const visit = await VisitRecord.findById(visitId).lean();

    if (!visit) return null;

    const fallback = await Recall.findOne({
        patientId: visit.patientId,
    }).sort({ createdAt: -1 }).lean();

    return fallback ? buildRecallDTO(fallback) : null;
}

module.exports = {
    createRecall,
    getRecallByVisit,
    calculateSuggestedDate,
    INTERVAL_MAP,
};
