// @per-org-transactional — Transactional orchestrator with explicit MongoDB sessions. All queries include organizationId + session.
// Phase 3.2 — Connection-aware model resolution via getModel. Sessions bound to req.dbConnection.
const mongoose = require("mongoose");
const PatientInvoiceDef = require("../models/PatientInvoice.model");
const PatientPaymentDef = require("../models/PatientPayment.model");
const PaymentAllocationDef = require("../models/PaymentAllocation.model");
const PatientWalletDef = require("../models/PatientWallet.model");
const FinancialLedgerDef = require("../models/FinancialLedger.model");
const AuditLogDef = require("@shared/models/AuditLog");
const BranchDef = require("@shared/models/Branch");
const PatientDef = require("../../../../organization/patient/models/patient.model"); // v32.0 academic guard
const getModel = require("@core/db/getModel");
const patientReadService = require("../../../patientDomain/read/patient.read.service");
const appointmentReadService = require("../../../appointmentDomain/read/appointment.read.service");
const {
  deriveInvoiceStatus
} = require("./invoiceStatus.service");
const eventBus = require("@core/eventBus");
const {
  FINANCIAL_SNAPSHOT_REQUESTED
} = require("@core/domainEvents");
const Money = require("@utils/money");
const {
  v4: uuidv4
} = require("uuid");
const journalService = require("../../services/journal.service");
const journalRetryService = require("../../resilience/journalRetry.service");
const financialCircuit = require("../../guards/financialCircuit.guard");
const outboxService = require("@core/outbox/outbox.service");
const logger = require("@utils/logger");

