/**
 * appointment.service.js — Sovereign Appointment Domain Service
 * v3.0 — Phase 3.3 Strict Per-Org Isolation
 * Phase F.1 — RLS Activation (secureModel migration)
 *
 * This service is the EXCLUSIVE authority for mutating Appointment records.
 * All queries are RLS-scoped via secureModel when req is available.
 *
 * STRICT PER-ORG MODE (Phase 3.3):
 *   - No fallback to AppointmentDef.default
 *   - Event-driven paths resolve connections via connectionResolver
 *   - All code paths require an explicit connection
 *
 * Connection Binding:
 *   Request path  → getModel(req.dbConnection, AppointmentDef) + secureModel
 *   Event path    → resolveOrgConnection(organizationId) + getModel
 */

"use strict";

const mongoose = require("mongoose");
const AppointmentDef = require("../../../organization/appointment/models/appointment.model");
const getModel = require("../../../core/db/getModel");
const eventBus = require("../../../core/eventBus");
const {
  APPOINTMENT_CREATED,
  APPOINTMENT_UPDATED,
  APPOINTMENT_STATUS_CHANGED
} = require("../../../core/domainEvents");
const {
  resolveOrgConnection
} = require("../../../core/db/connectionResolver");
const logger = require("@utils/logger");

// ── Strict Per-Org Model Resolution (Phase 3.3) ────────────────────────────
/**
 * Returns a secureModel-wrapped Appointment bound to the request's connection.
 * @param {object} req - Express request (must have req.dbConnection + req.rls)
 */
function _getSecureAppointment(req) {
  if (!req?.dbConnection) {
    throw new Error("[AppointmentService] req.dbConnection is REQUIRED — per-org mode does not allow fallback");
  }
  const Appointment = getModel(req.dbConnection, AppointmentDef);
  return Appointment;
}

/**
 * Returns a raw Appointment model for event-driven/background paths.
 * Resolves connection from organizationId via connectionResolver.
 * @param {string} organizationId — required for connection resolution
 * @returns {import("mongoose").Model}
 */
