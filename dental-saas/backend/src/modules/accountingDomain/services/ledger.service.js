/**
 * accountingDomain/services/ledger.service.js — Ledger Facade
 *
 * Phase 31 requires callers reach the ledger via
 * `@modules/accountingDomain/services/ledger.service`. The journal itself
 * is owned by billingDomain (that's where JournalEntry lives and every
 * mutation writes its entries from), so the authoritative implementation
 * stays there. This file is the accountingDomain-side entry point — a
 * pure re-export so imports from either domain resolve to one code path
 * and there's no risk of two divergent ledger implementations.
 *
 * ❌ Do not add logic here. If a new ledger operation is needed, add it to
 *    `billingDomain/services/ledger.service.js` and it'll surface here
 *    automatically.
 *
 * PLANE: Org only (read-only facade).
 */

"use strict";

module.exports = require("@modules/billingDomain/services/ledger.service");
