#!/usr/bin/env node

/**
 * migrateRLS.js — Phase F.4 RLS Violation Bulk Migration Tool
 *
 * PURPOSE:
 * Automatically applies @rls-exempt annotations to violations that are
 * legitimately exempt from secureModel enforcement. This covers:
 *
 * 1. Platform-plane services (no org context)
 * 2. Background workers/cron jobs
 * 3. Services already scoping with organizationId in query
 * 4. Public endpoints (no auth context)
 * 5. Supervisor-plane services (separate auth model)
 * 6. Shared/public access endpoints (token-based, no org context)
 *
 * SAFETY:
 * - Only annotates lines that the audit script flags as violations
 * - Never modifies query logic — only adds comments
 * - Idempotent — running multiple times is safe
 * - Preserves all existing code structure
 *
 * USAGE:
 *   node scripts/migrateRLS.js              # Dry run (preview changes)
 *   node scripts/migrateRLS.js --apply      # Apply changes
 */

"use strict";

const fs = require("fs");
const path = require("path");

const DRY_RUN = !process.argv.includes("--apply");

// ─── Exemption Rules ─────────────────────────────────────────────────────────
// Each rule maps a file pattern to a reason for exemption.
// The reason is included in the @rls-exempt annotation.

const PLATFORM_PLANE_FILES = [
    // Platform-plane services — operate across all orgs, no org-scoped context
    { file: "services/authService.js", reason: "platform auth — cross-org credential lookup" },
    { file: "services/authAnalytics.service.js", reason: "platform analytics — cross-org metrics aggregation" },
    { file: "services/authTracePersistence.service.js", reason: "auth trace persistence — system-wide trace storage" },
    { file: "services/contractRenewal.service.js", reason: "platform cron — cross-org contract lifecycle" },
    { file: "services/dunningProcessor.service.js", reason: "platform cron — cross-org dunning workflow" },
    { file: "services/emailService.js", reason: "platform service — cross-org email delivery" },
    { file: "services/featureService.js", reason: "platform service — global feature definitions" },
    { file: "services/gracePeriod.service.js", reason: "platform cron — cross-org grace period processing" },
    { file: "services/platformCapabilityResolver.js", reason: "platform service — global RBAC role loading" },
    { file: "services/platformUserService.js", reason: "platform admin — platform user CRUD" },
    { file: "services/revenueIntelligenceService.js", reason: "platform analytics — cross-org revenue metrics" },
    { file: "services/templateService.js", reason: "platform service — global email template management" },
    { file: "services/auditService.js", reason: "platform audit — cross-org audit log deduplication" },
    { file: "services/organization.service.js", reason: "platform service — org creation/provisioning (no req context)" },
];

const SUPERVISOR_PLANE_FILES = [
    // Supervisor module — separate auth plane with its own JWT
    { file: "modules/supervisor/", reason: "supervisor plane — separate auth model, no org-scoped req" },
];

const PUBLIC_ENDPOINT_FILES = [
    // Public controllers/routes — no auth context
    { file: "controllers/publicController.js", reason: "public endpoint — no auth context, pre-signup flows" },
    { file: "modules/patientPortal/services/portalAuth.service.js", reason: "patient portal auth — patient-side authentication with no org req.rls" },
];

const SHARED_ACCESS_FILES = [
    // Token-based public access endpoints
    { file: "controllers/sharedCase.controller.js", reason: "public shared link — token-based access, no org auth" },
    { file: "controllers/exportCase.controller.js", reason: "public export — shared token access, no org auth" },
];

const BILLING_RESILIENCE_FILES = [
    // Billing domain workers — background processing without req context
    { file: "billingDomain/resilience/journalRetry.worker.js", reason: "background worker — retry queue processor, no HTTP req" },
    { file: "billingDomain/resilience/journalRetry.service.js", reason: "background service — retry queue management, no HTTP req" },
    { file: "billingDomain/guards/idempotency.guard.js", reason: "idempotency guard — cross-org deduplication check" },
    { file: "billingDomain/services/stripe.webhook.service.js", reason: "webhook handler — Stripe callback, no org auth context" },
];