// ─── Connection-Aware Model Resolver (Phase 3.2) ────────────────────────────
function _getModel(connection, def) {
  return getModel(connection, def);
}
class FinancialOrchestrator {
  /**
   * createInvoice()
   * Implements strict multi-tenant invoice creation with diagnostic fee support.
   * Phase 3.2: req param REQUIRED — provides dbConnection for model resolution.
   */
  async createInvoice(params, req) {
    const {
      organizationId,
      branchId,
      patientId,
      treatments = [],
      charges = [],
      discount = 0,
      insuranceCovered = 0,
      tax = 0,
      regionCode,
      issuedByUserId,
      treatmentOperatorId,
      ipAddress
    } = params;
    if (!regionCode) throw new Error("Geopolitical Sovereignty Violation: regionCode required for invoice creation.");
    const connection = req.dbConnection;
    const currency = "AED"; // Default for patient domain in this region

    // Circuit breaker: block invoice writes if AR/revenue integrity is compromised
    await financialCircuit.checkFinancialHealth(organizationId, financialCircuit.OPERATIONS.INVOICE_WRITE);
    const session = await connection.startSession();
    session.startTransaction();
    try {
      // STEP 1 — Validate Core Entities
      const patientExists = await patientReadService.existsPatient({
        rls: {}
      }, patientId, session);
      if (!patientExists) throw new Error("Patient not found or unauthorized.");

      // STEP 1.5 — ACADEMIC HARD STOP (v32.0)
      // Academic patients are NEVER billable. This is a zero-bypass gate.
      const PatientModel = _getModel(connection, PatientDef);
      const patient = await PatientModel.findById(patientId).select("careType").session(session).lean();
      if (patient?.careType === "ACADEMIC") {
        const err = new Error("Academic patients cannot be billed. Billing is disabled for ACADEMIC care type.");
        err.statusCode = 403;
        err.code = "ACADEMIC_NO_BILLING";
        throw err;
      }

      // Resolve models on org connection
      const PatientInvoice = _getModel(connection, PatientInvoiceDef);
      const FinancialLedger = _getModel(connection, FinancialLedgerDef);
      const AuditLog = _getModel(connection, AuditLogDef);
      const Branch = _getModel(connection, BranchDef);

      // @per-org-transactional — session-bound ACID, connection-scoped
      const branch = await Branch.findOne({
        _id: branchId
      }).session(session);
      if (!branch) throw new Error("Branch not found or unauthorized.");

      // STEP 2 — Validate treatments[]
      if (treatments.length === 0 && charges.length === 0) {
        throw new Error("Invoice must contain at least one treatment or charge.");
      }
      const treatmentIds = new Set();
      let treatmentSubtotalMoney = Money.fromMinor(0, currency);
      for (const t of treatments) {
        if (!t.treatmentId || treatmentIds.has(t.treatmentId.toString())) {
          throw new Error(`Duplicate or missing treatmentId: ${t.treatmentId}`);
        }
        treatmentIds.add(t.treatmentId.toString());
        if (t.unitPrice <= 0 || t.quantity <= 0) {
          throw new Error("Invalid treatment price or quantity.");
        }

        // Server-side recalculation (v8-2 Money API)
        const unitPriceMoney = Money.fromDecimal(t.unitPrice, currency);
        const subtotalMoney = unitPriceMoney.multiply(t.quantity);
        t.subtotal = subtotalMoney.toDecimal();
        t.subtotalMinor = subtotalMoney.amountMinor;
        treatmentSubtotalMoney = treatmentSubtotalMoney.add(subtotalMoney);
      }

      // STEP 3 — Validate charges[] & Diagnostic Fee logic
      let chargesSubtotalMoney = Money.fromMinor(0, currency);
      const diagnosticAppointments = new Set();
      for (const c of charges) {
        if (!c.type || c.amount <= 0) {
          throw new Error("Invalid charge type or amount.");
        }
        if (c.type === "DIAGNOSTIC_FEE") {
          if (!c.appointmentId) throw new Error("Diagnostic fee requires an appointmentId.");
          if (diagnosticAppointments.has(c.appointmentId.toString())) {
            throw new Error("Duplicate diagnostic fee for same appointment in this invoice.");
          }
          diagnosticAppointments.add(c.appointmentId.toString());

          // STEP 3-1 — Validate Appointment
          const apptExists = await appointmentReadService.existsAppointment({
            rls: {}
          }, c.appointmentId, patientId, session);
          if (!apptExists) throw new Error("Invalid appointment for diagnostic fee.");

          // @per-org-transactional — session-bound uniqueness check
          const existingDiagnostic = await PatientInvoice.findOne({
            status: {
              $ne: "voided"
            },
            "charges.type": "DIAGNOSTIC_FEE",
            "charges.appointmentId": c.appointmentId
          }).session(session);
          if (existingDiagnostic) {
            throw new Error("Diagnostic fee already charged for this appointment.");
          }
        }
        const chargeMoney = Money.fromDecimal(c.amount, currency);
        c.amountMinor = chargeMoney.amountMinor;
        chargesSubtotalMoney = chargesSubtotalMoney.add(chargeMoney);
      }

      // STEP 4 — Calculate Final Totals (v8-2 Precision)
      const subtotalMoney = treatmentSubtotalMoney.add(chargesSubtotalMoney);
      const discountMoney = Money.fromDecimal(discount, currency);
      const insuranceMoney = Money.fromDecimal(insuranceCovered, currency);
      const taxMoney = Money.fromDecimal(tax, currency);
      let totalMoney = subtotalMoney.subtract(discountMoney).subtract(insuranceMoney).add(taxMoney);

      // Floor-at-Zero guard
      if (totalMoney.amountMinor < 0) totalMoney = Money.fromMinor(0, currency);

      // STEP 5 — Create Invoice Document
      const invoice = new PatientInvoice({
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
        status: "issued",
        regionCode,
        treatmentOperatorId,
        issuedByUserId
      });

      // Runtime Guard
      if (!Number.isInteger(invoice.totalAmountMinor)) {
        throw new Error("Precision violation: totalAmountMinor is not an integer");
      }
      await invoice.save({
        session
      });

      // STEP 6 — FinancialLedger Entries (v8-2 Minor — operational log)
      await FinancialLedger.create([{
        patientId,
        type: "INVOICE_CREATED",
        amount: totalMoney.toDecimal(),
        amountMinor: totalMoney.amountMinor,
        currency,
        referenceId: invoice._id,
        branchId,
        performedByUserId: issuedByUserId
      }], {
        session
      });

      // Additional ledger if diagnostic fee exists
      const diagCharge = charges.find(c => c.type === "DIAGNOSTIC_FEE");
      if (diagCharge) {
        const diagMoney = Money.fromDecimal(diagCharge.amount, currency);
        await FinancialLedger.create([{
          patientId,
          type: "DIAGNOSTIC_FEE_CHARGED",
          amount: diagMoney.toDecimal(),
          amountMinor: diagMoney.amountMinor,
          currency,
          referenceId: invoice._id,
          branchId,
          performedByUserId: issuedByUserId
        }], {
          session
        });
      }

      // STEP 6b — Double-Entry Journal (Phase C)
      // DR Accounts Receivable / CR Revenue
      try {
        await journalService.recordInvoiceEntry(invoice, session, connection);
      } catch (journalErr) {
        // Enqueue for automatic retry instead of silent loss
        logger.error({
          err: journalErr,
          invoiceId: invoice._id
        }, "[Orchestrator] Journal entry failed for invoice — queued for retry");
        await journalRetryService.enqueue({
          referenceType: "invoice",
          referenceId: invoice._id,
          payload: {
            invoiceId: invoice._id
          },
          error: journalErr
        });
      }

      // STEP 7 — Audit Log
      await AuditLog.create([{
        actorId: issuedByUserId,
        userId: issuedByUserId,
        action: "INVOICE_CREATED",
        entity: "INVOICE",
        entityId: invoice._id,
        metadata: {
          patientId,
          totalAmount: totalMoney.toDecimal(),
          totalAmountMinor: totalMoney.amountMinor,
          treatmentCount: treatments.length,
          chargeCount: charges.length,
          hasDiagnostic: !!diagCharge
        },
        ipAddress: ipAddress || "system",
        success: true
      }], {
        session
      });

      // STEP 8 — Enqueue event in outbox (INSIDE transaction)
      const eventPayload = {
        eventId: uuidv4(),
        patientId,
        branchId,
        type: "INVOICE_CREATED",
        amount: totalMoney.toDecimal(),
        amountMinor: totalMoney.amountMinor,
        currency,
        revenueCategory: charges.some(c => c.type === "DIAGNOSTIC_FEE") ? "DIAGNOSTIC" : "TREATMENT",
        timestamp: new Date()
      };
      await outboxService.enqueue({
        eventType: FINANCIAL_SNAPSHOT_REQUESTED,
        aggregateType: "invoice",
        aggregateId: invoice._id,
        payload: eventPayload
      }, session);
      await session.commitTransaction();

      // Immediate emit for low-latency (outbox worker is backup guarantee)
      eventBus.emit(FINANCIAL_SNAPSHOT_REQUESTED, eventPayload);
      return invoice;
    } catch (error) {
      if (session.inAtomicity()) await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * recordPayment()
   * Phase 3.2: req param REQUIRED — provides dbConnection for model resolution.
   */
  async recordPayment(params, req) {
    const {
      organizationId,
      branchId,
      patientId,
      invoiceId,
      amount,
      paymentMethod,
      collectedByUserId,
      expectedVersion,
      isInternalEvent
    } = params;
    const currency = "AED";
    if (invoiceId && !isInternalEvent && expectedVersion === undefined) {
      throw new Error("expectedVersion is required for user-driven mutations.");
    }

    // Circuit breaker: block payment writes if cash integrity is compromised
    await financialCircuit.checkFinancialHealth(organizationId, financialCircuit.OPERATIONS.PAYMENT_WRITE);
    const connection = req.dbConnection;
    const session = await connection.startSession();
    session.startTransaction();
    try {
      const PatientInvoice = _getModel(connection, PatientInvoiceDef);
      const PatientPayment = _getModel(connection, PatientPaymentDef);
      const PaymentAllocation = _getModel(connection, PaymentAllocationDef);
      const FinancialLedger = _getModel(connection, FinancialLedgerDef);

      // STEP 0 — ACADEMIC HARD STOP for payments (v32.0)
      const PatientModel = _getModel(connection, PatientDef);
      const patient = await PatientModel.findById(patientId).select("careType").session(session).lean();
      if (patient?.careType === "ACADEMIC") {
        const err = new Error("Academic patients cannot receive payment records. Billing is disabled for ACADEMIC care type.");
        err.statusCode = 403;
        err.code = "ACADEMIC_NO_BILLING";
        throw err;
      }
      const amountMoney = Money.fromDecimal(amount, currency);
      const payment = new PatientPayment({
        branchId,
        patientId,
        invoiceId,
        amount: amountMoney.toDecimal(),
        amountMinor: amountMoney.amountMinor,
        currency,
        paymentMethod,
        collectedByUserId,
        status: "active"
      });
      await payment.save({
        session
      });
      if (invoiceId) {
        const allocation = new PaymentAllocation({
          paymentId: payment._id,
          invoiceId,
          allocatedAmount: amountMoney.toDecimal(),
          allocatedAmountMinor: amountMoney.amountMinor
        });
        await allocation.save({
          session
        });

        // Update Invoice Status (OAV Enforced)
        // @per-org-transactional — session-bound invoice lookup for status derivation
        const invoice = await PatientInvoice.findOne({
          _id: invoiceId
        }).session(session);
        const newStatus = await deriveInvoiceStatus(invoiceId, organizationId, session, connection);
        const targetVersion = isInternalEvent ? invoice.version : expectedVersion;

        // @per-org-transactional — OAV-enforced status update
        const result = await PatientInvoice.updateOne({
          _id: invoice._id,
          version: targetVersion
        }, {
          $set: {
            status: newStatus
          },
          $inc: {
            version: 1
          }
        }, {
          session
        });
        if (result.modifiedCount === 0) {
          const VersionConflictError = require("@root/errors/VersionConflictError");
          throw new VersionConflictError("Aggregate version mismatch");
        }
      }
      await FinancialLedger.create([{
        patientId,
        type: "PAYMENT_RECORDED",
        amount: amountMoney.toDecimal(),
        amountMinor: amountMoney.amountMinor,
        currency,
        referenceId: payment._id,
        branchId,
        performedByUserId: collectedByUserId
      }], {
        session
      });

      // Double-Entry Journal (Phase C)
      // DR Cash / CR Accounts Receivable
      try {
        await journalService.recordPaymentEntry(payment, session, connection);
      } catch (journalErr) {
        logger.error({
          err: journalErr,
          paymentId: payment._id
        }, "[Orchestrator] Journal entry failed for payment — queued for retry");
        await journalRetryService.enqueue({
          referenceType: "payment",
          referenceId: payment._id,
          payload: {
            paymentId: payment._id
          },
          error: journalErr
        });
      }

      // Enqueue event in outbox (INSIDE transaction)
      const paymentEventPayload = {
        eventId: uuidv4(),
        patientId,
        branchId,
        type: "PAYMENT_RECORDED",
        amount: amountMoney.toDecimal(),
        amountMinor: amountMoney.amountMinor,
        currency,
        timestamp: new Date()
      };
      await outboxService.enqueue({
        eventType: FINANCIAL_SNAPSHOT_REQUESTED,
        aggregateType: "payment",
        aggregateId: payment._id,
        payload: paymentEventPayload
      }, session);
      await session.commitTransaction();

      // Immediate emit for low-latency
      eventBus.emit(FINANCIAL_SNAPSHOT_REQUESTED, paymentEventPayload);
      return payment;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * voidInvoice()
   * Phase 3.2: req param REQUIRED — provides dbConnection for model resolution.
   */
  async voidInvoice(params, req) {
    const {
      organizationId,
      invoiceId,
      voidedByUserId,
      voidedReason,
      expectedVersion,
      isInternalEvent
    } = params;
    if (!isInternalEvent && expectedVersion === undefined) {
      throw new Error("expectedVersion is required for user-driven mutations.");
    }

    // Circuit breaker: block void writes if AR integrity is compromised
    await financialCircuit.checkFinancialHealth(organizationId, financialCircuit.OPERATIONS.INVOICE_WRITE);
    const connection = req.dbConnection;
    const session = await connection.startSession();
    session.startTransaction();
    try {
      const PatientInvoice = _getModel(connection, PatientInvoiceDef);
      const FinancialLedger = _getModel(connection, FinancialLedgerDef);

      // @per-org-transactional — session-bound invoice lookup for void
      const invoice = await PatientInvoice.findOne({
        _id: invoiceId
      }).session(session);
      if (!invoice) throw new Error("Invoice not found.");
      if (invoice.status === "voided") throw new Error("Invoice already voided.");
      const targetVersion = isInternalEvent ? invoice.version : expectedVersion;
      const currency = invoice.currency || "AED";

      // @per-org-transactional — OAV-enforced void status update
      const result = await PatientInvoice.updateOne({
        _id: invoice._id,
        version: targetVersion
      }, {
        $set: {
          status: "voided",
          voidedByUserId,
          voidedReason,
          voidedAt: new Date()
        },
        $inc: {
          version: 1
        }
      }, {
        session
      });
      if (result.modifiedCount === 0) {
        const VersionConflictError = require("@root/errors/VersionConflictError");
        throw new VersionConflictError("Aggregate version mismatch");
      }
      const totalMoney = Money.fromDecimal(invoice.totalAmount, currency);
      await FinancialLedger.create([{
        patientId: invoice.patientId,
        type: "INVOICE_VOIDED",
        amount: totalMoney.toDecimal(),
        amountMinor: totalMoney.amountMinor,
        currency,
        referenceId: invoice._id,
        branchId: invoice.branchId,
        performedByUserId: voidedByUserId
      }], {
        session
      });

      // Double-Entry Journal (Phase C)
      // DR Revenue / CR Accounts Receivable (reverse recognition)
      try {
        await journalService.recordVoidEntry(invoice, voidedByUserId, session, connection);
      } catch (journalErr) {
        logger.error({
          err: journalErr,
          invoiceId: invoice._id
        }, "[Orchestrator] Journal entry failed for void — queued for retry");
        await journalRetryService.enqueue({
          referenceType: "void",
          referenceId: invoice._id,
          payload: {
            invoiceId: invoice._id,
            voidedByUserId
          },
          error: journalErr
        });
      }

      // Enqueue event in outbox (INSIDE transaction)
      const voidEventPayload = {
        eventId: uuidv4(),
        patientId: invoice.patientId,
        branchId: invoice.branchId,
        type: "INVOICE_VOIDED",
        amount: totalMoney.toDecimal(),
        amountMinor: totalMoney.amountMinor,
        currency: currency,
        revenueCategory: invoice.charges.some(c => c.type === "DIAGNOSTIC_FEE") ? "DIAGNOSTIC" : "TREATMENT",
        timestamp: new Date()
      };
      await outboxService.enqueue({
        eventType: FINANCIAL_SNAPSHOT_REQUESTED,
        aggregateType: "void",
        aggregateId: invoice._id,
        payload: voidEventPayload
      }, session);
      await session.commitTransaction();

      // Immediate emit for low-latency
      eventBus.emit(FINANCIAL_SNAPSHOT_REQUESTED, voidEventPayload);
      return invoice;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * creditWallet()
   */
  async creditWallet(params) {
    const {
      patientId,
      amount,
      branchId,
      performedByUserId
    } = params;
    const currency = "AED";
    const amountMoney = Money.fromDecimal(amount, currency);
    this._emitEvent({
      patientId,
      branchId,
      type: "WALLET_CREDITED",
      amount: amountMoney.toDecimal(),
      amountMinor: amountMoney.amountMinor,
      currency,
      timestamp: new Date()
    });
  }

  /**
   * _emitEvent()
   * Centralized event emission with UUID
   */
  _emitEvent(payload) {
    const event = {
      eventId: uuidv4(),
      ...payload
    };
    eventBus.emit(FINANCIAL_SNAPSHOT_REQUESTED, event);
  }
}
module.exports = new FinancialOrchestrator();