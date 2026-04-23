"use strict";

/**
 * treatmentPlanVersion.service.js — Orthodontic Treatment Plan Versioning
 *
 * State-machine-backed plan authoring and revision:
 *   PRE  → create / edit / delete DRAFT → approve one → locked APPROVED
 *   MID  → createRevision from approved baseline → chained REVISION
 *   POST → read-only (no service mutations)
 *
 * INVARIANTS
 *   - recordSet.type drives what is allowed (via planningGuard).
 *   - Exactly one isApproved per case (enforced by partial unique index).
 *   - Exactly one isActive   per case (enforced by partial unique index).
 *   - Approve + createRevision run inside mongoose transactions so the
 *     active-flip + case-pointer-update + audit insert are atomic.
 *
 * OPTIMISTIC LOCK
 *   editDraft requires `expectedVersionLock`. Uses findOneAndUpdate with the
 *   versionLock in the predicate — a no-match returns 409 VERSION_LOCK_CONFLICT.
 *
 * @per-org-compliant — all DB access goes through getModel(req.dbConnection, Def)
 */
const mongoose = require("mongoose");
const TreatmentPlanVersionDef = require("../models/TreatmentPlanVersion.model");
const WorkflowRecordSetDef = require("../models/WorkflowRecordSet.model");
const OrthodonticCaseDef = require("../models/orthodonticCase.model");
const getModel = require("../../../core/db/getModel");
const enforceDbIsolation = require("../../../core/db/dbIsolation.guard");
const logger = require("@utils/logger");
const {
  assertRecordSetSupportsAction
} = require("../utils/planningGuard");

// ─── Per-Request Model Resolution ─────────────────────────────────────────────

function _getModels(req) {
  enforceDbIsolation(req);
  const conn = req.dbConnection;
  return {
    TreatmentPlanVersion: getModel(conn, TreatmentPlanVersionDef),
    WorkflowRecordSet: getModel(conn, WorkflowRecordSetDef),
    OrthodonticCase: getModel(conn, OrthodonticCaseDef)
  };
}

// ─── Errors ───────────────────────────────────────────────────────────────────

