/**
 * index.js
 * Platform Billing Domain — Startup Module Validator + Scheduler Bootstrap
 *
 * Eagerly requires all billing controllers and critical services at startup.
 * If any module fails to resolve, a structured error is logged and the process
 * exits immediately to prevent silent MODULE_NOT_FOUND failures at request time.
 *
 * Also starts the ContractActivationScheduler after all modules are validated.
 *
 * PLANE: Platform
 */

"use strict";

const logger = require("@utils/logger");

const BILLING_MODULES = [
    // ── Controllers ──────────────────────────────────────────────────────────
    "./controllers/billingControl.controller",
    "./controllers/billingDashboard.controller",
    "./controllers/billingInvoiceList.controller",
    "./controllers/billingLedger.controller",
    "./controllers/billingPayments.controller",
    "./controllers/billingRevenue.controller",
    "./controllers/billingTimeline.controller",
    "./controllers/billingIntegrity.controller",
    "./controllers/contractsDashboard.controller",
    "./controllers/orgEntitlement.controller",
    "./controllers/platformContract.controller",
    "./controllers/platformInvoice.controller",
    "./controllers/refund.controller",

    // ── Core Services ────────────────────────────────────────────────────────
    "./services/billingControlService",
    "./services/invoiceEngine.service",
    "./services/financeExport.service",
    "./services/invoicePdf.service",
    "./services/contractEngine.service",
    "./services/contractActivation.service",
    "./services/contractActivationScheduler.service",
    "./services/billingReconciliation.service",

    // ── Models ───────────────────────────────────────────────────────────────
    "./models/BillingControl.model",
    "./models/BillingLedger.model",
    "./models/BillingAuditLog.model",
    "./models/PlatformInvoice.model",
    "./models/OrgContract.model",
    "./models/PaymentAttempt.model",

    // ── Routes ───────────────────────────────────────────────────────────────
    "./routes/platformFinance.routes",
];

let allLoaded = true;
const failures = [];

for (const modulePath of BILLING_MODULES) {
    try {
        require(modulePath);
    } catch (err) {
        failures.push({ modulePath, error: err.message, code: err.code });
        allLoaded = false;
    }
}

if (!allLoaded) {
    for (const { modulePath, error, code } of failures) {
        logger.error(
            { event: "BILLING_MODULE_LOAD_FAILED", modulePath, error, code },
            `[BillingDomain] STARTUP FAILURE: Cannot load ${modulePath} — ${code}: ${error}`
        );
    }
    // Hard exit to surface the problem immediately rather than letting the
    // server start in a broken state where billing is silently non-functional.
    process.exit(1);
}

logger.info(
    { event: "BILLING_DOMAIN_LOADED", modules: BILLING_MODULES.length },
    `[BillingDomain] All ${BILLING_MODULES.length} billing modules loaded successfully`
);

// ─── v22.3: Model Resolution Self-Check ─────────────────────────────────────
// Validates that all billing models resolve to valid Mongoose Model instances
// with required methods BEFORE any request is served.
// If any model is broken, the server exits — no silent runtime failures.
const { validateBillingModels } = require("./utils/billingModelValidator");
const modelValidation = validateBillingModels();
if (!modelValidation.valid) {
    logger.error(
        { event: "BILLING_MODEL_VALIDATION_FATAL", failures: modelValidation.failures },
        `[BillingDomain] FATAL: ${modelValidation.failures.length} billing model(s) failed validation — exiting`
    );
    process.exit(1);
}

// ─── Start ContractActivationScheduler ────────────────────────────────────────
// Skip in test environments to avoid interfering with CI/unit tests.
if (process.env.NODE_ENV !== "test") {
    try {
        const { startContractActivationScheduler } = require("./services/contractActivationScheduler.service");
        startContractActivationScheduler({
            intervalMs: parseInt(process.env.CONTRACT_SCHEDULER_INTERVAL_MS || "300000", 10),  // 5 min default
            runImmediately: process.env.CONTRACT_SCHEDULER_RUN_IMMEDIATELY === "true"
        });
    } catch (err) {
        // Scheduler startup failure is non-fatal — log and continue.
        // Scheduled contracts will be activated on next backend restart.
        logger.error(
            { err },
            "[BillingDomain] ContractActivationScheduler failed to start (non-fatal) — scheduled activations will not run"
        );
    }
}

module.exports = { loaded: true };
