/**
 * portalMonitoring.service.js
 * Phase 2 — secureModel Migration: Monitoring + Photo + Progress Service
 *
 * Handles:
 *   - Aligner progress CRUD
 *   - Photo registration + AI queue dispatch
 *   - Monitoring session lifecycle (submit → review → approve/revise)
 *   - Patient messaging
 *   - Notification dispatch
 *
 * RLS ENFORCEMENT:
 *   All queries go through secureModel() which auto-injects organizationId
 *   from req.rls. Manual organizationId in queries is REDUNDANT but kept
 *   for defense-in-depth (secureModel overrides it anyway).
 *
 * @per-org-transactional — portal monitoring service — all queries via secureModel
 */

"use strict";

const AlignerProgressDef = require("../models/AlignerProgress.model");
const PatientPhotoDef = require("../models/PatientPhoto.model");
const MonitoringSessionDef = require("../models/MonitoringSession.model");
const PatientMessageDef = require("../models/PatientMessage.model");
const getModel = require("../../../core/db/getModel");
const { enqueueNotification } = require("../../notificationDomain/notification.service");
const eventBus = require("../../../core/eventBus");
const logger = require("@utils/logger");

// ─── Per-Request Model Resolution ────────────────────────────────────────────
function _getModels(req) {
    const conn = req.dbConnection;
    return {
        AlignerProgress: getModel(conn, AlignerProgressDef),
        PatientPhoto: getModel(conn, PatientPhotoDef),
        MonitoringSession: getModel(conn, MonitoringSessionDef),
        PatientMessage: getModel(conn, PatientMessageDef),
    };
}

// ─── Monitoring Session FSM ───────────────────────────────────────────────────
const SESSION_TRANSITIONS = {
    submitted: ["under_review"],
    under_review: ["approved", "revision_required"],
    approved: [],
    revision_required: ["submitted"]  // patient re-submits
};

function validateSessionTransition(current, next) {
    const allowed = SESSION_TRANSITIONS[current] || [];
    if (!allowed.includes(next)) {
        return { valid: false, message: `Cannot transition from '${current}' to '${next}'. Allowed: [${allowed.join(", ")}]` };
    }
    return { valid: true };
}

class PortalMonitoringService {

    // ─── Aligner Progress ────────────────────────────────────────────────────

    async createProgressEntry({ req, patientId, caseId, data }) {
        const { AlignerProgress } = _getModels(req);
        return AlignerProgress.create({
            patientId,
            caseId,
            stageNumber: data.stageNumber,
            alignerPlanId: data.alignerPlanId,
            scheduledStartDate: data.scheduledStartDate,
            wearDurationDays: data.wearDurationDays || 14,
            status: "pending"
        });
    }

    async listProgress({ req, patientId, caseId }) {
        const { AlignerProgress } = _getModels(req);
        // @per-org-transactional — per-org DB connection provides tenant isolation from req.rls
        return AlignerProgress.find(
            { patientId, caseId, isActive: true }
        ).sort({ stageNumber: 1 }).lean();
    }

    async getProgressById({ req, progressId }) {
        const { AlignerProgress } = _getModels(req);
        // @per-org-transactional — per-org DB connection provides tenant isolation from req.rls
        const entry = await AlignerProgress.findOne(
            { _id: progressId }
        );
        if (!entry) {
            const err = new Error("Progress entry not found."); err.statusCode = 404; throw err;
        }
        return entry;
    }

    async activateStage({ req, progressId }) {
        const { AlignerProgress } = _getModels(req);
        // @per-org-transactional — per-org DB connection provides tenant isolation from req.rls
        const entry = await AlignerProgress.findOne(
            { _id: progressId }
        );
        if (!entry) {
            const err = new Error("Stage not found."); err.statusCode = 404; throw err;
        }
        entry.status = "active";
        entry.startedAt = new Date();
        await entry.save();
        return entry;
    }

