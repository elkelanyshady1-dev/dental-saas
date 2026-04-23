/**
 * categoryRepository.js
 * Domain: treatment-catalog
 * Layer: Infrastructure > Repository
 *
 * All queries MUST be scoped by organizationId (from req.context — never from client).
 * Model is per-org-DB-bound via getModel(req.dbConnection, CategoryDef).
 */

"use strict";

const getModel = require("../../../../core/db/getModel");
const CategoryDef = require("../models/TreatmentCategory.model");
function _getModel(req) {
  return getModel(req.dbConnection, CategoryDef);
}
async function findAll(req, {
  includeInactive = false
} = {}) {
  const Category = _getModel(req);
  const query = {};
  if (!includeInactive) query.isActive = true;
  return Category.find(query).sort({
    sortOrder: 1,
    name: 1
  }).lean();
}
async function findById(req, id) {
  const Category = _getModel(req);
  return Category.findOne({
    _id: id
  }).lean();
}
async function findByCode(req, code) {
  const Category = _getModel(req);
  return Category.findOne({
    code: code.toUpperCase()
  }).lean();
}
async function create(req, data) {
  const Category = _getModel(req);
  const doc = await Category.create({
    ...data,
    createdBy: req.context.userId
  });
  return doc.toObject();
}
async function updateById(req, id, data) {
  const Category = _getModel(req);
  return Category.findOneAndUpdate({
    _id: id
  }, {
    $set: data
  }, {
    new: true,
    runValidators: true
  }).lean();
}
async function toggleStatus(req, id, isActive) {
  const Category = _getModel(req);
  return Category.findOneAndUpdate({
    _id: id
  }, {
    $set: {
      isActive
    }
  }, {
    new: true
  }).lean();
}
module.exports = {
  findAll,
  findById,
  findByCode,
  create,
  updateById,
  toggleStatus
};