/**
 * patient.aggregate.service.js — Sovereign Patient Aggregate Service
 * v5.0 — Phase 3 Connection-Aware Model Migration
 *
 * BACKWARD COMPATIBILITY LAYER
 *
 * This file now delegates to the split DDD application services.
 * It preserves the exact same public API so that existing controllers
 * continue to work without modification during the migration.
 *
 * Phase 3 Changes:
 *   - Module-level global model imports replaced with per-request getModel()
 *   - secureModel now wraps connection-bound models instead of global models
 *   - All read queries in getPatientAggregate bind models to req.dbConnection
 *
 * Migration chain:
 *   v2.0 → monolithic (778 lines, global sessions, audit inside txn)
 *   v3.0 → facade → split services, regional sessions, outbox events
 *   v4.0 → facade → secureModel enforcement (Zero-Trust)
 *   v5.0 → facade → connection-aware models (Phase 3)
 */

"use strict";

const PatientDef = require("../../../organization/patient/models/patient.model");
const ClinicalRecordDef = require("../clinical/clinical.model");
const PatientPolicyDef = require("../policies/patientPolicy.model");
const getModel = require("../../../core/db/getModel");
const {
  buildPatientCoreDTO
} = require("../../../dto/patient.dto");

// ── DDD Split Services ──────────────────────────────────────────────────────
const patientCreateService = require("../services/patientCreate.service");
const patientUpdateService = require("../services/patientUpdate.service");
const patientLifecycleService = require("../services/patientLifecycle.service");
const patientClinicalService = require("../services/patientClinical.service");
const patientPolicyService = require("../services/patientPolicy.service");

// ── Connection-Bound Helpers ────────────────────────────────────────────────
function _getModels(req) {
  return {
    Patient: getModel(req.dbConnection, PatientDef),
    ClinicalRecord: getModel(req.dbConnection, ClinicalRecordDef),
    PatientPolicy: getModel(req.dbConnection, PatientPolicyDef)
  };
}
class PatientAggregateService {
  /**
   * CREATE ARCHETYPE — delegates to patientCreate.service
   */
  async createPatient({
    organizationId,
    actorId,
    data,
    ipAddress,
    req
  }) {
    const regionCode = _resolveRegion(req);
    const auditContext = _resolveAuditContext(req);
    const result = await patientCreateService.createPatient({
      regionCode,
      actorId,
      data: {
        ...data,
        ipAddress
      },
      ipAddress,
      auditContext,
      req // Phase F.6: Pass req for tenant context
    });
    return this.getPatientAggregate({
      patientId: result.patientId,
      req
    });
  }

  /**
   * UPDATE ARCHETYPE — delegates to patientUpdate.service
   */
  async updatePatient({
    organizationId,
    actorId,
    patientId,
    data,
    ipAddress,
    expectedVersion,
    isInternalEvent = false,
    req
  }) {
    const regionCode = _resolveRegion(req);
    const auditContext = _resolveAuditContext(req);
    await patientUpdateService.updatePatient({
      regionCode,
      actorId,
      patientId,
      data,
      ipAddress,
      expectedVersion,
      isInternalEvent,
      auditContext,
      req // Phase F.6: Pass req for tenant context
    });
    return this.getPatientAggregate({
      patientId,
      req
    });
  }

  /**
   * BRANCH GOVERNANCE — delegates to patientUpdate.service
   */
  async changePrimaryBranch({
    organizationId,
    actorId,
    patientId,
    newBranchId,
    ipAddress,
    expectedVersion,
    isInternalEvent = false,
    req
  }) {
    const regionCode = _resolveRegion(req);
    const auditContext = _resolveAuditContext(req);
    await patientUpdateService.changePrimaryBranch({
      regionCode,
      actorId,
      patientId,
      newBranchId,
      ipAddress,
      expectedVersion,
      isInternalEvent,
      auditContext,
      req // Phase F.6
    });
    return this.getPatientAggregate({
      patientId,
      req
    });
  }
  async updateBranchAccess({
    organizationId,
    actorId,
    patientId,
    allowedBranchIds,
    ipAddress,
    expectedVersion,
    isInternalEvent = false,
    req
  }) {
    const regionCode = _resolveRegion(req);
    const auditContext = _resolveAuditContext(req);
    await patientUpdateService.updateBranchAccess({
      regionCode,
      actorId,
      patientId,
      allowedBranchIds,
      ipAddress,
      expectedVersion,
      isInternalEvent,
      auditContext,
      req // Phase F.6
    });
    return this.getPatientAggregate({
      patientId,
      req
    });
  }

