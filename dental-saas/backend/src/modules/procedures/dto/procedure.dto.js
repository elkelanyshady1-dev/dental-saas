/**
 * procedure.dto.js — Procedure Catalog DTO Builders
 *
 * SSOT: All procedure API responses MUST go through these builders.
 * Raw Mongoose docs are NEVER returned directly.
 *
 * PLANE: Org only.
 */

"use strict";

function toId(v) {
    if (!v) return null;
    if (typeof v === "string") return v;
    if (typeof v === "object" && v._id) return String(v._id);
    return String(v);
}

/**
 * buildProcedureDTO — single procedure record.
 */
function buildProcedureDTO(doc) {
    if (!doc) return null;
    return {
        id:           toId(doc._id),
        code:         doc.code || "",
        name:         doc.name || "",
        category:     doc.category || null,
        categoryId:   toId(doc.categoryId),
        description:  doc.description || null,
        duration:     doc.duration ?? null,
        cost:         doc.cost ?? 0,
        color:        doc.color || null,
        isActive:     doc.isActive ?? true,
        version:      doc.version ?? 0,
        createdAt:    doc.createdAt || null,
        updatedAt:    doc.updatedAt || null,
    };
}

module.exports = { buildProcedureDTO };