function _err(code, message, statusCode) {
  const e = new Error(message);
  e.code = code;
  e.statusCode = statusCode;
  return e;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _loadRecordSet(models, caseId, recordSetId) {
  if (!mongoose.isValidObjectId(recordSetId)) {
    throw _err("VALIDATION_ERROR", "recordSetId must be a valid ObjectId", 400);
  }
  const recordSet = await models.WorkflowRecordSet.findOne({
    _id: recordSetId,
    caseId
  }).lean();
  if (!recordSet) {
    throw _err("RECORD_SET_NOT_FOUND", `Record set ${recordSetId} not found on case ${caseId}`, 404);
  }
  return recordSet;
}
async function _loadCase(models, caseId) {
  if (!mongoose.isValidObjectId(caseId)) {
    throw _err("VALIDATION_ERROR", "caseId must be a valid ObjectId", 400);
  }
  const doc = await models.OrthodonticCase.findOne({
    _id: caseId
  }).lean();
  if (!doc) throw _err("CASE_NOT_FOUND", `Case ${caseId} not found`, 404);
  return doc;
}

/**
 * Atomic monotonic version allocator. Mirrors the `visitCounter` pattern at
 * orthodonticCase.model.js:220 — $inc in one operation, returns post-increment
 * value which becomes this version's `version` number.
 */
async function _allocateNextVersion(models, caseId, session) {
  const res = await models.OrthodonticCase.findOneAndUpdate({
    _id: caseId
  }, {
    $inc: {
      __planVersionCounter: 1
    }
  }, {
    new: true,
    session,
    projection: {
      __planVersionCounter: 1
    }
  });
  if (!res) throw _err("CASE_NOT_FOUND", `Case ${caseId} not found during version allocation`, 404);
  return res.__planVersionCounter;
}
function _emptyAssets() {
  return {
    photos: [],
    documents: [],
    stlFiles: [],
    dicomFiles: []
  };
}
function _normalizeAssets(input) {
  if (!input || typeof input !== "object") return _emptyAssets();
  return {
    photos: Array.isArray(input.photos) ? input.photos : [],
    documents: Array.isArray(input.documents) ? input.documents : [],
    stlFiles: Array.isArray(input.stlFiles) ? input.stlFiles : [],
    dicomFiles: Array.isArray(input.dicomFiles) ? input.dicomFiles : []
  };
}

/**
 * Deep-freeze an object so downstream code (e.g., hooks, loggers) cannot mutate
 * the persisted payload in-place. Hardening §1.5 / §4.
 *
 * - Uses structuredClone (Node 17+) for a faithful deep clone that preserves
 *   Dates, Maps, Sets, etc. Falls back to JSON clone for older runtimes.
 * - Rejects payloads containing functions, symbols, or circular references
 *   (§4.2) — these have no meaningful persisted form and usually indicate a
 *   bug in the caller. Surface loudly rather than silently dropping fields.
 */
function _freezeForPersist(obj) {
  if (obj == null || typeof obj !== "object") return obj;

  // §4.2 — reject non-serializable input before we persist.
  try {
    JSON.stringify(obj);
  } catch (err) {
    throw _err("PAYLOAD_NOT_SERIALIZABLE", `Plan payload is not serializable: ${err.message}. Remove functions/symbols/circular refs.`, 400);
  }
  let cloned;
  if (typeof structuredClone === "function") {
    try {
      cloned = structuredClone(obj);
    } catch (err) {
      throw _err("PAYLOAD_NOT_SERIALIZABLE", `structuredClone failed: ${err.message}`, 400);
    }
  } else {
    cloned = JSON.parse(JSON.stringify(obj));
  }
  const freeze = o => {
    if (o && typeof o === "object") {
      Object.freeze(o);
      for (const k of Object.keys(o)) freeze(o[k]);
    }
  };
  freeze(cloned);
  return cloned;
}

/**
 * Append-only structured audit log for plan lifecycle events.
 * Complements the embedded `audit[]` array on the version document and the
 * clinicalEventService.logEventSync call — this one is cheap, synchronous, and
 * lands in the same log stream that ops monitors for anomalies.
 *
 * Hardening §3.1 — MUST be called AFTER session.withTransaction resolves.
 *             §3.2 — carries req.id as requestId for trace correlation.
 */
function _auditPlanEvent({
  req,
  action,
  caseId,
  version,
  versionId,
  userId,
  extra
}) {
  logger.info("PLAN_EVENT", {
    action,
    caseId: caseId?.toString?.() ?? String(caseId),
    version,
    versionId: versionId?.toString?.() ?? String(versionId ?? ""),
    userId: userId?.toString?.() ?? String(userId ?? ""),
    // organizationId removed (Step 5c Commit 1b): per-org DB already identifies the tenant
    requestId: req?.id ?? req?.requestId ?? null,
    ...(extra || {})
  });
}

// ─── createDraft (PRE only) ───────────────────────────────────────────────────

async function createDraft(req, {
  caseId,
  recordSetId,
  payload,
  assets,
  userId
}) {
  const {
    TreatmentPlanVersion,
    OrthodonticCase
  } = _getModels(req);
  const models = {
    TreatmentPlanVersion,
    WorkflowRecordSet: _getModels(req).WorkflowRecordSet,
    OrthodonticCase
  };
  const caseDoc = await _loadCase(models, caseId);
  const recordSet = await _loadRecordSet(models, caseId, recordSetId);
  assertRecordSetSupportsAction(recordSet.type, "CREATE_DRAFT");
  if (caseDoc.approvedPlanVersionId) {
    throw _err("PRE_LOCKED_AFTER_APPROVAL", "This case already has an approved plan. PRE drafts are locked. Use /plan-versions/revision from a MID record set.", 409);
  }
  const frozenPayload = _freezeForPersist(payload);
  const frozenAssets = _freezeForPersist(_normalizeAssets(assets));
  const session = await req.dbConnection.startSession();
  try {
    let created;
    await session.withTransaction(async () => {
      const version = await _allocateNextVersion(models, caseId, session);
      const docs = await TreatmentPlanVersion.create([{
        caseId,
        recordSetId,
        recordSetType: "PRE",
        version,
        parentVersionId: null,
        stage: "DRAFT",
        isActive: false,
        isApproved: false,
        payload: frozenPayload,
        assets: frozenAssets,
        createdFrom: "PRE",
        createdBy: userId,
        changeSummary: "",
        audit: [{
          action: "CREATED_DRAFT",
          userId,
          timestamp: new Date()
        }],
        versionLock: 0
      }], {
        session
      });
      created = docs[0];
    });
    _auditPlanEvent({
      req,
      action: "CREATED_DRAFT",
      caseId,
      version: created.version,
      versionId: created._id,
      userId
    });
    return created.toObject();
  } finally {
    await session.endSession();
  }
}

// ─── editDraft (PRE only, optimistic-locked) ──────────────────────────────────

async function editDraft(req, {
  versionId,
  payload,
  assets,
  expectedVersionLock,
  userId
}) {
  const models = _getModels(req);
  if (!mongoose.isValidObjectId(versionId)) {
    throw _err("VALIDATION_ERROR", "versionId must be a valid ObjectId", 400);
  }
  if (typeof expectedVersionLock !== "number" || expectedVersionLock < 0) {
    throw _err("VALIDATION_ERROR", "expectedVersionLock must be a non-negative integer", 400);
  }
  const existing = await models.TreatmentPlanVersion.findOne({
    _id: versionId
  }).lean();
  if (!existing) throw _err("VERSION_NOT_FOUND", `Plan version ${versionId} not found`, 404);
  if (existing.stage !== "DRAFT") {
    throw _err("DRAFT_ONLY", `Plan version is in stage ${existing.stage}; only DRAFT versions can be edited.`, 409);
  }

  // Safety: if the case has been approved since this draft was loaded, reject.
  const caseDoc = await _loadCase(models, existing.caseId);
  if (caseDoc.approvedPlanVersionId) {
    throw _err("PRE_LOCKED_AFTER_APPROVAL", "This case is already approved; drafts cannot be edited. Use a MID revision.", 409);
  }

  // Record-set type re-check (it's PRE by construction, but defend against tampering).
  const recordSet = await _loadRecordSet(models, existing.caseId, existing.recordSetId);
  assertRecordSetSupportsAction(recordSet.type, "EDIT_DRAFT");
  const $set = {
    updatedAt: new Date()
  };
  if (payload !== undefined) $set.payload = payload;
  if (assets !== undefined) $set.assets = _normalizeAssets(assets);
  const updated = await models.TreatmentPlanVersion.findOneAndUpdate({
    _id: versionId,
    versionLock: expectedVersionLock,
    stage: "DRAFT"
  }, {
    $set,
    $inc: {
      versionLock: 1
    },
    $push: {
      audit: {
        action: "EDITED_DRAFT",
        userId,
        timestamp: new Date()
      }
    }
  }, {
    new: true
  });
  if (!updated) {
    throw _err("VERSION_LOCK_CONFLICT", "This draft was modified concurrently. Refresh and retry.", 409);
  }
  return updated.toObject();
}

// ─── deleteDraft (PRE only) ───────────────────────────────────────────────────

async function deleteDraft(req, {
  versionId,
  userId
}) {
  const models = _getModels(req);
  if (!mongoose.isValidObjectId(versionId)) {
    throw _err("VALIDATION_ERROR", "versionId must be a valid ObjectId", 400);
  }
  const existing = await models.TreatmentPlanVersion.findOne({
    _id: versionId
  }).lean();
  if (!existing) throw _err("VERSION_NOT_FOUND", `Plan version ${versionId} not found`, 404);
  if (existing.stage !== "DRAFT") {
    throw _err("DRAFT_ONLY", `Only DRAFT versions can be deleted. Stage: ${existing.stage}`, 409);
  }
  const caseDoc = await _loadCase(models, existing.caseId);
  if (caseDoc.approvedPlanVersionId) {
    throw _err("PRE_LOCKED_AFTER_APPROVAL", "Case already approved — drafts are frozen.", 409);
  }
  const session = await req.dbConnection.startSession();
  try {
    await session.withTransaction(async () => {
      await models.TreatmentPlanVersion.deleteOne({
        _id: versionId,
        stage: "DRAFT"
      }, {
        session
      });
    });
  } finally {
    await session.endSession();
  }
  return {
    deleted: true,
    versionId,
    version: existing.version
  };
}

// ─── approvePlan (PRE only, transactional) ────────────────────────────────────

async function approvePlan(req, {
  versionId,
  userId
}) {
  const models = _getModels(req);
  if (!mongoose.isValidObjectId(versionId)) {
    throw _err("VALIDATION_ERROR", "versionId must be a valid ObjectId", 400);
  }
  const existing = await models.TreatmentPlanVersion.findOne({
    _id: versionId
  }).lean();
  if (!existing) throw _err("VERSION_NOT_FOUND", `Plan version ${versionId} not found`, 404);
  if (existing.stage !== "DRAFT") {
    throw _err("DRAFT_ONLY", `Only DRAFT versions can be approved. Stage: ${existing.stage}`, 409);
  }
  const caseDoc = await _loadCase(models, existing.caseId);
  if (caseDoc.approvedPlanVersionId) {
    throw _err("ALREADY_APPROVED", `Case ${existing.caseId} already has approved plan ${caseDoc.approvedPlanVersionId}.`, 409);
  }
  const recordSet = await _loadRecordSet(models, existing.caseId, existing.recordSetId);
  assertRecordSetSupportsAction(recordSet.type, "APPROVE");
  const session = await req.dbConnection.startSession();
  try {
    let approved;
    let idempotentReplay = null;
    await session.withTransaction(async () => {
      // Hardening §1.1 — DETERMINISTIC approve race guard.
      // Read inside the session: if ANY approved version exists for this
      // case, decide before mutating — idempotent replay if same versionId,
      // explicit 409 otherwise. Do not rely on the partial unique index
      // for control flow (index errors are reported as write conflicts
      // and are harder to classify cleanly).
      const existingApproved = await models.TreatmentPlanVersion.findOne({
        caseId: existing.caseId,
        isApproved: true
      }, null, {
        session
      });
      if (existingApproved) {
        if (existingApproved._id.equals(versionId)) {
          // Idempotent success — same request retried, same outcome.
          idempotentReplay = existingApproved;
          return;
        }
        throw _err("ALREADY_APPROVED", `Case already has an approved plan (v${existingApproved.version}). Cannot approve v${existing.version}.`, 409);
      }
      approved = await models.TreatmentPlanVersion.findOneAndUpdate({
        _id: versionId,
        stage: "DRAFT"
      }, {
        $set: {
          stage: "APPROVED",
          isApproved: true,
          isActive: true
        },
        $inc: {
          versionLock: 1
        },
        $push: {
          audit: {
            action: "APPROVED",
            userId,
            timestamp: new Date()
          }
        }
      }, {
        new: true,
        session
      });
      if (!approved) {
        throw _err("APPROVE_FAILED", "Plan version could not be approved (concurrent change?).", 409);
      }

      // Single-approved invariant: setting case.approvedPlanVersionId here
      // is also protected by the partial unique index on
      // { caseId: 1, isApproved: 1 } where isApproved=true — a belt-and-
      // suspenders backstop behind the in-session check above.
      await models.OrthodonticCase.updateOne({
        _id: existing.caseId
      }, {
        $set: {
          approvedPlanVersionId: approved._id,
          activePlanVersionId: approved._id
        }
      }, {
        session
      });
    });

    // §1.1 — idempotent replay returns the existing doc without emitting a
    // duplicate PLAN_EVENT (that fired the first time this was approved).
    if (idempotentReplay) {
      logger.info(`[TreatmentPlanVersion] approve idempotent replay: v${idempotentReplay.version}`);
      return idempotentReplay;
    }
    _auditPlanEvent({
      req,
      action: "APPROVED",
      caseId: existing.caseId,
      version: approved.version,
      versionId: approved._id,
      userId
    });
    logger.info(`[TreatmentPlanVersion] Approved v${approved.version} for case ${existing.caseId}`);
    return approved.toObject();
  } finally {
    await session.endSession();
  }
}

// ─── createRevision (MID only, transactional) ─────────────────────────────────

async function createRevision(req, {
  caseId,
  recordSetId,
  payload,
  changeSummary,
  assets,
  userId
}) {
  const models = _getModels(req);
  if (!changeSummary || typeof changeSummary !== "string" || changeSummary.trim() === "") {
    throw _err("VALIDATION_ERROR", "changeSummary is required and cannot be empty for revisions", 400);
  }
  const caseDoc = await _loadCase(models, caseId);
  const recordSet = await _loadRecordSet(models, caseId, recordSetId);
  assertRecordSetSupportsAction(recordSet.type, "CREATE_REVISION");
  if (!caseDoc.approvedPlanVersionId) {
    throw _err("NO_APPROVED_PLAN", "Cannot create a revision — this case has no approved plan yet. Approve a PRE draft first.", 409);
  }
  const activeId = caseDoc.activePlanVersionId || caseDoc.approvedPlanVersionId;
  const parent = await models.TreatmentPlanVersion.findOne({
    _id: activeId
  }).lean();
  if (!parent) {
    throw _err("ACTIVE_VERSION_MISSING", `Active plan version ${activeId} not found`, 500);
  }

  // Asset inheritance: explicit override wins, else deep-clone parent assets.
  const nextAssets = assets !== undefined ? _normalizeAssets(assets) : JSON.parse(JSON.stringify(parent.assets || _emptyAssets()));
  const frozenPayload = _freezeForPersist(payload);
  const frozenAssets = _freezeForPersist(nextAssets);
  const session = await req.dbConnection.startSession();
  try {
    let created;
    await session.withTransaction(async () => {
      const version = await _allocateNextVersion(models, caseId, session);

      // Hardening §1.2 — belt-and-suspenders revision flip.
      // Demote ALL currently-active versions for this case, not just the
      // known parent. If a concurrent revision already inserted a
      // competing active between our read and now, this updateMany will
      // catch it — the subsequent insert is still protected by the
      // partial unique index on { caseId, isActive: true }.
      await models.TreatmentPlanVersion.updateMany({
        caseId,
        isActive: true
      }, {
        $set: {
          isActive: false
        },
        $inc: {
          versionLock: 1
        }
      }, {
        session
      });
      const docs = await models.TreatmentPlanVersion.create([{
        caseId,
        recordSetId,
        recordSetType: "MID",
        version,
        parentVersionId: parent._id,
        stage: "REVISION",
        isActive: true,
        isApproved: false,
        payload: frozenPayload,
        assets: frozenAssets,
        changeSummary,
        createdFrom: "MID",
        createdBy: userId,
        audit: [{
          action: "REVISED",
          userId,
          timestamp: new Date()
        }],
        versionLock: 0
      }], {
        session
      });
      created = docs[0];
      await models.OrthodonticCase.updateOne({
        _id: caseId
      }, {
        $set: {
          activePlanVersionId: created._id
        }
      }, {
        session
      });
    });
    _auditPlanEvent({
      req,
      action: "REVISION_CREATED",
      caseId,
      version: created.version,
      versionId: created._id,
      userId,
      extra: {
        parentVersionId: parent._id?.toString?.() ?? String(parent._id)
      }
    });
    logger.info(`[TreatmentPlanVersion] Revision v${created.version} created on case ${caseId} (parent=${parent._id})`);
    return created.toObject();
  } finally {
    await session.endSession();
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

async function listVersions(req, {
  caseId
}) {
  const models = _getModels(req);
  if (!mongoose.isValidObjectId(caseId)) {
    throw _err("VALIDATION_ERROR", "caseId must be a valid ObjectId", 400);
  }
  return models.TreatmentPlanVersion.find({
    caseId
  }).sort({
    version: 1
  }).lean();
}
async function getActiveVersion(req, {
  caseId
}) {
  const models = _getModels(req);
  if (!mongoose.isValidObjectId(caseId)) {
    throw _err("VALIDATION_ERROR", "caseId must be a valid ObjectId", 400);
  }
  return models.TreatmentPlanVersion.findOne({
    caseId,
    isActive: true
  }).lean();
}
async function getApprovedVersion(req, {
  caseId
}) {
  const models = _getModels(req);
  if (!mongoose.isValidObjectId(caseId)) {
    throw _err("VALIDATION_ERROR", "caseId must be a valid ObjectId", 400);
  }
  return models.TreatmentPlanVersion.findOne({
    caseId,
    isApproved: true
  }).lean();
}
async function getVersion(req, {
  versionId
}) {
  const models = _getModels(req);
  if (!mongoose.isValidObjectId(versionId)) {
    throw _err("VALIDATION_ERROR", "versionId must be a valid ObjectId", 400);
  }
  return models.TreatmentPlanVersion.findOne({
    _id: versionId
  }).lean();
}

// ─── compareVersions (read-only diff for CompareModal) ────────────────────────

function _diffObjects(before, after, pathPrefix = "") {
  const changed = [];
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const k of keys) {
    const a = before ? before[k] : undefined;
    const b = after ? after[k] : undefined;
    const path = pathPrefix ? `${pathPrefix}.${k}` : k;
    if (a === b) continue;
    const aIsObj = a && typeof a === "object" && !Array.isArray(a);
    const bIsObj = b && typeof b === "object" && !Array.isArray(b);
    if (aIsObj && bIsObj) {
      changed.push(..._diffObjects(a, b, path));
    } else if (JSON.stringify(a) !== JSON.stringify(b)) {
      changed.push({
        path,
        before: a ?? null,
        after: b ?? null
      });
    }
  }
  return changed;
}
function _diffAssets(before, after) {
  const categories = ["photos", "documents", "stlFiles", "dicomFiles"];
  const added = {};
  const removed = {};
  for (const cat of categories) {
    const bSet = new Set((before?.[cat] || []).map(String));
    const aSet = new Set((after?.[cat] || []).map(String));
    added[cat] = [...aSet].filter(id => !bSet.has(id));
    removed[cat] = [...bSet].filter(id => !aSet.has(id));
  }
  return {
    added,
    removed
  };
}
async function compareVersions(req, {
  caseId,
  fromVersionId,
  toVersionId
}) {
  const models = _getModels(req);
  if (!mongoose.isValidObjectId(fromVersionId) || !mongoose.isValidObjectId(toVersionId)) {
    throw _err("VALIDATION_ERROR", "fromVersionId and toVersionId must be valid ObjectIds", 400);
  }
  const [from, to] = await Promise.all([models.TreatmentPlanVersion.findOne({
    _id: fromVersionId,
    caseId
  }).lean(), models.TreatmentPlanVersion.findOne({
    _id: toVersionId,
    caseId
  }).lean()]);
  if (!from) throw _err("VERSION_NOT_FOUND", `from version ${fromVersionId} not found`, 404);
  if (!to) throw _err("VERSION_NOT_FOUND", `to version ${toVersionId} not found`, 404);
  const changedFields = _diffObjects(from.payload || {}, to.payload || {});
  const assetsDiff = _diffAssets(from.assets || {}, to.assets || {});
  return {
    from: {
      _id: from._id,
      version: from.version,
      stage: from.stage
    },
    to: {
      _id: to._id,
      version: to.version,
      stage: to.stage
    },
    changedFields,
    assets: assetsDiff
  };
}

// ─── Startup: verify partial unique indexes exist (hardening §1.4) ───────────

/**
 * ensureTreatmentPlanIndexes — call at app boot for each org DB connection.
 *
 * Creates/syncs the indexes defined on the TreatmentPlanVersion schema and
 * logs a warning if either of the two single-invariant partial unique indexes
 * is missing. The partial unique indexes on {caseId, isApproved=true} and
 * {caseId, isActive=true} are the last line of defense behind our transactions;
 * if they are silently absent (e.g. after a schema-less migration), concurrent
 * approvals could admit two approved plans before any application-layer check.
 */
async function ensureTreatmentPlanIndexes(connection) {
  const TreatmentPlanVersion = getModel(connection, TreatmentPlanVersionDef);
  try {
    await TreatmentPlanVersion.syncIndexes();
  } catch (err) {
    logger.error(`[TreatmentPlanVersion] syncIndexes failed: ${err.message}`);
    if (process.env.NODE_ENV === "production") {
      throw new Error(`CRITICAL: TreatmentPlanVersion syncIndexes failed in production — ${err.message}`);
    }
    return {
      ok: false,
      error: err.message
    };
  }
  const indexes = await TreatmentPlanVersion.collection.indexes();
  const missing = [];
  const hasPartial = field => indexes.some(ix => ix.key && ix.key.caseId === 1 && ix.key[field] === 1 && ix.unique && ix.partialFilterExpression?.[field] === true);
  if (!hasPartial("isApproved")) missing.push("caseId+isApproved partial-unique");
  if (!hasPartial("isActive")) missing.push("caseId+isActive partial-unique");
  if (missing.length) {
    logger.error(`[TreatmentPlanVersion] MISSING INDEXES: ${missing.join(", ")}. ` + `Single-approved / single-active invariants are at risk.`);
    if (process.env.NODE_ENV === "production") {
      // Hardening §2.2 — production must refuse to serve without these indexes.
      throw new Error(`CRITICAL: TreatmentPlan indexes missing in production: ${missing.join(", ")}`);
    }
    return {
      ok: false,
      missing
    };
  }
  logger.info("[TreatmentPlanVersion] indexes verified");
  return {
    ok: true,
    missing: []
  };
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = {
  createDraft,
  editDraft,
  deleteDraft,
  approvePlan,
  createRevision,
  listVersions,
  getActiveVersion,
  getApprovedVersion,
  getVersion,
  compareVersions,
  ensureTreatmentPlanIndexes,
  // Exposed for tests only
  _freezeForPersist
};