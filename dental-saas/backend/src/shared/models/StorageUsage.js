/**
 * StorageUsage.js — Shared Re-export Proxy
 *
 * The canonical model lives in core/storage/models/.
 * This proxy allows platform-plane projections to import it
 * via the shared layer without violating plane isolation.
 */
module.exports = require("../../core/storage/models/organizationStorageUsage.model").default;
