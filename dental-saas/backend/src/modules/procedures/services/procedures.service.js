/**
 * procedures.service.js
 * Phase 3 — Clinical Operations: Procedure Catalog Service
 * Phase F.1 — RLS Activation (secureModel migration)
 *
 * Sovereign domain service for Procedure CRUD.
 * All operations enforce organizationId isolation via secureModel.
 */

"use strict";

const ProcedureDef = require("../models/Procedure.model");
const getModel = require("../../../core/db/getModel");

// Per-request model resolution
function _getProcedure(req) {
    return getModel(req.dbConnection, ProcedureDef);
}

class ProcedureService {
    /**
     * Create a new procedure in the catalog
     */
    async createProcedure({ req, data }) {
        const Procedure = _getProcedure(req);
        const existing = await Procedure.findOne({
            code: data.code.toUpperCase()
        });
        if (existing) {
            const err = new Error(`Procedure code '${data.code}' already exists in this organization.`);
            err.statusCode = 409;
            throw err;
        }

        const procedure = new Procedure({
            ...data,
            code: data.code.toUpperCase()
        });
        await procedure.save();

        return procedure;
    }

    /**
     * List procedures (paginated, filterable)
     */
    async listProcedures({ req, filters = {}, page = 1, limit = 50 }) {
        const Procedure = _getProcedure(req);
        const query = {};

        if (filters.category) query.category = filters.category;
        if (filters.isActive !== undefined) query.isActive = filters.isActive;
        if (filters.search) {
            query.$or = [
                { name: { $regex: filters.search, $options: "i" } },
                { code: { $regex: filters.search.toUpperCase(), $options: "i" } }
            ];
        }

        const skip = (page - 1) * limit;
        const [procedures, total] = await Promise.all([
            Procedure.find(query)
                .sort({ category: 1, name: 1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Procedure.countDocuments(query)
        ]);

        return {
            procedures,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        };
    }

    /**
     * Get single procedure by ID
     */
    async getProcedureById({ req, procedureId }) {
        const Procedure = _getProcedure(req);
        const procedure = await Procedure.findById(procedureId).lean();
        if (!procedure) {
            const err = new Error("Procedure not found.");
            err.statusCode = 404;
            throw err;
        }
        return procedure;
    }

    /**
     * Update procedure
     */
    async updateProcedure({ req, procedureId, data, expectedVersion }) {
        if (data.code) data.code = data.code.toUpperCase();

        const Procedure = _getProcedure(req);
        if (data.code) {
            const existing = await Procedure.findOne({
                code: data.code,
                _id: { $ne: procedureId }
            });
            if (existing) {
                const err = new Error(`Procedure code '${data.code}' already in use.`);
                err.statusCode = 409;
                throw err;
            }
        }

        const result = await Procedure.findOneAndUpdate(
            {
                _id: procedureId,
                ...(expectedVersion !== undefined ? { version: expectedVersion } : {})
            },
            { $set: data, $inc: { version: 1 } },
            { new: true }
        );

        if (!result) {
            const err = new Error("Procedure not found or version conflict.");
            err.statusCode = expectedVersion !== undefined ? 409 : 404;
            throw err;
        }

        return result;
    }

    /**
     * Soft delete procedure
     */
    async deleteProcedure({ req, procedureId }) {
        const Procedure = _getProcedure(req);
        const result = await Procedure.findOneAndUpdate(
            { _id: procedureId, isActive: true },
            { $set: { isActive: false }, $inc: { version: 1 } },
            { new: true }
        );

        if (!result) {
            const err = new Error("Procedure not found or already inactive.");
            err.statusCode = 404;
            throw err;
        }

        return result;
    }
}

module.exports = new ProcedureService();
