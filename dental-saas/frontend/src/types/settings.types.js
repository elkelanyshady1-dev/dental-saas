/**
 * settings.types.js — DTO Shape Definitions for Settings Hub
 *
 * Documents the expected DTO shapes returned by the backend bridge layer.
 * These shapes map 1:1 to the contracts in:
 *   - specs/contracts/bridges/orgBilling.contract.js
 *   - specs/contracts/bridges/orgSupport.contract.js
 *
 * RULES:
 *   ✔ Frontend MUST trust these DTO shapes ONLY
 *   ✔ No fallback to raw backend fields (_id, __v, organizationId)
 *   ✔ All IDs are strings (not ObjectIds)
 *   ✔ All dates are ISO strings (not Date objects)
 *
 * USAGE:
 *   // JSDoc type annotation:
 *   /** @type {SubscriptionDTO} *​/
 *   const subscription = useSubscription().data;
 *
 * NOTE: These are JSDoc-only types (plain JS project, not TypeScript).
 * They provide IDE autocomplete and act as the frontend–backend contract.
 *
 * @module types/settings.types
 */

// ═══════════════════════════════════════════════════════════════════════════════
// BILLING DTOs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} SubscriptionDTO
 * @property {string}   planName           — Display name of the plan
 * @property {string}   planTier           — Plan tier (e.g., "standard", "premium")
 * @property {string}   status             — Contract status ("active", "canceled", "grace", etc.)
 * @property {string}   billingInterval    — "monthly" | "yearly" | "biennial"
 * @property {string|null} currentPeriodStart — ISO date
 * @property {string|null} currentPeriodEnd   — ISO date
 * @property {string|null} trialEnd           — ISO date (null if no trial)
 * @property {string[]} features           — List of enabled feature keys
 * @property {string}   currency           — ISO currency code (e.g., "USD")
 * @property {number}   amountMinor        — Price in minor units (cents)
 */

/**
 * @typedef {Object} InvoiceDTO
 * @property {string}      id         — Invoice ID (string, not ObjectId)
 * @property {string|null} invoiceNo  — Human-readable invoice number (e.g., "INV-202503-00042")
 * @property {number}      amount     — Total amount in minor units
 * @property {string}      currency   — ISO currency code
 * @property {string}      status     — "draft" | "open" | "paid" | "void" | "uncollectible"
 * @property {string|null} periodStart — ISO date
 * @property {string|null} periodEnd   — ISO date
 * @property {string}      createdAt  — ISO date
 * @property {string|null} pdfUrl     — Download URL (null if not available)
 */

/**
 * @typedef {Object} UsageQuotaDTO
 * @property {string} feature     — Feature key (e.g., "users", "storage")
 * @property {string} displayName — Human-readable label
 * @property {number} used        — Current usage count
 * @property {number} limit       — Quota limit (-1 = unlimited)
 * @property {string} unit        — Unit label ("users", "MB", etc.)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SUPPORT DTOs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} TicketDTO
 * @property {string} id        — Ticket ID (string, not ObjectId)
 * @property {string} subject   — Ticket subject line
 * @property {string} category  — "technical" | "billing" | "security" | "subscription" | "dispute"
 * @property {string} status    — "OPEN" | "IN_REVIEW" | "RESOLVED" | "CLOSED" | etc.
 * @property {string} priority  — "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
 * @property {string} createdAt — ISO date
 * @property {string} updatedAt — ISO date
 */

/**
 * @typedef {Object} TicketCommentDTO
 * @property {string} authorRole — "org_user" | "support_agent" (never raw actorType)
 * @property {string} message    — Comment text
 * @property {string} createdAt  — ISO date
 */

/**
 * @typedef {Object} TicketDetailDTO
 * @property {string}             id          — Ticket ID
 * @property {string}             subject     — Ticket subject line
 * @property {string}             description — Full description
 * @property {string}             category    — Ticket category
 * @property {string}             status      — Ticket status
 * @property {string}             priority    — Ticket priority
 * @property {string|null}        slaDeadline — ISO date (null for some roles per FLS)
 * @property {string}             createdAt   — ISO date
 * @property {string}             updatedAt   — ISO date
 * @property {TicketCommentDTO[]} comments    — Filtered conversation thread (no system messages)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// FORBIDDEN FIELDS (documentation)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The following fields MUST NEVER appear in any Settings Hub DTO.
 * The backend enforceDTO() wrapper guarantees this at runtime.
 * If any of these appear in API responses, it is a SECURITY BUG.
 *
 * FORBIDDEN: _id, __v, organizationId, providerSubscriptionId,
 *            providerPaymentId, internalNotes, actorId, salesOwnerId,
 *            createdBy, metadata
 */
