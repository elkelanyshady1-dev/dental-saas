/**
 * accessGateway.js — RBAC + Entitlement Access Gateway (Phase 8.1)
 *
 * Factory function returning middleware array:
 *   [entitlementGuard?, rbacGuard?]
 *
 * Phase 8.1: RBAC guard now uses authorize() (throw pattern) from req.context
 * instead of the legacy requireOrgPermission middleware.
 *
 * PLANE: Organization only.
 */

"use strict";

const requireEntitlement = require("../requireEntitlement");
const { authorize } = require("../../utils/authorize");

/**
 * accessGateway(permission, featureKey)
 *
 * Returns a middleware array: [entitlementGuard?, rbacGuard?]
 * Either argument can be null/undefined to skip that layer.
 *
 * @param {string|null} permission   - RBAC permission key, e.g. "patients.read"
 * @param {string|null} [featureKey] - Entitlement module key, e.g. "patients"
 * @returns {import("express").RequestHandler[]}
 */
function accessGateway(permission, featureKey) {
    const chain = [];

    // Layer 1: Entitlement (plan gate — runs before RBAC)
    if (featureKey) {
        chain.push(requireEntitlement(featureKey));
    }

    // Layer 2: RBAC via authorize() throw pattern
    if (permission) {
        chain.push((req, res, next) => {
            authorize(req, permission);
            next();
        });
    }

    // Guard: at least one guard must be specified
    if (chain.length === 0) {
        throw new Error(
            "[accessGateway] At least one of permission or featureKey must be provided."
        );
    }

    return chain;
}

module.exports = accessGateway;