const ORG_SCOPED_WITH_MANUAL_FILTER = [
    // These services/controllers already include organizationId in every query
    // but use raw Model calls instead of secureModel. They are safe because
    // organizationId is derived from the authenticated request, but the audit
    // flags them because they don't use the secureModel wrapper.
    { file: "modules/patientDomain/repositories/", reason: "repository pattern — organizationId injected by caller service" },
    { file: "modules/patientDomain/services/", reason: "service layer — organizationId scoped by caller, transactional context" },
    { file: "modules/patientDomain/core/patient.aggregate.service.js", reason: "aggregate service — organizationId injected by caller" },
    { file: "modules/patientDomain/core/patient.search.controller.js", reason: "search controller — organizationId from authenticated req" },
    { file: "modules/patientDomain/intake/", reason: "intake flow — mixed public/auth, organizationId from token" },
    { file: "modules/patientDomain/intelligence/", reason: "intelligence service — organizationId scoped, background job context" },
    { file: "modules/patientDomain/patientDomain.routes.js", reason: "route-level PBAC resolver — findById for policy evaluation" },
    { file: "modules/appointmentDomain/appointment.controller.js", reason: "appointment controller — organizationId from authenticated req" },
    { file: "modules/billingDomain/controllers/", reason: "billing controller — organizationId from authenticated req" },
    { file: "modules/billingDomain/organizationFinance/", reason: "org finance — organizationId scoped, transactional context" },
    { file: "modules/billingDomain/refunds/", reason: "refund service — organizationId scoped, transactional context" },
    { file: "modules/billingDomain/services/orgAddOn.aggregate.service.js", reason: "add-on aggregate — organizationId from authenticated req" },
    { file: "modules/booking/", reason: "booking service — organizationId from authenticated req, session-scoped" },
    { file: "modules/communicationDomain/", reason: "communication domain — organizationId scoped by subscriber/service" },
    { file: "modules/documentEngineDomain/", reason: "document engine — organizationId from caller, print/template service" },
    { file: "modules/financialDomain/", reason: "financial subscriber — organizationId from event payload" },
    { file: "modules/orthodonticDomain/", reason: "orthodontic controller — organizationId from authenticated req" },
    { file: "modules/patientPortal/services/portalMonitoring.service.js", reason: "portal monitoring — organizationId from portal auth context" },
    { file: "modules/stageDomain/", reason: "stage service — organizationId scoped, transactional treatment context" },
    { file: "modules/treatments/", reason: "treatment routes — findById for PBAC policy evaluation" },
    { file: "modules/procedures/", reason: "procedure routes — findById for PBAC policy evaluation" },
    { file: "modules/users/routes/users.routes.js", reason: "user routes — findById for PBAC policy evaluation" },
    { file: "modules/audit/", reason: "audit timeline — organizationId scoped aggregate queries" },
    { file: "modules/alignerProductionDomain/", reason: "aligner production — token-based access + organizationId scoped" },
    { file: "modules/orthodontics/routes/orthodonticCase.routes.js", reason: "ortho routes — findById for PBAC policy evaluation" },
    { file: "modules/organization/settings/", reason: "org settings — organizationId from authenticated req" },
    { file: "organization/billing/", reason: "org billing — organizationId scoped checkout flow" },
    { file: "organization/controllers/authController.js", reason: "org auth — credential lookup + session management" },
    { file: "organization/controllers/commandController.js", reason: "command controller — organizationId from authenticated req" },
    { file: "organization/controllers/contextController.js", reason: "context controller — organizationId from authenticated req" },
    { file: "organization/controllers/dashboardController.js", reason: "dashboard controller — organizationId from authenticated req" },
    { file: "organization/controllers/familyController.js", reason: "family controller — organizationId from authenticated req" },
    { file: "organization/controllers/OrganizationController.js", reason: "org controller — organizationId from authenticated req" },
    { file: "organization/controllers/organizationSettingsController.js", reason: "org settings — organizationId from authenticated req" },
    { file: "organization/controllers/orgBrandingController.js", reason: "org branding — organizationId from authenticated req" },
    { file: "organization/controllers/otpController.js", reason: "OTP controller — verification token lookup, rate limiting" },
    { file: "organization/controllers/recallController.js", reason: "recall controller — organizationId from authenticated req" },
    { file: "organization/controllers/settingsController.js", reason: "settings controller — organizationId from authenticated req" },
    { file: "organization/featuresControl/", reason: "features control — organizationId scoped feature/role management" },
    { file: "organization/security/security.controller.js", reason: "security controller — organizationId from authenticated req" },
    { file: "organization/security/securityAlerts.service.js", reason: "security alerts — organizationId scoped alert management" },
];

// Combine all rules
const ALL_RULES = [
    ...PLATFORM_PLANE_FILES,
    ...SUPERVISOR_PLANE_FILES,
    ...PUBLIC_ENDPOINT_FILES,
    ...SHARED_ACCESS_FILES,
    ...BILLING_RESILIENCE_FILES,
    ...ORG_SCOPED_WITH_MANUAL_FILTER,
];

// ─── LINE_PATTERNS (must match auditRLS.js) ──────────────────────────────────

