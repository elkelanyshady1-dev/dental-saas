/**
 * transformers.js — Bridge DTO Sanitization Layer
 * @bridge-layer (LOCKED)
 * @rls-bridge-passthrough — Pure data transformation. ZERO DB access.
 *
 * Maps platform-internal Mongoose documents to contract-compliant DTOs.
 * ALL bridge responses MUST pass through these transformers before
 * being returned to org-facing endpoints.
 *
 * INVARIANTS:
 *   ✔ Input is a Mongoose document or plain object — output is a plain DTO
 *   ✔ Platform-internal fields are NEVER exposed (provider IDs, internal notes, etc.)
 *   ✔ organizationId is NEVER included in output (caller already knows it)
 *   ✔ All ObjectId values are coerced to strings
 *   ✔ All dates are coerced to ISO strings
 *   ✔ Safe for null/undefined inputs (returns null)
 *
 * USAGE:
 *   const { mapSubscription, mapInvoice, mapTicket, mapTicketDetail } = require("./transformers");
 *   return mapSubscription(contractDoc); // → DTO
 *
 * PLANE: Bridge layer (services/bridges/)
 *
 * @module services/bridges/utils/transformers
 */

"use strict";

// ─── Helper: safe date coercion ──────────────────────────────────────────────
function toISO(val) {
    if (!val) return null;
    return val instanceof Date ? val.toISOString() : new Date(val).toISOString();
}

// ─── Helper: safe ObjectId → string ──────────────────────────────────────────
function toStr(val) {
    if (!val) return null;
    return typeof val === "string" ? val : val.toString();
}

// ══════════════════════════════════════════════════════════════════════════════
// BILLING TRANSFORMERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Maps an OrgContract + PlanVersion to the subscription DTO.
 * Shapes match OrgBillingContract.getActiveSubscription.output
 *
 * @param {Object} contract - OrgContract document (with planVersion populated or merged)
 * @param {Object} [planVersion] - PlanVersion document (optional if fields already on contract)
 * @returns {Object|null} Sanitized subscription DTO
 */
function mapSubscription(contract, planVersion = null) {
    if (!contract) return null;

    const plan = planVersion || contract.planVersion || {};

    return Object.freeze({
        planName:           plan.name || contract.planName || "Unknown Plan",
        planTier:           plan.tier || contract.planTier || "standard",
        status:             contract.contractStatus || contract.status || "unknown",
        billingInterval:    contract.billingInterval || "monthly",
        currentPeriodStart: toISO(contract.currentPeriodStart),
        currentPeriodEnd:   toISO(contract.currentPeriodEnd),
        trialEnd:           toISO(contract.trialEnd),
        features:           Array.isArray(contract.features) ? [...contract.features] : [],
        currency:           (contract.currency || "USD").toUpperCase(),
        amountMinor:        contract.lockedPriceMinor || contract.amountMinor || 0,
    });
}

/**
 * Maps a PlatformInvoice document to the invoice DTO.
 * Shapes match OrgBillingContract.getInvoiceHistory.output
 *
 * @param {Object} invoice - PlatformInvoice document
 * @returns {Object|null} Sanitized invoice DTO
 */
function mapInvoice(invoice) {
    if (!invoice) return null;

    return Object.freeze({
        id:          toStr(invoice._id),
        invoiceNo:   invoice.invoiceNo || invoice.invoiceNumber || null,
        amount:      invoice.totalAmountMinor || invoice.amount || 0,
        currency:    (invoice.currency || "USD").toUpperCase(),
        status:      invoice.status || "unknown",
        periodStart: toISO(invoice.periodStart),
        periodEnd:   toISO(invoice.periodEnd),
        createdAt:   toISO(invoice.createdAt),
        pdfUrl:      invoice.pdfUrl || null,
    });
}

/**
 * Maps an entitlement/usage item to the quota DTO.
 * Shapes match OrgBillingContract.getUsageQuotas.output
 *
 * @param {Object} item - Usage/entitlement item
 * @returns {Object|null} Sanitized quota DTO
 */
function mapUsageQuota(item) {
    if (!item) return null;

    return Object.freeze({
        feature:     item.feature || item.key || "unknown",
        displayName: item.displayName || item.label || item.feature || "Unknown",
        used:        typeof item.used === "number" ? item.used : 0,
        limit:       typeof item.limit === "number" ? item.limit : -1,
        unit:        item.unit || "units",
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// SUPPORT TRANSFORMERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Maps a Ticket document to the list-item DTO.
 * Shapes match OrgSupportContract.listTickets.output
 *
 * @param {Object} ticket - Ticket Mongoose document
 * @returns {Object|null} Sanitized ticket list-item DTO
 */
function mapTicket(ticket) {
    if (!ticket) return null;

    return Object.freeze({
        id:        toStr(ticket._id),
        subject:   ticket.subject || "",
        category:  ticket.category || "technical",
        status:    ticket.status || "OPEN",
        priority:  ticket.priority || "MEDIUM",
        createdAt: toISO(ticket.createdAt),
        updatedAt: toISO(ticket.updatedAt),
    });
}

/**
 * Maps a Ticket document to the detail DTO (with filtered conversation).
 * Shapes match OrgSupportContract.getTicketDetail.output
 *
 * FILTERS:
 *   - internalNotes are NEVER included
 *   - System-actorType messages are stripped
 *   - actorId is NOT exposed (replaced with authorRole)
 *
 * @param {Object} ticket - Ticket Mongoose document (with conversationThread)
 * @returns {Object|null} Sanitized ticket detail DTO
 */
function mapTicketDetail(ticket) {
    if (!ticket) return null;

    // Filter conversationThread: exclude system messages, map actorType → authorRole
    const comments = (ticket.conversationThread || [])
        .filter(c => c.actorType !== "system")
        .map(c => Object.freeze({
            authorRole: c.actorType === "platform_user" ? "support_agent" : "org_user",
            message:    c.message || "",
            createdAt:  toISO(c.createdAt),
        }));

    return Object.freeze({
        id:          toStr(ticket._id),
        subject:     ticket.subject || "",
        description: ticket.description || "",
        category:    ticket.category || "technical",
        status:      ticket.status || "OPEN",
        priority:    ticket.priority || "MEDIUM",
        slaDeadline: toISO(ticket.slaDeadline),
        createdAt:   toISO(ticket.createdAt),
        updatedAt:   toISO(ticket.updatedAt),
        comments,
    });
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    // Billing
    mapSubscription,
    mapInvoice,
    mapUsageQuota,
    // Support
    mapTicket,
    mapTicketDetail,
    // Helpers (for custom transformers)
    toISO,
    toStr,
};
