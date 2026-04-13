const orthoService = require("../services/orthodonticCase.service");
const { validateCreateCase, validateUpdateCase } = require("../validators/orthodonticCase.validator");
const { authorize } = require("../../../utils/authorize");
const logger = require("@utils/logger");
const storageService = require("@core/storage/storageService");
const storageUsage = require("@core/storage/storageUsage.service");

// ─── Case CRUD ───────────────────────────────────────────────────────────────

async function createCase(req, res) {
    try {
        authorize(req, "orthodontics.full");

        logger.info("[SECURITY]", { userId: req.context.userId, organizationId: req.context.organizationId, action: "CASE_CREATE" });

        const { error } = validateCreateCase(req.body);
        if (error) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: error } });

        const orthoCase = await orthoService.createCase({
            req,
            branchId: req.body.branchId || req.branchId,
            data: {
                patientId: req.body.patientId,
                name: req.body.name,
                description: req.body.description,
                priority: req.body.priority,
                malocclusionClass: req.body.malocclusionClass,
                caseType: req.body.caseType,
                notes: req.body.notes,
                extractionPlan: req.body.extractionPlan,
                estimatedDurationMonths: req.body.estimatedDurationMonths,
                retentionPlanned: req.body.retentionPlanned,
                branchId: req.body.branchId,
            },
            userId: req.context.userId,
        });

        return res.status(201).json({ success: true, data: orthoCase });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "CREATE_ERROR", message: err.message } });
    }
}

async function listCases(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { patientId, status, malocclusionClass, page = 1, limit = 20 } = req.query;
        const result = await orthoService.listCases({
            req,
            filters: { patientId, status, malocclusionClass },
            page: parseInt(page),
            limit: Math.min(parseInt(limit), 50)
        });
        return res.json({ success: true, data: result.cases, pagination: result.pagination });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "LIST_ERROR", message: err.message } });
    }
}

async function getCase(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const orthoCase = await orthoService.getCaseById({
            req,
            caseId: req.params.id
        });
        return res.json({ success: true, data: orthoCase });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "GET_ERROR", message: err.message } });
    }
}

async function updateCaseStatus(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { status } = req.body;
        if (!status) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "status is required" } });

        const orthoCase = await orthoService.updateCaseStatus({
            req,
            caseId: req.params.id,
            newStatus: status,
        });
        return res.json({ success: true, data: orthoCase });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "STATUS_ERROR", message: err.message } });
    }
}


// ─── Scan Management ─────────────────────────────────────────────────────────

async function registerScan(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const scanFile = await orthoService.registerScan({
            req,
            caseId: req.params.caseId,
            patientId: req.body.patientId,
            branchId: req.body.branchId || req.branchId,
            data: req.body,
            userId: req.context.userId
        });

        return res.status(201).json({ success: true, data: scanFile });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "UPLOAD_ERROR", message: err.message } });
    }
}

async function listScans(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const scans = await orthoService.listScans({
            req,
            caseId: req.params.caseId
        });
        return res.json({ success: true, data: scans });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "LIST_ERROR", message: err.message } });
    }
}

// ─── AI Analysis ─────────────────────────────────────────────────────────────

async function triggerSegmentation(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const result = await orthoService.triggerSegmentation({
            req,
            caseId: req.params.caseId,
            scanFileId: req.body.scanFileId,
            modelVersion: req.body.modelVersion
        });

        return res.status(202).json({ success: true, data: result, message: "Segmentation analysis enqueued" });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "ANALYSIS_ERROR", message: err.message } });
    }
}

async function triggerCephAnalysis(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const result = await orthoService.triggerCephAnalysis({
            req,
            caseId: req.params.caseId,
            scanFileId: req.body.scanFileId,
            analysisType: req.body.analysisType,
            modelVersion: req.body.modelVersion
        });

        return res.status(202).json({ success: true, data: result, message: "Cephalometric analysis enqueued" });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "ANALYSIS_ERROR", message: err.message } });
    }
}

async function getSegmentationResults(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const results = await orthoService.getSegmentationResults({
            req,
            caseId: req.params.caseId
        });
        return res.json({ success: true, data: results });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "GET_ERROR", message: err.message } });
    }
}

async function getCephResults(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const results = await orthoService.getCephResults({
            req,
            caseId: req.params.caseId
        });
        return res.json({ success: true, data: results });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "GET_ERROR", message: err.message } });
    }
}

// ─── Aligner Plans ───────────────────────────────────────────────────────────

async function createAlignerPlan(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const plan = await orthoService.createAlignerPlan({
            req,
            branchId: req.body.branchId || req.branchId,
            data: req.body,
            userId: req.context.userId
        });
        return res.status(201).json({ success: true, data: plan });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "CREATE_ERROR", message: err.message } });
    }
}

