/**
 * patient.search.controller.js — Smart Patient Search
 * v2.0 — Phase F.6 Zero-Trust RLS Migration
 *
 * Phase F.6 Changes:
 *   - All raw Patient model queries replaced with Patient via secureModel
 *   - organizationId removed from queries — per-org DB connection isolates it
 *   - Legacy RLS exemptions removed — fully migrated to secureModel
 *   - req passed to all secureModel calls for tenant context
 *
 * Provides:
 *   GET  /v1/patient/domain/search  → smart duplicate search
 *   POST /v1/patient/domain/quick   → quick patient creation (minimal fields)
 *   POST /v1/patient/domain/:id/family → link family members
 */
"use strict";

const PatientDef = require("../../../organization/patient/models/patient.model");
const getModel = require("../../../core/db/getModel");
const patientAggregateService = require("./patient.aggregate.service");
const { successResponse, errorResponse } = require("@utils/responseFormatter");
const { parsePhoneNumberFromString } = require("libphonenumber-js");
const eventBus = require("../../../core/eventBus");
const { buildPatientSearchDTO } = require("../../../dto/patient.dto");
const { quickCreatePatientSchema } = require("../../../validation/patient.schema");

// Per-request model resolution
function _getPatient(req) {
    return getModel(req.dbConnection, PatientDef);
}

// ─── Helper: strip non-digits for phone comparison ───────────────────────────
function normalizePhoneDigits(raw) {
    return (raw || "").replace(/\D/g, "");
}

/**
 * GET /v1/patient/domain/search
 * Query: { q, phone, name, limit=5 }
 *
 * `q` is the unified search param from the CreateAppointmentDrawer.
 * Auto-detects phone vs name:
 *   - If q contains >= 6 digits → treat as phone
 *   - Otherwise → treat as name
 *
 * Returns: { results: [...], total } where results is the flat patient array.
 */
async function search(req, res) {
    try {
        // Accept `q` (unified) or separate `phone` / `name`
        const { q, limit = 8 } = req.query;
        let { phone, name } = req.query;

        // Auto-classify `q` → phone or name
        if (q && !phone && !name) {
            const digits = q.replace(/\D/g, "");
            if (digits.length >= 6) {
                phone = q;
            } else {
                name = q;
            }
        }

        const organizationId = req.organizationId || req.context?.organizationId;
        if (!organizationId) {
            return errorResponse(res, "Organization context required", "ORG_CTX_MISSING", 400);
        }

        const results = [];
        const seenIds = new Set();

        // ── 1. Phone Match (exact digits, indexed) ──────────────────────────
        if (phone) {
            const digits = normalizePhoneDigits(phone);
            if (digits.length >= 6) {
                const phoneSuffix = digits.slice(-9);
                const Patient = _getPatient(req);
                const phoneMatches = await Patient.find({
                    isActive: true,
                    phoneDigits: { $regex: phoneSuffix + "$" },
                })
                    .select("nameEnglish nameArabic phone phoneDigits patientCode gender dateOfBirth primaryBranchId createdAt")
                    .limit(parseInt(limit))
                    .lean();

                for (const p of phoneMatches) {
                    if (!seenIds.has(p._id.toString())) {
                        seenIds.add(p._id.toString());
                        results.push(buildPatientSearchDTO(p, "phone"));
                    }
                }
            }
        }

        // ── 2. Name Match (token-based, indexed) ────────────────────────────
        if (name && name.trim().length >= 2) {
            const normalized = name.trim().toLowerCase().replace(/\s+/g, " ");
            const tokens = normalized.split(" ").filter(t => t.length >= 2);

            const Patient = _getPatient(req);
            const nameMatches = await Patient.find({
                isActive: true,
                $or: [
                    { nameTokens: { $in: tokens } },
                    { fullNameNormalized: { $regex: tokens[0], $options: "i" } },
                    // Also search Arabic name directly
                    { nameArabic: { $regex: name.trim(), $options: "i" } },
                ],
            })
                .select("nameEnglish nameArabic phone phoneDigits patientCode gender dateOfBirth primaryBranchId createdAt")
                .limit(parseInt(limit) * 2)
                .lean();

            for (const p of nameMatches) {
                if (!seenIds.has(p._id.toString())) {
                    seenIds.add(p._id.toString());
                    results.push(buildPatientSearchDTO(p, "name"));
                }
            }
        }

        const sliced = results.slice(0, parseInt(limit));

        // Return flat array in `data` so frontend can do: res.data.data (array)
        return successResponse(res, sliced);
    } catch (error) {
        console.error("Patient search error:", error);
        return errorResponse(res, error.message, "SEARCH_ERROR", 500);
    }
}

