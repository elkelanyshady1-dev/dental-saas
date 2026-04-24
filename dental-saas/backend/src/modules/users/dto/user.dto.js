/**
 * user.dto.js — User Domain DTO Builders
 *
 * SSOT: All user API responses MUST go through these builders.
 * Prevents leaking passwordHash, tokenVersion, and other internals.
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

function iso(d) {
    if (!d) return null;
    try { return new Date(d).toISOString(); } catch { return null; }
}

/**
 * buildUserDTO — single user record (safe for API response).
 * Strips: passwordHash, tokenVersion, __v, and other internals.
 */
function buildUserDTO(doc) {
    if (!doc) return null;
    return {
        id:                   toId(doc._id),
        firstName:            doc.firstName || "",
        lastName:             doc.lastName || "",
        name:                 doc.name || `${doc.firstName || ""} ${doc.lastName || ""}`.trim(),
        email:                doc.email || "",
        phone:                doc.phone || null,
        roleName:
            doc.roleId?.name ||
            doc.roleName ||
            doc.role ||
            (doc.platformDesignation === "ORG_ADMIN" ? "org_admin" : null),
        roleId:               toId(doc.roleId),
        platformDesignation:  doc.platformDesignation || null,
        isActive:             doc.isActive ?? true,
        isPractitioner:       doc.isPractitioner ?? false,
        profileImage:         doc.profileImage || null,
        specialty:            doc.profile?.specialty || null,
        branchAccess:         Array.isArray(doc.branchAccess)
            ? doc.branchAccess.map(id => toId(id))
            : [],
        hasFullBranchAccess:  doc.hasFullBranchAccess ?? false,
        lastLogin:            iso(doc.lastLogin),
        createdAt:            iso(doc.createdAt),
        updatedAt:            iso(doc.updatedAt),
    };
}

/**
 * buildUserListDTO — compact user for table/list views.
 */
function buildUserListDTO(doc) {
    if (!doc) return null;
    return {
        id:              toId(doc._id),
        firstName:       doc.firstName || "",
        lastName:        doc.lastName || "",
        name:            doc.name || `${doc.firstName || ""} ${doc.lastName || ""}`.trim(),
        email:           doc.email || "",
        roleName:
            doc.roleId?.name ||
            doc.roleName ||
            doc.role ||
            (doc.platformDesignation === "ORG_ADMIN" ? "org_admin" : null),
        roleId:          toId(doc.roleId),
        platformDesignation: doc.platformDesignation || null,
        isActive:        doc.isActive ?? true,
        isPractitioner:  doc.isPractitioner ?? false,
        profileImage:    doc.profileImage || null,
    };
}

/**
 * buildPractitionerDTO — practitioner for scheduling context.
 */
function buildPractitionerDTO(doc) {
    if (!doc) return null;
    return {
        _id:                  toId(doc._id),
        name:                 doc.name || `${doc.firstName || ""} ${doc.lastName || ""}`.trim(),
        specialty:            doc.profile?.specialty || "general",
        avatarUrl:            doc.profileImage || null,
        branchAccess:         Array.isArray(doc.branchAccess)
            ? doc.branchAccess.map(id => toId(id))
            : [],
        hasFullBranchAccess:  doc.hasFullBranchAccess || false,
    };
}

module.exports = { buildUserDTO, buildUserListDTO, buildPractitionerDTO };