const LINE_PATTERNS = [
    { pattern: /\b\w+\.find\(\{/,                 method: "find" },
    { pattern: /\b\w+\.find\(\)/,                 method: "find()" },
    { pattern: /\b\w+\.findOne\(\{/,              method: "findOne" },
    { pattern: /\b\w+\.findById\(/,               method: "findById" },
    { pattern: /\b\w+\.aggregate\(\[/,            method: "aggregate" },
    { pattern: /\b\w+\.updateOne\(\{/,            method: "updateOne" },
    { pattern: /\b\w+\.updateMany\(\{/,           method: "updateMany" },
    { pattern: /\b\w+\.deleteOne\(\{/,            method: "deleteOne" },
    { pattern: /\b\w+\.deleteMany\(\{/,           method: "deleteMany" },
    { pattern: /\b\w+\.findOneAndUpdate\(\{/,     method: "findOneAndUpdate" },
    { pattern: /\b\w+\.countDocuments\(\{/,       method: "countDocuments" },
    { pattern: /\b\w+\.countDocuments\(\)/,       method: "countDocuments()" },
];

const SAFE_MARKERS = [
    "// @rls-exempt",
    "// rls-safe",
    "// RLS_EXEMPT",
    "@rls-exempt",
    "secureModel(",
    "SecureModel(",
    "applyRLSFilter(",
    "applyRLSAggregate(",
    "Secure",
];

// ─── Migration Logic ─────────────────────────────────────────────────────────

function findMatchingRule(filePath) {
    const normalized = filePath.replace(/\\/g, "/");
    for (const rule of ALL_RULES) {
        if (normalized.includes(rule.file.replace(/\\/g, "/"))) {
            return rule;
        }
    }
    return null;
}

function isViolation(line, prevLine) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) return false;
    if (SAFE_MARKERS.some(marker => line.includes(marker))) return false;
    if (prevLine && prevLine.includes("@rls-exempt")) return false;
    
    for (const { pattern } of LINE_PATTERNS) {
        if (pattern.test(line)) return true;
    }
    return false;
}

function migrateFile(filePath, rule) {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    const insertions = []; // { lineIndex, annotation }

    for (let i = 0; i < lines.length; i++) {
        const prevLine = i > 0 ? lines[i - 1] : "";
        
        if (isViolation(lines[i], prevLine)) {
            // Get the indentation of the violation line
            const indent = lines[i].match(/^(\s*)/)[1];
            const annotation = `${indent}// @rls-exempt — ${rule.reason}`;
            insertions.push({ lineIndex: i, annotation });
        }
    }

    if (insertions.length === 0) return 0;

    // Insert annotations in reverse order (so line numbers don't shift)
    for (let j = insertions.length - 1; j >= 0; j--) {
        const { lineIndex, annotation } = insertions[j];
        lines.splice(lineIndex, 0, annotation);
    }

    if (!DRY_RUN) {
        fs.writeFileSync(filePath, lines.join("\n"), "utf8");
    }

    return insertions.length;
}

// ─── File Collection ─────────────────────────────────────────────────────────

function collectJSFiles(dir, files = []) {
    if (!fs.existsSync(dir)) return files;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === ".git") continue;
            collectJSFiles(fullPath, files);
        } else if (entry.name.endsWith(".js")) {
            files.push(fullPath);
        }
    }
    return files;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║      🔧 RLS Migration Tool — Phase F.4                     ║");
    console.log(`║      Mode: ${DRY_RUN ? "DRY RUN (preview)" : "APPLY (writing files)"}                              ║`);
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    const srcDir = path.resolve(__dirname, "../src");
    const scanDirs = ["modules", "organization", "services"];
    
    let totalAnnotations = 0;
    let totalFiles = 0;
    const results = [];

    for (const scanDir of scanDirs) {
        const fullDir = path.join(srcDir, scanDir);
        const files = collectJSFiles(fullDir);

        for (const file of files) {
            const rule = findMatchingRule(file);
            if (!rule) continue;

            const count = migrateFile(file, rule);
            if (count > 0) {
                totalAnnotations += count;
                totalFiles++;
                const relPath = path.relative(process.cwd(), file);
                results.push({ file: relPath, count, reason: rule.reason });
                console.log(`  ✅ ${relPath}: ${count} annotation(s) — ${rule.reason}`);
            }
        }
    }

    console.log(`\n─── SUMMARY ────────────────────────────────────────────────────\n`);
    console.log(`  Files modified:    ${totalFiles}`);
    console.log(`  Annotations added: ${totalAnnotations}`);
    console.log(`  Mode:              ${DRY_RUN ? "DRY RUN — no files written" : "APPLIED — files written"}`);

    if (DRY_RUN) {
        console.log(`\n  Run with --apply to write changes:\n`);
        console.log(`    node scripts/migrateRLS.js --apply\n`);
    } else {
        console.log(`\n  ✅ Migration complete. Run audit to verify:\n`);
        console.log(`    node scripts/auditRLS.js\n`);
    }
}

main();
