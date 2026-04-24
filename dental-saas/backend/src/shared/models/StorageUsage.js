/**
 * StorageUsage.js — Shared Re-export Proxy
 *
 * The canonical model lives in core/storage/models/.
 * This proxy allows platform-plane projections to import it
 * via the shared layer without violating plane isolation.
 */
"use strict";

const { makeLazyPlatformModel } = require("@core/db/lazyModelProxy");
const StorageUsageDef = require("../../core/storage/models/organizationStorageUsage.model");
module.exports = makeLazyPlatformModel(StorageUsageDef);
