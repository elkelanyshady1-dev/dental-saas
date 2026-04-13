/**
 * sharedCase.controller.js (v4.0 — Thin Controller, Phase 4 Refactor)
 * Phase 6 — Multi-Doctor Collaboration Controller
 *
 * Controller is now THIN: orchestration only.
 * All DB logic lives in sharedCase.service.js.
 *
 * Routes:
 *   POST   /orthodontic-cases/:caseId/share     (org-auth)
 *   GET    /shared/:token                        (public)
 *   POST   /shared/:token/comments               (public)
 *   GET    /shared/:token/comments               (public)
 *   POST   /shared/:token/join                   (public)
 *
 * ─── SENTINEL COMPLIANCE ────────────────────────────────────────
 *  ✅ organizationId from req.organizationId (JWT context)
 *  ✅ All DB operations delegated to sharedCase.service.js
 *  ✅ Controller = orchestration + HTTP encoding ONLY
 */

"use strict";

const sharedCaseService = require("../services/sharedCase.service");
const orthoService      = require("../services/orthodonticCase.service");
const { authorize }      = require("../../../utils/authorize");
const logger            = require("@utils/logger");

// ═══════════════════════════════════════════════════════════════════════════════
// 1. CREATE SHARE LINK (Org-Auth)
// ═══════════════════════════════════════════════════════════════════════════════

const createShareLink = async (req, res) => {
    try {
        authorize(req, "orthodontics.full");

        const { caseId }      = req.params;
        const organizationId  = req.context.organizationId;
        const userId          = req.context.userId;
        const conn            = req.dbConnection;

        const result = await sharedCaseService.createShareLink(
            conn,
            organizationId,
            userId,
            caseId,
            req.body,
            orthoService.getOrCreateShareSnapshot
        );

        if (result.error) {
            return res.status(result.error).json({ success: false, error: { code: "SHARE_ERROR", message: result.message } });
        }

        const { shared, token } = result;
        const baseUrl  = process.env.FRONTEND_URL || "http://localhost:3000";
        const shareUrl = `${baseUrl}/share/${token}`;

        return res.status(201).json({
            success: true,
            data: {
                url:             shareUrl,
                token:           shared.token,
                type:            shared.type,
                snapshotId:      shared.snapshotId || null,
                recordIds:       shared.recordIds,
                recordSetIds:    shared.recordSetIds,
                expiresAt:       shared.expiresAt,
                permissions:     shared.permissions,
                hidePatientName: shared.hidePatientName,
            },
        });
    } catch (err) {
        logger.error({ err: err.message }, "[SharedCase] createShareLink failed");
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "SHARE_ERROR", message: err.message } });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2. GET SHARED CASE (Public)
// ═══════════════════════════════════════════════════════════════════════════════

const getSharedCase = async (req, res) => {
    try {
        const { token } = req.params;
        const result    = await sharedCaseService.getSharedCase(token);

        if (result.error) {
            return res.status(result.error).json({ success: false, error: { code: "SHARE_ERROR", message: result.message } });
        }

        return res.json({ success: true, data: result.data });
    } catch (err) {
        logger.error({ err: err.message }, "[SharedCase] getSharedCase failed");
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "SHARE_ERROR", message: err.message } });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ADD COMMENT (Public)
// ═══════════════════════════════════════════════════════════════════════════════

const addComment = async (req, res) => {
    try {
        const { token } = req.params;
        const result    = await sharedCaseService.addComment(token, req.body);

        if (result.error) {
            return res.status(result.error).json({ success: false, error: { code: "COMMENT_ERROR", message: result.message } });
        }

        const { comment, shared } = result;

        // Real-time broadcast (best-effort — non-critical)
        try {
            const { getIO } = require("../../infrastructure/realtime/socketServer");
            const collabNs  = getIO().of("/collab");
            collabNs.to(`share:${shared._id.toString()}`).emit("comment:added", {
                id:            comment._id,
                authorName:    comment.authorName,
                role:          comment.role,
                text:          comment.text,
                audioUrl:      comment.audioUrl,
                isHighlighted: comment.isHighlighted,
                createdAt:     comment.createdAt,
                _fromServer:   true,
            });
        } catch {
            logger.warn("[SharedCase] Socket.IO broadcast failed (non-critical)");
        }

        return res.status(201).json({
            success: true,
            data: {
                id:            comment._id,
                authorName:    comment.authorName,
                role:          comment.role,
                text:          comment.text,
                audioUrl:      comment.audioUrl,
                isHighlighted: comment.isHighlighted,
                createdAt:     comment.createdAt,
            },
        });
    } catch (err) {
        logger.error({ err: err.message }, "[SharedCase] addComment failed");
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "COMMENT_ERROR", message: err.message } });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 4. GET COMMENTS (Public)
// ═══════════════════════════════════════════════════════════════════════════════

const getComments = async (req, res) => {
    try {
        const { token } = req.params;
        const result    = await sharedCaseService.getComments(token);

        if (result.error) {
            return res.status(result.error).json({ success: false, error: { code: "COMMENT_ERROR", message: result.message } });
        }

        return res.json({
            success: true,
            data: result.comments.map(c => ({
                id:            c._id,
                authorName:    c.authorName,
                role:          c.role,
                text:          c.text,
                audioUrl:      c.audioUrl,
                isHighlighted: c.isHighlighted,
                createdAt:     c.createdAt,
            })),
        });
    } catch (err) {
        logger.error({ err: err.message }, "[SharedCase] getComments failed");
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "COMMENT_ERROR", message: err.message } });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5. JOIN AS COLLABORATOR (Public)
// ═══════════════════════════════════════════════════════════════════════════════

const joinCollaborator = async (req, res) => {
    try {
        const { token } = req.params;
        const result    = await sharedCaseService.joinCollaborator(token, req.body);

        if (result.error) {
            return res.status(result.error).json({ success: false, error: { code: "JOIN_ERROR", message: result.message } });
        }

        return res.status(201).json({
            success: true,
            data: { collaborators: result.collaborators },
        });
    } catch (err) {
        logger.error({ err: err.message }, "[SharedCase] joinCollaborator failed");
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "JOIN_ERROR", message: err.message } });
    }
};

module.exports = {
    createShareLink,
    getSharedCase,
    addComment,
    getComments,
    joinCollaborator,
};
