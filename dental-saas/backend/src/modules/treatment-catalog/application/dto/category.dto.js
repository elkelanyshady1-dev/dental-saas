/**
 * category.dto.js
 * Domain: treatment-catalog
 * Layer: Application > DTO
 *
 * RULE: Backend is single source of truth.
 * ALL responses MUST go through DTO builders — never return raw Mongoose docs.
 */

"use strict";

function buildCategoryDTO(category, procedureCount = undefined) {
  return {
    id: category._id?.toString() ?? category.id,
    name: category.name,
    code: category.code,
    icon: category.icon ?? "medical_services",
    description: category.description ?? "",
    isActive: category.isActive,
    sortOrder: category.sortOrder ?? 0,
    ...(procedureCount !== undefined ? {
      procedureCount
    } : {}),
    createdAt: category.createdAt,
    updatedAt: category.updatedAt
  };
}
function buildCategoryListDTO(categories, countMap = {}) {
  return categories.map(cat => buildCategoryDTO(cat, countMap[cat._id?.toString()] ?? undefined));
}
module.exports = {
  buildCategoryDTO,
  buildCategoryListDTO
};