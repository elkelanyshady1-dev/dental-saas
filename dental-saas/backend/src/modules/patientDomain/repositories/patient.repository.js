/**
 * patient.repository.js — DDD Repository Layer
 * v4.0 — Guards V2 Migration (Direct Model Access)
 *
 * Isolates all Patient collection DB queries behind a clean interface.
 * Uses getModel(req.dbConnection, Def) for per-org model resolution.
 * Guards are applied at the route level via guardedRoute().
 *
 * INVARIANT: This is the ONLY file allowed to import the Patient model
 *            for write operations within the patient domain.
 *
 * Connection Binding:
 *   getModel compiles the model on the org's connection (per-org isolation)
 */

"use strict";

const PatientDef = require("../../../organization/patient/models/patient.model");
const getModel = require("../../../core/db/getModel");
const { parsePhoneNumberFromString } = require("libphonenumber-js");

// ── Connection-Bound Helper ─────────────────────────────────────────────────
function _getPatient(req) {
    return getModel(req.dbConnection, PatientDef);
}

class PatientRepository {
    /**
     * Create a new patient document inside a transaction.
     * @param {object} data  Patient fields
     * @param {object} req   Express request (must have req.dbConnection)
     * @param {import("mongoose").ClientSession} session
     * @returns {Promise<object>}  Created patient document
     */
    async create(data, req, session) {
        const Patient = _getPatient(req);
        const instance = new Patient(data);
        if (session) {
            await instance.save({ session });
        } else {
            await instance.save();
        }
        return instance;
    }

    /**
     * Find active patient by ID (inside optional session).
     * @param {string} patientId
     * @param {object} req   Express request (must have req.dbConnection)
     * @param {import("mongoose").ClientSession} [session]
     * @returns {Promise<object|null>}
     */
    async findActiveById(patientId, req, session = null) {
        const Patient = _getPatient(req);
        const q = Patient.findOne({ _id: patientId, isActive: true });
        if (session) q.session(session);
        return q;
    }

    /**
     * Find patient by ID (any status, inside optional session).
     * @param {string} patientId
     * @param {object} req   Express request (must have req.dbConnection)
     * @param {import("mongoose").ClientSession} [session]
     * @returns {Promise<object|null>}
     */
    async findById(patientId, req, session = null) {
        const Patient = _getPatient(req);
        const q = Patient.findOne({ _id: patientId });
        if (session) q.session(session);
        return q;
    }

    /**
     * Find patient by ID — lean (read-only).
     * @param {string} patientId
     * @param {object} req   Express request (must have req.dbConnection)
     * @returns {Promise<object|null>}
     */
    async findByIdLean(patientId, req) {
        const Patient = _getPatient(req);
        return Patient.findOne({ _id: patientId }).lean();
    }

    /**
     * Versioned update — atomic update with OAV check.
     * @param {string} patientId
     * @param {object} req   Express request (must have req.dbConnection)
     * @param {number} targetVersion
     * @param {object} updateSet
     * @param {import("mongoose").ClientSession} session
     */
    async versionedUpdate(patientId, req, targetVersion, updateSet, session) {
        const VersionConflictError = require("../../../errors/VersionConflictError");
        const Patient = _getPatient(req);
        const result = await Patient.updateOne(
            { _id: patientId, version: targetVersion },
            { $set: updateSet, $inc: { version: 1 } },
            session ? { session } : undefined
        );

        if (result.modifiedCount === 0) {
            throw new VersionConflictError("Aggregate version mismatch");
        }

        return result;
    }

    /**
     * Check if a patient code already exists in the organization.
     * @param {object} req   Express request (must have req.dbConnection)
     * @param {string} patientCode
     * @returns {Promise<boolean>}
     */
    async patientCodeExists(req, patientCode) {
        const Patient = _getPatient(req);
        const exists = await Patient.findOne({ patientCode }).lean();
        return !!exists;
    }

    /**
     * Access check — count documents matching query.
     * @param {object} query
     * @param {object} req   Express request (must have req.dbConnection)
     * @returns {Promise<number>}
     */
    async countByQuery(query, req) {
        const Patient = _getPatient(req);
        return Patient.countDocuments(query);
    }

    /**
     * Parse and normalize phone number.
     * @param {string} phone  Raw phone input
     * @param {string} country  ISO country code
     * @returns {{ phoneE164: string, phoneDigits: string, phoneRaw: string }}
     */
    normalizePhone(phone, country) {
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

    /**
     * Detect language from input name.
     * @param {string} inputName
     * @returns {{ nameArabic: string|null, nameEnglish: string|null }}
     */
    detectNameLanguage(inputName) {
        const name = (inputName || "").trim();
        const isArabic = /[\u0600-\u06FF]/.test(name);
        return {
            nameArabic: isArabic ? name : null,
            nameEnglish: isArabic ? null : name
        };
    }
}

module.exports = new PatientRepository();
