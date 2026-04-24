/**
 * assertAuthorization.js — REMOVED (RBAC Audit P3)
 *
 * This file previously contained a blocking authorization safety net that was
 * never imported by any module. Its blocking logic has been merged into
 * the active firewall version at:
 *
 *   middleware/firewall/assertAuthorization.js
 *
 * That file now BLOCKS (returns 500) instead of logging only, for non-exempt routes.
 * This file is kept as a tombstone to prevent re-creation of a competing implementation.
 *
 * @see middleware/firewall/assertAuthorization.js
 */

"use strict";

throw new Error(
    "[assertAuthorization] This module was removed. " +
    "Use middleware/firewall/assertAuthorization.js instead."
);