  /**
   * PORTAL ACCESS GOVERNANCE
   */
  async setPortalEnabled({
    organizationId,
    patientId,
    enabled,
    expectedVersion,
    isInternalEvent = false,
    req
  }) {
    const regionCode = _resolveRegion(req);
    await patientUpdateService.setPortalEnabled({
      regionCode,
      patientId,
      enabled,
      expectedVersion,
      isInternalEvent,
      req // Phase F.6
    });
    return this.getPatientAggregate({
      patientId,
      req
    });
  }

  /**
   * SOFT DELETE — delegates to patientLifecycle.service
   */
  async softDeletePatient({
    organizationId,
    actorId,
    patientId,
    reason,
    ipAddress,
    expectedVersion,
    isInternalEvent = false,
    req
  }) {
    const regionCode = _resolveRegion(req);
    const auditContext = _resolveAuditContext(req);
    return patientLifecycleService.softDeletePatient({
      regionCode,
      actorId,
      patientId,
      reason,
      ipAddress,
      expectedVersion,
      isInternalEvent,
      auditContext,
      req // Phase F.6
    });
  }

  /**
   * STATUS MANAGEMENT — delegates to patientLifecycle.service
   */
  async changeStatus({
    organizationId,
    actorId,
    patientId,
    isActive,
    ipAddress,
    expectedVersion,
    isInternalEvent = false,
    req
  }) {
    const regionCode = _resolveRegion(req);
    const auditContext = _resolveAuditContext(req);
    await patientLifecycleService.changeStatus({
      regionCode,
      actorId,
      patientId,
      isActive,
      ipAddress,
      expectedVersion,
      isInternalEvent,
      auditContext,
      req // Phase F.6
    });
    return this.getPatientAggregate({
      patientId,
      req
    });
  }

  /**
   * MEDICAL HISTORY — delegates to patientClinical.service
   */
  async updateMedicalHistory({
    organizationId,
    actorId,
    patientId,
    medicalHistory,
    notes,
    ipAddress,
    req
  }) {
    const regionCode = _resolveRegion(req);
    const auditContext = _resolveAuditContext(req);
    await patientClinicalService.updateMedicalHistory({
      regionCode,
      actorId,
      patientId,
      medicalHistory,
      notes,
      ipAddress,
      auditContext,
      req // Phase F.6
    });
    return this.getPatientAggregate({
      patientId,
      req
    });
  }

  /**
   * POLICY MANAGEMENT — delegates to patientPolicy.service
   */
  async updatePolicy({
    organizationId,
    actorId,
    data,
    ipAddress,
    expectedVersion,
    isInternalEvent = false,
    req
  }) {
    const regionCode = _resolveRegion(req);
    const auditContext = _resolveAuditContext(req);
    return patientPolicyService.updatePolicy({
      regionCode,
      actorId,
      data,
      ipAddress,
      expectedVersion,
      isInternalEvent,
      auditContext,
      req // Phase F.6
    });
  }

  /**
   * DOCTOR ASSIGNMENT — delegates to patientLifecycle.service
   */
  async assignDoctor({
    organizationId,
    actorId,
    patientId,
    doctorId,
    ipAddress,
    req
  }) {
    const regionCode = _resolveRegion(req);
    const auditContext = _resolveAuditContext(req);
    return patientLifecycleService.assignDoctor({
      regionCode,
      actorId,
      patientId,
      doctorId,
      ipAddress,
      auditContext,
      req // Phase F.6
    });
  }

