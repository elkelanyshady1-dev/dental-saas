/**
 * orthodonticCase.service.js
 * Phase 4 — Orthodontic Intelligence: Case Management Service
 * Phase F.2 — RLS Migration (secureModel)
 *
 * Handles orthodontic case CRUD, scan uploads, and AI analysis orchestration.
 * All queries are RLS-enforced via getModel + guards.
 *
 * @per-org-compliant — All CRUD operations use Model
 * Session-internal snapshot writes are @per-org-transactional (same transaction scope)
 */

"use strict";

// ✅ Phase 4 — Models now canonical in orthodontics/models/
const OrthodonticCaseDef   = require("../models/orthodonticCase.model");
const WorkflowSnapshotDef  = require("../models/WorkflowSnapshot.model");
const ScanFileDef = require("../models/ScanFile.model");
const ToothSegmentationDef = require("../models/ToothSegmentation.model");
const CephAnalysisDef = require("../models/CephAnalysis.model");
const AlignerPlanDef = require("../models/AlignerPlan.model");
const BondingDef         = require("../models/Bonding.model");
const TadDef              = require("../models/Tad.model");
const ClinicalEventDef     = require("../models/ClinicalEvent.model");
const getModel = require("../../../core/db/getModel");
const eventBus = require("../../../core/eventBus");
const logger = require("@utils/logger");

// Per-request model resolution — binds to org DB
function _getModels(req) {
    const conn = req.dbConnection;
    return {
        OrthoCase: getModel(conn, OrthodonticCaseDef),
        ScanFile: getModel(conn, ScanFileDef),
        Segmentation: getModel(conn, ToothSegmentationDef),
        CephAnalysis: getModel(conn, CephAnalysisDef),
        AlignerPlan: getModel(conn, AlignerPlanDef),
        Snapshot: getModel(conn, WorkflowSnapshotDef),
    };
}

// Case FSM
const CASE_TRANSITIONS = {
    draft: ["diagnosis"],
    diagnosis: ["treatment_planning", "draft"],
    treatment_planning: ["active", "diagnosis"],
    active: ["completed"],
    completed: []
};

function validateCaseTransition(current, next) {
    const allowed = CASE_TRANSITIONS[current];
    if (!allowed) return { valid: false, message: `Unknown status: ${current}` };
    if (!allowed.includes(next)) return { valid: false, message: `Cannot transition from '${current}' to '${next}'. Allowed: [${allowed.join(", ")}]` };
    return { valid: true };
}

class OrthodonticCaseService {

    // ─── Security Guard ──────────────────────────────────────────────────────

    _ensureContext(req) {
        if (!req?.context?.organizationId) {
            const err = new Error("SECURITY: Missing organization context");
            err.statusCode = 403;
            throw err;
        }
        return req.context.organizationId;
    }

    // ─── Case CRUD ───────────────────────────────────────────────────────────

    async createCase({ req, branchId, data, userId }) {
        const organizationId = this._ensureContext(req);
        const { OrthoCase } = _getModels(req);
        const orthoCase = new OrthoCase({
            patientId: data.patientId,
            name: data.name,
            description: data.description,
            priority: data.priority,
            malocclusionClass: data.malocclusionClass,
            caseType: data.caseType,
            notes: data.notes,
            extractionPlan: data.extractionPlan,
            estimatedDurationMonths: data.estimatedDurationMonths,
            retentionPlanned: data.retentionPlanned,
            branchId: branchId || data.branchId,
            ownerId: req.context?.userId || userId,
            organizationId,
            status: data.status || "draft"
        });
        await orthoCase.save();
        return orthoCase;
    }

    async listCases({ req, filters = {}, page = 1, limit = 20 }) {
        const organizationId = this._ensureContext(req);
        const { OrthoCase } = _getModels(req);
        const query = { organizationId, isDeleted: { $ne: true } };
        if (filters.patientId) query.patientId = filters.patientId;
        if (filters.status) query.status = filters.status;
        if (filters.malocclusionClass) query.malocclusionClass = filters.malocclusionClass;

        const skip = (page - 1) * limit;
        const [cases, total] = await Promise.all([
            OrthoCase.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            OrthoCase.countDocuments(query)
        ]);

        return {
            cases,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        };
    }