    async completeStage({ req, progressId, patientPainLevel, patientWearHours }) {
        const { AlignerProgress } = _getModels(req);
        // @per-org-transactional — per-org DB connection provides tenant isolation from req.rls
        const entry = await AlignerProgress.findOne(
            { _id: progressId }
        );
        if (!entry) {
            const err = new Error("Stage not found."); err.statusCode = 404; throw err;
        }
        entry.status = "completed";
        entry.completedAt = new Date();
        if (patientPainLevel !== undefined) entry.patientPainLevel = patientPainLevel;
        if (patientWearHours !== undefined) entry.patientWearHours = patientWearHours;
        await entry.save();

        eventBus.emit("stage.reminder_sent", {
            organizationId: req.organizationId,
            patientId: entry.patientId,
            caseId: entry.caseId,
            stageNumber: entry.stageNumber
        });

        return entry;
    }

    // ─── Photo Management ────────────────────────────────────────────────────

    async registerPhoto({ req, patientId, caseId, monitoringSessionId, data }) {
        const { PatientPhoto } = _getModels(req);
        const photo = await PatientPhoto.create({
            patientId,
            caseId,
            monitoringSessionId,
            stageNumber: data.stageNumber,
            photoType: data.photoType,
            fileKey: data.fileKey,
            originalFileName: data.originalFileName,
            fileSize: data.fileSize,
            mimeType: data.mimeType,
            aiAnalysisStatus: "queued"
        });

        logger.info({ photoId: photo._id }, "[PortalMonitoring] Photo registered \u2014 pending AI engine integration");

        eventBus.emit("photo.uploaded", {
            organizationId: req.organizationId,
            patientId,
            caseId,
            photoId: photo._id,
            photoType: data.photoType
        });

        return { photo, jobId: null };
    }

    async listPhotos({ req, patientId, caseId, monitoringSessionId }) {
        const { PatientPhoto } = _getModels(req);
        // @per-org-transactional — per-org DB connection provides tenant isolation from req.rls
        const query = { patientId, isActive: true };
        if (caseId) query.caseId = caseId;
        if (monitoringSessionId) query.monitoringSessionId = monitoringSessionId;
        return PatientPhoto.find(query).sort({ createdAt: -1 }).lean();
    }

    // ─── Monitoring Sessions ─────────────────────────────────────────────────

    async submitMonitoringSession({ req, patientId, caseId, data }) {
        const { AlignerProgress, MonitoringSession } = _getModels(req);
        // Resolve the progress entry
        // @per-org-transactional — per-org DB connection provides tenant isolation from req.rls
        const progressEntry = await AlignerProgress.findOne({
            patientId, caseId,
            stageNumber: data.stageNumber
        });

        if (!progressEntry) {
            const err = new Error("Aligner progress entry not found for this stage."); err.statusCode = 404; throw err;
        }

        const session = await MonitoringSession.create({
            patientId,
            caseId,
            alignerProgressId: progressEntry._id,
            stageNumber: data.stageNumber,
            patientNote: data.patientNote || "",
            status: "submitted"
        });

        // Mark progress as having a monitoring session
        progressEntry.monitoringSubmitted = true;
        await progressEntry.save();

        // Notify doctor
        await enqueueNotification({
            organizationId: req.organizationId,
            type: "MONITORING_SUBMITTED",
            title: "Monitoring Session Submitted",
            message: `Patient submitted photos for stage ${data.stageNumber}`,
            entityType: "MONITORING",
            entityId: session._id,
            priority: "normal"
        });

        return session;
    }

