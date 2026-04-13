/**
 * treatments.service.js
 * Phase 3 — Clinical Operations: Treatment Domain Service
 *
 * Sovereign service for Treatment CRUD and Treatment Plan management.
 * Enforces status FSM transitions, tenant isolation, and event emission.
 */

"use strict";

const TreatmentDef = require("../models/Treatment.model");
const TreatmentPlanDef = require("../models/TreatmentPlan.model");
const ProcedureDef = require("../../procedures/models/Procedure.model");
const getModel = require("../../../core/db/getModel");
const eventBus = require("../../../core/eventBus");

// Per-request model resolution — binds to org DB
function _getModels(req) {
    const conn = req.dbConnection;
    return {
        Treatment: getModel(conn, TreatmentDef),
        TreatmentPlan: getModel(conn, TreatmentPlanDef),
        Procedure: getModel(conn, ProcedureDef),
    };
}

// Treatment FSM
const TREATMENT_TRANSITIONS = {
    planned: ["in_progress", "cancelled"],
    in_progress: ["completed", "cancelled"],
    completed: [],
    cancelled: []
};

function validateTreatmentTransition(current, next) {
    const allowed = TREATMENT_TRANSITIONS[current];
    if (!allowed) return { valid: false, message: `Unknown current status: ${current}` };
    if (!allowed.includes(next)) return { valid: false, message: `Cannot transition from '${current}' to '${next}'. Allowed: [${allowed.join(", ")}]` };
    return { valid: true };
}

class TreatmentService {
    // ─── Treatment CRUD ──────────────────────────────────────────────────────

    async createTreatment({ organizationId, branchId, data, userId, req }) {
        const { Treatment, Procedure } = _getModels(req);
        const procedure = await Procedure.findOne({
            _id: data.procedureId,
            isActive: true
        });
        if (!procedure) {
            const err = new Error("Procedure not found or inactive.");
            err.statusCode = 404;
            throw err;
        }

        const treatment = new Treatment({
            ...data,
            branchId,
            createdBy: userId,
            statusHistory: [{ status: "planned", changedBy: userId }]
        });
        await treatment.save();

        eventBus.emit("treatment.created", {
            organizationId,
            treatmentId: treatment._id,
            patientId: treatment.patientId,
            procedureId: treatment.procedureId,
            branchId
        });

        return treatment;
    }

    async listTreatments({ organizationId, filters = {}, page = 1, limit = 50, req }) {
        const { Treatment } = _getModels(req);
        const query = { isActive: true };

        if (filters.patientId) query.patientId = filters.patientId;
        if (filters.appointmentId) query.appointmentId = filters.appointmentId;
        if (filters.status) query.status = filters.status;
        if (filters.branchId) query.branchId = filters.branchId;
        if (filters.treatmentPlanId) query.treatmentPlanId = filters.treatmentPlanId;

        const skip = (page - 1) * limit;
        const [treatments, total] = await Promise.all([
            Treatment.find(query)
                .populate("procedureId", "code name category defaultPrice")
                .populate("performedBy", "name email")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Treatment.countDocuments(query)
        ]);

        return {
            treatments,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        };
    }

    async getTreatmentById({ organizationId, treatmentId, req }) {
        const { Treatment } = _getModels(req);
        const treatment = await Treatment.findById(treatmentId)
            .populate("procedureId", "code name category defaultPrice")
            .populate("performedBy", "name email")
            .populate("createdBy", "name email")
            .lean();
        if (!treatment) {
            const err = new Error("Treatment not found.");
            err.statusCode = 404;
            throw err;
        }
        return treatment;
    }

    async updateTreatmentStatus({ organizationId, treatmentId, newStatus, userId, notes, req }) {
        const { Treatment } = _getModels(req);
        const treatment = await Treatment.findById(treatmentId);
        if (!treatment) {
            const err = new Error("Treatment not found.");
            err.statusCode = 404;
            throw err;
        }

        const result = validateTreatmentTransition(treatment.status, newStatus);
        if (!result.valid) {
            const err = new Error(result.message);
            err.statusCode = 400;
            throw err;
        }

        treatment.status = newStatus;
        treatment.statusHistory.push({ status: newStatus, changedBy: userId, notes });

        if (newStatus === "completed") {
            treatment.performedAt = new Date();
            if (!treatment.performedBy) treatment.performedBy = userId;
        }

        treatment.version += 1;
        await treatment.save();

        eventBus.emit("treatment.status_changed", {
            organizationId,
            treatmentId: treatment._id,
            patientId: treatment.patientId,
            newStatus,
            previousStatus: treatment.statusHistory[treatment.statusHistory.length - 2]?.status
        });

        if (newStatus === "completed") {
            eventBus.emit("treatment.completed", {
                organizationId,
                treatmentId: treatment._id,
                patientId: treatment.patientId,
                procedureId: treatment.procedureId,
                branchId: treatment.branchId
            });
        }

        return treatment;
    }

    // ─── Treatment Plan CRUD ─────────────────────────────────────────────────

    async createTreatmentPlan({ organizationId, branchId, data, userId, req }) {
        const { TreatmentPlan, Procedure } = _getModels(req);
        for (const item of data.planItems || []) {
            const proc = await Procedure.findOne({
                _id: item.procedureId,
                isActive: true
            });
            if (!proc) {
                const err = new Error(`Procedure ${item.procedureId} not found.`);
                err.statusCode = 404;
                throw err;
            }
            if (!item.procedureName) item.procedureName = proc.name;
            if (!item.estimatedPrice && item.estimatedPrice !== 0) item.estimatedPrice = proc.defaultPrice;
        }

        const plan = new TreatmentPlan({
            ...data,
            branchId,
            createdBy: userId
        });
        await plan.save();

        return plan;
    }

    async listTreatmentPlans({ organizationId, filters = {}, page = 1, limit = 20, req }) {
        const { TreatmentPlan } = _getModels(req);
        const query = { isActive: true };
        if (filters.patientId) query.patientId = filters.patientId;
        if (filters.status) query.status = filters.status;

        const skip = (page - 1) * limit;
        const [plans, total] = await Promise.all([
            TreatmentPlan.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            TreatmentPlan.countDocuments(query)
        ]);

        return {
            plans,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        };
    }

    async getTreatmentPlanById({ organizationId, planId, req }) {
        const { TreatmentPlan } = _getModels(req);
        const plan = await TreatmentPlan.findById(planId)
            .populate("planItems.procedureId", "code name category")
            .populate("createdBy", "name email")
            .populate("approvedBy", "name email")
            .lean();
        if (!plan) {
            const err = new Error("Treatment plan not found.");
            err.statusCode = 404;
            throw err;
        }
        return plan;
    }
}

module.exports = new TreatmentService();
module.exports.TREATMENT_TRANSITIONS = TREATMENT_TRANSITIONS;
module.exports.validateTreatmentTransition = validateTreatmentTransition;