    async getCaseById({ req, caseId }) {
        const organizationId = this._ensureContext(req);
        const { OrthoCase } = _getModels(req);
        const orthoCase = await OrthoCase.findOne({
            _id: caseId,
            organizationId,
            isDeleted: { $ne: true }
        }).lean();
        if (!orthoCase) {
            const err = new Error("Orthodontic case not found.");
            err.statusCode = 404;
            throw err;
        }
        return orthoCase;
    }

    async deleteCase({ req, caseId }) {
        const organizationId = this._ensureContext(req);
        const { OrthoCase } = _getModels(req);
        const userId = req.context.userId;

        const updated = await OrthoCase.findOneAndUpdate(
            {
                _id: caseId,
                organizationId,
                isDeleted: { $ne: true }
            },
            {
                $set: {
                    isDeleted: true,
                    deletedAt: new Date(),
                    deletedBy: userId
                }
            },
            { new: true }
        ).lean();

        if (!updated) {
            const err = new Error("Case not found or access denied");
            err.statusCode = 404;
            throw err;
        }

        logger.info(`[OrthoService] Case ${caseId} soft-deleted by user ${userId} in org ${organizationId}`);

        // ── Cascade soft-delete child documents ──────────────────────────────
        try {
            const Bonding = getModel(req.dbConnection, BondingDef);
            const Tad = getModel(req.dbConnection, TadDef);
            const ScanFile = getModel(req.dbConnection, ScanFileDef);
            const AlignerPlan = getModel(req.dbConnection, AlignerPlanDef);

            await Promise.all([
                Bonding.updateMany({ organizationId, caseId, status: { $ne: "DEBONDED" } }, { $set: { status: "DEBONDED" } }).lean(),
                Tad.updateMany({ organizationId, caseId, status: { $ne: "REMOVED" } }, { $set: { status: "REMOVED", hasActiveAlert: false } }).lean(),
                ScanFile.updateMany({ organizationId, caseId, isActive: true }, { $set: { isActive: false } }).lean(),
                AlignerPlan.updateMany({ organizationId, caseId, isActive: true }, { $set: { isActive: false } }).lean(),
            ]);
            logger.info(`[OrthoService] Cascaded soft-delete for children of case ${caseId}`);
        } catch (cascadeErr) {
            logger.error(`[OrthoService] Cascade soft-delete failed for case ${caseId}: ${cascadeErr.message}`);
        }

        return updated;
    }

    async updateCaseStatus({ req, caseId, newStatus }) {
        const organizationId = this._ensureContext(req);
        const { OrthoCase } = _getModels(req);
        const orthoCase = await OrthoCase.findOne({
            _id: caseId,
            organizationId,
            isDeleted: { $ne: true }
        });
        if (!orthoCase) {
            const err = new Error("Case not found.");
            err.statusCode = 404;
            throw err;
        }

        const currentStatus = orthoCase.status || "draft";
        const result = validateCaseTransition(currentStatus, newStatus);
        if (!result.valid) {
            const err = new Error(result.message);
            err.statusCode = 400;
            throw err;
        }

        orthoCase.status = newStatus;
        await orthoCase.save();
        return orthoCase;
    }

    // ─── Scan File Management ────────────────────────────────────────────────