async function _getAppointmentForOrg(organizationId) {
  if (!organizationId) {
    throw new Error("[AppointmentService] organizationId is REQUIRED for background model resolution");
  }
  const connection = await resolveOrgConnection(organizationId);
  return getModel(connection, AppointmentDef);
}
class AppointmentService {
  async createAppointment({
    organizationId,
    branchId,
    patientId,
    dentistId,
    chairId,
    startTime,
    endTime,
    duration,
    status,
    notes,
    actorId,
    externalRequestId,
    req
  }) {
    if (req) {
      const Appointment = _getSecureAppointment(req);

      // RLS-scoped create — organizationId injected automatically
      const appointment = await Appointment.create({
        branchId,
        patientId,
        dentistId,
        chairId,
        startTime,
        endTime,
        duration,
        status: status || "open",
        notes: notes || "",
        externalRequestId,
        statusHistory: [{
          status: status || "open",
          changedBy: actorId,
          changedAt: new Date()
        }]
      }, req);
      eventBus.emit(APPOINTMENT_CREATED, {
        appointmentId: appointment._id,
        patientId,
        branchId,
        // Phase 13: include branchId for calendar room targeting
        dentistId,
        date: startTime ? new Date(startTime).toISOString().split("T")[0] : null,
        actorId
      });
      return appointment;
    }

    // Event-driven path — resolve connection via connectionResolver
    if (!organizationId) {
      throw new Error("[AppointmentService] organizationId is REQUIRED for event-driven creation");
    }
    const Appointment = await _getAppointmentForOrg(organizationId);
    const appointment = new Appointment({
      branchId,
      patientId,
      dentistId,
      chairId,
      startTime,
      endTime,
      duration,
      status: status || "open",
      notes: notes || "",
      externalRequestId,
      statusHistory: [{
        status: status || "open",
        changedBy: actorId,
        changedAt: new Date()
      }]
    });
    await appointment.save();
    eventBus.emit(APPOINTMENT_CREATED, {
      appointmentId: appointment._id,
      patientId,
      actorId
    });
    return appointment;
  }
  async handleBookingApproval(payload) {
    const {
      requestId,
      organizationId
    } = payload;

    // 🛡️ Idempotency: Check if this request was already processed
    // NOTE: This is an internal event handler — connection resolved via connectionResolver.
    const Appointment = await _getAppointmentForOrg(organizationId);
    if (requestId) {
      // @per-org-domain-event — event handler, no req context, connection-bound
      const existing = await Appointment.findOne({
        externalRequestId: requestId
      });
      if (existing) {
        logger.info({
          requestId
        }, "[AppointmentService] Skipping — Appointment already exists for this requestId");
        return existing;
      }
    }
    return this.createAppointment({
      ...payload,
      status: "confirmed",
      externalRequestId: requestId
    });
  }
  async updateStatus({
    organizationId,
    appointmentId,
    status,
    actorId,
    expectedVersion,
    isInternalEvent = false,
    req
  }) {
    let appointment;
    if (req) {
      const Appointment = _getSecureAppointment(req);
      appointment = await Appointment.findOne({
        _id: appointmentId,
        isActive: true
      });
    } else {
      // Internal event — resolve connection via connectionResolver
      if (!organizationId) throw new Error("[AppointmentService] organizationId is REQUIRED for event-driven updateStatus");
      const Appointment = await _getAppointmentForOrg(organizationId);
      // @per-org-domain-event — event handler, no req context, connection-bound
      appointment = await Appointment.findOne({
        _id: appointmentId,
        isActive: true
      });
    }
    if (!appointment) throw new Error("Appointment not found");
    const VersionConflictError = require("../../../errors/VersionConflictError");
    if (!isInternalEvent && expectedVersion === undefined) {
      throw new VersionConflictError("expectedVersion required");
    }
    const targetVersion = isInternalEvent ? appointment.version : expectedVersion;
    const oldStatus = appointment.status;
    const updateDoc = {
      $set: {
        status
      },
      $push: {
        statusHistory: {
          status,
          changedBy: actorId,
          changedAt: new Date()
        }
      },
      $inc: {
        version: 1
      }
    };

    // Set status-specific timestamps
    if (status === "checked-in") updateDoc.$set.checkedInAt = new Date();
    if (status === "in-progress") updateDoc.$set.startedAt = new Date();
    if (status === "completed") updateDoc.$set.completedAt = new Date();
    if (status === "cancelled") updateDoc.$set.cancelledAt = new Date();
    let result;
    if (req) {
      const Appointment = _getSecureAppointment(req);
      result = await Appointment.updateOne({
        _id: appointmentId,
        version: targetVersion
      }, updateDoc);
    } else {
      // Internal event — resolve connection via connectionResolver
      const Appointment = await _getAppointmentForOrg(organizationId);
      // @per-org-domain-event — event handler, no req context, connection-bound
      result = await Appointment.updateOne({
        _id: appointmentId,
        version: targetVersion
      }, updateDoc);
    }
    if (result.modifiedCount === 0) {
      const VersionConflictError = require("../../../errors/VersionConflictError");
      throw new VersionConflictError("Aggregate version mismatch");
    }
    if (status === "completed") {
      eventBus.emit("appointment.completed", {
        appointmentId,
        patientId: appointment.patientId,
        doctorId: appointment.dentistId
      }, "appointment.service");
    }
    eventBus.emit(APPOINTMENT_STATUS_CHANGED, {
      appointmentId,
      status: status,
      // normalized (for socket schema field)
      previousStatus: oldStatus,
      // for status_changed schema
      branchId: appointment.branchId,
      actorId
    });

    // Also fire appointment.updated so calendar invalidates
    eventBus.emit(APPOINTMENT_UPDATED, {
      appointmentId,
      branchId: appointment.branchId
    });
    return appointment;
  }

  /**
   * Read Methods (Domain-Safe, RLS-scoped)
   */
  async getUpcomingAppointment({
    organizationId,
    patientId,
    req
  }) {
    if (req) {
      const Appointment = _getSecureAppointment(req);
      return Appointment.findOne({
        patientId,
        startTime: {
          $gte: new Date()
        },
        status: {
          $in: ["open", "confirmed"]
        }
      }, req).sort({
        startTime: 1
      }).lean();
    }
    // Cross-domain read — resolve connection via connectionResolver
    if (!organizationId) throw new Error("[AppointmentService] organizationId is REQUIRED for cross-domain read");
    const Appointment = await _getAppointmentForOrg(organizationId);
    // @per-org-domain-event — cross-domain read, no req context, connection-bound
    return Appointment.findOne({
      patientId,
      startTime: {
        $gte: new Date()
      },
      status: {
        $in: ["open", "confirmed"]
      }
    }).sort({
      startTime: 1
    }).lean();
  }
  async getPatientAppointments({
    organizationId,
    patientId,
    req
  }) {
    if (req) {
      const Appointment = _getSecureAppointment(req);
      return Appointment.find({
        patientId
      }).sort({
        startTime: -1
      }).lean();
    }
    // Cross-domain read — resolve connection via connectionResolver
    if (!organizationId) throw new Error("[AppointmentService] organizationId is REQUIRED for cross-domain read");
    const Appointment = await _getAppointmentForOrg(organizationId);
    // @per-org-domain-event — cross-domain read, no req context, connection-bound
    return Appointment.find({
      patientId
    }).sort({
      startTime: -1
    }).lean();
  }
}
module.exports = new AppointmentService();