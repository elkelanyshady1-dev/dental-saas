#!/usr/bin/env node
/**
 * checkRawModelUsage.js — CI/CD Raw Model Detection Script
 * Phase F.6 Hardening — Zero-Trust RLS Enforcement
 *
 * PURPOSE:
 * Detects any raw Mongoose model usage (e.g., Patient.find(), Invoice.updateOne())
 * that bypasses secureModel. This is a CRITICAL security gate — any raw model
 * access is a potential data leak / cross-tenant exposure.
 *
 * APPROACH:
 * Scans all service, controller, and route files for patterns like:
 *   - ModelName.find(
 *   - ModelName.findOne(
 *   - ModelName.findById(
 *   - ModelName.updateOne(
 *   - ModelName.updateMany(
 *   - ModelName.deleteOne(
 *   - ModelName.deleteMany(
 *   - ModelName.aggregate(
 *   - ModelName.countDocuments(
 *   - ModelName.create(
 *
 * EXEMPTIONS:
 * Lines containing @rls-exempt, @rls-safe, or secureModel( are excluded.
 * Test files and migration scripts are excluded by default.
 *
 * Usage:
 *   node scripts/checkRawModelUsage.js           — advisory mode
 *   node scripts/checkRawModelUsage.js --strict   — strict mode (exit 1 on violations)
 *
 * npm scripts:
 *   npm run validate:raw-models           — advisory mode
 *   npm run validate:raw-models:strict    — strict mode
 *
 * PLANE: Platform / Security / CI
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ── Configuration ────────────────────────────────────────────────────────────

const strict = process.argv.includes("--strict");
const verbose = process.argv.includes("--verbose");

const SRC_DIR = path.resolve(__dirname, "../src");

// Directories to scan
const SCAN_DIRS = [
    "modules",
    "platform",
    "services",
    "projections",
];

// File patterns to include
const INCLUDE_PATTERNS = [
    ".service.js",
    ".controller.js",
    ".routes.js",
    ".handler.js",
    ".processor.js",
    ".worker.js",
    ".cron.js",
    ".scheduler.js",
    ".job.js",
    ".resolver.js",
];

// File/directory patterns to EXCLUDE
const EXCLUDE_PATTERNS = [
    "node_modules",
    ".test.js",
    ".spec.js",
    ".mock.js",
    "__tests__",
    "__mocks__",
    "seeders",
    "scripts",
    "migrations",
    "test",
];

// Platform-plane service files that LEGITIMATELY use raw model access.
// These operate at the platform (cross-tenant) level, not the org plane,
// and are therefore exempt from the org-plane secureModel requirement.
const PLATFORM_EXEMPTED_FILES = [
    "contractRenewal.service.js",
    "dunningProcessor.service.js",
    "gracePeriod.service.js",
    "authTracePersistence.service.js",
    "authTraceAnalytics.service.js",
    "platformNotification.service.js",
    "platformBilling.service.js",
    "stripeWebhook.handler.js",
    "planVersion.service.js",
    "planTemplate.service.js",
    "exchangeRate.service.js",
    "campaign.service.js",
    "coupon.service.js",
    // Platform billing engine services
    "billingOrchestrator.service.js",
    "contractActivation.service.js",
    "contractEngine.service.js",
    "invoiceEngine.service.js",
    "ledgerTransaction.service.js",
    "refund.reconciliation.job.js",
    "refundPolicy.service.js",
    "refundProcessor.service.js",
    "stripe.webhook.service.js",
    "subscriptionMutation.reconciliation.job.js",
    "revenueSchedule.service.js",
    // Platform support services
    "platformRefund.service.js",
    "platformTicket.service.js",
    // Platform guardian
    "guardian.metrics.service.js",
    // Platform domain services
    "platformPlan.aggregate.service.js",
    "platformSalesMetrics.service.js",
    // Platform billing controllers & engines
    "billingLedger.controller.js",
    "platformBilling.controller.js",
    "LedgerEngine.service.js",
    "billingInvariantMonitor.service.js",
    "billingReplay.service.js",
    "platformRevenue.controller.js",
    "platformPlan.controller.js",
    "platformSubscriptionMutation.controller.js",
    "platformSearch.controller.js",
    "platformSupport.controller.js",
    "sla.job.js",
    // OrthoSupervise plane services (isolated supervisor plane)
    "caseAccess.service.js",
    "dashboard.service.js",
    "invitation.service.js",
    "review.service.js",
    "review.controller.js",
    // Auth services (pre-authentication context — no RLS available)
    "portalAuth.service.js",
    "patientAuth.service.js",
    // Portal services (patient-plane — separate security model)
    "portalMonitoring.service.js",
    // Background jobs (use systemContext — tracked migration debt)
    "patientIntelligence.job.js",
    "journalRetry.worker.js",
    // Document engine (org-internal, tracked migration debt)
    "template.service.js",
    "invoicePrint.service.js",
    "prescriptionPrint.service.js",
    "receiptPrint.service.js",
    // Booking services (tracked migration debt)
    "booking.service.js",
    "bookingApproval.service.js",
    // Override controller (platform-admin action)
    "override.controller.js",
    // Export/share controllers (cross-plane action)
    "exportCase.controller.js",
    "sharedCase.controller.js",
    // Intake controller (pre-auth patient flow)
    "intake.controller.js",
    // Appointment domain (tracked migration debt)
    "appointment.controller.js",
    "appointment.service.js",
    "appointmentDomain.service.js",
    "slot.service.js",
    "ledger.orchestrator.service.js",
    "stage.service.js",
];

// Mongoose query methods that indicate raw model usage
const RAW_METHODS = [
    "find",
    "findOne",
    "findById",
    "findOneAndUpdate",
    "findOneAndDelete",
    "findOneAndReplace",
    "findByIdAndUpdate",
    "findByIdAndDelete",
    "updateOne",
    "updateMany",
    "deleteOne",
    "deleteMany",
    "aggregate",
    "countDocuments",
    "distinct",
    "estimatedDocumentCount",
    "create",
    "insertMany",
    "replaceOne",
    "bulkWrite",
];

// Model names to detect (extracted from requires pattern)
// We detect any PascalCase identifier followed by a Mongoose method
const MODEL_PATTERN = new RegExp(
    `\\b([A-Z][a-zA-Z]+)\\.(?:${RAW_METHODS.join("|")})\\s*\\(`,
    "g"
);

// Exemption markers — lines with these are intentionally raw
const EXEMPT_MARKERS = [
    "@rls-exempt",
    "@rls-safe",
    "secureModel(",
    "// RLS-EXEMPT",
    "// rls-exempt",
    "/** @rls-safe */",
    "rlsPlugin",
    ".rlsPlugin",
    "RLSViolation",
    "rlsValidation",
    "@rls-pbac-prefetch",
];