    async registerScan({ req, caseId, patientId, branchId, data, userId }) {
        const organizationId = this._ensureContext(req);
        const { OrthoCase, ScanFile } = _getModels(req);
        const orthoCase = await OrthoCase.findOne({ _id: caseId, organizationId });
        if (!orthoCase) {
            const err = new Error("Case not found.");
            err.statusCode = 404;
            throw err;
        }

        const scanFile = new ScanFile({
            organizationId,
            caseId,
            patientId,
            branchId,
            fileType: data.fileType,
            fileKey: data.fileKey,
            originalFileName: data.originalFileName,
            fileSize: data.fileSize,
            archType: data.archType || "unknown",
            localPath: data.localPath,
            uploadedBy: userId,
            processingStatus: "uploaded"
        });
        await scanFile.save();

        if (data.localPath) {
            orthoCase.scanFilePath = data.localPath;
            await orthoCase.save();
        }

        eventBus.emit("scan.uploaded", {
            organizationId,
            caseId,
            scanFileId: scanFile._id,
            fileType: data.fileType
        });

        return scanFile;
    }

    async listScans({ req, caseId }) {
        const organizationId = this._ensureContext(req);
        const { ScanFile } = _getModels(req);
        return ScanFile.find({ organizationId, caseId, isActive: true })
            .sort({ createdAt: -1 })
            .lean();
    }

    // ─── AI Analysis ─────────────────────────────────────────────────────────

    async triggerSegmentation({ req, caseId, scanFileId, modelVersion }) {
        const organizationId = this._ensureContext(req);
        const { ScanFile, Segmentation } = _getModels(req);
        const scanFile = await ScanFile.findOne({ _id: scanFileId, organizationId, caseId });
        if (!scanFile) {
            const err = new Error("Scan file not found.");
            err.statusCode = 404;
            throw err;
        }

        scanFile.processingStatus = "queued";
        await scanFile.save();

        const segmentation = new Segmentation({
            organizationId,
            caseId,
            scanFileId,
            modelVersion: modelVersion || "latest",
            status: "pending"
        });
        await segmentation.save();

        eventBus.emit("analysis.started", {
            organizationId,
            caseId,
            scanFileId,
            analysisType: "segmentation",
            jobId: null
        });

        logger.info({ caseId, scanFileId }, "[OrthoService] Segmentation record created — pending AI engine integration");

        return { segmentationId: segmentation._id, jobId: null };
    }

    async triggerCephAnalysis({ req, caseId, scanFileId, analysisType, modelVersion }) {
        const organizationId = this._ensureContext(req);
        const { ScanFile, CephAnalysis } = _getModels(req);
        const scanFile = await ScanFile.findOne({ _id: scanFileId, organizationId, caseId });
        if (!scanFile) {
            const err = new Error("Scan file not found.");
            err.statusCode = 404;
            throw err;
        }

        const analysis = new CephAnalysis({
            organizationId,
            caseId,
            scanFileId,
            analysisType: analysisType || "lateral_ceph",
            modelVersion: modelVersion || "latest",
            status: "pending"
        });
        await analysis.save();

        eventBus.emit("analysis.started", {
            organizationId,
            caseId,
            scanFileId,
            analysisType: "cephalometric",
            jobId: null
        });

        return { analysisId: analysis._id, jobId: null };
    }

    async getSegmentationResults({ req, caseId }) {
        const organizationId = this._ensureContext(req);
        const { Segmentation } = _getModels(req);
        return Segmentation.find({ organizationId, caseId })
            .sort({ createdAt: -1 })
            .lean();
    }

    async getCephResults({ req, caseId }) {
        const organizationId = this._ensureContext(req);
        const { CephAnalysis } = _getModels(req);
        return CephAnalysis.find({ organizationId, caseId })
            .sort({ createdAt: -1 })
            .lean();
    }

    // ─── Aligner Plans ───────────────────────────────────────────────────────

    async createAlignerPlan({ req, branchId, data, userId }) {
        const organizationId = this._ensureContext(req);
        const { OrthoCase, AlignerPlan } = _getModels(req);
        const orthoCase = await OrthoCase.findOne({ _id: data.caseId, organizationId });
        if (!orthoCase) {
            const err = new Error("Case not found.");
            err.statusCode = 404;
            throw err;
        }

        const plan = new AlignerPlan({
            organizationId,
            caseId: data.caseId,
            patientId: data.patientId,
            branchId,
            title: data.title,
            stageCount: data.stageCount,
            stages: data.stages,
            overcorrectionStages: data.overcorrectionStages,
            notes: data.notes,
            createdBy: userId
        });
        await plan.save();

        eventBus.emit("aligner.plan_created", {
            organizationId,
            caseId: data.caseId,
            planId: plan._id,
            stageCount: plan.stageCount
        });

        return plan;
    }