async function listAlignerPlans(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const plans = await orthoService.listAlignerPlans({
            req,
            caseId: req.params.caseId
        });
        return res.json({ success: true, data: plans });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "LIST_ERROR", message: err.message } });
    }
}

async function getAlignerPlan(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const plan = await orthoService.getAlignerPlanById({
            req,
            planId: req.params.id
        });
        return res.json({ success: true, data: plan });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "GET_ERROR", message: err.message } });
    }
}

// ─── Workflow Data ───────────────────────────────────────────────────────────

async function updateRecordSet(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { recordSetData } = req.body;
        if (!recordSetData || typeof recordSetData !== "object") {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "recordSetData object is required" }
            });
        }

        const result = await orthoService.updateRecordSet({
            req,
            caseId: req.params.caseId,
            recordSetId: req.params.recordSetId,
            recordSetData,
            userId: req.context.userId,
        });

        return res.json({ success: true, data: result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "RECORDSET_UPDATE_ERROR", message: err.message }
        });
    }
}

async function saveWorkflow(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { workflowData, expectedVersion, trigger, label } = req.body;
        if (!workflowData || typeof workflowData !== "object") {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "workflowData object is required" }
            });
        }

        const result = await orthoService.saveWorkflowData({
            req,
            caseId: req.params.caseId,
            workflowData,
            userId: req.context.userId,
            expectedVersion: typeof expectedVersion === 'number' ? expectedVersion : undefined,
            trigger: trigger || 'SAVE',
            label: label || null,
        });

        return res.json({ success: true, data: result });
    } catch (err) {
        if (err.code === 'VERSION_CONFLICT') {
            return res.status(409).json({
                success: false,
                error: {
                    code: "VERSION_CONFLICT",
                    message: err.message,
                    currentVersion: err.currentVersion
                }
            });
        }
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "WORKFLOW_SAVE_ERROR", message: err.message }
        });
    }
}

async function getWorkflow(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const result = await orthoService.getWorkflowData({
            req,
            caseId: req.params.caseId
        });

        return res.json({ success: true, data: result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "WORKFLOW_GET_ERROR", message: err.message }
        });
    }
}

// ─── File Uploads ────────────────────────────────────────────────────────────

async function uploadOrthoPhoto(req, res) {
    try {
        authorize(req, "orthodontics.full");

        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: { code: "UPLOAD_ERROR", message: "No file provided" }
            });
        }

        const result = await storageService.upload({
            file: req.file,
            organizationId: req.context.organizationId,
            category: "orthodontics/photos",
        });

        logger.info(`[OrthoUpload] Photo uploaded: ${result.url} by user ${req.context.userId}`);

        storageUsage.increment({
            organizationId: req.context.organizationId,
            sizeBytes: result.sizeBytes,
            type: "photos",
        }).catch(err => logger.warn(`[OrthoUpload] Usage tracking failed: ${err.message}`));

        return res.status(201).json({
            success: true,
            data: {
                url: result.url,
                originalName: result.originalName,
                size: result.sizeBytes,
                mimetype: result.mimeType,
            }
        });
    } catch (err) {
        logger.error(`[OrthoUpload] Photo upload failed: ${err.message}`);
        return res.status(500).json({
            success: false,
            error: { code: "UPLOAD_ERROR", message: err.message }
        });
    }
}

async function uploadOrthoStl(req, res) {
    try {
        authorize(req, "orthodontics.full");

        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: { code: "UPLOAD_ERROR", message: "No file provided" }
            });
        }

        const result = await storageService.upload({
            file: req.file,
            organizationId: req.context.organizationId,
            category: "orthodontics/stl",
        });

        logger.info(`[OrthoUpload] STL uploaded: ${result.url} by user ${req.context.userId}`);

        storageUsage.increment({
            organizationId: req.context.organizationId,
            sizeBytes: result.sizeBytes,
            type: "stl",
        }).catch(err => logger.warn(`[OrthoUpload] Usage tracking failed: ${err.message}`));

        return res.status(201).json({
            success: true,
            data: {
                url: result.url,
                originalName: result.originalName,
                size: result.sizeBytes,
                mimetype: result.mimeType,
            }
        });
    } catch (err) {
        logger.error(`[OrthoUpload] STL upload failed: ${err.message}`);
        return res.status(500).json({
            success: false,
            error: { code: "UPLOAD_ERROR", message: err.message }
        });
    }
}

