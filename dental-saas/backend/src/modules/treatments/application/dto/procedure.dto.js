/**
 * procedure.dto.js
 * Treatments Domain — Procedure DTO Builder
 *
 * RULE: Backend is single source of truth.
 * Frontend receives displayName, duration, color — never computes these.
 *
 * APPOINTMENT SNAPSHOT CONTRACT:
 *   When creating an appointment, inject this shape as the treatment snapshot:
 *   { procedureId, name, duration, price, color, categoryId, categoryName }
 *   NEVER rely on procedureId alone for appointment display.
 */

"use strict";

/**
 * Build a single procedure response shape.
 * @param {Object} procedure - Mongoose TreatmentProcedure document
 * @param {Object} [category] - optionally populate category name
 */
function buildProcedureDTO(procedure, category = null) {
  return {
    id: procedure._id.toString(),
    categoryId: procedure.categoryId?._id?.toString() ?? procedure.categoryId?.toString(),
    categoryName: category?.name ?? procedure.categoryId?.name ?? undefined,
    name: procedure.name,
    code: procedure.code,
    duration: procedure.duration,
    // minutes — maps directly to appointment duration
    price: procedure.price ?? null,
    currency: procedure.currency ?? "EGP",
    color: procedure.color,
    description: procedure.description || "",
    isActive: procedure.isActive,
    sortOrder: procedure.sortOrder ?? 0,
    createdAt: procedure.createdAt,
    updatedAt: procedure.updatedAt
  };
}

/**
 * Build appointment snapshot for immutable history storage.
 * Call this at appointment creation time — store the result, not the procedureId.
 *
 * @param {Object} procedure - TreatmentProcedure document
 * @param {Object} [category] - TreatmentCategory document (for categoryName)
 */
function buildProcedureSnapshot(procedure, category = null) {
  return {
    procedureId: procedure._id.toString(),
    categoryId: procedure.categoryId?.toString(),
    categoryName: category?.name ?? null,
    name: procedure.name,
    duration: procedure.duration,
    price: procedure.price ?? null,
    color: procedure.color
  };
}

/**
 * Build a list response for procedures.
 */
function buildProcedureListDTO(procedures) {
  return procedures.map(proc => {
    const category = proc.categoryId && typeof proc.categoryId === "object" ? proc.categoryId : null;
    return buildProcedureDTO(proc, category);
  });
}
module.exports = {
  buildProcedureDTO,
  buildProcedureListDTO,
  buildProcedureSnapshot
};