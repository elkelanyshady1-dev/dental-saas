/**
 * quotation.orchestrator.service.js — Patient Quotation Write Operations
 *
 * Orchestrates the full quotation lifecycle:
 *   create → send → accept → convert (→ PatientInvoice)
 *             └→ reject
 *             └→ expire
 *
 * No ledger/journal entries — quotations are non-financial until conversion.
 * Conversion atomically creates a PatientInvoice via financialOrchestrator.createInvoice().
 *
 * PLANE: Organization (per-org DB)
 */

"use strict";

const PatientQuotationDef = require("../models/PatientQuotation.model");
const BillingSettingsDef = require("../models/ClinicBillingSettings.model");
const PatientDef = require("../../../../organization/patient/models/patient.model");
const AuditLogDef = require("@shared/models/AuditLog");
const BranchDef = require("@shared/models/Branch");
const getModel = require("@core/db/getModel");
const Money = require("@utils/money");
const {
  v4: uuidv4
} = require("uuid");
const outboxService = require("@core/outbox/outbox.service");
const eventBus = require("@core/eventBus");
const Events = require("@core/domainEvents");
const billingSettingsService = require("./clinicBillingSettings.service");
const financialOrchestrator = require("./ledger.orchestrator.service");
const logger = require("@utils/logger");
const {
  TERMINAL_STATUSES
} = PatientQuotationDef;

// ─── Helpers ────────────────────────────────────────────────────────────────

function _getModel(connection, def) {
  return getModel(connection, def);
}
async function _resolveCurrency(req) {
  if (req._resolvedCurrency) return req._resolvedCurrency;
  const settings = await billingSettingsService.getOrCreate(req);
  req._resolvedCurrency = settings.defaultCurrency || "AED";
  return req._resolvedCurrency;
}

/**
 * Lazy expiry check — if quotation is "sent" and past expiresAt, expire it.
 * Called before any state transition as belt-and-suspenders.
 */