    async listAlignerPlans({ req, caseId }) {
        const organizationId = this._ensureContext(req);
        const { AlignerPlan } = _getModels(req);
        return AlignerPlan.find({ organizationId, caseId, isActive: true })
            .sort({ createdAt: -1 })
            .lean();
    }

    async getAlignerPlanById({ req, planId }) {
        const organizationId = this._ensureContext(req);
        const { AlignerPlan } = _getModels(req);
        const plan = await AlignerPlan.findOne({ _id: planId, organizationId })
            .populate("createdBy", "name email")
            .populate("approvedBy", "name email")
            .lean();
        if (!plan) {
            const err = new Error("Aligner plan not found.");
            err.statusCode = 404;
            throw err;
        }
        return plan;
    }

    // ─── Workflow Data Persistence ──────────────────────────────────────────

    async saveWorkflowData({ req, caseId, workflowData, userId, expectedVersion, trigger = 'SAVE', label = null }) {
        const organizationId = this._ensureContext(req);
        const { OrthoCase, Snapshot } = _getModels(req);
        const orthoCase = await OrthoCase.findOne({ _id: caseId, organizationId });

        if (!orthoCase) {
            const err = new Error("Orthodontic case not found.");
            err.statusCode = 404;
            throw err;
        }

        // ── Optimistic Concurrency Check ─────────────────────────────────
        if (typeof expectedVersion === 'number' && expectedVersion >= 0) {
            const currentVersion = orthoCase.workflowVersion || 0;
            if (expectedVersion !== currentVersion) {
                const err = new Error(
                    `VERSION_CONFLICT: Expected v${expectedVersion} but case is at v${currentVersion}. ` +
                    `Another save occurred. Refresh and retry.`
                );
                err.statusCode = 409;
                err.code = 'VERSION_CONFLICT';
                err.currentVersion = currentVersion;
                throw err;
            }
        }

        // Merge workflow data — only update provided fields
        const update = {};
        if (workflowData.recordSets !== undefined) update["workflowData.recordSets"] = workflowData.recordSets;
        if (workflowData.problemList !== undefined) update["workflowData.problemList"] = workflowData.problemList;
        if (workflowData.treatmentGoals !== undefined) update["workflowData.treatmentGoals"] = workflowData.treatmentGoals;
        if (workflowData.treatmentOptions !== undefined) update["workflowData.treatmentOptions"] = workflowData.treatmentOptions;
        if (workflowData.selectedOptionId !== undefined) update["workflowData.selectedOptionId"] = workflowData.selectedOptionId;
        if (workflowData.finalPlan !== undefined) update["workflowData.finalPlan"] = workflowData.finalPlan;
        if (workflowData.currentStep !== undefined) update["workflowData.currentStep"] = workflowData.currentStep;
        if (workflowData.printLayout !== undefined) update["workflowData.printLayout"] = workflowData.printLayout;
        if (workflowData.derivedProblems !== undefined) update["workflowData.derivedProblems"] = workflowData.derivedProblems;

        // Audit metadata
        update["workflowData.lastSavedAt"] = new Date();
        update["workflowData.lastSavedBy"] = userId;

        // Diagnostic: trace photo URLs being saved
        const records = workflowData.recordSets?.[0]?.records || [];
        const photosWithUrl = records.filter(r => r.url).length;
        logger.info(`[OrthodonticsService] DB SAVE case=${caseId}: ${photosWithUrl}/${records.length} photos with URL, keys=[${Object.keys(update).join(', ')}]`);

        // Atomic: $set fields + $inc version in a single write — @per-org-compliant
        const updated = await OrthoCase.findOneAndUpdate(
            { _id: caseId, organizationId },
            {
                $set: update,
                $inc: { workflowVersion: 1 }
            },
            { new: true, runValidators: true }
        ).lean();

        logger.info(`[OrthodonticsService] Workflow saved for case ${caseId} by user ${userId}, version=${updated.workflowVersion}`);

        // ── Create immutable snapshot ─────────────────────────────────
        let snapshot = null;
        try {
            const wd = updated.workflowData || {};
            const allRecords = (wd.recordSets || []).flatMap(rs => rs.records || []);

            snapshot = await new Snapshot({
                organizationId,
                caseId,
                version: updated.workflowVersion,
                trigger,
                label: label || null,
                recordSets:       wd.recordSets || [],
                problemList:      wd.problemList || [],
                treatmentGoals:   wd.treatmentGoals || [],
                treatmentOptions: wd.treatmentOptions || [],
                selectedOptionId: wd.selectedOptionId || null,
                finalPlan:        wd.finalPlan || null,
                currentStep:      wd.currentStep || 0,
                savedBy:          userId,
                summary: {
                    totalRecordSets: (wd.recordSets || []).length,
                    totalPhotos:     allRecords.length,
                    photosWithUrl:   allRecords.filter(r => r.url).length,
                    totalStlFiles:   (wd.recordSets || []).reduce((sum, rs) => sum + (rs.stlFiles || []).length, 0),
                    totalProblems:   (wd.problemList || []).length,
                    totalGoals:      (wd.treatmentGoals || []).length,
                },
            });
            await snapshot.save();

            await OrthoCase.updateOne(
                { _id: caseId, organizationId },
                { $set: { currentSnapshotId: snapshot._id, latestVersion: updated.workflowVersion } }
            );

            logger.info(`[OrthodonticsService] Snapshot v${updated.workflowVersion} [${trigger}] created for case ${caseId}, snapshotId=${snapshot._id}`);
        } catch (snapErr) {
            logger.error(`[OrthodonticsService] Failed to create snapshot for case ${caseId}: ${snapErr.message}`);
        }

        return {
            workflowData: updated.workflowData,
            workflowVersion: updated.workflowVersion,
            snapshotId: snapshot?._id || null,
            latestVersion: updated.workflowVersion,
            updatedAt: updated.updatedAt
        };
    }

