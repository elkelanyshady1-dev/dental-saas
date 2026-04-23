/**
 * patientCreate.service.js — DDD Application Service
 * v5.0 — Phase F.7 Connection-Unified Architecture
 *
 * Handles patient creation with:
 * - req.dbConnection-bound models (same connection as aggregate reads)
 * - per-org DB session for transactional safety
 * - Transactional outbox events (crash-safe)
 * - Audit data included in event payload (post-commit)
 *
 * Phase F.7 Changes:
 *   - REMOVED withRegionalTransaction — regional connections use a different
 *     MongoDB database than req.dbConnection (dbManager per-org isolation).
 *     Create + Read MUST use the same connection or reads fail with "not found".
 *   - ALL models now resolved via getModel(req.dbConnection, ...) to match
 *     the exact same connection used in getPatientAggregate.
 *   - Session started from req.dbConnection for same-connection transaction.
 *
 * INVARIANT: This service is the ONLY entry point for patient creation.
 */

"use strict";

const eventBus = require("../../../core/eventBus");
const {
  PATIENT_CREATED
} = require("../../../core/domainEvents");
const {
  parsePhoneNumberFromString
} = require("libphonenumber-js");
const orgUsageService = require("@core/usage/orgUsage.service");
const getModel = require("../../../core/db/getModel");

