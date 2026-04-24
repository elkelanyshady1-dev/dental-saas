/**
 * shared/security/index.js — Phase 5 Tenant Isolation Runtime Layer
 *
 * Barrel export for all tenant isolation enforcement primitives.
 */

"use strict";

const { resolveTenantContext, resolveActorType, tenantResolverMiddleware } = require("./tenantResolver");
const { scopeToTenant } = require("./tenantModelWrapper");
const tenantGuardPlugin = require("./tenantGuard.plugin");
const { enforceTenantIsolation, enforcePortalTenantIsolation } = require("./enforceTenantIsolation");
const { responseNormalizer, stripFields } = require("./responseNormalizer");
const { emitTenantEvent } = require("./emitTenantEvent");

module.exports = {
    // Tenant context resolution
    resolveTenantContext,
    resolveActorType,
    tenantResolverMiddleware,

    // Platform-DB model scoping
    scopeToTenant,

    // Mongoose plugin for platform-DB models
    tenantGuardPlugin,

    // Middleware assertions
    enforceTenantIsolation,
    enforcePortalTenantIsolation,

    // Response sanitization
    responseNormalizer,
    stripFields,

    // Event helpers
    emitTenantEvent,
};
