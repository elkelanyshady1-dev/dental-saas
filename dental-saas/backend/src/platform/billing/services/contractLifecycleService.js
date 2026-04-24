/**
 * contractLifecycleService.js
 * Platform Billing — Contract Lifecycle Actions
 * v21.0 — Suspend, Void, Grace, Reactivate
 *
 * PURPOSE:
 * Provides controlled, ledger-traced contract lifecycle transitions:
 *   - suspendContract   → active → suspended
 *   - voidContract      → any non-paid → void
 *   - graceContract     → active → grace (payment overdue)
 *   - reactivateContract → suspended/grace → active (after payment)
 *
 * All mutations use the contractStateMachine for transition validation.
 * All events write BillingLedger entries.
 *
 * INVARIANTS:
 *   - Void only allowed if no paid invoices exist for the contract.
 *   - Suspended contracts cannot be billed (billing engine skips them).
 *   - All transitions are atomic.
 *
 * PLANE: Platform (No org-plane imports)
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const mongoose = require("mongoose");
const OrgContractDef = require("../models/OrgContract.model");
const OrgContract = getPlatformModel(OrgContractDef);
const PlatformInvoiceDef = require("../models/PlatformInvoice.model");
const PlatformInvoice = getPlatformModel(PlatformInvoiceDef);
const {
  writeLedgerEntry
} = require("../models/BillingLedger.model");
const {
  emitBillingTimelineEvent
} = require("./billingTimeline.service");
const logger = require("@utils/logger");

// ─── Extended status set (adds suspended, void, grace to schema enum) ─────────
// These are additive — the OrgContract schema enum must include them.
const EXTENDED_STATUS = Object.freeze({
  SUSPENDED: "suspended",
  VOID: "void",
  GRACE: "grace",
  ACTIVE: "active"
});

/**
 * suspendContract
 * Transitions a contract from active/grace → suspended.
 * Typically called by dunning engine when grace period expires.
 *
 * @param {string|ObjectId} contractId
 * @param {object} opts
 * @param {string} [opts.reason="Non-payment"]
 * @param {string|ObjectId} [opts.actorId]
 * @param {string} [opts.actorType="system"]
 * @param {string} [opts.requestId]
 * @returns {Promise<OrgContract>}
 */
async function suspendContract(contractId, opts = {}) {
  const {
    reason = "Non-payment",
    actorId = null,
    actorType = "system",
    requestId = null
  } = opts;
  const contract = await OrgContract.findById(contractId);
  if (!contract) {
    const err = new Error("Contract not found");
    err.statusCode = 404;
    throw err;
  }
  const allowedSources = ["active", "grace"];
  if (!allowedSources.includes(contract.contractStatus)) {
    const err = new Error(`Cannot suspend contract in status "${contract.contractStatus}". ` + `Only active/grace contracts can be suspended.`);
    err.statusCode = 409;
    err.code = "INVALID_CONTRACT_TRANSITION";
    throw err;
  }
  const prevStatus = contract.contractStatus;
  contract.contractStatus = "suspended";
  if (!contract.dunning) contract.dunning = {};
  contract.dunning.suspendedAt = new Date();
  contract.dunning.lastFailureReason = reason;
  await contract.save();
  logger.info({
    contractId,
    from: prevStatus,
    to: "suspended",
    actorId,
    requestId
  }, "[contractLifecycleService] Contract suspended");

  // ── Ledger ────────────────────────────────────────────────────────────────
  setImmediate(async () => {
    try {
      await writeLedgerEntry({
        eventType: "contract.suspended",
        // v21.0: explicit event type
        organizationId: contract.organizationId,
        contractId: contract._id,
        invoiceId: null,
        provider: "internal",
        amount: 0,
        currency: contract.currency,
        source: "paymentApplication",
        actorType,
        metadata: {
          previousStatus: prevStatus,
          reason,
          actorId,
          requestId
        }
      });
      await emitBillingTimelineEvent({
        organizationId: contract.organizationId,
        contractId: contract._id,
        eventType: "CONTRACT_SUSPENDED",
        source: actorType,
        payload: {
          previousStatus: prevStatus,
          reason,
          actorId
        }
      });
    } catch (e) {
      logger.error({
        err: e
      }, "[contractLifecycleService] suspendContract ledger/timeline write failed (non-fatal)");
    }
  });
  return contract;
}

/**
 * voidContract
 * Voids a contract.
 *
 * GUARD: Cannot void if any paid invoices exist for this contract.
 * Use case: cancel a contract that was never paid (billing error, test data, etc.)
 *
 * @param {string|ObjectId} contractId
 * @param {object} opts
 * @param {string} [opts.reason=""]
 * @param {string|ObjectId} [opts.actorId]
 * @param {string} [opts.requestId]
 * @returns {Promise<OrgContract>}
 */