// Model definitions (schema only — compiled per-connection at runtime)
const PatientDef = require("../../../organization/patient/models/patient.model");
const BranchCounterDef = require("../core/branchCounter.model");
const EventOutboxDef = require("../../../core/EventOutbox.model");
const Branch = require("../../../shared/models/Branch");
class PatientCreateService {
  /**
   * Create a new patient record.
   *
   * @param {object} params
   * @param {string} params.regionCode       Region for audit metadata only (NOT connection routing)
   * @param {string} params.organizationId   Tenant org
   * @param {string} params.actorId          Creating user
   * @param {object} params.data             Patient fields from request body
   * @param {string} params.ipAddress        Request IP
   * @param {object} [params.auditContext]   { regionCode, branchId } for audit
   * @param {object} params.req              Express request — REQUIRED for req.dbConnection
   * @returns {Promise<object>}  Created patient document ID + code
   */
  async createPatient({
    regionCode,
    organizationId,
    actorId,
    data,
    ipAddress,
    auditContext = {},
    req
  }) {
    if (!req?.dbConnection) {
      throw new Error("[PatientCreateService] req.dbConnection is required. Ensure dbContext middleware runs before this service.");
    }

    // ── Model resolution on per-org connection (same as aggregate reads) ──
    const Patient = getModel(req.dbConnection, PatientDef);
    const BranchCounter = getModel(req.dbConnection, BranchCounterDef);
    const EventOutbox = getModel(req.dbConnection, EventOutboxDef);

    // 1. Name Detection — respect pre-set nameArabic/nameEnglish from frontend
    const {
      nameArabic,
      nameEnglish
    } = _detectNameLanguage(data);

    // 2. Phone Normalization
    const {
      phoneE164,
      phoneDigits,
      phoneRaw
    } = _normalizePhone(data.phone, data.country);

    // 3. Patient Code Resolution (pre-transaction validation)
    let patientCode;
    let customCode = false;
    if (data.patientCode && data.patientCode.trim()) {
      patientCode = data.patientCode.trim();
      customCode = true;
    }

    // 4. Execute inside a session on the SAME connection (req.dbConnection)
    let createdPatientId;
    const session = await req.dbConnection.startSession();
    try {
      await session.withTransaction(async () => {
        // 4a. Custom code uniqueness check (inside txn for safety)
        if (customCode) {
          const exists = await Patient.findOne({
            patientCode
          }).session(session).lean();
          if (exists) {
            throw new Error(`Patient code "${patientCode}" already exists in this organization.`);
          }
        }

        // 4b. Auto-generate code inside transaction (atomic counter)
        if (!customCode) {
          const BranchModel = getModel(req.dbConnection, Branch);
          const branch = await BranchModel.findById(data.primaryBranchId).select("name clinicType").lean();
          const branchInitial = (branch?.name?.[0] || "X").toUpperCase();
          const counter = await BranchCounter.findOneAndUpdate({
            branchId: data.primaryBranchId
          }, {
            $inc: {
              sequence: 1
            }
          }, {
            upsert: true,
            returnDocument: "after",
            session
          });
          patientCode = `${branchInitial}${counter.sequence}`;

          // v32.0: careType — respect explicit override, else derive from branch SSOT
          if (!data.careType || !['PRIVATE', 'ACADEMIC'].includes(data.careType)) {
            data.careType = branch?.clinicType || "PRIVATE";
          }
          // Prevent PRIVATE careType on ACADEMIC branch (hard rule)
          if (branch?.clinicType === "ACADEMIC") {
            data.careType = "ACADEMIC";
          }
        }

        // Custom code path: still need to resolve careType from branch
        if (customCode) {
          const BranchModel = getModel(req.dbConnection, Branch);
          const branch = await BranchModel.findById(data.primaryBranchId).select("clinicType").lean();
          // Hard-lock ACADEMIC branches; respect manual override for PRIVATE
          if (branch?.clinicType === "ACADEMIC") {
            data.careType = "ACADEMIC";
          } else if (!data.careType || !['PRIVATE', 'ACADEMIC'].includes(data.careType)) {
            data.careType = branch?.clinicType || "PRIVATE";
          }
        }

        // v32.0: assignedDoctorId passes through via ...data spread below.

        // 4c. Create patient
        const patient = new Patient({
          ...data,
          nameArabic,
          nameEnglish,
          patientCode,
          phone: phoneE164,
          phoneE164,
          phoneDigits,
          phoneRaw,
          isActive: true
        });
        await patient.save({
          session
        });
        createdPatientId = patient._id;

        // 4d. Write event to outbox (inside same transaction = crash-safe)
        await eventBus.emitViaOutbox(PATIENT_CREATED, {
          patientId: patient._id,
          actorId,
          patientCode,
          _audit: {
            action: "PATIENT_CREATED",
            entityId: patient._id,
            metadata: {
              patientCode,
              branchId: data.primaryBranchId
            },
            ipAddress,
            regionCode: auditContext.regionCode || regionCode,
            branchId: auditContext.branchId || data.primaryBranchId,
            actorId
          }
        }, "patient.create.service", {
          session,
          EventOutboxModel: EventOutbox
        });
      }, {
        readConcern: {
          level: "snapshot"
        },
        writeConcern: {
          w: "majority"
        }
      });
    } finally {
      await session.endSession();
    }

    // Phase 4.1 — Update usage counter (non-blocking, post-commit)
    try {
      await orgUsageService.incrementPatients(organizationId);
    } catch (_) {/* logged inside service */}
    return {
      patientId: createdPatientId,
      patientCode
    };
  }
}

// ── Private Helpers ─────────────────────────────────────────────────────────

function _detectNameLanguage(data) {
  // Phase 9 FINAL: If frontend explicitly provides nameArabic/nameEnglish, respect them
  const presetArabic = data.nameArabic?.trim() || null;
  const presetEnglish = data.nameEnglish?.trim() || null;
  if (presetArabic || presetEnglish) {
    return {
      nameArabic: presetArabic,
      nameEnglish: presetEnglish
    };
  }

  // Fall back to auto-detection from `name` or `fullName`
  const name = (data.name || data.fullName || "").trim();
  if (!name) return {
    nameArabic: null,
    nameEnglish: null
  };
  const isArabic = /[\u0600-\u06FF]/.test(name);
  return {
    nameArabic: isArabic ? name : null,
    nameEnglish: isArabic ? null : name
  };
}
function _normalizePhone(phone, country) {
  const parsed = parsePhoneNumberFromString(phone, country);
  if (!parsed || !parsed.isValid()) {
    throw new Error("Invalid phone number format.");
  }
  return {
    phoneE164: parsed.number,
    phoneDigits: parsed.number.replace(/\D/g, ""),
    phoneRaw: phone
  };
}
module.exports = new PatientCreateService();