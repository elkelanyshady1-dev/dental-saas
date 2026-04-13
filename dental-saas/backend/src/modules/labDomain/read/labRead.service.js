/**
 * read/labRead.service.js — Lab Domain Read Service (CQRS Read Side)
 *
 * AUDIT-004 Remediation: Moved from services/ to read/ for canonical DDD structure.
 * All reads use req.dbConnection (per-org isolation).
 *
 * PLANE: Org only. Per-org DB.
 */

// Re-exports canonical location — actual implementation in services/labRead.service.js
// until callers are updated. This module IS the new canonical import path.

module.exports = require("../services/labRead.service");