async function uploadOrthoAudio(req, res) {
    try {
        authorize(req, "orthodontics.full");

        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: { code: "UPLOAD_ERROR", message: "No file provided" }
            });
        }

        const result = await storageService.upload({
            file: req.file,
            organizationId: req.context.organizationId,
            category: "orthodontics/audio",
        });

        logger.info(`[OrthoUpload] Audio uploaded: ${result.url} by user ${req.context.userId}`);

        storageUsage.increment({
            organizationId: req.context.organizationId,
            sizeBytes: result.sizeBytes,
            type: "audio",
        }).catch(err => logger.warn(`[OrthoUpload] Usage tracking failed: ${err.message}`));

        return res.status(201).json({
            success: true,
            data: {
                url: result.url,
                originalName: result.originalName,
                size: result.sizeBytes,
                mimetype: result.mimeType,
            }
        });
    } catch (err) {
        logger.error(`[OrthoUpload] Audio upload failed: ${err.message}`);
        return res.status(500).json({
            success: false,
            error: { code: "UPLOAD_ERROR", message: err.message }
        });
    }
}

// ─── Snapshot Controllers ─────────────────────────────────────────────────

async function listSnapshots(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { page = 1, limit = 20 } = req.query;
        const result = await orthoService.listSnapshots({
            req,
            caseId: req.params.caseId,
            page: parseInt(page, 10),
            limit: Math.min(parseInt(limit, 10), 50),
        });

        return res.json({ success: true, data: result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "SNAPSHOT_LIST_ERROR", message: err.message }
        });
    }
}

async function getSnapshot(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const result = await orthoService.getSnapshot({
            req,
            snapshotId: req.params.snapshotId,
        });

        return res.json({ success: true, data: result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "SNAPSHOT_GET_ERROR", message: err.message }
        });
    }
}

// ─── Internal Case Sharing (Phase 14 — Multi-Doctor Collaboration) ──────────

const mongoose = require("mongoose");
const { checkCaseOwnership } = require("../utils/ownership.guard");

async function shareCaseInternal(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { id } = req.params;
        const { userId } = req.body;

        if (!userId || !mongoose.isValidObjectId(userId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "userId is required and must be a valid ObjectId" },
            });
        }

        await checkCaseOwnership(req, id);

        const getModel = require("../../../core/db/getModel");
        const OrthodonticCaseDef = require("../models/orthodonticCase.model");
        const OrthodonticCase = getModel(req.dbConnection, OrthodonticCaseDef);

        const updated = await OrthodonticCase.findOneAndUpdate(
            { _id: id, organizationId: req.context.organizationId },
            { $addToSet: { sharedWith: userId } },
            { new: true }
        ).lean();

        if (!updated) {
            return res.status(404).json({ success: false, error: { code: "CASE_NOT_FOUND", message: "Case not found" } });
        }

        logger.info(`[OrthoCase] Case ${id} shared with user ${userId} by ${req.context.userId}`);

        return res.json({ success: true, data: { sharedWith: updated.sharedWith } });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "SHARE_ERROR", message: err.message },
        });
    }
}

async function unshareCaseInternal(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { id } = req.params;
        const { userId } = req.body;

        if (!userId || !mongoose.isValidObjectId(userId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "userId is required and must be a valid ObjectId" },
            });
        }

        await checkCaseOwnership(req, id);

        const getModel = require("../../../core/db/getModel");
        const OrthodonticCaseDef = require("../models/orthodonticCase.model");
        const OrthodonticCase = getModel(req.dbConnection, OrthodonticCaseDef);

        const updated = await OrthodonticCase.findOneAndUpdate(
            { _id: id, organizationId: req.context.organizationId },
            { $pull: { sharedWith: userId } },
            { new: true }
        ).lean();

        if (!updated) {
            return res.status(404).json({ success: false, error: { code: "CASE_NOT_FOUND", message: "Case not found" } });
        }

        logger.info(`[OrthoCase] Case ${id} unshared from user ${userId} by ${req.context.userId}`);

        return res.json({ success: true, data: { sharedWith: updated.sharedWith } });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "UNSHARE_ERROR", message: err.message },
        });
    }
}

async function deleteCaseController(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "Invalid case ID" },
            });
        }

        await checkCaseOwnership(req, id);

        const result = await orthoService.deleteCase({
            req,
            caseId: id,
        });

        logger.info(`[OrthoCase] Case ${id} deleted by ${req.context.userId}`);

        return res.json({ success: true, data: result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "DELETE_ERROR", message: err.message },
        });
    }
}

module.exports = {
    createCase,
    listCases,
    getCase,
    updateCaseStatus,
    registerScan,
    listScans,
    triggerSegmentation,
    triggerCephAnalysis,
    getSegmentationResults,
    getCephResults,
    createAlignerPlan,
    listAlignerPlans,
    getAlignerPlan,
    updateRecordSet,
    saveWorkflow,
    getWorkflow,
    uploadOrthoPhoto,
    uploadOrthoStl,
    uploadOrthoAudio,
    listSnapshots,
    getSnapshot,
    shareCaseInternal,
    unshareCaseInternal,
    deleteCaseController,
};