    async getWorkflowData({ req, caseId }) {
        const organizationId = this._ensureContext(req);
        const { OrthoCase } = _getModels(req);
        const orthoCase = await OrthoCase.findOne({ _id: caseId, organizationId })
            .select("workflowData workflowVersion currentSnapshotId latestVersion")
            .lean();

        if (!orthoCase) {
            const err = new Error("Orthodontic case not found.");
            err.statusCode = 404;
            throw err;
        }

        return {
            workflowData: orthoCase.workflowData || {
                recordSets: [],
                problemList: null,
                treatmentGoals: [],
                treatmentOptions: [],
                selectedOptionId: null,
                finalPlan: null,
                currentStep: 0,
                lastSavedAt: null,
                lastSavedBy: null
            },
            workflowVersion: orthoCase.workflowVersion || 0,
            currentSnapshotId: orthoCase.currentSnapshotId || null,
            latestVersion: orthoCase.latestVersion || 0,
        };
    }

    async updateRecordSet({ req, caseId, recordSetId, recordSetData, userId }) {
        const organizationId = this._ensureContext(req);
        const { OrthoCase } = _getModels(req);
        const mongoose = require("mongoose");
        
        const updated = await OrthoCase.findOneAndUpdate(
            { _id: caseId, organizationId, "workflowData.recordSets._id": recordSetId },
            {
                $set: {
                    ...Object.fromEntries(Object.entries(recordSetData).map(([k, v]) => [`workflowData.recordSets.$[elem].${k}`, v])),
                    "workflowData.lastSavedAt": new Date(),
                    "workflowData.lastSavedBy": userId
                },
                $inc: { workflowVersion: 1 }
            },
            { 
                arrayFilters: [{ "elem._id": new mongoose.Types.ObjectId(recordSetId) }],
                new: true, 
                runValidators: true 
            }
        ).lean();

        if (!updated) {
            const err = new Error("Record set not found in this case or case not found.");
            err.statusCode = 404;
            throw err;
        }

        logger.info(`[OrthodonticsService] RecordSet ${recordSetId} updated surgically for case ${caseId} by ${userId}`);
        
        return updated;
    }