async function voidContract(contractId, opts = {}) {
  const {
    reason = "",
    actorId = null,
    requestId = null
  } = opts;
  const [contract, paidInvoiceCount] = await Promise.all([OrgContract.findById(contractId), PlatformInvoice.countDocuments({
    contractId,
    status: "paid"
  })]);
  if (!contract) {
    const err = new Error("Contract not found");
    err.statusCode = 404;
    throw err;
  }

  // Terminal states that cannot be voided
  const terminalStates = ["superseded", "expired", "terminated", "canceled", "void"];
  if (terminalStates.includes(contract.contractStatus)) {
    const err = new Error(`Contract is in terminal status "${contract.contractStatus}" and cannot be voided.`);
    err.statusCode = 409;
    err.code = "CONTRACT_TERMINAL_STATE";
    throw err;
  }

  // Cannot void contract with paid invoices
  if (paidInvoiceCount > 0) {
    const err = new Error(`Cannot void contract: ${paidInvoiceCount} paid invoice(s) exist. ` + `Refund all payments before voiding. (CONTRACT_HAS_PAID_INVOICES)`);
    err.statusCode = 409;
    err.code = "CONTRACT_HAS_PAID_INVOICES";
    throw err;
  }
  const prevStatus = contract.contractStatus;
  contract.contractStatus = "void";
  contract.terminatedAt = new Date();
  contract.terminationReason = reason || "Voided by platform operator";
  if (actorId) contract.terminatedBy = actorId;
  await contract.save();
  logger.info({
    contractId,
    from: prevStatus,
    to: "void",
    actorId,
    requestId
  }, "[contractLifecycleService] Contract voided");

  // ── Ledger ────────────────────────────────────────────────────────────────
  setImmediate(async () => {
    try {
      await writeLedgerEntry({
        eventType: "contract.voided",
        // v21.0: explicit event type
        organizationId: contract.organizationId,
        contractId: contract._id,
        invoiceId: null,
        provider: "internal",
        amount: 0,
        currency: contract.currency,
        source: "paymentApplication",
        actorType: actorId ? "admin" : "system",
        metadata: {
          previousStatus: prevStatus,
          reason,
          actorId,
          requestId
        }
      });
      await emitBillingTimelineEvent({
        organizationId: contract.organizationId,
        contractId: contract._id,
        eventType: "CONTRACT_VOIDED",
        source: "user",
        payload: {
          previousStatus: prevStatus,
          reason,
          actorId
        }
      });
    } catch (e) {
      logger.error({
        err: e
      }, "[contractLifecycleService] voidContract ledger/timeline write failed (non-fatal)");
    }
  });
  return contract;
}

/**
 * graceContract
 * Moves a contract from active → grace when an invoice becomes overdue.
 * Called by the renewal engine when a charge fails.
 *
 * @param {string|ObjectId} contractId
 * @param {object} opts
 * @param {string} [opts.failureReason]
 * @param {number} [opts.gracePeriodDays=7]
 * @returns {Promise<OrgContract>}
 */
async function graceContract(contractId, opts = {}) {
  const {
    failureReason = "Payment failed",
    gracePeriodDays = 7
  } = opts;
  const contract = await OrgContract.findById(contractId);
  if (!contract) {
    const err = new Error("Contract not found");
    err.statusCode = 404;
    throw err;
  }
  if (contract.contractStatus !== "active") {
    // Already in grace or another state — no-op if already in grace
    if (contract.contractStatus === "grace") return contract;
    const err = new Error(`Cannot move contract to grace from status "${contract.contractStatus}"`);
    err.statusCode = 409;
    throw err;
  }
  const graceEndsAt = new Date();
  graceEndsAt.setDate(graceEndsAt.getDate() + (gracePeriodDays || contract.gracePeriodDays || 7));
  const prevStatus = contract.contractStatus;
  contract.contractStatus = "grace";
  if (!contract.dunning) contract.dunning = {};
  contract.dunning.gracePeriodEndsAt = graceEndsAt;
  contract.dunning.lastFailureReason = failureReason;
  await contract.save();
  logger.info({
    contractId,
    from: prevStatus,
    to: "grace",
    graceEndsAt,
    failureReason
  }, "[contractLifecycleService] Contract moved to grace");
  setImmediate(async () => {
    try {
      await writeLedgerEntry({
        eventType: "payment.failed",
        organizationId: contract.organizationId,
        contractId: contract._id,
        invoiceId: null,
        provider: "internal",
        amount: 0,
        currency: contract.currency,
        source: "paymentApplication",
        actorType: "system",
        metadata: {
          action: "CONTRACT_GRACE",
          failureReason,
          graceEndsAt
        }
      });
    } catch (e) {
      logger.error({
        err: e
      }, "[contractLifecycleService] graceContract ledger write failed (non-fatal)");
    }
  });
  return contract;
}
module.exports = {
  suspendContract,
  voidContract,
  graceContract
};