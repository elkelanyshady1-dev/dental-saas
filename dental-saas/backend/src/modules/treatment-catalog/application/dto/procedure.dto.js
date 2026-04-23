/**
 * procedure.dto.js
 * Domain: treatment-catalog
 * Layer: Application > DTO
 *
 * RULE: Backend is single source of truth.
 * Frontend receives name/duration/color — never computes them from raw IDs.
 *
 * ═══════════════════════════════════════════════════════════════
 * APPOINTMENT SNAPSHOT CONTRACT (CRITICAL INVARIANT):
 *
 *   When an appointment is created with a procedureId:
 *   1. Fetch TreatmentProcedure + TreatmentCategory
 *   2. Call buildProcedureSnapshot()
 *   3. Store the snapshot in appointment.treatment
 *
 *   The appointment MUST NOT read from the catalog at display time.
 *   Catalog changes MUST NOT affect historical appointment data.
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

function buildProcedureDTO(procedure, category = null) {
  const categoryId = procedure.categoryId?._id?.toString() ?? procedure.categoryId?.toString();
  return {
    id: procedure._id?.toString() ?? procedure.id,
    categoryId,
    categoryName: category?.name ?? procedure.categoryId?.name ?? undefined,
    name: procedure.name,
    code: procedure.code,
    duration: procedure.duration,
    price: procedure.price ?? null,
    color: procedure.color ?? "#4f46e5",
    description: procedure.description ?? "",
    isActive: procedure.isActive,
    sortOrder: procedure.sortOrder ?? 0,
    createdAt: procedure.createdAt,
    updatedAt: procedure.updatedAt
  };
}
function buildProcedureListDTO(procedures) {
  return procedures.map(proc => {
    const cat = proc.categoryId && typeof proc.categoryId === "object" ? proc.categoryId : null;
    return buildProcedureDTO(proc, cat);
  });
}

/**
 * buildProcedureSnapshot — immutable snapshot for appointment.treatment field.
 *
 * USAGE: Call at appointment CREATE time. Store in appointment.treatment.
 * NEVER call this at display time — use the stored snapshot instead.
 *
 * @param {Object} procedure  - TreatmentProcedure lean document
 * @param {Object} [category] - TreatmentCategory lean document
 */
function buildProcedureSnapshot(procedure, category = null) {
  return {
    procedureId: procedure._id.toString(),
    categoryId: procedure.categoryId?.toString() ?? null,
    categoryName: category?.name ?? null,
    name: procedure.name,
    duration: procedure.duration,
    color: procedure.color ?? "#4f46e5"
  };
}
module.exports = {
  buildProcedureDTO,
  buildProcedureListDTO,
  buildProcedureSnapshot
};