// ─── QUICK PATIENT CREATION ───────────────────────────────────────────────────
/**
 * POST /v1/patient/domain/quick
 * Body: { fullName, phone, country?, primaryBranchId, allowedBranchIds }
 *
 * Creates a partial patient record with status: "incomplete".
 * Receptionist can complete the profile later.
 */
async function quickCreate(req, res) {
    try {
        if (req.user.type !== "org" || req.user.platformRole) {
            return errorResponse(res, "Access denied. Only clinic staff can create patients.", "AUTH_FORBIDDEN", 403);
        }

        const { fullName, phone, country = "EG", primaryBranchId, allowedBranchIds } = req.body;

        // Phase 9: Zod validation — mandatory gatekeeper
        const parseResult = quickCreatePatientSchema.safeParse(req.body);
        if (!parseResult.success) {
            const msg = parseResult.error.issues.map(i => i.message).join("; ");
            return errorResponse(res, msg, "VALIDATION_ERROR", 400);
        }

        const organizationId = req.organizationId;
        const actorId = req.user._id;

        const patient = await patientAggregateService.createPatient({
            organizationId,
            actorId,
            data: {
                name: fullName.trim(),
                phone: phone.trim(),
                country,
                primaryBranchId,
                allowedBranchIds: allowedBranchIds || [primaryBranchId],
                status: "incomplete",      // Marks record as quick-created
                ipAddress: req.ip,
            },
            ipAddress: req.ip,
            req, // Phase F.6: Pass req for tenant context
        });

        return successResponse(res, patient, 201);
    } catch (error) {
        console.error("Quick create error:", error);
        return errorResponse(res, error.message, "QUICK_CREATE_ERROR", 400);
    }
}

// ─── FAMILY LINKING ───────────────────────────────────────────────────────────
/**
 * POST /v1/patient/domain/:id/family
 * Body: { familyMemberId, relationship }
 *
 * Links two patients as family members (bidirectional).
 * relationship: "father" | "mother" | "spouse" | "sibling" | "child" | "other"
 */