function _isExpired(doc) {
  return doc.status === "sent" && doc.expiresAt && new Date(doc.expiresAt) < new Date();
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

class QuotationOrchestrator {
  /**
   * createQuotation(params, req)
   * Validates patient + branch, calculates totals via Money API,
   * generates quotation number atomically, creates doc + AuditLog in transaction.
   */
  async createQuotation(params, req) {
    const {
      patientId,
      branchId,
      treatments = [],
      charges = [],
      discount = 0,
      insuranceCovered = 0,
      tax = 0,
      regionCode,
      notes,
      treatmentOperatorId,
      expiresAt
    } = params;
    const connection = req.dbConnection;
    const organizationId = req.context.organizationId;
    const actorId = req.context.userId;
    const currency = await _resolveCurrency(req);
    const session = await connection.startSession();
    session.startTransaction();
    try {
      // STEP 1 — Validate patient exists + not academic
      const PatientModel = _getModel(connection, PatientDef);
      const patient = await PatientModel.findById(patientId).select("careType").session(session).lean();
      if (!patient) {
        const err = new Error("Patient not found or unauthorized.");
        err.status = 404;
        throw err;
      }
      if (patient.careType === "ACADEMIC") {
        const err = new Error("Academic patients cannot be quoted. Billing is disabled for ACADEMIC care type.");
        err.statusCode = 403;
        err.code = "ACADEMIC_NO_BILLING";
        throw err;
      }

      // STEP 2 — Validate branch
      const Branch = _getModel(connection, BranchDef);
      const branch = await Branch.findOne({
        _id: branchId
      }).session(session);
      if (!branch) {
        const err = new Error("Branch not found or unauthorized.");
        err.status = 404;
        throw err;
      }

      // STEP 3 — Must have at least one item
      if (treatments.length === 0 && charges.length === 0) {
        throw new Error("Quotation must contain at least one treatment or charge.");
      }

      // STEP 4 — Calculate totals via Money API
      let treatmentSubtotalMoney = Money.fromMinor(0, currency);
      for (const t of treatments) {
        if (!t.treatmentId && !t.procedureName) {
          throw new Error("Treatment must have either treatmentId or procedureName.");
        }
        if (t.unitPrice <= 0 || t.quantity <= 0) {
          throw new Error("Invalid treatment price or quantity.");
        }
        const unitPriceMoney = Money.fromDecimal(t.unitPrice, currency);
        const subtotalMoney = unitPriceMoney.multiply(t.quantity);
        t.subtotal = subtotalMoney.toDecimal();
        t.subtotalMinor = subtotalMoney.amountMinor;
        treatmentSubtotalMoney = treatmentSubtotalMoney.add(subtotalMoney);
      }
      let chargesSubtotalMoney = Money.fromMinor(0, currency);
      for (const c of charges) {
        if (!c.type || c.amount <= 0) {
          throw new Error("Invalid charge type or amount.");
        }
        const chargeMoney = Money.fromDecimal(c.amount, currency);
        c.amountMinor = chargeMoney.amountMinor;
        chargesSubtotalMoney = chargesSubtotalMoney.add(chargeMoney);
      }
      const subtotalMoney = treatmentSubtotalMoney.add(chargesSubtotalMoney);
      const discountMoney = Money.fromDecimal(discount, currency);
      const insuranceMoney = Money.fromDecimal(insuranceCovered, currency);
      const taxMoney = Money.fromDecimal(tax, currency);
      let totalMoney = subtotalMoney.subtract(discountMoney).subtract(insuranceMoney).add(taxMoney);
      if (totalMoney.amountMinor < 0) totalMoney = Money.fromMinor(0, currency);

      // STEP 5 — Generate quotation number (atomic $inc)
      const BillingSettings = _getModel(connection, BillingSettingsDef);
      const settingsDoc = await BillingSettings.findOneAndUpdate({
        singletonKey: "org-billing-settings"
      }, {
        $inc: {
          "quotationNumberingScheme.nextSequence": 1
        }
      }, {
        new: true,
        session
      });
      let quotationNumber;
      if (settingsDoc?.quotationNumberingScheme) {
        const {
          prefix = "QUO",
          padding = 6,
          nextSequence = 1
        } = settingsDoc.quotationNumberingScheme;
        quotationNumber = `${prefix}-${String(nextSequence).padStart(padding, "0")}`;
      }

      // STEP 6 — Resolve expiry date
      let resolvedExpiresAt = null;
      if (expiresAt) {
        resolvedExpiresAt = new Date(expiresAt);
      } else {
        const defaultDays = settingsDoc?.quotationDefaults?.defaultExpiryDays ?? 30;
        resolvedExpiresAt = new Date();
        resolvedExpiresAt.setDate(resolvedExpiresAt.getDate() + defaultDays);
      }

      // STEP 7 — Create quotation document
      const PatientQuotation = _getModel(connection, PatientQuotationDef);
      const quotation = new PatientQuotation({
        branchId,
        patientId,
        treatments,
        charges,
        subtotal: subtotalMoney.toDecimal(),
        subtotalMinor: subtotalMoney.amountMinor,
        totalAmount: totalMoney.toDecimal(),
        totalAmountMinor: totalMoney.amountMinor,
        discount: discountMoney.toDecimal(),
        discountMinor: discountMoney.amountMinor,
        tax: taxMoney.toDecimal(),
        taxMinor: taxMoney.amountMinor,
        insuranceCovered: insuranceMoney.toDecimal(),
        insuranceCoveredMinor: insuranceMoney.amountMinor,
        currency,
        quotationNumber,
        status: "draft",
        expiresAt: resolvedExpiresAt,
        createdByUserId: actorId,
        treatmentOperatorId,
        notes,
        regionCode,
        version: 0
      });
      await quotation.save({
        session
      });

      // STEP 8 — Audit log
      const AuditLog = _getModel(connection, AuditLogDef);
      await AuditLog.create([{
        actorId,
        userId: actorId,
        action: "QUOTATION_CREATED",
        entity: "QUOTATION",
        entityId: quotation._id,
        metadata: {
          patientId,
          totalAmount: totalMoney.toDecimal(),
          treatmentCount: treatments.length,
          chargeCount: charges.length
        },
        ipAddress: req.ip || "system",
        success: true
      }], {
        session
      });

      // STEP 9 — Outbox event (inside transaction)
      const eventPayload = {
        eventId: uuidv4(),
        quotationId: quotation._id.toString(),
        patientId: patientId.toString(),
        actorId: actorId.toString(),
        timestamp: new Date()
      };
      await outboxService.enqueue({
        eventType: Events.QUOTATION_CREATED,
        aggregateType: "quotation",
        aggregateId: quotation._id,
        payload: eventPayload
      }, session);
      await session.commitTransaction();
      eventBus.emit(Events.QUOTATION_CREATED, eventPayload);
      return quotation.toObject();
    } catch (error) {
      if (session.inAtomicity()) await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * updateQuotation(id, params, req)
   * OAV-enforced partial update. Only draft/sent status allowed.
   */
  async updateQuotation(id, params, req) {
    const {
      expectedVersion,
      ...updates
    } = params;
    const connection = req.dbConnection;
    const organizationId = req.context.organizationId;
    const currency = await _resolveCurrency(req);
    const PatientQuotation = _getModel(connection, PatientQuotationDef);
    const existing = await PatientQuotation.findById(id).lean();
    if (!existing) {
      const err = new Error("Quotation not found.");
      err.status = 404;
      throw err;
    }
    if (!["draft", "sent"].includes(existing.status)) {
      const err = new Error(`Cannot update quotation in "${existing.status}" status.`);
      err.status = 422;
      throw err;
    }

    // Recalculate totals if line items changed
    const $set = {};
    if (updates.treatments) {
      let treatmentSubtotalMoney = Money.fromMinor(0, currency);
      for (const t of updates.treatments) {
        if (!t.treatmentId && !t.procedureName) {
          throw new Error("Treatment must have either treatmentId or procedureName.");
        }
        const unitPriceMoney = Money.fromDecimal(t.unitPrice, currency);
        const subtotalMoney = unitPriceMoney.multiply(t.quantity);
        t.subtotal = subtotalMoney.toDecimal();
        t.subtotalMinor = subtotalMoney.amountMinor;
        treatmentSubtotalMoney = treatmentSubtotalMoney.add(subtotalMoney);
      }
      $set.treatments = updates.treatments;
    }
    if (updates.charges) {
      let chargesSubtotalMoney = Money.fromMinor(0, currency);
      for (const c of updates.charges) {
        const chargeMoney = Money.fromDecimal(c.amount, currency);
        c.amountMinor = chargeMoney.amountMinor;
        chargesSubtotalMoney = chargesSubtotalMoney.add(chargeMoney);
      }
      $set.charges = updates.charges;
    }

    // Recalculate totals from updated or existing line items
    const treatments = updates.treatments || existing.treatments;
    const charges = updates.charges || existing.charges;
    const discount = updates.discount ?? existing.discount;
    const insuranceCovered = updates.insuranceCovered ?? existing.insuranceCovered;
    const tax = updates.tax ?? existing.tax;
    let treatmentSubtotalMoney = Money.fromMinor(0, currency);
    for (const t of treatments) {
      treatmentSubtotalMoney = treatmentSubtotalMoney.add(Money.fromDecimal(t.subtotal || t.unitPrice * (t.quantity || 1), currency));
    }
    let chargesSubtotalMoney = Money.fromMinor(0, currency);
    for (const c of charges) {
      chargesSubtotalMoney = chargesSubtotalMoney.add(Money.fromDecimal(c.amount, currency));
    }
    const subtotalMoney = treatmentSubtotalMoney.add(chargesSubtotalMoney);
    const discountMoney = Money.fromDecimal(discount, currency);
    const insuranceMoney = Money.fromDecimal(insuranceCovered, currency);
    const taxMoney = Money.fromDecimal(tax, currency);
    let totalMoney = subtotalMoney.subtract(discountMoney).subtract(insuranceMoney).add(taxMoney);
    if (totalMoney.amountMinor < 0) totalMoney = Money.fromMinor(0, currency);
    $set.subtotal = subtotalMoney.toDecimal();
    $set.subtotalMinor = subtotalMoney.amountMinor;
    $set.totalAmount = totalMoney.toDecimal();
    $set.totalAmountMinor = totalMoney.amountMinor;
    $set.discount = discountMoney.toDecimal();
    $set.discountMinor = discountMoney.amountMinor;
    $set.tax = taxMoney.toDecimal();
    $set.taxMinor = taxMoney.amountMinor;
    $set.insuranceCovered = insuranceMoney.toDecimal();
    $set.insuranceCoveredMinor = insuranceMoney.amountMinor;

    // Pass through simple scalar updates
    if (updates.notes !== undefined) $set.notes = updates.notes;
    if (updates.treatmentOperatorId !== undefined) $set.treatmentOperatorId = updates.treatmentOperatorId;
    if (updates.expiresAt !== undefined) $set.expiresAt = updates.expiresAt ? new Date(updates.expiresAt) : null;
    const updated = await PatientQuotation.findOneAndUpdate({
      _id: id,
      version: expectedVersion
    }, {
      $set,
      $inc: {
        version: 1
      }
    }, {
      new: true
    }).lean();
    if (!updated) {
      const current = await PatientQuotation.findById(id).select("version").lean();
      const VersionConflictError = require("@root/errors/VersionConflictError");
      throw new VersionConflictError("Quotation version mismatch", current?.version);
    }
    return updated;
  }

  /**
   * sendQuotation(id, req)
   * draft → sent
   */
  async sendQuotation(id, req) {
    const connection = req.dbConnection;
    const organizationId = req.context.organizationId;
    const actorId = req.context.userId;
    const PatientQuotation = _getModel(connection, PatientQuotationDef);
    const updated = await PatientQuotation.findOneAndUpdate({
      _id: id,
      status: "draft"
    }, {
      $set: {
        status: "sent"
      },
      $inc: {
        version: 1
      }
    }, {
      new: true
    }).lean();
    if (!updated) {
      const existing = await PatientQuotation.findById(id).lean();
      if (!existing) {
        const err = new Error("Quotation not found.");
        err.status = 404;
        throw err;
      }
      const err = new Error(`Cannot send quotation in "${existing.status}" status. Only draft quotations can be sent.`);
      err.status = 422;
      throw err;
    }
    const eventPayload = {
      eventId: uuidv4(),
      quotationId: updated._id.toString(),
      patientId: updated.patientId.toString(),
      actorId: actorId.toString(),
      timestamp: new Date()
    };
    eventBus.emit(Events.QUOTATION_SENT, eventPayload);
    return updated;
  }

  /**
   * acceptQuotation(id, acceptanceInfo, req)
   * sent → accepted
   * acceptanceInfo: { acceptedByType: "patient_portal"|"staff_verbal" }
   */
  async acceptQuotation(id, acceptanceInfo, req) {
    const connection = req.dbConnection;
    const organizationId = req.context.organizationId;
    const actorId = req.context.userId || req.context.patientId;
    const PatientQuotation = _getModel(connection, PatientQuotationDef);

    // Load to check lazy expiry
    const existing = await PatientQuotation.findById(id).lean();
    if (!existing) {
      const err = new Error("Quotation not found.");
      err.status = 404;
      throw err;
    }
    if (_isExpired(existing)) {
      await this.expireQuotation(id, req);
      const err = new Error("Quotation has expired and cannot be accepted.");
      err.status = 422;
      throw err;
    }
    if (existing.status !== "sent") {
      const err = new Error(`Cannot accept quotation in "${existing.status}" status. Only sent quotations can be accepted.`);
      err.status = 422;
      throw err;
    }
    const isPatientPortal = acceptanceInfo.acceptedByType === "patient_portal";
    const updated = await PatientQuotation.findOneAndUpdate({
      _id: id,
      status: "sent"
    }, {
      $set: {
        status: "accepted",
        acceptedAt: new Date(),
        acceptedByType: acceptanceInfo.acceptedByType,
        acceptedByUserId: actorId,
        acceptedByPatient: isPatientPortal
      },
      $inc: {
        version: 1
      }
    }, {
      new: true
    }).lean();
    if (!updated) {
      const err = new Error("Failed to accept quotation — concurrent modification.");
      err.status = 409;
      throw err;
    }
    const eventPayload = {
      eventId: uuidv4(),
      quotationId: updated._id.toString(),
      patientId: updated.patientId.toString(),
      acceptedByType: acceptanceInfo.acceptedByType,
      timestamp: new Date()
    };
    eventBus.emit(Events.QUOTATION_ACCEPTED, eventPayload);
    return updated;
  }

  /**
   * rejectQuotation(id, reason, req)
   * sent|draft → rejected
   */
  async rejectQuotation(id, reason, req) {
    const connection = req.dbConnection;
    const organizationId = req.context.organizationId;
    const actorId = req.context.userId;
    const PatientQuotation = _getModel(connection, PatientQuotationDef);
    const updated = await PatientQuotation.findOneAndUpdate({
      _id: id,
      status: {
        $in: ["draft", "sent"]
      }
    }, {
      $set: {
        status: "rejected",
        rejectedAt: new Date(),
        rejectedReason: reason
      },
      $inc: {
        version: 1
      }
    }, {
      new: true
    }).lean();
    if (!updated) {
      const existing = await PatientQuotation.findById(id).lean();
      if (!existing) {
        const err = new Error("Quotation not found.");
        err.status = 404;
        throw err;
      }
      const err = new Error(`Cannot reject quotation in "${existing.status}" status.`);
      err.status = 422;
      throw err;
    }
    const eventPayload = {
      eventId: uuidv4(),
      quotationId: updated._id.toString(),
      patientId: updated.patientId.toString(),
      reason,
      timestamp: new Date()
    };
    eventBus.emit(Events.QUOTATION_REJECTED, eventPayload);
    return updated;
  }

  /**
   * expireQuotation(id, req)
   * sent → expired (system-triggered or lazy check)
   */
  async expireQuotation(id, req) {
    const connection = req.dbConnection;
    const organizationId = req.context.organizationId;
    const PatientQuotation = _getModel(connection, PatientQuotationDef);
    const updated = await PatientQuotation.findOneAndUpdate({
      _id: id,
      status: "sent"
    }, {
      $set: {
        status: "expired"
      },
      $inc: {
        version: 1
      }
    }, {
      new: true
    }).lean();
    if (!updated) return null;
    const eventPayload = {
      eventId: uuidv4(),
      quotationId: updated._id.toString(),
      patientId: updated.patientId.toString(),
      timestamp: new Date()
    };
    eventBus.emit(Events.QUOTATION_EXPIRED, eventPayload);
    return updated;
  }

  /**
   * convertToInvoice(id, expectedVersion, req)
   * accepted → converted (creates real PatientInvoice atomically)
   *
   * All operations in a single MongoDB transaction:
   * 1. Load + validate quotation
   * 2. Call financialOrchestrator.createInvoice() with external session
   * 3. Update quotation status to "converted"
   * 4. Enqueue outbox event
   */
  async convertToInvoice(id, expectedVersion, req) {
    const connection = req.dbConnection;
    const organizationId = req.context.organizationId;
    const actorId = req.context.userId;
    const session = await connection.startSession();
    session.startTransaction();
    try {
      const PatientQuotation = _getModel(connection, PatientQuotationDef);
      const AuditLog = _getModel(connection, AuditLogDef);

      // STEP 1 — Load quotation within session
      const quotation = await PatientQuotation.findById(id).session(session);
      if (!quotation) {
        const err = new Error("Quotation not found.");
        err.status = 404;
        throw err;
      }

      // STEP 2 — Validate state
      if (quotation.version !== expectedVersion) {
        const VersionConflictError = require("@root/errors/VersionConflictError");
        throw new VersionConflictError("Quotation version mismatch", quotation.version);
      }
      if (_isExpired(quotation)) {
        quotation.status = "expired";
        await quotation.save({
          session
        });
        const err = new Error("Quotation has expired and cannot be converted.");
        err.status = 422;
        throw err;
      }
      if (quotation.status !== "accepted") {
        const err = new Error(`Cannot convert quotation in "${quotation.status}" status. Only accepted quotations can be converted.`);
        err.status = 422;
        throw err;
      }

      // STEP 3 — Extract invoice params from quotation
      const invoiceParams = {
        branchId: quotation.branchId,
        patientId: quotation.patientId,
        treatments: quotation.treatments.map(t => ({
          treatmentId: t.treatmentId,
          procedureName: t.procedureName,
          toothNumber: t.toothNumber,
          unitPrice: t.unitPrice,
          quantity: t.quantity
        })),
        charges: quotation.charges.map(c => ({
          type: c.type,
          description: c.description,
          amount: c.amount,
          appointmentId: c.appointmentId
        })),
        discount: quotation.discount,
        insuranceCovered: quotation.insuranceCovered,
        tax: quotation.tax,
        regionCode: quotation.regionCode,
        notes: quotation.notes,
        issuedByUserId: actorId,
        treatmentOperatorId: quotation.treatmentOperatorId,
        ipAddress: req.ip || "system"
      };

      // STEP 4 — Create invoice (uses our external session)
      const invoice = await financialOrchestrator.createInvoice(invoiceParams, req, {
        session
      });

      // STEP 5 — Update quotation to converted
      quotation.status = "converted";
      quotation.convertedAt = new Date();
      quotation.convertedInvoiceId = invoice._id;
      quotation.convertedByUserId = actorId;
      quotation.version += 1;

      // Bypass the pre-save terminal guard — we're transitioning TO terminal
      await PatientQuotation.updateOne({
        _id: id
      }, {
        $set: {
          status: "converted",
          convertedAt: quotation.convertedAt,
          convertedInvoiceId: invoice._id,
          convertedByUserId: actorId
        },
        $inc: {
          version: 1
        }
      }, {
        session
      });

      // STEP 6 — Audit log
      await AuditLog.create([{
        actorId,
        userId: actorId,
        action: "QUOTATION_CONVERTED",
        entity: "QUOTATION",
        entityId: quotation._id,
        metadata: {
          patientId: quotation.patientId,
          invoiceId: invoice._id,
          totalAmount: quotation.totalAmount
        },
        ipAddress: req.ip || "system",
        success: true
      }], {
        session
      });

      // STEP 7 — Outbox event
      const eventPayload = {
        eventId: uuidv4(),
        quotationId: quotation._id.toString(),
        patientId: quotation.patientId.toString(),
        invoiceId: invoice._id.toString(),
        actorId: actorId.toString(),
        timestamp: new Date()
      };
      await outboxService.enqueue({
        eventType: Events.QUOTATION_CONVERTED,
        aggregateType: "quotation",
        aggregateId: quotation._id,
        payload: eventPayload
      }, session);

      // STEP 8 — Commit
      await session.commitTransaction();
      eventBus.emit(Events.QUOTATION_CONVERTED, eventPayload);
      return {
        quotation: quotation.toObject ? quotation.toObject() : quotation,
        invoice
      };
    } catch (error) {
      if (session.inAtomicity()) await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}
module.exports = new QuotationOrchestrator();