/**
 * stage.service.js
 * Stage Domain — Treatment Case Lifecycle & Stage Progression
 *
 * RLS-ENFORCED via secureModel + createSystemContext (Wave 9 Migration).
 *
 * SESSION MANAGEMENT: This service manages its OWN internal transactions
 * (MongoDB startSession + startTransaction). secureModel's session option
 * is used to pass the internally-managed session through to Mongoose.
 *
 * INVARIANTS:
 * INV-2:  organizationId is ALWAYS injected by secureModel
 * INV-5:  All write operations are org-scoped
 * INV-17: System context is HMAC-signed and verified
 */
"use strict";

const StageTemplateDef = require("../models/stageTemplate.model");
const StageTemplateOverrideDef = require("../models/stageTemplateOverride.model");
const TreatmentCaseDef = require("../models/treatmentCase.model");
const StageExecutionDef = require("../models/stageExecution.model");
const getModel = require("../../../core/db/getModel");
const dbManager = require("../../../core/db/dbManager");

const eventBus = require("../../../core/eventBus");

// Per-invocation model resolution for background job context
function _getModels(conn) {
    return {
        StageTemplate: getModel(conn, StageTemplateDef),
        StageTemplateOverride: getModel(conn, StageTemplateOverrideDef),
        TreatmentCase: getModel(conn, TreatmentCaseDef),
        StageExecution: getModel(conn, StageExecutionDef),
    };
}

class StageService {
    /**
     * createTreatmentCase()
     * Merges template + overrides and initializes stages.
     */
    async createTreatmentCase(params) {
        const { organizationId, branchId, patientId, procedureType, stageTemplateId, createdByUserId } = params;

        // Resolve org connection
        const conn = await dbManager.getConnection(organizationId);
        const { StageTemplate, StageTemplateOverride, TreatmentCase, StageExecution } = _getModels(conn);

        const session = await conn.startSession();
        session.startTransaction();

        try {
            const template = await StageTemplate.findOne(
                { _id: stageTemplateId, isActive: true }
            ).session(session);
            if (!template) throw new Error("Stage template not found or inactive.");

            const override = await StageTemplateOverride.findOne(
                { stageTemplateId, branchId }
            ).session(session);

            const treatmentCase = new TreatmentCase({
                branchId,
                patientId,
                procedureType: template.name,
                stageTemplateId,
                status: "active",
                createdByUserId,
            });
            await treatmentCase.save({ session });

            // 4. Transform & Merge Stages
            const stagesToCreate = template.stages.map(s => {
                const branchOverride = override?.overrides.find(o => o.stageName === s.stageName);
                return {
                    // Per-org DB: no organizationId needed — connection scopes to org
                    treatmentCaseId: treatmentCase._id,
                    stageName: s.stageName,
                    order: s.order,
                    status: s.order === 1 ? "active" : "not_started",
                    startedAt: s.order === 1 ? new Date() : null,
                    billingTrigger: branchOverride?.modifiedBillingTrigger ?? s.billingTrigger,
                    defaultDuration: branchOverride?.modifiedDurationDays ?? s.defaultDurationDays
                };
            });

            // insertMany not yet in secureModel — explicit organizationId included in each doc above
            await StageExecution.insertMany(stagesToCreate, { session });

            await session.commitTransaction();
            return treatmentCase;

        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    /**
     * completeStage()
     * Moves to next stage and fires triggers.
     */
    async completeStage(params) {
        const { organizationId, stageExecutionId, operatorUserId } = params;

        // Resolve org connection
        const conn = await dbManager.getConnection(organizationId);
        const { StageExecution, TreatmentCase } = _getModels(conn);

        const session = await conn.startSession();
        session.startTransaction();

        try {
            const currentStage = await StageExecution.findOne(
                { _id: stageExecutionId }
            ).session(session);
            if (!currentStage || currentStage.status === "completed") throw new Error("Stage invalid or already completed.");

            currentStage.status = "completed";
            currentStage.completedAt = new Date();
            currentStage.operatorUserId = operatorUserId;
            await currentStage.save({ session });

            const nextStage = await StageExecution.findOne({
                treatmentCaseId: currentStage.treatmentCaseId,
                order: currentStage.order + 1
            }).session(session);

            if (nextStage) {
                nextStage.status = "active";
                nextStage.startedAt = new Date();
                await nextStage.save({ session });
            } else {
                const tCase = await TreatmentCase.findById(
                    currentStage.treatmentCaseId
                ).session(session);
                if (tCase) {
                    await TreatmentCase.updateOne(
                        { _id: tCase._id, version: tCase.version },
                        { $set: { status: "completed" }, $inc: { version: 1 } },
                        { session }
                    );
                }
            }

            // 3. Trigger events after commit
            await session.commitTransaction();

            eventBus.emit("STAGE_COMPLETED", {
                organizationId,
                treatmentCaseId: currentStage.treatmentCaseId,
                stageName: currentStage.stageName,
                order: currentStage.order,
                operatorUserId
            });

            return currentStage;

        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }
}

module.exports = new StageService();
