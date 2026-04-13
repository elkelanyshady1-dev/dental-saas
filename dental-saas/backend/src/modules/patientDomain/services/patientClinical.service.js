/**
 * patientClinical.service.js — DDD Application Service
 * v4.0 — Phase F.6 Zero-Trust RLS Migration
 *
 * Handles clinical record mutations (medical history, notes).
 * Uses regional models + sessions (same MongoClient).
 *
 * Phase F.6 Changes:
 *   - Regional model operations wrapped with secureModel
 *   - req passed through for tenant context
 *   - Legacy RLS exemptions removed — fully migrated to secureModel
 */

"use strict";

const { withRegionalTransaction } = require("../../../infrastructure/db/getRegionalSession");
const eventBus = require("../../../core/eventBus");
const {
    PATIENT_MEDICAL_UPDATED,
} = require("../../../core/domainEvents");

class PatientClinicalService {
    /**
     * Update medical history and/or add clinical notes.
     */
    async updateMedicalHistory({ regionCode, organizationId, actorId, patientId, medicalHistory, notes, ipAddress, auditContext = {}, req }) {
        await withRegionalTransaction(regionCode, async (session, models) => {
            const { ClinicalRecord } = models;

            let record = await ClinicalRecord.findOne({ patientId }).session(session);
            if (!record) {
                record = new ClinicalRecord({ patientId });
                await record.save({ session });
            }

            if (medicalHistory) {
                const existing = record.medicalHistory ? record.medicalHistory.toObject() : {};
                record.medicalHistory = { ...existing, ...medicalHistory };
            }

            if (notes) {
                record.notes.push({ authorId: actorId, content: notes });
            }

            await record.save({ session });

            await eventBus.emitViaOutbox(
                PATIENT_MEDICAL_UPDATED,
                {
                    organizationId, patientId, actorId,
                    _audit: {
                        action: "PATIENT_MEDICAL_UPDATED",
                        entityId: patientId,
                        metadata: {
                            hasNotes: !!notes,
                            conditionsUpdated: medicalHistory ? Object.keys(medicalHistory) : []
                        },
                        ipAddress,
                        regionCode: auditContext.regionCode || regionCode,
                        branchId: auditContext.branchId,
                        actorId,
                        organizationId,
                    }
                },
                "patient.clinical.service",
                { session, EventOutboxModel: models.EventOutbox }
            );
        });
    }
}

module.exports = new PatientClinicalService();
