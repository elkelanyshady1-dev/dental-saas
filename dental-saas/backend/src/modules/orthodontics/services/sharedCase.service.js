/**
 * sharedCase.service.js
 * Phase 4 — Fat Controller Extraction (sharedCase.controller.js → service layer)
 *
 * PLANE:  Org only
 * CQRS:   orthodontics domain — service layer
 *
 * All DB operations extracted from sharedCase.controller.js live here.
 * Controller becomes thin orchestration: validate → call service → respond.
 *
 * @module orthodontics/services/sharedCase
 */

"use strict";

const crypto = require("crypto");
const SharedCaseDef = require("../models/SharedCase.model");
const SharedCaseCommentDef = require("../models/SharedCaseComment.model");
const OrthodonticCaseDef = require("../models/orthodonticCase.model");
const WorkflowSnapshotDef = require("../models/WorkflowSnapshot.model");
const getModel = require("../../../core/db/getModel");
const dbManager = require("../../../core/db/dbManager");
const logger = require("@utils/logger");

// ─── Internal Helpers ─────────────────────────────────────────────────────────

const parseDays = expiresIn => {
  if (typeof expiresIn === "number") return Math.min(Math.max(expiresIn, 1), 30);
  const map = {
    "1d": 1,
    "3d": 3,
    "7d": 7,
    "14d": 14,
    "30d": 30
  };
  return map[expiresIn] || 3;
};

// ─── Public Service API ───────────────────────────────────────────────────────

/**
 * resolveShareByToken
 * Platform-level lookup: find share by token and determine which org it belongs to.
 * Used by public routes that have no org JWT.
 *
 * @param {string} token
 * @returns {{ shared: object, organizationId: string } | { error: number, message: string }}
 */
async function resolveShareByToken(token) {
  const platformConn = await dbManager.getConnection("platform");
  const RawSharedCase = getModel(platformConn, SharedCaseDef);

  // @per-org-public-access — token→org resolution (platform-level)
  const rawShared = await RawSharedCase.findOne({
    token,
    isRevoked: false
  }).lean();
  if (!rawShared) return {
    error: 404,
    message: "Share link not found"
  };
  if (new Date() > rawShared.expiresAt) return {
    error: 410,
    message: "This share link has expired"
  };
  return {
    shared: rawShared
  };
}

/**
 * createShareLink
 * Creates a magic share link for a given orthodontic case.
 *
 * @param {object} conn        - Org DB connection
 * @param {string} organizationId
 * @param {string} userId
 * @param {string} caseId
 * @param {object} options     - { expiresIn, type, recordIds, recordSetIds, permissions, hidePatientName }
 * @param {Function} getOrCreateShareSnapshot - from orthodonticCase.service
 * @returns {object}  The created SharedCase document
 */
async function createShareLink(conn, organizationId, userId, caseId, options, getOrCreateShareSnapshot) {
  const {
    expiresIn = "3d",
    type = "case",
    recordIds = [],
    recordSetIds = [],
    permissions = {},
    hidePatientName = false
  } = options;
  const OrthoCase = getModel(conn, OrthodonticCaseDef);
  const SharedCase = getModel(conn, SharedCaseDef);
  const orthoCase = await OrthoCase.findOne({
    _id: caseId
  });
  if (!orthoCase) return {
    error: 404,
    message: "Case not found"
  };
  if (type === "records") {
    const hasRecordSetIds = Array.isArray(recordSetIds) && recordSetIds.length > 0;
    const hasRecordIds = Array.isArray(recordIds) && recordIds.length > 0;
    if (!hasRecordSetIds && !hasRecordIds) {
      return {
        error: 400,
        message: "recordSetIds or recordIds must be provided when type is 'records'"
      };
    }
  }
  const days = parseDays(expiresIn);
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const token = crypto.randomUUID();
  let snapshotId = null;
  if (typeof getOrCreateShareSnapshot === "function") {
    try {
      snapshotId = await getOrCreateShareSnapshot({
        caseId,
        userId
      });
    } catch (snapErr) {
      logger.warn(`[sharedCase.service] Could not bind snapshot: ${snapErr.message}`);
    }
  }
  const shared = await SharedCase.create({
    caseId,
    token,
    type,
    recordIds: type === "records" ? recordIds : [],
    recordSetIds: type === "records" ? recordSetIds : [],
    snapshotId: snapshotId || null,
    expiresAt,
    permissions: {
      canComment: permissions.canComment !== false,
      canDownload: permissions.canDownload === true,
      canViewAnalysis: permissions.canViewAnalysis !== false
    },
    hidePatientName,
    allowComments: permissions.canComment !== false,
    createdBy: userId
  });
  logger.info({
    caseId,
    token,
    type,
    expiresAt,
    organizationId
  }, "[sharedCase.service] Magic link generated");
  return {
    shared,
    token
  };
}