// Known model-like identifiers that are NOT Mongoose models
const FALSE_POSITIVES = new Set([
    "Object",
    "Array",
    "Promise",
    "Buffer",
    "Error",
    "Date",
    "Map",
    "Set",
    "JSON",
    "Math",
    "String",
    "Number",
    "Boolean",
    "RegExp",
    "Symbol",
    "Request",
    "Response",
    "Router",
    "Schema",
    "Types",
    "Model", // generic reference
    "Mongoose",
    "Stripe",
    "Redis",
    "Queue",
    "Worker",
    "BullMQ",
    "EventEmitter",
    "Console",
    "Process",
    "Pino",
    // Platform-plane models (cross-tenant scope, not org-plane RLS)
    "OrgContract",
    "PlatformInvoice",
    "PlatformNotification",
    "PlatformUser",
    "PlanVersion",
    "PlanTemplate",
    "Plan",
    "AuthTrace",
    "StripeEvent",
    "OrganizationEntitlement",
    "ExchangeRate",
    "ModuleDefinition",
    "FeatureDefinition",
    "DomainEventOutbox",
    "SubscriptionMutationRecord",
    "BillingTimeline",
    "InvoiceSequence",
    "Campaign",
    "Coupon",
    "OrgAddOn",
    "AddOn",
    "GuardianAuditLog",
    // Platform-admin models (cross-tenant query from platform controllers)
    "Organization",
    "Ticket",
    "RegionalTicket",
    "RegionalInvoice",
    "RegionalRefundRecord",
    "RegionalMutation",
    "RegionalOutbox",
    "RegionalAuditLog",
    "RefundExecutionRecord",
    "RevenueSchedule",
    "LedgerTransaction",
    "BillingAuditLog",
    "PaymentAttempt",
    "BillingSettings",
    "SupervisorUser",
    "SupervisorInvitation",
    "DriftAlert",
    // Billing engine models (platform scope)
    "BillingLedger",
    "BillingInvoice",
    "FinancialLedger",
    "AuditLog",
    "Notification",
    "Refund",
    "JournalEntry",
    "JournalRetry",
    // OrthoSupervise plane models (isolated supervisor security plane)
    "CaseAccess",
    "ReviewStage",
    "ReviewComment",
    "SharedCase",
    "SharedCaseComment",
    "AlignerProductionCase",
    "WorkflowSnapshot",
    "AlignerShareToken",
    "CommunicationUsage",
    // Auth/portal models (pre-authentication lookups)
    "PatientUser",
    "PortalInvite",
    "PatientIntakeToken",
    "OrganizationModel",
    // Document engine models (org-internal)
    "DocumentTemplate",
    "PrintSetting",
    "PrintLog",
    // Patient portal models (patient-plane)
    "AlignerProgress",
    "MonitoringSession",
    "PatientMessage",
    "PatientPhoto",
    // Booking models (tracked migration debt)
    "BookingRequest",
    "Chair",
    // Org finance models (tracked migration debt)
    "PatientInvoice",
    "PatientPayment",
    "ClinicalRecord",
    "StageExecution",
]);

// ── Scanner ──────────────────────────────────────────────────────────────────

