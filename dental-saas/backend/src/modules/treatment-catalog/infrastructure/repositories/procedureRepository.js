/**
 * procedureRepository.js
 * Domain: treatment-catalog
 * Layer: Infrastructure > Repository
 *
 * All queries MUST be scoped by organizationId (from req.context — never from client).
 */

"use strict";

const getModel = require("../../../../core/db/getModel");
const ProcedureDef = require("../models/TreatmentProcedure.model");

function _getModel(req) {
    return getModel(req.dbConnection, ProcedureDef);
}

async function findByCategory(req, categoryId, { includeInactive = false } = {}) {
    const Procedure = _getModel(req);
    const query = {
        organizationId: req.context.organizationId,
        categoryId,
    };
    if (!includeInactive) query.isActive = true;
    return Procedure.find(query).sort({ sortOrder: 1, name: 1 }).lean();
}

async function findById(req, id) {
    const Procedure = _getModel(req);
    return Procedure.findOne({
        _id: id,
        organizationId: req.context.organizationId,
    }).lean();
}

/**
 * Find by ID and populate category — used for appointment snapshot building.
 */
async function findByIdWithCategory(req, id) {
    const Procedure = _getModel(req);
    const getCategory = require("./categoryRepository");
    const procedure = await Procedure.findOne({
        _id: id,
        organizationId: req.context.organizationId,
        isActive: true,
    }).lean();
    if (!procedure) return null;
    const category = await getCategory.findById(req, procedure.categoryId);
    return { procedure, category };
}

async function findByCode(req, code) {
    const Procedure = _getModel(req);
    return Procedure.findOne({
        organizationId: req.context.organizationId,
        code: code.toUpperCase(),
        isActive: true,
    }).lean();
}

async function create(req, data) {
    const Procedure = _getModel(req);
    const doc = await Procedure.create({
        ...data,
        organizationId: req.context.organizationId,
        createdBy: req.context.userId,
    });
    return doc.toObject();
}

async function updateById(req, id, data) {
    const Procedure = _getModel(req);
    return Procedure.findOneAndUpdate(
        { _id: id, organizationId: req.context.organizationId },
        { $set: data },
        { new: true, runValidators: true }
    ).lean();
}

async function toggleStatus(req, id, isActive) {
    const Procedure = _getModel(req);
    return Procedure.findOneAndUpdate(
        { _id: id, organizationId: req.context.organizationId },
        { $set: { isActive } },
        { new: true }
    ).lean();
}

async function countByCategory(req, categoryId) {
    const Procedure = _getModel(req);
    return Procedure.countDocuments({
        organizationId: req.context.organizationId,
        categoryId,
        isActive: true,
    });
}

module.exports = {
    findByCategory,
    findById,
    findByIdWithCategory,
    findByCode,
    create,
    updateById,
    toggleStatus,
    countByCategory,
};
