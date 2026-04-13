/**
 * case.service.js
 * Domain: orthodontic-cases
 * Layer: Application > Services
 *
 * findOrCreateOrthoCase — the central domain service for this phase.
 * Called by the appointment controller when an orthodontic appointment is created.
 *
 * DESIGN RULES:
 *   - Exactly ONE active case per patient per org (INVARIANT enforced here)
 *   - "Active" = status in [draft, diagnosis, treatment_planning, active]
 *   - If no active case → create a new one (status: "draft")
 *   - If completed case exists → a new "draft" case is created (new treatment cycle)
 *   - Non-orthodontic appointments → case linking is OPTIONAL (not forced)
 *   - NEVER throws — non-fatal. Returns null on failure (caller logs and continues).
 *
 * MULTI-TENANCY:
 *   - req.context.organizationId is the sole source of org scope
 *   - req.dbConnection is the per-org DB connection (set by dbContext middleware)
 */

"use strict";

const caseRepo = require("../repositories/orthodonticCase.repository");
const logger = require("@utils/logger");

/**
 * findOrCreateOrthoCase
 *
 * Returns the existing active OrthodonticCase for the patient,
 * or creates a new draft case if none exists.
 *
 * @param {Object} req             Express request (must have req.context, req.dbConnection)
 * @param {string} patientId       Patient ObjectId string
 * @returns {Object|null}          OrthodonticCase lean document, or null if failed
 */
async function findOrCreateOrthoCase(req, patientId) {
    if (!patientId) {
        logger.warn({ event: "ORTHO_CASE_MISSING_PATIENT" }, "[CaseService] findOrCreateOrthoCase called without patientId");
        return null;
    }

    try {
        // 1. Check for existing active case
        const existing = await caseRepo.findActiveByPatient(req, patientId);
        if (existing) {
            logger.debug({
                event:   "ORTHO_CASE_REUSED",
                caseId:  existing._id,
                patientId,
                status:  existing.status,
                orgId:   req.context.organizationId,
            }, "[CaseService] Reusing active OrthodonticCase");
            return existing;
        }

        // 2. No active case — create a new draft
        const newCase = await caseRepo.create(req, {
            patientId,
            caseType: "comprehensive", // Default — clinician updates via workflow
        });

        logger.info({
            event:    "ORTHO_CASE_CREATED",
            caseId:   newCase._id,
            patientId,
            orgId:    req.context.organizationId,
        }, "[CaseService] Created new OrthodonticCase (draft)");

        return newCase;
    } catch (err) {
        // SOFT FAILURE — case linking must never block appointment creation
        logger.error({
            err,
            event:     "ORTHO_CASE_LINK_ERROR",
            patientId,
            orgId:     req.context.organizationId,
        }, "[CaseService] findOrCreateOrthoCase failed — appointment will be created without case link");
        return null;
    }
}

/**
 * computeVisitSequenceNumber
 *
 * Returns the next visit sequence number (1-indexed) for a given case
 * by counting existing ClinicalSnapshots linked to the case.
 *
 * Uses the clinical-snapshots repository via dynamic require to avoid
 * circular dependency (clinical-snapshots → orthodontic-cases → clinical-snapshots).
 *
 * @param {Object} req
 * @param {string} caseId   OrthodonticCase ObjectId string
 * @returns {number}        Next visit number (existing_count + 1), minimum 1
 */
async function computeVisitSequenceNumber(req, caseId) {
    if (!caseId) return 1;
    try {
        const snapshotRepo = require("../../clinical/repositories/clinicalSnapshot.repository");
        const count = await snapshotRepo.countByCase(req, caseId.toString());
        return count + 1;
    } catch (err) {
        logger.warn({
            err,
            event:  "VISIT_SEQ_COMPUTE_ERROR",
            caseId,
        }, "[CaseService] computeVisitSequenceNumber failed — defaulting to 1");
        return 1;
    }
}

module.exports = { findOrCreateOrthoCase, computeVisitSequenceNumber };