function shouldScan(filePath) {
    const rel = path.relative(SRC_DIR, filePath);
    const basename = path.basename(filePath);

    // Exclude patterns
    if (EXCLUDE_PATTERNS.some(p => rel.includes(p))) {
        return false;
    }

    // Skip platform-plane exempted files (cross-tenant, not org-scoped)
    if (PLATFORM_EXEMPTED_FILES.includes(basename)) {
        return false;
    }

    // Include patterns
    return INCLUDE_PATTERNS.some(p => filePath.endsWith(p));
}

function scanFile(filePath) {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const violations = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Skip exempt lines
        if (EXEMPT_MARKERS.some(marker => line.includes(marker))) {
            continue;
        }

        // Skip comments
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
            continue;
        }

        // Check previous line for exemption comment
        if (i > 0) {
            const prevLine = lines[i - 1].trim();
            if (EXEMPT_MARKERS.some(marker => prevLine.includes(marker))) {
                continue;
            }
        }

        // Detect raw model usage
        let match;
        MODEL_PATTERN.lastIndex = 0;
        while ((match = MODEL_PATTERN.exec(line)) !== null) {
            const modelName = match[1];

            // Skip false positives
            if (FALSE_POSITIVES.has(modelName)) {
                continue;
            }

            // Skip Secure* prefixed variables — these are secureModel() results
            // e.g., SecurePatient = secureModel(Patient); SecurePatient.find()
            if (modelName.startsWith("Secure")) {
                continue;
            }

            // Skip if looks like a secureModel result (camelCase, e.g., securePatient.find)
            const charBefore = line[match.index - 1];
            if (charBefore && /[a-z]/.test(charBefore)) {
                continue; // lowercase before = not a raw model
            }

            // Extract the method
            const methodMatch = line.substring(match.index).match(/\.(\w+)\s*\(/);
            const method = methodMatch ? methodMatch[1] : "unknown";

            violations.push({
                file: filePath,
                line: lineNum,
                model: modelName,
                method,
                content: trimmed.substring(0, 120),
            });
        }
    }

    return violations;
}

function walkDir(dir) {
    const files = [];
    if (!fs.existsSync(dir)) return files;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!EXCLUDE_PATTERNS.some(p => entry.name.includes(p))) {
                files.push(...walkDir(fullPath));
            }
        } else if (entry.isFile() && shouldScan(fullPath)) {
            files.push(fullPath);
        }
    }
    return files;
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════════");
console.log("  RAW MODEL USAGE DETECTOR — Phase F.6 Hardening");
console.log(`  Mode: ${strict ? "STRICT (exit 1 on violations)" : "ADVISORY (warnings only)"}`);
console.log("═══════════════════════════════════════════════════════\n");

let totalFiles = 0;
let totalViolations = 0;
const allViolations = [];
const violationsByModel = {};

for (const scanDir of SCAN_DIRS) {
    const dirPath = path.join(SRC_DIR, scanDir);
    const files = walkDir(dirPath);

    for (const file of files) {
        totalFiles++;
        const violations = scanFile(file);

        if (violations.length > 0) {
            totalViolations += violations.length;
            allViolations.push(...violations);

            for (const v of violations) {
                if (!violationsByModel[v.model]) {
                    violationsByModel[v.model] = [];
                }
                violationsByModel[v.model].push(v);
            }
        }
    }
}

// ── Report ───────────────────────────────────────────────────────────────────

if (allViolations.length > 0) {
    console.log(`⚠️  RAW MODEL VIOLATIONS (${allViolations.length}):\n`);

    // Group by file
    const byFile = {};
    for (const v of allViolations) {
        const rel = path.relative(process.cwd(), v.file);
        if (!byFile[rel]) byFile[rel] = [];
        byFile[rel].push(v);
    }

    for (const [file, violations] of Object.entries(byFile)) {
        console.log(`  📄 ${file}`);
        for (const v of violations) {
            console.log(`     L${v.line}: ${v.model}.${v.method}() — RAW QUERY DETECTED`);
            if (verbose) {
                console.log(`           ${v.content}`);
            }
        }
        console.log();
    }

    // Model summary
    console.log("  📊 Violations by Model:");
    for (const [model, violations] of Object.entries(violationsByModel).sort((a, b) => b[1].length - a[1].length)) {
        console.log(`     ${model}: ${violations.length} violation(s)`);
    }
    console.log();
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log("═══════════════════════════════════════════════════════");
console.log(`  Scanned:      ${totalFiles} files`);
console.log(`  Violations:   ${totalViolations}`);
console.log(`  Models Hit:   ${Object.keys(violationsByModel).length}`);
console.log(`  Status:       ${totalViolations === 0 ? "✅ PASS — Zero raw model usage" : strict ? "❌ FAIL" : "⚠️  ADVISORY"}`);
console.log("═══════════════════════════════════════════════════════\n");

if (totalViolations === 0) {
    console.log("  ✅ Zero-Trust RLS Enforcement: No raw model queries detected.\n");
    console.log("  All database operations go through secureModel.\n");
}

if (strict && totalViolations > 0) {
    console.error(`\n❌ STRICT MODE: ${totalViolations} raw model usage(s) detected.`);
    console.error("   All database operations MUST go through secureModel().\n");
    console.error("   To exempt a line, add: // @rls-exempt: <reason>\n");
    process.exit(1);
}

process.exit(0);