  /**
   * AGGREGATE PROJECTION (Immutability Layer)
   * Phase 3: Now uses connection-bound models for multi-tenant routing.
   * Read-only — no transactions needed.
   */
  async getPatientAggregate({
    patientId,
    req
  }) {
    const {
      Patient,
      ClinicalRecord,
      PatientPolicy
    } = _getModels(req);
    const patient = await Patient.findById(patientId).lean();
    if (!patient) throw new Error("Patient not found.");
    const clinical = await ClinicalRecord.findOne({
      patientId
    }).lean();
    const policy = await PatientPolicy.findOne({}).lean();

    // High-level Risk Flags & Alerts
    const alerts = [];
    const riskFlags = [];
    if (clinical?.medicalHistory?.allergies?.length > 0) alerts.push({
      type: "MEDICAL_ALLERGY",
      data: clinical.medicalHistory.allergies
    });
    if (clinical?.medicalHistory?.chronicConditions?.length > 0) alerts.push({
      type: "CHRONIC_CONDITION",
      data: clinical.medicalHistory.chronicConditions
    });
    if (clinical?.medicalHistory?.smoking) riskFlags.push("SMOKER");
    if (clinical?.medicalHistory?.pregnancy) riskFlags.push("PREGNANT");

    // ── Profile Completion Calculation ────────────────────────────────
    const COMPLETION_FIELDS = [{
      key: "dateOfBirth",
      label: "Date of Birth",
      weight: 15,
      check: v => !!v
    }, {
      key: "gender",
      label: "Gender",
      weight: 10,
      check: v => !!v
    }, {
      key: "address",
      label: "Address",
      weight: 10,
      check: v => !!v
    }, {
      key: "email",
      label: "Email",
      weight: 10,
      check: v => !!v
    }, {
      key: "nationality",
      label: "Nationality",
      weight: 10,
      check: v => !!v
    }, {
      key: "nationalId",
      label: "National ID",
      weight: 10,
      check: v => !!v
    }, {
      key: "emergencyContact",
      label: "Emergency Contact",
      weight: 20,
      check: v => !!(v?.name && v?.phone)
    }, {
      key: "insurance",
      label: "Insurance",
      weight: 15,
      check: v => !!v?.provider
    }];
    const totalWeight = COMPLETION_FIELDS.reduce((sum, f) => sum + f.weight, 0);
    let earnedWeight = 0;
    const missingFields = [];
    for (const field of COMPLETION_FIELDS) {
      if (field.check(patient[field.key])) {
        earnedWeight += field.weight;
      } else {
        missingFields.push(field.label);
      }
    }
    const profileCompletion = Math.round(earnedWeight / totalWeight * 100);
    return {
      _id: patient._id,
      // Phase 9: DTO-driven core projection — displayName from SSOT
      core: buildPatientCoreDTO(patient),
      profileCompletion: {
        percentage: profileCompletion,
        missingFields,
        isComplete: profileCompletion >= 80,
        isIncomplete: patient.status === "incomplete" || profileCompletion < 80
      },
      branches: {
        primary: patient.primaryBranchId,
        allowed: patient.allowedBranchIds
      },
      clinical: {
        medicalHistory: clinical?.medicalHistory || {},
        notes: clinical?.notes || [],
        alerts,
        riskFlags
      },
      financial: {
        balance: 0,
        currency: "USD",
        lastInvoice: null
      },
      governance: {
        policy: policy || {},
        isSuspended: !patient.isActive,
        deletedAt: patient.deletedAt
      },
      metadata: {
        createdAt: patient.createdAt,
        updatedAt: patient.updatedAt
      }
    };
  }
}

// ── Private Helpers ─────────────────────────────────────────────────────────

/**
 * Resolve regionCode from request context.
 * Priority: req.regionCode → req.tokenRegionCode → req.context.regionCode → "MEA"
 */
function _resolveRegion(req) {
  if (!req) return "MEA"; // fallback for internal calls

  return req.regionCode || req.tokenRegionCode || req.context?.regionCode || "MEA";
}

/**
 * Extract audit context from request for event payloads.
 */
function _resolveAuditContext(req) {
  if (!req) return {};
  return {
    regionCode: req.regionCode || req.tokenRegionCode,
    branchId: req.activeBranchId || "000000000000000000000000"
  };
}
module.exports = new PatientAggregateService();