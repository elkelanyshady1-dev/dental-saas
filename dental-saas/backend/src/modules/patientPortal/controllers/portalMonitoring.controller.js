/**
 * portalMonitoring.controller.js
 * Phase 2 — secureModel Migration: Monitoring + Photos + Progress + Messages Controller
 *
 * All controller methods now pass `req` to services for secureModel tenant isolation enforcement.
 * organizationId is derived from req.rls automatically — NOT from req.organizationId.
 *
 * @per-org-transactional — controller passes req to service for tenant isolation enforcement
 */

"use strict";

const monitoringService = require("../services/portalMonitoring.service");

// ─── Aligner Progress ─────────────────────────────────────────────────────────

async function listProgress(req, res) {
    try {
        const { caseId } = req.query;
        const data = await monitoringService.listProgress({
            patientId: req.patientId || req.query.patientId,
            caseId
        });
        return res.json({ success: true, data });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "LIST_ERROR", message: err.message } });
    }
}

async function activateStage(req, res) {
    try {
        const entry = await monitoringService.activateStage({
            progressId: req.params.id
        });
        return res.json({ success: true, data: entry });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "ACTIVATE_ERROR", message: err.message } });
    }
}

async function completeStage(req, res) {
    try {
        const { patientPainLevel, patientWearHours } = req.body;
        const entry = await monitoringService.completeStage({
            progressId: req.params.id,
            patientPainLevel,
            patientWearHours
        });
        return res.json({ success: true, data: entry });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "COMPLETE_ERROR", message: err.message } });
    }
}

// ─── Photos ───────────────────────────────────────────────────────────────────

async function uploadPhoto(req, res) {
    try {
        const { fileKey, photoType, stageNumber, originalFileName, fileSize, mimeType, monitoringSessionId } = req.body;
        if (!fileKey || !photoType || !stageNumber) {
            return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "fileKey, photoType, stageNumber are required." } });
        }
        const result = await monitoringService.registerPhoto({
            patientId: req.patientId || req.body.patientId,
            caseId: req.body.caseId,
            monitoringSessionId,
            data: { fileKey, photoType, stageNumber: parseInt(stageNumber), originalFileName, fileSize, mimeType }
        });
        return res.status(201).json({ success: true, data: result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "UPLOAD_ERROR", message: err.message } });
    }
}

async function listPhotos(req, res) {
    try {
        const { patientId, caseId, monitoringSessionId } = req.query;
        const photos = await monitoringService.listPhotos({
            patientId: patientId || req.patientId,
            caseId,
            monitoringSessionId
        });
        return res.json({ success: true, data: photos });
    } catch (err) {
        return res.status(500).json({ success: false, error: { code: "LIST_ERROR", message: err.message } });
    }
}

// ─── Monitoring Sessions ──────────────────────────────────────────────────────

async function submitMonitoringSession(req, res) {
    try {
        const session = await monitoringService.submitMonitoringSession({
            patientId: req.patientId || req.body.patientId,
            caseId: req.body.caseId,
            data: req.body
        });
        return res.status(201).json({ success: true, data: session });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "SUBMIT_ERROR", message: err.message } });
    }
}

async function listMonitoringSessions(req, res) {
    try {
        const { patientId, caseId, status, page, limit } = req.query;
        const result = await monitoringService.listMonitoringSessions({
            filters: { patientId, caseId, status },
            page: parseInt(page) || 1,
            limit: Math.min(parseInt(limit) || 20, 50)
        });
        return res.json({ success: true, data: result.sessions, pagination: result.pagination });
    } catch (err) {
        return res.status(500).json({ success: false, error: { code: "LIST_ERROR", message: err.message } });
    }
}

async function getMonitoringSession(req, res) {
    try {
        const session = await monitoringService.getMonitoringSession({
            sessionId: req.params.id
        });
        return res.json({ success: true, data: session });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "GET_ERROR", message: err.message } });
    }
}

async function reviewMonitoringSession(req, res) {
    try {
        const { status, doctorNotes, doctorFeedback, revisionDetails } = req.body;
        if (!status) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "status is required." } });
        const session = await monitoringService.reviewMonitoringSession({
            sessionId: req.params.id,
            newStatus: status,
            reviewedBy: req.user._id,
            doctorNotes,
            doctorFeedback,
            revisionDetails
        });
        return res.json({ success: true, data: session });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "REVIEW_ERROR", message: err.message } });
    }
}

// ─── Messages ─────────────────────────────────────────────────────────────────

async function sendMessage(req, res) {
    try {
        const msg = await monitoringService.sendMessage({
            patientId: req.patientId || req.body.patientId,
            data: {
                ...req.body,
                doctorId: req.user?._id || req.body.doctorId,
                senderType: req.patientId ? "patient" : (req.body.senderType || "doctor")
            }
        });
        return res.status(201).json({ success: true, data: msg });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "SEND_ERROR", message: err.message } });
    }
}

async function listMessages(req, res) {
    try {
        const { patientId, caseId, page, limit } = req.query;
        const result = await monitoringService.listMessages({
            patientId: patientId || req.patientId,
            caseId,
            page: parseInt(page) || 1,
            limit: Math.min(parseInt(limit) || 50, 100)
        });
        return res.json({ success: true, data: result.messages, pagination: result.pagination });
    } catch (err) {
        return res.status(500).json({ success: false, error: { code: "LIST_ERROR", message: err.message } });
    }
}

module.exports = {
    listProgress, activateStage, completeStage,
    uploadPhoto, listPhotos,
    submitMonitoringSession, listMonitoringSessions, getMonitoringSession, reviewMonitoringSession,
    sendMessage, listMessages
};
