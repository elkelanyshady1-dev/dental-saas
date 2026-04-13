/**
 * billingModelValidator.js
 * v22.3 — Billing Engine Startup Self-Check
 *
 * PURPOSE:
 * Validates ALL billing models at application bootstrap — before any request
 * is served. If any model is malformed, missing, or lacks required Mongoose
 * methods, the process exits immediately with a clear error.
 *
 * This prevents the server from starting in a state where billing operations
 * silently fail at request time with "X is not a function" errors.
 *
 * CALLED BY: platform/billing/index.js (after module loading, before scheduler)
 *
 * RULE:
 *   ❗ App MUST fail fast if any billing model is invalid.
 *   ❗ No lazy discovery of model defects at runtime.
 *
 * PLANE: Platform
 */

"use strict";

const logger = require("@utils/logger");
const requireModel = require("./requireModel");

/**
 * BILLING_MODEL_REGISTRY
 *
 * Maps each billing model to the methods it MUST expose.
 * If any model fails, the server MUST NOT start.
 */
const BILLING_MODEL_REGISTRY = [
    {
        path: "../models/BillingLedger.model",
        requiredMethods: ["findOne", "create", "find"],
        label: "BillingLedger",
    },
    {
        path: "../models/PlatformInvoice.model",
        requiredMethods: ["findById", "findOne", "create", "find"],
        label: "PlatformInvoice",
    },
    {
        path: "../models/OrgContract.model",
        requiredMethods: ["findById", "findOne", "create", "find", "findByIdAndUpdate"],
        label: "OrgContract",
    },
    {
        path: "../models/PlanVersion.model",
        requiredMethods: ["findById", "find"],
        label: "PlanVersion",
    },
    {
        path: "../models/PaymentAttempt.model",
        requiredMethods: ["findById", "create"],
        label: "PaymentAttempt",
    },
];

/**
 * validateBillingModels
 *
 * Runs the full model resolution + method check for every model in the registry.
 * Returns { valid, failures } — caller decides whether to exit or warn.
 *
 * @returns {{ valid: boolean, failures: { label: string, error: string }[] }}
 */
function validateBillingModels() {
    const failures = [];

    for (const { path, requiredMethods, label } of BILLING_MODEL_REGISTRY) {
        try {
            requireModel(path, requiredMethods);
        } catch (err) {
            failures.push({ label, error: err.message });
        }
    }

    if (failures.length > 0) {
        for (const { label, error } of failures) {
            logger.error(
                { event: "BILLING_MODEL_VALIDATION_FAILED", model: label, error },
                `[BillingModelValidator] ❌ ${label}: ${error}`
            );
        }
    } else {
        logger.info(
            { event: "BILLING_MODELS_VALIDATED", count: BILLING_MODEL_REGISTRY.length },
            `[BillingModelValidator] ✓ All ${BILLING_MODEL_REGISTRY.length} billing models validated`
        );
    }

    return { valid: failures.length === 0, failures };
}

module.exports = { validateBillingModels, BILLING_MODEL_REGISTRY };