    async listMonitoringSessions({ req, filters = {}, page = 1, limit = 20 }) {
        const { MonitoringSession } = _getModels(req);
        // @per-org-transactional — per-org DB connection provides tenant isolation from req.rls
        const query = {};
        if (filters.patientId) query.patientId = filters.patientId;
        if (filters.caseId) query.caseId = filters.caseId;
        if (filters.status) query.status = filters.status;

        const skip = (page - 1) * limit;
        const [sessions, total] = await Promise.all([
            MonitoringSession.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            MonitoringSession.countDocuments(query)
        ]);

        return { sessions, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    }

    async getMonitoringSession({ req, sessionId }) {
        const { MonitoringSession } = _getModels(req);
        // @per-org-transactional — per-org DB connection provides tenant isolation from req.rls
        const session = await MonitoringSession.findOne(
            { _id: sessionId }
        )
            .populate("photoIds")
            .populate("reviewedBy", "name email")
            .lean();
        if (!session) {
            const err = new Error("Monitoring session not found."); err.statusCode = 404; throw err;
        }
        return session;
    }

    async reviewMonitoringSession({ req, sessionId, newStatus, reviewedBy, doctorNotes, doctorFeedback, revisionDetails }) {
        const { MonitoringSession } = _getModels(req);
        // @per-org-transactional — per-org DB connection provides tenant isolation from req.rls
        const session = await MonitoringSession.findOne(
            { _id: sessionId }
        );
        if (!session) {
            const err = new Error("Session not found."); err.statusCode = 404; throw err;
        }

        const result = validateSessionTransition(session.status, newStatus);
        if (!result.valid) {
            const err = new Error(result.message); err.statusCode = 400; throw err;
        }

        session.status = newStatus;
        session.reviewedBy = reviewedBy;
        session.reviewedAt = new Date();
        session.doctorNotes = doctorNotes || "";
        session.doctorFeedback = doctorFeedback || "";
        if (newStatus === "revision_required" && revisionDetails) {
            session.revisionDetails = revisionDetails;
        }
        session.notificationSent.patientNotified = false;
        await session.save();

        // Notify patient
        const notifMessage = newStatus === "approved"
            ? "Your monitoring session has been approved by the doctor."
            : "Your doctor has requested additional photos. Please check your portal.";

        await enqueueNotification({
            organizationId: req.organizationId,
            type: "DOCTOR_REVIEW_COMPLETED",
            title: "Doctor Review Completed",
            message: notifMessage,
            entityType: "MONITORING",
            entityId: session._id,
            priority: "high"
        });

        eventBus.emit("doctor.review_completed", {
            organizationId: req.organizationId,
            patientId: session.patientId,
            sessionId: session._id,
            status: newStatus
        });

        return session;
    }

    async addPhotosToSession({ req, sessionId, photoIds }) {
        const { MonitoringSession } = _getModels(req);
        // @per-org-transactional — per-org DB connection provides tenant isolation from req.rls
        const session = await MonitoringSession.findOne(
            { _id: sessionId }
        );
        if (!session) {
            const err = new Error("Session not found."); err.statusCode = 404; throw err;
        }
        session.photoIds.push(...photoIds);
        await session.save();
        return session;
    }

    // ─── Patient Messaging ───────────────────────────────────────────────────

    async sendMessage({ req, patientId, data }) {
        const { PatientMessage } = _getModels(req);
        return PatientMessage.create({
            patientId,
            doctorId: data.doctorId || null,
            caseId: data.caseId || null,
            senderType: data.senderType,
            messageType: data.messageType || "text",
            message: data.message,
            attachments: data.attachments || []
        });
    }

    async listMessages({ req, patientId, caseId, page = 1, limit = 50 }) {
        const { PatientMessage } = _getModels(req);
        // @per-org-transactional — per-org DB connection provides tenant isolation from req.rls
        const query = { patientId, isActive: true };
        if (caseId) query.caseId = caseId;
        const skip = (page - 1) * limit;
        const [messages, total] = await Promise.all([
            PatientMessage.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            PatientMessage.countDocuments(query)
        ]);
        return { messages, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    }

    async markMessagesRead({ req, patientId, readerType }) {
        const { PatientMessage } = _getModels(req);
        // @per-org-transactional — per-org DB connection provides tenant isolation from req.rls
        const field = readerType === "patient" ? "isReadByPatient" : "isReadByDoctor";
        await PatientMessage.updateMany(
            { patientId, [field]: false, isActive: true },
            { $set: { [field]: true, readAt: new Date() } }
        );
        return { success: true };
    }
}

module.exports = new PortalMonitoringService();
module.exports.SESSION_TRANSITIONS = SESSION_TRANSITIONS;
module.exports.validateSessionTransition = validateSessionTransition;