/**
 * getSharedCase
 * Loads a shared case by token; resolves snapshot or live workflow data.
 *
 * @param {string} token
 * @returns {{ data: object } | { error: number, message: string }}
 */
async function getSharedCase(token) {
  const result = await resolveShareByToken(token);
  if (result.error) return result;
  const {
    shared
  } = result;
  const conn = await dbManager.getConnection(organizationId);
  const OrthoCase = getModel(conn, OrthodonticCaseDef);
  const Snapshot = getModel(conn, WorkflowSnapshotDef);
  const orthoCase = await OrthoCase.findById(shared.caseId).select("treatmentCaseId malocclusionClass status workflowData").populate({
    path: "treatmentCaseId",
    select: "patientId procedureType",
    populate: {
      path: "patientId",
      select: "firstName lastName dateOfBirth gender"
    }
  });
  if (!orthoCase) return {
    error: 404,
    message: "Case no longer exists"
  };
  const patient = orthoCase.treatmentCaseId?.patientId;
  const patientInfo = shared.hidePatientName ? {
    name: "Anonymous Patient",
    age: null
  } : {
    name: `${patient?.firstName || ""} ${patient?.lastName || ""}`.trim() || "Unknown",
    age: patient?.dateOfBirth ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / 31557600000) : null
  };
  let workflowData;
  let snapshotVersion = null;
  if (shared.snapshotId) {
    const snapshot = await Snapshot.findById(shared.snapshotId).lean();
    if (snapshot) {
      workflowData = {
        recordSets: snapshot.recordSets || [],
        problemList: snapshot.problemList || [],
        treatmentGoals: snapshot.treatmentGoals || [],
        treatmentOptions: snapshot.treatmentOptions || [],
        selectedOptionId: snapshot.selectedOptionId,
        finalPlan: snapshot.finalPlan,
        currentStep: snapshot.currentStep
      };
      snapshotVersion = snapshot.version;
    } else {
      workflowData = orthoCase.workflowData || {};
    }
  } else {
    workflowData = orthoCase.workflowData || {};
  }

  // Apply record filters
  if (shared.type === "records") {
    if (shared.recordSetIds?.length > 0) {
      workflowData = {
        ...workflowData,
        recordSets: (workflowData.recordSets || []).filter(s => shared.recordSetIds.includes(s.id))
      };
    } else if (shared.recordIds?.length > 0) {
      const filteredSets = (workflowData.recordSets || []).map(set => ({
        ...(set.toObject ? set.toObject() : set),
        records: (set.records || []).filter(p => shared.recordIds.includes(p.id)),
        photos: (set.photos || []).filter(p => shared.recordIds.includes(p.id))
      }));
      workflowData = {
        ...workflowData,
        recordSets: filteredSets
      };
    }
  }

  // Strip analysis if not permitted
  if (!shared.permissions.canViewAnalysis) {
    const stripped = (workflowData.recordSets || []).map(set => ({
      ...set,
      photos: (set.photos || []).map(p => ({
        ...p,
        analysis: undefined
      }))
    }));
    workflowData = {
      ...workflowData,
      recordSets: stripped
    };
  }
  return {
    data: {
      patient: patientInfo,
      caseType: orthoCase.treatmentCaseId?.procedureType || "orthodontic",
      malocclusionClass: orthoCase.malocclusionClass,
      status: orthoCase.status,
      type: shared.type,
      snapshotId: shared.snapshotId || null,
      snapshotVersion,
      recordIds: shared.recordIds,
      recordSetIds: shared.recordSetIds,
      workflowData,
      permissions: shared.permissions,
      hidePatientName: shared.hidePatientName,
      expiresAt: shared.expiresAt,
      collaborators: shared.collaborators
    }
  };
}