    // ─── Snapshot for Share ────────────────────────────────────────────

    /**
     * Get or create a SHARE-triggered snapshot for the current state.
     * If the current snapshot is already up-to-date, returns it.
     * Otherwise creates a new one marked with trigger=SHARE.
     */
    async getOrCreateShareSnapshot({ req, caseId, userId }) {
        const organizationId = this._ensureContext(req);
        const { OrthoCase, Snapshot } = _getModels(req);
        const orthoCase = await OrthoCase.findOne({ _id: caseId, organizationId })
            .select("currentSnapshotId workflowVersion latestVersion")
            .lean();

        if (!orthoCase) {
            const err = new Error("Orthodontic case not found.");
            err.statusCode = 404;
            throw err;
        }

        if (orthoCase.currentSnapshotId) {
            return orthoCase.currentSnapshotId;
        }

        const fullCase = await OrthoCase.findOne({ _id: caseId, organizationId }).lean();
        const wd = fullCase.workflowData || {};
        const allRecords = (wd.recordSets || []).flatMap(rs => rs.records || []);
        const newVersion = (fullCase.latestVersion || fullCase.workflowVersion || 0) + 1;

        const snapshot = new Snapshot({
            organizationId,
            caseId,
            version: newVersion,
            trigger: 'SHARE',
            recordSets:       wd.recordSets || [],
            problemList:      wd.problemList || [],
            treatmentGoals:   wd.treatmentGoals || [],
            treatmentOptions: wd.treatmentOptions || [],
            selectedOptionId: wd.selectedOptionId || null,
            finalPlan:        wd.finalPlan || null,
            currentStep:      wd.currentStep || 0,
            savedBy:          userId,
            summary: {
                totalRecordSets: (wd.recordSets || []).length,
                totalPhotos:     allRecords.length,
                photosWithUrl:   allRecords.filter(r => r.url).length,
                totalStlFiles:   (wd.recordSets || []).reduce((sum, rs) => sum + (rs.stlFiles || []).length, 0),
                totalProblems:   (wd.problemList || []).length,
                totalGoals:      (wd.treatmentGoals || []).length,
            },
        });
        await snapshot.save();

        await OrthoCase.updateOne(
            { _id: caseId, organizationId },
            { $set: { currentSnapshotId: snapshot._id, latestVersion: newVersion } }
        );

        logger.info(`[OrthodonticsService] Share snapshot v${newVersion} created for case ${caseId}`);
        return snapshot._id;
    }

    // ─── Snapshot Operations ────────────────────────────────────────────

    async listSnapshots({ req, caseId, page = 1, limit = 20 }) {
        const organizationId = this._ensureContext(req);
        const { Snapshot } = _getModels(req);
        const skip = (page - 1) * limit;

        const [snapshots, total] = await Promise.all([
            Snapshot.find({ organizationId, caseId })
                .select("-recordSets -problemList -treatmentGoals -treatmentOptions -finalPlan")
                .sort({ version: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Snapshot.countDocuments({ organizationId, caseId }),
        ]);

        return { snapshots, total, page, limit };
    }

    async getSnapshot({ req, snapshotId }) {
        const organizationId = this._ensureContext(req);
        const { Snapshot } = _getModels(req);
        const snapshot = await Snapshot.findOne({ _id: snapshotId, organizationId }).lean();

        if (!snapshot) {
            const err = new Error("Snapshot not found.");
            err.statusCode = 404;
            throw err;
        }

        return snapshot;
    }
}

module.exports = new OrthodonticCaseService();
module.exports.CASE_TRANSITIONS = CASE_TRANSITIONS;
module.exports.validateCaseTransition = validateCaseTransition;