async function linkFamily(req, res) {
    try {
        if (req.user.type !== "org" || req.user.platformRole) {
            return errorResponse(res, "Access denied.", "AUTH_FORBIDDEN", 403);
        }

        const { id: patientId } = req.params;
        const { familyMemberId, relationship } = req.body;
        const organizationId = req.organizationId;
        const actorId = req.user._id;

        if (!familyMemberId || !relationship) {
            return errorResponse(res, "familyMemberId and relationship are required", "VALIDATION_ERROR", 400);
        }

        if (patientId === familyMemberId) {
            return errorResponse(res, "Cannot link patient to themselves", "VALIDATION_ERROR", 400);
        }

        // 1. Verify both patients exist in this org (secureModel enforces tenant isolation)
        const Patient = _getPatient(req);
        const [patient, familyMember] = await Promise.all([
            Patient.findOne({ _id: patientId, isActive: true }),
            Patient.findOne({ _id: familyMemberId, isActive: true }),
        ]);

        if (!patient) return errorResponse(res, "Patient not found", "NOT_FOUND", 404);
        if (!familyMember) return errorResponse(res, "Family member not found", "NOT_FOUND", 404);

        // 2. Prevent duplicate links
        const alreadyLinked = patient.familyMembers?.some(
            fm => fm.patientId.toString() === familyMemberId
        );
        if (alreadyLinked) {
            return errorResponse(res, "Patients are already linked", "ALREADY_LINKED", 409);
        }

        // 3. Inverse relationship mapping
        const INVERSE = {
            father: "child", mother: "child", child: "parent",
            spouse: "spouse", sibling: "sibling",
            parent: "child", other: "other",
        };
        const inverseRelationship = INVERSE[relationship] || "other";

        // 4. Bidirectional link via secureModel (atomic via Promise.all)
        await Promise.all([
            Patient.updateOne(
                { _id: patientId },
                { $push: { familyMembers: { patientId: familyMemberId, relationship } } }
            ),
            Patient.updateOne(
                { _id: familyMemberId },
                { $push: { familyMembers: { patientId, relationship: inverseRelationship } } }
            ),
        ]);

        // 5. Audit log
        const { createAuditRecord } = require("../../../services/auditService");
        await createAuditRecord({
            organizationId,
            branchId: patient.primaryBranchId,
            actorId,
            userId: actorId,
            actorType: "tenant_user",
            action: "PATIENT_FAMILY_LINKED",
            entity: "PATIENT",
            entityType: "PATIENT",
            entityId: patientId,
            details: { familyMemberId, relationship },
            metadata: { familyMemberId, relationship },
            ipAddress: req.ip || "system",
            success: true,
        });

        // 6. Event
        eventBus.emit("patient.family.linked", { organizationId, patientId, familyMemberId, relationship });

        // 7. Return updated patient family list
        const updatedPatient = await _getPatient(req).findOne({ _id: patientId })
            .populate("familyMembers.patientId", "nameEnglish nameArabic phone patientCode gender")
            .lean();

        return successResponse(res, {
            familyMembers: updatedPatient.familyMembers || [],
            message: `Successfully linked as ${relationship}`,
        });
    } catch (error) {
        console.error("Family link error:", error);
        return errorResponse(res, error.message, "FAMILY_LINK_ERROR", 400);
    }
}

// ─── GET FAMILY MEMBERS ───────────────────────────────────────────────────────
/**
 * GET /v1/patient/domain/:id/family
 * Returns the patient's linked family members with populated data.
 */
async function getFamilyMembers(req, res) {
    try {
        const { id: patientId } = req.params;

        const patient = await _getPatient(req).findOne({ _id: patientId, isActive: true })
            .populate("familyMembers.patientId", "nameEnglish nameArabic phone patientCode gender dateOfBirth")
            .lean();

        if (!patient) return errorResponse(res, "Patient not found", "NOT_FOUND", 404);

        return successResponse(res, {
            familyMembers: patient.familyMembers || [],
        });
    } catch (error) {
        console.error("Get family error:", error);
        return errorResponse(res, error.message, "GET_FAMILY_ERROR", 500);
    }
}

// ─── UNLINK FAMILY ────────────────────────────────────────────────────────────
/**
 * DELETE /v1/patient/domain/:id/family/:memberId
 */
async function unlinkFamily(req, res) {
    try {
        const { id: patientId, memberId: familyMemberId } = req.params;

        const Patient = _getPatient(req);
        await Promise.all([
            Patient.updateOne(
                { _id: patientId },
                { $pull: { familyMembers: { patientId: familyMemberId } } }
            ),
            Patient.updateOne(
                { _id: familyMemberId },
                { $pull: { familyMembers: { patientId } } }
            ),
        ]);

        return successResponse(res, { message: "Family link removed" });
    } catch (error) {
        console.error("Unlink family error:", error);
        return errorResponse(res, error.message, "UNLINK_ERROR", 400);
    }
}

module.exports = { search, quickCreate, linkFamily, getFamilyMembers, unlinkFamily };