/**
 * addComment
 * Adds a collaborator comment to a shared case.
 *
 * @param {string} token
 * @param {object} body  — { authorName, role, text, audioUrl }
 * @returns {{ comment: object } | { error: number, message: string }}
 */
async function addComment(token, {
  authorName,
  role = "doctor",
  text,
  audioUrl
}) {
  if (!authorName || !text && !audioUrl) {
    return {
      error: 400,
      message: "authorName and either text or audioUrl are required"
    };
  }
  const result = await resolveShareByToken(token);
  if (result.error) return result;
  const {
    shared
  } = result;
  if (!shared.permissions.canComment) {
    return {
      error: 403,
      message: "Comments are not allowed on this share"
    };
  }
  const conn = await dbManager.getConnection(organizationId);
  const Comment = getModel(conn, SharedCaseCommentDef);
  const validRoles = ["doctor", "lab", "patient"];
  const sanitizedRole = validRoles.includes(role) ? role : "doctor";
  const comment = await Comment.create({
    shareId: shared._id,
    authorName: authorName.substring(0, 100),
    role: sanitizedRole,
    text: text ? text.substring(0, 2000) : undefined,
    audioUrl: audioUrl || null
  });
  logger.info({
    shareId: shared._id,
    commentId: comment._id,
    role: sanitizedRole
  }, "[sharedCase.service] Comment added");
  return {
    comment,
    shared
  };
}

/**
 * getComments
 * Returns all comments for a shared case token.
 *
 * @param {string} token
 * @returns {{ comments: object[] } | { error: number, message: string }}
 */
async function getComments(token) {
  const result = await resolveShareByToken(token);
  if (result.error) return result;
  const {
    shared
  } = result;
  const conn = await dbManager.getConnection(organizationId);
  const Comment = getModel(conn, SharedCaseCommentDef);
  const comments = await Comment.find({
    shareId: shared._id
  }).sort({
    createdAt: -1
  }).limit(100).lean();
  return {
    comments
  };
}

/**
 * joinCollaborator
 * Adds a new collaborator to a shared case (deduped by name).
 *
 * @param {string} token
 * @param {object} body  — { name, email, role }
 * @returns {{ collaborators: object[] } | { error: number, message: string }}
 */
async function joinCollaborator(token, {
  name,
  email = "",
  role = "doctor"
}) {
  if (!name) return {
    error: 400,
    message: "name is required"
  };
  const result = await resolveShareByToken(token);
  if (result.error) return result;
  const {
    shared
  } = result;
  const validRoles = ["doctor", "lab", "patient"];
  const sanitizedRole = validRoles.includes(role) ? role : "doctor";
  const sanitizedEmail = (email || "").substring(0, 200).trim().toLowerCase();

  // Dedup by name
  const existing = shared.collaborators.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return {
    collaborators: shared.collaborators
  };
  const conn = await dbManager.getConnection(organizationId);
  const SharedCase = getModel(conn, SharedCaseDef);
  await SharedCase.findOneAndUpdate({
    _id: shared._id
  }, {
    $push: {
      collaborators: {
        name: name.substring(0, 100),
        email: sanitizedEmail,
        role: sanitizedRole
      }
    }
  }, {
    new: true
  });
  logger.info({
    shareId: shared._id,
    name,
    role: sanitizedRole
  }, "[sharedCase.service] Collaborator joined");
  const updated = await SharedCase.findById(shared._id).lean();
  return {
    collaborators: updated?.collaborators || []
  };
}
module.exports = {
  resolveShareByToken,
  createShareLink,
  getSharedCase,
  addComment,
  getComments,
  joinCollaborator
};