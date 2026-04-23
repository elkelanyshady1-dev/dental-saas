/**
 * category.dto.js
 * Treatments Domain — Category DTO Builder
 *
 * RULE: Backend is single source of truth.
 * All responses MUST go through DTO builders (never raw Mongoose docs).
 */

"use strict";

/**
 * Build a single category response shape.
 * @param {Object} category - Mongoose TreatmentCategory document
 * @param {number} [procedureCount] - pre-fetched count of active procedures
 */
function buildCategoryDTO(category, procedureCount = undefined) {
  return {
    id: category._id.toString(),
    name: category.name,
    code: category.code,
    icon: category.icon,
    description: category.description || "",
    isActive: category.isActive,
    sortOrder: category.sortOrder ?? 0,
    procedureCount: procedureCount ?? undefined,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt
  };
}

/**
 * Build a list response for categories.
 * @param {Array} categories - Array of Mongoose documents (may have .procedureCount virtual)
 */
function buildCategoryListDTO(categories) {
  return categories.map(cat => buildCategoryDTO(cat, cat.procedureCount));
}
module.exports = {
  buildCategoryDTO,
  buildCategoryListDTO
};